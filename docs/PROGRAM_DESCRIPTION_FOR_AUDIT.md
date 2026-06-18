# Stallion Pit — Program Description for Technical Audit

> **Purpose of this document:** A complete, accurate technical description of the *Stallion Pit* application, written so that an external AI (or human) auditor has every detail needed to assess architecture, security, data integrity, and code quality without access to the running system. All facts below were read directly from the current source tree (branch `main`), not from memory.

---

## 1. What the program is

**Stallion Pit** is a single-owner, personal **multi-vehicle "Vehicle Intelligence Platform"** — a web app for tracking everything about a small private car fleet: fuel consumption, service history, parts purchases, maintenance schedules, fault/issue ("snag") tracking, plus a dashboard and analytics layer.

- **Audience / model:** Single owner, personal use. There is intentionally **no multi-tenant separation** — one logged-in account owns all data. (This is an explicit design assumption, not an oversight, but see §9 Security.)
- **Currency:** Kenyan Shillings (KES) throughout.
- **Real data:** Seeded from a real aCar (Android car-tracking app) export — 2 vehicles (1996 Mercedes C180, 2004 VW Polo), ~369 fuel logs, ~56 services, ~6 years of history (2020 → 2026).
- **Status:** All 9 planned modules built and live. Git tree clean.

---

## 2. Technology stack

| Layer | Technology | Version (from package.json) |
|---|---|---|
| UI framework | React | ^19.2.6 |
| Build tool / dev server | Vite | ^8.0.12 |
| Routing | react-router-dom | ^7.16.0 |
| Charts | Recharts | ^3.8.1 |
| Dates | date-fns | ^4.4.0 |
| Backend (BaaS) | Supabase (`@supabase/supabase-js`) | ^2.106.2 |
| Lint | ESLint (flat config) + react-hooks + react-refresh | ^10.3.0 |
| Language | **JavaScript (JSX)** — no TypeScript | — |

- **Backend:** Supabase project, org "Stallion Pit", ref `mwakgpzcqoalxtvqucki`, region eu-west-1 (Postgres + Auth). No custom backend server — the React SPA talks to Supabase directly.
- **Module type:** ES modules (`"type": "module"`).
- **No test framework is configured.** Scripts are only `dev`, `build`, `lint`, `preview`. **There are zero automated tests.**

---

## 3. Application architecture

### 3.1 Entry & component tree
```
index.html (#root)
└── main.jsx  (React.StrictMode)
    └── App.jsx
        BrowserRouter
        └── AuthProvider                  (session state)
            └── AppRoutes
                ├── /login → Login        (redirects to / if already authed)
                └── PrivateRoute          (guards everything below)
                    └── VehicleProvider   (active-vehicle state)
                        └── Layout        (sidebar + mobile nav shell)
                            └── <Outlet/> → page component
```

### 3.2 Routes (from `App.jsx`)
| Path | Component | Access |
|---|---|---|
| `/login` | Login | Public (redirects authed users to `/`) |
| `/` | Dashboard | Private |
| `/fleet` | Fleet | Private |
| `/fuel` | FuelLog | Private |
| `/service` | ServiceLog | Private |
| `/parts` | PartsLog | Private |
| `/maintenance` | Maintenance | Private |
| `/snags` | Snags | Private |
| `/analysis` | Analysis | Private |
| `*` | Navigate → `/` | Catch-all |

`PrivateRoute` logic:
```jsx
const { user, loading } = useAuth()
if (loading) return <Loading/>
return user ? children : <Navigate to="/login" replace />
```

### 3.3 Auth flow (`AuthContext.jsx`, `lib/supabase.js`, `Login.jsx`)
- Supabase client created from `import.meta.env.VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`. **No explicit auth options** → SDK defaults (session persisted in browser `localStorage`, auto-refresh on).
- On mount: `supabase.auth.getSession()` restores session; `supabase.auth.onAuthStateChange()` subscription keeps `user` in sync (and across tabs); unsubscribes on unmount.
- `signIn(email, password)` → `supabase.auth.signInWithPassword(...)`, returns `{ error }`.
- `signOut()` → `supabase.auth.signOut()`, then navigate to `/login`.
- Context value: `{ user, loading, signIn, signOut }`.
- **Email/password only.** No signup UI (user provisioned out-of-band via `set-password.mjs`), no password reset, no MFA, no OAuth.

