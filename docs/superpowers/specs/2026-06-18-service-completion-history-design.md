# Service Completion History — Design Spec

**Date:** 2026-06-18
**Module area:** Maintenance Schedule (Module 05) ↔ Service Log (Module 03)
**Status:** Approved design — ready for implementation plan

## Problem

Each `maintenance_schedules` row carries a single `last_done_date` / `last_done_odometer`.
The "Mark Done" action overwrites these with **today's** date and the current odometer, so:

1. There is **no record of previous completions** — every Mark Done wipes the last one.
2. You **cannot mark an item done with a chosen (past) date/odometer**, nor fix a wrong last-done.

We want a per-item **completion history** plus the ability to backfill / correct when an item was last done.

## Decision summary (from brainstorming)

- **Unify history with `service_logs`** — marking a schedule item done *creates a `service_log`*, and the
  item's history is the set of `service_logs` linked to it. No separate history table, no double-entry.
- **Mark Done opens a small completion form** (captures real cost / workshop), it is no longer one-click.
- **History is viewed inline** by expanding the schedule item row.
- **Last Done is derived** from the newest linked completion; the manual Last-Done fields leave the Edit form.
- No backfill-matching of the existing 56 imported `service_logs`; history starts populating from now plus
  any manually added past completions.

## Section 1 — Data model

One new nullable link column on `service_logs`; **no new table**.

```sql
-- supabase/migrations/0011_service_completion_link.sql
alter table public.service_logs
  add column maintenance_schedule_id uuid
    references public.maintenance_schedules (id) on delete set null;

create index if not exists service_logs_sched_idx
  on public.service_logs (maintenance_schedule_id);
```

- A schedule item's **history** = `service_logs where maintenance_schedule_id = item.id`,
  ordered `serviced_at desc`, tie-break `odometer_km desc`.
- `on delete set null`: deleting a schedule item keeps its service rows (they remain visible in the
  Service Log page, just unlinked from any item).
- Existing 56 imported `service_logs` stay unlinked. Backfilled completions are **new** rows.
- RLS: `service_logs` already has owner-scoped RLS (migration 0005); the added column needs no policy change.
- Migration is additive and idempotent (`add column` / `create index if not exists`).

## Section 2 — Sync logic (pure, tested)

New pure helper `src/lib/calc/completions.js`:

```
recomputeFromHistory(item, completions) -> patch
```

- `completions` = the schedule item's linked `service_logs` (any order).
- Pick the **newest** completion: max `serviced_at`; tie-break highest `odometer_km`.
- Returns the patch object for the schedule row:
  - `last_done_date`      = newest.serviced_at
  - `last_done_odometer`  = newest.odometer_km   (may be null if that completion had no odometer)
  - `next_due_odometer`   = newest.odometer_km + item.distance_interval_km  (only if **both** present, else null)
  - `next_due_date`       = addMonths(newest.serviced_at, item.time_interval_months)  (only if interval present, else null)
- **No completions** (empty array — e.g. last one deleted) → all four fields returned as `null`.
- Reuses `addMonths` from `src/lib/calc/maintenance.js`.
- Numeric coercion via the existing `num`/`Number` convention; treats `''`/`null`/`undefined` as absent.

Called after **every** completion add / edit / delete to keep `last_done_*` and `next_due_*` correct.
Replaces the inline next-due math currently in `Maintenance.jsx` `handleMarkDone`.

### Unit tests (Vitest, `completions.test.js`)

1. First completion sets last-done + next-due from interval.
2. Newer completion supersedes older.
3. Backfilled **older** completion does **not** supersede a newer one.
4. Editing the latest completion's date/odo updates last-done + next-due.
5. Deleting the latest falls back to the previous completion.
6. Deleting the last remaining completion clears all four fields to null.
7. Distance-only interval (no months) → next_due_date null; time-only → next_due_odometer null.
8. Completion with no odometer → next_due_odometer null but last_done_date still set.

## Section 3 — UI (Maintenance page)

### Shared completion form
One component (`CompletionForm`) reused for Mark Done **and** Add/Edit past completion.
Fields: date, odometer, category, total cost (KES), workshop, description/notes.
Mirrors the `service_logs` shape so the insert is a normal service entry.

- **Category guess** from the item name (e.g. contains "oil" → "Oil Change"), fallback "Minor Service";
  user can change it. Uses the same `CATEGORIES` list as `ServiceLog.jsx`.

### Mark Done
- Click **Mark Done** → opens `CompletionForm` pre-filled: date = today, odometer = current odo,
  category = guessed, cost blank, workshop blank.
- Save → insert `service_log` with `maintenance_schedule_id = item.id` → run `recomputeFromHistory`
  → update the schedule row → refetch. Next-due advances.

### Inline history expand
- Clicking an item row (or a "History ▸" toggle) expands a sub-row listing that item's completions:
  date · odometer · category · cost · workshop, each with **Edit** / **Delete**.
- **"+ Add past completion"** → opens `CompletionForm` with date/odometer **blank** for backfilling.
- Edit / Delete / Add each re-run `recomputeFromHistory` so Last Done & Next Due stay correct.
- Empty state: "No completions logged yet."

### Edit form change
- Remove the manual **Last Done (odometer)** and **Last Done (date)** inputs from the schedule Edit form
  (history is now the source of truth). Intervals, priority, difficulty, thresholds, parts, notes, etc. stay.
- Existing items keep their current `last_done_*` values until their first completion is logged.

## Data flow

```
Mark Done / Add past completion / Edit completion / Delete completion
   └─ write service_logs (insert/update/delete, maintenance_schedule_id set on create)
   └─ read that item's linked service_logs
   └─ recomputeFromHistory(item, completions) -> patch
   └─ update maintenance_schedules row with patch
   └─ refetch list
```

## Out of scope / notes

- No backfill-matching of the 56 existing service_logs (could be a later "link existing service" feature).
- Work-order close flow (`buildClosePlan`) already updates schedule items directly and writes its own
  labour `service_log`; it is **not** changed here. Optionally a later enhancement could set
  `maintenance_schedule_id` on the WO-created service_log so WO completions also appear in item history.
- Spend is not double-counted: a completion is a single real `service_log` row (the only place its cost lives).

## Affected files

- `supabase/migrations/0011_service_completion_link.sql` (new)
- `src/lib/calc/completions.js` (new) + `src/lib/calc/completions.test.js` (new)
- `src/pages/Maintenance.jsx` (Mark Done flow, inline history expand, remove manual last-done fields)
- Possibly a small shared `CompletionForm` (new component or inline in `Maintenance.jsx`)
