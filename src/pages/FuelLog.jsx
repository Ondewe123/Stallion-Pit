import { useState, useEffect, useCallback } from 'react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import { useVehicle } from '../contexts/VehicleContext'
import { supabase } from '../lib/supabase'
import { correctedConsumption, rolling, num, withDerived, GAP_HINT_DAYS } from '../lib/calc/consumption'
import { cleanFuelLog } from '../lib/fuelForm'

const TREND_RANGES = [{ k: '3', mo: 3 }, { k: '6', mo: 6 }, { k: '12', mo: 12 }, { k: 'All', mo: null }]
const AXIS = { fontSize: 11, fill: '#8a8a8a' }
const GRID = '#2a2a2a'
const TIP = { background: '#161616', border: '1px solid #333', borderRadius: 4, fontSize: 12 }
const round2 = (n) => Math.round(n * 100) / 100

const EMPTY_FORM = {
  logged_at: new Date().toISOString().split('T')[0],
  odometer_km: '',
  volume_litres: '',
  total_cost_kes: '',
  price_per_litre_kes: '',
  is_partial: true,
  station: '',
  fuel_grade: '',
  has_additive: false,
  additive_name: '',
  driving_mode: 'Normal',
  notes: '',
  exclude_from_economy: false,
}

function ConsumptionBadge({ logs }) {
  const [window, setWindow] = useState(10)
  const windows = [5, 10, 20, 'All']

  const getConsumption = (w) => {
    const size = w === 'All' ? logs.length : w
    return correctedConsumption(logs, size)
  }

  const current = getConsumption(window)

  return (
    <div className="consumption-card">
      <div className="consumption-header">
        <div>
          <div className="card-label">Corrected L/100km</div>
          <div className="consumption-value">
            {current ? current.toFixed(2) : '—'}
            {current && <span className="consumption-unit"> L/100km</span>}
          </div>
          <div className="card-sub">
            {window === 'All' ? `All ${logs.length} fills` : `Last ${window} fills`} · partial fill-up corrected
          </div>
        </div>
        <div className="consumption-windows">
          {windows.map(w => (
            <button
              key={w}
              className={`window-btn ${window === w ? 'window-btn-active' : ''}`}
              onClick={() => setWindow(w)}
            >
              {w === 'All' ? 'All' : `${w}`}
            </button>
          ))}
        </div>
      </div>

      <div className="consumption-stats">
        {[5, 10, 20].map(w => {
          const val = getConsumption(w)
          return (
            <div key={w} className="consumption-stat">
              <div className="consumption-stat-label">Last {w}</div>
              <div className="consumption-stat-value">{val ? val.toFixed(2) : '—'}</div>
            </div>
          )
        })}
        <div className="consumption-stat">
          <div className="consumption-stat-label">All time</div>
          <div className="consumption-stat-value">
            {getConsumption('All') ? getConsumption('All').toFixed(2) : '—'}
          </div>
        </div>
      </div>
    </div>
  )
}

