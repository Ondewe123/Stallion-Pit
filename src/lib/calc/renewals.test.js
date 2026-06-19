import { describe, it, expect } from 'vitest'
import { renewalStatus, vehicleRenewals, worstRenewalStatus } from './renewals'

const TODAY = '2026-06-19'

describe('renewalStatus', () => {
  it('is overdue for a past date', () => {
    expect(renewalStatus('2026-06-01', TODAY)).toBe('overdue')
  })
  it('is soon for today (0 days) and within the window', () => {
    expect(renewalStatus('2026-06-19', TODAY)).toBe('soon')
    expect(renewalStatus('2026-07-01', TODAY)).toBe('soon')
  })
  it('is soon at exactly the threshold day (30)', () => {
    expect(renewalStatus('2026-07-19', TODAY, 30)).toBe('soon')
  })
  it('is ok past the threshold', () => {
    expect(renewalStatus('2026-07-20', TODAY, 30)).toBe('ok')
  })
  it('is null with no date', () => {
    expect(renewalStatus(null, TODAY)).toBeNull()
    expect(renewalStatus('', TODAY)).toBeNull()
  })
  it('honours a custom soonDays window', () => {
    expect(renewalStatus('2026-08-01', TODAY, 60)).toBe('soon')
    expect(renewalStatus('2026-08-01', TODAY, 30)).toBe('ok')
  })
})

describe('vehicleRenewals', () => {
  it('returns only renewals that have a date, with status + days', () => {
    const v = { insurance_expiry: '2026-06-25', inspection_expiry: null, licence_expiry: '2026-01-01' }
    const r = vehicleRenewals(v, TODAY)
    expect(r.map(x => x.label)).toEqual(['Insurance', 'Licence'])
    expect(r.find(x => x.label === 'Insurance').status).toBe('soon')
    expect(r.find(x => x.label === 'Licence').status).toBe('overdue')
    expect(r.find(x => x.label === 'Insurance').days).toBe(6)
  })
  it('returns empty when no renewal dates set', () => {
    expect(vehicleRenewals({}, TODAY)).toEqual([])
  })
})

describe('worstRenewalStatus', () => {
  it('picks overdue over soon over ok', () => {
    expect(worstRenewalStatus({ insurance_expiry: '2027-01-01', licence_expiry: '2026-01-01' }, TODAY)).toBe('overdue')
    expect(worstRenewalStatus({ insurance_expiry: '2027-01-01', licence_expiry: '2026-06-25' }, TODAY)).toBe('soon')
    expect(worstRenewalStatus({ insurance_expiry: '2027-01-01' }, TODAY)).toBe('ok')
  })
  it('is null when nothing is set', () => {
    expect(worstRenewalStatus({}, TODAY)).toBeNull()
  })
})
