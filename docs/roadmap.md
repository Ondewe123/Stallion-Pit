# Stallion Pit — Roadmap

**Vehicle Intelligence Platform** — personal multi-vehicle tracker.
Stack: React 19 · Vite 8 · React Router 7 · Supabase (auth + Postgres) · Recharts · date-fns.

> This roadmap was reconstructed from the `"coming in Module 0X"` text in the stub pages.
> Module numbers and scope blurbs are from the code; data models and build order are the
> agreed working plan (confirm schemas against Supabase before each build).

## Progress

| #  | Module                | Status |
|----|-----------------------|--------|
| 01 | Scaffold · Auth · Layout · Vehicle switching | ✅ Done |
| 02 | Fleet — vehicle CRUD + spec sheet            | ✅ Done |
| 06 | Fuel Log — fill-ups + corrected L/100km      | ✅ Done |
| 03 | Service Log                                  | 🔶 Built — run `supabase/migrations/0001_service_logs.sql` |
| 04 | Parts Log                                    | ⬜ Stub |
| 05 | Maintenance Schedule                         | ⬜ Stub |
| 07 | Dashboard                                    | ⬜ Stub |
| 08 | Analysis                                     | ⬜ Stub |
| 09 | Snags                                        | ⬜ Stub |

3 of 9 modules built. Fuel was built ahead of 03–05, so numbering is not strictly sequential.

## Remaining modules

| #  | Module | Scope (from stub) | Table | Depends on |
|----|--------|-------------------|-------|------------|
| 03 | Service Log          | Maintenance & repair history          | `service_logs`         | — |
| 04 | Parts Log            | Parts purchased & procurement history | `parts`                | optional → 03 |
| 09 | Snags                | Issues, faults & repair planning      | `snags`                | — |
| 05 | Maintenance Schedule | Service intervals & next due dates    | `maintenance_schedules`| odometer (Fuel) + Service (03) |
| 07 | Dashboard            | Fleet overview & alerts               | read-only              | 03 · 05 · 09 |
| 08 | Analysis             | Deep analytics & trends               | read-only (Recharts)   | Fuel · 03 · 04 |

## Recommended build order (dependency-aware)

1. **03 — Service Log** — foundational service history.
2. **04 — Parts Log** — independent; can link to a service event.
3. **09 — Snags** — small, self-contained; quick win.
4. **05 — Maintenance Schedule** — "next due" engine; needs odometer + service history.
5. **07 — Dashboard** — surfaces alerts (05), snags (09), spend (03/04).
6. **08 — Analysis** — richest once fuel + service + parts data exist.

Each module reuses the proven pattern in Fleet/FuelLog: per-vehicle Supabase table scoped by
`activeVehicle.id`, list/add/edit/delete views, `clean()` form helper.

## Cross-cutting

- **DB schema is not in the repo.** Tables live only in Supabase. Capture each new table as a SQL
  migration file under `supabase/migrations/` so the schema is reproducible.
- **RLS** — confirm Row-Level Security is enabled on every table (the client uses the public anon key).
- **`.env` is tracked in git** (committed in the scaffold). Anon/publishable key is safe for client
  use *if* RLS is on; still, untracking it is good practice.
- **FuelLog refinement** — the auto-calc volume `setState`-in-effect ([src/pages/FuelLog.jsx](../src/pages/FuelLog.jsx))
  should become a derived render value (eslint `react-hooks/set-state-in-effect`). Non-blocking.
- **Supabase project ref:** `smellxhfpjyjweledvco`. The Claude-linked Supabase MCP account does **not**
  have access to this project, so live introspection isn't available — schemas are derived from code.