// L/100km over time — rolling 3-fill corrected economy, range-filtered to recent months.
// `logs` arrive newest-first; rolling() needs oldest-first, so we sort a copy ascending.
function ConsumptionTrend({ logs }) {
  const [range, setRange] = useState(TREND_RANGES[1]) // default: last 6 months
  const asc = [...logs].sort((a, b) => num(a.odometer_km) - num(b.odometer_km))
  const cutoff = range.mo
    ? (() => { const d = new Date(); d.setMonth(d.getMonth() - range.mo); return d.toISOString().split('T')[0] })()
    : '0000-01-01'
  const series = rolling(asc, 3, (dist, vol) => (vol > 0 ? round2((vol / dist) * 100) : null))
    .filter(p => p.date && p.date >= cutoff)

  return (
    <div className="card" style={{ padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
        <div>
          <div className="card-label">Consumption Trend</div>
          <div className="card-sub">L/100km · rolling 3-fill corrected</div>
        </div>
        <div className="consumption-windows">
          {TREND_RANGES.map(r => (
            <button key={r.k} className={`window-btn ${range.k === r.k ? 'window-btn-active' : ''}`}
              onClick={() => setRange(r)}>{r.k === 'All' ? 'All' : `${r.k}mo`}</button>
          ))}
        </div>
      </div>
      {series.length < 2 ? (
        <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint)' }}>
          Not enough fills in this range
        </div>
      ) : (
        <div style={{ height: 220, width: '100%' }}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <LineChart data={series} margin={{ top: 6, right: 12, bottom: 0, left: -8 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="date" tick={AXIS} minTickGap={40} tickLine={false} axisLine={{ stroke: GRID }} />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} width={40} domain={['auto', 'auto']} />
              <Tooltip contentStyle={TIP} labelStyle={{ color: '#aaa' }} />
              <Line type="monotone" dataKey="value" name="L/100km" stroke="#c9a227" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

function FuelForm({ initial = EMPTY_FORM, onSave, onCancel, saving, lastOdometer }) {
  const [form, setForm] = useState(() => {
    const base = { ...EMPTY_FORM, ...initial }
    // If editing a record that doesn't have price_per_litre_kes, but has total_cost_kes and volume_litres,
    // pre-calculate it for initial display.
    if (!base.price_per_litre_kes && base.volume_litres && base.total_cost_kes) {
      const ppl = parseFloat(base.total_cost_kes) / parseFloat(base.volume_litres)
      if (!isNaN(ppl)) {
        base.price_per_litre_kes = ppl.toFixed(2)
      }
    }
    return base
  })

  const [showDetails, setShowDetails] = useState(() => {
    // Expand secondary details by default if editing an entry that already has values in them
    return !!(initial.station || initial.fuel_grade || initial.has_additive || initial.notes)
  })

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }))

  // Auto-calculate volume_litres when price_per_litre_kes and total_cost_kes are filled
  useEffect(() => {
    const cost = parseFloat(form.total_cost_kes)
    const price = parseFloat(form.price_per_litre_kes)
    if (!isNaN(cost) && !isNaN(price) && price > 0) {
      const vol = cost / price
      const formatted = vol.toFixed(3)
      if (form.volume_litres !== formatted) {
        set('volume_litres', formatted)
      }
    } else {
      if (form.volume_litres !== '') {
        set('volume_litres', '')
      }
    }
  }, [form.total_cost_kes, form.price_per_litre_kes])

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave(form)
  }

  return (
    <form onSubmit={handleSubmit} className="fuel-form">
      {/* Primary fields — optimised for mobile entry */}
      <div className="form-row-2">
        <div className="form-group">
          <label>Date *</label>
          <input type="date" value={form.logged_at}
            onChange={e => set('logged_at', e.target.value)} required />
        </div>
        <div className="form-group">
          <label>Odometer (km) *</label>
          <input type="number" value={form.odometer_km}
            onChange={e => set('odometer_km', e.target.value)}
            placeholder={lastOdometer ? `Last: ${lastOdometer.toLocaleString()}` : 'e.g. 280450'}
            required />
        </div>
      </div>

      <div className="form-row-2">
        <div className="form-group">
          <label>Price / Litre (KES) *</label>
          <input type="number" step="0.01" value={form.price_per_litre_kes}
            onChange={e => set('price_per_litre_kes', e.target.value)}
            placeholder="e.g. 200.50" required />
        </div>
        <div className="form-group">
          <label>Total Cost (KES) *</label>
          <input type="number" step="0.01" value={form.total_cost_kes}
            onChange={e => set('total_cost_kes', e.target.value)}
            placeholder="e.g. 7000" required />
        </div>
      </div>

      <div className="form-group">
        <label>Volume (Litres) — Auto-calculated</label>
        <input type="number" step="0.001" value={form.volume_litres} readOnly required
          placeholder="Calculated from Cost and Price/Litre"
          style={{ background: 'var(--surface)', color: 'var(--accent)', fontWeight: '500', cursor: 'not-allowed' }} />
      </div>

      <div className="form-row-2">
        <div className="form-group">
          <label>Fill Type</label>
          <div className="toggle-group">
            <button type="button"
              className={`toggle-btn ${form.is_partial ? 'toggle-btn-active' : ''}`}
              onClick={() => set('is_partial', true)}>
              Partial
            </button>
            <button type="button"
              className={`toggle-btn ${!form.is_partial ? 'toggle-btn-active' : ''}`}
              onClick={() => set('is_partial', false)}>
              Full Tank
            </button>
          </div>
        </div>
        <div className="form-group">
          <label>Driving Mode</label>
          <select value={form.driving_mode} onChange={e => set('driving_mode', e.target.value)}>
            <option>Normal</option>
            <option>City</option>
            <option>Highway</option>
            <option>Mixed</option>
          </select>
        </div>
      </div>

      <div className="form-group">
        <label>Additive Used</label>
        <div className="toggle-group">
          <button type="button"
            className={`toggle-btn ${!form.has_additive ? 'toggle-btn-active' : ''}`}
            onClick={() => set('has_additive', false)}>No</button>
          <button type="button"
            className={`toggle-btn ${form.has_additive ? 'toggle-btn-active' : ''}`}
            onClick={() => set('has_additive', true)}>Yes</button>
        </div>
      </div>

      <div className="form-group">
        <label>Economy calculation</label>
        <div className="toggle-group">
          <button type="button"
            className={`toggle-btn ${!form.exclude_from_economy ? 'toggle-btn-active' : ''}`}
            onClick={() => set('exclude_from_economy', false)}>Include</button>
          <button type="button"
            className={`toggle-btn ${form.exclude_from_economy ? 'toggle-btn-active' : ''}`}
            onClick={() => set('exclude_from_economy', true)}>Exclude (gap / bad data)</button>
        </div>
        <div className="card-sub" style={{ marginTop: 6 }}>
          Excluded fills break the economy chain — skipped in per-row, badge, trend and analysis.
        </div>
      </div>

      {/* Toggle Button for Secondary Fields */}
      <div style={{ margin: '8px 0 20px' }}>
        <button
          type="button"
          className="btn-secondary"
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '10px',
            fontWeight: '500',
            fontSize: '12px',
            letterSpacing: '1.5px',
            textTransform: 'uppercase',
            fontFamily: 'var(--font-mono)'
          }}
          onClick={() => setShowDetails(!showDetails)}
        >
          {showDetails ? 'Hide Extra Fields ▲' : 'Show Extra Fields (Station, Grade, Notes) ▼'}
        </button>
      </div>

      {showDetails && (
        <div className="secondary-fields" style={{
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid var(--border)',
          borderRadius: '4px',
          padding: '16px',
          marginBottom: '20px'
        }}>
          <div className="form-row-2">
            <div className="form-group">
              <label>Station</label>
              <input value={form.station} onChange={e => set('station', e.target.value)}
                placeholder="e.g. Shell Westlands" />
            </div>
            <div className="form-group">
              <label>Fuel Grade</label>
              <input value={form.fuel_grade} onChange={e => set('fuel_grade', e.target.value)}
                placeholder="e.g. 91 RON, V-Power" />
            </div>
          </div>

          {form.has_additive && (
            <div className="form-group">
              <label>Additive Name</label>
              <input value={form.additive_name} onChange={e => set('additive_name', e.target.value)}
                placeholder="e.g. LIQUI MOLY Injection Cleaner" />
            </div>
          )}

          <div className="form-group">
            <label>Notes</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
              placeholder="Any notes about this fill-up..." rows={2} style={{ resize: 'vertical' }} />
          </div>
        </div>
      )}

      <div className="form-actions">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="submit" className="btn-primary"
          style={{ width: 'auto', padding: '10px 28px' }} disabled={saving}>
          {saving ? 'Saving...' : 'Save Fill-up'}
        </button>
      </div>
    </form>
  )
}