### 3.4 Active-vehicle state (`VehicleContext.jsx`)
- Fetches `vehicles` where `is_active = true`, ordered by `created_at` asc.
- Restores last selection from `localStorage['stallion_active_vehicle']`; falls back to first vehicle.
- `selectVehicle(v)` updates state + persists the id to localStorage.
- Context value: `{ vehicles, activeVehicle, selectVehicle, refreshVehicles, loading }`.
- **All feature pages scope their queries by `activeVehicle.id`** (the established pattern).

### 3.5 Layout (`Layout.jsx`, `VehicleSelector.jsx`)
- Desktop: collapsible left sidebar (logo, vehicle selector, nav, user email + sign-out).
- Mobile: slim top bar + bottom tab navigation (phone-first design; uses `100dvh`).
- 8 nav items (Dashboard, Fleet, Fuel, Service, Parts, Maintenance/Schedule, Snags, Analysis).

### 3.6 Shared coding patterns
- **`clean(form)` helper** on every write page: maps `'' → null` before insert/update.
- **DB-computed read-only columns** used instead of client math where possible (`fuel_logs.derived_price_per_litre`, `fuel_logs.km_since_last`).
- Each module = one page component doing list / add / edit / delete against one Supabase table, scoped by `activeVehicle.id`.

---

## 4. Data model (Supabase Postgres)

> ⚠️ **Critical schema-management finding:** Only **4 of 6 tables have migration files.** The two foundational tables — **`vehicles` and `fuel_logs` — have NO migration files** and exist only in the live Supabase project. Their schema is reconstructable only from the seed/import scripts. This is the single biggest version-control / reproducibility risk in the project.

### 4.1 Migration files present (`supabase/migrations/`)
- `0001_service_logs.sql`
- `0002_parts.sql`
- `0003_snags.sql`
- `0004_maintenance_schedules.sql`

### 4.2 `vehicles` ⚠️ (no migration — inferred from import script & Fleet page)
Columns used by the app: `id` (uuid PK), `name`, `make`, `model`, `sub_model`, `year`, `engine_code`, `engine_description`, `transmission`, `drive_type`, `body_type`, `fuel_type`, `color`, `license_plate`, `vin`, `purchase_date`, `purchase_price_kes`, `odometer_at_purchase`, `fuel_tank_capacity`, `oil_capacity_litres`, `oil_spec`, `notes`, `is_active` (bool, default true), `created_at`.
- Referenced by all other tables via `vehicle_id … ON DELETE CASCADE`.
- Soft-delete via `is_active = false` (Fleet "archive").

### 4.3 `fuel_logs` ⚠️ (no migration — inferred)
Columns: `id` (uuid PK), `vehicle_id` (FK→vehicles, cascade), `logged_at` (date), `odometer_km` (int), `volume_litres` (numeric), `total_cost_kes` (numeric), `price_per_litre_kes` (numeric), `is_partial` (bool), `has_additive` (bool), `additive_name`, `driving_mode`, `fuel_grade`, `station`, `notes`, `created_at`.
- **Two DB-computed read-only columns** (per project docs and page usage):
  - `derived_price_per_litre` — generated column.
  - `km_since_last` — populated via trigger / window-function (lag over vehicle_id ordered by odometer). *(Note: the `--apply` import path computes `km_since_last` via SQL window function; auditor should confirm whether a live trigger maintains it on normal app inserts, since the app does not write this column.)*

### 4.4 `service_logs` (0001)
```
id uuid PK default gen_random_uuid()
vehicle_id uuid NOT NULL → vehicles(id) ON DELETE CASCADE
serviced_at date NOT NULL
odometer_km integer
category text NOT NULL
description text
workshop text
total_cost_kes numeric NOT NULL
labour_cost_kes numeric
parts_cost_kes numeric
next_service_note text
notes text
created_at timestamptz NOT NULL default now()
```
Indexes: `(vehicle_id)`, `(vehicle_id, serviced_at DESC)`. RLS enabled.

### 4.5 `parts` (0002)
```
id uuid PK · vehicle_id uuid NOT NULL → vehicles cascade
purchased_at date NOT NULL · part_name text NOT NULL
part_number · brand · category · supplier text
quantity numeric NOT NULL default 1
unit_cost_kes numeric · total_cost_kes numeric  (= quantity*unit, computed app-side)
odometer_km integer · status text NOT NULL default 'Purchased'
notes text · created_at timestamptz NOT NULL default now()
```
Status values: `Purchased | Fitted | Returned`. Indexes `(vehicle_id)`, `(vehicle_id, purchased_at DESC)`. RLS enabled.

