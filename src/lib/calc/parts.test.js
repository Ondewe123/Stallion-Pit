import { describe, it, expect } from 'vitest'
import { computeWarrantyUntil, warrantyStatus } from './parts'

describe('computeWarrantyUntil', () => {
  it('returns an explicit warranty_until when set', () => {
    expect(computeWarrantyUntil({ warranty_until: '2027-01-01', purchased_at: '2026-01-01', warranty_months: 6 }))
      .toBe('2027-01-01')
  })
  it('computes from purchased_at + warranty_months', () => {
    expect(computeWarrantyUntil({ purchased_at: '2026-01-15', warranty_months: 12 })).toBe('2027-01-15')
  })
  it('handles cross-year months', () => {
    expect(computeWarrantyUntil({ purchased_at: '2026-11-10', warranty_months: 6 })).toBe('2027-05-10')
  })
  it('returns null with no warranty info', () => {
    expect(computeWarrantyUntil({ purchased_at: '2026-01-01' })).toBeNull()
    expect(computeWarrantyUntil({ warranty_months: 12 })).toBeNull()
    expect(computeWarrantyUntil({ purchased_at: '2026-01-01', warranty_months: '' })).toBeNull()
  })
})

describe('warrantyStatus', () => {
  it('is active when cover runs past today', () => {
    expect(warrantyStatus({ warranty_until: '2026-12-31' }, '2026-06-19')).toBe('active')
  })
  it('is active on the exact expiry day (boundary)', () => {
    expect(warrantyStatus({ warranty_until: '2026-06-19' }, '2026-06-19')).toBe('active')
  })
  it('is expired the day after', () => {
    expect(warrantyStatus({ warranty_until: '2026-06-18' }, '2026-06-19')).toBe('expired')
  })
  it('uses the computed expiry from months', () => {
    // purchased 2026-01-19 + 6mo = 2026-07-19, still active on 2026-06-19
    expect(warrantyStatus({ purchased_at: '2026-01-19', warranty_months: 6 }, '2026-06-19')).toBe('active')
    // + 3mo = 2026-04-19, expired by 2026-06-19
    expect(warrantyStatus({ purchased_at: '2026-01-19', warranty_months: 3 }, '2026-06-19')).toBe('expired')
  })
  it('returns null with no warranty info', () => {
    expect(warrantyStatus({ purchased_at: '2026-01-01' }, '2026-06-19')).toBeNull()
  })
})
