# Stallion Pit — Route Cost Planner — Design Spec

**Date:** 2026-07-23
**Status:** Approved for planning
**Depends on:** existing `vehicles`, `fuel_logs` tables + `src/lib/calc/consumption.js` (rolling
L/100km) and `src/lib/calc/fuelUsage.js`-style "most recent fuel price" logic. No dependency on the
in-flight `codex/vin-specific-ipc` worktree branch — this slice only touches `main` at migration 0021.

## 1. Purpose
Chris currently checks Google Maps for distance/route, then does the "what will this trip cost me"
math by hand, per vehicle, using a fuel price he's holding in his head. This feature moves that into
the app: plan a route (origin → destination), see distance/duration from Google, and see the real
fuel + running cost **for every vehicle in the fleet** using each vehicle's actual rolling L/100km —
so "which car should I take" and "is this route worth it" are direct answers, not mental math. Routes
can be named and saved for repeat trips; saved routes always show **live** cost (today's fuel price,
today's consumption), never a stale snapshot.

## 2. Goals / non-goals
**Goals**
- Plan a route: address-autocomplete origin/destination, pull distance + duration from Google.
- Embedded interactive map showing the route.
- Fleet-wide cost comparison for the computed route: fuel cost + per-km running cost, per vehicle,
  cheapest first.
- Save named routes (addresses only) and reload them later with live-recomputed cost.
- New `running_cost_km` field per vehicle (tyres/service/depreciation), editable on the Fleet form.

**Non-goals (deferred)**
- Multi-stop/waypoint routes — origin → destination only for v1.
- Route alternatives / comparing 2+ path options for the same origin-destination pair.
- Turn-by-turn navigation or tying a saved route to an actual logged trip/odometer entry — this is a
  planning tool, not a trip log.
- A server-side proxy for the Google APIs — not needed (see §4).

## 3. Data model — `supabase/migrations/0022_saved_routes.sql`
New table, owner-RLS scoped — same idempotent shape as `0021_user_settings.sql` (`create table if not
exists`, `user_id ... references auth.users(id) on delete cascade default auth.uid()`, RLS enabled,
`drop policy if exists` + `create policy` for select/insert/update/delete on `auth.uid() = user_id`):
```sql
create table if not exists public.saved_routes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null,
  origin_address text not null,
  origin_lat double precision not null,
  origin_lng double precision not null,
  destination_address text not null,
  destination_lat double precision not null,
  destination_lng double precision not null,
  distance_km numeric not null,
  duration_min numeric not null,
  notes text,
  created_at timestamptz not null default now()
);
-- + enable row level security and the 4 owner policies, per the 0021 pattern.
```
Not tied to a vehicle — the fleet comparison is computed at view time from whichever vehicles exist
then, so a route saved today still compares correctly against a vehicle added next year.

Additive change to `vehicles` (nullable, no default-value backfill needed):
```sql
alter table public.vehicles add column if not exists running_cost_km numeric;
```
Fleet form (`src/pages/Fleet.jsx`) gains a "Running cost (KES/km)" input in the existing specs
section, next to `fuel_tank_capacity` etc. Blank/null is treated as 0 in cost calculations — a
vehicle with no rate set just shows fuel-only cost.

## 4. Google Cloud setup (one-time, done by Chris with step-by-step help — not app code)
- One Google Cloud project with a billing account attached. Google requires this even for API keys
  that never exceed the free tier; personal single-user usage here (a handful of route lookups and
  map loads a day) stays far inside the **$200/month** free credit — realistic cost is $0.
- Enable exactly 3 APIs on that project: **Maps JavaScript API** (renders the embedded map),
  **Places API** (address autocomplete), **Routes API** (distance + duration).
- Create one browser API key, **restricted**:
  - **API restrictions:** only the 3 APIs above.
  - **Application restrictions (HTTP referrers):** `localhost:5173/*` and
    `https://stallion-pit.vercel.app/*`.
- This is Google's documented pattern for client-only web apps — the key ships in the JS bundle (like
  the Supabase anon key already does), and the referrer restriction is what prevents use from any
  other site. No secret/service key is created; no serverless proxy is needed, unlike the
  `/api/fetch-part` function (that one exists to avoid SSRF from arbitrary user-pasted URLs — a
  different problem that doesn't apply here).
- Stored as `VITE_GOOGLE_MAPS_API_KEY` in `.env` (local) and as a Vercel environment variable (prod),
  same handling as the existing `VITE_SUPABASE_*` vars.
- The implementation plan will include the exact deep links (Google Cloud Console pages) and a
  "you're in the right place" check for each step, per Chris's standing instruction for external
  console work.

## 5. Pure logic — `src/lib/calc/routeCost.js` (+ `routeCost.test.js`)
No live network calls in this module — it's pure math over data the caller already has, so it's
fully unit-testable without hitting Google or Supabase.
- `fuelCostForVehicle(distanceKm, rollingL100, pricePerLitre)` →
  `distanceKm * (rollingL100 / 100) * pricePerLitre`, or `null` if `rollingL100` or `pricePerLitre`
  is null (vehicle has no fuel history yet — "no data" in the UI, not a fabricated $0).
- `runningCostForVehicle(distanceKm, runningCostKm)` → `distanceKm * (runningCostKm || 0)`.
- `totalRouteCost(distanceKm, vehicle, rollingL100, pricePerLitre)` → combines both, `null` fuel cost
  propagates to a `null` total (never silently drops the fuel component).
- `fleetRouteCosts(distanceKm, vehiclesWithConsumption)` → maps the above over every vehicle, sorted
  cheapest-total-first (vehicles with `null` total sort last, not first).
- Consumption input (`rollingL100`, `pricePerLitre` per vehicle) is computed by reusing the existing
  `consumption.js` rolling-window function and the existing "most recent fuel log price" lookup used
  on the Dashboard/Analysis pages — no new consumption logic invented.

## 6. UI — new page `src/pages/RoutePlanner.jsx` at route `/routes`
Named `RoutePlanner`/`saved_routes` (not `Routes.jsx`) to avoid confusion with React Router's own
"routes" terminology in the codebase.

- **Nav:** added to `NAV_ITEMS` in `Layout.jsx`, icon 🗺️, **not** `desktopOnly` — appears in both the
  desktop sidebar and the mobile bottom tab bar per Chris's answer (checking trip cost from the phone
  before/during a drive is a real use case here, unlike Backup/Documents).
