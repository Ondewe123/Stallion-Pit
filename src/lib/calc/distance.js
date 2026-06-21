// Pure odometer-distance metrics — no React/Supabase deps, shared by the Dashboard.
// A "reading" is { odometer_km, date } where date is 'YYYY-MM-DD' (lexically sortable).

const MS_PER_DAY = 86400000
const DAYS_PER_MONTH = 30.4375 // 365.25 / 12

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null }

// Normalise + drop incomplete rows, sorted ascending by odometer (== chronological,
// since the odometer is monotonic).
function clean(readings) {
  return (readings || [])
    .map(x => ({ odo: num(x.odometer_km), date: x.date }))
    .filter(x => x.odo != null && x.date)
    .sort((a, b) => a.odo - b.odo)
}

// km covered in the calendar month containing `ref` (default today): the latest odometer
// overall minus the last reading recorded before that month began. Returns null when there
// is no earlier reading to measure against; 0 when nothing was logged this month.
export function kmThisMonth(readings, ref = new Date()) {
  const rs = clean(readings)
  if (!rs.length) return null
  const pad = (n) => String(n).padStart(2, '0')
  const monthStart = `${ref.getFullYear()}-${pad(ref.getMonth() + 1)}-01`
  const before = rs.filter(x => x.date < monthStart)
  if (!before.length) return null
  const latest = rs[rs.length - 1].odo
  const atMonthStart = before[before.length - 1].odo // before is odo-sorted → last = max
  return Math.max(0, latest - atMonthStart)
}

// Average km per month across the recorded history: total distance (max − min odometer)
// divided by the number of months between the first and last reading. Returns null when
// there are fewer than two readings, no time span, or no distance.
export function avgKmPerMonth(readings) {
  const rs = clean(readings)
  if (rs.length < 2) return null
  const span = rs[rs.length - 1].odo - rs[0].odo
  const dates = rs.map(x => x.date).sort()
  const first = new Date(dates[0] + 'T00:00:00')
  const last = new Date(dates[dates.length - 1] + 'T00:00:00')
  const days = (last - first) / MS_PER_DAY
  if (days <= 0 || span <= 0) return null
  return span / (days / DAYS_PER_MONTH)
}
