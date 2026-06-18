// Pure fuel-economy calculations — no React/Supabase deps, so they are unit-testable
// and shared across FuelLog, Dashboard and Analysis.

export const num = (x) => Number(x || 0)

// Corrected L/100km using cumulative volume over cumulative distance.
// `logs` must be ordered newest-first (descending odometer); element [0] is the
// latest fill. Works correctly with partial fill-ups because it sums volume across
// the window and divides by the total distance, not per-fill.
export function correctedConsumption(logs, windowSize) {
  if (!logs || logs.length < 2) return null
  const window = logs.slice(0, windowSize)
  if (window.length < 2) return null

  const totalVolume = window.reduce((sum, l) => sum + parseFloat(l.volume_litres || 0), 0)
  const maxOdo = window[0].odometer_km
  const minOdo = window[window.length - 1].odometer_km
  const totalKm = maxOdo - minOdo

  if (totalKm <= 0 || totalVolume <= 0) return null
  return (totalVolume / totalKm) * 100
}

// Rolling corrected metric over the last K fills (partial-fill safe).
// `fuelAsc` must be ordered oldest-first (ascending odometer). For each window the
// distance is odo[i] - odo[i-K] and volume/cost are summed over fills (i-K, i].
// `valueFn(dist, vol, cost)` returns the metric (or null to skip the point).
export function rolling(fuelAsc, K, valueFn) {
  const pts = []
  for (let i = K; i < fuelAsc.length; i++) {
    const dist = num(fuelAsc[i].odometer_km) - num(fuelAsc[i - K].odometer_km)
    let vol = 0, cost = 0
    for (let j = i - K + 1; j <= i; j++) { vol += num(fuelAsc[j].volume_litres); cost += num(fuelAsc[j].total_cost_kes) }
    if (dist > 0) { const v = valueFn(dist, vol, cost); if (v != null) pts.push({ date: fuelAsc[i].logged_at, value: v }) }
  }
  return pts
}
