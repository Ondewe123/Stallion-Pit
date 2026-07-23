# Route Cost Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Chris plan a route (origin → destination) via Google Maps, see it on an embedded map,
and instantly see fuel + running cost for every vehicle in his fleet using each vehicle's real
rolling L/100km — plus save named routes for repeat trips with live-recomputed cost.

**Architecture:** A new Supabase table (`saved_routes`, addresses/coords/distance/duration only —
never a stored cost) + one additive `vehicles.running_cost_km` column. Three small browser-only
`src/lib/maps/*` modules call the Google Places API (New) and Routes API directly via `fetch` (no
SDK, no server proxy — a referrer-restricted API key is Google's documented pattern for this). A
new `RoutePlanner` page at `/routes` composes a reusable `AddressAutocomplete` input, an embedded
Google Map (lazy-loaded), a pure `routeCost.js` cost calculator, and the saved-routes list.

**Tech Stack:** React 19, Supabase (Postgres + RLS), Vitest, Google Places API (New) + Routes API
(REST, called via `fetch`) + Maps JavaScript API (script-tag loaded, for the embedded map only).

## Global Constraints
- **No new npm dependencies.** Places/Routes are called via plain `fetch`; the embedded map uses
  the standard Google-hosted `<script>` loader — zero packages to install.
- **Currency:** KES, formatted with `Math.round(n).toLocaleString()` matching every existing page.
- **Test runner:** `npx vitest run --no-file-parallelism <path>` — a full parallel `npm test` run
  is known to OOM on this machine under concurrent-session load (see project memory); always use
  `--no-file-parallelism`.
- **Migration numbering:** next free number is **0022**; `main` is currently at 0021. Idempotent
  SQL (`create table if not exists`, `add column if not exists`) so re-running is always safe.
- **RLS:** every new table is owner-scoped (`auth.uid() = user_id`), following the exact
  `0021_user_settings.sql` pattern (enable RLS, `drop policy if exists` + `create policy` for
  select/insert/update/delete).
- **Form convention:** `clean(form)` maps `'' → null` before insert/update (see `Fleet.jsx`).
- **Delete convention:** inline confirm — `deleteConfirm` state holding a row id, `row-btn
  row-btn-danger` for the initial Delete button, Confirm/Cancel pair shown in its place (see
  `Documents.jsx`).
- **Theming:** no hardcoded hex in CSS — use the existing custom properties (`--surface`,
  `--border`, `--border-strong`, `--text`, `--text-faint`, `--text-muted`, `--accent`,
  `--accent-soft`). Any color needed inside canvas-based JS (the Google Map polyline) must be read
  at draw time via `getComputedStyle(document.documentElement).getPropertyValue('--accent')`,
  exactly like `src/lib/chartTheme.js` already does for Recharts — never a literal hex in JS either.
- **Mobile-responsive golden rule:** only add new, smaller breakpoint values; never edit an
  existing larger breakpoint.
- **Git hygiene:** never `git add -A` — the working tree has unrelated untracked `Data/`/`IPC/`
  import files and a separate `codex/vin-specific-ipc` worktree; stage this plan's explicit paths
  only.

---

### Task 1: Migration `0022_saved_routes.sql` — new table + vehicle running-cost column

**Files:**
- Create: `supabase/migrations/0022_saved_routes.sql`

**Interfaces:**
- Produces: table `public.saved_routes` (columns: `id, user_id, name, origin_address, origin_lat,
  origin_lng, destination_address, destination_lat, destination_lng, distance_km, duration_min,
  notes, created_at`) and `public.vehicles.running_cost_km` (nullable numeric) — consumed by every
  later task that reads/writes these.

- [ ] **Step 1: Write the migration file**

```sql
-- 0022_saved_routes.sql — Route Cost Planner: saved routes + per-vehicle running cost rate.
--
-- saved_routes stores only addresses/coordinates/distance/duration (from Google) — cost is
-- always computed live from current fuel price + current rolling consumption, never stored.
-- Owner-scoped RLS (0005/0021 pattern). Additive `vehicles` column, no existing data touched.
-- Idempotent.

create table if not exists public.saved_routes (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name                 text not null,
  origin_address       text not null,
  origin_lat           double precision not null,
  origin_lng           double precision not null,
  destination_address  text not null,
  destination_lat      double precision not null,
  destination_lng      double precision not null,
  distance_km          numeric not null,
  duration_min         numeric not null,
  notes                text,
  created_at           timestamptz not null default now()
);

alter table public.saved_routes enable row level security;

drop policy if exists "owner read saved_routes"   on public.saved_routes;
drop policy if exists "owner insert saved_routes" on public.saved_routes;
drop policy if exists "owner update saved_routes" on public.saved_routes;
drop policy if exists "owner delete saved_routes" on public.saved_routes;

create policy "owner read saved_routes"   on public.saved_routes for select using (auth.uid() = user_id);
create policy "owner insert saved_routes" on public.saved_routes for insert with check (auth.uid() = user_id);
create policy "owner update saved_routes" on public.saved_routes for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner delete saved_routes" on public.saved_routes for delete using (auth.uid() = user_id);

alter table public.vehicles add column if not exists running_cost_km numeric;
```

- [ ] **Step 2: Apply it to the live Supabase project**

**You're in the right place check** — run this first in the SQL Editor at
https://supabase.com/dashboard/project/mwakgpzcqoalxtvqucki/sql/new (or via the Supabase MCP
`execute_sql` tool with `project_id=mwakgpzcqoalxtvqucki`):
```sql
select name, make, model from vehicles order by created_at;
```
Expected: rows including a Mercedes C180 and a VW Polo — confirms this is the Stallion Pit project.

Then run the full migration SQL from Step 1 (via the Supabase MCP `apply_migration` tool with
`project_id=mwakgpzcqoalxtvqucki`, `name="saved_routes"`, and the SQL as `query`; or paste it into
the same SQL Editor and run).

- [ ] **Step 3: Verify**

