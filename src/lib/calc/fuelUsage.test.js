import { describe, it, expect } from 'vitest'
import { fuelPeriods, fuelUsedByVehicle, fuelUsedTotals } from './fuelUsage'

const JULY = new Date(2026, 6, 15)   // 2026-07-15 (local)
const JAN = new Date(2026, 0, 10)    // 2026-01-10 (local)

describe('fuelPeriods', () => {
  it('computes previous month + this month boundaries mid-year', () => {
    expect(fuelPeriods(JULY)).toEqual({
      thisMonthStart: '2026-07-01',
      lastMonthStart: '2026-06-01',
      lastMonthLabel: 'Jun',
      thisMonthLabel: 'Jul',
    })
  })
  it('wraps to December of the prior year in January', () => {
    expect(fuelPeriods(JAN)).toEqual({
      thisMonthStart: '2026-01-01',
      lastMonthStart: '2025-12-01',
      lastMonthLabel: 'Dec',
      thisMonthLabel: 'Jan',
    })
  })
})

describe('fuelUsedByVehicle', () => {
  const vehicles = [{ id: 'a', name: 'Polo' }, { id: 'b', name: 'Merc' }]
  const fuel = [
    { vehicle_id: 'a', logged_at: '2026-06-30', volume_litres: 10, total_cost_kes: 1500 }, // last day of prev month
    { vehicle_id: 'a', logged_at: '2026-06-05', volume_litres: 20, total_cost_kes: 3000 }, // last month
    { vehicle_id: 'a', logged_at: '2026-07-01', volume_litres: 5, total_cost_kes: 800 },   // MTD boundary (counts as MTD)
    { vehicle_id: 'b', logged_at: '2026-07-10', volume_litres: 40, total_cost_kes: 6400 }, // MTD
    { vehicle_id: 'a', logged_at: '2026-05-20', volume_litres: 99, total_cost_kes: 9999 }, // older — excluded
  ]

  it('splits last-month vs MTD per vehicle on the boundaries', () => {
    const out = fuelUsedByVehicle(fuel, vehicles, JULY)
    const polo = out.find(v => v.id === 'a')
    const merc = out.find(v => v.id === 'b')
    expect(polo.lastMonth).toEqual({ litres: 30, kes: 4500 }) // 10 + 20
    expect(polo.thisMonth).toEqual({ litres: 5, kes: 800 })   // the 07-01 fill
    expect(merc.lastMonth).toEqual({ litres: 0, kes: 0 })
    expect(merc.thisMonth).toEqual({ litres: 40, kes: 6400 })
  })

  it('returns a row per vehicle even with no fuel', () => {
    expect(fuelUsedByVehicle([], vehicles, JULY)).toHaveLength(2)
  })
})

describe('fuelUsedTotals', () => {
  it('sums across all vehicles for both periods', () => {
    const fuel = [
      { logged_at: '2026-06-05', volume_litres: 20, total_cost_kes: 3000 },
      { logged_at: '2026-06-30', volume_litres: 10, total_cost_kes: 1500 },
      { logged_at: '2026-07-10', volume_litres: 40, total_cost_kes: 6400 },
    ]
    expect(fuelUsedTotals(fuel, JULY)).toEqual({
      lastMonth: { litres: 30, kes: 4500 },
      thisMonth: { litres: 40, kes: 6400 },
    })
  })
})
