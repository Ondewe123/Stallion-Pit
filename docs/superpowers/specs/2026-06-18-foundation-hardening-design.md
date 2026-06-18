# Stallion Pit — Foundation Hardening (T0) — Design Spec

**Date:** 2026-06-18
**Status:** Approved for planning
**Scope tier:** T0 (foundation/safety) — prerequisite for all feature work (T1–T3)

## 1. Purpose & context

Stallion Pit works and all 9 original modules are live, but an audit surfaced foundational
engineering risks that must be fixed before building the larger "maintenance decision system"
(maintenance templates, work orders, DTC log, etc.). This slice fixes the foundation **only** —
no new user-facing features.

The risks being addressed:

1. The two foundational tables (`vehicles`, `fuel_logs`) have **no migration files** — a fresh
   Supabase project cannot be rebuilt from the repo.
2. Row-Level Security is uniformly permissive (`USING(true)`) — any authenticated user can
   read/write all rows — and the anon key is committed to git.
3. `scripts/import-acar.mjs` contains **hardcoded login credentials**.
4. There are **no database backups** (free-tier project, no automated PITR).
5. There are **no automated tests** of any kind, including the maintenance-due and fuel-economy
   math that the whole app depends on.

## 2. Goals / non-goals

**Goals**
- Repo can fully rebuild the database schema from migrations alone.
- Access is locked to the owning account, defense-in-depth, even if the anon key leaks.
- No secrets in source.
- A one-command local backup that also serves as CSV export.
- The two most fragile calculation areas (maintenance due, fuel economy) are covered by tests
  and de-duplicated into shared pure helpers.

**Non-goals (explicitly deferred)**
- CSV **import** (UI or script) — export only for now.
- Supabase Pro / automated cloud backups.
- Any T1–T3 feature module (templates, work orders, DTCs, documents, forecasting, etc.).
- Multi-user/sharing features — single owner remains the model; we just enforce it properly.

## 3. Design

### 3.1 Schema migrations for `vehicles` and `fuel_logs`

Create `supabase/migrations/0000_base.sql` capturing the **live** definitions of the two
unmigrated tables. The definitions will be read from the live project (not guessed) via the
Supabase MCP before authoring:

- `list_tables` / `information_schema.columns` for exact columns, types, defaults, nullability.
- `pg_get_functiondef` + `information_schema.triggers` for the `km_since_last` trigger/function.
- Generated-column definition for `fuel_logs.derived_price_per_litre`.
- Index definitions (`pg_indexes`).

The migration must include, at minimum (to be confirmed against live):

- `public.vehicles` — all columns used by the app (id, name, make, model, sub_model, year,
  engine_code, engine_description, transmission, drive_type, body_type, fuel_type, color,
  license_plate, vin, purchase_date, purchase_price_kes, odometer_at_purchase,
  fuel_tank_capacity, oil_capacity_litres, oil_spec, notes, is_active, created_at).
- `public.fuel_logs` — all columns (id, vehicle_id FK→vehicles ON DELETE CASCADE, logged_at,
  odometer_km, volume_litres, total_cost_kes, price_per_litre_kes, is_partial, has_additive,
  additive_name, driving_mode, fuel_grade, station, notes, created_at), the
  `derived_price_per_litre` generated column, the `km_since_last` trigger + its function, and
  indexes.
- `enable row level security` on both tables (policies themselves are defined in 0005, §3.2).

Because the tables already exist live, the migration is written to be **idempotent / safe to
re-run** on a fresh project (use `create table if not exists`, `create or replace function`,
`drop trigger if exists` before `create trigger`). It is NOT applied to the current live project
(which already has these objects); it exists so a *new* project can be bootstrapped. This is
documented in a header comment in the file.

**Acceptance:** Running every migration (0000 → 0005) in order against a brand-new empty Supabase
project produces a schema functionally identical to the current live project. Verified by listing
tables/columns/triggers after a dry run on a Supabase branch (or documented manual check if
branching is unavailable).

### 3.2 Owner-scoped RLS

`supabase/migrations/0005_owner_rls.sql`:

1. Add to all six data tables (`vehicles`, `fuel_logs`, `service_logs`, `parts`, `snags`,
   `maintenance_schedules`):
   ```sql
   alter table public.<t>
     add column if not exists user_id uuid references auth.users(id) default auth.uid();
   ```
   The `default auth.uid()` makes inserts auto-stamp the current user — **no application/page
   code changes are required** for ownership to work.

2. Backfill existing rows to the owner account:
   ```sql
   update public.<t> set user_id = '<OWNER_UUID>' where user_id is null;
   ```
   `<OWNER_UUID>` is resolved at apply time from `auth.users` for `chris.odeny@gmail.com`
   (the migration includes a comment showing how to fetch it; the value is substituted before
   running, not hardcoded for other environments).

3. Once backfilled, enforce not-null:
   ```sql
   alter table public.<t> alter column user_id set not null;
   ```

4. Replace the four permissive policies on each table with owner-scoped equivalents:
   ```sql
   drop policy if exists "<old policy name>" on public.<t>;  -- for each of the 4
   create policy "<t> owner select" on public.<t>
     for select to authenticated using (auth.uid() = user_id);
   create policy "<t> owner insert" on public.<t>
     for insert to authenticated with check (auth.uid() = user_id);
   create policy "<t> owner update" on public.<t>
     for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
   create policy "<t> owner delete" on public.<t>
     for delete to authenticated using (auth.uid() = user_id);
   ```

**Edge cases / risks**
- The `vehicles` query in `VehicleContext` (`is_active = true`) and all page queries continue to
  work unchanged because the user's own rows still match — RLS only *hides other users'* rows.
