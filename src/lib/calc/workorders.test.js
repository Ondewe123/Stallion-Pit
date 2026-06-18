import { describe, it, expect } from 'vitest'
import { buildClosePlan } from './workorders'

const baseWO = {
  id: 'wo-1', vehicle_id: 'veh-1', title: 'Major service', status: 'In Progress',
  completed_at: '2026-06-18', odometer_km: 282000, category: 'Major Service',
  workshop: 'Home garage', labour_cost_kes: 4000, closed_by: 'Chris',
}

describe('buildClosePlan', () => {
  it('writes a single LABOUR-ONLY service log (no parts in the total)', () => {
    const parts = [{ id: 'p1', part_name: 'Oil filter', status: 'Fitted', quantity: 1, total_cost_kes: 1500 }]
    const plan = buildClosePlan(baseWO, parts, [], [], null)
    expect(plan.serviceLog.total_cost_kes).toBe(4000)        // labour only
    expect(plan.serviceLog.labour_cost_kes).toBe(4000)
    expect(plan.serviceLog.work_order_id).toBe('wo-1')
    expect(plan.serviceLog.description).toBe('Major service')
  })

  it('creates a parts row per FITTED line only, carrying provenance', () => {
    const parts = [
      { id: 'p1', part_name: 'Oil filter', status: 'Fitted', quantity: 1, unit_cost_kes: 1500, total_cost_kes: 1500 },
      { id: 'p2', part_name: 'Air filter', status: 'Planned', quantity: 1, total_cost_kes: 900 },
    ]
    const plan = buildClosePlan(baseWO, parts, [], [], null)
    expect(plan.partsRows).toHaveLength(1)
    expect(plan.partsRows[0]).toMatchObject({ part_name: 'Oil filter', status: 'Fitted', work_order_id: 'wo-1', _woPartId: 'p1', odometer_km: 282000 })
  })

  it('completes linked schedule items: sets last-done and recomputes next-due from interval', () => {
    const sched = [{ id: 's1', item: 'Engine Oil', distance_interval_km: 10000, time_interval_months: 12 }]
    const plan = buildClosePlan(baseWO, [], sched, [], null)
    expect(plan.scheduleUpdates).toHaveLength(1)
    expect(plan.scheduleUpdates[0].patch.last_done_odometer).toBe(282000)
    expect(plan.scheduleUpdates[0].patch.last_done_date).toBe('2026-06-18')
    expect(plan.scheduleUpdates[0].patch.next_due_odometer).toBe(292000) // 282000 + 10000
    expect(plan.scheduleUpdates[0].patch.next_due_date).toBe('2027-06-18') // +12 months
  })

  it('resolves linked snags that are not already closed out', () => {
    const snags = [
      { id: 'n1', status: 'Open' },
      { id: 'n2', status: 'In Progress' },
      { id: 'n3', status: 'Resolved' },
      { id: 'n4', status: "Won't Fix" },
    ]
    const plan = buildClosePlan(baseWO, [], [], snags, null)
    expect(plan.snagUpdates.map(u => u.id)).toEqual(['n1', 'n2'])
    expect(plan.snagUpdates[0].patch).toEqual({ status: 'Resolved', resolved_at: '2026-06-18' })
  })

  it('marks the work order Closed with completed date + closed_by', () => {
    const plan = buildClosePlan(baseWO, [], [], [], null)
    expect(plan.woUpdate.patch).toEqual({ status: 'Closed', completed_at: '2026-06-18', closed_by: 'Chris' })
  })

  it('falls back to currentOdo and today when WO lacks them', () => {
    const wo = { ...baseWO, odometer_km: null, completed_at: null }
    const plan = buildClosePlan(wo, [], [{ id: 's1', distance_interval_km: 5000 }], [], 100000, '2026-07-01')
    expect(plan.serviceLog.odometer_km).toBe(100000)
    expect(plan.serviceLog.serviced_at).toBe('2026-07-01')
    expect(plan.scheduleUpdates[0].patch.next_due_odometer).toBe(105000)
    expect(plan.completedAt).toBe('2026-07-01')
  })

  it('defaults labour to 0 in the service log when blank', () => {
    const wo = { ...baseWO, labour_cost_kes: null }
    expect(buildClosePlan(wo, [], [], [], null).serviceLog.total_cost_kes).toBe(0)
  })

  it('throws if the work order is already Closed or Cancelled', () => {
    expect(() => buildClosePlan({ ...baseWO, status: 'Closed' }, [], [], [], null)).toThrow(/already Closed/)
    expect(() => buildClosePlan({ ...baseWO, status: 'Cancelled' }, [], [], [], null)).toThrow(/already Cancelled/)
  })

  it('handles a WO with no parts, schedule items or snags', () => {
    const plan = buildClosePlan(baseWO, [], [], [], null)
    expect(plan.partsRows).toEqual([])
    expect(plan.scheduleUpdates).toEqual([])
    expect(plan.snagUpdates).toEqual([])
    expect(plan.serviceLog).toBeTruthy()
  })
})
