# Module 03 — Service Log — Design

**Date:** 2026-06-11
**Status:** Approved (design forks confirmed with user)

## Purpose
Per-vehicle service / repair history. Each **job** (oil change, brakes, etc.) is one row,
scoped to the active vehicle — following the Fleet/FuelLog Supabase pattern.

## Decisions
- **Granularity:** one row per job (a visit doing 2 jobs = 2 rows, same date/odometer).
- **Cost model:** `total_cost_kes` required; `labour_cost_kes` / `parts_cost_kes` optional. No auto-calc.
- **Odometer captured** per row → feeds Module 05 (maintenance "next due").

## Table: `service_logs`
| column | type | notes |
|---|---|---|
| id | uuid pk | `gen_random_uuid()` |
| vehicle_id | uuid | → `vehicles(id)` on delete cascade |
| serviced_at | date | required |
| odometer_km | integer | optional |
| category | text | required; dropdown (see below) |
| description | text | what was done |
| workshop | text | where |
| total_cost_kes | numeric | **required** |
| labour_cost_kes | numeric | optional |
| parts_cost_kes | numeric | optional |
| next_service_note | text | e.g. "next oil @ 295,000 km or Dec" |
| notes | text | |
| created_at | timestamptz | `now()` |

**Categories:** Oil Change · Minor Service · Major Service · Brakes · Tyres · Suspension ·
Electrical · Repair · Inspection · Other.

RLS enabled; authenticated users have full access (single-owner app). Confirm this matches
`vehicles` / `fuel_logs`.

## UI (`src/pages/ServiceLog.jsx`)
Replaces the stub. Mirrors FuelLog:
- Empty-state when no active vehicle.
- **List:** stat cards (Last Service · Total Spent · Entries · Current Odometer) + table
  (Date, Odometer, Category, Workshop, Total) with inline Edit / Delete-confirm.
- **Add / Edit form:** all fields above; reuses `clean()` (`'' → null`) and existing styles.
- Fetch: `service_logs` where `vehicle_id = activeVehicle.id` ordered by `serviced_at` desc.

## Out of scope (later modules)
- Linking parts to a service → Module 04.
- Computing next-due from intervals → Module 05.

## Delivery note
Migration shipped as `supabase/migrations/0001_service_logs.sql`. The Claude-linked Supabase
MCP account can't reach project `smellxhfpjyjweledvco`, so the user runs the SQL manually in the
Supabase SQL editor; the page stays inert until the table exists.
