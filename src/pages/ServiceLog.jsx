import { useState, useEffect, useCallback } from 'react'
import { useVehicle } from '../contexts/VehicleContext'
import { supabase } from '../lib/supabase'

const CATEGORIES = [
  'Oil Change', 'Minor Service', 'Major Service', 'Brakes', 'Tyres',
  'Suspension', 'Electrical', 'Repair', 'Inspection', 'Other',
]

const EMPTY_FORM = {
  serviced_at: new Date().toISOString().split('T')[0],
  odometer_km: '',
  category: 'Oil Change',
  description: '',
  workshop: '',
  total_cost_kes: '',
  labour_cost_kes: '',
  parts_cost_kes: '',
  next_service_note: '',
  notes: '',
}

function ServiceForm({ initial = EMPTY_FORM, onSave, onCancel, saving, lastOdometer }) {
  const [form, setForm] = useState({ ...EMPTY_FORM, ...initial })
  const set = (field, value) => setForm(f => ({ ...f, [field]: value }))

  const handleSubmit = (e) => { e.preventDefault(); onSave(form) }

  return (
    <form onSubmit={handleSubmit} className="service-form">
      <div className="form-row-2">
        <div className="form-group">
          <label>Date *</label>
          <input type="date" value={form.serviced_at}
            onChange={e => set('serviced_at', e.target.value)} required />
        </div>
        <div className="form-group">
          <label>Odometer (km)</label>
          <input type="number" value={form.odometer_km}
            onChange={e => set('odometer_km', e.target.value)}
            placeholder={lastOdometer ? `Last: ${lastOdometer.toLocaleString()}` : 'e.g. 280450'} />
        </div>
      </div>

      <div className="form-row-2">
        <div className="form-group">
          <label>Category *</label>
          <select value={form.category} onChange={e => set('category', e.target.value)} required>
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Workshop</label>
          <input value={form.workshop} onChange={e => set('workshop', e.target.value)}
            placeholder="e.g. Toyota Kenya, DIY" />
        </div>
      </div>

      <div className="form-group">
        <label>Description</label>
        <textarea value={form.description} onChange={e => set('description', e.target.value)}
          placeholder="What was done — parts, work performed..." rows={2}
          style={{ resize: 'vertical' }} />
      </div>

      <div className="form-group">
        <label>Total Cost (KES) *</label>
        <input type="number" step="0.01" value={form.total_cost_kes}
          onChange={e => set('total_cost_kes', e.target.value)}
          placeholder="e.g. 12000" required />
      </div>

      <div className="form-row-2">
        <div className="form-group">
          <label>Labour Cost (KES)</label>
          <input type="number" step="0.01" value={form.labour_cost_kes}
            onChange={e => set('labour_cost_kes', e.target.value)} placeholder="optional" />
        </div>
        <div className="form-group">
          <label>Parts Cost (KES)</label>
          <input type="number" step="0.01" value={form.parts_cost_kes}
            onChange={e => set('parts_cost_kes', e.target.value)} placeholder="optional" />
        </div>
      </div>

      <div className="form-group">
        <label>Next Service Note</label>
        <input value={form.next_service_note} onChange={e => set('next_service_note', e.target.value)}
          placeholder="e.g. next oil @ 295,000 km or Dec" />
      </div>

      <div className="form-group">
        <label>Notes</label>
        <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
          placeholder="Any other notes about this service..." rows={2}
          style={{ resize: 'vertical' }} />
      </div>

      <div className="form-actions">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="submit" className="btn-primary"
          style={{ width: 'auto', padding: '10px 28px' }} disabled={saving}>
          {saving ? 'Saving...' : 'Save Service'}
        </button>
      </div>
    </form>
  )
}

