# Stallion Pit — Fuel per-row economy & robustness — Design Spec

**Date:** 2026-07-01
**Status:** Approved for planning
**Source:** in-app feedback reports (`feedback_reports`) — bundles three open items into one coherent change:
- **#1** (`8f0355a1`, `/fuel`): "add the calculated consumption for each row … how accurate given I may not fill up the tank" → **per-row L/100km column(s)**.
- **#3** (`34863bcc`, `/fuel`): "even after deleting an old entry the km since is still calculating from last entry" → **stale `km_since_last` bug**.
- **#5** (`34070eba`, `/fuel`): "where time between fill-ups is more than 6 months we need to address the math" → **long-gap / anomaly handling**.

**Concurrency note:** several Antigravity sessions can share this working copy. Stage **only this
change's explicit paths** — never `git add -A`. Uses migration **0015**.

## 1. Purpose
Give the Fuel Log accurate per-fill economy, make per-row distance **always correct** after deletes /
edits / out-of-order inserts / restores, and let the user exclude unrepresentative fills (long idle
gaps, bad data) from the economy math.

## 2. Root causes (confirmed in code)
- **#3 stale "Km Since":** `km_since_last` is a **stored** column maintained by the trigger
  `fuel_logs_set_km_since_last` (`supabase/migrations/0000_base.sql:80-99`), which fires **only on the
  inserted/edited row**. Deleting the *previous* fill (or editing a neighbour's odometer, or inserting
  out of order) leaves the next row's stored value stale. Same bug class for any such edit.
- **#1 accuracy:** a single **partial** fill's raw L/100km (litres ÷ km) understates real consumption
  because a partial fill doesn't cover all fuel burned over that distance. Only **full-tank → full-tank**
  ("brim to brim") is exact.
- **#5 long gaps:** an idle segment (car parked months) yields an unrepresentative economy value that
  distorts averages/trend.

## 3. Decisions (from brainstorming)
1. **Per-row display = BOTH values** (user choice): a **Per-fill** raw L/100km on every eligible row
   *and* an accurate **Seg** (brim-to-brim) value on Full-tank rows.
2. **Long gaps = MANUAL anomaly toggle** (user choice): a per-fill switch `exclude_from_economy`; no
   auto-flagging. (Also the clean way to neutralise the corrupt 11-Jan-2022 row.)
3. **Architecture = derive per-row numbers on read** (approved) in the pure, tested `consumption.js`,
   computed fresh from the sorted logs every render — so deletes/edits/reorders are always correct
   (kills the #3 bug class). The legacy `km_since_last` column + trigger **stay in the DB** (harmless;
   `fuelForm`/`backup` already handle them); the UI simply stops reading them. Optional drop later.

*Alternative rejected:* keep the stored column and add AFTER DELETE/UPDATE recompute triggers (+ more
triggers for the consumption columns). More DB complexity, still order-fragile, harder to test.

## 4. Data model — `supabase/migrations/0015_fuel_exclude_from_economy.sql`
Additive; RLS unchanged (owner-scoped via 0005).
```
alter table public.fuel_logs
  add column if not exists exclude_from_economy boolean not null default false;
```
`exclude_from_economy` is a normal editable column — confirm `cleanFuelLog` **passes it through** (it
must NOT be added to the stripped-columns list in `src/lib/fuelForm.js`; only DB-managed columns are
stripped). No CHECK/constraint changes.

## 5. Pure logic — `src/lib/calc/consumption.js` (+ `consumption.test.js`)
All new/changed functions are pure and operate on logs **sorted ascending by odometer** (callers sort
a copy; the UI list stays descending).

**Semantics of `exclude_from_economy` = "chain break".** A flagged fill is a boundary: it is dropped
from every economy series and **no window or brim-to-brim segment may span across it**. Distance across
a break is never counted (that is the whole point for idle gaps and bad data). The fill's own economy
shows "excluded"; the first fill *after* a break has no per-fill/segment value (fresh start) — this is
intentional and will be documented in the UI copy.

- `segments(logsAsc)` → splits the ascending logs into runs of consecutive **non-excluded** fills,
  breaking (and omitting the flagged fill) at each `exclude_from_economy`. The primitive all economy
  math builds on.
- `withDerived(logsAsc)` → returns each fill annotated with:
  - `kmSince` = factual delta from the immediately-preceding physical fill (odo diff), or null for the
    first. **Always factual** (honest odometer column), independent of exclusion.
  - `daysSince` = calendar days from the previous fill's `logged_at`, or null. Timezone-safe date diff.
  - `perFillL100` = `volume / kmSince * 100` — null if this fill or the previous fill is excluded (spans
    a break), if it's the first in its run, or if `kmSince <= 0` / `volume <= 0`. `~`-marked in UI when
    `is_partial`.
  - `segmentL100` = **only on Full-tank rows** (`is_partial = false`): (Σ volumes of fills after the
    previous full-tank fill up to & incl. this one) ÷ (this odo − previous full-tank odo) × 100.
    null when there is no prior full tank **in the same run**, or the run boundary/break sits between,
    or distance/volume ≤ 0. (The previous full tank's own volume is NOT included — it belonged to the
    earlier segment.)
  - `excluded` = the raw flag (for dimming + chip).
