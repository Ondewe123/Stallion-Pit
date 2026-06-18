// Pure logic for applying a maintenance template's items onto a vehicle's schedule.
// No React/Supabase deps, so it is unit-testable.

const norm = (s) => String(s ?? '').trim().toLowerCase()

// Fields copied from a template_item onto a new maintenance_schedules row.
const COPIED_FIELDS = [
  'item', 'category', 'distance_interval_km', 'time_interval_months', 'priority',
  'diy_difficulty', 'parts_needed', 'consumables_needed', 'torque_spec',
  'warn_threshold_km', 'warn_threshold_days',
]

// Decide what applying `templateItems` to a vehicle produces, without touching the DB.
//
// Non-destructive: an item is ADDED only if the vehicle has no existing schedule with the
// same (case-insensitive, trimmed) `item` name; otherwise it is SKIPPED so the user's real
// last_done / next_due history is never overwritten.
//
// Returns { toInsert: [rows ready to insert], skipped: [item names] }.
// Each inserted row carries vehicle_id, template_item_id (provenance), and null due fields.
export function applyTemplate(templateItems, vehicleId, existingSchedules = []) {
  const existing = new Set(existingSchedules.map((s) => norm(s.item)))
  const toInsert = []
  const skipped = []

  for (const ti of templateItems || []) {
    if (existing.has(norm(ti.item))) {
      skipped.push(ti.item)
      continue
    }
    const row = { vehicle_id: vehicleId, template_item_id: ti.id ?? null }
    for (const f of COPIED_FIELDS) row[f] = ti[f] ?? null
    row.last_done_odometer = null
    row.last_done_date = null
    row.next_due_odometer = null
    row.next_due_date = null
    toInsert.push(row)
    existing.add(norm(ti.item)) // guard against duplicate items within the same template
  }

  return { toInsert, skipped }
}
