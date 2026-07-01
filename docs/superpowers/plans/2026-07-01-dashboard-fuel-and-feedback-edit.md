# Dashboard Per-Car Fuel + Editable Feedback — Spec & Plan

**Date:** 2026-07-01
**Status:** Approved for implementation
**Source:** feedback reports #2 (`bf9649db`, `/`) and #4 (`064a9d4f`, `/feedback`).

**Concurrency:** stage only these paths; never `git add -A`. Tests: `npx vitest run --no-file-parallelism`.
TLS: prefix `NODE_OPTIONS=--use-system-ca` if a node cmd hits `UNABLE_TO_VERIFY_LEAF_SIGNATURE`.
No migration needed (uses existing columns).

---

## Feature A — Dashboard per-car fuel used (#2)

**Decisions:** metric = **litres + KES**; "last month" = **previous calendar month** + this-month-to-date;
layout = **per-car table on dashboard**, all-cars total **moves to Analysis**. The exclude-from-economy
flag is NOT applied here (fuel used = actual fuel bought).

### A1 — Pure module `src/lib/calc/fuelUsage.js` (+ `fuelUsage.test.js`)

```js
import { num } from './consumption'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const pad = (n) => String(n).padStart(2, '0')
const ymd = (y, m0, d) => `${y}-${pad(m0 + 1)}-${pad(d)}`

// Period boundaries (local) from a reference Date. Previous full calendar month =
// [lastMonthStart, thisMonthStart); month-to-date = [thisMonthStart, ...).
export function fuelPeriods(today) {
  const y = today.getFullYear(), m = today.getMonth()
  const py = m === 0 ? y - 1 : y
  const pm = m === 0 ? 11 : m - 1
  return {
    thisMonthStart: ymd(y, m, 1),
    lastMonthStart: ymd(py, pm, 1),
    lastMonthLabel: MONTHS[pm],
    thisMonthLabel: MONTHS[m],
  }
}

// Sum litres + KES over fuel rows whose logged_at is in [from, toExcl) (toExcl null = open-ended).
function sumFuel(rows, from, toExcl) {
  let litres = 0, kes = 0
  for (const r of rows || []) {
    const d = r.logged_at
    if (!d || d < from) continue
    if (toExcl && d >= toExcl) continue
    litres += num(r.volume_litres); kes += num(r.total_cost_kes)
  }
  return { litres, kes }
}

// Per-vehicle fuel used for the previous calendar month and month-to-date.
export function fuelUsedByVehicle(fuel, vehicles, today) {
  const { lastMonthStart, thisMonthStart } = fuelPeriods(today)
  return (vehicles || []).map(v => {
    const rows = (fuel || []).filter(f => f.vehicle_id === v.id)
    return {
      id: v.id, name: v.name,
      lastMonth: sumFuel(rows, lastMonthStart, thisMonthStart),
      thisMonth: sumFuel(rows, thisMonthStart, null),
    }
  })
}

// All-vehicles fuel used (for the Analysis page).
export function fuelUsedTotals(fuel, today) {
  const { lastMonthStart, thisMonthStart } = fuelPeriods(today)
  return {
    lastMonth: sumFuel(fuel, lastMonthStart, thisMonthStart),
    thisMonth: sumFuel(fuel, thisMonthStart, null),
  }
}
```

**Tests:** `fuelPeriods` for mid-year (July→Jun/Jul labels, boundaries) and January wrap (→ Dec of
prior year); `fuelUsedByVehicle` groups per vehicle and splits last-month vs MTD on the boundary
(a fill on `thisMonthStart` counts as MTD, one on the last day of prev month counts as last-month);
`fuelUsedTotals` sums across vehicles. Inject `today = new Date(2026, 6, 15)`.

### A2 — `src/pages/Dashboard.jsx`
- Import `{ fuelUsedByVehicle, fuelPeriods }`.
- **Remove** the fleet-strip **Fuel · MTD** tile and its `fleetFuelMtd`/`fleetFuel30` computation (they
  become the all-cars total that now lives on Analysis). Fleet strip becomes Vehicles / Open Snags /
  Overdue Maint.
