import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useVehicle } from '../contexts/VehicleContext'
import { supabase } from '../lib/supabase'

const DUE_SOON_KM = 1000
const DUE_SOON_DAYS = 30
const kes = (n) => Number(n || 0).toLocaleString()

const daysUntil = (dateStr) => {
  if (!dateStr) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.round((new Date(dateStr + 'T00:00:00') - today) / 86400000)
}

function evalMaint(item, currentOdo) {
  const remKm = item.next_due_odometer != null && currentOdo ? Number(item.next_due_odometer) - currentOdo : null
  const remDays = daysUntil(item.next_due_date)
  let status = 'ok'
  if ((remKm != null && remKm < 0) || (remDays != null && remDays < 0)) status = 'overdue'
  else if ((remKm != null && remKm <= DUE_SOON_KM) || (remDays != null && remDays <= DUE_SOON_DAYS)) status = 'soon'
  return { remKm, remDays, status }
}

// corrected L/100km over the most-recent n fills (descending by odometer)
function consumption(fuelDesc, n) {
  const w = fuelDesc.slice(0, n)
  if (w.length < 2) return null
  const vol = w.reduce((s, l) => s + Number(l.volume_litres || 0), 0)
  const km = Number(w[0].odometer_km) - Number(w[w.length - 1].odometer_km)
  if (km <= 0 || vol <= 0) return null
  return (vol / km) * 100
}

const ACTIVE_SNAG = ['Open', 'In Progress']

