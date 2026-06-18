# Stallion Pit — Richer Snags / Defect Control (T1, slice 3) — Design Spec

**Date:** 2026-06-18
**Status:** Approved for planning
**Tier:** T1 (decision core), slice 3. Depends on: T0, T1.1, T1.2 (done).
**Next slice after this:** DTC Log → then T2.

## 1. Purpose
Upgrade snags from a simple issue list into an aircraft-style **defect / rectification log**: capture
the symptom, the conditions under which it appears, its safety and drivability impact, the suspected
system, the root cause, corrective action, verification, and whether it has recurred. Work-order
linkage already exists (T1.2 `snags.work_order_id`).

## 2. Goals / non-goals
**Goals**
- Add the full defect-control field set to snags.
- Keep the add/edit form usable via a collapsible "Diagnosis & rectification" section.
- Surface safety impact and recurrence prominently in the list; add a safety-critical stat.

**Non-goals**
- New tables (enrichment only). Snags stay owner-scoped (RLS from 0005, unchanged).
- Auto recurrence detection / repeat-failure analytics → T3 reports (`is_recurring` is a manual flag here).
- DTC linkage → DTC Log slice.

## 3. Data model — `supabase/migrations/0009_snags_defect_control.sql`
Additive `alter table ... add column if not exists` on `public.snags` (all nullable / defaulted, so
existing rows and the current UI keep working):
```
symptom             text
conditions          text[]        -- multi-select; e.g. {Cold start, Under load, In rain}
safety_impact       text          -- None | Cosmetic | Affects safety | Unsafe to drive
drivability_impact  text          -- None | Minor | Noticeable | Severe
suspected_system    text          -- Engine | Cooling | Fuel | Transmission | Brakes | Suspension |
                                   --   Steering | Electrical | HVAC | Body | Tyres | Exhaust | Other
root_cause          text
corrective_action   text
verification_method text
is_recurring        boolean default false
```
No RLS change (snags already has owner policies + `user_id`). No new indexes needed.

## 4. UI — `src/pages/Snags.jsx`
### 4.1 Form
- Basic section unchanged (reported date, odo, title, severity, status, description).
- New **collapsible "Diagnosis & rectification"** section (collapsed by default for new snags; expanded
  when editing a snag that already has any of these fields set):
  - `symptom` (text), `suspected_system` (select), `safety_impact` (select), `drivability_impact` (select).
  - `conditions` — toggle chips (multi-select) stored as `text[]`: Cold start / When hot / At idle /
    Under load / Accelerating / Braking / Cornering / Over bumps / In rain / Highway / Always.
  - `root_cause`, `corrective_action`, `verification_method` (textareas).
  - `is_recurring` (checkbox).
- `clean()` maps `'' → null`; `conditions` saved as an array (empty → null).

### 4.2 List / display
- Row gains a **safety-impact badge** (Unsafe to drive → red, Affects safety → amber, Cosmetic/None →
  muted) and a **↻** marker when `is_recurring`.
- Detail/expanded view shows conditions chips, suspected system, root cause, corrective action,
  verification.
- New stat tile: **"Safety-critical open"** = open/in-progress snags with `safety_impact` in
  {Affects safety, Unsafe to drive} (alongside existing Open / Needs-attention / Resolved counts).

## 5. Work breakdown
1. `0009_snags_defect_control.sql` — enrich snags; apply live.
2. Enrich `Snags.jsx`: form section + conditions chips + list badges + safety stat.
3. lint / build / existing tests; verify; commit.

## 6. Risks & mitigations
- **`text[]` handling** — supabase-js round-trips Postgres arrays as JS arrays; save `[]`→null,
  render `(conditions||[])`. Verify a save/read round-trip in the running app.
- **Form length** — mitigated by the collapsible section.
- **No new logic** — this slice is fields + UI; no pure-helper tests added (existing 51 stay green).

## 7. Success criteria
- [ ] `0009` applied live; existing snags unaffected; new fields editable and persist (incl. conditions array).
- [ ] List shows safety badge + recurring marker; safety-critical stat correct.
- [ ] `npm run build` clean; existing tests pass; no new lint patterns beyond app-wide set-state-in-effect.
