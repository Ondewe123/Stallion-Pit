import { describe, it, expect } from 'vitest'
import { applyTemplate } from './templates'

const ti = (id, item, extra = {}) => ({ id, item, distance_interval_km: 10000, priority: 2, ...extra })

describe('applyTemplate', () => {
  it('adds all items when the vehicle has no existing schedule', () => {
    const items = [ti('a', 'Engine Oil'), ti('b', 'Brake Fluid')]
    const { toInsert, skipped } = applyTemplate(items, 'veh-1', [])
    expect(toInsert).toHaveLength(2)
    expect(skipped).toEqual([])
    expect(toInsert[0].vehicle_id).toBe('veh-1')
  })

  it('skips items whose name already exists (case/space-insensitive) and never overwrites', () => {
    const items = [ti('a', 'Engine Oil'), ti('b', 'Brake Fluid')]
    const existing = [{ item: '  engine OIL ', last_done_odometer: 99999 }]
    const { toInsert, skipped } = applyTemplate(items, 'veh-1', existing)
    expect(toInsert.map(r => r.item)).toEqual(['Brake Fluid'])
    expect(skipped).toEqual(['Engine Oil'])
  })

  it('carries provenance and rich fields, leaves due fields null', () => {
    const items = [ti('a', 'Brake Fluid', { warn_threshold_days: 60, torque_spec: '10 Nm' })]
    const { toInsert } = applyTemplate(items, 'veh-1', [])
    const row = toInsert[0]
    expect(row.template_item_id).toBe('a')
    expect(row.warn_threshold_days).toBe(60)
    expect(row.torque_spec).toBe('10 Nm')
    expect(row.distance_interval_km).toBe(10000)
    expect(row.last_done_odometer).toBeNull()
    expect(row.next_due_odometer).toBeNull()
    expect(row.next_due_date).toBeNull()
  })

  it('de-duplicates repeated item names within the same template', () => {
    const items = [ti('a', 'Coolant'), ti('b', 'Coolant')]
    const { toInsert } = applyTemplate(items, 'veh-1', [])
    expect(toInsert).toHaveLength(1)
  })

  it('handles empty/missing template items safely', () => {
    expect(applyTemplate(null, 'veh-1', []).toInsert).toEqual([])
    expect(applyTemplate([], 'veh-1', []).skipped).toEqual([])
  })

  it('null id still produces a row (template_item_id null)', () => {
    const { toInsert } = applyTemplate([{ item: 'AC Service' }], 'veh-1', [])
    expect(toInsert[0].template_item_id).toBeNull()
    expect(toInsert[0].item).toBe('AC Service')
  })
})
