// Pure route-cost calculations — no React/Supabase deps, fully unit-testable.

export function fuelCostForVehicle(distanceKm, rollingL100, pricePerLitre) {
  if (rollingL100 == null || pricePerLitre == null) return null
  return distanceKm * (rollingL100 / 100) * pricePerLitre
}

export function runningCostForVehicle(distanceKm, runningCostKm) {
  return distanceKm * (Number(runningCostKm) || 0)
}

export function totalRouteCost(distanceKm, vehicle, rollingL100, pricePerLitre) {
  const fuelCost = fuelCostForVehicle(distanceKm, rollingL100, pricePerLitre)
  const runningCost = runningCostForVehicle(distanceKm, vehicle?.running_cost_km)
  return { fuelCost, runningCost, totalCost: fuelCost == null ? null : fuelCost + runningCost }
}

// vehiclesWithConsumption: [{ id, name, running_cost_km, rollingL100, pricePerLitre }]
export function fleetRouteCosts(distanceKm, vehiclesWithConsumption) {
  const rows = (vehiclesWithConsumption || []).map(v => {
    const { fuelCost, runningCost, totalCost } = totalRouteCost(distanceKm, v, v.rollingL100, v.pricePerLitre)
    return { id: v.id, name: v.name, fuelCost, runningCost, totalCost }
  })
  return rows.sort((a, b) => {
    if (a.totalCost == null && b.totalCost == null) return 0
    if (a.totalCost == null) return 1
    if (b.totalCost == null) return -1
    return a.totalCost - b.totalCost
  })
}
