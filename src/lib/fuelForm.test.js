import { describe, it, expect } from 'vitest'
import { cleanFuelLog, DB_MANAGED } from './fuelForm'

describe('cleanFuelLog', () => {
  it('strips the GENERATED derived_price_per_litre (the bug that blocked editing saved logs)', () => {
    const row = { volume_litres: 15.42, total_cost_kes: 2000, derived_price_per_litre: 1278.77 }
    expect('derived_price_per_litre' in cleanFuelLog(row, 'v1')).toBe(false)
  })

  it('strips system + trigger-managed columns (id, created_at, user_id, km_since_last)', () => {
    const row = { id: 'x', created_at: 't', user_id: 'u', km_since_last: 5, odometer_km: 100 }
    const out = cleanFuelLog(row, 'v1')
    for (const k of ['id', 'created_at', 'user_id', 'km_since_last']) {
      expect(out).not.toHaveProperty(k)
    }
  })

  it('stamps vehicle_id from the argument', () => {
    expect(cleanFuelLog({}, 'veh-9').vehicle_id).toBe('veh-9')
  })

  it("maps blank strings to null", () => {
    expect(cleanFuelLog({ station: '', notes: '' }, 'v1')).toMatchObject({ station: null, notes: null })
  })

  it('keeps editable fields, including a corrected price', () => {
    const out = cleanFuelLog({ price_per_litre_kes: 129.7, total_cost_kes: 2000, volume_litres: 15.42 }, 'v1')
    expect(out).toMatchObject({ price_per_litre_kes: 129.7, total_cost_kes: 2000, volume_litres: 15.42 })
  })

  it('does not mutate the input object', () => {
    const row = { id: 'x', station: '' }
    cleanFuelLog(row, 'v1')
    expect(row).toEqual({ id: 'x', station: '' })
  })

  it('DB_MANAGED covers the generated column and legacy derived_ppl name', () => {
    expect(DB_MANAGED).toContain('derived_price_per_litre')
    expect(DB_MANAGED).toContain('derived_ppl')
  })

  it('keeps exclude_from_economy (a normal editable column) in the payload', () => {
    const out = cleanFuelLog({ odometer_km: 100, exclude_from_economy: true }, 'veh-1')
    expect(out.exclude_from_economy).toBe(true)
    expect(out.vehicle_id).toBe('veh-1')
  })
})
