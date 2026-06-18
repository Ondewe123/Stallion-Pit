import { describe, it, expect } from 'vitest'
import { num, correctedConsumption, rolling } from './consumption'

// Helper: build a newest-first (descending odometer) log list.
const log = (odo, vol, cost) => ({ odometer_km: odo, volume_litres: vol, total_cost_kes: cost, logged_at: '2026-01-01' })

describe('num', () => {
  it('coerces values, treats null/undefined/empty as 0', () => {
    expect(num(5)).toBe(5)
    expect(num('5.5')).toBe(5.5)
    expect(num(null)).toBe(0)
    expect(num(undefined)).toBe(0)
    expect(num('')).toBe(0)
  })
})

describe('correctedConsumption', () => {
  it('computes L/100km from cumulative volume over cumulative distance', () => {
    // newest first: 1100km .. 1000km, 10L burned over 100km => 10 L/100km
    const logs = [log(1100, 5, 1000), log(1050, 5, 1000), log(1000, 0, 0)]
    expect(correctedConsumption(logs, 3)).toBeCloseTo(10, 6)
  })

  it('respects the window size (only the newest N fills)', () => {
    const logs = [log(1100, 10, 0), log(1000, 0, 0), log(500, 999, 0)]
    // window 2: 10L over (1100-1000)=100km => 10
    expect(correctedConsumption(logs, 2)).toBeCloseTo(10, 6)
  })

  it('returns null for fewer than 2 logs', () => {
    expect(correctedConsumption([], 5)).toBeNull()
    expect(correctedConsumption([log(1000, 5, 0)], 5)).toBeNull()
    expect(correctedConsumption(null, 5)).toBeNull()
  })

  it('returns null when window collapses below 2 entries', () => {
    expect(correctedConsumption([log(1100, 5, 0), log(1000, 5, 0)], 1)).toBeNull()
  })

  it('returns null for zero or negative distance', () => {
    expect(correctedConsumption([log(1000, 5, 0), log(1000, 5, 0)], 2)).toBeNull() // zero
    expect(correctedConsumption([log(900, 5, 0), log(1000, 5, 0)], 2)).toBeNull()  // negative
  })

  it('returns null for zero total volume', () => {
    expect(correctedConsumption([log(1100, 0, 0), log(1000, 0, 0)], 2)).toBeNull()
  })
})

describe('rolling', () => {
  const asc = [log(1000, 0, 0), log(1100, 10, 2000), log(1200, 10, 2000), log(1300, 10, 2000)]

  it('emits one point per window of K fills (oldest-first input)', () => {
    const pts = rolling(asc, 1, (dist, vol) => (vol / dist) * 100)
    expect(pts).toHaveLength(3) // i = 1,2,3
    expect(pts[0].value).toBeCloseTo(10, 6) // 10L over 100km
  })

  it('passes summed volume and cost for the window to valueFn', () => {
    const pts = rolling(asc, 2, (dist, vol, cost) => ({ dist, vol, cost }))
    // i=2: dist=1200-1000=200, fills j=1,2 => vol=20, cost=4000
    expect(pts[0].value).toMatchObject({ dist: 200, vol: 20, cost: 4000 })
  })

  it('skips windows with non-positive distance', () => {
    const flat = [log(1000, 5, 0), log(1000, 5, 0)]
    expect(rolling(flat, 1, (d, v) => v / d)).toHaveLength(0)
  })

  it('drops points where valueFn returns null', () => {
    const pts = rolling(asc, 1, () => null)
    expect(pts).toHaveLength(0)
  })

  it('returns empty when there are fewer than K+1 fills', () => {
    expect(rolling([log(1000, 5, 0)], 3, () => 1)).toHaveLength(0)
  })
})