export default function Dashboard() {
  const { vehicles, activeVehicle } = useVehicle()
  const navigate = useNavigate()
  const [data, setData] = useState(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [fuel, svc, parts, snags, maint] = await Promise.all([
        supabase.from('fuel_logs').select('vehicle_id, logged_at, odometer_km, volume_litres, total_cost_kes'),
        supabase.from('service_logs').select('vehicle_id, serviced_at, odometer_km, total_cost_kes, category'),
        supabase.from('parts').select('vehicle_id, purchased_at, total_cost_kes, part_name'),
        supabase.from('snags').select('vehicle_id, reported_at, title, severity, status'),
        supabase.from('maintenance_schedules').select('*'),
      ])
      if (!alive) return
      setData({
        fuel: fuel.data || [], svc: svc.data || [], parts: parts.data || [],
        snags: snags.data || [], maint: maint.data || [],
      })
    })()
    return () => { alive = false }
  }, [])

  if (!data) return (
    <div className="page">
      <div className="page-header"><h2>Dashboard</h2><p className="page-sub">Fleet overview and alerts</p></div>
      <div className="placeholder-card"><p>Loading...</p></div>
    </div>
  )

  // current odometer per vehicle (max across fuel + service)
  const odoBy = {}
  for (const f of data.fuel) odoBy[f.vehicle_id] = Math.max(odoBy[f.vehicle_id] || 0, Number(f.odometer_km || 0))
  for (const s of data.svc) odoBy[s.vehicle_id] = Math.max(odoBy[s.vehicle_id] || 0, Number(s.odometer_km || 0))

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const since90 = new Date(today); since90.setDate(today.getDate() - 90)
  const in90 = (d) => d && new Date(d + 'T00:00:00') >= since90

  // ---- fleet rollup ----
  const fleetFuel90 = data.fuel.filter(f => in90(f.logged_at)).reduce((s, f) => s + Number(f.total_cost_kes || 0), 0)
  const fleetOpenSnags = data.snags.filter(n => ACTIVE_SNAG.includes(n.status)).length
  const fleetOverdue = data.maint.filter(m => evalMaint(m, odoBy[m.vehicle_id]).status === 'overdue').length

  // ---- active vehicle ----
  const av = activeVehicle
  const avId = av?.id
  const fuelDesc = data.fuel.filter(f => f.vehicle_id === avId)
    .sort((a, b) => Number(b.odometer_km) - Number(a.odometer_km))
  const avSvc = data.svc.filter(s => s.vehicle_id === avId)
  const avParts = data.parts.filter(p => p.vehicle_id === avId)
  const avSnags = data.snags.filter(n => n.vehicle_id === avId)
  const avMaint = data.maint.filter(m => m.vehicle_id === avId).map(m => ({ ...m, ...evalMaint(m, odoBy[avId]) }))

  const currentOdo = odoBy[avId] || 0
  const lkm = consumption(fuelDesc, 10)
  const openSnags = avSnags.filter(n => ACTIVE_SNAG.includes(n.status))
  const overdue = avMaint.filter(m => m.status === 'overdue')
  const dueSoon = avMaint.filter(m => m.status === 'soon')
  const nextDue = [...avMaint].filter(m => m.remKm != null && m.status !== 'overdue')
    .sort((a, b) => a.remKm - b.remKm)[0]

  const total = (arr, f = () => true) => arr.filter(f).reduce((s, x) => s + Number(x.total_cost_kes || 0), 0)
  const spend = {
    fuel: total(fuelDesc, f => in90(f.logged_at)),
    service: total(avSvc, s => in90(s.serviced_at)),
    parts: total(avParts, p => in90(p.purchased_at)),
  }

  const activity = [
    ...fuelDesc.map(f => ({ date: f.logged_at, type: 'Fuel', cls: 'badge-amber', text: `${Number(f.volume_litres || 0).toFixed(1)} L · KES ${kes(f.total_cost_kes)}`, to: '/fuel' })),
    ...avSvc.map(s => ({ date: s.serviced_at, type: 'Service', cls: 'badge-green', text: s.category, to: '/service' })),
    ...avSnags.map(n => ({ date: n.reported_at, type: 'Snag', cls: 'badge-red', text: n.title, to: '/snags' })),
    ...avParts.map(p => ({ date: p.purchased_at, type: 'Part', cls: 'badge-gold', text: p.part_name, to: '/parts' })),
  ].filter(a => a.date).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8)

  return (
    <div className="page">
      <div className="page-header"><h2>Dashboard</h2><p className="page-sub">Fleet overview and alerts</p></div>

      {/* ---- fleet strip ---- */}
      <div className="fuel-stats-grid">
        <div className="card"><div className="card-label">Vehicles</div><div className="card-value">{vehicles.length}</div><div className="card-sub">in the fleet</div></div>
        <div className="card"><div className="card-label">Fuel · 90d</div><div className="card-value">{kes(fleetFuel90)} <span style={{ fontSize: 14, color: 'var(--text-mid)' }}>KES</span></div><div className="card-sub">last 90 days, all vehicles</div></div>
        <div className="card" style={{ cursor: 'pointer' }} onClick={() => navigate('/snags')}>
          <div className="card-label">Open Snags</div>
          <div className="card-value" style={{ color: fleetOpenSnags ? '#e74c3c' : undefined }}>{fleetOpenSnags}</div>
          <div className="card-sub">fleet-wide</div>
        </div>
        <div className="card" style={{ cursor: 'pointer' }} onClick={() => navigate('/maintenance')}>
          <div className="card-label">Overdue Maint.</div>
          <div className="card-value" style={{ color: fleetOverdue ? '#e74c3c' : undefined }}>{fleetOverdue}</div>
          <div className="card-sub">fleet-wide</div>
        </div>
      </div>

      {!av ? (
        <div className="placeholder-card"><span>◈</span><p>Select a vehicle for its dashboard</p></div>
      ) : (
        <>
          <div className="page-header" style={{ marginTop: 28 }}>
            <h3 style={{ margin: 0 }}>{av.name}</h3>
            <p className="page-sub">{av.year} {av.make} {av.model}{currentOdo ? ` · ${currentOdo.toLocaleString()} km` : ''}</p>
          </div>

          {/* active vehicle key stats */}
          <div className="fuel-stats-grid">
            <div className="card"><div className="card-label">Current Odometer</div><div className="card-value">{currentOdo ? currentOdo.toLocaleString() : '—'} <span style={{ fontSize: 14, color: 'var(--text-mid)' }}>km</span></div><div className="card-sub">latest recorded</div></div>
            <div className="card" style={{ cursor: 'pointer' }} onClick={() => navigate('/fuel')}>
              <div className="card-label">Consumption</div>
              <div className="card-value">{lkm ? lkm.toFixed(2) : '—'} <span style={{ fontSize: 13, color: 'var(--text-mid)' }}>L/100km</span></div>
              <div className="card-sub">last 10 fills</div>
            </div>
            <div className="card" style={{ cursor: 'pointer' }} onClick={() => navigate('/snags')}>
              <div className="card-label">Open Snags</div>
              <div className="card-value" style={{ color: openSnags.length ? '#f39c12' : undefined }}>{openSnags.length}</div>
              <div className="card-sub">{openSnags.filter(s => ['High', 'Critical'].includes(s.severity)).length} high/critical</div>
            </div>
            <div className="card" style={{ cursor: 'pointer' }} onClick={() => navigate('/maintenance')}>
              <div className="card-label">Next Due</div>
              <div className="card-value" style={{ fontSize: 16 }}>{nextDue ? nextDue.item : '—'}</div>
              <div className="card-sub">{nextDue ? `in ${nextDue.remKm.toLocaleString()} km` : 'nothing scheduled'}</div>
            </div>
          </div>

          {/* alerts */}
          {(overdue.length > 0 || dueSoon.length > 0 || openSnags.length > 0) && (
            <div className="dash-alerts" style={{ marginTop: 24 }}>
              <h3 style={{ marginBottom: 12 }}>Alerts</h3>
              <div className="table-wrapper">
                <table className="data-table">
                  <tbody>
                    {overdue.map(m => (
                      <tr key={`o-${m.id}`} style={{ cursor: 'pointer' }} onClick={() => navigate('/maintenance')}>
                        <td><span className="badge badge-red">Overdue</span></td>
                        <td className="primary">{m.item}</td>
                        <td className="mono" style={{ fontSize: 12 }}>OVERDUE by {Math.abs(Math.round(m.remKm)).toLocaleString()} km</td>
                      </tr>
                    ))}
                    {dueSoon.map(m => (
                      <tr key={`s-${m.id}`} style={{ cursor: 'pointer' }} onClick={() => navigate('/maintenance')}>
                        <td><span className="badge badge-amber">Due soon</span></td>
                        <td className="primary">{m.item}</td>
                        <td className="mono" style={{ fontSize: 12 }}>{m.remKm != null ? `in ${Math.round(m.remKm).toLocaleString()} km` : ''}</td>
                      </tr>
                    ))}
                    {openSnags.slice(0, 5).map(n => (
                      <tr key={`n-${n.vehicle_id}-${n.title}`} style={{ cursor: 'pointer' }} onClick={() => navigate('/snags')}>
                        <td><span className={`badge ${n.severity === 'Critical' ? 'badge-red' : n.severity === 'High' ? 'badge-amber' : 'badge'}`}>{n.severity}</span></td>
                        <td className="primary">{n.title}</td>
                        <td className="mono" style={{ fontSize: 12 }}>{n.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* spend — last 90 days only (lifetime totals intentionally omitted) */}
          <h3 style={{ marginTop: 24, marginBottom: 12 }}>Spend · last 90 days</h3>
          <div className="fuel-stats-grid">
            {[
              { label: 'Fuel', v: spend.fuel }, { label: 'Service', v: spend.service }, { label: 'Parts', v: spend.parts },
              { label: 'Total', v: spend.fuel + spend.service + spend.parts },
            ].map(({ label, v }) => (
              <div className="card" key={label}>
                <div className="card-label">{label}</div>
                <div className="card-value">{kes(v)} <span style={{ fontSize: 13, color: 'var(--text-mid)' }}>KES</span></div>
                <div className="card-sub">last 90 days</div>
              </div>
            ))}
          </div>

          {/* recent activity */}
          {activity.length > 0 && (
            <>
              <h3 style={{ marginTop: 24, marginBottom: 12 }}>Recent Activity</h3>
              <div className="table-wrapper">
                <table className="data-table">
                  <tbody>
                    {activity.map((a, i) => (
                      <tr key={i} style={{ cursor: 'pointer' }} onClick={() => navigate(a.to)}>
                        <td className="mono" style={{ fontSize: 12, width: 96 }}>{a.date}</td>
                        <td style={{ width: 90 }}><span className={`badge ${a.cls}`}>{a.type}</span></td>
                        <td className="primary">{a.text}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
