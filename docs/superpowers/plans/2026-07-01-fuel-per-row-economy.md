# Fuel Per-Row Economy & Robustness — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Fuel Log accurate per-fill economy columns, make per-row distance always correct after deletes/edits (kill the stale `km_since_last` bug), and let the user exclude idle-gap / bad-data fills from all economy math.

**Architecture:** Move per-row distance & consumption out of the fragile DB trigger and into pure, tested functions in `src/lib/calc/consumption.js`, computed fresh from the sorted logs on every render. A new `exclude_from_economy` boolean acts as a "chain break": no economy window or brim-to-brim segment ever spans across a flagged fill.

**Tech Stack:** React 19 + Vite, Supabase (Postgres), Vitest. Pure JS calc module (no React/Supabase deps).

## Global Constraints

- **Concurrency:** never `git add -A`; stage only this change's explicit paths. Several Antigravity sessions share the working copy.
- **Migration number:** `0015` (0014 is the latest).
- **Tests run OOM-safe:** `npx vitest run --no-file-parallelism` (plain `npm test` can OOM under concurrent-session load).
- **TLS:** if a node/npm command fails with `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, prefix `NODE_OPTIONS=--use-system-ca`.
- **`logged_at`** is a Postgres `date` → arrives as `'YYYY-MM-DD'`; date math must be timezone-safe.
- **`correctedConsumption` input stays newest-first** (descending odometer) — callers already pass that; do NOT sort inside it (a negative-progression guard depends on order).
- **Lint:** the app-wide `react-hooks/set-state-in-effect` warnings are pre-existing debt; don't add new patterns, don't fix the old ones here.

---

### Task 1: DB migration — `exclude_from_economy` column

**Files:**
- Create: `supabase/migrations/0015_fuel_exclude_from_economy.sql`
- Apply: live via Supabase MCP `apply_migration` (project `mwakgpzcqoalxtvqucki`)

- [ ] **Step 1: Write the migration file**

```sql
-- 0015_fuel_exclude_from_economy.sql
-- Manual anomaly / chain-break flag for fuel economy (feedback #5, and neutralises bad-data rows).
-- Additive; RLS unchanged (owner-scoped via 0005). Existing rows default to included.
alter table public.fuel_logs
  add column if not exists exclude_from_economy boolean not null default false;
```

- [ ] **Step 2: Apply live** via MCP `apply_migration` with name `fuel_exclude_from_economy` and the SQL above.

- [ ] **Step 3: Verify** with MCP `execute_sql`:

```sql
select column_name, data_type, column_default
from information_schema.columns
where table_name = 'fuel_logs' and column_name = 'exclude_from_economy';
```
Expected: one row, `boolean`, default `false`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0015_fuel_exclude_from_economy.sql
git commit -m "feat(fuel): migration 0015 — exclude_from_economy flag"
```

---

### Task 2: `segments()` + `daysBetween()` helpers (pure)

**Files:**
- Modify: `src/lib/calc/consumption.js`
- Test: `src/lib/calc/consumption.test.js`

**Interfaces:**
- Produces: `segments(logs) → Array<Array<log>>` — groups consecutive non-excluded fills, dropping any `exclude_from_economy` fill (order preserved, works on asc or desc input). `GAP_HINT_DAYS` constant (= 180).

- [ ] **Step 1: Write the failing tests** (append to `consumption.test.js`)

```js
import { num, correctedConsumption, fillRangeKm, rolling, segments, withDerived, GAP_HINT_DAYS } from './consumption'

describe('segments', () => {
  it('groups consecutive non-excluded fills, dropping excluded ones', () => {
    const rows = [
      { odometer_km: 1000 }, { odometer_km: 1100 },
      { odometer_km: 1200, exclude_from_economy: true },
      { odometer_km: 1300 }, { odometer_km: 1400 },
    ]
    const runs = segments(rows)
    expect(runs).toHaveLength(2)
    expect(runs[0].map(r => r.odometer_km)).toEqual([1000, 1100])
    expect(runs[1].map(r => r.odometer_km)).toEqual([1300, 1400])
  })
  it('returns [] for empty/null input', () => {
    expect(segments([])).toEqual([])
    expect(segments(null)).toEqual([])
  })
  it('exposes GAP_HINT_DAYS', () => { expect(GAP_HINT_DAYS).toBe(180) })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/calc/consumption.test.js --no-file-parallelism`
Expected: FAIL — `segments`/`withDerived`/`GAP_HINT_DAYS` not exported.

- [ ] **Step 3: Implement** — add to top of `consumption.js` (after `num`):

```js
// Days a row's gap hint turns amber (nudge the user to consider excluding an idle gap).
export const GAP_HINT_DAYS = 180

const DAY_MS = 86400000
// Whole calendar days between two 'YYYY-MM-DD' dates (timezone-safe). null if unparseable.
function daysBetween(fromISO, toISO) {
  if (!fromISO || !toISO) return null
  const a = Date.parse(String(fromISO).slice(0, 10) + 'T00:00:00Z')
  const b = Date.parse(String(toISO).slice(0, 10) + 'T00:00:00Z')
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  return Math.round((b - a) / DAY_MS)
}

// Split logs into runs of consecutive NON-excluded fills. A fill flagged
// exclude_from_economy breaks the chain and is omitted from every run — so no economy
// window or brim-to-brim segment ever spans across it (idle gaps / bad data).
export function segments(logs) {
  const runs = []
  let cur = []
  for (const l of logs || []) {
    if (l.exclude_from_economy) { if (cur.length) runs.push(cur); cur = []; continue }
    cur.push(l)
  }
  if (cur.length) runs.push(cur)
  return runs
}
```

- [ ] **Step 4: Run to verify segments tests pass** (withDerived tests still fail — expected until Task 3)

Run: `npx vitest run src/lib/calc/consumption.test.js -t segments --no-file-parallelism`
Expected: PASS (the `segments` + `GAP_HINT_DAYS` cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/calc/consumption.js src/lib/calc/consumption.test.js
git commit -m "feat(fuel): segments() + daysBetween() + GAP_HINT_DAYS helpers"
```

---

### Task 3: `withDerived()` — per-row distance/days/economy (pure)

**Files:**
- Modify: `src/lib/calc/consumption.js`
- Test: `src/lib/calc/consumption.test.js`

**Interfaces:**
- Consumes: `segments`, `num`, `daysBetween` (Task 2).
- Produces: `withDerived(logsAsc) → Array<{...log, kmSince, daysSince, excluded, perFillL100, segmentL100}>`. Input MUST be sorted ascending by odometer. `kmSince`/`daysSince` are factual deltas from the immediately-preceding fill (independent of the flag). `perFillL100` = litres/kmSince×100, null at a run boundary (first fill, prev fill excluded), or non-positive km/vol. `segmentL100` = brim-to-brim, only on full-tank rows (`is_partial === false`), null otherwise. Excluded fills get null economy.

- [ ] **Step 1: Write the failing tests** (append to `consumption.test.js`)

```js
describe('withDerived', () => {
  const F = (odo, vol, opts = {}) => ({ id: `k${odo}`, odometer_km: odo, volume_litres: vol, logged_at: '2026-01-01', is_partial: true, ...opts })

  it('computes factual kmSince from consecutive fills (delete-safe)', () => {
    const asc = [F(1000, 5), F(1100, 5), F(1250, 5)]
    const d = withDerived(asc)
    expect(d[0].kmSince).toBeNull()
    expect(d[1].kmSince).toBe(100)
    expect(d[2].kmSince).toBe(150)
    // delete the middle row → neighbour recomputes against what remains
    const d2 = withDerived([asc[0], asc[2]])
    expect(d2[1].kmSince).toBe(250)
  })

  it('brim-to-brim segment sums partials since the previous full tank and excludes that tank\'s own volume', () => {
    const asc = [
      F(1000, 40, { is_partial: false }), // starting brim (its 40L belongs to the prior segment)
      F(1200, 10),                        // partial in between
      F(1400, 30, { is_partial: false }), // closing brim
    ]
    const d = withDerived(asc)
    expect(d[0].segmentL100).toBeNull()          // first full tank in run
    expect(d[1].segmentL100).toBeNull()          // partials never carry a segment value
    // (10 + 30) L over (1400-1000)=400 km => 10 L/100km
    expect(d[2].segmentL100).toBeCloseTo(10, 6)
  })

  it('per-fill is null at a run boundary and after an excluded fill', () => {
    const asc = [
      F(1000, 5), F(1100, 10),
      F(1200, 99, { exclude_from_economy: true }),
      F(1300, 10),
    ]
    const d = withDerived(asc)
    expect(d[0].perFillL100).toBeNull()          // first in run
    expect(d[1].perFillL100).toBeCloseTo(10, 6)  // 10L / 100km
    expect(d[2].excluded).toBe(true)
    expect(d[2].perFillL100).toBeNull()          // excluded fill
    expect(d[3].perFillL100).toBeNull()          // first fill after a break
  })

  it('computes daysSince across a long gap', () => {
    const asc = [
      { id: 'a', odometer_km: 1000, volume_litres: 5, logged_at: '2025-01-01', is_partial: true },
      { id: 'b', odometer_km: 1100, volume_litres: 5, logged_at: '2025-08-01', is_partial: true },
    ]
    const d = withDerived(asc)
    expect(d[1].daysSince).toBe(212)
    expect(d[1].daysSince).toBeGreaterThan(GAP_HINT_DAYS)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/calc/consumption.test.js -t withDerived --no-file-parallelism`
Expected: FAIL — `withDerived` not a function.

- [ ] **Step 3: Implement** — add to `consumption.js`:

```js
// Annotate each fill (input sorted ASCENDING by odometer) with derived, always-fresh
// per-row values. kmSince/daysSince are factual deltas regardless of the exclude flag;
// economy values (perFill / segment) respect chain breaks.
export function withDerived(logsAsc) {
  const rows = logsAsc || []
  let prevFullOdo = null   // odometer of the last full tank in the current run
  let accVol = 0           // volume added since prevFullOdo (excl. that tank's own fill)
  return rows.map((l, i) => {
    const prev = i > 0 ? rows[i - 1] : null
    const kmSince = prev ? num(l.odometer_km) - num(prev.odometer_km) : null
    const daysSince = prev ? daysBetween(prev.logged_at, l.logged_at) : null
    const excluded = !!l.exclude_from_economy

    if (excluded) {                       // chain break: reset accumulator, no economy
      prevFullOdo = null; accVol = 0
      return { ...l, kmSince, daysSince, excluded, perFillL100: null, segmentL100: null }
    }

    const brokenBehind = !prev || !!prev.exclude_from_economy
    const vol = num(l.volume_litres)
    const perFillL100 = (!brokenBehind && kmSince > 0 && vol > 0) ? (vol / kmSince) * 100 : null

    accVol += vol
    let segmentL100 = null
    if (l.is_partial === false) {         // full tank closes a brim-to-brim segment
      if (prevFullOdo != null) {
        const dist = num(l.odometer_km) - prevFullOdo
        if (dist > 0 && accVol > 0) segmentL100 = (accVol / dist) * 100
      }
      prevFullOdo = num(l.odometer_km); accVol = 0
    }
    return { ...l, kmSince, daysSince, excluded, perFillL100, segmentL100 }
  })
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/calc/consumption.test.js -t withDerived --no-file-parallelism`
Expected: PASS (all 4 withDerived cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/calc/consumption.js src/lib/calc/consumption.test.js
git commit -m "feat(fuel): withDerived() per-row distance/days/economy"
```

---

### Task 4: Make `correctedConsumption` + `rolling` break-aware

**Files:**
- Modify: `src/lib/calc/consumption.js` (rewrite `correctedConsumption`; edit `rolling`)
- Test: `src/lib/calc/consumption.test.js`

**Interfaces:**
- `correctedConsumption(logsNewestFirst, windowSize)` unchanged signature; now splits the window into runs at excluded fills and sums per-run volume over per-run distance (never counts gap distance). Same result as before when nothing is excluded.
- `rolling(fuelAsc, K, valueFn)` unchanged signature; now skips any K-window that contains an excluded fill.

- [ ] **Step 1: Write the failing tests** (append to `consumption.test.js`)

```js
describe('break-awareness', () => {
  const L = (odo, vol, opts = {}) => ({ odometer_km: odo, volume_litres: vol, total_cost_kes: 0, logged_at: '2026-01-01', ...opts })

  it('correctedConsumption excludes the flagged segment and its gap distance', () => {
    // newest-first; X is an excluded bad/gap fill splitting the window into two runs
    const logs = [
      L(1300, 10), L(1200, 10),
      L(1150, 99, { exclude_from_economy: true }),
      L(1000, 5), L(900, 5),
    ]
    // run1: (1300-1200)=100km, 20L ; run2: (1000-900)=100km, 10L => 30L / 200km => 15
    expect(correctedConsumption(logs, 5)).toBeCloseTo(15, 6)
  })

  it('rolling skips windows straddling an excluded fill', () => {
    const asc = [
      L(1000, 0), L(1100, 10),
      L(1200, 99, { exclude_from_economy: true }),
      L(1300, 10), L(1400, 10),
    ]
    const pts = rolling(asc, 1, (dist, vol) => (vol / dist) * 100)
    expect(pts).toHaveLength(2) // i=1 ok, i=2 & i=3 straddle X, i=4 ok
    expect(pts[0].value).toBeCloseTo(10, 6)
    expect(pts[1].value).toBeCloseTo(10, 6)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/calc/consumption.test.js -t break-awareness --no-file-parallelism`
Expected: FAIL — current `correctedConsumption` counts gap distance (≈ different value), `rolling` emits 4 points.

- [ ] **Step 3: Implement** — replace `correctedConsumption` body and edit `rolling`:

```js
// Corrected L/100km over the newest `windowSize` fills. Break-aware: splits the window
// into runs at excluded fills and sums each run's volume over its own distance, so an
// excluded fill's volume AND the distance across it are never counted. `logs` newest-first.
export function correctedConsumption(logs, windowSize) {
  if (!logs || logs.length < 2) return null
  const window = logs.slice(0, windowSize)
  let totalVolume = 0, totalKm = 0
  for (const run of segments(window)) {          // runs preserve newest-first order
    if (run.length < 2) continue
    const km = num(run[0].odometer_km) - num(run[run.length - 1].odometer_km)
    if (km <= 0) continue
    let vol = 0
    for (const l of run) vol += num(l.volume_litres)
    totalVolume += vol; totalKm += km
  }
  if (totalKm <= 0 || totalVolume <= 0) return null
  return (totalVolume / totalKm) * 100
}
```

In `rolling`, add a break check at the top of the loop body (before computing `dist`):

```js
export function rolling(fuelAsc, K, valueFn) {
  const pts = []
  for (let i = K; i < fuelAsc.length; i++) {
    let broken = false
    for (let j = i - K; j <= i; j++) { if (fuelAsc[j].exclude_from_economy) { broken = true; break } }
    if (broken) continue
    const dist = num(fuelAsc[i].odometer_km) - num(fuelAsc[i - K].odometer_km)
    let vol = 0, cost = 0
    for (let j = i - K + 1; j <= i; j++) { vol += num(fuelAsc[j].volume_litres); cost += num(fuelAsc[j].total_cost_kes) }
    if (dist > 0) { const v = valueFn(dist, vol, cost); if (v != null) pts.push({ date: fuelAsc[i].logged_at, value: v }) }
  }
  return pts
}
```

- [ ] **Step 4: Run the FULL calc suite (old + new must all pass)**

Run: `npx vitest run src/lib/calc/consumption.test.js --no-file-parallelism`
Expected: PASS — all cases, including the pre-existing `correctedConsumption`/`rolling` ones.

- [ ] **Step 5: Commit**

```bash
git add src/lib/calc/consumption.js src/lib/calc/consumption.test.js
git commit -m "feat(fuel): break-aware correctedConsumption + rolling"
```

---

### Task 5: `cleanFuelLog` passes `exclude_from_economy` through

**Files:**
- Test: `src/lib/fuelForm.test.js` (add a case; no code change expected — it's not DB-managed)

**Interfaces:**
- Consumes: `cleanFuelLog(form, vehicleId)` — already strips only `DB_MANAGED`; a plain boolean passes through.

- [ ] **Step 1: Write the test** (append to `fuelForm.test.js`)

```js
  it('keeps exclude_from_economy (a normal editable column) in the payload', () => {
    const out = cleanFuelLog({ odometer_km: 100, exclude_from_economy: true }, 'veh-1')
    expect(out.exclude_from_economy).toBe(true)
    expect(out.vehicle_id).toBe('veh-1')
  })
```

- [ ] **Step 2: Run**

Run: `npx vitest run src/lib/fuelForm.test.js --no-file-parallelism`
Expected: PASS (confirms the flag is not stripped). If it fails, DO NOT add it to `DB_MANAGED`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/fuelForm.test.js
git commit -m "test(fuel): exclude_from_economy survives cleanFuelLog"
```

---

### Task 6: Fuel Log UI — columns, gap hint, excluded styling, form toggle

**Files:**
- Modify: `src/pages/FuelLog.jsx`

**Interfaces:**
- Consumes: `withDerived`, `GAP_HINT_DAYS`, `num` from `../lib/calc/consumption`.

- [ ] **Step 1: Update the import** (line 7)

```jsx
import { correctedConsumption, rolling, num, withDerived, GAP_HINT_DAYS } from '../lib/calc/consumption'
```

- [ ] **Step 2: Add the form default** — in `EMPTY_FORM` (after `notes: '',`) add:

```jsx
  exclude_from_economy: false,
```

- [ ] **Step 3: Add the form toggle** — in `FuelForm`, right after the Fill Type / Driving Mode `form-row-2` block (the one ending near line 243), insert:

```jsx
      <div className="form-group">
        <label>Economy calculation</label>
        <div className="toggle-group">
          <button type="button"
            className={`toggle-btn ${!form.exclude_from_economy ? 'toggle-btn-active' : ''}`}
            onClick={() => set('exclude_from_economy', false)}>Include</button>
          <button type="button"
            className={`toggle-btn ${form.exclude_from_economy ? 'toggle-btn-active' : ''}`}
            onClick={() => set('exclude_from_economy', true)}>Exclude (gap / bad data)</button>
        </div>
        <div className="card-sub" style={{ marginTop: 6 }}>
          Excluded fills break the economy chain — skipped in per-row, badge, trend and analysis.
        </div>
      </div>
```

- [ ] **Step 4: Build the derived lookup** — in `FuelLog`, after `const lastOdometer = logs[0]?.odometer_km || null` (line 376) add:

```jsx
  const derivedById = new Map(
    withDerived([...logs].sort((a, b) => num(a.odometer_km) - num(b.odometer_km))).map(d => [d.id, d])
  )
  const latest = logs[0] ? derivedById.get(logs[0].id) : null
```

- [ ] **Step 5: Fix the "Current Odometer" card sub** — replace the `km_since_last` line (≈ line 455):

```jsx
              {latest?.kmSince ? `+${Number(latest.kmSince).toLocaleString()} km since last fill` : 'First entry'}
```

- [ ] **Step 6: Add the two header cells** — in the `<thead>` row, replace `<th>Volume (L)</th>` with:

```jsx
                <th>Volume (L)</th>
                <th>Per-fill</th>
                <th>Seg</th>
```

- [ ] **Step 7: Update the table body row** — replace the `logs.map(log => ( ... ))` row markup so it uses the derived record, adds the two cells, the gap hint, and excluded dimming. Replace the whole `<tr key={log.id}> ... </tr>` block with:

```jsx
              {logs.map(log => {
                const d = derivedById.get(log.id) || {}
                return (
                <tr key={log.id} style={d.excluded ? { opacity: 0.5 } : undefined}>
                  <td className="mono">{log.logged_at}</td>
                  <td className="mono primary">{Number(log.odometer_km).toLocaleString()}</td>
                  <td className="mono">
                    {d.kmSince != null ? `+${Number(d.kmSince).toLocaleString()}` : '—'}
                    {d.daysSince != null && d.daysSince > GAP_HINT_DAYS && (
                      <span style={{ color: '#e0a030', fontSize: 11 }}> · {d.daysSince}d ⚠</span>
                    )}
                  </td>
                  <td className="mono">{Number(log.volume_litres).toFixed(3)}</td>
                  <td className="mono">{d.perFillL100 != null ? `${d.perFillL100.toFixed(1)}${log.is_partial ? '~' : ''}` : '—'}</td>
                  <td className="mono">{d.segmentL100 != null ? d.segmentL100.toFixed(1) : '—'}</td>
                  <td className="mono">{Number(log.total_cost_kes).toLocaleString()}</td>
                  <td className="mono">{log.derived_price_per_litre ? Number(log.derived_price_per_litre).toFixed(2) : '—'}</td>
                  <td>
                    <span className={`badge ${log.is_partial ? 'badge-amber' : 'badge-green'}`}>
                      {log.is_partial ? 'Partial' : 'Full'}
                    </span>
                    {d.excluded && <span className="badge" style={{ marginLeft: 4 }}>excluded</span>}
                  </td>
                  <td style={{ color: 'var(--text-dim)', fontSize: 12 }}>{log.station || '—'}</td>
                  <td style={{ color: 'var(--text-dim)', fontSize: 12 }}>{log.driving_mode || '—'}</td>
                  <td>
                    <div className="row-actions">
                      <button className="row-btn" onClick={() => { setSelected(log); setView('edit') }}>Edit</button>
                      {deleteConfirm === log.id ? (
                        <>
                          <button className="row-btn row-btn-danger" onClick={() => handleDelete(log.id)}>Confirm</button>
                          <button className="row-btn" onClick={() => setDeleteConfirm(null)}>Cancel</button>
                        </>
                      ) : (
                        <button className="row-btn row-btn-danger" onClick={() => setDeleteConfirm(log.id)}>Delete</button>
                      )}
                    </div>
                  </td>
                </tr>
                )
              })}
```

Note: `<td>KES/L</td>` header count now = 11 columns (Date, Odometer, Km Since, Volume, Per-fill, Seg, Total, KES/L, Type, Station, Mode, actions). Confirm the header keeps `Total (KES)` / `KES/L` after the new two.

- [ ] **Step 8: Verify build + lint**

Run: `NODE_OPTIONS=--use-system-ca npx vite build`
Expected: build succeeds. Then `npx eslint src/pages/FuelLog.jsx` — no NEW errors beyond the known set-state-in-effect pattern.

- [ ] **Step 9: Manual smoke (dev server on :5173)** — start `NODE_OPTIONS=--use-system-ca npm run dev`, open `/fuel`:
  - Delete a **mid-list** fill → the row below it shows a recomputed "Km Since" (no stale value) — **fixes #3**.
  - A full-tank row shows a **Seg** value; a partial shows **Per-fill** with `~` and `—` for Seg — **#1**.
  - Edit a fill → toggle **Exclude** → save → row dims + "excluded" chip, and the Corrected badge / trend change — **#5**.

- [ ] **Step 10: Commit**

```bash
git add src/pages/FuelLog.jsx
git commit -m "feat(fuel): per-row Per-fill & Seg columns, gap hint, exclude toggle, derived Km Since"
```

---

### Task 7: Verify Analysis + Dashboard inherit break-awareness

**Files:**
- Inspect (modify only if needed): `src/pages/Analysis.jsx`, `src/pages/Dashboard.jsx`

**Interfaces:**
- Both already call `rolling` / `correctedConsumption`, now break-aware. They must pass fuel rows that carry `exclude_from_economy`.

- [ ] **Step 1: Confirm both fetch the flag** — grep each page's fuel `select(...)`. If it's `select('*')`, the flag arrives automatically (no change). If it lists explicit columns, add `exclude_from_economy` to the list.

Run: `rg "from\('fuel_logs'\)" -A2 src/pages/Analysis.jsx src/pages/Dashboard.jsx`
Expected: identify each select. Edit only if columns are explicit.

- [ ] **Step 2: Sanity-check ordering for `correctedConsumption`** — Dashboard must pass fuel **newest-first** (descending odometer) to `correctedConsumption`. Confirm its query `.order('odometer_km', { ascending: false })` (or equivalent). If ascending, it was already relying on the old un-sorted behaviour — fix the order or reverse before the call.

- [ ] **Step 3: Build + full test suite**

Run: `NODE_OPTIONS=--use-system-ca npx vite build && npx vitest run --no-file-parallelism`
Expected: build clean; all tests green.

- [ ] **Step 4: Commit (only if a file changed)**

```bash
git add src/pages/Analysis.jsx src/pages/Dashboard.jsx
git commit -m "fix(fuel): ensure Analysis/Dashboard feed exclude flag to break-aware calcs"
```

---

## Self-Review

**Spec coverage:**
- #3 stale Km Since → Task 3 (`withDerived.kmSince`, delete-safe test) + Task 6 (UI reads derived). ✓
- #1 per-row L/100km + partial accuracy → Task 3 (`perFillL100`/`segmentL100`) + Task 6 (two columns, `~`). ✓
- #5 long-gap math → Task 1 (column) + Task 4 (break-aware calcs) + Task 6 (toggle + gap hint) + Task 7 (propagate). ✓
- Legacy `km_since_last` left in place, UI stops reading it → Task 6 removes both reads (row cell + card). ✓
- Consistent exclusion across FuelLog/Analysis/Dashboard → Task 4 (shared helpers) + Task 7 (verify). ✓

**Placeholder scan:** none — every step has concrete code/commands.

**Type consistency:** `segments`, `withDerived`, `GAP_HINT_DAYS`, `daysBetween`, fields `kmSince/daysSince/excluded/perFillL100/segmentL100` used identically across Tasks 2–6. `correctedConsumption`/`rolling` signatures unchanged. ✓
