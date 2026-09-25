import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useVehicle } from '../contexts/VehicleContext'
import { supabase } from '../lib/supabase'
import { evaluate as evalMaint } from '../lib/calc/maintenance'
import { correctedConsumption as consumption, fillRangeKm } from '../lib/calc/consumption'
import { kmThisMonth, avgKmPerMonth } from '../lib/calc/distance'
import { fuelUsedByVehicle, fuelPeriods } from '../lib/calc/fuelUsage'
import '../styles/dashboard.css'

const kes = (n) => Number(n || 0).toLocaleString()
const ACTIVE_SNAG = ['Open', 'In Progress']

export default function Dashboard() {
  const { vehicles, activeVehicle } = useVehicle()
  const navigate = useNavigate()
  const [data, setData] = useState(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [fuel, svc, parts, snags, maint] = await Promise.all([
        supabase.from('fuel_logs').select('vehicle_id, logged_at, odometer_km, volume_litres, total_cost_kes, exclude_from_economy'),
        supabase.from('service_logs').select('vehicle_id, serviced_at, odometer_km, total_cost_kes, category'),
        supabase.from('parts').select('vehicle_id, purchased_at, total_cost_kes, part_name'),
        supabase.from('snags').select('vehicle_id, reported_at, title, severity, status'),
        supabase.from('maintenance_schedules').select('*'),
      ])
      if (!alive) return
      setData({
        fuel: fuel.data || [],
        svc: svc.data || [],
        parts: parts.data || [],
        snags: snags.data || [],
        maint: maint.data || [],
      })
    })()
    return () => { alive = false }
  }, [])

  if (!data) return (
    <div className="page dashboard-page">
      <div className="dashboard-titlebar">
        <div>
          <h2>Dashboard</h2>
          <p className="page-sub">Fleet overview and alerts</p>
        </div>
      </div>
      <div className="placeholder-card"><p>Loading...</p></div>
    </div>
  )

  const odoBy = {}
  for (const f of data.fuel) odoBy[f.vehicle_id] = Math.max(odoBy[f.vehicle_id] || 0, Number(f.odometer_km || 0))
  for (const s of data.svc) odoBy[s.vehicle_id] = Math.max(odoBy[s.vehicle_id] || 0, Number(s.odometer_km || 0))

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const pad = (n) => String(n).padStart(2, '0')
  const ymd = (dt) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
  const monthStart = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-01`
  const since30 = new Date(today); since30.setDate(today.getDate() - 30)
  const since30Str = ymd(since30)
  const mtd = (d) => d && d >= monthStart
  const in30 = (d) => d && d >= since30Str

  const fleetOpenSnags = data.snags.filter(n => ACTIVE_SNAG.includes(n.status)).length
  const fleetOverdue = data.maint.filter(m => evalMaint(m, odoBy[m.vehicle_id]).status === 'overdue').length

  const fuelUsed = fuelUsedByVehicle(data.fuel, vehicles, new Date())
  const periods = fuelPeriods(new Date())

  const av = activeVehicle
  const avId = av?.id
  const fuelDesc = data.fuel.filter(f => f.vehicle_id === avId)
    .sort((a, b) => Number(b.odometer_km) - Number(a.odometer_km))
  const avSvc = data.svc.filter(s => s.vehicle_id === avId)
  const avParts = data.parts.filter(p => p.vehicle_id === avId)
  const avSnags = data.snags.filter(n => n.vehicle_id === avId)
  const avMaint = data.maint
    .filter(m => m.vehicle_id === avId)
    .map(m => ({ ...m, ...evalMaint(m, odoBy[avId]) }))

  const currentOdo = odoBy[avId] || 0
  const odoReadings = [
    ...fuelDesc.map(f => ({ odometer_km: f.odometer_km, date: f.logged_at })),
    ...avSvc.map(s => ({ odometer_km: s.odometer_km, date: s.serviced_at })),
  ]
  const kmMonth = kmThisMonth(odoReadings)
  const avgKmMonth = avgKmPerMonth(odoReadings)
  const lkm = consumption(fuelDesc, 10)
  const lastFill = fuelDesc[0]
  const lastFillLitres = Number(lastFill?.volume_litres || 0)
  const fillRange = fillRangeKm(lastFillLitres, lkm)
  const openSnags = avSnags.filter(n => ACTIVE_SNAG.includes(n.status))
  const overdue = avMaint.filter(m => m.status === 'overdue')
  const dueSoon = avMaint.filter(m => m.status === 'soon')
  const nextDue = [...avMaint]
    .filter(m => m.remKm != null && m.status !== 'overdue')
    .sort((a, b) => a.remKm - b.remKm)[0]

  const total = (arr, f) => arr.filter(f).reduce((s, x) => s + Number(x.total_cost_kes || 0), 0)
  const spend = {
    fuel: { mtd: total(fuelDesc, f => mtd(f.logged_at)), d30: total(fuelDesc, f => in30(f.logged_at)) },
    service: { mtd: total(avSvc, s => mtd(s.serviced_at)), d30: total(avSvc, s => in30(s.serviced_at)) },
    parts: { mtd: total(avParts, p => mtd(p.purchased_at)), d30: total(avParts, p => in30(p.purchased_at)) },
  }
  const spendTotal = {
    mtd: spend.fuel.mtd + spend.service.mtd + spend.parts.mtd,
    d30: spend.fuel.d30 + spend.service.d30 + spend.parts.d30,
  }

  const activity = [
    ...fuelDesc.map(f => ({ date: f.logged_at, type: 'Fuel', cls: 'badge-amber', text: `${Number(f.volume_litres || 0).toFixed(1)} L · KES ${kes(f.total_cost_kes)}`, to: '/fuel' })),
    ...avSvc.map(s => ({ date: s.serviced_at, type: 'Service', cls: 'badge-green', text: s.category, to: '/service' })),
    ...avSnags.map(n => ({ date: n.reported_at, type: 'Snag', cls: 'badge-red', text: n.title, to: '/snags' })),
    ...avParts.map(p => ({ date: p.purchased_at, type: 'Part', cls: 'badge-gold', text: p.part_name, to: '/parts' })),
  ].filter(a => a.date).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8)

  return (
    <div className="page dashboard-page">
      <div className="dashboard-titlebar">
        <div>
          <h2>Dashboard</h2>
          <p className="page-sub">Fleet overview and alerts</p>
        </div>
        <div className="dashboard-fleet-summary" aria-label="Fleet status">
          <div className="dashboard-fleet-stat">
            <span>Vehicles</span>
            <strong>{vehicles.length}</strong>
          </div>
          <button className="dashboard-fleet-stat dashboard-fleet-action" onClick={() => navigate('/snags')}>
            <span>Open snags</span>
            <strong className={fleetOpenSnags ? 'dashboard-danger' : ''}>{fleetOpenSnags}</strong>
          </button>
          <button className="dashboard-fleet-stat dashboard-fleet-action" onClick={() => navigate('/maintenance')}>
            <span>Overdue</span>
            <strong className={fleetOverdue ? 'dashboard-danger' : ''}>{fleetOverdue}</strong>
          </button>
        </div>
      </div>

      {!av ? (
        <>
          {vehicles.length > 0 && (
            <section className="dashboard-section">
              <div className="dashboard-section-heading">
                <div>
                  <h3>Fuel used · per car</h3>
                  <span>{periods.lastMonthLabel} vs {periods.thisMonthLabel}</span>
                </div>
              </div>
              <div className="table-wrapper dashboard-table-shell">
                <table className="data-table dashboard-table">
                  <thead>
                    <tr>
                      <th>Vehicle</th>
                      <th>Last month ({periods.lastMonthLabel})</th>
                      <th>This month ({periods.thisMonthLabel})</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fuelUsed.map(v => (
                      <tr key={v.id} onClick={() => navigate('/fuel')}>
                        <td className="primary">{v.name}</td>
                        <td className="mono">{v.lastMonth.litres.toFixed(1)} L <span className="dashboard-faint">· KES {kes(v.lastMonth.kes)}</span></td>
                        <td className="mono">{v.thisMonth.litres.toFixed(1)} L <span className="dashboard-faint">· KES {kes(v.thisMonth.kes)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          <div className="placeholder-card"><span>◈</span><p>Select a vehicle for its dashboard</p></div>
        </>
      ) : (
        <>
          <section className="dashboard-vehicle-bar">
            <div className="dashboard-vehicle-identity">
              <h3>{av.name}</h3>
              <span>{av.year} {av.make} {av.model}</span>
            </div>
            <div className="dashboard-vehicle-status">
              <div>
                <span>Odometer</span>
                <strong>{currentOdo ? currentOdo.toLocaleString() : '—'} <small>km</small></strong>
              </div>
              <button onClick={() => navigate('/snags')}>
                <span>Open snags</span>
                <strong className={openSnags.length ? 'dashboard-warning' : ''}>{openSnags.length}</strong>
                <small>{openSnags.filter(s => ['High', 'Critical'].includes(s.severity)).length} high/critical</small>
              </button>
              <button onClick={() => navigate('/maintenance')}>
                <span>Next due</span>
                <strong className="dashboard-next-due">{nextDue ? nextDue.item : '—'}</strong>
                <small>{nextDue ? `in ${nextDue.remKm.toLocaleString()} km` : 'nothing scheduled'}</small>
              </button>
            </div>
          </section>

          {(overdue.length > 0 || dueSoon.length > 0 || openSnags.length > 0) && (
            <section className="dashboard-section dashboard-priority-section">
              <div className="dashboard-section-heading">
                <div>
                  <h3>Needs attention</h3>
                  <span>{overdue.length} overdue · {dueSoon.length} due soon · {openSnags.length} open snags</span>
                </div>
              </div>
              <div className="table-wrapper dashboard-table-shell">
                <table className="data-table dashboard-table dashboard-alert-table">
                  <tbody>
                    {overdue.map(m => (
                      <tr key={`o-${m.id}`} onClick={() => navigate('/maintenance')}>
                        <td><span className="badge badge-red">Overdue</span></td>
                        <td className="primary">{m.item}</td>
                        <td className="mono">OVERDUE by {Math.abs(Math.round(m.remKm)).toLocaleString()} km</td>
                      </tr>
                    ))}
                    {dueSoon.map(m => (
                      <tr key={`s-${m.id}`} onClick={() => navigate('/maintenance')}>
                        <td><span className="badge badge-amber">Due soon</span></td>
                        <td className="primary">{m.item}</td>
                        <td className="mono">{m.remKm != null ? `in ${Math.round(m.remKm).toLocaleString()} km` : ''}</td>
                      </tr>
                    ))}
                    {openSnags.slice(0, 5).map(n => (
                      <tr key={`n-${n.vehicle_id}-${n.title}`} onClick={() => navigate('/snags')}>
                        <td><span className={`badge ${n.severity === 'Critical' ? 'badge-red' : n.severity === 'High' ? 'badge-amber' : 'badge'}`}>{n.severity}</span></td>
                        <td className="primary">{n.title}</td>
                        <td className="mono">{n.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="dashboard-metric-strip" aria-label="Vehicle operating metrics">
            <div className="dashboard-metric">
              <span>Distance this month</span>
              <strong>{kmMonth != null ? Math.round(kmMonth).toLocaleString() : '—'} <small>km</small></strong>
              <small>{avgKmMonth != null ? `avg ${Math.round(avgKmMonth).toLocaleString()} km/mo` : 'avg —'}</small>
            </div>
            <button className="dashboard-metric" onClick={() => navigate('/fuel')}>
              <span>Consumption</span>
              <strong>{lkm ? lkm.toFixed(2) : '—'} <small>L/100km</small></strong>
              <small>last 10 fills</small>
            </button>
            <button className="dashboard-metric" onClick={() => navigate('/fuel')}>
              <span>Last fill range</span>
              <strong>{fillRange ? Math.round(fillRange).toLocaleString() : '—'} <small>km</small></strong>
              <small>{fillRange ? `${lastFillLitres.toFixed(1)} L at last 10-fill avg` : 'needs a fill + economy'}</small>
            </button>
            <div className="dashboard-metric">
              <span>Spend · MTD</span>
              <strong>KES {kes(spendTotal.mtd)}</strong>
              <small>30 days: KES {kes(spendTotal.d30)}</small>
            </div>
          </section>

          <div className="dashboard-secondary-grid">
            {vehicles.length > 0 && (
              <section className="dashboard-section">
                <div className="dashboard-section-heading">
                  <div>
                    <h3>Fuel used · per car</h3>
                    <span>{periods.lastMonthLabel} vs {periods.thisMonthLabel}</span>
                  </div>
                </div>
                <div className="table-wrapper dashboard-table-shell">
                  <table className="data-table dashboard-table">
                    <thead>
                      <tr>
                        <th>Vehicle</th>
                        <th>Last month</th>
                        <th>This month</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fuelUsed.map(v => (
                        <tr key={v.id} onClick={() => navigate('/fuel')}>
                          <td className="primary">{v.name}</td>
                          <td className="mono">{v.lastMonth.litres.toFixed(1)} L <span className="dashboard-faint">· KES {kes(v.lastMonth.kes)}</span></td>
                          <td className="mono">{v.thisMonth.litres.toFixed(1)} L <span className="dashboard-faint">· KES {kes(v.thisMonth.kes)}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            <section className="dashboard-section">
              <div className="dashboard-section-heading">
                <div>
                  <h3>Spend · month to date</h3>
                  <span>with last 30 days comparison</span>
                </div>
              </div>
              <div className="dashboard-spend-list">
                {[
                  { label: 'Fuel', s: spend.fuel },
                  { label: 'Service', s: spend.service },
                  { label: 'Parts', s: spend.parts },
                  { label: 'Total', s: spendTotal },
                ].map(({ label, s }) => (
                  <div className="dashboard-spend-row" key={label}>
                    <span>{label}</span>
                    <strong>KES {kes(s.mtd)}</strong>
                    <small>30d {kes(s.d30)}</small>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {activity.length > 0 && (
            <section className="dashboard-section">
              <div className="dashboard-section-heading">
                <div>
                  <h3>Recent activity</h3>
                  <span>latest 8 records</span>
                </div>
              </div>
              <div className="table-wrapper dashboard-table-shell">
                <table className="data-table dashboard-table">
                  <tbody>
                    {activity.map((a, i) => (
                      <tr key={i} onClick={() => navigate(a.to)}>
                        <td className="mono dashboard-date-cell">{a.date}</td>
                        <td className="dashboard-type-cell"><span className={`badge ${a.cls}`}>{a.type}</span></td>
                        <td className="primary">{a.text}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
