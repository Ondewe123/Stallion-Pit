import { describe, it, expect } from 'vitest'
import {
  num, correctedConsumption, economyTotals, economyByYear,
  fillRangeKm, rolling, segments, withDerived, GAP_HINT_DAYS,
} from './consumption'

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

  it('treats the oldest fill as the odometer boundary, not fuel consumed in the window', () => {
    const logs = [log(1200, 10, 2000), log(1100, 10, 2000), log(1000, 50, 10000)]
    // The two newer fills supplied 20L over 200km. The 50L bought at the
    // starting odometer belongs to the preceding distance and must not count.
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

describe('economyTotals', () => {
  it('returns boundary-safe distance, volume and cost for newest-first rows', () => {
    const logs = [
      { ...log(1200, 10, 2100), logged_at: '2026-03-01' },
      { ...log(1100, 10, 2000), logged_at: '2026-02-01' },
      { ...log(1000, 50, 9000), logged_at: '2026-01-01' },
    ]
    expect(economyTotals(logs, 3)).toEqual({ distance: 200, volume: 20, cost: 4100 })
  })

  it('drops excluded fills and the distance crossing each broken chain', () => {
    const logs = [
      { ...log(1500, 10, 2100), logged_at: '2026-05-01' },
      { ...log(1400, 40, 8000), logged_at: '2026-04-01' },
      { ...log(1300, 99, 9900), logged_at: '2026-03-01', exclude_from_economy: true },
      { ...log(1200, 5, 1000), logged_at: '2026-02-01' },
      { ...log(1100, 30, 6000), logged_at: '2026-01-01' },
    ]
    expect(economyTotals(logs, 5)).toEqual({ distance: 200, volume: 15, cost: 3100 })
  })
})

describe('economyByYear', () => {
  it('assigns each valid interval to the newer fill year without counting the initial boundary', () => {
    const asc = [
      { ...log(1000, 50, 9000), logged_at: '2025-12-20' },
      { ...log(1100, 10, 2000), logged_at: '2026-01-10' },
      { ...log(1250, 12, 2400), logged_at: '2026-02-10' },
    ]
    expect(economyByYear(asc)).toEqual({
      2026: { year: '2026', dist: 250, vol: 22, fuel: 4400 },
    })
  })

  it('omits intervals touching an excluded fill', () => {
    const asc = [
      { ...log(1000, 50, 9000), logged_at: '2026-01-01' },
      { ...log(1100, 10, 2000), logged_at: '2026-02-01', exclude_from_economy: true },
      { ...log(1200, 10, 2100), logged_at: '2026-03-01' },
      { ...log(1300, 8, 1700), logged_at: '2026-04-01' },
    ]
    expect(economyByYear(asc)).toEqual({
      2026: { year: '2026', dist: 100, vol: 8, fuel: 1700 },
    })
  })
})

describe('fillRangeKm', () => {
  it('estimates km from litres and L/100km economy', () => {
    // 40 L at 8 L/100km => 500 km
    expect(fillRangeKm(40, 8)).toBeCloseTo(500, 6)
    // 50 L at 10 L/100km => 500 km
    expect(fillRangeKm(50, 10)).toBeCloseTo(500, 6)
  })

  it('coerces string litres', () => {
    expect(fillRangeKm('40', 8)).toBeCloseTo(500, 6)
  })

  it('returns null for missing or non-positive inputs', () => {
    expect(fillRangeKm(0, 8)).toBeNull()
    expect(fillRangeKm(40, 0)).toBeNull()
    expect(fillRangeKm(40, null)).toBeNull()
    expect(fillRangeKm(null, 8)).toBeNull()
    expect(fillRangeKm(40, -8)).toBeNull()
  })
})

describe('segments', () => {
  it('groups consecutive non-excluded fills, dropping excluded ones', () => {
    const rows = [
      { odometer_km: 1000 }, { odometer_km: 1100 },
      { odometer_km: 1200, exclude_from_economy: true },
      { odometer_km: 1300 }, { odometer_km: 1400 },
    ]
    const runs = segments(rows)
    expect(runs).toHaveLength(2)
    expect(runs[0].map(r => r.odometer_km)).toEqual([1000, 1100])
    expect(runs[1].map(r => r.odometer_km)).toEqual([1300, 1400])
  })
  it('returns [] for empty/null input', () => {
    expect(segments([])).toEqual([])
    expect(segments(null)).toEqual([])
  })
  it('exposes GAP_HINT_DAYS', () => { expect(GAP_HINT_DAYS).toBe(180) })
})

describe('withDerived', () => {
  const F = (odo, vol, opts = {}) => ({ id: `k${odo}`, odometer_km: odo, volume_litres: vol, logged_at: '2026-01-01', is_partial: true, ...opts })

  it('computes factual kmSince from consecutive fills (delete-safe)', () => {
    const asc = [F(1000, 5), F(1100, 5), F(1250, 5)]
    const d = withDerived(asc)
    expect(d[0].kmSince).toBeNull()
    expect(d[1].kmSince).toBe(100)
    expect(d[2].kmSince).toBe(150)
    // delete the middle row → neighbour recomputes against what remains
    const d2 = withDerived([asc[0], asc[2]])
    expect(d2[1].kmSince).toBe(250)
  })

  it('brim-to-brim segment sums partials since the previous full tank and excludes that tank\'s own volume', () => {
    const asc = [
      F(1000, 40, { is_partial: false }), // starting brim (its 40L belongs to the prior segment)
      F(1200, 10),                        // partial in between
      F(1400, 30, { is_partial: false }), // closing brim
    ]
    const d = withDerived(asc)
    expect(d[0].segmentL100).toBeNull()          // first full tank in run
    expect(d[1].segmentL100).toBeNull()          // partials never carry a segment value
    // (10 + 30) L over (1400-1000)=400 km => 10 L/100km
    expect(d[2].segmentL100).toBeCloseTo(10, 6)
  })

  it('per-fill is null at a run boundary and after an excluded fill', () => {
    const asc = [
      F(1000, 5), F(1100, 10),
      F(1200, 99, { exclude_from_economy: true }),
      F(1300, 10),
    ]
    const d = withDerived(asc)
    expect(d[0].perFillL100).toBeNull()          // first in run
    expect(d[1].perFillL100).toBeCloseTo(10, 6)  // 10L / 100km
    expect(d[2].excluded).toBe(true)
    expect(d[2].perFillL100).toBeNull()          // excluded fill
    expect(d[3].perFillL100).toBeNull()          // first fill after a break
  })

  it('computes daysSince across a long gap', () => {
    const asc = [
      { id: 'a', odometer_km: 1000, volume_litres: 5, logged_at: '2025-01-01', is_partial: true },
      { id: 'b', odometer_km: 1100, volume_litres: 5, logged_at: '2025-08-01', is_partial: true },
    ]
    const d = withDerived(asc)
    expect(d[1].daysSince).toBe(212)
    expect(d[1].daysSince).toBeGreaterThan(GAP_HINT_DAYS)
  })
})

describe('break-awareness', () => {
  const L = (odo, vol, opts = {}) => ({ odometer_km: odo, volume_litres: vol, total_cost_kes: 0, logged_at: '2026-01-01', ...opts })

  it('correctedConsumption excludes the flagged segment and its gap distance', () => {
    // newest-first; X is an excluded bad/gap fill splitting the window into two runs
    const logs = [
      L(1300, 10), L(1200, 10),
      L(1150, 99, { exclude_from_economy: true }),
      L(1000, 5), L(900, 5),
    ]
    // run1: 10L over (1300-1200)=100km; run2: 5L over
    // (1000-900)=100km. Each oldest fill is only an odometer boundary.
    expect(correctedConsumption(logs, 5)).toBeCloseTo(7.5, 6)
  })

  it('uses the oldest fill in each run only as that run\'s odometer boundary', () => {
    const logs = [
      L(1500, 10), L(1400, 40),
      L(1300, 99, { exclude_from_economy: true }),
      L(1200, 5), L(1100, 30),
    ]
    // Newer fuel only: 10L / 100km plus 5L / 100km => 15L / 200km.
    // The 40L and 30L at each run's starting boundary belong before the window.
    expect(correctedConsumption(logs, 5)).toBeCloseTo(7.5, 6)
  })

  it('rolling skips windows straddling an excluded fill', () => {
    const asc = [
      L(1000, 0), L(1100, 10),
      L(1200, 99, { exclude_from_economy: true }),
      L(1300, 10), L(1400, 10),
    ]
    const pts = rolling(asc, 1, (dist, vol) => (vol / dist) * 100)
    expect(pts).toHaveLength(2) // i=1 ok, i=2 & i=3 straddle X, i=4 ok
    expect(pts[0].value).toBeCloseTo(10, 6)
    expect(pts[1].value).toBeCloseTo(10, 6)
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
