# Stallion Pit — DTC Log (T1, slice 4 — final) — Design Spec

**Date:** 2026-06-18
**Status:** Approved for planning
**Tier:** T1 (decision core), final slice. Depends on: T0, T1.1–T1.3 (done).
**After this:** T1 complete → move to T2 (supporting data).

## 1. Purpose
A dedicated diagnostic-trouble-code log, separate from snags: record each scan-tool reading, its
type (pending/stored/permanent), freeze-frame, whether it was cleared, and whether it returned —
linkable to the snag it explains and the work order that fixed it. Built for the Polo's intermittent
EPC/airbag/MAP codes.

## 2. Goals / non-goals
**Goals**
- Per-vehicle DTC entries with OBD-accurate lifecycle (type + clear + return).
- Link a DTC to an existing snag and/or work order.
- Surface active vs cleared vs returned codes; quick Mark-cleared / Mark-returned actions.

**Non-goals**
- A built-in DTC code dictionary / auto-descriptions (user types description).
- Live OBD/Bluetooth scanner integration.
- Photos/freeze-frame screenshots → Documents module (freeze_frame is text here).

## 3. Data model — `supabase/migrations/0010_dtc_codes.sql`
New table, owner-scoped RLS (0005 pattern: `user_id default auth.uid()`, 4 policies). Applied live + verified.
```
id                uuid pk default gen_random_uuid()
vehicle_id        uuid not null → vehicles(id) on delete cascade
logged_at         date not null default current_date
code              text not null            -- e.g. P0171, B1000
description       text
module            text                     -- Engine/ECM, Transmission/TCM, ABS, Airbag/SRS, Body/BCM, …
scanner           text                     -- tool used
code_state        text default 'Stored'    -- Pending | Stored | Permanent
freeze_frame      text                     -- RPM/load/temp etc. (text)
odometer_km       numeric
cleared           boolean default false
cleared_at        date
returned          boolean default false
returned_at       date
returned_odometer numeric
snag_id           uuid → snags(id) on delete set null
work_order_id     uuid → work_orders(id) on delete set null
notes             text
user_id           uuid not null → auth.users(id) default auth.uid()
created_at        timestamptz not null default now()
```
Index `(vehicle_id, logged_at desc)`.

## 4. UI — `src/pages/Dtc.jsx` (route `/dtc`)
- **List**: filter Active / Cleared / Returned / All; columns: code (mono), description, module,
  state badge (Pending/Stored/Permanent), lifecycle status badge, odometer, actions.
  - Derived status: `returned` → "Returned" (red) ; else `cleared` → "Cleared" (green) ; else "Active" (amber).
  - **↻** marker on returned codes.
- **Form**: logged_at, code, description, module (select), scanner, code_state (select), odometer,
  freeze_frame (textarea), notes, and **link selects** for snag (this vehicle's snags) and work order
  (this vehicle's WOs).
- **Actions**: **Mark cleared** (sets `cleared`, `cleared_at = today`); **Mark returned** (sets
  `returned`, `returned_at = today`, `returned_odometer = current odo`). Edit / delete (confirm).
- **Stats**: Active (not cleared, not returned-unresolved) / Returned / Total.
- Follows existing CRUD conventions (`clean()` `''→null`, data-table, badges, confirm-delete).
- **Nav**: desktop sidebar `🩺 DTCs` (`desktopOnly`; mobile bottom bar stays at 8).

## 5. Work breakdown
1. `0010_dtc_codes.sql` — table + RLS; apply live; verify owner/stranger.
2. `src/pages/Dtc.jsx` — list/form + clear/return actions + snag/WO link selects.
3. Route (`/dtc`) + nav (`desktopOnly`) in App.jsx / Layout.jsx.
4. build / lint / existing tests; commit.

## 6. Risks & mitigations
- **Link selects scoped to vehicle** — fetch snags & work_orders for activeVehicle for the dropdowns.
- **No new pure logic** — CRUD + simple state writes; no new unit tests (51 stay green).
- **Live RLS** — verify owner sees rows / stranger sees none, as in prior slices.

## 7. Success criteria
- [ ] `0010` applied live; owner sees DTCs, stranger sees none.
- [ ] Create a DTC, link a snag + work order, Mark cleared, Mark returned — all persist; status badge
      reflects lifecycle; filters work.
- [ ] `npm run build` clean; tests pass; no new lint patterns beyond app-wide set-state-in-effect.
- [ ] **T1 tier complete.**
