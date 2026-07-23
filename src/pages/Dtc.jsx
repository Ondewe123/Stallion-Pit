import { useState, useEffect, useCallback } from 'react'
import { useVehicle } from '../contexts/VehicleContext'
import { supabase } from '../lib/supabase'

const STATES = ['Pending', 'Stored', 'Permanent']
const STATE_BADGE = { Pending: 'badge-gold', Stored: 'badge-amber', Permanent: 'badge-red' }
const MODULES = ['Engine / ECM', 'Transmission / TCM', 'ABS', 'Airbag / SRS', 'Body / BCM', 'Climate', 'Immobiliser', 'Other']
const FILTERS = ['Active', 'Cleared', 'Returned', 'All']

const lifecycle = (d) => (d.returned ? 'Returned' : d.cleared ? 'Cleared' : 'Active')
const LIFE_BADGE = { Returned: 'badge-red', Cleared: 'badge-green', Active: 'badge-amber' }

const EMPTY_FORM = {
  logged_at: new Date().toISOString().split('T')[0],
  code: '', description: '', module: '', scanner: '', code_state: 'Stored',
  odometer_km: '', freeze_frame: '', notes: '', snag_id: '', work_order_id: '',
}

function DtcForm({ initial = EMPTY_FORM, onSave, onCancel, saving, snags, workOrders, lastOdometer }) {
  const [form, setForm] = useState({ ...EMPTY_FORM, ...initial })
  const set = (f, v) => setForm(p => ({ ...p, [f]: v }))
  return (
    <form onSubmit={e => { e.preventDefault(); onSave(form) }}>
      <div className="form-row-2">
        <div className="form-group"><label>Logged *</label><input type="date" value={form.logged_at} onChange={e => set('logged_at', e.target.value)} required /></div>
        <div className="form-group"><label>Odometer (km)</label><input type="number" value={form.odometer_km || ''} onChange={e => set('odometer_km', e.target.value)} placeholder={lastOdometer ? `Last: ${lastOdometer.toLocaleString()}` : 'optional'} /></div>
      </div>
      <div className="form-row-2">
        <div className="form-group"><label>Code *</label><input value={form.code} onChange={e => set('code', e.target.value.toUpperCase())} placeholder="e.g. P0171" required /></div>
        <div className="form-group">
          <label>Type</label>
          <select value={form.code_state || 'Stored'} onChange={e => set('code_state', e.target.value)}>{STATES.map(s => <option key={s}>{s}</option>)}</select>
        </div>
      </div>
      <div className="form-group"><label>Description</label><input value={form.description || ''} onChange={e => set('description', e.target.value)} placeholder="e.g. System too lean (bank 1)" /></div>
      <div className="form-row-2">
        <div className="form-group">
          <label>Module</label>
          <select value={form.module || ''} onChange={e => set('module', e.target.value)}><option value="">—</option>{MODULES.map(m => <option key={m}>{m}</option>)}</select>
        </div>
        <div className="form-group"><label>Scanner used</label><input value={form.scanner || ''} onChange={e => set('scanner', e.target.value)} placeholder="e.g. VCDS, ELM327" /></div>
      </div>
      <div className="form-group"><label>Freeze-frame</label><textarea value={form.freeze_frame || ''} onChange={e => set('freeze_frame', e.target.value)} placeholder="RPM, load, coolant temp, fuel trims at the time…" rows={2} style={{ resize: 'vertical' }} /></div>
      <div className="form-row-2">
        <div className="form-group">
          <label>Linked snag</label>
          <select value={form.snag_id || ''} onChange={e => set('snag_id', e.target.value)}>
            <option value="">—</option>
            {snags.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Linked work order</label>
          <select value={form.work_order_id || ''} onChange={e => set('work_order_id', e.target.value)}>
            <option value="">—</option>
            {workOrders.map(w => <option key={w.id} value={w.id}>{w.title}</option>)}
          </select>
        </div>
      </div>
      <div className="form-group"><label>Notes</label><textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} rows={2} style={{ resize: 'vertical' }} /></div>
      <div className="form-actions">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="submit" className="btn-primary" style={{ width: 'auto', padding: '10px 28px' }} disabled={saving}>{saving ? 'Saving...' : 'Save Code'}</button>
      </div>
    </form>
  )
}

