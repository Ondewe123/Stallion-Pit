// Pure fuel-economy calculations — no React/Supabase deps, so they are unit-testable
// and shared across FuelLog, Dashboard and Analysis.

export const num = (x) => Number(x || 0)

// Days a row's gap hint turns amber (nudge the user to consider excluding an idle gap).
export const GAP_HINT_DAYS = 180

const DAY_MS = 86400000
// Whole calendar days between two 'YYYY-MM-DD' dates (timezone-safe). null if unparseable.
function daysBetween(fromISO, toISO) {
  if (!fromISO || !toISO) return null
  const a = Date.parse(String(fromISO).slice(0, 10) + 'T00:00:00Z')
  const b = Date.parse(String(toISO).slice(0, 10) + 'T00:00:00Z')
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  return Math.round((b - a) / DAY_MS)
}

// Split logs into runs of consecutive NON-excluded fills. A fill flagged
// exclude_from_economy breaks the chain and is omitted from every run — so no economy
// window or brim-to-brim segment ever spans across it (idle gaps / bad data).
export function segments(logs) {
  const runs = []
  let cur = []
  for (const l of logs || []) {
    if (l.exclude_from_economy) { if (cur.length) runs.push(cur); cur = []; continue }
    cur.push(l)
  }
  if (cur.length) runs.push(cur)
  return runs
}

// Annotate each fill (input sorted ASCENDING by odometer) with derived, always-fresh
// per-row values. kmSince/daysSince are factual deltas regardless of the exclude flag;
// economy values (perFill / segment) respect chain breaks.
export function withDerived(logsAsc) {
  const rows = logsAsc || []
  let prevFullOdo = null   // odometer of the last full tank in the current run
  let accVol = 0           // volume added since prevFullOdo (excl. that tank's own fill)
  return rows.map((l, i) => {
    const prev = i > 0 ? rows[i - 1] : null
    const kmSince = prev ? num(l.odometer_km) - num(prev.odometer_km) : null
    const daysSince = prev ? daysBetween(prev.logged_at, l.logged_at) : null
    const excluded = !!l.exclude_from_economy

    if (excluded) {                       // chain break: reset accumulator, no economy
      prevFullOdo = null; accVol = 0
      return { ...l, kmSince, daysSince, excluded, perFillL100: null, segmentL100: null }
    }

    const brokenBehind = !prev || !!prev.exclude_from_economy
    const vol = num(l.volume_litres)
    const perFillL100 = (!brokenBehind && kmSince > 0 && vol > 0) ? (vol / kmSince) * 100 : null

    accVol += vol
    let segmentL100 = null
    if (l.is_partial === false) {         // full tank closes a brim-to-brim segment
      if (prevFullOdo != null) {
        const dist = num(l.odometer_km) - prevFullOdo
        if (dist > 0 && accVol > 0) segmentL100 = (accVol / dist) * 100
      }
      prevFullOdo = num(l.odometer_km); accVol = 0
    }
    return { ...l, kmSince, daysSince, excluded, perFillL100, segmentL100 }
  })
}

// Corrected L/100km using cumulative volume over cumulative distance.
// `logs` must be ordered newest-first (descending odometer); element [0] is the
// latest fill. Works correctly with partial fill-ups because it sums volume across
// the window and divides by the total distance, not per-fill. Break-aware: splits the
// window into runs at excluded fills and sums each run's volume over its own distance,
// so an excluded fill's volume AND the distance across it are never counted.
export function correctedConsumption(logs, windowSize) {
  if (!logs || logs.length < 2) return null
  const window = logs.slice(0, windowSize)
  let totalVolume = 0, totalKm = 0
  for (const run of segments(window)) {          // runs preserve newest-first order
    if (run.length < 2) continue
    const km = num(run[0].odometer_km) - num(run[run.length - 1].odometer_km)
    if (km <= 0) continue
    let vol = 0
    for (const l of run) vol += num(l.volume_litres)
    totalVolume += vol; totalKm += km
  }
  if (totalKm <= 0 || totalVolume <= 0) return null
  return (totalVolume / totalKm) * 100
}

// Estimated distance a given volume of fuel will cover at a known economy.
// `litres` = fuel added at the last fill; `lPer100km` = corrected consumption.
// Returns km, or null when either input is missing/non-positive.
export function fillRangeKm(litres, lPer100km) {
  const v = num(litres)
  if (!lPer100km || lPer100km <= 0 || v <= 0) return null
  return (v / lPer100km) * 100
}

// Rolling corrected metric over the last K fills (partial-fill safe).
// `fuelAsc` must be ordered oldest-first (ascending odometer). For each window the
// distance is odo[i] - odo[i-K] and volume/cost are summed over fills (i-K, i].
// `valueFn(dist, vol, cost)` returns the metric (or null to skip the point).
export function rolling(fuelAsc, K, valueFn) {
  const pts = []
  for (let i = K; i < fuelAsc.length; i++) {
    let broken = false
    for (let j = i - K; j <= i; j++) { if (fuelAsc[j].exclude_from_economy) { broken = true; break } }
    if (broken) continue
    const dist = num(fuelAsc[i].odometer_km) - num(fuelAsc[i - K].odometer_km)
    let vol = 0, cost = 0
    for (let j = i - K + 1; j <= i; j++) { vol += num(fuelAsc[j].volume_litres); cost += num(fuelAsc[j].total_cost_kes) }
    if (dist > 0) { const v = valueFn(dist, vol, cost); if (v != null) pts.push({ date: fuelAsc[i].logged_at, value: v }) }
  }
  return pts
}
