import { useState, useEffect, useCallback } from 'react'
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import { useVehicle } from '../contexts/VehicleContext'
import { supabase } from '../lib/supabase'
import { num, rolling } from '../lib/calc/consumption'
import { fuelUsedTotals, fuelPeriods } from '../lib/calc/fuelUsage'
import { useChartTheme } from '../lib/chartTheme'

const RANGES = [{ k: '3', mo: 3 }, { k: '6', mo: 6 }, { k: '12', mo: 12 }, { k: 'All', mo: null }]
const round2 = (n) => Math.round(n * 100) / 100

const kes = (x) => x == null ? '—' : Math.round(num(x)).toLocaleString()
const f1 = (x) => x == null ? '—' : num(x).toFixed(1)
const f2 = (x) => x == null ? '—' : num(x).toFixed(2)
const km = (x) => x == null ? '—' : Math.round(num(x)).toLocaleString()

function Stat({ label, value, unit, sub }) {
  return (
    <div className="card">
      <div className="card-label">{label}</div>
      <div className="card-value">{value}{unit && <span style={{ fontSize: 13, color: 'var(--text-muted)' }}> {unit}</span>}</div>
      {sub && <div className="card-sub">{sub}</div>}
    </div>
  )
}

function ChartCard({ title, sub, children, empty }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="card-label" style={{ marginBottom: 2 }}>{title}</div>
      <div className="card-sub" style={{ marginBottom: 10 }}>{sub}</div>
      {empty ? (
        <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint)' }}>
          Not enough data for this range
        </div>
      ) : (
        <div style={{ height: 240, width: '100%' }}><ResponsiveContainer width="100%" height="100%" minWidth={0}>{children}</ResponsiveContainer></div>
      )}
    </div>
  )
}

