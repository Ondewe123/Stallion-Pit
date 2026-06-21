import { describe, it, expect } from 'vitest'
import { kmThisMonth, avgKmPerMonth } from './distance'

// readings: { odometer_km, date: 'YYYY-MM-DD' }
const r = (odometer_km, date) => ({ odometer_km, date })
const REF = new Date('2026-06-21T12:00:00') // fixed "today" → month is 2026-06

describe('kmThisMonth', () => {
  it('measures latest odometer minus the last reading before this month started', () => {
    const readings = [r(1000, '2026-05-20'), r(1200, '2026-06-10'), r(1300, '2026-06-18')]
    expect(kmThisMonth(readings, REF)).toBe(300) // 1300 − 1000 (the May reading)
  })

  it('is 0 when there is a prior reading but nothing logged this month', () => {
    const readings = [r(1000, '2026-04-01'), r(1200, '2026-05-15')]
    expect(kmThisMonth(readings, REF)).toBe(0) // last-before-June == latest == 1200
  })

  it('is null when there is no reading before this month to measure from', () => {
    const readings = [r(1200, '2026-06-05'), r(1300, '2026-06-18')]
    expect(kmThisMonth(readings, REF)).toBeNull()
  })

  it('is null for no readings', () => {
    expect(kmThisMonth([], REF)).toBeNull()
    expect(kmThisMonth(null, REF)).toBeNull()
  })

  it('ignores rows missing an odometer or date, and coerces string odometers', () => {
    const readings = [r('1000', '2026-05-20'), r(null, '2026-06-01'), r(1450, '2026-06-19')]
    expect(kmThisMonth(readings, REF)).toBe(450)
  })
})

describe('avgKmPerMonth', () => {
  it('divides total distance by the months spanned (≈30.44 days/mo)', () => {
    // 2024-06-21 → 2026-06-21 = 730 days; span 24000 km → 24000 / (730/30.4375)
    const readings = [r(100000, '2024-06-21'), r(124000, '2026-06-21')]
    expect(avgKmPerMonth(readings)).toBeCloseTo(1000.68, 1)
  })

  it('is null with fewer than two readings', () => {
    expect(avgKmPerMonth([r(1000, '2026-01-01')])).toBeNull()
    expect(avgKmPerMonth([])).toBeNull()
  })

  it('is null when there is no time span or no distance', () => {
    expect(avgKmPerMonth([r(1000, '2026-01-01'), r(2000, '2026-01-01')])).toBeNull()
    expect(avgKmPerMonth([r(1000, '2026-01-01'), r(1000, '2026-06-01')])).toBeNull()
  })
})
