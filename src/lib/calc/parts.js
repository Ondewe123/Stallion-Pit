// Pure parts-inventory helpers — no React/Supabase deps, so they are unit-testable.

import { addMonths } from './maintenance'

// Effective warranty-expiry date for a part: an explicit warranty_until wins; otherwise
// computed from purchased_at + warranty_months. Returns 'YYYY-MM-DD' or null.
export function computeWarrantyUntil(part) {
  if (part.warranty_until) return part.warranty_until
  if (part.purchased_at && part.warranty_months != null && part.warranty_months !== '')
    return addMonths(part.purchased_at, part.warranty_months)
  return null
}

// Warranty state on `today` (a 'YYYY-MM-DD' string): 'active' if cover runs to today or later,
// 'expired' if it lapsed before today, null when there's no warranty info.
// ISO date strings compare lexically, so no Date parsing is needed.
export function warrantyStatus(part, today) {
  const until = computeWarrantyUntil(part)
  if (!until) return null
  return until >= today ? 'active' : 'expired'
}
