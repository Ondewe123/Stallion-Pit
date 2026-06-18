# Stallion Pit — Maintenance Templates (T1, slice 1) — Design Spec

**Date:** 2026-06-18
**Status:** Approved for planning
**Tier:** T1 (decision core). First slice. Depends on: T0 foundation (done).
**Next slices after this:** Work Orders / Job Cards → richer Snags → DTC Log.

## 1. Purpose & context

Stallion Pit's existing `maintenance_schedules` is a flat per-vehicle list of items with intervals
and last/next due. To become a maintenance *decision* system it needs:

1. **Reusable templates** — define a standard schedule for a vehicle type (e.g. "W202 C180")
   once and apply it to any matching vehicle, now or in future.
2. **Richer per-item data** — priority, DIY difficulty, parts/consumables needed, torque specs,
   and per-item warning thresholds — so the app can tell you not just *that* something is due but
   *how urgent, how hard, and what you need*.

This slice delivers the template library, the "apply to vehicle" action, and the enriched
per-vehicle schedule fields. It explicitly does NOT build Work Orders (next slice) or link to a
Parts Inventory (T2 — parts are free text here).

## 2. Goals / non-goals

**Goals**
- A catalog of reusable maintenance templates, each a list of richly-specified items.
- Apply a template to a vehicle → generates per-vehicle schedule rows, non-destructively.
- Enrich `maintenance_schedules` with priority / difficulty / parts / torque / per-item thresholds.
- Two built-in, fully-editable seed templates (W202 C180, Polo 9N 1.4) with researched defaults.
- Urgency- and priority-aware ordering and warning thresholds.

**Non-goals (deferred)**
- Work Orders / Job Cards (next T1 slice).
- Structured parts/consumables links (T2 Parts Inventory) — free text for now.
- Cross-user template sharing / a public template marketplace.
- Auto-matching a template to a vehicle by VIN/engine — the user picks which template to apply.

## 3. Data model — `supabase/migrations/0006_maintenance_templates.sql`

All new tables follow the T0 pattern: `user_id uuid not null default auth.uid()` + owner-scoped
RLS (4 policies, `auth.uid() = user_id`), `created_at timestamptz default now()`, cascade FKs.

### 3.1 `maintenance_templates` (the catalog)
```
id          uuid pk default gen_random_uuid()
name        text not null                       -- e.g. "Mercedes-Benz W202 C180 (M111)"
make        text
model       text
sub_model   text
engine_code text
notes       text
is_builtin  boolean not null default false      -- seeded templates; still editable/deletable
user_id     uuid not null references auth.users(id) default auth.uid()
created_at  timestamptz not null default now()
```

### 3.2 `template_items` (items within a template)
```
id                   uuid pk default gen_random_uuid()
template_id          uuid not null references public.maintenance_templates(id) on delete cascade
item                 text not null
category             text
distance_interval_km numeric
time_interval_months numeric
priority             integer  default 3          -- 1 highest … 4 lowest
diy_difficulty       text                          -- Easy | Moderate | Hard | Pro
parts_needed         text                          -- free text (→ structured links in T2)
consumables_needed   text
torque_spec          text
warn_threshold_km    numeric                       -- per-item "due soon" overrides; null → global default
warn_threshold_days  numeric
spec_source          text                          -- e.g. "researched — verify vs manual"
sort_order           integer  default 0
user_id              uuid not null references auth.users(id) default auth.uid()
created_at           timestamptz not null default now()
```
Index: `(template_id, sort_order)`.

### 3.3 `maintenance_schedules` — enrich existing table (additive `alter table add column if not exists`)
```
+ category            text
+ priority            integer default 3
+ diy_difficulty      text
+ parts_needed        text
+ consumables_needed  text
+ torque_spec         text
+ warn_threshold_km   numeric
+ warn_threshold_days numeric
+ template_item_id    uuid references public.template_items(id) on delete set null  -- provenance
```
No existing column changes; all new columns nullable / defaulted, so current rows and the app keep
working untouched.

## 4. Apply-template-to-vehicle (non-destructive)

A `applyTemplate(template, vehicleId, existingSchedules)` pure helper (in
`src/lib/calc/templates.js`, unit-tested) computes the rows to insert:

- For each `template_item`, match against the vehicle's existing `maintenance_schedules` by
  **case-insensitive trimmed `item` name**.
- If no match → produce a new schedule row carrying the item's name, category, intervals,
  priority, difficulty, parts/consumables, torque, warning thresholds, and `template_item_id`.
  `last_done_*` / `next_due_*` are left null (the user fills them or uses "Mark Done").