### 4.6 `snags` (0003)
```
id uuid PK · vehicle_id uuid NOT NULL → vehicles cascade
reported_at date NOT NULL · title text NOT NULL · description text
severity text NOT NULL default 'Medium'   -- Low|Medium|High|Critical
status   text NOT NULL default 'Open'      -- Open|In Progress|Resolved|Won't Fix
odometer_km integer · resolved_at date · resolution_note text · notes text
created_at timestamptz NOT NULL default now()
```
Indexes `(vehicle_id)`, `(vehicle_id, reported_at DESC)`. RLS enabled. *(Severity/status are enforced in the UI; auditor should confirm whether DB CHECK constraints exist — the migration uses defaults, and the report did not surface CHECK clauses.)*

### 4.7 `maintenance_schedules` (0004)
```
id uuid PK · vehicle_id uuid NOT NULL → vehicles cascade
item text NOT NULL
distance_interval_km numeric · time_interval_months numeric
last_done_odometer numeric · last_done_date date
next_due_odometer numeric · next_due_date date
notes text · is_active boolean NOT NULL default true
created_at timestamptz NOT NULL default now()
```
Indexes `(vehicle_id)`, `(vehicle_id, next_due_odometer)`. RLS enabled. No triggers/generated columns — next-due is computed app-side on save and on "Mark Done".

### 4.8 Row-Level Security — **uniform across all tables**
Every table has 4 policies, all of the form:
```sql
FOR SELECT  TO authenticated USING (true)
FOR INSERT  TO authenticated WITH CHECK (true)
FOR UPDATE  TO authenticated USING (true) WITH CHECK (true)
FOR DELETE  TO authenticated USING (true)
```
→ **Any authenticated user can read/write all rows.** There is **no per-user (`auth.uid()`) row filtering.** Acceptable only under the strict single-owner assumption; a serious flaw if the Supabase project ever gains a second user. **Auditor: verify RLS is actually enabled on `vehicles` and `fuel_logs`, since those tables are unmigrated.**

---

## 5. Feature modules (what each page does + key calculations)

### 5.1 Fleet (`vehicles`)
Full CRUD on vehicles. Create/edit form covers identity, drivetrain, engine, capacities, purchase info. Delete is **soft** (`is_active = false`). No per-vehicle calculations.

### 5.2 Fuel Log (`fuel_logs`)
- CRUD; list ordered by `odometer_km DESC`.
- **Volume auto-calc:** `volume_litres = total_cost_kes / price_per_litre_kes` (`.toFixed(3)`), shown read-only.
- **Corrected L/100km** (handles partial fills by aggregating over a window rather than per-fill):
  ```
  consumption = (Σ volume_litres over window / (maxOdo − minOdo over window)) × 100
  ```
  A `ConsumptionBadge` toggles windows of last 5 / 10 / 20 / All fills.
- Displays DB columns `km_since_last` ("+N km" / "First entry") and `derived_price_per_litre`.
- Quick-stat cards: last fill cost, last price/litre, current odometer, total entries.

> **Known refinement (pre-existing):** volume auto-calc uses `setState`-in-effect, which trips an eslint react-hooks warning; intended to become a derived value.

### 5.3 Service Log (`service_logs`)
CRUD; ordered by `serviced_at DESC, odometer_km DESC`. Category enum (Oil Change, Minor/Major Service, Brakes, Tyres, Suspension, Electrical, Repair, Inspection, Other). Cost split into total/labour/parts. Stats: total spent (Σ total_cost_kes), current odometer (max).

### 5.4 Parts Log (`parts`)
CRUD; ordered by `purchased_at DESC`. **Line total computed app-side:** `total_cost_kes = quantity × unit_cost_kes` (stored). Status badges (Purchased/Fitted/Returned). Aggregates: total spent, total units, current odometer.

### 5.5 Snags (`snags`)
CRUD; ordered by `reported_at DESC`. **"Mark Fixed"** action sets `status = Resolved` + `resolved_at = today` (if not already set). Derived counts: open (Open + In Progress), needs-attention (open & High/Critical), resolved. Free-text resolution — **no FK link to service_logs.**

