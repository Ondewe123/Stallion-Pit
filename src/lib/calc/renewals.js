// Pure vehicle document-renewal helpers — no React/Supabase deps, so they are unit-testable.

import { daysUntil } from './maintenance'

export const RENEWAL_FIELDS = [
  { key: 'insurance_expiry', label: 'Insurance' },
  { key: 'inspection_expiry', label: 'Inspection' },
  { key: 'licence_expiry', label: 'Licence' },
]

const RANK = { overdue: 0, soon: 1, ok: 2 }

// Status of a single renewal date relative to `today` ('YYYY-MM-DD', injectable for tests):
// 'overdue' (already past), 'soon' (0..soonDays away), 'ok' (further out), null (no date).
export function renewalStatus(dateStr, today = null, soonDays = 30) {
  const now = today ? new Date(today + 'T00:00:00') : undefined
  const d = daysUntil(dateStr, now)
  if (d == null) return null
  if (d < 0) return 'overdue'
  if (d <= soonDays) return 'soon'
  return 'ok'
}

// All dated renewals for a vehicle: { key, label, date, days, status }.
export function vehicleRenewals(vehicle, today = null, soonDays = 30) {
  const now = today ? new Date(today + 'T00:00:00') : undefined
  return RENEWAL_FIELDS
    .filter(f => vehicle[f.key])
    .map(f => ({
      key: f.key,
      label: f.label,
      date: vehicle[f.key],
      days: daysUntil(vehicle[f.key], now),
      status: renewalStatus(vehicle[f.key], today, soonDays),
    }))
}

// Most urgent renewal status across a vehicle's renewals: 'overdue' > 'soon' > 'ok' > null.
export function worstRenewalStatus(vehicle, today = null, soonDays = 30) {
  let worst = null
  for (const r of vehicleRenewals(vehicle, today, soonDays)) {
    if (worst == null || RANK[r.status] < RANK[worst]) worst = r.status
  }
  return worst
}
