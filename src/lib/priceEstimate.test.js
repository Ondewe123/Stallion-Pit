import { describe, it, expect } from 'vitest'
import { estimateLandedKes, CURRENCY_TO_KES, SHIPPING_ESTIMATE_KES } from './priceEstimate.js'

describe('estimateLandedKes', () => {
  it('converts a known currency and adds the shipping estimate', () => {
    expect(estimateLandedKes(24.99, 'GBP'))
      .toBeCloseTo(24.99 * CURRENCY_TO_KES.GBP + SHIPPING_ESTIMATE_KES, 2)
  })
  it('is case-insensitive on the currency code', () => {
    expect(estimateLandedKes(10, 'gbp')).toBe(estimateLandedKes(10, 'GBP'))
  })
  it('returns null for an unrecognized currency', () => {
    expect(estimateLandedKes(10, 'XYZ')).toBeNull()
  })
  it('returns null when price or currency is missing', () => {
    expect(estimateLandedKes(null, 'GBP')).toBeNull()
    expect(estimateLandedKes(10, null)).toBeNull()
  })
})
