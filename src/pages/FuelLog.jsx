import { useState, useEffect, useCallback } from 'react'
import { useVehicle } from '../contexts/VehicleContext'
import { supabase } from '../lib/supabase'

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
}

// Corrected L/100km using cumulative volume over cumulative distance
// Works correctly with partial fill-ups
function computeCorrectedConsumption(logs, windowSize) {
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

function ConsumptionBadge({ logs }) {
  const [window, setWindow] = useState(10)
  const windows = [5, 10, 20, 'All']

  const getConsumption = (w) => {
    const size = w === 'All' ? logs.length : w
    return computeCorrectedConsumption(logs, size)
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
          style={{ background: 'var(--charcoal)', color: 'var(--gold)', fontWeight: '500', cursor: 'not-allowed' }} />
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

  const clean = (form) => {
    const out = { ...form }
    Object.keys(out).forEach(k => { if (out[k] === '') out[k] = null })
    out.vehicle_id = activeVehicle.id
    delete out.derived_ppl
    return out
  }

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

      {/* Quick stats */}
      {logs.length > 0 && (
        <div className="fuel-stats-grid">
          <div className="card">
            <div className="card-label">Last Fill</div>
            <div className="card-value">
              {Number(logs[0].total_cost_kes).toLocaleString()} <span style={{ fontSize: 14, color: 'var(--text-mid)' }}>KES</span>
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
            <div className="card-value">{Number(logs[0].odometer_km).toLocaleString()} <span style={{ fontSize: 14, color: 'var(--text-mid)' }}>km</span></div>
            <div className="card-sub">
              {logs[0].km_since_last ? `+${logs[0].km_since_last.toLocaleString()} km since last fill` : 'First entry'}
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
                <th>Total (KES)</th>
                <th>KES/L</th>
                <th>Type</th>
                <th>Station</th>
                <th>Mode</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id}>
                  <td className="mono">{log.logged_at}</td>
                  <td className="mono primary">{Number(log.odometer_km).toLocaleString()}</td>
                  <td className="mono">{log.km_since_last ? `+${log.km_since_last.toLocaleString()}` : '—'}</td>
                  <td className="mono">{Number(log.volume_litres).toFixed(3)}</td>
                  <td className="mono">{Number(log.total_cost_kes).toLocaleString()}</td>
                  <td className="mono">{log.derived_price_per_litre ? Number(log.derived_price_per_litre).toFixed(2) : '—'}</td>
                  <td>
                    <span className={`badge ${log.is_partial ? 'badge-amber' : 'badge-green'}`}>
                      {log.is_partial ? 'Partial' : 'Full'}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-dim)', fontSize: 12 }}>{log.station || '—'}</td>
                  <td style={{ color: 'var(--text-dim)', fontSize: 12 }}>{log.driving_mode || '—'}</td>
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
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