- If a match exists → **skip** it (never overwrite the user's real `last_done`/`next_due` history).
- Returns `{ toInsert: [...rows], skipped: [...names] }` so the UI can preview
  "will add N, skip M" before the user confirms.

The page-level action then bulk-inserts `toInsert` (each gets `user_id` via the column default and
`vehicle_id` set) and refreshes.

**Worked example:** the Mercedes already has 7 imported aCar items (Oil Filter, Engine Oil, Spark
Plugs, Air Filter, Tappets, Timing Chain, Timing Tensioner). Applying the W202 template adds the
missing items (e.g. Brake Fluid, Coolant, Gearbox Oil, Serpentine Belt, Tyre Rotation, Battery, AC)
and skips the 7 that already exist.

## 5. Calculation changes — `src/lib/calc/maintenance.js`

- `evaluate(item, currentOdo, opts)` already accepts `dueSoonKm`/`dueSoonDays`. The Maintenance
  page now passes the **item's own** `warn_threshold_km`/`warn_threshold_days` when present,
  falling back to the global `DUE_SOON_KM` (1000) / `DUE_SOON_DAYS` (30).
- New helper `byPriorityThenUrgency(a, b)` to sort evaluated items: overdue first, then due-soon,
  then by priority (1→4), then by smallest remaining km/days. So safety-critical overdue items
  surface at the top.
- New unit tests: per-item threshold overrides global; sort ordering; `applyTemplate` add/skip
  logic, name-matching case-insensitivity, and provenance fields.

## 6. UI

### 6.1 New `/templates` page (+ nav item, bottom-tab on mobile)
- List templates (name, make/model, item count, builtin badge).
- Drill into a template → list its items with full CRUD (add/edit/delete item), mirroring the
  existing per-vehicle CRUD pattern and `clean()` helper (`'' → null`).
- Create / edit / delete templates.
- **"Apply to current vehicle"** button → preview dialog (add N / skip M) → confirm → inserts.

### 6.2 Maintenance page additions
- Show the new fields per item: priority badge, DIY-difficulty chip, parts-needed, torque (in the
  detail/expanded view).
- Sort by `byPriorityThenUrgency`.
- An "Apply a template" entry point (links to /templates with the current vehicle preselected, or
  an inline picker).

Follows existing styling/badge conventions (see Snags severity/status badges).

## 7. Seed — `supabase/migrations/0007_seed_templates.sql` (built-in, amendable)

Two `is_builtin = true` templates, each item `spec_source = 'researched — verify vs manual'`:

- **Mercedes-Benz W202 C180 (M111 1.8)** — engine oil & filter, air filter, fuel filter, spark
  plugs, brake fluid (~2 yr), coolant, manual gearbox oil, **timing chain inspection** (chain, not
  belt — note), poly-V/serpentine belt, tyre rotation, battery check, AC service.
- **VW Polo 9N 1.4 (BBY/AUD)** — engine oil & filter, air filter, fuel filter, spark plugs, brake
  fluid (~2 yr), coolant, gearbox oil, **timing belt + water pump** (interval critical — note),
  poly-V belt + tensioner, tyre rotation, battery check, AC service.

Interval/spec values are researched manufacturer-typical figures, filled in during implementation
and clearly marked for the user to verify. Inserted with explicit `user_id` (owner UUID
`3563089a-faec-4143-8b6e-34fd7ca2d5ec`) since the seed runs in the SQL editor (no `auth.uid()`),
matching the seed_golden.sql pattern from T0. Re-runnable (delete builtin templates by name first).

## 8. Work breakdown (for planning)

1. `0006_maintenance_templates.sql` — two new tables + enrich maintenance_schedules; RLS. Apply live.
2. `0007_seed_templates.sql` — research + seed W202 and Polo templates. Apply live.
3. `src/lib/calc/templates.js` (applyTemplate) + maintenance.js sort/threshold changes + tests.
4. `src/pages/Templates.jsx` — template/item CRUD + apply-with-preview.
5. Wire route + nav (App.jsx, Layout.jsx).
6. Enrich Maintenance.jsx display + sort + apply entry point.
7. Regenerate Supabase types if used; run tests/lint/build; verify; commit.

## 9. Risks & mitigations

- **Live schema drift:** read current maintenance_schedules columns before the ALTER; use
  `add column if not exists`. Apply on live + verify owner/stranger RLS as in T0.
- **Apply clobbering real data:** mitigated by the additive/skip-by-name rule + preview; covered by
  unit tests on the pure `applyTemplate`.
- **Wrong researched intervals:** every seeded value carries `spec_source` "verify vs manual"; all
  fields fully editable. The app never auto-acts on a schedule without the user.
- **Seed under RLS:** explicit `user_id` in the seed (SQL editor has no auth.uid()).
- **Scope creep into Work Orders/Parts:** parts are free text; Work Orders are a separate slice.

## 10. Success criteria (definition of done)

- [ ] `0006` + `0007` applied live; owner sees templates, a stranger sees none (RLS verified).
- [ ] Two built-in templates exist, fully editable and deletable.
- [ ] Applying a template to the Mercedes adds only the missing items and skips the existing 7
      (verified), with a correct "add N / skip M" preview.
- [ ] Maintenance items show priority/difficulty/parts/torque and sort by priority+urgency;
      per-item warning thresholds drive due-soon.
- [ ] `npm test` passes (incl. new applyTemplate + threshold/sort tests); `npm run build` clean;
      no new lint errors.
