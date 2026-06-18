import { describe, it, expect } from 'vitest'
import { daysUntil, addMonths, evaluate, computeNextDue, DUE_SOON_KM, DUE_SOON_DAYS } from './maintenance'

const NOW = new Date('2026-06-18T12:00:00') // fixed "today" for deterministic tests

describe('daysUntil', () => {
  it('returns whole days from today to a future date', () => {
    expect(daysUntil('2026-06-28', NOW)).toBe(10)
  })
  it('returns negative for past dates', () => {
    expect(daysUntil('2026-06-08', NOW)).toBe(-10)
  })
  it('returns 0 for today', () => {
    expect(daysUntil('2026-06-18', NOW)).toBe(0)
  })
  it('returns null for missing date', () => {
    expect(daysUntil(null, NOW)).toBeNull()
    expect(daysUntil('', NOW)).toBeNull()
  })
})

describe('addMonths', () => {
  it('adds months within a year', () => {
    expect(addMonths('2026-01-15', 3)).toBe('2026-04-15')
  })
  it('crosses a year boundary', () => {
    expect(addMonths('2026-11-10', 3)).toBe('2027-02-10')
  })
  it('rounds fractional months', () => {
    expect(addMonths('2026-01-10', 2.4)).toBe('2026-03-10') // rounds to 2
    expect(addMonths('2026-01-10', 2.6)).toBe('2026-04-10') // rounds to 3
  })
})

describe('evaluate', () => {
  const at = (odo, date) => ({ next_due_odometer: odo, next_due_date: date })

  it('flags overdue when km is negative', () => {
    expect(evaluate(at(1000, null), 1200, { now: NOW }).status).toBe('overdue')
  })
  it('flags overdue when days is negative', () => {
    expect(evaluate(at(null, '2026-06-01'), 0, { now: NOW }).status).toBe('overdue')
  })
  it('flags soon at exactly the km threshold (boundary)', () => {
    const r = evaluate(at(1000 + DUE_SOON_KM, null), 1000, { now: NOW })
    expect(r.remKm).toBe(DUE_SOON_KM)
    expect(r.status).toBe('soon')
  })
  it('flags soon at exactly the day threshold (boundary)', () => {
    // 30 days ahead of NOW
    const r = evaluate(at(null, '2026-07-18'), 0, { now: NOW })
    expect(r.remDays).toBe(DUE_SOON_DAYS)
    expect(r.status).toBe('soon')
  })
  it('is ok when comfortably ahead on both axes', () => {
    expect(evaluate(at(10000, '2027-01-01'), 1000, { now: NOW }).status).toBe('ok')
  })
  it('returns null remainders when due fields are missing', () => {
    const r = evaluate(at(null, null), 1000, { now: NOW })
    expect(r).toMatchObject({ remKm: null, remDays: null, status: 'ok' })
  })
  it('treats falsy currentOdo as no-km-info (remKm null)', () => {
    expect(evaluate(at(5000, null), 0, { now: NOW }).remKm).toBeNull()
  })
  it('honours custom thresholds', () => {
    const r = evaluate(at(1500, null), 1000, { now: NOW, dueSoonKm: 600 })
    expect(r.status).toBe('soon') // remKm 500 <= 600
  })
})

describe('computeNextDue', () => {
  it('fills next_due_odometer from last-done + distance interval', () => {
    const r = computeNextDue({ last_done_odometer: 100000, distance_interval_km: 8000, next_due_odometer: null, next_due_date: null })
    expect(r.next_due_odometer).toBe(108000)
  })
  it('fills next_due_date from last-done date + time interval', () => {
    const r = computeNextDue({ last_done_date: '2026-01-01', time_interval_months: 12, next_due_odometer: null, next_due_date: null })
    expect(r.next_due_date).toBe('2027-01-01')
  })
  it('does not overwrite values already provided', () => {
    const r = computeNextDue({ last_done_odometer: 100000, distance_interval_km: 8000, next_due_odometer: 999999, next_due_date: null })
    expect(r.next_due_odometer).toBe(999999)
  })
  it('leaves fields null when intervals are absent', () => {
    const r = computeNextDue({ last_done_odometer: 100000, distance_interval_km: null, next_due_odometer: null, next_due_date: null })
    expect(r.next_due_odometer).toBeNull()
  })
  it('does not mutate the input object', () => {
    const input = { last_done_odometer: 100000, distance_interval_km: 8000, next_due_odometer: null, next_due_date: null }
    computeNextDue(input)
    expect(input.next_due_odometer).toBeNull()
  })
})