- **Plan a Route** (top section): From/To text inputs wired to Google Places Autocomplete, a
  "Compute" button. On submit, calls the Routes API for `distance_km` + `duration_min` and geocoded
  lat/lng for both ends.
- **Results** (appears after a successful compute): a smaller embedded Google Map (Maps JavaScript
  API, route line drawn between the two points) side-by-side with the **fleet cost comparison
  table** — one row per vehicle: name, current rolling L/100km, fuel cost, running cost, total,
  sorted cheapest first (via `fleetRouteCosts`). Stacks vertically on mobile.
- **Save this route:** a name field + button that inserts the current computed route (addresses +
  lat/lng + distance/duration) into `saved_routes`. Distance/duration are the only things persisted
  from Google — never a stored cost.
- **Saved Routes** (bottom section): table of saved routes (name, distance, duration, cheapest
  vehicle + its cost — recomputed live on every render via `fleetRouteCosts`, not read from storage).
  Clicking a row loads its addresses/coordinates back into the Results section above. Delete with
  confirm, matching every other list page's convention.
- **Loading/lazy-load:** the Maps JavaScript API + Places library are loaded via a small script-loader
  helper (`src/lib/maps/loadGoogleMaps.js`) invoked once on this page's mount — dynamically injected,
  not a global `<script>` tag in `index.html` — so no other page's bundle or load time is affected
  (same reasoning as the existing dynamic `html2canvas` import for the feedback screenshot feature).
- **Errors:** script-load failure, "no route found," and API errors (quota/invalid request) each show
  an inline message in the Plan a Route section rather than a silent dead end. Explicit
  "Computing route…" / "Loading map…" states.

## 7. Work breakdown
1. `0022_saved_routes.sql` — new table + `vehicles.running_cost_km`; apply live.
2. `src/lib/calc/routeCost.js` + `routeCost.test.js` (pure cost math, fully covered — no live API in
   these tests).
3. `src/lib/maps/loadGoogleMaps.js` — script-loader helper (Maps JS + Places), dynamic-imported.
4. Fleet form: add "Running cost (KES/km)" field (`Fleet.jsx`).
5. `src/pages/RoutePlanner.jsx` — Plan a Route form (autocomplete), Results (map + fleet comparison
   table), Save, Saved Routes list/reload/delete.
6. `Layout.jsx` — add `/routes` to `NAV_ITEMS` (not desktopOnly), route registered in `App.jsx`.
7. Google Cloud setup performed by Chris, walked through step-by-step in the implementation plan
   (project, billing, 3 APIs enabled, restricted key, env vars local + Vercel).
8. Manual verification in-browser (autocomplete, map render, route compute, save/reload, fleet
   comparison numbers) — Google API calls aren't unit-testable, so this step is load-bearing.
9. `npm test` + build + lint clean; commit **own files only** (no `git add -A` — the repo has
   unrelated untracked `Data/`/`IPC/` import files and a separate in-flight worktree).

## 8. Risks & mitigations
- **API key exposure** — mitigated by HTTP-referrer + API restriction on the key (§4); this is
  Google's documented client-side pattern, not a security gap, same trust model as the public
  Supabase anon key already shipped in this app.
- **Billing surprise** — mitigated by restricting to exactly 3 APIs and by realistic personal-use
  volume staying far under the $200/mo free credit; worth a calendar reminder to glance at GCP billing
  once after go-live, not a recurring concern.
- **Vehicle with no fuel history** — `fuelCostForVehicle` returns `null` rather than treating missing
  data as 0, so a car with zero fuel logs shows "no data," never a misleadingly cheap $0 total.
- **Stale cost drift** — explicitly avoided by design: saved routes never store a cost, only
  addresses/coordinates/distance/duration; cost is always computed live from current fuel price +
  current rolling consumption (§6).
- **Concurrent worktree** (`codex/vin-specific-ipc`) — this slice only touches `main`, uses migration
  0022 (next free number after main's 0021), and stages explicit paths, not `git add -A`.

## 9. Success criteria
- [ ] `0022` applied live; existing vehicles/fuel data unaffected; `running_cost_km` persists.
- [ ] Autocomplete, route compute, and embedded map work end-to-end in the browser against the real
      Google APIs (manually verified by Chris).
- [ ] Fleet comparison table shows correct sorted cost per vehicle, `null`-safe for vehicles with no
      fuel history.
- [ ] Save → appears in Saved Routes → reload → recomputes live (change the vehicle's most recent
      fuel price and confirm the displayed cost changes without re-saving the route).
- [ ] `/routes` reachable from both desktop sidebar and mobile bottom nav.
- [ ] `npm test` passes (incl. new `routeCost` tests); build clean; no new lint beyond the known
      app-wide set-state-in-effect debt.
