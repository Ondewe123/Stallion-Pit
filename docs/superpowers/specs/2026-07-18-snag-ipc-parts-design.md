# Snag IPC Parts Links - Design

**Date:** 2026-07-18
**Status:** Approved direction: multiple IPC parts per snag

## Purpose

Snags should be able to reference the exact IPC parts likely needed to fix the issue. This keeps the defect record separate from purchasing history while preserving a clean path from symptom -> required catalog part -> work order part line.

## Data Model

Add `public.snag_ipc_parts` as a join table:

- `snag_id` references `public.snags(id)` on delete cascade.
- `ipc_part_id` references `public.ipc_parts(id)` on delete cascade.
- `quantity_needed numeric not null default 1`.
- `note text`.
- `user_id uuid not null references auth.users(id) default auth.uid()`.
- Unique `(snag_id, ipc_part_id)`.

Add `public.work_order_parts.ipc_part_id` as a nullable reference to `public.ipc_parts(id)` so a work order can remember which catalog row supplied the part.

The IPC catalog tables remain dedicated reference data. This feature does not copy IPC rows into the existing `parts` purchasing table until the work order is closed and fitted parts are posted by the existing workflow.

## UI Flow

In the Snag form:

- Show an "IPC parts needed" section when the active vehicle has an IPC catalog.
- Search IPC parts by part number, replacement number, name, usage, and remarks.
- Add multiple IPC parts to the snag, each with a quantity.
- Remove selected IPC parts before saving.

In the Snags list:

- Show attached IPC parts under the snag title as compact part-number/name lines.

When clicking `-> Job`:

- Pass the snag's IPC part links to Work Orders.
- When the new work order is saved, create planned `work_order_parts` rows for those IPC parts, including `ipc_part_id`, name, part number, quantity, and brand/source hint.

## Error Handling

If IPC tables are empty for the vehicle, the Snag form simply says no IPC catalog is available. Saving a snag still works normally.

If syncing IPC links fails after saving a snag, show the Supabase error and keep the user in the form.

## Tests

Add pure helper coverage for:

- IPC part search matching catalog fields.
- Turning selected IPC part links into work-order part rows.
- Deduplicating selected IPC parts.

