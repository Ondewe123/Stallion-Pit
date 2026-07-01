// Fuel-used aggregation for the Dashboard (per car) and Analysis (all cars).
// Pure — no React/Supabase deps. "Fuel used" = actual fuel bought, so the
// exclude_from_economy flag is intentionally NOT applied here.
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