```sql
select column_name from information_schema.columns where table_name = 'saved_routes' order by 1;
select column_name from information_schema.columns where table_name = 'vehicles' and column_name = 'running_cost_km';
```
Expected: first query returns all 12 `saved_routes` columns; second returns exactly one row,
`running_cost_km`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0022_saved_routes.sql
git commit -m "feat(routes): add saved_routes table and vehicles.running_cost_km"
```

---

### Task 2: `src/lib/calc/routeCost.js` — pure fuel + running cost math

**Files:**
- Create: `src/lib/calc/routeCost.js`
- Test: `src/lib/calc/routeCost.test.js`

**Interfaces:**
- Consumes: nothing (pure, no imports from other new modules).
- Produces: `fuelCostForVehicle(distanceKm, rollingL100, pricePerLitre) → number|null`,
  `runningCostForVehicle(distanceKm, runningCostKm) → number`,
  `totalRouteCost(distanceKm, vehicle, rollingL100, pricePerLitre) → { fuelCost, runningCost, totalCost }`
  (`vehicle` only needs a `running_cost_km` property), `fleetRouteCosts(distanceKm,
  vehiclesWithConsumption) → [{ id, name, fuelCost, runningCost, totalCost }]` sorted cheapest
  (lowest `totalCost`) first, `null`-total rows last. `vehiclesWithConsumption` items need `{ id,
  name, running_cost_km, rollingL100, pricePerLitre }`. Consumed by Task 10 (`RoutePlanner.jsx`).

- [ ] **Step 1: Write the failing tests**

```javascript
// src/lib/calc/routeCost.test.js
import { describe, expect, it } from 'vitest'
import { fuelCostForVehicle, runningCostForVehicle, totalRouteCost, fleetRouteCosts } from './routeCost'

describe('fuelCostForVehicle', () => {
  it('computes distance * (L/100km / 100) * price per litre', () => {
    expect(fuelCostForVehicle(100, 8, 150)).toBeCloseTo(1200) // 100km * 0.08 L/km * 150 KES/L
  })
  it('returns null when consumption is unknown', () => {
    expect(fuelCostForVehicle(100, null, 150)).toBeNull()
  })
  it('returns null when fuel price is unknown', () => {
    expect(fuelCostForVehicle(100, 8, null)).toBeNull()
  })
})

describe('runningCostForVehicle', () => {
  it('computes distance * rate', () => {
    expect(runningCostForVehicle(100, 4.5)).toBeCloseTo(450)
  })
  it('treats a missing rate as 0', () => {
    expect(runningCostForVehicle(100, null)).toBe(0)
    expect(runningCostForVehicle(100, undefined)).toBe(0)
  })
})

describe('totalRouteCost', () => {
  it('sums fuel + running cost', () => {
    const result = totalRouteCost(100, { running_cost_km: 4.5 }, 8, 150)
    expect(result.fuelCost).toBeCloseTo(1200)
    expect(result.runningCost).toBeCloseTo(450)
    expect(result.totalCost).toBeCloseTo(1650)
  })
  it('propagates a null fuel cost to a null total (never silently drops it)', () => {
    const result = totalRouteCost(100, { running_cost_km: 4.5 }, null, 150)
    expect(result.fuelCost).toBeNull()
    expect(result.totalCost).toBeNull()
  })
})