export default function Analysis() {
  const { activeVehicle } = useVehicle()
  const [raw, setRaw] = useState(null)
  const [range, setRange] = useState(RANGES[2]) // charts default 12 mo
  const chart = useChartTheme()

  const fetchData = useCallback(async () => {
    if (!activeVehicle) return
    setRaw(null)
    const [fuel, svc, parts, allFuel] = await Promise.all([
      supabase.from('fuel_logs').select('logged_at, odometer_km, volume_litres, total_cost_kes, price_per_litre_kes, derived_price_per_litre, exclude_from_economy')
        .eq('vehicle_id', activeVehicle.id).order('odometer_km', { ascending: true }),
      supabase.from('service_logs').select('serviced_at, total_cost_kes, category').eq('vehicle_id', activeVehicle.id),
      supabase.from('parts').select('purchased_at, total_cost_kes').eq('vehicle_id', activeVehicle.id),
      supabase.from('fuel_logs').select('logged_at, volume_litres, total_cost_kes'), // all vehicles (RLS-scoped) for the fleet total
    ])
    setRaw({ fuel: fuel.data || [], svc: svc.data || [], parts: parts.data || [], allFuel: allFuel.data || [] })
  }, [activeVehicle])

  useEffect(() => { fetchData() }, [fetchData])

  if (!activeVehicle) return (
    <div className="page">
      <div className="page-header"><h2>Analysis</h2></div>
      <div className="placeholder-card"><span>📊</span><p>Select a vehicle to view analytics</p></div>
    </div>
  )
  if (!raw) return (
    <div className="page">
      <div className="page-header"><h2>Analysis</h2></div>
      <div className="placeholder-card"><p>Loading...</p></div>
    </div>
  )

  const f = raw.fuel
  const n = f.length

  if (n < 2) return (
    <div className="page">
      <div className="page-header"><h2>Analysis</h2><p className="page-sub">{activeVehicle.name}</p></div>
      <div className="placeholder-card"><span>📊</span><p>Log a few fill-ups to unlock analytics</p></div>
    </div>
  )

  // ---- lifetime figures ----
  const firstOdo = num(f[0].odometer_km)
  const lastOdo = num(f[n - 1].odometer_km)
  const distance = Math.max(0, lastOdo - firstOdo)
  const dates = f.map(x => x.logged_at).filter(Boolean).sort()
  const firstDate = dates[0] || null
  const lastDate = dates[dates.length - 1] || null
  const spanDays = firstDate && lastDate ? (new Date(lastDate) - new Date(firstDate)) / 86400000 : 0
  const spanMonths = spanDays / 30.44

  const totalVol = f.reduce((s, x) => s + num(x.volume_litres), 0)
  const totalFuelCost = f.reduce((s, x) => s + num(x.total_cost_kes), 0)
  let volAfter = 0, costAfter = 0
  for (let i = 1; i < n; i++) { volAfter += num(f[i].volume_litres); costAfter += num(f[i].total_cost_kes) }

  const svcCost = raw.svc.reduce((s, x) => s + num(x.total_cost_kes), 0)
  const partsCost = raw.parts.reduce((s, x) => s + num(x.total_cost_kes), 0)
  const upkeep = svcCost + partsCost

  const lifeLkm = distance > 0 && volAfter > 0 ? volAfter / distance * 100 : null
  const lifeCostKm = distance > 0 ? costAfter / distance : null
  const avgPpl = totalVol > 0 ? totalFuelCost / totalVol : null
  const latestPpl = num(f[n - 1].derived_price_per_litre || f[n - 1].price_per_litre_kes) || null
  const kmPerMonth = spanMonths > 0 ? distance / spanMonths : null
  const avgFillKes = totalFuelCost / n
  const avgFillL = totalVol / n
  const avgDaysBetween = n > 1 ? spanDays / (n - 1) : null
  const avgKmBetween = n > 1 ? distance / (n - 1) : null
  const upkeepPer1000 = distance > 0 ? upkeep / distance * 1000 : null

  const recentWin = f.slice(-11)
  const recentDist = num(recentWin[recentWin.length - 1].odometer_km) - num(recentWin[0].odometer_km)
  let recentVol = 0
  for (let i = 1; i < recentWin.length; i++) recentVol += num(recentWin[i].volume_litres)
  const recentLkm = recentDist > 0 && recentVol > 0 ? recentVol / recentDist * 100 : null

  // ---- records ----
  const rollAll = rolling(f, 3, (dist, vol) => vol > 0 ? round2(vol / dist * 100) : null)
  let best = null, worst = null
  for (const p of rollAll) { if (!best || p.value < best.value) best = p; if (!worst || p.value > worst.value) worst = p }
  let cheap = null, pricey = null
  for (const x of f) {
    const ppl = num(x.derived_price_per_litre || x.price_per_litre_kes)
    if (ppl > 0 && (!cheap || ppl < cheap.v)) cheap = { v: ppl, date: x.logged_at }
    const c = num(x.total_cost_kes)
    if (!pricey || c > pricey.v) pricey = { v: c, date: x.logged_at }
  }

  // ---- by year ----
  const yrs = {}
  const yr = (y) => (yrs[y] = yrs[y] || { year: y, dist: 0, vol: 0, fuel: 0, up: 0 })
  for (let i = 0; i < n; i++) {
    const x = f[i]; const y = x.logged_at?.slice(0, 4); if (!y) continue
    const b = yr(y)
    const kmsl = i > 0 ? num(x.odometer_km) - num(f[i - 1].odometer_km) : 0
    if (kmsl > 0) b.dist += kmsl
    b.vol += num(x.volume_litres); b.fuel += num(x.total_cost_kes)
  }
  raw.svc.forEach(s => { const y = s.serviced_at?.slice(0, 4); if (y) yr(y).up += num(s.total_cost_kes) })
  raw.parts.forEach(p => { const y = p.purchased_at?.slice(0, 4); if (y) yr(y).up += num(p.total_cost_kes) })
  const yearRows = Object.values(yrs).sort((a, b) => b.year.localeCompare(a.year))

  // ---- service categories ----
  const cats = {}
  raw.svc.forEach(s => { const c = s.category || 'Other'; cats[c] = cats[c] || { cat: c, count: 0, cost: 0 }; cats[c].count++; cats[c].cost += num(s.total_cost_kes) })
  const catRows = Object.values(cats).sort((a, b) => b.cost - a.cost)

  // ---- range-filtered chart series ----
  const cutoff = range.mo
    ? (() => { const d = new Date(); d.setMonth(d.getMonth() - range.mo); return d.toISOString().split('T')[0] })()
    : '0000-01-01'
  const inRange = (d) => d && d >= cutoff
  const consumption = rolling(f, 3, (dist, vol) => vol > 0 ? round2(vol / dist * 100) : null).filter(p => inRange(p.date))
  const costPerKm = rolling(f, 3, (dist, _v, cost) => cost > 0 ? round2(cost / dist) : null).filter(p => inRange(p.date))
  const pplSeries = f.map(x => ({ date: x.logged_at, value: num(x.derived_price_per_litre ?? x.price_per_litre_kes) || null }))
    .filter(p => p.value && inRange(p.date))
  const byMonth = {}
  const addM = (d, key, amt) => { const m = d ? d.slice(0, 7) : null; if (!m || !inRange(d)) return; byMonth[m] = byMonth[m] || { month: m, fuel: 0, service: 0, parts: 0 }; byMonth[m][key] += amt }
  raw.fuel.forEach(x => addM(x.logged_at, 'fuel', num(x.total_cost_kes)))
  raw.svc.forEach(x => addM(x.serviced_at, 'service', num(x.total_cost_kes)))
  raw.parts.forEach(x => addM(x.purchased_at, 'parts', num(x.total_cost_kes)))
  const months = Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month))

  // ---- fleet fuel used (all vehicles) — the all-cars total moved here off the Dashboard ----
  const fleetFuel = fuelUsedTotals(raw.allFuel, new Date())
  const periods = fuelPeriods(new Date())

  return (
    <div className="page">
      <div className="page-header">
        <h2>Analysis</h2>
        <p className="page-sub">{activeVehicle.name} · {n} fills · {firstDate} → {lastDate}</p>
      </div>

      {/* ---- fleet fuel used (all vehicles) ---- */}
      <h3 style={{ marginBottom: 12 }}>Fleet fuel used · all vehicles</h3>
      <div className="fuel-stats-grid">
        <Stat label={`Last month (${periods.lastMonthLabel})`} value={f1(fleetFuel.lastMonth.litres)} unit="L" sub={`KES ${kes(fleetFuel.lastMonth.kes)}`} />
        <Stat label={`This month (${periods.thisMonthLabel})`} value={f1(fleetFuel.thisMonth.litres)} unit="L" sub={`KES ${kes(fleetFuel.thisMonth.kes)}`} />
      </div>


      {/* ---- key figures (lifetime) ---- */}
      <h3 style={{ marginBottom: 12 }}>Key Figures</h3>
      <div className="fuel-stats-grid">
        <Stat label="Consumption" value={f2(lifeLkm)} unit="L/100km" sub={recentLkm ? `recent: ${f2(recentLkm)}` : 'lifetime avg'} />
        <Stat label="Cost / km" value={f2(lifeCostKm)} unit="KES" sub="fuel only" />
        <Stat label="Avg Price / L" value={f1(avgPpl)} unit="KES" sub={latestPpl ? `latest: ${f1(latestPpl)}` : ''} />
        <Stat label="Distance" value={km(distance)} unit="km" sub={kmPerMonth ? `${km(kmPerMonth)} km/mo` : ''} />
        <Stat label="Fuel Used" value={km(totalVol)} unit="L" sub={`${n} fills`} />
        <Stat label="Avg Fill" value={kes(avgFillKes)} unit="KES" sub={`${f1(avgFillL)} L`} />
        <Stat label="Between Fills" value={avgDaysBetween ? Math.round(avgDaysBetween) : '—'} unit="days" sub={avgKmBetween ? `${km(avgKmBetween)} km` : ''} />
        <Stat label="Upkeep / 1000km" value={kes(upkeepPer1000)} unit="KES" sub={`${raw.svc.length} services`} />
      </div>

      {/* ---- records ---- */}
      <h3 style={{ marginTop: 24, marginBottom: 12 }}>Records</h3>
      <div className="fuel-stats-grid">
        <Stat label="Best Economy" value={best ? f2(best.value) : '—'} unit="L/100km" sub={best ? best.date : '3-fill stretch'} />
        <Stat label="Worst Economy" value={worst ? f2(worst.value) : '—'} unit="L/100km" sub={worst ? worst.date : '3-fill stretch'} />
        <Stat label="Cheapest Fuel" value={cheap ? f1(cheap.v) : '—'} unit="KES/L" sub={cheap ? cheap.date : ''} />
        <Stat label="Priciest Fill" value={pricey ? kes(pricey.v) : '—'} unit="KES" sub={pricey ? pricey.date : ''} />
      </div>

      {/* ---- by year ---- */}
      <h3 style={{ marginTop: 24, marginBottom: 12 }}>By Year</h3>
      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Year</th><th>Distance</th><th>Fuel (L)</th><th>L/100km</th>
              <th>Fuel (KES)</th><th>Service+Parts</th><th>Cost/km</th>
            </tr>
          </thead>
          <tbody>
            {yearRows.map(y => {
              const lkm = y.dist > 0 && y.vol > 0 ? y.vol / y.dist * 100 : null
              const ckm = y.dist > 0 ? y.fuel / y.dist : null
              return (
                <tr key={y.year}>
                  <td className="primary">{y.year}</td>
                  <td className="mono">{km(y.dist)} km</td>
                  <td className="mono">{f1(y.vol)}</td>
                  <td className="mono">{f2(lkm)}</td>
                  <td className="mono">{kes(y.fuel)}</td>
                  <td className="mono">{kes(y.up)}</td>
                  <td className="mono">{f2(ckm)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ---- service categories ---- */}
      {catRows.length > 0 && (
        <>
          <h3 style={{ marginTop: 24, marginBottom: 12 }}>Service Spend by Category</h3>
          <div className="table-wrapper">
            <table className="data-table">
              <thead><tr><th>Category</th><th>Times</th><th>Total (KES)</th></tr></thead>
              <tbody>
                {catRows.map(c => (
                  <tr key={c.cat}>
                    <td className="primary">{c.cat}</td>
                    <td className="mono">{c.count}</td>
                    <td className="mono">{kes(c.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ---- trends (range toggle) ---- */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <h3 style={{ margin: 0 }}>Trends</h3>
        <div className="consumption-windows">
          {RANGES.map(r => (
            <button key={r.k} className={`window-btn ${range.k === r.k ? 'window-btn-active' : ''}`}
              onClick={() => setRange(r)}>{r.k === 'All' ? 'All' : `${r.k}mo`}</button>
          ))}
        </div>
      </div>

      <div className="analysis-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: 16 }}>
        <ChartCard title="Fuel Consumption" sub="L/100km · rolling 3-fill corrected" empty={consumption.length < 2}>
          <LineChart data={consumption} margin={{ top: 6, right: 12, bottom: 0, left: -8 }}>
            <CartesianGrid stroke={chart.grid} vertical={false} />
            <XAxis dataKey="date" tick={chart.axis} minTickGap={40} tickLine={false} axisLine={{ stroke: chart.grid }} />
            <YAxis tick={chart.axis} tickLine={false} axisLine={false} width={40} />
            <Tooltip contentStyle={chart.tooltip.contentStyle} labelStyle={chart.tooltip.labelStyle} />
            <Line type="monotone" dataKey="value" name="L/100km" stroke={chart.series[1]} strokeWidth={2} dot={false} />
          </LineChart>
        </ChartCard>

        <ChartCard title="Monthly Spend" sub="fuel · service · parts (KES)" empty={months.length < 1}>
          <BarChart data={months} margin={{ top: 6, right: 12, bottom: 0, left: -8 }}>
            <CartesianGrid stroke={chart.grid} vertical={false} />
            <XAxis dataKey="month" tick={chart.axis} minTickGap={24} tickLine={false} axisLine={{ stroke: chart.grid }} />
            <YAxis tick={chart.axis} tickLine={false} axisLine={false} width={48} />
            <Tooltip contentStyle={chart.tooltip.contentStyle} labelStyle={chart.tooltip.labelStyle} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="fuel" stackId="s" fill={chart.series[4]} />
            <Bar dataKey="service" stackId="s" fill={chart.series[5]} />
            <Bar dataKey="parts" stackId="s" fill={chart.series[6]} />
          </BarChart>
        </ChartCard>

        <ChartCard title="Price per Litre" sub="KES/L at each fill" empty={pplSeries.length < 2}>
          <LineChart data={pplSeries} margin={{ top: 6, right: 12, bottom: 0, left: -8 }}>
            <CartesianGrid stroke={chart.grid} vertical={false} />
            <XAxis dataKey="date" tick={chart.axis} minTickGap={40} tickLine={false} axisLine={{ stroke: chart.grid }} />
            <YAxis tick={chart.axis} tickLine={false} axisLine={false} width={40} domain={['auto', 'auto']} />
            <Tooltip contentStyle={chart.tooltip.contentStyle} labelStyle={chart.tooltip.labelStyle} />
            <Line type="monotone" dataKey="value" name="KES/L" stroke={chart.series[2]} strokeWidth={2} dot={false} />
          </LineChart>
        </ChartCard>

        <ChartCard title="Running Cost" sub="KES/km · rolling 3-fill" empty={costPerKm.length < 2}>
          <LineChart data={costPerKm} margin={{ top: 6, right: 12, bottom: 0, left: -8 }}>
            <CartesianGrid stroke={chart.grid} vertical={false} />
            <XAxis dataKey="date" tick={chart.axis} minTickGap={40} tickLine={false} axisLine={{ stroke: chart.grid }} />
            <YAxis tick={chart.axis} tickLine={false} axisLine={false} width={40} />
            <Tooltip contentStyle={chart.tooltip.contentStyle} labelStyle={chart.tooltip.labelStyle} />
            <Line type="monotone" dataKey="value" name="KES/km" stroke={chart.series[3]} strokeWidth={2} dot={false} />
          </LineChart>
        </ChartCard>
      </div>
    </div>
  )
}
