// Pure backup/restore helpers — no React/Supabase deps, so they are unit-testable.
// The browser does the actual fetch/delete/insert under the owner's RLS; these functions
// shape the snapshot and the FK-safe restore plan.

// All owner tables included in a snapshot. (feedback_reports is intentionally excluded.)
export const BACKUP_TABLES = [
  'vehicles', 'fuel_logs', 'service_logs', 'parts', 'snags', 'maintenance_schedules',
  'maintenance_templates', 'template_items', 'work_orders', 'work_order_parts',
  'work_order_schedule_items', 'dtc_codes', 'documents', 'part_price_snapshots',
]

// FK-safe insert order. work_orders goes early so the only forward reference left is
// work_orders.service_log_id (service_logs are inserted afterwards) — handled by DEFERRED.
export const RESTORE_ORDER = [
  'vehicles', 'maintenance_templates', 'template_items', 'work_orders', 'fuel_logs',
  'service_logs', 'parts', 'snags', 'maintenance_schedules', 'work_order_parts',
  'work_order_schedule_items', 'dtc_codes', 'documents', 'part_price_snapshots',
]

// Delete children before parents.
export const DELETE_ORDER = [...RESTORE_ORDER].reverse()

// Generated columns can't be inserted into — strip them.
const GENERATED = { fuel_logs: ['derived_price_per_litre'] }
// Columns nulled on insert then patched afterwards (target inserted later / cycle).
const DEFERRED = { work_orders: ['service_log_id'] }

export const APP_TAG = 'stallion-pit'

export function buildBackup(dataByTable, meta = {}) {
  const data = {}
  for (const t of BACKUP_TABLES) data[t] = dataByTable[t] || []
  return {
    metadata: {
      app: APP_TAG,
      version: 1,
      exported_at: meta.exported_at || null,
      owner_email: meta.owner_email || null,
    },
    data,
  }
}

// Returns null when the object is a usable backup, else a human error string.
export function validateBackup(obj) {
  if (!obj || typeof obj !== 'object') return 'Not a valid backup file.'
  if (obj.metadata?.app !== APP_TAG) return 'This file is not a Stallion Pit backup.'
  if (!obj.data || typeof obj.data !== 'object') return 'Backup file has no data section.'
  return null
}

// Rows ready to insert: generated columns removed, deferred columns nulled.
// fuel_logs are sorted by odometer asc so the km_since_last trigger recomputes correctly.
export function rowsForInsert(table, rows) {
  const gen = GENERATED[table] || []
  const def = DEFERRED[table] || []
  let out = (rows || []).map(r => {
    const o = { ...r }
    for (const g of gen) delete o[g]
    for (const d of def) o[d] = null
    return o
  })
  if (table === 'fuel_logs') {
    out = out.slice().sort((a, b) => Number(a.odometer_km || 0) - Number(b.odometer_km || 0))
  }
  return out
}

// Post-insert patches restoring the deferred FK columns: [{ id, patch }].
export function deferredUpdates(table, rows) {
  const def = DEFERRED[table] || []
  if (!def.length) return []
  const ups = []
  for (const r of rows || []) {
    const patch = {}
    let has = false
    for (const d of def) if (r[d] != null) { patch[d] = r[d]; has = true }
    if (has) ups.push({ id: r.id, patch })
  }
  return ups
}

// Non-empty per-table counts for the confirm dialog.
export function summarize(data) {
  return BACKUP_TABLES
    .map(t => ({ table: t, count: (data?.[t] || []).length }))
    .filter(x => x.count > 0)
}