- After the fleet strip, add a **"Fuel used · per car"** table: one row per vehicle, columns
  **Last month (label)** and **This month (label)**, each cell `NN.N L · KES n,nnn`. Compute with
  `fuelUsedByVehicle(data.fuel, vehicles, new Date())` + `fuelPeriods(new Date())` for the labels.

### A3 — `src/pages/Analysis.jsx`
- Import `{ fuelUsedTotals, fuelPeriods }`.
- Add a 4th query to the `Promise.all`: `supabase.from('fuel_logs').select('logged_at, volume_litres, total_cost_kes')`
  (no vehicle filter → RLS returns all owner rows) → `raw.allFuel`.
- In the main return (after the header), add a **"Fleet fuel used · all vehicles"** two-`Stat` block:
  Last month + This month, litres headline + `KES …` sub, from `fuelUsedTotals(raw.allFuel, new Date())`.

---

## Feature B — Editable feedback items (#4)

**Decision:** edit **comment + type**, plus **delete**. Status advance stays.

### B1 — `src/lib/feedback/reports.js` (+ tests in `reports.test.js`)

```js
export async function updateReport(id, { comment, type }, client = supabase) {
  const patch = {}
  if (comment !== undefined) patch.comment = comment || null
  if (type !== undefined) patch.type = type
  const { error } = await client.from('feedback_reports').update(patch).eq('id', id)
  return { error: error ? error.message : null }
}

export async function deleteReport(id, screenshotPath = null, client = supabase) {
  if (screenshotPath) await client.storage.from(BUCKET).remove([screenshotPath])
  const { error } = await client.from('feedback_reports').delete().eq('id', id)
  return { error: error ? error.message : null }
}
```

**Tests (stub client, matching existing style):** `updateReport` sends `{comment,type}` patch to
`feedback_reports` with `.eq('id', id)`; `deleteReport` removes the screenshot path then deletes the
row; `deleteReport` with null path skips storage.

### B2 — `src/pages/Feedback.jsx`
- Import `updateReport, deleteReport`. Add state: `editingId`, `editForm {comment,type}`,
  `deleteConfirm`, `saving`.
- Actions cell per row: `Edit` · existing `Start/Resolve` · `Delete` (all `stopPropagation`). Delete
  shows inline `Confirm`/`Cancel` (fuel-log pattern).
- When `editingId === r.id`, render an edit sub-row (`colSpan={5}`) with a **type** select
  (bug/error/idea) + **comment** textarea + Save/Cancel. Save → `updateReport` → refetch; Cancel clears.
- Delete → `deleteReport(r.id, r.screenshot_path)` → refetch.

---

## Work order & commits
1. A1 `fuelUsage.js` + tests → `feat(dash): fuelUsage calc (per-car + fleet, last-month/MTD)`
2. A2 Dashboard per-car table + drop fleet fuel tile → `feat(dash): per-car fuel-used table; move all-cars total off dashboard`
3. A3 Analysis fleet fuel block → `feat(analysis): fleet fuel-used (all vehicles, last month + MTD)`
4. B1 `reports.js` updateReport/deleteReport + tests → `feat(feedback): updateReport + deleteReport`
5. B2 Feedback.jsx edit/delete UI → `feat(feedback): edit comment/type + delete reports`
6. Full build + `vitest run --no-file-parallelism`; verify dev server boots.

## Success criteria
- [ ] Dashboard shows a per-car fuel-used table (litres + KES) for previous month + MTD; no all-cars total on dashboard.
- [ ] Analysis shows the all-cars fleet fuel-used (last month + MTD).
- [ ] Feedback rows can edit comment + type and delete (with confirm); junk test rows removable.
- [ ] New unit tests pass; full suite + build green; no new lint beyond known debt.
