# Module 09 — Snags — Design

**Date:** 2026-06-12
**Status:** Approved (design forks confirmed with user)

## Purpose
Per-vehicle issue / fault tracker, scoped to the active vehicle — following the established pattern.

## Decisions
- **Statuses:** Open / In Progress / Resolved / Won't Fix (default Open).
- **Severity:** Low / Medium / High / Critical (default Medium).
- **Resolution:** standalone `resolution_note` + `resolved_at` date (no `service_log_id` link).

## Table: `snags`
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| vehicle_id | uuid | → vehicles(id) cascade |
| reported_at | date | required |
| title | text | required |
| description | text | |
| severity | text | Low/Medium/High/Critical, default Medium |
| status | text | Open/In Progress/Resolved/Won't Fix, default Open |
| odometer_km | integer | optional |
| resolved_at | date | set when fixed |
| resolution_note | text | how it was resolved |
| notes | text | |
| created_at | timestamptz | |

RLS enabled; authenticated full access.

## UI (`src/pages/Snags.jsx`)
Replaces the stub. Mirrors ServiceLog/PartsLog:
- Empty-state when no active vehicle.
- **List:** stat cards (Open · Needs Attention [High/Critical & open] · Resolved · Total) + table
  (Reported, Title, Severity badge, Status badge, Odometer) with a **Mark Fixed** quick action
  (sets status=Resolved, resolved_at=today) plus inline Edit / Delete-confirm.
- **Add / Edit form:** all fields above.
- Fetch: `snags` where `vehicle_id = activeVehicle.id` ordered by `reported_at` desc.

## Delivery
Migration `supabase/migrations/0003_snags.sql`, applied directly to the live project
`mwakgpzcqoalxtvqucki` via Supabase MCP.
