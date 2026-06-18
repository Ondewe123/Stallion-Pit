import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useVehicle } from '../contexts/VehicleContext'
import { supabase } from '../lib/supabase'

const SEVERITIES = ['Low', 'Medium', 'High', 'Critical']
const STATUSES = ['Open', 'In Progress', 'Resolved', "Won't Fix"]
const ACTIVE_STATUSES = ['Open', 'In Progress']

const SEVERITY_BADGE = { Critical: 'badge-red', High: 'badge-amber', Medium: 'badge-gold', Low: 'badge' }
const STATUS_BADGE = { Open: 'badge-amber', 'In Progress': 'badge-gold', Resolved: 'badge-green', "Won't Fix": 'badge' }

const EMPTY_FORM = {
  reported_at: new Date().toISOString().split('T')[0],
  title: '',
  description: '',
  severity: 'Medium',
  status: 'Open',
  odometer_km: '',
  resolved_at: '',
  resolution_note: '',
  notes: '',
}

function SnagForm({ initial = EMPTY_FORM, onSave, onCancel, saving, lastOdometer }) {
  const [form, setForm] = useState({ ...EMPTY_FORM, ...initial })
  const set = (field, value) => setForm(f => ({ ...f, [field]: value }))

  const handleSubmit = (e) => { e.preventDefault(); onSave(form) }

  return (
    <form onSubmit={handleSubmit} className="snag-form">
      <div className="form-row-2">
        <div className="form-group">
          <label>Reported *</label>
          <input type="date" value={form.reported_at}
            onChange={e => set('reported_at', e.target.value)} required />
        </div>
        <div className="form-group">
          <label>Odometer (km)</label>
          <input type="number" value={form.odometer_km}
            onChange={e => set('odometer_km', e.target.value)}
            placeholder={lastOdometer ? `Last: ${lastOdometer.toLocaleString()}` : 'optional'} />
        </div>
      </div>

      <div className="form-group">
        <label>Title *</label>
        <input value={form.title} onChange={e => set('title', e.target.value)}
          placeholder="e.g. Rough idle when cold" required />
      </div>

      <div className="form-row-2">
        <div className="form-group">
          <label>Severity</label>
          <select value={form.severity} onChange={e => set('severity', e.target.value)}>
            {SEVERITIES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Status</label>
          <select value={form.status} onChange={e => set('status', e.target.value)}>
            {STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="form-group">
        <label>Description</label>
        <textarea value={form.description} onChange={e => set('description', e.target.value)}
          placeholder="What's wrong — symptoms, when it happens..." rows={2}
          style={{ resize: 'vertical' }} />
      </div>

      <div className="form-row-2">
        <div className="form-group">
          <label>Resolved Date</label>
          <input type="date" value={form.resolved_at}
            onChange={e => set('resolved_at', e.target.value)} />
        </div>
      </div>

      <div className="form-group">
        <label>Resolution Note</label>
        <textarea value={form.resolution_note} onChange={e => set('resolution_note', e.target.value)}
          placeholder="How it was fixed (or why you're leaving it)..." rows={2}
          style={{ resize: 'vertical' }} />
      </div>

      <div className="form-group">
        <label>Notes</label>
        <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
          placeholder="Any other notes..." rows={2} style={{ resize: 'vertical' }} />
      </div>

      <div className="form-actions">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="submit" className="btn-primary"
          style={{ width: 'auto', padding: '10px 28px' }} disabled={saving}>
          {saving ? 'Saving...' : 'Save Snag'}
        </button>
      </div>
    </form>
  )
}

export default function Snags() {
  const { activeVehicle } = useVehicle()
  const navigate = useNavigate()
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
      .from('snags')
      .select('*')
      .eq('vehicle_id', activeVehicle.id)
      .order('reported_at', { ascending: false })
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
    const { error } = await supabase.from('snags').insert([clean(form)])
    if (error) { setError(error.message); setSaving(false); return }
    await fetchLogs(); setSaving(false); setView('list')
  }

  const handleEdit = async (form) => {
    setSaving(true); setError(null)
    const { error } = await supabase.from('snags').update(clean(form)).eq('id', selected.id)
    if (error) { setError(error.message); setSaving(false); return }
    await fetchLogs(); setSaving(false); setView('list')
  }

  const handleDelete = async (id) => {
    await supabase.from('snags').delete().eq('id', id)
    setDeleteConfirm(null)
    await fetchLogs()
  }

  const handleMarkFixed = async (snag) => {
    const today = new Date().toISOString().split('T')[0]
    await supabase.from('snags')
      .update({ status: 'Resolved', resolved_at: snag.resolved_at || today })
      .eq('id', snag.id)
    await fetchLogs()
  }

  const openCount = logs.filter(s => ACTIVE_STATUSES.includes(s.status)).length
  const needsAttention = logs.filter(s =>
    ACTIVE_STATUSES.includes(s.status) && (s.severity === 'High' || s.severity === 'Critical')).length
  const resolvedCount = logs.filter(s => s.status === 'Resolved').length
  const currentOdo = logs.reduce((max, l) => Math.max(max, Number(l.odometer_km || 0)), 0)
  const lastOdometer = currentOdo || null

  if (!activeVehicle) return (
    <div className="page">
      <div className="page-header"><h2>Snags</h2></div>
      <div className="placeholder-card"><span>⚠️</span><p>Select a vehicle to view snags</p></div>
    </div>
  )

  if (view === 'add') return (
    <div className="page">
      <div className="page-header">
        <h2>Log Snag</h2>
        <p className="page-sub">{activeVehicle.name} · {activeVehicle.year} {activeVehicle.make} {activeVehicle.model}</p>
      </div>
      {error && <div className="form-error">{error}</div>}
      <SnagForm onSave={handleAdd} onCancel={() => setView('list')} saving={saving} lastOdometer={lastOdometer} />
    </div>
  )

  if (view === 'edit' && selected) return (
    <div className="page">
      <div className="page-header">
        <h2>Edit Snag</h2>
        <p className="page-sub">{selected.title}</p>
      </div>
      {error && <div className="form-error">{error}</div>}
      <SnagForm
        initial={{
          ...selected,
          reported_at: selected.reported_at?.split('T')[0] || selected.reported_at,
          resolved_at: selected.resolved_at?.split('T')[0] || selected.resolved_at || '',
        }}
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
          <h2>Snags</h2>
          <p className="page-sub">{activeVehicle.name} · {activeVehicle.year} {activeVehicle.make} {activeVehicle.model}</p>
        </div>
        <button className="btn-primary" style={{ width: 'auto', padding: '10px 24px' }}
          onClick={() => setView('add')}>
          + Log Snag
        </button>
      </div>

      {logs.length > 0 && (
        <div className="fuel-stats-grid">
          <div className="card">
            <div className="card-label">Open</div>
            <div className="card-value">{openCount}</div>
            <div className="card-sub">unresolved snags</div>
          </div>
          <div className="card">
            <div className="card-label">Needs Attention</div>
            <div className="card-value" style={{ color: needsAttention ? '#e74c3c' : undefined }}>{needsAttention}</div>
            <div className="card-sub">High / Critical &amp; open</div>
          </div>
          <div className="card">
            <div className="card-label">Resolved</div>
            <div className="card-value">{resolvedCount}</div>
            <div className="card-sub">fixed</div>
          </div>
          <div className="card">
            <div className="card-label">Total</div>
            <div className="card-value">{logs.length}</div>
            <div className="card-sub">all snags</div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="placeholder-card"><p>Loading...</p></div>
      ) : logs.length === 0 ? (
        <div className="placeholder-card">
          <span>⚠️</span>
          <p>No snags logged yet — log your first issue</p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Reported</th>
                <th>Title</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Odometer</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id}>
                  <td className="mono">{log.reported_at}</td>
                  <td className="primary">
                    {log.title}
                    {log.resolved_at && (
                      <div style={{ color: 'var(--text-dim)', fontSize: 11 }}>resolved {log.resolved_at}</div>
                    )}
                  </td>
                  <td><span className={`badge ${SEVERITY_BADGE[log.severity] || 'badge'}`}>{log.severity}</span></td>
                  <td><span className={`badge ${STATUS_BADGE[log.status] || 'badge'}`}>{log.status}</span></td>
                  <td className="mono">{log.odometer_km ? Number(log.odometer_km).toLocaleString() : '—'}</td>
                  <td>
                    <div className="row-actions">
                      {ACTIVE_STATUSES.includes(log.status) && (
                        <button className="row-btn" onClick={() => handleMarkFixed(log)}>Fix</button>
                      )}
                      {ACTIVE_STATUSES.includes(log.status) && (
                        <button className="row-btn" onClick={() => navigate('/work-orders', { state: { newFromSnag: { id: log.id, title: log.title } } })}>→ Job</button>
                      )}
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
