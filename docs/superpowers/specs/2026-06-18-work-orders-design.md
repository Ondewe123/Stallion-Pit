# Stallion Pit — Work Orders / Job Cards (T1, slice 2) — Design Spec

**Date:** 2026-06-18
**Status:** Approved for planning
**Tier:** T1 (decision core), slice 2. Depends on: T0 foundation, T1.1 templates (done).
**Next slices after this:** richer Snags → DTC Log → then T2.

## 1. Purpose

Turn one-shot "service done" logging into a managed **job-card workflow**: a Work Order opens,
moves through In Progress, and on Close records the work — rolling up labour into the existing
Service Log, creating Parts rows for fitted parts, completing the maintenance schedule items it
addressed, and resolving the snags it fixed. This is where Stallion Pit stops being a list and
becomes a workshop log.

## 2. Goals / non-goals

**Goals**
- A lifecycle entity (Open → In Progress → Closed / Cancelled) per vehicle.
- Link a WO to: multiple maintenance schedule items, multiple snags, and its own parts line items.
- A single, well-defined **Close** action that fans out to the existing tables without
  double-counting spend.
- Keep Dashboard/Analysis spend correct and unchanged (they read service_logs + parts).

**Non-goals (deferred)**
- Photo/file attachments → Documents module (later).
- Structured DTC links → DTC Log slice (free-text `dtc_notes` for now).
- Parts Inventory richness (stock, location, warranty, OEM equivalents) → T2.
- An assignee/user system → `closed_by` is free text (single-owner app).

## 3. Data model — `supabase/migrations/0008_work_orders.sql`

All new tables: `user_id uuid not null default auth.uid()` + owner-scoped RLS (0005/0006 pattern),
`created_at`, cascade FKs. Applied live + RLS-verified (owner sees rows, stranger sees none).

### 3.1 `work_orders`
```
id              uuid pk default gen_random_uuid()
vehicle_id      uuid not null → vehicles(id) on delete cascade
title           text not null
status          text not null default 'Open'      -- Open | In Progress | Closed | Cancelled
opened_at       date not null default current_date
target_date     date
completed_at    date
odometer_km     numeric
category        text
workshop        text
labour_hours    numeric
labour_cost_kes numeric
completion_notes text
test_drive_result text
dtc_notes       text                               -- free text until DTC Log slice
closed_by       text
service_log_id  uuid → service_logs(id) on delete set null   -- set on close
user_id         uuid not null → auth.users(id) default auth.uid()
created_at      timestamptz not null default now()
```

### 3.2 `work_order_parts` (planned vs fitted line items)
```
id             uuid pk
work_order_id  uuid not null → work_orders(id) on delete cascade
part_name      text not null
part_number    text
brand          text
status         text not null default 'Planned'    -- Planned | Fitted
quantity       numeric not null default 1
unit_cost_kes  numeric
total_cost_kes numeric                              -- qty * unit (computed app-side)
parts_id       uuid → parts(id) on delete set null  -- set when written to parts table on close
user_id        uuid not null default auth.uid()
created_at     timestamptz not null default now()
```

### 3.3 `work_order_schedule_items` (join — items this WO services)
```
id                       uuid pk
work_order_id            uuid not null → work_orders(id) on delete cascade
maintenance_schedule_id  uuid not null → maintenance_schedules(id) on delete cascade
user_id                  uuid not null default auth.uid()
created_at               timestamptz not null default now()
```
Index `(work_order_id)`. (Snags link the other way — see 3.4.)

### 3.4 Link-back columns (additive `add column if not exists`)
```
snags.work_order_id        uuid → work_orders(id) on delete set null
parts.work_order_id        uuid → work_orders(id) on delete set null
service_logs.work_order_id uuid → work_orders(id) on delete set null
```
A snag belongs to at most one WO (one-to-many). Schedule items are many-to-many via the join
(a recurring item is serviced by many WOs over its life).

## 4. The Close action — `src/lib/calc/workorders.js` `buildClosePlan(...)`

Pure, unit-tested. `buildClosePlan(wo, woParts, linkedScheduleItems, linkedSnags, currentOdo)`
returns the full set of writes; the page executes them in order:

1. **service_logs row** (the spend record):
   `{ vehicle_id, serviced_at: wo.completed_at, odometer_km: wo.odometer_km ?? currentOdo,
      category: wo.category ?? 'Work Order', description: wo.title, workshop: wo.workshop,
      labour_cost_kes: wo.labour_cost_kes, total_cost_kes: wo.labour_cost_kes (LABOUR ONLY),
      work_order_id: wo.id }`. After insert, set `work_orders.service_log_id`.
   **Labour only** → parts spend comes from the parts table, so no double-count.
