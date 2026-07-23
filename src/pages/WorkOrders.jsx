import { useState, useEffect, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useVehicle } from '../contexts/VehicleContext'
import { supabase } from '../lib/supabase'
import { buildClosePlan } from '../lib/calc/workorders'
import { toWorkOrderPartRows } from '../lib/ipc/snagParts'

const STATUS_BADGE = { Open: 'badge-amber', 'In Progress': 'badge-gold', Closed: 'badge-green', Cancelled: 'badge' }
const STATUSES = ['Open', 'In Progress', 'Closed', 'Cancelled']
const today = () => new Date().toISOString().split('T')[0]
const kes = (n) => (n == null ? '—' : Number(n).toLocaleString())

const EMPTY_WO = {
  title: '', status: 'Open', opened_at: today(), target_date: '', completed_at: '',
  odometer_km: '', category: '', workshop: '', labour_hours: '', labour_cost_kes: '',
  completion_notes: '', test_drive_result: '', dtc_notes: '', closed_by: '',
}
const EMPTY_PART = { part_name: '', part_number: '', brand: '', status: 'Planned', quantity: 1, unit_cost_kes: '' }

const clean = (form) => {
  const out = { ...form }
  Object.keys(out).forEach(k => { if (out[k] === '') out[k] = null })
  return out
}

// ── Header form (create + edit the work_orders row) ──
function HeaderForm({ initial, onSave, saving }) {
  const [form, setForm] = useState({ ...EMPTY_WO, ...initial })
  const set = (f, v) => setForm(p => ({ ...p, [f]: v }))
  return (
    <form onSubmit={e => { e.preventDefault(); onSave(form) }} className="card" style={{ marginBottom: 16 }}>
      <div className="form-group">
        <label>Job Title *</label>
        <input value={form.title} onChange={e => set('title', e.target.value)} required placeholder="e.g. Major service + front brakes" />
      </div>
      <div className="form-row-2">
        <div className="form-group"><label>Opened</label><input type="date" value={form.opened_at || ''} onChange={e => set('opened_at', e.target.value)} /></div>
        <div className="form-group"><label>Target date</label><input type="date" value={form.target_date || ''} onChange={e => set('target_date', e.target.value)} /></div>
      </div>
      <div className="form-row-2">
        <div className="form-group"><label>Odometer (km)</label><input type="number" value={form.odometer_km || ''} onChange={e => set('odometer_km', e.target.value)} placeholder="current if blank" /></div>
        <div className="form-group"><label>Category</label><input value={form.category || ''} onChange={e => set('category', e.target.value)} placeholder="Major Service, Repair…" /></div>
      </div>
      <div className="form-row-2">
        <div className="form-group"><label>Workshop</label><input value={form.workshop || ''} onChange={e => set('workshop', e.target.value)} placeholder="Home garage / shop" /></div>
        <div className="form-group"><label>Closed by</label><input value={form.closed_by || ''} onChange={e => set('closed_by', e.target.value)} placeholder="who did the work" /></div>
      </div>
      <div className="form-row-2">
        <div className="form-group"><label>Labour (hours)</label><input type="number" value={form.labour_hours || ''} onChange={e => set('labour_hours', e.target.value)} /></div>
        <div className="form-group"><label>Labour cost (KES)</label><input type="number" value={form.labour_cost_kes || ''} onChange={e => set('labour_cost_kes', e.target.value)} /></div>
      </div>
      <div className="form-group"><label>Completion notes</label><textarea value={form.completion_notes || ''} onChange={e => set('completion_notes', e.target.value)} rows={2} style={{ resize: 'vertical' }} /></div>
      <div className="form-row-2">
        <div className="form-group"><label>Test drive result</label><input value={form.test_drive_result || ''} onChange={e => set('test_drive_result', e.target.value)} placeholder="e.g. OK, no pulls" /></div>
        <div className="form-group"><label>DTC notes</label><input value={form.dtc_notes || ''} onChange={e => set('dtc_notes', e.target.value)} placeholder="codes seen (DTC log later)" /></div>
      </div>
      <div className="form-actions">
        <button type="submit" className="btn-primary" style={{ width: 'auto', padding: '10px 28px' }} disabled={saving}>{saving ? 'Saving...' : 'Save Job'}</button>
      </div>
    </form>
  )
}