### 5.6 Maintenance Schedule (`maintenance_schedules` + reads `fuel_logs`/`service_logs` for current odometer)
- CRUD; ordered by `next_due_odometer ASC`.
- **Current odometer** = max `odometer_km` across that vehicle's fuel + service logs.
- **Auto next-due on save:**
  - `next_due_odometer = last_done_odometer + distance_interval_km` (if blank)
  - `next_due_date = addMonths(last_done_date, time_interval_months)` (if blank)
- **Status evaluation:** `remKm = next_due_odometer − currentOdo`, `remDays = daysUntil(next_due_date)`. Thresholds: **overdue** if either negative; **due soon** if remKm ≤ 1000 or remDays ≤ 30; else OK.
- **"Mark Done"** updates last-done fields and recomputes next-due.
- Stats: overdue count, due-soon count, total items.

### 5.7 Dashboard (read-only aggregator)
- Pulls fuel/service/parts/snags/maintenance (all vehicles), computes **fleet-wide** then **active-vehicle** views.
- Per-vehicle current odometer = max across fuel + service.
- **Spend headline = month-to-date**, with **last-30-days** sub-figure (fuel/service/parts).
- Consumption = corrected L/100km over last 10 fills.
- Fleet cards: MTD fuel spend, 30-day fuel spend, open snags, overdue maintenance.
- Active-vehicle cards: current odo, consumption, open snags, overdue/due-soon, next-due item.
- **Recent activity feed:** merges fuel/service/snag/part events, sorts by date desc, shows latest 8 with deep-links.

### 5.8 Analysis (read-only, Recharts) — most computation-heavy page
Time-range toggle: **3 / 6 / 12 months / All**. Fuel queried ordered by `odometer_km ASC`.

**Rolling-window engine** `rolling(fuelAsc, K, valueFn)`: for each i ≥ K, distance = odo[i] − odo[i−K], sums volume & cost over the K-fill window, emits `{date, value}`.

Charts:
1. **Fuel Consumption** (LineChart) — rolling **3-fill** corrected L/100km: `(vol/dist)×100`.
2. **Monthly Spend** (stacked BarChart) — per `YYYY-MM`, stacked fuel/service/parts.
3. **Price per Litre** (LineChart) — `derived_price_per_litre` (fallback `price_per_litre_kes`) per fill.
4. **Running Cost** (LineChart) — rolling 3-fill **KES/km**: `cost/dist`.

**Lifetime figures** (notably, fuel-economy metrics **exclude the first fill's volume/cost** so the unknown starting-tank amount doesn't skew the rate):
- distance = lastOdo − firstOdo; span in days/months (months = days/30.44)
- `lifeLkm = volAfter/distance×100`, `lifeCostKm = costAfter/distance`
- `avgPpl = totalFuelCost/totalVol`, latest ppl, `kmPerMonth`, avg fill (KES & L), avg days/km between fills
- upkeep = service + parts; `upkeepPer1000 = upkeep/distance×1000`
- **Records:** best/worst economy (from 3-fill series), cheapest KES/L, priciest single fill.
- **By-year table:** distance (Σ km between consecutive fills), volume, fuel cost, upkeep per calendar year.
- **Service-category table:** count + cost per category, sorted by cost desc.

---

## 6. Tooling & scripts

### 6.1 `scripts/import-acar.mjs` — aCar XML → seed/live importer
- Parses aCar XML (`Acar Old Records/12th June 2026/`: `vehicles.xml`, `fuel-types.xml`, `event-subtypes.xml`) via regex; strips photo blobs; decodes XML entities.
- Maps fillup records → `fuel_logs`, event records (type ≠ "purchased") → `service_logs`, reminders → `maintenance_schedules`, vehicle blocks → `vehicles`.
- **Deterministic UUIDs:** `stableUuid()` = SHA1(`'stallion-pit:' + acarVehicleId`) → formatted UUID, so re-imports are idempotent.
- Date `DD/MM/YYYY → ISO`; interval units normalized to months (years×12, weeks÷30.44, days÷30.44); `fuel_type` hardcoded `'Petrol'`; missing costs default 0.
- **Default mode** writes `db/seed_golden.sql` (truncate-and-reinsert).
- **`--apply`** writes **directly to the live Supabase DB**: logs in via anon key, clears data tables, batch-inserts (fuel in chunks of 200), computes `km_since_last` via SQL window function. `--maintenance` re-imports only schedules (matched by make/model/year).
- ⚠️ **Security finding:** the `--apply` path contains **hardcoded login credentials** (`chris.odeny@gmail.com` / `Test123`). These are committed to the repo. **Flag for the auditor.**

