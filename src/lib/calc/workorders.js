// Pure logic for closing a work order. No React/Supabase deps, so it is unit-testable.
// Returns the exact set of writes the page should execute (in order) to close a WO without
// double-counting spend: ONE labour-only service_logs row, one parts row per fitted line,
// schedule-item completions, and snag resolutions.

import { computeNextDue } from './maintenance'

const RESOLVED_SNAG = new Set(['Resolved', "Won't Fix"])

// buildClosePlan(wo, woParts, scheduleItems, snags, currentOdo, today)
//  - wo: the work_orders row being closed
//  - woParts: this WO's work_order_parts rows
//  - scheduleItems: the maintenance_schedules rows this WO services
//  - snags: the snags linked to this WO
//  - currentOdo: vehicle's current odometer (fallback when wo.odometer_km is blank)
//  - today: 'YYYY-MM-DD' used when wo.completed_at is blank
// Throws if the WO is already Closed/Cancelled.
export function buildClosePlan(wo, woParts = [], scheduleItems = [], snags = [], currentOdo = null, today = null) {
  if (wo.status === 'Closed' || wo.status === 'Cancelled') {
    throw new Error(`Work order is already ${wo.status}`)
  }
  const completedAt = wo.completed_at || today
  const odo = wo.odometer_km ?? currentOdo ?? null

  // 1. labour-only service record (parts spend comes from the parts table → no double-count)
  const serviceLog = {
    vehicle_id: wo.vehicle_id,
    serviced_at: completedAt,
    odometer_km: odo,
    category: wo.category || 'Work Order',
    description: wo.title,
    workshop: wo.workshop ?? null,
    labour_cost_kes: wo.labour_cost_kes ?? null,
    total_cost_kes: wo.labour_cost_kes ?? 0,
    work_order_id: wo.id,
  }

  // 2. one parts row per FITTED line item (carries _woPartId so the page can link parts_id back)
  const partsRows = (woParts || [])
    .filter(p => p.status === 'Fitted')
    .map(p => ({
      vehicle_id: wo.vehicle_id,
      purchased_at: completedAt,
      part_name: p.part_name,
      part_number: p.part_number ?? null,
      ipc_part_id: p.ipc_part_id ?? null,
      brand: p.brand ?? null,
      quantity: p.quantity ?? 1,
      unit_cost_kes: p.unit_cost_kes ?? null,
      total_cost_kes: p.total_cost_kes ?? null,
      odometer_km: odo,
      status: 'Fitted',
      work_order_id: wo.id,
      _woPartId: p.id,
    }))

  // 3. complete each linked schedule item (set last-done, recompute next-due)
  const scheduleUpdates = (scheduleItems || []).map(si => {
    const recomputed = computeNextDue({
      ...si,
      last_done_odometer: odo,
      last_done_date: completedAt,
      next_due_odometer: null,
      next_due_date: null,
    })
    return {
      id: si.id,
      patch: {
        last_done_odometer: odo,
        last_done_date: completedAt,
        next_due_odometer: recomputed.next_due_odometer,
        next_due_date: recomputed.next_due_date,
      },
    }
  })

  // 4. resolve each linked snag that isn't already closed out
  const snagUpdates = (snags || [])
    .filter(s => !RESOLVED_SNAG.has(s.status))
    .map(s => ({ id: s.id, patch: { status: 'Resolved', resolved_at: completedAt } }))

  // 5. the work order itself
  const woUpdate = {
    id: wo.id,
    patch: { status: 'Closed', completed_at: completedAt, closed_by: wo.closed_by ?? null },
  }

  return { serviceLog, partsRows, scheduleUpdates, snagUpdates, woUpdate, completedAt }
}