export default function Dtc() {
  const { activeVehicle } = useVehicle()
  const [codes, setCodes] = useState([])
  const [snags, setSnags] = useState([])
  const [workOrders, setWorkOrders] = useState([])
  const [currentOdo, setCurrentOdo] = useState(0)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('list')
  const [selected, setSelected] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('Active')
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  const fetchData = useCallback(async () => {
    if (!activeVehicle) return
    setLoading(true)
    const [{ data: d }, { data: sn }, { data: wo }, { data: f }, { data: s }] = await Promise.all([
      supabase.from('dtc_codes').select('*').eq('vehicle_id', activeVehicle.id).order('logged_at', { ascending: false }),
      supabase.from('snags').select('id, title').eq('vehicle_id', activeVehicle.id).order('reported_at', { ascending: false }),
      supabase.from('work_orders').select('id, title').eq('vehicle_id', activeVehicle.id).order('opened_at', { ascending: false }),
      supabase.from('fuel_logs').select('odometer_km').eq('vehicle_id', activeVehicle.id).order('odometer_km', { ascending: false }).limit(1),
      supabase.from('service_logs').select('odometer_km').eq('vehicle_id', activeVehicle.id).order('odometer_km', { ascending: false }).limit(1),
    ])
    setCodes(d || []); setSnags(sn || []); setWorkOrders(wo || [])
    setCurrentOdo(Math.max(Number(f?.[0]?.odometer_km || 0), Number(s?.[0]?.odometer_km || 0)))
    setLoading(false)
  }, [activeVehicle])

  useEffect(() => { fetchData() }, [fetchData])

  const clean = (form) => {
    const out = { ...form }
    Object.keys(out).forEach(k => { if (out[k] === '') out[k] = null })
    out.vehicle_id = activeVehicle.id
    return out
  }

  const handleAdd = async (form) => {
    setSaving(true); setError(null)
    const { error: e } = await supabase.from('dtc_codes').insert([clean(form)])
    if (e) { setError(e.message); setSaving(false); return }
    await fetchData(); setSaving(false); setView('list')
  }
  const handleEdit = async (form) => {
    setSaving(true); setError(null)
    const { error: e } = await supabase.from('dtc_codes').update(clean(form)).eq('id', selected.id)
    if (e) { setError(e.message); setSaving(false); return }
    await fetchData(); setSaving(false); setView('list')
  }
  const handleDelete = async (id) => { await supabase.from('dtc_codes').delete().eq('id', id); setDeleteConfirm(null); await fetchData() }

  const today = () => new Date().toISOString().split('T')[0]
  const markCleared = async (d) => { await supabase.from('dtc_codes').update({ cleared: true, cleared_at: d.cleared_at || today() }).eq('id', d.id); await fetchData() }
  const markReturned = async (d) => { await supabase.from('dtc_codes').update({ returned: true, returned_at: today(), returned_odometer: currentOdo || null }).eq('id', d.id); await fetchData() }

  const activeCount = codes.filter(d => lifecycle(d) === 'Active').length
  const returnedCount = codes.filter(d => d.returned).length

  if (!activeVehicle) return (
    <div className="page"><div className="page-header"><h2>DTC Log</h2></div>
      <div className="placeholder-card"><span>🩺</span><p>Select a vehicle to view codes</p></div></div>
  )

  if (view === 'add' || (view === 'edit' && selected)) return (
    <div className="page">
      <div className="page-header"><h2>{view === 'edit' ? 'Edit' : 'Log'} DTC</h2>
        <p className="page-sub">{activeVehicle.name} · {activeVehicle.year} {activeVehicle.make} {activeVehicle.model}</p></div>
      {error && <div className="form-error">{error}</div>}
      <DtcForm
        initial={view === 'edit' ? { ...selected, logged_at: selected.logged_at?.split('T')[0] || selected.logged_at, snag_id: selected.snag_id || '', work_order_id: selected.work_order_id || '' } : EMPTY_FORM}
        onSave={view === 'edit' ? handleEdit : handleAdd}
        onCancel={() => { setSelected(null); setView('list') }}
        saving={saving} snags={snags} workOrders={workOrders} lastOdometer={currentOdo || null} />
    </div>
  )

  const shown = codes.filter(d => filter === 'All' ? true : filter === 'Returned' ? d.returned : lifecycle(d) === filter)

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div><h2>DTC Log</h2><p className="page-sub">{activeVehicle.name} · diagnostic trouble codes</p></div>
        <button className="btn-primary" style={{ width: 'auto', padding: '10px 24px' }} onClick={() => setView('add')}>+ Log Code</button>
      </div>

      {codes.length > 0 && (
        <div className="fuel-stats-grid">
          <div className="card"><div className="card-label">Active</div><div className="card-value" style={{ color: activeCount ? 'var(--warning-strong)' : undefined }}>{activeCount}</div><div className="card-sub">not cleared</div></div>
          <div className="card"><div className="card-label">Returned</div><div className="card-value" style={{ color: returnedCount ? 'var(--danger-strong)' : undefined }}>{returnedCount}</div><div className="card-sub">came back after clearing</div></div>
          <div className="card"><div className="card-label">Total</div><div className="card-value">{codes.length}</div><div className="card-sub">all codes</div></div>
        </div>
      )}

      <div className="row-actions" style={{ margin: '16px 0', flexWrap: 'wrap' }}>
        {FILTERS.map(f => <button key={f} className={`row-btn ${filter === f ? 'vehicle-tab-active' : ''}`} onClick={() => setFilter(f)}>{f}</button>)}
      </div>

      {loading ? <div className="placeholder-card"><p>Loading...</p></div>
        : shown.length === 0 ? <div className="placeholder-card"><span>🩺</span><p>No {filter !== 'All' ? filter.toLowerCase() + ' ' : ''}codes</p></div>
          : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead><tr><th>Logged</th><th>Code</th><th>Type</th><th>Status</th><th>Odometer</th><th></th></tr></thead>
                <tbody>
                  {shown.map(d => {
                    const life = lifecycle(d)
                    return (
                      <tr key={d.id}>
                        <td className="mono">{d.logged_at}</td>
                        <td className="primary">
                          <span className="mono">{d.code}</span> {d.returned && <span title="Returned after clearing" style={{ color: 'var(--warning-strong)' }}>↻</span>}
                          {d.description && <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{d.description}</div>}
                          {d.module && <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{d.module}</div>}
                        </td>
                        <td><span className={`badge ${STATE_BADGE[d.code_state] || 'badge'}`}>{d.code_state}</span></td>
                        <td><span className={`badge ${LIFE_BADGE[life]}`}>{life}</span></td>
                        <td className="mono">{d.odometer_km ? Number(d.odometer_km).toLocaleString() : '—'}</td>
                        <td>
                          <div className="row-actions">
                            {!d.cleared && <button className="row-btn" onClick={() => markCleared(d)}>Cleared</button>}
                            {d.cleared && !d.returned && <button className="row-btn" onClick={() => markReturned(d)}>Returned</button>}
                            <button className="row-btn" onClick={() => { setSelected(d); setView('edit') }}>Edit</button>
                            {deleteConfirm === d.id ? (
                              <>
                                <button className="row-btn row-btn-danger" onClick={() => handleDelete(d.id)}>Confirm</button>
                                <button className="row-btn" onClick={() => setDeleteConfirm(null)}>Cancel</button>
                              </>
                            ) : <button className="row-btn row-btn-danger" onClick={() => setDeleteConfirm(d.id)}>Delete</button>}
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
