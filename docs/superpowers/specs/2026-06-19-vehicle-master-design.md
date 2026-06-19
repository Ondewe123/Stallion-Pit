# Stallion Pit — Vehicle Master Expansion (T2, slice 2) — Design Spec

**Date:** 2026-06-19
**Status:** Approved for planning
**Tier:** T2 (supporting data), slice 2. Depends on: T0, T1, T2.1 (done).
**Concurrency:** another session has uncommitted WIP in `Dashboard.jsx`/`consumption.js`. This slice
uses migration **0013** and edits only `Fleet.jsx` + new files; renewal alerts live on the **Fleet**
page (NOT Dashboard) to avoid collision. Stage own files only (no `git add -A`).

## 1. Purpose
Deepen the vehicle record with the remaining spec fields and add document-renewal tracking
(insurance / inspection / licence) with due-soon and overdue alerts, so nothing lapses unnoticed.

## 2. Goals / non-goals
**Goals**
- Add missing spec fields: gearbox code, tyre size, battery spec, coolant spec, OBD notes.
- Add renewal dates: insurance, inspection, licence (+ a free-text insurance/policy note).
- Surface per-vehicle and fleet-wide renewal alerts on the Fleet page.
- Pure, tested renewal-status logic.

**Non-goals**
- Ownership-document file uploads → Documents module (Storage).
- Recurring auto-roll of renewal dates on renew → keep manual for now (user updates the date).
- Touching Dashboard (other session's WIP).

## 3. Data model — `supabase/migrations/0013_vehicle_master.sql`
Additive `add column if not exists` on `public.vehicles` (nullable; existing rows/UI unaffected).
RLS unchanged (owner-scoped via 0005). VehicleContext already `select('*')`, so new columns load.
```
gearbox_code     text
tyre_size        text     -- e.g. 195/65 R15
battery_spec     text     -- e.g. 60Ah 540A, group size
coolant_spec     text     -- e.g. G12++, MB 325.0
obd_notes        text     -- protocol / adapter / port location notes
insurance_expiry  date
inspection_expiry date
licence_expiry    date
insurance_note   text     -- provider / policy number
```

## 4. Pure logic — `src/lib/calc/renewals.js` (+ `renewals.test.js`)
Reuses `daysUntil` from `calc/maintenance`.
- `RENEWAL_FIELDS` = [{key:'insurance_expiry',label:'Insurance'}, {key:'inspection_expiry',
  label:'Inspection'}, {key:'licence_expiry',label:'Licence'}].
- `renewalStatus(dateStr, today, soonDays=30)` → `'overdue'` (<0 days), `'soon'` (0..soonDays),
  `'ok'` (>soonDays), `null` (no date). `today` is an injectable 'YYYY-MM-DD'.
- `vehicleRenewals(vehicle, today, soonDays)` → for each RENEWAL_FIELD with a date:
  `{key,label,date,days,status}`.
- `worstRenewalStatus(vehicle, today, soonDays)` → 'overdue' > 'soon' > 'ok' > null across the three.
- Tests: overdue/soon/ok/null; boundary at exactly today (overdue? no → due in 0 days = 'soon') and at
  exactly soonDays; vehicleRenewals filters empty dates; worst picks the most urgent.

## 5. UI — `src/pages/Fleet.jsx`
- **Form (`VehicleForm`)**: new EMPTY_FORM fields; two new sections:
  - "Specs (tyres, battery, fluids)": tyre_size, battery_spec, coolant_spec, gearbox_code, obd_notes.
  - "Renewals": insurance_expiry, inspection_expiry, licence_expiry (date inputs) + insurance_note.
- **Detail (`VehicleDetail`)**: add the new specs to the spec grid; add a **Renewals** block listing
  each renewal with its date and a status badge (Overdue red / Due soon amber / OK green).
- **List**: each `fleet-card` shows a small renewal badge when `worstRenewalStatus` is soon/overdue
  ("⏰ Renewal overdue" / "⏰ Renewal due"). A fleet-wide banner above the grid: "N vehicle(s) with
  renewals due" (count where worst ∈ {soon, overdue}); hidden when zero.
- Conventions: existing `clean()` (`''→null`) unchanged; dates need `?.split('T')[0]` coercion when
  editing (Fleet currently passes `initial={selected}` raw — date inputs want `YYYY-MM-DD`; coerce the
  new date fields in the edit path).

## 6. Work breakdown
1. `0013_vehicle_master.sql` — enrich vehicles; apply live.
2. `src/lib/calc/renewals.js` + tests.
3. Enrich `Fleet.jsx` (form sections, detail, card badge, fleet banner; coerce date fields on edit).
4. build / lint / tests; commit own files only.

## 7. Risks & mitigations
- **Concurrent session** — stage explicit paths only; migration 0013; don't touch Dashboard/consumption.
- **Date inputs on edit** — coerce `insurance_expiry`/`inspection_expiry`/`licence_expiry` with
  `?.split('T')[0]` so `<input type=date>` shows them.
- **No DB CHECKs** — statuses/specs are free text/dates; nothing to constrain.

## 8. Success criteria
- [ ] `0013` applied live; existing vehicles unaffected; new fields persist & show in detail.
- [ ] Renewal badges/banner reflect overdue/soon correctly (verified against a near/expired date).
- [ ] `npm test` passes (incl. renewals tests); build clean; no new lint patterns; other session's
      files untouched.
