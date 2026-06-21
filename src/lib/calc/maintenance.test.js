import { describe, it, expect } from 'vitest'
import { daysUntil, addMonths, evaluate, computeNextDue, byPriorityThenUrgency, urgency, byUrgency, DUE_SOON_KM, DUE_SOON_DAYS } from './maintenance'

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

describe('byPriorityThenUrgency', () => {
  const sorted = (arr) => [...arr].sort(byPriorityThenUrgency).map(x => x.k)

  it('orders overdue before soon before ok', () => {
    const items = [
      { k: 'ok', status: 'ok', priority: 1 },
      { k: 'soon', status: 'soon', priority: 4 },
      { k: 'overdue', status: 'overdue', priority: 4 },
    ]
    expect(sorted(items)).toEqual(['overdue', 'soon', 'ok'])
  })

  it('within the same status, lower priority number wins', () => {
    const items = [
      { k: 'p3', status: 'soon', priority: 3 },
      { k: 'p1', status: 'soon', priority: 1 },
      { k: 'p2', status: 'soon', priority: 2 },
    ]
    expect(sorted(items)).toEqual(['p1', 'p2', 'p3'])
  })

  it('within the same status and priority, smaller remaining km wins (nulls last)', () => {
    const items = [
      { k: 'far', status: 'soon', priority: 2, remKm: 800 },
      { k: 'near', status: 'soon', priority: 2, remKm: 100 },
      { k: 'none', status: 'soon', priority: 2, remKm: null, remDays: 5 },
    ]
    expect(sorted(items)).toEqual(['near', 'far', 'none'])
  })

  it('defaults missing priority to 3', () => {
    const items = [
      { k: 'p4', status: 'ok', priority: 4 },
      { k: 'default', status: 'ok' },
      { k: 'p1', status: 'ok', priority: 1 },
    ]
    expect(sorted(items)).toEqual(['p1', 'default', 'p4'])
  })
})

describe('urgency', () => {
  it('normalises km remaining by the soon-window', () => {
    expect(urgency({ remKm: 2000 })).toBe(2000 / DUE_SOON_KM)
  })
  it('normalises days remaining by the soon-window', () => {
    expect(urgency({ remDays: 60 })).toBe(60 / DUE_SOON_DAYS)
  })
  it('uses the binding (smaller) axis when both are present', () => {
    // km → 2.0, days → 0.5; the date axis is closer, so it binds
    expect(urgency({ remKm: 2000, remDays: 15 })).toBe(0.5)
  })
  it('is negative when overdue', () => {
    expect(urgency({ remKm: -500 })).toBe(-0.5)
  })
  it('is Infinity when nothing is scheduled', () => {
    expect(urgency({ remKm: null, remDays: null })).toBe(Infinity)
  })
})

describe('byUrgency', () => {
  const sorted = (arr) => [...arr].sort(byUrgency).map(x => x.k)

  it('orders most-due first: overdue → soon → ok → unscheduled', () => {
    const items = [
      { k: 'none', remKm: null, remDays: null },
      { k: 'ok', remKm: 12000 },
      { k: 'overdue', remKm: -500 },
      { k: 'soon', remKm: 400 },
    ]
    expect(sorted(items)).toEqual(['overdue', 'soon', 'ok', 'none'])
  })

  it('does not bury a date-only item below a far km item (the reported bug)', () => {
    const items = [
      { k: 'farKm', remKm: 50000 },          // 50 windows away
      { k: 'soonDate', remKm: null, remDays: 15 }, // 0.5 windows away
    ]
    expect(sorted(items)).toEqual(['soonDate', 'farKm'])
  })

  it('uses priority only to break urgency ties', () => {
    const items = [
      { k: 'normal', remKm: 1000, priority: 3 },
      { k: 'critical', remKm: 1000, priority: 1 },
    ]
    expect(sorted(items)).toEqual(['critical', 'normal'])
  })
})
