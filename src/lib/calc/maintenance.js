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

const STATUS_RANK = { overdue: 0, soon: 1, ok: 2 }

// Comparator for *evaluated* items (those carrying { status, remKm, remDays, priority }):
// overdue first, then due-soon, then by priority (1→4), then by smallest remaining km/days.
// Surfaces safety-critical, soonest work at the top.
export function byPriorityThenUrgency(a, b) {
  const sr = (STATUS_RANK[a.status] ?? 3) - (STATUS_RANK[b.status] ?? 3)
  if (sr) return sr
  const pa = a.priority ?? 3, pb = b.priority ?? 3
  if (pa !== pb) return pa - pb
  const ka = a.remKm ?? Infinity, kb = b.remKm ?? Infinity
  if (ka !== kb) return ka - kb
  return (a.remDays ?? Infinity) - (b.remDays ?? Infinity)
}

// A single comparable "urgency" for an *evaluated* item: how much headroom remains on
// the binding axis, measured in due-soon windows. Each axis is normalised by its own
// soon-window (km by DUE_SOON_KM, days by DUE_SOON_DAYS) so km- and date-based items
// share one scale; the smaller (sooner) axis binds. Negative = overdue, <=1 = due-soon,
// >1 = ok — mirroring evaluate()'s bands. Infinity when nothing is scheduled (sorts last).
export function urgency(item) {
  const u = []
  if (item.remKm != null) u.push(Number(item.remKm) / DUE_SOON_KM)
  if (item.remDays != null) u.push(Number(item.remDays) / DUE_SOON_DAYS)
  return u.length ? Math.min(...u) : Infinity
}

// Comparator for *evaluated* items: most-due first (overdue → soon → ok → unscheduled),
// with the binding axis (km or date) honoured equally. priority (1→4) only breaks ties
// between items that are equally due. This is the "sort by the most due thing" ordering.
export function byUrgency(a, b) {
  const d = urgency(a) - urgency(b)
  if (d) return d
  return (a.priority ?? 3) - (b.priority ?? 3)
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
