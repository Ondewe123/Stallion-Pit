import { useState, useEffect, useCallback } from 'react'
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import { useVehicle } from '../contexts/VehicleContext'
import { supabase } from '../lib/supabase'

const RANGES = [{ k: '3', mo: 3 }, { k: '6', mo: 6 }, { k: '12', mo: 12 }, { k: 'All', mo: null }]
const monthKey = (d) => (d ? d.slice(0, 7) : null)
const round2 = (n) => Math.round(n * 100) / 100

const AXIS = { fontSize: 11, fill: '#8a8a8a' }
const GRID = '#2a2a2a'
const TIP = { background: '#161616', border: '1px solid #333', borderRadius: 4, fontSize: 12 }

// rolling corrected metric over the last K fills (partial-fill safe)
function rolling(fuelAsc, K, valueFn) {
  const pts = []
  for (let i = K; i < fuelAsc.length; i++) {
    const dist = Number(fuelAsc[i].odometer_km) - Number(fuelAsc[i - K].odometer_km)
    let vol = 0, cost = 0
    for (let j = i - K + 1; j <= i; j++) {
      vol += Number(fuelAsc[j].volume_litres || 0)
      cost += Number(fuelAsc[j].total_cost_kes || 0)
    }
    if (dist > 0) { const v = valueFn(dist, vol, cost); if (v != null) pts.push({ date: fuelAsc[i].logged_at, value: v }) }
  }
  return pts
}

function ChartCard({ title, sub, children, empty }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="card-label" style={{ marginBottom: 2 }}>{title}</div>
      <div className="card-sub" style={{ marginBottom: 10 }}>{sub}</div>
      {empty ? (
        <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)' }}>
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
  const [range, setRange] = useState(RANGES[2]) // default 12 mo

  const fetchData = useCallback(async () => {
    if (!activeVehicle) return
    setRaw(null)
    const [fuel, svc, parts] = await Promise.all([
      supabase.from('fuel_logs').select('logged_at, odometer_km, volume_litres, total_cost_kes, price_per_litre_kes, derived_price_per_litre')
        .eq('vehicle_id', activeVehicle.id).order('odometer_km', { ascending: true }),
      supabase.from('service_logs').select('serviced_at, total_cost_kes').eq('vehicle_id', activeVehicle.id),
      supabase.from('parts').select('purchased_at, total_cost_kes').eq('vehicle_id', activeVehicle.id),
    ])
    setRaw({ fuel: fuel.data || [], svc: svc.data || [], parts: parts.data || [] })
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

  const cutoff = range.mo
    ? (() => { const d = new Date(); d.setMonth(d.getMonth() - range.mo); return d.toISOString().split('T')[0] })()
    : '0000-01-01'
  const inRange = (d) => d && d >= cutoff

  const fuelAsc = raw.fuel
  const consumption = rolling(fuelAsc, 3, (dist, vol) => vol > 0 ? round2(vol / dist * 100) : null).filter(p => inRange(p.date))
  const costPerKm = rolling(fuelAsc, 3, (dist, _v, cost) => cost > 0 ? round2(cost / dist) : null).filter(p => inRange(p.date))
  const ppl = fuelAsc
    .map(f => ({ date: f.logged_at, value: Number(f.derived_price_per_litre ?? f.price_per_litre_kes) || null }))
    .filter(p => p.value && inRange(p.date))

  const byMonth = {}
  const addM = (d, key, amt) => {
    const m = monthKey(d); if (!m || !inRange(d)) return
    byMonth[m] = byMonth[m] || { month: m, fuel: 0, service: 0, parts: 0 }
    byMonth[m][key] += amt
  }
  raw.fuel.forEach(f => addM(f.logged_at, 'fuel', Number(f.total_cost_kes || 0)))
  raw.svc.forEach(s => addM(s.serviced_at, 'service', Number(s.total_cost_kes || 0)))
  raw.parts.forEach(p => addM(p.purchased_at, 'parts', Number(p.total_cost_kes || 0)))
  const months = Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month))

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h2>Analysis</h2>
          <p className="page-sub">{activeVehicle.name} · {activeVehicle.year} {activeVehicle.make} {activeVehicle.model}</p>
        </div>
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
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="date" tick={AXIS} minTickGap={40} tickLine={false} axisLine={{ stroke: GRID }} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} width={40} />
            <Tooltip contentStyle={TIP} labelStyle={{ color: '#aaa' }} />
            <Line type="monotone" dataKey="value" name="L/100km" stroke="#c9a227" strokeWidth={2} dot={false} />
          </LineChart>
        </ChartCard>

        <ChartCard title="Monthly Spend" sub="fuel · service · parts (KES)" empty={months.length < 1}>
          <BarChart data={months} margin={{ top: 6, right: 12, bottom: 0, left: -8 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="month" tick={AXIS} minTickGap={24} tickLine={false} axisLine={{ stroke: GRID }} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} width={48} />
            <Tooltip contentStyle={TIP} labelStyle={{ color: '#aaa' }} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="fuel" stackId="s" fill="#f39c12" />
            <Bar dataKey="service" stackId="s" fill="#27ae60" />
            <Bar dataKey="parts" stackId="s" fill="#b07cc6" />
          </BarChart>
        </ChartCard>

        <ChartCard title="Price per Litre" sub="KES/L at each fill" empty={ppl.length < 2}>
          <LineChart data={ppl} margin={{ top: 6, right: 12, bottom: 0, left: -8 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="date" tick={AXIS} minTickGap={40} tickLine={false} axisLine={{ stroke: GRID }} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} width={40} domain={['auto', 'auto']} />
            <Tooltip contentStyle={TIP} labelStyle={{ color: '#aaa' }} />
            <Line type="monotone" dataKey="value" name="KES/L" stroke="#4aa3df" strokeWidth={2} dot={false} />
          </LineChart>
        </ChartCard>

        <ChartCard title="Running Cost" sub="KES/km · rolling 3-fill" empty={costPerKm.length < 2}>
          <LineChart data={costPerKm} margin={{ top: 6, right: 12, bottom: 0, left: -8 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="date" tick={AXIS} minTickGap={40} tickLine={false} axisLine={{ stroke: GRID }} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} width={40} />
            <Tooltip contentStyle={TIP} labelStyle={{ color: '#aaa' }} />
            <Line type="monotone" dataKey="value" name="KES/km" stroke="#e0794a" strokeWidth={2} dot={false} />
          </LineChart>
        </ChartCard>
      </div>
    </div>
  )
}
