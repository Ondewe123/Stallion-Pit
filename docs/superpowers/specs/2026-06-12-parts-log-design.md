# Module 04 — Parts Log — Design

**Date:** 2026-06-12
**Status:** Approved (design forks confirmed with user)

## Purpose
Per-vehicle parts purchase / procurement history, scoped to the active vehicle —
following the Fleet/FuelLog/ServiceLog pattern.

## Decisions
- **Cost model:** `quantity × unit_cost_kes → total_cost_kes` (auto-calculated, derived in render,
  stored on save). No `setState`-in-effect.
- **Standalone:** no link to `service_logs` (no `service_log_id`). Fully independent of Module 03;
  the link can be added later.
- `total_cost_kes` nullable (a part may be logged with no cost yet).

## Table: `parts`
| column | type | notes |
|---|---|---|
| id | uuid pk | `gen_random_uuid()` |
| vehicle_id | uuid | → `vehicles(id)` on delete cascade |
| purchased_at | date | required |
| part_name | text | required |
| part_number | text | |
| brand | text | |
| category | text | dropdown (see below) |
| supplier | text | where bought |
| quantity | numeric | default 1 |
| unit_cost_kes | numeric | optional |
| total_cost_kes | numeric | = quantity × unit_cost, computed on save |
| odometer_km | integer | optional |
| status | text | Purchased / Fitted / Returned (default Purchased) |
| notes | text | |
| created_at | timestamptz | `now()` |

**Categories:** Engine · Brakes · Suspension · Filters · Electrical · Body · Tyres · Fluids ·
Consumable · Other.

RLS enabled; authenticated full access.

## UI (`src/pages/PartsLog.jsx`)
Replaces the stub. Mirrors ServiceLog:
- Empty-state when no active vehicle.
- **List:** stat cards (Total Spent · Entries · Total Units · Last Purchase) + table
  (Date, Part, Category, Supplier, Qty, Total, Status) with inline Edit / Delete-confirm.
- **Add / Edit form:** fields above; `quantity × unit_cost` shown as a read-only derived Total.
- Fetch: `parts` where `vehicle_id = activeVehicle.id` ordered by `purchased_at` desc.

## Delivery
Migration `supabase/migrations/0002_parts.sql`. No dependency on 0001 — can run in any order.
User runs it manually (Claude-linked Supabase MCP can't reach this project).