- The aCar importer (`--apply`) inserts via the anon/authenticated session, so `default auth.uid()`
  stamps those rows correctly too. The `seed_golden.sql` path runs as service-role in the SQL
  editor, which **bypasses RLS** and does **not** populate `user_id` via the auth default — so
  `seed_golden.sql` and `reset_empty.sql` must be updated to set `user_id` explicitly (insert the
  owner UUID) or the seed will violate the new not-null. This is part of the work.

**Acceptance:** A second test account created in the same project sees zero rows on every page;
the owner account sees all their data unchanged. Inserts from the app continue to succeed without
code changes.

### 3.3 Remove hardcoded credentials

`scripts/import-acar.mjs`: the `--apply` path currently hardcodes `chris.odeny@gmail.com` /
`Test123`. Change to read, in priority order: CLI args → `IMPORT_EMAIL` / `IMPORT_PASSWORD` env
vars → fail with a clear error if absent. Mirrors the existing pattern in `set-password.mjs`.
No default password in source.

**Acceptance:** `grep` for the password string returns nothing in the repo; running
`--apply` without env/args prints a clear "set IMPORT_EMAIL/IMPORT_PASSWORD" error.

### 3.4 Scripted backup / export

New `scripts/backup.mjs`, wired as `npm run backup`:

- Reads `VITE_SUPABASE_URL` from `.env` and `SUPABASE_SERVICE_ROLE_KEY` from `.env.local`
  (service-role so it bypasses RLS and dumps everything).
- For each of the 6 data tables, fetches all rows (paginated) and writes, into a new
  timestamped folder `backups/<YYYY-MM-DD-HHMM>/`:
  - `<table>.csv` — header row + data (proper CSV escaping).
  - `<table>.sql` — `insert` statements re-importable into a clean schema.
- Prints a summary (rows per table, output path).
- `backups/` is added to `.gitignore`.
- Timestamp is generated in the Node script at runtime (this is a normal script, not a workflow,
  so `Date` is available).

**Acceptance:** `npm run backup` produces a folder with 6 CSVs + 6 SQL files containing the
current row counts; re-importing the SQL into an empty schema reproduces the data.

### 3.5 Tests (Vitest) + calc-helper extraction

1. Add dev dependency **Vitest**; add `"test": "vitest run"` and `"test:watch": "vitest"` to
   `package.json`. Config via `vite.config.js` `test` block (jsdom not required — pure functions).

2. Extract calculation logic out of the page components into pure, dependency-free modules:
   - `src/lib/calc/consumption.js`
     - `correctedConsumption(logs, windowSize)` → L/100km over a window (from FuelLog).
     - `rolling(fuelAsc, K, valueFn)` → rolling-window point series (from Analysis).
     - helpers for cost/km and price/litre series.
   - `src/lib/calc/maintenance.js`
     - `daysUntil(dateStr)`, `addMonths(dateStr, months)`,
       `evaluate(item, currentOdo, { dueSoonKm, dueSoonDays })` → `{ remKm, remDays, status }`,
       `computeNextDue(item)` → auto next-due odometer/date.

3. Refactor `FuelLog.jsx`, `Analysis.jsx`, `Dashboard.jsx`, `Maintenance.jsx` to import these
   helpers instead of holding private copies. **Behaviour must be identical** — this is a
   move-and-import refactor, not a logic change. This also removes the current duplication of the
   consumption formula across FuelLog/Dashboard/Analysis and the maintenance `evaluate` across
   Dashboard/Maintenance.

4. Tests (`src/lib/calc/*.test.js`) covering edge cases:
   - **consumption:** normal multi-fill; window larger than data; zero distance (odo unchanged);
     negative distance (data error) → null; zero volume → null; single log → null; first-fill
     exclusion in lifetime figures.
   - **maintenance:** overdue by km only; overdue by days only; due-soon at exactly 1000 km and
     exactly 30 days (boundary); ok; null next-due fields; `addMonths` across year boundary and
     with fractional months (rounding); `computeNextDue` with distance only / time only / both /
     neither.

**Acceptance:** `npm test` passes; the four refactored pages render and behave exactly as before
(spot-checked in the running app); calc files have no React/Supabase imports.

## 4. Work breakdown (for planning)

1. Read live schema via Supabase MCP → write `0000_base.sql`.
2. Write `0005_owner_rls.sql`; update `seed_golden.sql` + `reset_empty.sql` for `user_id`.
3. De-hardcode credentials in `import-acar.mjs`.
4. Add `scripts/backup.mjs` + `npm run backup` + gitignore `backups/`.
5. Add Vitest; extract `src/lib/calc/{consumption,maintenance}.js`; refactor 4 pages to import.
6. Write tests; ensure `npm test` green and app behaviour unchanged.

## 5. Risks & mitigations

- **Migration drift vs live:** mitigated by reading the live schema before authoring, and by a
  dry-run rebuild check on a fresh project/branch.
- **RLS lockout / seed breakage:** the seed scripts run as service-role and must set `user_id`
  explicitly; covered in §3.2. Test with a second account to confirm isolation.
- **Refactor regressions:** calc extraction is behaviour-preserving; tests + manual spot-check of
  the 4 pages guard against drift.
- **Owner UUID handling:** never hardcode in committed SQL meant for other environments; resolve
  at apply time and document the lookup.

## 6. Success criteria (definition of done)

- [ ] Fresh Supabase project rebuildable from migrations 0000→0005.
- [ ] Second account sees no data; owner sees all; app inserts work with no page code changes.
- [ ] No credentials/passwords in source (grep-clean).
- [ ] `npm run backup` writes timestamped SQL+CSV for all 6 tables; `backups/` gitignored.
- [ ] `npm test` passes; consumption + maintenance logic extracted to pure helpers and used by the
      4 pages; behaviour unchanged.