export default function ServiceLog() {
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
      .from('service_logs')
      .select('*')
      .eq('vehicle_id', activeVehicle.id)
      .order('serviced_at', { ascending: false })
      .order('odometer_km', { ascending: false, nullsFirst: false })
    setLogs(data || [])
    setLoading(false)
  }, [activeVehicle])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  const clean = (form) => {
    const out = { ...form }
    Object.keys(out).forEach(k => { if (out[k] === '') out[k] = null })
    out.vehicle_id = activeVehicle.id
    return out
  }

  const handleAdd = async (form) => {
    setSaving(true); setError(null)
    const { error } = await supabase.from('service_logs').insert([clean(form)])
    if (error) { setError(error.message); setSaving(false); return }
    await fetchLogs(); setSaving(false); setView('list')
  }

  const handleEdit = async (form) => {
    setSaving(true); setError(null)
    const { error } = await supabase
      .from('service_logs').update(clean(form)).eq('id', selected.id)
    if (error) { setError(error.message); setSaving(false); return }
    await fetchLogs(); setSaving(false); setView('list')
  }

  const handleDelete = async (id) => {
    await supabase.from('service_logs').delete().eq('id', id)
    setDeleteConfirm(null)
    await fetchLogs()
  }

  const totalSpent = logs.reduce((sum, l) => sum + Number(l.total_cost_kes || 0), 0)
  const currentOdo = logs.reduce((max, l) => Math.max(max, Number(l.odometer_km || 0)), 0)
  const lastOdometer = currentOdo || null

  if (!activeVehicle) return (
    <div className="page">
      <div className="page-header"><h2>Service Log</h2></div>
      <div className="placeholder-card"><span>🔧</span><p>Select a vehicle to view service history</p></div>
    </div>
  )

  if (view === 'add') return (
    <div className="page">
      <div className="page-header">
        <h2>Log Service</h2>
        <p className="page-sub">{activeVehicle.name} · {activeVehicle.year} {activeVehicle.make} {activeVehicle.model}</p>
      </div>
      {error && <div className="form-error">{error}</div>}
      <ServiceForm onSave={handleAdd} onCancel={() => setView('list')} saving={saving} lastOdometer={lastOdometer} />
    </div>
  )

  if (view === 'edit' && selected) return (
    <div className="page">
      <div className="page-header">
        <h2>Edit Service</h2>
        <p className="page-sub">{selected.serviced_at} · {selected.category}</p>
      </div>
      {error && <div className="form-error">{error}</div>}
      <ServiceForm
        initial={{ ...selected, serviced_at: selected.serviced_at?.split('T')[0] || selected.serviced_at }}
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
          <h2>Service Log</h2>
          <p className="page-sub">{activeVehicle.name} · {activeVehicle.year} {activeVehicle.make} {activeVehicle.model}</p>
        </div>
        <button className="btn-primary" style={{ width: 'auto', padding: '10px 24px' }}
          onClick={() => setView('add')}>
          + Log Service
        </button>
      </div>

      {logs.length > 0 && (
        <div className="fuel-stats-grid">
          <div className="card">
            <div className="card-label">Last Service</div>
            <div className="card-value" style={{ fontSize: 18 }}>{logs[0].category}</div>
            <div className="card-sub">{logs[0].serviced_at}{logs[0].workshop ? ` · ${logs[0].workshop}` : ''}</div>
          </div>
          <div className="card">
            <div className="card-label">Total Spent</div>
            <div className="card-value">
              {totalSpent.toLocaleString()} <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>KES</span>
            </div>
            <div className="card-sub">across all services</div>
          </div>
          <div className="card">
            <div className="card-label">Current Odometer</div>
            <div className="card-value">{currentOdo ? currentOdo.toLocaleString() : '—'} <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>km</span></div>
            <div className="card-sub">highest recorded at service</div>
          </div>
          <div className="card">
            <div className="card-label">Total Entries</div>
            <div className="card-value">{logs.length}</div>
            <div className="card-sub">
              {logs.length > 0 ? `${logs[logs.length - 1].serviced_at} → ${logs[0].serviced_at}` : ''}
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="placeholder-card"><p>Loading...</p></div>
      ) : logs.length === 0 ? (
        <div className="placeholder-card">
          <span>🔧</span>
          <p>No services logged yet — log your first service</p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Odometer</th>
                <th>Category</th>
                <th>Workshop</th>
                <th>Total (KES)</th>
                <th>Next Service</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id}>
                  <td className="mono">{log.serviced_at}</td>
                  <td className="mono">{log.odometer_km ? Number(log.odometer_km).toLocaleString() : '—'}</td>
                  <td><span className="badge badge-amber">{log.category}</span></td>
                  <td style={{ color: 'var(--text-faint)', fontSize: 12 }}>{log.workshop || '—'}</td>
                  <td className="mono primary">{Number(log.total_cost_kes).toLocaleString()}</td>
                  <td style={{ color: 'var(--text-faint)', fontSize: 12 }}>{log.next_service_note || '—'}</td>
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
