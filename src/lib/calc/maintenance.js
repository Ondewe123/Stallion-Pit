// Pure maintenance due/overdue calculations — no React/Supabase deps, so they are
// unit-testable and shared across Maintenance and Dashboard.

export const DUE_SOON_KM = 1000
export const DUE_SOON_DAYS = 30

// Whole days from today (local midnight) until `dateStr` (YYYY-MM-DD). Negative = past.
// `now` is injectable for testing; defaults to the current date.
export function daysUntil(dateStr, now = new Date()) {
  if (!dateStr) return null
  const today = new Date(now); today.setHours(0, 0, 0, 0)
  const d = new Date(dateStr + 'T00:00:00')
  return Math.round((d - today) / 86400000)
}

// Add a (rounded) number of months to a YYYY-MM-DD date, returning YYYY-MM-DD.
// Uses local date components throughout (no UTC round-trip) so the result is
// timezone-independent — the previous toISOString() approach shifted the date a
// day early in positive-offset zones such as GMT+3.
export function addMonths(dateStr, months) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1 + Math.round(Number(months)), d)
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// Evaluate a schedule item against the current odometer.
// Returns { remKm, remDays, status } where status is 'overdue' | 'soon' | 'ok'.
// opts: { dueSoonKm, dueSoonDays, now } — all optional.
export function evaluate(item, currentOdo, opts = {}) {
  const dueSoonKm = opts.dueSoonKm ?? DUE_SOON_KM
  const dueSoonDays = opts.dueSoonDays ?? DUE_SOON_DAYS
  const remKm = item.next_due_odometer != null && currentOdo
    ? Number(item.next_due_odometer) - currentOdo : null
  const remDays = daysUntil(item.next_due_date, opts.now)
  let status = 'ok'
  if ((remKm != null && remKm < 0) || (remDays != null && remDays < 0)) status = 'overdue'
  else if ((remKm != null && remKm <= dueSoonKm) || (remDays != null && remDays <= dueSoonDays)) status = 'soon'
  return { remKm, remDays, status }
}

// Fill in next_due_odometer / next_due_date from last-done + interval when they
// were left blank. Returns a new object; does not mutate the input.
export function computeNextDue(out) {
  const r = { ...out }
  if (r.next_due_odometer == null && r.last_done_odometer != null && r.distance_interval_km != null)
    r.next_due_odometer = Number(r.last_done_odometer) + Number(r.distance_interval_km)
  if (r.next_due_date == null && r.last_done_date != null && r.time_interval_months != null)
    r.next_due_date = addMonths(r.last_done_date, r.time_interval_months)
  return r
}