- **Make `correctedConsumption` break-aware:** over the chosen window of most-recent fills, split into
  runs at breaks and return `(Σ run volumes) / (Σ within-run distances) × 100`. Never counts gap
  distance; equals today's behaviour for a single continuous run. Used by the Fuel summary badge and
  the Dashboard headline.
- **Make `rolling` break-aware:** skip any K-window that contains or straddles an excluded fill (no
  point emitted), so gaps never appear as spikes. Used by the Fuel trend chart + Analysis charts.
- `fillRangeKm` unchanged.

**Tests (add to existing suite):** delete-safety (per-row values recompute correctly from the set with
a middle row removed); partial-fill segment accumulation across several partials into the next full
tank; brim-to-brim excludes the prior full tank's volume; a break splits runs so no window/segment
spans it and gap distance is excluded; `daysSince` incl. a >180-day gap; first-in-run has null
per-fill; keep all existing `correctedConsumption`/`rolling`/`fillRangeKm` cases green.

## 6. UI — `src/pages/FuelLog.jsx`
- **List table** (already horizontal-scrolls on 360px; new columns are narrow mono):
  - **Km Since** → derived (`withDerived.kmSince`), fixing #3. When `daysSince` exceeds a threshold
    (one constant, `GAP_HINT_DAYS = 180`) it shows the days inline in amber as a hint, e.g.
    `+420 · 214d ⚠`, nudging the user to consider flagging it.
  - **Per-fill** (new): `perFillL100`, `~` suffix when the fill is partial, `—` when null.
  - **Seg** (new): `segmentL100` on full-tank rows, `—` otherwise.
  - **Excluded rows** render dimmed with a small "excluded" chip; their Per-fill/Seg show `—`.
- **Add/Edit form:** new toggle **"Exclude from economy (gap / bad data)"** → `exclude_from_economy`
  (default off). Same toggle-group styling as Fill Type.
- **"Current Odometer" card** sub-line uses derived `kmSince` (not the stored column).
- **Summary badge (`ConsumptionBadge`) & trend (`ConsumptionTrend`)** already call the shared helpers,
  now break-aware → long gaps / excluded fills drop out automatically. Badge windows unchanged
  (5/10/20/All).

## 7. UI — `Analysis.jsx` / `Dashboard.jsx`
Small changes only — they already call `rolling` / `correctedConsumption`. Ensure the fuel rows they
pass carry `exclude_from_economy` (they `select('*')`, so it arrives automatically) so excluded
segments leave the Analysis consumption/cost-per-km charts and the Dashboard headline economy. No
structural changes.

## 8. Work breakdown
1. `0015_fuel_exclude_from_economy.sql` — add column; apply live via MCP.
2. `consumption.js`: `segments`, `withDerived`, break-aware `correctedConsumption`/`rolling` + tests.
3. `fuelForm.js`: confirm `exclude_from_economy` is passed through (test).
4. `FuelLog.jsx`: derived Km Since + gap hint, Per-fill & Seg columns, excluded styling, form toggle,
   odometer card sub.
5. Verify `Analysis.jsx` / `Dashboard.jsx` still correct with break-aware helpers.
6. `npx vitest run --no-file-parallelism` (OOM-safe per project note), build, lint; commit **own files
   only**.

## 9. Risks & mitigations
- **Concurrency:** never `git add -A`; stage explicit paths (migration, `consumption.js`[+test],
  `fuelForm.js`, `FuelLog.jsx`, this spec, and `Analysis.jsx`/`Dashboard.jsx` only if changed). Use
  migration **0015**.
- **Behaviour change from break-awareness:** a recent break can shrink the badge/trend sample — correct
  over convenient; documented in card sub-copy.
- **First-fill-after-break shows `—`:** intentional; note it in UI copy so it doesn't read as a bug.
- **Legacy column left in place:** `km_since_last` stays but is unread; `backup.js` comment/order and
  `fuelForm` stripping remain valid, so restore is unaffected.
- **Mobile width:** two new columns are narrow; gap hint rides inside Km Since (no separate days column).

## 10. Success criteria
- [ ] `0015` applied live; existing fuel rows unaffected; `exclude_from_economy` persists via add/edit.
- [ ] Deleting a mid-list fill recomputes the neighbour's Km Since immediately (no stale value) (#3).
- [ ] Per-fill column on every eligible row; Seg (brim-to-brim) on full-tank rows; partial `~` marking
      correct (#1).
- [ ] Flagging a fill removes its segment from the badge, trend, Analysis charts and Dashboard
      headline; gap distance not counted (#5).
- [ ] Tests pass (`--no-file-parallelism`), build clean, no new lint patterns beyond the known app-wide
      set-state-in-effect debt; other sessions' files untouched.
