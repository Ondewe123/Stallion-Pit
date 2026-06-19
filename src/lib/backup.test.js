import { describe, it, expect } from 'vitest'
import { buildBackup, validateBackup, rowsForInsert, deferredUpdates, summarize, BACKUP_TABLES, RESTORE_ORDER, DELETE_ORDER } from './backup'

describe('buildBackup', () => {
  it('includes every table (empty arrays for missing) and metadata', () => {
    const b = buildBackup({ vehicles: [{ id: 'v1' }] }, { exported_at: '2026-06-19T00:00:00Z', owner_email: 'a@b.c' })
    expect(b.metadata.app).toBe('stallion-pit')
    expect(b.metadata.owner_email).toBe('a@b.c')
    expect(b.data.vehicles).toHaveLength(1)
    expect(b.data.fuel_logs).toEqual([])
    expect(Object.keys(b.data)).toEqual(BACKUP_TABLES)
  })
})

describe('validateBackup', () => {
  it('accepts a well-formed backup', () => {
    expect(validateBackup({ metadata: { app: 'stallion-pit' }, data: {} })).toBeNull()
  })
  it('rejects non-objects, foreign files, and missing data', () => {
    expect(validateBackup(null)).toMatch(/valid backup/)
    expect(validateBackup({ metadata: { app: 'kuku' }, data: {} })).toMatch(/not a Stallion Pit/)
    expect(validateBackup({ metadata: { app: 'stallion-pit' } })).toMatch(/no data/)
  })
})

describe('rowsForInsert', () => {
  it('strips generated columns on fuel_logs', () => {
    const out = rowsForInsert('fuel_logs', [{ id: 'f', odometer_km: 100, derived_price_per_litre: 9 }])
    expect(out[0]).not.toHaveProperty('derived_price_per_litre')
  })
  it('sorts fuel_logs by odometer ascending', () => {
    const out = rowsForInsert('fuel_logs', [{ id: 'b', odometer_km: 200 }, { id: 'a', odometer_km: 100 }])
    expect(out.map(r => r.id)).toEqual(['a', 'b'])
  })
  it('nulls deferred columns on work_orders', () => {
    const out = rowsForInsert('work_orders', [{ id: 'w', service_log_id: 's1', title: 'x' }])
    expect(out[0].service_log_id).toBeNull()
    expect(out[0].title).toBe('x')
  })
  it('passes other tables through untouched', () => {
    const rows = [{ id: 'p', part_name: 'oil' }]
    expect(rowsForInsert('parts', rows)).toEqual(rows)
  })
})

describe('deferredUpdates', () => {
  it('emits patches only for rows with a deferred value', () => {
    const ups = deferredUpdates('work_orders', [{ id: 'w1', service_log_id: 's1' }, { id: 'w2', service_log_id: null }])
    expect(ups).toEqual([{ id: 'w1', patch: { service_log_id: 's1' } }])
  })
  it('returns [] for tables with no deferred columns', () => {
    expect(deferredUpdates('parts', [{ id: 'p', work_order_id: 'w' }])).toEqual([])
  })
})

describe('orders', () => {
  it('DELETE_ORDER is RESTORE_ORDER reversed', () => {
    expect(DELETE_ORDER).toEqual([...RESTORE_ORDER].reverse())
  })
  it('vehicles inserted first, deletes last', () => {
    expect(RESTORE_ORDER[0]).toBe('vehicles')
    expect(DELETE_ORDER[DELETE_ORDER.length - 1]).toBe('vehicles')
  })
  it('work_orders inserted before service_logs (so only service_log_id is deferred)', () => {
    expect(RESTORE_ORDER.indexOf('work_orders')).toBeLessThan(RESTORE_ORDER.indexOf('service_logs'))
  })
})

describe('summarize', () => {
  it('lists only non-empty tables with counts', () => {
    expect(summarize({ vehicles: [{}, {}], parts: [] })).toEqual([{ table: 'vehicles', count: 2 }])
  })
})
