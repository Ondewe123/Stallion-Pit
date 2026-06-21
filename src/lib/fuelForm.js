// Helpers for preparing a fuel-log form for Supabase insert/update.

// Columns the database owns — these must never appear in an insert/update payload.
// `derived_price_per_litre` is a GENERATED column: Postgres rejects ANY write to it, which
// is exactly why editing a previously-saved fuel log failed (add worked because the blank
// form never carried this key). `km_since_last` is maintained by a trigger; id/created_at/
// user_id are system-managed. `derived_ppl` is a legacy name kept for safety.
export const DB_MANAGED = [
  'id', 'created_at', 'user_id', 'derived_price_per_litre', 'km_since_last', 'derived_ppl',
]

// Normalise a fuel-log form for insert/update: blank strings → null, drop DB-managed
// columns, and stamp the active vehicle. Returns a new object; does not mutate the input.
export function cleanFuelLog(form, vehicleId) {
  const out = { ...form }
  Object.keys(out).forEach(k => { if (out[k] === '') out[k] = null })
  DB_MANAGED.forEach(k => delete out[k])
  out.vehicle_id = vehicleId
  return out
}