2. **parts rows** — one per *fitted* `work_order_parts` line:
   `{ vehicle_id, purchased_at: wo.completed_at, part_name, part_number, brand, quantity,
      unit_cost_kes, total_cost_kes, odometer_km, status: 'Fitted', work_order_id }`.
   After insert, set the line's `parts_id`.
3. **schedule completions** — for each linked `maintenance_schedules` row:
   `last_done_odometer = wo.odometer_km ?? currentOdo`, `last_done_date = wo.completed_at`,
   then recompute `next_due_*` via `computeNextDue` (reuses T1.1 helper / existing Mark-Done logic).
4. **snag resolutions** — for each linked snag: `status = 'Resolved'`, `resolved_at = wo.completed_at`
   (skip if already Resolved/Won't Fix).
5. **work order** → `status = 'Closed'`, `completed_at` (default today if blank), `closed_by`.

Guards: refuse to close an already-Closed/Cancelled WO; `completed_at` defaults to today.
Returns `{ serviceLog, partsRows, scheduleUpdates, snagUpdates, woUpdate }`.

## 5. UI — `src/pages/WorkOrders.jsx`

- **List**: status filter (All / Open / In Progress / Closed), newest first; title, status badge,
  vehicle-scoped (activeVehicle.id), labour+parts cost summary.
- **Form / detail** sections: header (title, opened/target dates, odo, category, workshop) ·
  linked **schedule items** (multi-select from this vehicle's `maintenance_schedules`) · linked
  **snags** (multi-select from this vehicle's Open/In-Progress snags) · **parts** line items
  (add/edit/delete, Planned↔Fitted, qty×unit auto-total — reuse the PartsLog pattern) · labour
  (hours, cost) · completion notes · test-drive result · DTC notes · closed-by.
- **Status actions**: Open → In Progress → **Close**. Close shows a confirm summarising the plan:
  "Records KES <labour> labour to the Service Log · fits <n> parts · completes <m> schedule items
  · resolves <k> snags." Cancel sets status Cancelled.
- Follows existing CRUD conventions (`clean()` `''→null`, data-table, badges, confirm-before-delete).
- **Nav**: desktop sidebar item `🛠 Jobs` with `desktopOnly: true` (mobile bottom bar stays at 8,
  same pattern as Templates).
- **Entry point**: Snags page gains a "Create work order" action that navigates to a new WO with
  that snag pre-linked.

## 6. Spend-correctness invariant (must hold)

For a closed WO: `WO total shown to user = labour_cost_kes + Σ fitted parts total`.
Analysis/Dashboard compute spend as `Σ service_logs.total_cost_kes + Σ parts.total_cost_kes`.
Because the WO writes labour into service_logs and fitted parts into parts (each once), the two
agree and nothing is double-counted. Open/In-Progress/Cancelled WOs contribute nothing to spend.

## 7. Work breakdown

1. `0008_work_orders.sql` — 3 tables + 3 link-back columns + RLS; apply live; verify.
2. `src/lib/calc/workorders.js` `buildClosePlan` + unit tests.
3. `src/pages/WorkOrders.jsx` — list/detail/form + parts line items + close flow.
4. Route (`/work-orders`) + nav (`desktopOnly`) in App.jsx / Layout.jsx.
5. Snags "Create work order" entry point.
6. tests / build / lint; commit.

## 8. Risks & mitigations

- **Double-counting spend** — service_log carries labour only; fitted parts → parts table once.
  Covered by buildClosePlan tests + the §6 invariant.
- **Partial-close failure** (multi-table writes, no DB transaction over PostgREST) — execute in a
  safe order (service_log → link; parts → links; schedule/snag updates; WO status last), so a
  mid-way failure leaves the WO still Open and re-runnable; surface errors and stop. (A future
  RPC could wrap this in a transaction.)
- **Live schema drift** — read maintenance_schedules/snags/parts/service_logs columns first; use
  `add column if not exists`. Verify RLS owner/stranger as in prior slices.
- **Scope creep** — photos/DTC/parts-inventory explicitly deferred.

## 9. Success criteria (definition of done)

- [ ] `0008` applied live; owner sees WOs, stranger sees none.
- [ ] Can create a WO, link schedule items + snags, add parts lines, move Open→In Progress→Close.
- [ ] On close: one labour-only service_logs row, fitted parts appear in the parts list, linked
      schedule items show new last-done/next-due, linked snags become Resolved — all verified.
- [ ] Spend invariant (§6) holds: no double-count; open WOs don't affect spend.
- [ ] `npm test` passes (incl. buildClosePlan tests); build clean; no new lint patterns beyond the
      existing app-wide set-state-in-effect.