describe('fleetRouteCosts', () => {
  it('sorts vehicles cheapest total first', () => {
    const rows = fleetRouteCosts(100, [
      { id: 'a', name: 'Polo', running_cost_km: 2, rollingL100: 8, pricePerLitre: 150 },
      { id: 'b', name: 'Mercedes', running_cost_km: 5, rollingL100: 12, pricePerLitre: 150 },
    ])
    expect(rows.map(r => r.id)).toEqual(['a', 'b'])
  })
  it('sorts vehicles with no fuel data last, not first', () => {
    const rows = fleetRouteCosts(100, [
      { id: 'a', name: 'No data', running_cost_km: 2, rollingL100: null, pricePerLitre: null },
      { id: 'b', name: 'Polo', running_cost_km: 2, rollingL100: 8, pricePerLitre: 150 },
    ])
    expect(rows.map(r => r.id)).toEqual(['b', 'a'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run --no-file-parallelism src/lib/calc/routeCost.test.js`
Expected: FAIL — `Cannot find module './routeCost'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

```javascript
// src/lib/calc/routeCost.js
// Pure route-cost calculations — no React/Supabase deps, fully unit-testable.

export function fuelCostForVehicle(distanceKm, rollingL100, pricePerLitre) {
  if (rollingL100 == null || pricePerLitre == null) return null
  return distanceKm * (rollingL100 / 100) * pricePerLitre
}

export function runningCostForVehicle(distanceKm, runningCostKm) {
  return distanceKm * (Number(runningCostKm) || 0)
}

export function totalRouteCost(distanceKm, vehicle, rollingL100, pricePerLitre) {
  const fuelCost = fuelCostForVehicle(distanceKm, rollingL100, pricePerLitre)
  const runningCost = runningCostForVehicle(distanceKm, vehicle?.running_cost_km)
  return { fuelCost, runningCost, totalCost: fuelCost == null ? null : fuelCost + runningCost }
}

// vehiclesWithConsumption: [{ id, name, running_cost_km, rollingL100, pricePerLitre }]
export function fleetRouteCosts(distanceKm, vehiclesWithConsumption) {
  const rows = (vehiclesWithConsumption || []).map(v => {
    const { fuelCost, runningCost, totalCost } = totalRouteCost(distanceKm, v, v.rollingL100, v.pricePerLitre)
    return { id: v.id, name: v.name, fuelCost, runningCost, totalCost }
  })
  return rows.sort((a, b) => {
    if (a.totalCost == null && b.totalCost == null) return 0
    if (a.totalCost == null) return 1
    if (b.totalCost == null) return -1
    return a.totalCost - b.totalCost
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --no-file-parallelism src/lib/calc/routeCost.test.js`
Expected: PASS — 8 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/calc/routeCost.js src/lib/calc/routeCost.test.js
git commit -m "feat(routes): add pure fuel + running cost calculator"
```

---

### Task 3: `src/lib/maps/parse.js` — pure response-shape parsers

**Files:**
- Create: `src/lib/maps/parse.js`
- Test: `src/lib/maps/parse.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `parseAutocompleteResponse(json) → [{ placeId, text }]`, `parsePlaceDetails(json) →
  { address, lat, lng } | null`, `parseComputeRoutesResponse(json) → { distanceKm, durationMin,
  encodedPolyline } | null`. Consumed by Task 4 (`places.js`) and Task 5 (`routes.js`).

- [ ] **Step 1: Write the failing tests**

```javascript
// src/lib/maps/parse.test.js
import { describe, expect, it } from 'vitest'
import { parseAutocompleteResponse, parsePlaceDetails, parseComputeRoutesResponse } from './parse'

describe('parseAutocompleteResponse', () => {
  it('extracts placeId + display text from each suggestion', () => {
    const json = {
      suggestions: [
        { placePrediction: { placeId: 'ChIJ111', text: { text: 'Nairobi, Kenya' } } },
        { placePrediction: { placeId: 'ChIJ222', text: { text: 'Naivasha, Kenya' } } },
      ],
    }
    expect(parseAutocompleteResponse(json)).toEqual([
      { placeId: 'ChIJ111', text: 'Nairobi, Kenya' },
      { placeId: 'ChIJ222', text: 'Naivasha, Kenya' },
    ])
  })
  it('returns an empty array when there are no suggestions', () => {
    expect(parseAutocompleteResponse({})).toEqual([])
    expect(parseAutocompleteResponse(null)).toEqual([])
  })
})

describe('parsePlaceDetails', () => {
  it('extracts address + lat/lng', () => {
    const json = {
      formattedAddress: 'Nairobi, Kenya',
      location: { latitude: -1.2921, longitude: 36.8219 },
    }
    expect(parsePlaceDetails(json)).toEqual({ address: 'Nairobi, Kenya', lat: -1.2921, lng: 36.8219 })
  })
  it('returns null when the place has no location', () => {
    expect(parsePlaceDetails({})).toBeNull()
  })
})

describe('parseComputeRoutesResponse', () => {
  it('converts metres to km and duration seconds to minutes', () => {
    const json = {
      routes: [{ distanceMeters: 42000, duration: '1800s', polyline: { encodedPolyline: 'abc123' } }],
    }
    expect(parseComputeRoutesResponse(json)).toEqual({ distanceKm: 42, durationMin: 30, encodedPolyline: 'abc123' })
  })
  it('returns null when there is no route', () => {
    expect(parseComputeRoutesResponse({ routes: [] })).toBeNull()
    expect(parseComputeRoutesResponse({})).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run --no-file-parallelism src/lib/maps/parse.test.js`
Expected: FAIL — `Cannot find module './parse'`.

- [ ] **Step 3: Write the implementation**

```javascript
// src/lib/maps/parse.js
// Pure response-shape parsers for the Google Places (New) and Routes APIs. Kept separate from
// the fetch calls so the parsing logic is unit-testable against fixture JSON, without hitting
// the network — these fixtures are also the executable spec of the exact shape the fetch
// wrappers (places.js, routes.js) depend on.

export function parseAutocompleteResponse(json) {
  const suggestions = json?.suggestions || []
  return suggestions
    .map(s => s.placePrediction)
    .filter(Boolean)
    .map(p => ({ placeId: p.placeId, text: p.text?.text || '' }))
}

export function parsePlaceDetails(json) {
  const loc = json?.location
  if (!loc) return null
  return {
    address: json.formattedAddress || json.displayName?.text || '',
    lat: loc.latitude,
    lng: loc.longitude,
  }
}

function parseDurationSeconds(duration) {
  if (!duration) return null
  const match = /^(\d+(?:\.\d+)?)s$/.exec(duration)
  return match ? Number(match[1]) : null
}

export function parseComputeRoutesResponse(json) {
  const route = json?.routes?.[0]
  if (!route) return null
  const seconds = parseDurationSeconds(route.duration)
  return {
    distanceKm: route.distanceMeters != null ? route.distanceMeters / 1000 : null,
    durationMin: seconds != null ? seconds / 60 : null,
    encodedPolyline: route.polyline?.encodedPolyline || null,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --no-file-parallelism src/lib/maps/parse.test.js`
Expected: PASS — 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/maps/parse.js src/lib/maps/parse.test.js
git commit -m "feat(routes): add pure parsers for Places/Routes API responses"
```

---

### Task 4: `src/lib/maps/places.js` — Places API (New) fetch wrappers

**Files:**
- Create: `src/lib/maps/places.js`

**Interfaces:**
- Consumes: `parseAutocompleteResponse`, `parsePlaceDetails` from `./parse` (Task 3).
- Produces: `autocompletePlaces(input, apiKey) → Promise<[{ placeId, text }]>`,
  `getPlaceDetails(placeId, apiKey) → Promise<{ address, lat, lng }>` (throws if no location).
  Consumed by Task 9 (`AddressAutocomplete.jsx`).
- Not unit tested — live network I/O; parsing logic underneath is already covered by Task 3.
  Verified manually in Task 13.

- [ ] **Step 1: Write the implementation**

```javascript
// src/lib/maps/places.js
// Thin fetch wrappers around the Places API (New). No SDK — a referrer-restricted browser API
// key (see docs/superpowers/specs/2026-07-23-route-cost-planner-design.md §4) is safe to call
// directly from the client, same trust model as the public Supabase anon key.
import { parseAutocompleteResponse, parsePlaceDetails } from './parse'

const BASE = 'https://places.googleapis.com/v1'

export async function autocompletePlaces(input, apiKey) {
  if (!input || !input.trim()) return []
  const res = await fetch(`${BASE}/places:autocomplete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey },
    body: JSON.stringify({ input, includedRegionCodes: ['ke'] }),
  })
  if (!res.ok) throw new Error(`Places autocomplete failed (${res.status})`)
  return parseAutocompleteResponse(await res.json())
}

export async function getPlaceDetails(placeId, apiKey) {
  const res = await fetch(`${BASE}/places/${placeId}`, {
    headers: { 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': 'formattedAddress,location,displayName' },
  })
  if (!res.ok) throw new Error(`Place details failed (${res.status})`)
  const details = parsePlaceDetails(await res.json())
  if (!details) throw new Error('That place has no location data')
  return details
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/maps/places.js
git commit -m "feat(routes): add Places API (New) fetch wrappers"
```

---

### Task 5: `src/lib/maps/routes.js` — Routes API fetch wrapper

**Files:**
- Create: `src/lib/maps/routes.js`

**Interfaces:**
- Consumes: `parseComputeRoutesResponse` from `./parse` (Task 3).
- Produces: `computeRoute({lat,lng}, {lat,lng}, apiKey) → Promise<{ distanceKm, durationMin,
  encodedPolyline }>` (throws if no route found). Consumed by Task 10 (`RoutePlanner.jsx`).
- Not unit tested — live network I/O; parsing logic underneath is already covered by Task 3.
  Verified manually in Task 13.

- [ ] **Step 1: Write the implementation**

```javascript
// src/lib/maps/routes.js
// Thin fetch wrapper around the Routes API `computeRoutes`. Same client-side-safe-key model as
// places.js.
import { parseComputeRoutesResponse } from './parse'

const ENDPOINT = 'https://routes.googleapis.com/directions/v2:computeRoutes'

export async function computeRoute(origin, destination, apiKey) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline',
    },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
      destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE',
    }),
  })
  if (!res.ok) throw new Error(`Route lookup failed (${res.status})`)
  const parsed = parseComputeRoutesResponse(await res.json())
  if (!parsed) throw new Error('No route found between those two places')
  return parsed
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/maps/routes.js
git commit -m "feat(routes): add Routes API fetch wrapper"
```

---

### Task 6: `src/lib/maps/loadGoogleMaps.js` — lazy script loader for the embedded map

**Files:**
- Create: `src/lib/maps/loadGoogleMaps.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `loadGoogleMaps(apiKey) → Promise<google.maps namespace>`. Injects the Maps
  JavaScript API `<script>` tag once (cached promise — safe to call on every `RoutePlanner` mount
  without reinjecting). Consumed by Task 10 (`RoutePlanner.jsx`). Loads the `geometry` library
  (needed for `google.maps.geometry.encoding.decodePath`, used to draw the route polyline from
  the Routes API's encoded polyline).

- [ ] **Step 1: Write the implementation**

```javascript
// src/lib/maps/loadGoogleMaps.js
// Lazily injects the Maps JavaScript API script tag on first use (only when RoutePlanner mounts),
// same reasoning as the existing dynamic `html2canvas` import for the feedback screenshot
// feature — no other page's bundle or load time is affected. Caches the load promise so repeat
// mounts never re-inject the script.

let loadPromise = null

export function loadGoogleMaps(apiKey) {
  if (typeof window !== 'undefined' && window.google?.maps) return Promise.resolve(window.google.maps)
  if (loadPromise) return loadPromise
  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=geometry&v=weekly`
    script.async = true
    script.onload = () => resolve(window.google.maps)
    script.onerror = () => { loadPromise = null; reject(new Error('Failed to load Google Maps')) }
    document.head.appendChild(script)
  })
  return loadPromise
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/maps/loadGoogleMaps.js
git commit -m "feat(routes): add lazy Google Maps JS API script loader"
```

---

### Task 7: Google Cloud setup (manual — Chris performs this step, not a coding agent)

**Files:**
- Modify: `.env` (add `VITE_GOOGLE_MAPS_API_KEY`)
- Modify: Vercel project environment variables (via the Vercel dashboard, not a file)

**Interfaces:**
- Produces: a working `VITE_GOOGLE_MAPS_API_KEY` value, available to `import.meta.env` locally and
  in production. Consumed by Task 9 and Task 10.

If you're executing this plan as a coding agent and reach this task: **stop and hand it to Chris**
— it requires clicking through the Google Cloud Console with his account, which no agent can do.

- [ ] **Step 1: Create (or confirm) a Google Cloud project**

Go to https://console.cloud.google.com/projectcreate — **right-place check:** the page title reads
"New Project" and the "Organization" dropdown shows your Google account. Name it e.g.
`stallion-pit`, click **Create**. Expected result: after a few seconds, a notification shows the
project created; the project-picker in the top-left header now lists it.

**Before every step below**, confirm the top-left project picker shows this project (not some
other project from another app) — this is the single most common mistake with Google Cloud console
work.

- [ ] **Step 2: Attach a billing account**

Go to https://console.cloud.google.com/billing and link (or create) a billing account to the
`stallion-pit` project. Expected result: the Billing page for this project shows an active account,
no "billing not enabled" warning. Personal usage here stays inside Google's $200/month free credit
— realistic cost is $0, but Google requires a billing account on file to issue API keys for these
APIs regardless.

- [ ] **Step 3: Enable the 3 required APIs**

Visit each link (with the `stallion-pit` project selected) and click **Enable**:
- https://console.cloud.google.com/apis/library/maps-backend.googleapis.com (Maps JavaScript API)
- https://console.cloud.google.com/apis/library/places.googleapis.com (Places API — New)
- https://console.cloud.google.com/apis/library/routes.googleapis.com (Routes API)

Expected result: each page's button changes from "Enable" to "Manage" after enabling.

- [ ] **Step 4: Create a restricted API key**

Go to https://console.cloud.google.com/apis/credentials → **+ Create Credentials** → **API key**.
A key is generated — copy it somewhere temporary, then click **Edit API key** (or find it in the
credentials list and click it) to restrict it before using it anywhere:
- **Application restrictions** → **HTTP referrers (web sites)** → add two referrers:
  `localhost:5173/*` and `https://stallion-pit.vercel.app/*`
- **API restrictions** → **Restrict key** → select exactly the 3 APIs enabled in Step 3 (Maps
  JavaScript API, Places API (New), Routes API)
- Click **Save**.

Expected result: the credentials list shows the key with "3 APIs" under API restrictions and your
two domains under application restrictions — not "None" for either.

- [ ] **Step 5: Add the key locally**

Open [.env](.env) and add a new line:
```
VITE_GOOGLE_MAPS_API_KEY=<paste the key from Step 4>
```
Save the file, then restart the dev server (`Ctrl+C` then `npm run dev` — Vite only reads `.env`
at startup). Expected result: no error on restart.

- [ ] **Step 6: Add the key on Vercel**

Go to https://vercel.com/dashboard → the `stallion-pit` project → **Settings** → **Environment
Variables** → **Add New**:
- Key: `VITE_GOOGLE_MAPS_API_KEY`
- Value: paste the key — **paste it as ONE clean line**. (A past incident on this exact project:
  a key pasted multiple times with embedded newlines made the browser's `fetch()` throw
  synchronously in production. Paste once, then click into the value field and confirm there's no
  trailing blank line before saving.)
- Environments: check all three (Production, Preview, Development).

Click **Save**, then **redeploy** (Vercel env var changes require an explicit redeploy — they don't
apply retroactively to the current deployment). Expected result: the next deployment's build log
shows no missing-env warnings; visiting https://stallion-pit.vercel.app/routes (once Task 10 ships)
loads without a "Google Maps isn't configured" message.

- [ ] **Step 7: Commit the `.env` change**

```bash
git add .env
git commit -m "chore(routes): add VITE_GOOGLE_MAPS_API_KEY"
```

---

### Task 8: Fleet — add "Running cost (KES/km)" field

**Files:**
- Modify: `src/pages/Fleet.jsx:18` (EMPTY_FORM), `src/pages/Fleet.jsx:130-134` (form fields),
  `src/pages/Fleet.jsx:284-291` (VehicleDetail specs array)

**Interfaces:**
- Consumes: nothing new.
- Produces: `vehicles.running_cost_km` becomes editable/visible; consumed by Task 10 via
  `useVehicle().vehicles`.

- [ ] **Step 1: Add the field to `EMPTY_FORM`**

In `src/pages/Fleet.jsx`, change:
```javascript
  fuel_tank_capacity: '', oil_capacity_litres: '', oil_spec: '',
```
to:
```javascript
  fuel_tank_capacity: '', oil_capacity_litres: '', oil_spec: '', running_cost_km: '',
```

- [ ] **Step 2: Add the input field to the form**

In `src/pages/Fleet.jsx`, immediately after this existing block (the Fuel Tank Capacity field,
currently the last field before the "Registration & Purchase" section title):
```jsx
        <div className="form-group">
          <label>Fuel Tank Capacity (L)</label>
          <input type="number" step="0.1" value={form.fuel_tank_capacity} onChange={e => set('fuel_tank_capacity', e.target.value)} placeholder="e.g. 62" />
        </div>
      </div>
      <div className="form-section-title">Registration & Purchase</div>
```
insert a new row so it reads:
```jsx
        <div className="form-group">
          <label>Fuel Tank Capacity (L)</label>
          <input type="number" step="0.1" value={form.fuel_tank_capacity} onChange={e => set('fuel_tank_capacity', e.target.value)} placeholder="e.g. 62" />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Running Cost (KES/km)</label>
          <input type="number" step="0.1" value={form.running_cost_km} onChange={e => set('running_cost_km', e.target.value)} placeholder="e.g. 4.5 — tyres, service, depreciation" />
        </div>
      </div>
      <div className="form-section-title">Registration & Purchase</div>
```

- [ ] **Step 3: Show it on the vehicle detail view**

In `src/pages/Fleet.jsx`, the `VehicleDetail` specs array has this entry:
```javascript
    { label: 'Tank Capacity',  value: vehicle.fuel_tank_capacity ? `${vehicle.fuel_tank_capacity}L` : null },
```
Add a new entry directly after it:
```javascript
    { label: 'Tank Capacity',  value: vehicle.fuel_tank_capacity ? `${vehicle.fuel_tank_capacity}L` : null },
    { label: 'Running Cost',   value: vehicle.running_cost_km ? `KES ${Number(vehicle.running_cost_km).toFixed(1)}/km` : null },
```

- [ ] **Step 4: Manual verification**

Run `npm run dev`, open http://localhost:5173/fleet, edit a vehicle, set "Running Cost (KES/km)"
to e.g. `4.5`, save. Expected: the vehicle detail view now shows a "Running Cost" spec of "KES
4.5/km"; re-opening the edit form shows `4.5` still in the field (round-trips through Supabase
correctly — `clean()` already handles the `'' → null` case generically, no code change needed
there).

- [ ] **Step 5: Commit**

```bash
git add src/pages/Fleet.jsx
git commit -m "feat(fleet): add per-vehicle running cost (KES/km) field"
```

---

### Task 9: `src/components/AddressAutocomplete.jsx` — reusable address input

**Files:**
- Create: `src/components/AddressAutocomplete.jsx`

**Interfaces:**
- Consumes: `autocompletePlaces`, `getPlaceDetails` from `../lib/maps/places` (Task 4).
- Produces: `<AddressAutocomplete label placeholder apiKey value={{address,lat,lng}|null}
  onSelect={({address,lat,lng}) => void} />`. Consumed by Task 10 (`RoutePlanner.jsx`), used twice
  (origin, destination).

- [ ] **Step 1: Write the implementation**

```jsx
// src/components/AddressAutocomplete.jsx
import { useEffect, useRef, useState } from 'react'
import { autocompletePlaces, getPlaceDetails } from '../lib/maps/places'

const DEBOUNCE_MS = 300

export default function AddressAutocomplete({ label, placeholder, apiKey, value, onSelect }) {
  const [text, setText] = useState(value?.address || '')
  const [suggestions, setSuggestions] = useState([])
  const [open, setOpen] = useState(false)
  const [error, setError] = useState(null)
  const debounceRef = useRef(null)

  useEffect(() => {
    setText(value?.address || '')
  }, [value?.address])

  const handleChange = (e) => {
    const next = e.target.value
    setText(next)
    setError(null)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!next.trim()) { setSuggestions([]); setOpen(false); return }
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await autocompletePlaces(next, apiKey)
        setSuggestions(results)
        setOpen(results.length > 0)
      } catch (err) {
        setError(err.message)
        setOpen(false)
      }
    }, DEBOUNCE_MS)
  }

  const handlePick = async (suggestion) => {
    setOpen(false)
    setText(suggestion.text)
    try {
      const details = await getPlaceDetails(suggestion.placeId, apiKey)
      onSelect({ address: details.address || suggestion.text, lat: details.lat, lng: details.lng })
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="form-group address-autocomplete">
      <label>{label}</label>
      <input
        value={text}
        onChange={handleChange}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={() => setOpen(suggestions.length > 0)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && (
        <ul className="address-suggestions">
          {suggestions.map(s => (
            // onMouseDown (not onClick) fires before the input's onBlur closes the list
            <li key={s.placeId} onMouseDown={() => handlePick(s)}>{s.text}</li>
          ))}
        </ul>
      )}
      {error && <div className="form-error" style={{ marginTop: 4 }}>{error}</div>}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/AddressAutocomplete.jsx
git commit -m "feat(routes): add reusable AddressAutocomplete component"
```

---

### Task 10: `src/pages/RoutePlanner.jsx` — the Routes page

**Files:**
- Create: `src/pages/RoutePlanner.jsx`

**Interfaces:**
- Consumes: `useVehicle` (`../contexts/VehicleContext`), `useTheme` (`../contexts/ThemeContext`),
  `supabase` (`../lib/supabase`), `num, correctedConsumption` (`../lib/calc/consumption`),
  `fleetRouteCosts` (`../lib/calc/routeCost`, Task 2), `computeRoute` (`../lib/maps/routes`, Task
  5), `loadGoogleMaps` (`../lib/maps/loadGoogleMaps`, Task 6), default export of
  `../components/AddressAutocomplete` (Task 9). Reads `import.meta.env.VITE_GOOGLE_MAPS_API_KEY`
  (Task 7).
- Produces: default export `RoutePlanner`, a page component. Consumed by Task 11 (route
  registration + nav).

- [ ] **Step 1: Write the implementation**

```jsx
// src/pages/RoutePlanner.jsx
import { useEffect, useRef, useState } from 'react'
import { useVehicle } from '../contexts/VehicleContext'
import { useTheme } from '../contexts/ThemeContext'
import { supabase } from '../lib/supabase'
import { num, correctedConsumption } from '../lib/calc/consumption'
import { fleetRouteCosts } from '../lib/calc/routeCost'
import { computeRoute } from '../lib/maps/routes'
import { loadGoogleMaps } from '../lib/maps/loadGoogleMaps'
import AddressAutocomplete from '../components/AddressAutocomplete'

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
const kes = (n) => Math.round(Number(n || 0)).toLocaleString()

export default function RoutePlanner() {
  const { vehicles } = useVehicle()
  const { theme } = useTheme()
  const [fuel, setFuel] = useState([])
  const [savedRoutes, setSavedRoutes] = useState([])
  const [origin, setOrigin] = useState(null)
  const [destination, setDestination] = useState(null)
  const [route, setRoute] = useState(null)
  const [computing, setComputing] = useState(false)
  const [computeError, setComputeError] = useState(null)
  const [saveName, setSaveName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  const mapDivRef = useRef(null)
  const mapObjRef = useRef(null)
  const overlaysRef = useRef([])

  const fetchSavedRoutes = async () => {
    const { data } = await supabase.from('saved_routes').select('*').order('created_at', { ascending: false })
    setSavedRoutes(data || [])
  }

  useEffect(() => {
    supabase.from('fuel_logs')
      .select('vehicle_id, odometer_km, volume_litres, total_cost_kes, price_per_litre_kes, derived_price_per_litre, exclude_from_economy')
      .then(({ data }) => setFuel(data || []))
    fetchSavedRoutes()
  }, [])

  const vehiclesWithConsumption = vehicles.map(v => {
    const fuelDesc = fuel.filter(f => f.vehicle_id === v.id)
      .sort((a, b) => Number(b.odometer_km) - Number(a.odometer_km))
    const rollingL100 = correctedConsumption(fuelDesc, 10)
    const lastFill = fuelDesc[0]
    const pricePerLitre = lastFill ? (num(lastFill.derived_price_per_litre || lastFill.price_per_litre_kes) || null) : null
    return { id: v.id, name: v.name, running_cost_km: v.running_cost_km, rollingL100, pricePerLitre }
  })

  const runCompute = async (o, d) => {
    setComputing(true); setComputeError(null); setRoute(null)
    try {
      const result = await computeRoute(o, d, API_KEY)
      setRoute(result)
    } catch (err) {
      setComputeError(err.message)
    } finally {
      setComputing(false)
    }
  }

  const handleCompute = () => { if (origin && destination) runCompute(origin, destination) }

  const handleLoadSaved = (saved) => {
    const o = { address: saved.origin_address, lat: Number(saved.origin_lat), lng: Number(saved.origin_lng) }
    const d = { address: saved.destination_address, lat: Number(saved.destination_lat), lng: Number(saved.destination_lng) }
    setOrigin(o); setDestination(d)
    runCompute(o, d)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!origin || !destination || !route || !saveName.trim()) return
    setSaving(true); setSaveError(null)
    const { error } = await supabase.from('saved_routes').insert([{
      name: saveName.trim(),
      origin_address: origin.address, origin_lat: origin.lat, origin_lng: origin.lng,
      destination_address: destination.address, destination_lat: destination.lat, destination_lng: destination.lng,
      distance_km: route.distanceKm, duration_min: route.durationMin,
    }])
    if (error) { setSaveError(error.message); setSaving(false); return }
    setSaveName('')
    await fetchSavedRoutes()
    setSaving(false)
  }

  const handleDeleteSaved = async (saved) => {
    await supabase.from('saved_routes').delete().eq('id', saved.id)
    setDeleteConfirm(null)
    await fetchSavedRoutes()
  }

  // Draw/redraw the route on the embedded map whenever the computed route changes, or the
  // theme changes (the polyline color is read live from the --accent custom property, same
  // approach as src/lib/chartTheme.js for Recharts — never a hardcoded hex here).
  useEffect(() => {
    if (!route || !origin || !destination) return
    let cancelled = false
    ;(async () => {
      try {
        const maps = await loadGoogleMaps(API_KEY)
        if (cancelled || !mapDivRef.current) return
        if (!mapObjRef.current) {
          mapObjRef.current = new maps.Map(mapDivRef.current, { zoom: 11, center: { lat: origin.lat, lng: origin.lng } })
        }
        const map = mapObjRef.current
        overlaysRef.current.forEach(o => o.setMap(null))
        const path = maps.geometry.encoding.decodePath(route.encodedPolyline)
        const bounds = new maps.LatLngBounds()
        path.forEach(p => bounds.extend(p))
        const strokeColor = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#c9a84c'
        const polyline = new maps.Polyline({ path, map, strokeColor, strokeWeight: 4 })
        const originMarker = new maps.Marker({ position: { lat: origin.lat, lng: origin.lng }, map, label: 'A' })
        const destMarker = new maps.Marker({ position: { lat: destination.lat, lng: destination.lng }, map, label: 'B' })
        overlaysRef.current = [polyline, originMarker, destMarker]
        map.fitBounds(bounds)
      } catch (err) {
        setComputeError(err.message)
      }
    })()
    return () => { cancelled = true }
  }, [route, origin, destination, theme])

  if (!API_KEY) return (
    <div className="page">
      <div className="page-header"><h2>Routes</h2><p className="page-sub">Plan trips and compare fuel cost per vehicle</p></div>
      <div className="placeholder-card"><span>🗺️</span><p>Google Maps isn't configured yet — add VITE_GOOGLE_MAPS_API_KEY to your .env file.</p></div>
    </div>
  )

  const comparison = route ? fleetRouteCosts(route.distanceKm, vehiclesWithConsumption) : []

  return (
    <div className="page">
      <div className="page-header"><h2>Routes</h2><p className="page-sub">Plan trips and compare fuel cost per vehicle</p></div>

      <div className="card">
        <div className="card-label" style={{ marginBottom: 12 }}>Plan a Route</div>
        <div className="form-row-2">
          <AddressAutocomplete label="From" placeholder="Origin address" apiKey={API_KEY} value={origin} onSelect={setOrigin} />
          <AddressAutocomplete label="To" placeholder="Destination address" apiKey={API_KEY} value={destination} onSelect={setDestination} />
        </div>
        <div className="form-actions" style={{ justifyContent: 'flex-start' }}>
          <button className="btn-primary" style={{ width: 'auto', padding: '10px 28px' }}
            onClick={handleCompute} disabled={!origin || !destination || computing}>
            {computing ? 'Computing…' : 'Compute Route'}
          </button>
        </div>
        {computeError && <div className="form-error">{computeError}</div>}
      </div>

      {route && (
        <div className="route-results">
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div ref={mapDivRef} className="route-map" />
          </div>
          <div className="card">
            <div className="card-label" style={{ marginBottom: 8 }}>
              {route.distanceKm.toFixed(1)} km · {Math.round(route.durationMin)} min
            </div>
            <div className="table-wrapper">
              <table className="data-table">
                <thead><tr><th>Vehicle</th><th>L/100km</th><th>Fuel</th><th>Running</th><th>Total</th></tr></thead>
                <tbody>
                  {comparison.map(c => (
                    <tr key={c.id}>
                      <td className="primary">{c.name}</td>
                      <td className="mono">{vehiclesWithConsumption.find(v => v.id === c.id)?.rollingL100?.toFixed(2) || '—'}</td>
                      <td className="mono">{c.fuelCost != null ? `KES ${kes(c.fuelCost)}` : 'no data'}</td>
                      <td className="mono">{c.runningCost ? `KES ${kes(c.runningCost)}` : '—'}</td>
                      <td className="mono">{c.totalCost != null ? `KES ${kes(c.totalCost)}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <form onSubmit={handleSave} className="form-row-2" style={{ marginTop: 16 }}>
              <div className="form-group">
                <label>Save as</label>
                <input value={saveName} onChange={e => setSaveName(e.target.value)} placeholder="e.g. Home to Office" />
              </div>
              <div className="form-actions" style={{ alignItems: 'flex-end' }}>
                <button type="submit" className="btn-primary" style={{ width: 'auto', padding: '10px 24px' }} disabled={saving || !saveName.trim()}>
                  {saving ? 'Saving…' : 'Save this route'}
                </button>
              </div>
            </form>
            {saveError && <div className="form-error">{saveError}</div>}
          </div>
        </div>
      )}

      <h3 style={{ marginTop: 28, marginBottom: 12 }}>Saved Routes</h3>
      {savedRoutes.length === 0 ? (
        <div className="placeholder-card"><span>🗺️</span><p>No saved routes yet — compute one above and save it.</p></div>
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead><tr><th>Name</th><th>Distance</th><th>Duration</th><th>Cheapest</th><th /></tr></thead>
            <tbody>
              {savedRoutes.map(saved => {
                const cheapest = fleetRouteCosts(Number(saved.distance_km), vehiclesWithConsumption)[0]
                return (
                  <tr key={saved.id} style={{ cursor: 'pointer' }} onClick={() => handleLoadSaved(saved)}>
                    <td className="primary">{saved.name}</td>
                    <td className="mono">{Number(saved.distance_km).toFixed(1)} km</td>
                    <td className="mono">{Math.round(Number(saved.duration_min))} min</td>
                    <td className="mono">{cheapest && cheapest.totalCost != null ? `${cheapest.name} · KES ${kes(cheapest.totalCost)}` : '—'}</td>
                    <td onClick={e => e.stopPropagation()}>
                      {deleteConfirm === saved.id ? (
                        <div className="row-actions">
                          <button className="row-btn row-btn-danger" onClick={() => handleDeleteSaved(saved)}>Confirm</button>
                          <button className="row-btn" onClick={() => setDeleteConfirm(null)}>Cancel</button>
                        </div>
                      ) : <button className="row-btn row-btn-danger" onClick={() => setDeleteConfirm(saved.id)}>Delete</button>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/RoutePlanner.jsx
git commit -m "feat(routes): add RoutePlanner page"
```

---

### Task 11: Wire up navigation and routing

**Files:**
- Modify: `src/App.jsx:20-21` (import + route), `src/components/Layout.jsx:9-25` (NAV_ITEMS)

**Interfaces:**
- Consumes: default export of `../pages/RoutePlanner` (Task 10).
- Produces: `/routes` reachable from both the desktop sidebar and the mobile bottom nav.

- [ ] **Step 1: Register the route in `App.jsx`**

In `src/App.jsx`, change:
```javascript
import Ipc from './pages/Ipc'
```
to:
```javascript
import Ipc from './pages/Ipc'
import RoutePlanner from './pages/RoutePlanner'
```
And change:
```jsx
        <Route path="feedback" element={<Feedback />} />
      </Route>
```
to:
```jsx
        <Route path="feedback" element={<Feedback />} />
        <Route path="routes" element={<RoutePlanner />} />
      </Route>
```

- [ ] **Step 2: Add the nav item in `Layout.jsx`**

In `src/components/Layout.jsx`, change:
```javascript
  { path: '/analysis',    label: 'Analysis',  short: 'Stats',    icon: '📊' },
```
to:
```javascript
  { path: '/analysis',    label: 'Analysis',  short: 'Stats',    icon: '📊' },
  { path: '/routes',      label: 'Routes',    short: 'Routes',   icon: '🗺️' },
```
(No `desktopOnly` flag — it must appear in the mobile bottom nav too, per the design.)

- [ ] **Step 3: Manual verification**

Run `npm run dev`, confirm "Routes" appears in the desktop sidebar and (shrink the browser window
or use dev tools device mode) in the mobile bottom tab bar, and that clicking it navigates to
`/routes` without a console error.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx src/components/Layout.jsx
git commit -m "feat(routes): wire up /routes navigation"
```

---

### Task 12: CSS for the Routes page layout

**Files:**
- Modify: `src/index.css` (append new rules — do not alter any existing selector or breakpoint)

**Interfaces:**
- Consumes: existing custom properties (`--surface`, `--border-strong`, `--text`, `--accent-soft`,
  `--text-strong`).
- Produces: `.route-results`, `.route-map`, `.address-autocomplete`, `.address-suggestions`
  classes used by Task 10 and Task 9.

- [ ] **Step 1: Append the new rules**

Add to the end of `src/index.css`:
```css
/* Routes page — map + fleet comparison split, address autocomplete dropdown */
.route-results {
  display: grid;
  grid-template-columns: minmax(280px, 1fr) minmax(360px, 1.2fr);
  gap: 16px;
  margin-top: 20px;
  align-items: start;
}
@media (max-width: 900px) {
  .route-results { grid-template-columns: 1fr; }
}

.route-map {
  width: 100%;
  height: 320px;
}
@media (max-width: 500px) {
  .route-map { height: 240px; }
}

.address-autocomplete {
  position: relative;
}

.address-suggestions {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 20;
  margin: 2px 0 0;
  padding: 4px 0;
  list-style: none;
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: 4px;
  max-height: 220px;
  overflow-y: auto;
}

.address-suggestions li {
  padding: 8px 12px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text);
}

.address-suggestions li:hover {
  background: var(--accent-soft);
  color: var(--text-strong);
}
```

- [ ] **Step 2: Manual verification**

With the dev server running, open `/routes`, compute a route, confirm the map + comparison table
sit side-by-side above ~900px width and stack vertically below it; type in the From/To fields and
confirm the suggestions dropdown is themed correctly (readable) in both light and light/dark theme
toggle states (use the sidebar theme toggle).

- [ ] **Step 3: Commit**

```bash
git add src/index.css
git commit -m "feat(routes): add Routes page layout CSS"
```

---

### Task 13: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run --no-file-parallelism`
Expected: all tests pass, including the new `routeCost.test.js` (8 tests) and `parse.test.js` (6
tests) — no regressions in the existing suite.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: exits 0, no errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no new warnings/errors beyond the pre-existing app-wide `set-state-in-effect` debt noted
in project memory.

- [ ] **Step 4: Hand-off manual test script for Chris**

Per standing project convention, code is not "done" until Chris verifies it locally. With
`npm run dev` running and `VITE_GOOGLE_MAPS_API_KEY` set (Task 7):

1. Open http://localhost:5173/routes. Expected: "Plan a Route" form with two address fields, no
   console errors.
2. Type a few letters of a real Kenyan address/place into "From". Expected: a dropdown of
   suggestions appears within ~1 second.
3. Pick a suggestion for From, repeat for To, click **Compute Route**. Expected: a map appears
   showing a route line between two markers labeled A and B, and a table listing every vehicle in
   your fleet with L/100km, fuel cost, running cost, and total, cheapest at the top.
4. Toggle dark/light theme (sidebar button) while the map is visible. Expected: the route line
   color updates to match the new theme's accent color without a page reload.
5. Type a name under "Save as" and click **Save this route**. Expected: it appears in the "Saved
   Routes" table below with correct distance/duration and a "Cheapest" column.
6. Click that saved route row. Expected: the addresses reload into the Plan a Route form, the map
   and comparison table recompute (a brief "Computing…" state, then the same result as step 3).
7. Edit a vehicle's fuel price context: go to `/fuel`, add a new fill-up with a noticeably
   different price/litre for one vehicle, save, then return to `/routes` and reload the same saved
   route. Expected: that vehicle's fuel cost in the comparison table changes to reflect the new
   price — proving cost is live, not frozen at save time.
8. Click **Delete** on the saved route, then **Confirm**. Expected: it disappears from the table.
9. On a phone or narrow browser window, confirm "Routes" (🗺️) appears in the bottom tab bar and
   the page is usable (map above the fold, no horizontal scroll).

If any step fails, note which step and the exact error/console message for the next debugging
pass — do not mark this task complete until Chris has run through the script himself.
