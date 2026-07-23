import { describe, expect, it } from 'vitest'
import { fuelCostForVehicle, runningCostForVehicle, totalRouteCost, fleetRouteCosts } from './routeCost'

describe('fuelCostForVehicle', () => {
  it('computes distance * (L/100km / 100) * price per litre', () => {
    expect(fuelCostForVehicle(100, 8, 150)).toBeCloseTo(1200) // 100km * 0.08 L/km * 150 KES/L
  })
  it('returns null when consumption is unknown', () => {
    expect(fuelCostForVehicle(100, null, 150)).toBeNull()
  })
  it('returns null when fuel price is unknown', () => {
    expect(fuelCostForVehicle(100, 8, null)).toBeNull()
  })
})

describe('runningCostForVehicle', () => {
  it('computes distance * rate', () => {
    expect(runningCostForVehicle(100, 4.5)).toBeCloseTo(450)
  })
  it('treats a missing rate as 0', () => {
    expect(runningCostForVehicle(100, null)).toBe(0)
    expect(runningCostForVehicle(100, undefined)).toBe(0)
  })
})

describe('totalRouteCost', () => {
  it('sums fuel + running cost', () => {
    const result = totalRouteCost(100, { running_cost_km: 4.5 }, 8, 150)
    expect(result.fuelCost).toBeCloseTo(1200)
    expect(result.runningCost).toBeCloseTo(450)
    expect(result.totalCost).toBeCloseTo(1650)
  })
  it('propagates a null fuel cost to a null total (never silently drops it)', () => {
    const result = totalRouteCost(100, { running_cost_km: 4.5 }, null, 150)
    expect(result.fuelCost).toBeNull()
    expect(result.totalCost).toBeNull()
  })
})

describe('fleetRouteCosts', () => {
  it('sorts vehicles cheapest total first', () => {
    const rows = fleetRouteCosts(100, [
      { id: 'a', name: 'Polo', running_cost_km: 2, rollingL100: 8, pricePerLitre: 150 },
      { id: 'b', name: 'Mercedes', running_cost_km: 5, rollingL100: 12, pricePerLitre: 150 },
    ])
    expect(rows.map(r => r.id)).toEqual(['a', 'b'])
  })
  it('sorts vehicles with no fuel data last, not first', () => {
    const rows = fleetRouteCosts(100, [
      { id: 'a', name: 'No data', running_cost_km: 2, rollingL100: null, pricePerLitre: null },
      { id: 'b', name: 'Polo', running_cost_km: 2, rollingL100: 8, pricePerLitre: 150 },
    ])
    expect(rows.map(r => r.id)).toEqual(['b', 'a'])
  })
})
