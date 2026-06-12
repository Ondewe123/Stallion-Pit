# Module 05 — Maintenance Schedule — Design

**Date:** 2026-06-12
**Status:** Approved (design forks confirmed with user)

## Purpose
Per-vehicle service-interval tracker. Computes **next-due** and flags **Overdue / Due-soon / OK**
against the vehicle's current odometer (max across fuel + service logs) and today's date.

## Decisions
- **Model:** interval + **Mark Done** (auto-advances). Enter "every X km / Y months" + last done;
  app computes next-due. Mark Done sets last-done = now/current-odo and rolls next-due forward.
- **Seed:** import the 7 aCar reminders for the Mercedes (intervals + next-due; names from subtypes).
- **Due-soon thresholds:** within 1,000 km OR 30 days (and not already overdue).

## Table: `maintenance_schedules`
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| vehicle_id | uuid | → vehicles(id) cascade |
| item | text | required, e.g. "Engine Oil & Filter" |
| distance_interval_km | numeric | every X km |
| time_interval_months | numeric | every Y months |
| last_done_odometer | numeric | |
| last_done_date | date | |
| next_due_odometer | numeric | computed, overridable |
| next_due_date | date | |
| notes | text | |
| is_active | boolean | default true |
| created_at | timestamptz | |

RLS enabled; authenticated full access.

## UI (`src/pages/Maintenance.jsx`)
- Empty-state when no active vehicle.
- **List:** stat cards (Overdue · Due soon · Total) + cards/table per item showing interval,
  next-due (odometer &/or date), and **remaining** ("in 1,679 km" / "OVERDUE by 300 km"),
  status badge, and a **Mark Done** action. Add / edit / delete.
- Current odometer = max(odometer) across `fuel_logs` + `service_logs` for the vehicle.
- On save, if next-due is blank but last-done + interval are set, next-due is auto-filled.

## aCar reminder import
Parsed in `scripts/import-acar.mjs` from `<reminder>` elements: item = subtype name,
distance_interval_km = distance-interval, next_due_odometer = distance-due,
time_interval_months = time-interval×(unit→months), next_due_date = time-due,
last_done_odometer = next-due − interval. Added to `db/seed_golden.sql` and `--apply`.