export default function FuelLog() {
  const { activeVehicle } = useVehicle()
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('list')   // list | add | edit
  const [selected, setSelected] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  const fetchLogs = useCallback(async () => {
    if (!activeVehicle) return
    setLoading(true)
    const { data } = await supabase
      .from('fuel_logs')
      .select('*')
      .eq('vehicle_id', activeVehicle.id)
      .order('odometer_km', { ascending: false })
    setLogs(data || [])
    setLoading(false)
  }, [activeVehicle])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  const clean = (form) => cleanFuelLog(form, activeVehicle.id)

  const handleAdd = async (form) => {
    setSaving(true); setError(null)
    const { error } = await supabase.from('fuel_logs').insert([clean(form)])
    if (error) { setError(error.message); setSaving(false); return }
    await fetchLogs(); setSaving(false); setView('list')
  }

  const handleEdit = async (form) => {
    setSaving(true); setError(null)
    const { error } = await supabase
      .from('fuel_logs').update(clean(form)).eq('id', selected.id)
    if (error) { setError(error.message); setSaving(false); return }
    await fetchLogs(); setSaving(false); setView('list')
  }

  const handleDelete = async (id) => {
    await supabase.from('fuel_logs').delete().eq('id', id)
    setDeleteConfirm(null)
    await fetchLogs()
  }

  const lastOdometer = logs[0]?.odometer_km || null

  // Per-row distance/economy is derived fresh from the sorted logs on every render, so it
  // stays correct after deletes/edits/reorders (the stored km_since_last trigger did not).
  const derivedById = new Map(
    withDerived([...logs].sort((a, b) => num(a.odometer_km) - num(b.odometer_km))).map(d => [d.id, d])
  )
  const latest = logs[0] ? derivedById.get(logs[0].id) : null

  if (!activeVehicle) return (
    <div className="page">
      <div className="page-header"><h2>Fuel Log</h2></div>
      <div className="placeholder-card"><span>⛽</span><p>Select a vehicle to view fuel logs</p></div>
    </div>
  )

  if (view === 'add') return (
    <div className="page">
      <div className="page-header">
        <h2>Log Fill-up</h2>
        <p className="page-sub">{activeVehicle.name} · {activeVehicle.year} {activeVehicle.make} {activeVehicle.model}</p>
      </div>
      {error && <div className="form-error">{error}</div>}
      <FuelForm onSave={handleAdd} onCancel={() => setView('list')} saving={saving} lastOdometer={lastOdometer} />
    </div>
  )

  if (view === 'edit' && selected) return (
    <div className="page">
      <div className="page-header">
        <h2>Edit Fill-up</h2>
        <p className="page-sub">{selected.logged_at} · {Number(selected.odometer_km).toLocaleString()} km</p>
      </div>
      {error && <div className="form-error">{error}</div>}
      <FuelForm
        initial={{ ...selected, logged_at: selected.logged_at?.split('T')[0] || selected.logged_at }}
        onSave={handleEdit}
        onCancel={() => setView('list')}
        saving={saving}
        lastOdometer={lastOdometer}
      />
    </div>
  )

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h2>Fuel Log</h2>
          <p className="page-sub">{activeVehicle.name} · {activeVehicle.year} {activeVehicle.make} {activeVehicle.model}</p>
        </div>
        <button className="btn-primary" style={{ width: 'auto', padding: '10px 24px' }}
          onClick={() => setView('add')}>
          + Log Fill-up
        </button>
      </div>

      {/* Consumption summary */}
      {logs.length >= 2 && <ConsumptionBadge logs={logs} />}

      {/* Consumption trend chart */}
      {logs.length >= 4 && <ConsumptionTrend logs={logs} />}

      {/* Quick stats */}
      {logs.length > 0 && (
        <div className="fuel-stats-grid">
          <div className="card">
            <div className="card-label">Last Fill</div>
            <div className="card-value">
              {Number(logs[0].total_cost_kes).toLocaleString()} <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>KES</span>
            </div>
            <div className="card-sub">{logs[0].logged_at} · {Number(logs[0].volume_litres).toFixed(2)}L</div>
          </div>
          <div className="card">
            <div className="card-label">Last Price / Litre</div>
            <div className="card-value">
              {logs[0].derived_price_per_litre
                ? `KES ${Number(logs[0].derived_price_per_litre).toFixed(2)}`
                : '—'}
            </div>
            <div className="card-sub">{logs[0].station || 'Station not recorded'}</div>
          </div>
          <div className="card">
            <div className="card-label">Current Odometer</div>
            <div className="card-value">{Number(logs[0].odometer_km).toLocaleString()} <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>km</span></div>
            <div className="card-sub">
              {latest?.kmSince ? `+${Number(latest.kmSince).toLocaleString()} km since last fill` : 'First entry'}
            </div>
          </div>
          <div className="card">
            <div className="card-label">Total Entries</div>
            <div className="card-value">{logs.length}</div>
            <div className="card-sub">
              {logs.length > 0 ? `${logs[logs.length - 1].logged_at} → ${logs[0].logged_at}` : ''}
            </div>
          </div>
        </div>
      )}

      {/* Log table */}
      {loading ? (
        <div className="placeholder-card"><p>Loading...</p></div>
      ) : logs.length === 0 ? (
        <div className="placeholder-card">
          <span>⛽</span>
          <p>No fuel logs yet — log your first fill-up</p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Odometer</th>
                <th>Km Since</th>
                <th>Volume (L)</th>
                <th>Per-fill</th>
                <th>Seg</th>
                <th>Total (KES)</th>
                <th>KES/L</th>
                <th>Type</th>
                <th>Station</th>
                <th>Mode</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => {
                const d = derivedById.get(log.id) || {}
                return (
                <tr key={log.id} style={d.excluded ? { opacity: 0.5 } : undefined}>
                  <td className="mono">{log.logged_at}</td>
                  <td className="mono primary">{Number(log.odometer_km).toLocaleString()}</td>
                  <td className="mono">
                    {d.kmSince != null ? `+${Number(d.kmSince).toLocaleString()}` : '—'}
                    {d.daysSince != null && d.daysSince > GAP_HINT_DAYS && (
                      <span style={{ color: '#e0a030', fontSize: 11 }}> · {d.daysSince}d ⚠</span>
                    )}
                  </td>
                  <td className="mono">{Number(log.volume_litres).toFixed(3)}</td>
                  <td className="mono">{d.perFillL100 != null ? `${d.perFillL100.toFixed(1)}${log.is_partial ? '~' : ''}` : '—'}</td>
                  <td className="mono">{d.segmentL100 != null ? d.segmentL100.toFixed(1) : '—'}</td>
                  <td className="mono">{Number(log.total_cost_kes).toLocaleString()}</td>
                  <td className="mono">{log.derived_price_per_litre ? Number(log.derived_price_per_litre).toFixed(2) : '—'}</td>
                  <td>
                    <span className={`badge ${log.is_partial ? 'badge-amber' : 'badge-green'}`}>
                      {log.is_partial ? 'Partial' : 'Full'}
                    </span>
                    {d.excluded && <span className="badge" style={{ marginLeft: 4 }}>excluded</span>}
                  </td>
                  <td style={{ color: 'var(--text-faint)', fontSize: 12 }}>{log.station || '—'}</td>
                  <td style={{ color: 'var(--text-faint)', fontSize: 12 }}>{log.driving_mode || '—'}</td>
                  <td>
                    <div className="row-actions">
                      <button className="row-btn" onClick={() => { setSelected(log); setView('edit') }}>Edit</button>
                      {deleteConfirm === log.id ? (
                        <>
                          <button className="row-btn row-btn-danger" onClick={() => handleDelete(log.id)}>Confirm</button>
                          <button className="row-btn" onClick={() => setDeleteConfirm(null)}>Cancel</button>
                        </>
                      ) : (
                        <button className="row-btn row-btn-danger" onClick={() => setDeleteConfirm(log.id)}>Delete</button>
                      )}
                    </div>
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