### 6.2 `scripts/set-password.mjs` — admin user provisioning
- Uses **service_role** key read from **`.env.local` (gitignored)** — correctly kept out of git.
- Finds user by email (paginates), then `admin.updateUserById()` or `admin.createUser()` (auto-confirmed). Validates the key isn't an anon/publishable key.

### 6.3 `db/seed_golden.sql` / `db/reset_empty.sql`
- `seed_golden.sql`: `TRUNCATE … RESTART IDENTITY CASCADE` on all 6 data tables, then re-inserts the golden dataset (2 vehicles + full history). **Does not touch the `auth` schema** — login survives.
- `reset_empty.sql`: truncates all data tables, no inserts (blank slate, login survives).
- Both are applied via Supabase SQL editor or MCP `execute_sql`. Documented in `db/README.md`.

### 6.4 `sync.ps1` (Windows workflow)
Copies edited files from the user's `Downloads` folder into the correct `src/**` locations, then optionally `git add/commit/push`. Reflects the user's "AI generates files → sync into repo" workflow.

### 6.5 Dev server (`vite.config.js`)
`host: true` (LAN-accessible for phone testing), `port: 5173`, `strictPort: true` (won't drift to 5174 — deliberate, to avoid clashing with the user's other concurrent workspaces).

---

## 7. Configuration & environment

- **`.env` (tracked in git):** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. ⚠️ The anon/publishable key is committed — tolerable **only** while RLS is correctly enabled on every table; recommended to untrack.
- **`.env.local` (gitignored):** `SUPABASE_SERVICE_ROLE_KEY` (admin script only). Correct.
- `.gitignore` excludes `node_modules`, `dist`, `*.local`, editor dirs, and `Acar Old Records/`.
- ESLint flat config: JS recommended + react-hooks + react-refresh; ignores `dist/`. **No type checking (no TypeScript).**

---

## 8. Known issues / loose ends (self-reported, for auditor context)
1. **`vehicles` and `fuel_logs` have no migration files** — schema lives only in the live DB. (§4)
2. **`.env` (anon key) tracked in git.** (§7)
3. **Hardcoded credentials** in `import-acar.mjs --apply`. (§6.1)
4. **FuelLog volume auto-calc uses `setState`-in-effect** (eslint warning); should be derived. (§5.2)
5. **No automated tests** of any kind. (§2)
6. **Uniform permissive RLS** (`USING(true)`) — no `auth.uid()` scoping. (§4.8)

---

## 9. Suggested audit focus areas
- **Security:** confirm RLS is enabled on the two unmigrated tables; assess the `USING(true)` model against the single-owner assumption; the committed anon key + hardcoded credentials; session handling defaults.
- **Data integrity:** correctness of the corrected-consumption and rolling-window math (especially first-fill exclusion and partial-fill handling); whether `km_since_last` is maintained on normal app inserts (not just `--apply`); CHECK-constraint coverage for the status/severity/category enums (currently UI-enforced).
- **Reproducibility:** the missing migrations mean a fresh Supabase project cannot be rebuilt from the repo alone — quantify the gap.
- **Robustness:** division-by-zero / null guards in calculations (several are present, e.g. `dist > 0`, `vol > 0` checks — verify completeness); behavior with a single fuel log, or vehicles with no logs.
- **Code quality:** no TypeScript, no tests, eslint warning noted; repeated CRUD boilerplate across 5 pages (DRY opportunity).

---

## 10. How to run (for an auditor who wants to execute it)
```bash
npm install
# requires .env with VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm run dev      # http://localhost:5173 (strict), LAN-exposed
npm run build    # production build
npm run lint     # eslint
```
Login is email/password against the live Supabase project (no signup UI). Test account referenced in docs: `chris.odeny@gmail.com` / `Test123`. To reset data, run `db/seed_golden.sql` (golden state) or `db/reset_empty.sql` (blank) in the Supabase SQL editor.