export default function WorkOrders() {
  const { activeVehicle } = useVehicle()
  const navigate = useNavigate()
  const location = useLocation()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('All')
  const [view, setView] = useState('list')         // list | editor
  const [wo, setWo] = useState(null)                // current WO (with nested parts + schedule links)
  const [schedules, setSchedules] = useState([])    // vehicle's maintenance_schedules
  const [snags, setSnags] = useState([])            // vehicle's snags (open or linked)
  const [currentOdo, setCurrentOdo] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [partForm, setPartForm] = useState(null)    // { ...EMPTY_PART, id? } | null
  const [closeConfirm, setCloseConfirm] = useState(false)
  const [pendingSnag, setPendingSnag] = useState(null) // from Snags "create work order"
  const [pendingSnagTitle, setPendingSnagTitle] = useState('')
  const [pendingSnagIpcParts, setPendingSnagIpcParts] = useState([])

  const fetchList = useCallback(async () => {
    if (!activeVehicle) return
    setLoading(true)
    const [{ data: wos }, { data: f }, { data: s }] = await Promise.all([
      supabase.from('work_orders').select('*, work_order_parts(*)').eq('vehicle_id', activeVehicle.id).order('opened_at', { ascending: false }),
      supabase.from('fuel_logs').select('odometer_km').eq('vehicle_id', activeVehicle.id).order('odometer_km', { ascending: false }).limit(1),
      supabase.from('service_logs').select('odometer_km').eq('vehicle_id', activeVehicle.id).order('odometer_km', { ascending: false }).limit(1),
    ])
    setOrders(wos || [])
    setCurrentOdo(Math.max(Number(f?.[0]?.odometer_km || 0), Number(s?.[0]?.odometer_km || 0)))
    setLoading(false)
  }, [activeVehicle])

  useEffect(() => { fetchList() }, [fetchList])

  // load full editor data for a WO id
  const openEditor = useCallback(async (woId) => {
    setError(null); setCloseConfirm(false); setPartForm(null)
    const [{ data: woRow }, { data: sch }, { data: sn }] = await Promise.all([
      supabase.from('work_orders').select('*, work_order_parts(*), work_order_schedule_items(maintenance_schedule_id)').eq('id', woId).single(),
      supabase.from('maintenance_schedules').select('id, item, distance_interval_km, time_interval_months, last_done_odometer, last_done_date').eq('vehicle_id', activeVehicle.id).order('item'),
      supabase.from('snags').select('id, title, status, work_order_id').eq('vehicle_id', activeVehicle.id).order('reported_at', { ascending: false }),
    ])
    setWo(woRow); setSchedules(sch || [])
    setSnags((sn || []).filter(s => s.work_order_id === woId || ['Open', 'In Progress'].includes(s.status)))
    setView('editor')
  }, [activeVehicle])

  // ── create / update header ──
  const saveHeader = async (form) => {
    setSaving(true); setError(null)
    if (wo?.id) {
      const { error: e } = await supabase.from('work_orders').update(clean(form)).eq('id', wo.id)
      if (e) { setError(e.message); setSaving(false); return }
      setSaving(false); await openEditor(wo.id)
    } else {
      const { data, error: e } = await supabase.from('work_orders').insert([{ ...clean(form), vehicle_id: activeVehicle.id }]).select('id').single()
      if (e) { setError(e.message); setSaving(false); return }
      if (pendingSnag) { await supabase.from('snags').update({ work_order_id: data.id }).eq('id', pendingSnag); setPendingSnag(null) }
      const ipcRows = toWorkOrderPartRows(pendingSnagIpcParts, data.id)
      if (ipcRows.length > 0) {
        const { error: partError } = await supabase.from('work_order_parts').insert(ipcRows)
        if (partError) { setError('IPC parts: ' + partError.message); setSaving(false); return }
        setPendingSnagIpcParts([])
      }
      setSaving(false); await openEditor(data.id)
    }
  }

  const linkedScheduleIds = new Set((wo?.work_order_schedule_items || []).map(l => l.maintenance_schedule_id))
  const toggleSchedule = async (sid) => {
    if (linkedScheduleIds.has(sid)) {
      await supabase.from('work_order_schedule_items').delete().eq('work_order_id', wo.id).eq('maintenance_schedule_id', sid)
    } else {
      await supabase.from('work_order_schedule_items').insert([{ work_order_id: wo.id, maintenance_schedule_id: sid }])
    }
    await openEditor(wo.id)
  }
  const toggleSnag = async (snag) => {
    const linked = snag.work_order_id === wo.id
    await supabase.from('snags').update({ work_order_id: linked ? null : wo.id }).eq('id', snag.id)
    await openEditor(wo.id)
  }

  // ── parts line items ──
  const savePart = async (form) => {
    setSaving(true); setError(null)
    const qty = parseFloat(form.quantity), unit = parseFloat(form.unit_cost_kes)
    const payload = { ...clean(form), work_order_id: wo.id, total_cost_kes: (!isNaN(qty) && !isNaN(unit)) ? qty * unit : null }
    const res = form.id ? await supabase.from('work_order_parts').update(payload).eq('id', form.id)
      : await supabase.from('work_order_parts').insert([payload])
    if (res.error) { setError(res.error.message); setSaving(false); return }
    setSaving(false); setPartForm(null); await openEditor(wo.id)
  }
  const deletePart = async (id) => { await supabase.from('work_order_parts').delete().eq('id', id); await openEditor(wo.id) }

  const setStatus = async (status) => { await supabase.from('work_orders').update({ status }).eq('id', wo.id); await openEditor(wo.id) }

  // ── the close action: execute buildClosePlan ──
  const linkedSchedules = () => schedules.filter(s => linkedScheduleIds.has(s.id))
  const linkedSnags = () => snags.filter(s => s.work_order_id === wo.id)
  const executeClose = async () => {
    setSaving(true); setError(null)
    let plan
    try { plan = buildClosePlan(wo, wo.work_order_parts || [], linkedSchedules(), linkedSnags(), currentOdo, today()) }
    catch (e) { setError(e.message); setSaving(false); return }
    // 1. service log (labour only) → link both ways
    const { data: sl, error: e1 } = await supabase.from('service_logs').insert([plan.serviceLog]).select('id').single()
    if (e1) { setError('Service log: ' + e1.message); setSaving(false); return }
    // 2. fitted parts → parts table; link parts_id back on the WO part
    for (const pr of plan.partsRows) {
      const { _woPartId, ...row } = pr
      const { data: p, error: e2 } = await supabase.from('parts').insert([row]).select('id').single()
      if (e2) { setError('Parts: ' + e2.message); setSaving(false); return }
      await supabase.from('work_order_parts').update({ parts_id: p.id }).eq('id', _woPartId)
    }
    // 3. schedule completions
    for (const su of plan.scheduleUpdates) await supabase.from('maintenance_schedules').update(su.patch).eq('id', su.id)
    // 4. snag resolutions
    for (const nu of plan.snagUpdates) await supabase.from('snags').update(nu.patch).eq('id', nu.id)
    // 5. WO closed (+ service_log link) — last, so a mid-way failure leaves it re-runnable
    await supabase.from('work_orders').update({ ...plan.woUpdate.patch, service_log_id: sl.id }).eq('id', wo.id)
    setSaving(false); setCloseConfirm(false); await openEditor(wo.id)
  }

  // entry point from Snags: ?create + state.snag
  useEffect(() => {
    const st = location.state
    if (st?.newFromSnag && view === 'list' && !loading) {
      setPendingSnag(st.newFromSnag.id)
      setPendingSnagTitle(st.newFromSnag.title || '')
      setPendingSnagIpcParts(st.newFromSnag.ipcParts || [])
      setWo(null); setView('editor')
      navigate(location.pathname, { replace: true, state: {} }) // clear so it doesn't re-fire
    }
  }, [location, view, loading, navigate])

  // ───────── editor ─────────
  if (view === 'editor') {
    const parts = wo?.work_order_parts || []
    const partsTotal = parts.filter(p => p.status === 'Fitted').reduce((s, p) => s + Number(p.total_cost_kes || 0), 0)
    const isClosed = wo?.status === 'Closed' || wo?.status === 'Cancelled'
    const draftTitle = pendingSnag ? `Fix: ${pendingSnagTitle}` : ''
    return (
      <div className="page">
        <div className="page-header">
          <button className="row-btn" onClick={() => { setWo(null); setView('list'); fetchList() }} style={{ marginBottom: 8 }}>← All jobs</button>
          <h2>{wo?.id ? wo.title : 'New Work Order'} {wo?.id && <span className={`badge ${STATUS_BADGE[wo.status]}`}>{wo.status}</span>}</h2>
          <p className="page-sub">{activeVehicle.name} · {activeVehicle.year} {activeVehicle.make} {activeVehicle.model}{currentOdo ? ` · now ${currentOdo.toLocaleString()} km` : ''}</p>
        </div>
        {error && <div className="form-error">{error}</div>}

        <HeaderForm initial={wo?.id ? wo : { ...EMPTY_WO, title: draftTitle }} onSave={saveHeader} saving={saving} />

        {!wo?.id ? (
          <p className="page-sub">
            Save the job to add parts, link snags and schedule items, and close it.
            {pendingSnagIpcParts.length > 0 ? ` ${pendingSnagIpcParts.length} IPC part(s) will be added as planned parts.` : ''}
          </p>
        ) : (
          <>
            {/* status actions */}
            {!isClosed && (
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-label">Status</div>
                <div className="row-actions" style={{ marginTop: 8, flexWrap: 'wrap' }}>
                  {wo.status === 'Open' && <button className="row-btn" onClick={() => setStatus('In Progress')}>Start (In Progress)</button>}
                  <button className="btn-primary" style={{ width: 'auto', padding: '8px 20px' }} onClick={() => setCloseConfirm(true)}>Close job →</button>
                  <button className="row-btn row-btn-danger" onClick={() => setStatus('Cancelled')}>Cancel job</button>
                </div>
                {closeConfirm && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                    <p>Closing will record <strong>KES {kes(wo.labour_cost_kes || 0)} labour</strong> to the Service Log, fit <strong>{parts.filter(p => p.status === 'Fitted').length}</strong> part(s), complete <strong>{linkedSchedules().length}</strong> schedule item(s), and resolve <strong>{linkedSnags().length}</strong> snag(s).</p>
                    <div className="row-actions">
                      <button className="btn-primary" style={{ width: 'auto', padding: '8px 20px' }} onClick={executeClose} disabled={saving}>{saving ? 'Closing…' : 'Confirm close'}</button>
                      <button className="row-btn" onClick={() => setCloseConfirm(false)}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {isClosed && wo.service_log_id && <div className="card" style={{ marginBottom: 16 }}><div className="card-label">{wo.status}</div><p className="page-sub">Recorded to the Service Log · labour KES {kes(wo.labour_cost_kes)} + parts KES {kes(partsTotal)}.</p></div>}

            {/* schedule items */}
            <h3 style={{ marginTop: 8 }}>Schedule items serviced</h3>
            {schedules.length === 0 ? <p className="page-sub">No schedule items on this vehicle.</p> : (
              <div className="row-actions" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                {schedules.map(s => (
                  <button key={s.id} className={`row-btn ${linkedScheduleIds.has(s.id) ? 'vehicle-tab-active' : ''}`} disabled={isClosed} onClick={() => toggleSchedule(s.id)}>
                    {linkedScheduleIds.has(s.id) ? '✓ ' : '+ '}{s.item}
                  </button>
                ))}
              </div>
            )}

            {/* snags */}
            <h3>Snags addressed</h3>
            {snags.length === 0 ? <p className="page-sub">No open snags on this vehicle.</p> : (
              <div className="row-actions" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                {snags.map(s => (
                  <button key={s.id} className={`row-btn ${s.work_order_id === wo.id ? 'vehicle-tab-active' : ''}`} disabled={isClosed} onClick={() => toggleSnag(s)}>
                    {s.work_order_id === wo.id ? '✓ ' : '+ '}{s.title}
                  </button>
                ))}
              </div>
            )}

            {/* parts */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>Parts</h3>
              {!isClosed && <button className="row-btn" onClick={() => setPartForm({ ...EMPTY_PART })}>+ Part</button>}
            </div>
            {partForm && (
              <form onSubmit={e => { e.preventDefault(); savePart(partForm) }} className="card" style={{ marginBottom: 12 }}>
                <div className="form-row-2">
                  <div className="form-group"><label>Part name *</label><input value={partForm.part_name} onChange={e => setPartForm(p => ({ ...p, part_name: e.target.value }))} required /></div>
                  <div className="form-group"><label>Status</label><select value={partForm.status} onChange={e => setPartForm(p => ({ ...p, status: e.target.value }))}><option>Planned</option><option>Fitted</option></select></div>
                </div>
                <div className="form-row-2">
                  <div className="form-group"><label>Part number</label><input value={partForm.part_number || ''} onChange={e => setPartForm(p => ({ ...p, part_number: e.target.value }))} /></div>
                  <div className="form-group"><label>Brand</label><input value={partForm.brand || ''} onChange={e => setPartForm(p => ({ ...p, brand: e.target.value }))} /></div>
                </div>
                <div className="form-row-2">
                  <div className="form-group"><label>Quantity</label><input type="number" value={partForm.quantity} onChange={e => setPartForm(p => ({ ...p, quantity: e.target.value }))} /></div>
                  <div className="form-group"><label>Unit cost (KES)</label><input type="number" value={partForm.unit_cost_kes || ''} onChange={e => setPartForm(p => ({ ...p, unit_cost_kes: e.target.value }))} /></div>
                </div>
                <div className="form-actions">
                  <button type="button" className="btn-secondary" onClick={() => setPartForm(null)}>Cancel</button>
                  <button type="submit" className="btn-primary" style={{ width: 'auto', padding: '8px 20px' }} disabled={saving}>Save Part</button>
                </div>
              </form>
            )}
            {parts.length === 0 ? <p className="page-sub">No parts added.</p> : (
              <div className="table-wrapper">
                <table className="data-table">
                  <thead><tr><th>Part</th><th>Status</th><th>Qty</th><th>Total</th><th></th></tr></thead>
                  <tbody>
                    {parts.map(p => (
                      <tr key={p.id}>
                        <td className="primary">{p.part_name}{p.brand && <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{p.brand} {p.part_number}</div>}</td>
                        <td><span className={`badge ${p.status === 'Fitted' ? 'badge-green' : 'badge-amber'}`}>{p.status}</span></td>
                        <td>{p.quantity}</td>
                        <td className="mono">{kes(p.total_cost_kes)}</td>
                        <td>{!isClosed && <div className="row-actions">
                          <button className="row-btn" onClick={() => setPartForm({ ...p, unit_cost_kes: p.unit_cost_kes ?? '' })}>Edit</button>
                          <button className="row-btn row-btn-danger" onClick={() => deletePart(p.id)}>Delete</button>
                        </div>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  // ───────── list ─────────
  const shown = filter === 'All' ? orders : orders.filter(o => o.status === filter)
  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div><h2>Work Orders</h2><p className="page-sub">{activeVehicle?.name} · job cards for repairs &amp; services</p></div>
        <button className="btn-primary" style={{ width: 'auto', padding: '10px 24px' }} onClick={() => { setWo(null); setView('editor') }}>+ New Job</button>
      </div>

      <div className="row-actions" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
        {['All', ...STATUSES].map(f => (
          <button key={f} className={`row-btn ${filter === f ? 'vehicle-tab-active' : ''}`} onClick={() => setFilter(f)}>{f}</button>
        ))}
      </div>

      {loading ? <div className="placeholder-card"><p>Loading...</p></div>
        : shown.length === 0 ? <div className="placeholder-card"><span>🛠</span><p>No work orders{filter !== 'All' ? ` (${filter})` : ''} yet</p></div>
          : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead><tr><th>Job</th><th>Status</th><th>Opened</th><th>Labour+Parts</th><th></th></tr></thead>
                <tbody>
                  {shown.map(o => {
                    const pTotal = (o.work_order_parts || []).filter(p => p.status === 'Fitted').reduce((s, p) => s + Number(p.total_cost_kes || 0), 0)
                    return (
                      <tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => openEditor(o.id)}>
                        <td className="primary">{o.title}{o.category && <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{o.category}</div>}</td>
                        <td><span className={`badge ${STATUS_BADGE[o.status]}`}>{o.status}</span></td>
                        <td className="mono" style={{ fontSize: 12 }}>{o.opened_at}</td>
                        <td className="mono" style={{ fontSize: 12 }}>{kes(Number(o.labour_cost_kes || 0) + pTotal)}</td>
                        <td><button className="row-btn" onClick={() => openEditor(o.id)}>Open →</button></td>
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
