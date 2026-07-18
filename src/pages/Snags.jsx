import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useVehicle } from '../contexts/VehicleContext'
import { supabase } from '../lib/supabase'
import {
  addSelectedIpcPart,
  ipcBranchOptions,
  ipcDiagramOptions,
  ipcGroupOptions,
  rankIpcParts,
  selectedIpcPartIds,
} from '../lib/ipc/snagParts'

const SEVERITIES = ['Low', 'Medium', 'High', 'Critical']
const STATUSES = ['Open', 'In Progress', 'Resolved', "Won't Fix"]
const ACTIVE_STATUSES = ['Open', 'In Progress']

const SEVERITY_BADGE = { Critical: 'badge-red', High: 'badge-amber', Medium: 'badge-gold', Low: 'badge' }
const STATUS_BADGE = { Open: 'badge-amber', 'In Progress': 'badge-gold', Resolved: 'badge-green', "Won't Fix": 'badge' }

const SAFETY_IMPACTS = ['None', 'Cosmetic', 'Affects safety', 'Unsafe to drive']
const DRIVABILITY = ['None', 'Minor', 'Noticeable', 'Severe']
const SYSTEMS = ['Engine', 'Cooling', 'Fuel', 'Transmission', 'Brakes', 'Suspension', 'Steering', 'Electrical', 'HVAC', 'Body', 'Tyres', 'Exhaust', 'Other']
const CONDITIONS = ['Cold start', 'When hot', 'At idle', 'Under load', 'Accelerating', 'Braking', 'Cornering', 'Over bumps', 'In rain', 'Highway', 'Always']
const SAFETY_BADGE = { 'Unsafe to drive': 'badge-red', 'Affects safety': 'badge-amber' }
const SAFETY_CRITICAL = ['Affects safety', 'Unsafe to drive']

const EMPTY_FORM = {
  reported_at: new Date().toISOString().split('T')[0],
  title: '',
  description: '',
  severity: 'Medium',
  status: 'Open',
  odometer_km: '',
  symptom: '',
  conditions: [],
  safety_impact: '',
  drivability_impact: '',
  suspected_system: '',
  root_cause: '',
  corrective_action: '',
  verification_method: '',
  is_recurring: false,
  resolved_at: '',
  resolution_note: '',
  notes: '',
}

function SnagForm({ initial = EMPTY_FORM, onSave, onCancel, saving, lastOdometer, ipcParts = [], ipcLoading = false }) {
  const [form, setForm] = useState({ ...EMPTY_FORM, ...initial, conditions: initial.conditions || [] })
  const [selectedIpcParts, setSelectedIpcParts] = useState(initial.ipcParts || [])
  const [ipcQuery, setIpcQuery] = useState('')
  const [ipcGroup, setIpcGroup] = useState('')
  const [ipcBranch, setIpcBranch] = useState('')
  const [ipcDiagram, setIpcDiagram] = useState('')
  const [smartIpcRank, setSmartIpcRank] = useState(true)
  const set = (field, value) => setForm(f => ({ ...f, [field]: value }))
  const toggleCondition = (c) => setForm(f => {
    const has = (f.conditions || []).includes(c)
    return { ...f, conditions: has ? f.conditions.filter(x => x !== c) : [...(f.conditions || []), c] }
  })
  const [showDiag, setShowDiag] = useState(() =>
    !!(initial.symptom || initial.safety_impact || initial.suspected_system || initial.root_cause ||
      initial.corrective_action || initial.verification_method || initial.is_recurring ||
      (initial.conditions && initial.conditions.length)))

  const selectedIpcIds = useMemo(() => selectedIpcPartIds(selectedIpcParts), [selectedIpcParts])
  const ipcGroups = useMemo(() => ipcGroupOptions(ipcParts), [ipcParts])
  const ipcBranches = useMemo(() => ipcBranchOptions(ipcParts), [ipcParts])
  const ipcDiagrams = useMemo(() =>
    ipcDiagramOptions(ipcParts, { group: ipcGroup, branch: ipcBranch }),
    [ipcParts, ipcGroup, ipcBranch])
  const shownIpcParts = useMemo(() =>
    rankIpcParts(ipcParts, {
      query: ipcQuery,
      snagTitle: form.title,
      description: form.description,
      suspectedSystem: form.suspected_system,
      group: ipcGroup,
      branch: ipcBranch,
      diagramKey: ipcDiagram,
      useSmartContext: smartIpcRank,
    }).filter(part => !selectedIpcIds.includes(part.id)).slice(0, 30),
    [ipcParts, ipcQuery, form.title, form.description, form.suspected_system, ipcGroup, ipcBranch, ipcDiagram, smartIpcRank, selectedIpcIds])
  const useSnagTextSearch = () => {
    const seed = [form.title, form.suspected_system, form.description].filter(Boolean).join(' ')
    setIpcQuery(seed)
  }
  const clearIpcFilters = () => {
    setIpcQuery('')
    setIpcGroup('')
    setIpcBranch('')
    setIpcDiagram('')
    setSmartIpcRank(true)
  }
  const setIpcQuantity = (ipcPartId, quantity) => setSelectedIpcParts(parts =>
    parts.map(link => link.ipc_part_id === ipcPartId ? { ...link, quantity_needed: quantity } : link))
  const removeIpcPart = (ipcPartId) => setSelectedIpcParts(parts =>
    parts.filter(link => link.ipc_part_id !== ipcPartId))

  const handleSubmit = (e) => { e.preventDefault(); onSave({ ...form, ipcParts: selectedIpcParts }) }

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

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row-actions" style={{ justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
          <div>
            <div className="card-label">IPC parts needed</div>
            <p className="page-sub" style={{ marginTop: 6 }}>
              {selectedIpcParts.length ? `${selectedIpcParts.length} selected` : 'Smart-ranked from this snag'}
            </p>
          </div>
          {ipcParts.length > 0 && (
            <button type="button" className="row-btn" onClick={clearIpcFilters}>Reset picker</button>
          )}
        </div>
        {ipcLoading ? (
          <p className="page-sub" style={{ marginTop: 8 }}>Loading IPC parts...</p>
        ) : ipcParts.length === 0 ? (
          <p className="page-sub" style={{ marginTop: 8 }}>No IPC catalog is available for this vehicle yet.</p>
        ) : (
          <>
            <div className="form-row-2" style={{ marginTop: 10 }}>
              <div className="form-group">
                <label>Search IPC</label>
                <input value={ipcQuery} onChange={e => setIpcQuery(e.target.value)}
                  placeholder="windscreen glass, steering pump, engine mount..." />
              </div>
              <div className="form-group">
                <label>Branch</label>
                <select value={ipcBranch} onChange={e => { setIpcBranch(e.target.value); setIpcDiagram('') }}>
                  <option value="">All branches</option>
                  {ipcBranches.map(option => (
                    <option key={option.value} value={option.value}>{option.label} ({option.count})</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-row-2">
              <div className="form-group">
                <label>Group</label>
                <select value={ipcGroup} onChange={e => { setIpcGroup(e.target.value); setIpcDiagram('') }}>
                  <option value="">All groups</option>
                  {ipcGroups.map(option => (
                    <option key={option.value} value={option.value}>{option.label} ({option.count})</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Diagram</label>
                <select value={ipcDiagram} onChange={e => setIpcDiagram(e.target.value)}>
                  <option value="">All diagrams</option>
                  {ipcDiagrams.map(option => (
                    <option key={option.value} value={option.value}>{option.label} ({option.count})</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="row-actions" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              <label className="ipc-checkbox" style={{ margin: 0 }}>
                <input type="checkbox" checked={smartIpcRank} onChange={e => setSmartIpcRank(e.target.checked)} />
                Smart rank from snag
              </label>
              <button type="button" className="row-btn" onClick={useSnagTextSearch}
                disabled={!form.title && !form.description && !form.suspected_system}>
                Use snag text
              </button>
            </div>

            {selectedIpcParts.map(link => {
              const part = link.part || link.ipc_parts || {}
              return (
                <div key={link.ipc_part_id} className="row-actions" style={{ justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                  <div style={{ minWidth: 0 }}>
                    <strong className="mono">{part.part_number}</strong>
                    <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>{part.name}</div>
                  </div>
                  <div className="row-actions">
                    <input type="number" min="0.01" step="0.01" value={link.quantity_needed || 1}
                      onChange={e => setIpcQuantity(link.ipc_part_id, e.target.value)}
                      title="Quantity needed" style={{ width: 80 }} />
                    <button type="button" className="row-btn row-btn-danger" onClick={() => removeIpcPart(link.ipc_part_id)}>Remove</button>
                  </div>
                </div>
              )
            })}

            {shownIpcParts.length === 0 ? (
              <p className="page-sub">No matching IPC parts.</p>
            ) : (
              <div className="table-wrapper" style={{ marginTop: 10 }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Part</th>
                      <th>Group</th>
                      <th>Diagram</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownIpcParts.map(part => (
                      <tr key={part.id}>
                        <td className="primary">
                          <span className="mono">{part.part_number}</span>
                          <div style={{ color: 'var(--text-dim)', fontSize: 11 }}>{part.name}</div>
                          {part.replacement_numbers && (
                            <div style={{ color: 'var(--text-dim)', fontSize: 11 }}>Replaces: {part.replacement_numbers}</div>
                          )}
                        </td>
                        <td className="mono">{[part.catalog_group, part.subgroup].filter(Boolean).join('/') || '—'}</td>
                        <td>
                          {part.diagram_title || '—'}
                          {part.usage && <div style={{ color: 'var(--text-dim)', fontSize: 11 }}>{part.usage}</div>}
                        </td>
                        <td>
                          <button type="button" className="row-btn"
                            onClick={() => setSelectedIpcParts(parts => addSelectedIpcPart(parts, part))}>
                            Add
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      <button type="button" className="row-btn" style={{ marginBottom: 12 }} onClick={() => setShowDiag(s => !s)}>
        {showDiag ? '▾' : '▸'} Diagnosis &amp; rectification
      </button>

      {showDiag && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="form-group">
            <label>Symptom</label>
            <input value={form.symptom || ''} onChange={e => set('symptom', e.target.value)}
              placeholder="e.g. Misfire / rough running, stalls" />
          </div>

          <div className="form-group">
            <label>Conditions (when it happens)</label>
            <div className="row-actions" style={{ flexWrap: 'wrap', gap: 6 }}>
              {CONDITIONS.map(c => (
                <button type="button" key={c}
                  className={`row-btn ${(form.conditions || []).includes(c) ? 'vehicle-tab-active' : ''}`}
                  onClick={() => toggleCondition(c)}>
                  {(form.conditions || []).includes(c) ? '✓ ' : ''}{c}
                </button>
              ))}
            </div>
          </div>

          <div className="form-row-2">
            <div className="form-group">
              <label>Suspected system</label>
              <select value={form.suspected_system || ''} onChange={e => set('suspected_system', e.target.value)}>
                <option value="">—</option>
                {SYSTEMS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Safety impact</label>
              <select value={form.safety_impact || ''} onChange={e => set('safety_impact', e.target.value)}>
                <option value="">—</option>
                {SAFETY_IMPACTS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="form-row-2">
            <div className="form-group">
              <label>Drivability impact</label>
              <select value={form.drivability_impact || ''} onChange={e => set('drivability_impact', e.target.value)}>
                <option value="">—</option>
                {DRIVABILITY.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 24 }}>
              <input type="checkbox" id="is_recurring" checked={!!form.is_recurring}
                onChange={e => set('is_recurring', e.target.checked)} style={{ width: 'auto' }} />
              <label htmlFor="is_recurring" style={{ margin: 0 }}>Recurring issue (has come back before)</label>
            </div>
          </div>

          <div className="form-group">
            <label>Root cause</label>
            <textarea value={form.root_cause || ''} onChange={e => set('root_cause', e.target.value)}
              placeholder="What actually caused it..." rows={2} style={{ resize: 'vertical' }} />
          </div>
          <div className="form-group">
            <label>Corrective action</label>
            <textarea value={form.corrective_action || ''} onChange={e => set('corrective_action', e.target.value)}
              placeholder="What was done to fix it..." rows={2} style={{ resize: 'vertical' }} />
          </div>
          <div className="form-group">
            <label>Verification method</label>
            <input value={form.verification_method || ''} onChange={e => set('verification_method', e.target.value)}
              placeholder="How you confirmed it's fixed (test drive, re-scan...)" />
          </div>
        </div>
      )}

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
  const [ipcParts, setIpcParts] = useState([])
  const [ipcLoading, setIpcLoading] = useState(false)

  const fetchLogs = useCallback(async () => {
    if (!activeVehicle) return
    setLoading(true)
    const { data } = await supabase
      .from('snags')
      .select('*, snag_ipc_parts(*, ipc_parts(id, diagram_id, branch, catalog_group, group_name, subgroup, diagram_title, item_no, part_number, replacement_numbers, quantity, name, usage, remarks, source_url, price_url))')
      .eq('vehicle_id', activeVehicle.id)
      .order('reported_at', { ascending: false })
    setLogs(data || [])
    setLoading(false)
  }, [activeVehicle])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  const fetchIpcParts = useCallback(async () => {
    if (!activeVehicle) return
    setIpcLoading(true)
    setIpcParts([])
    const { data: catalog, error: catalogError } = await supabase
      .from('ipc_catalogs')
      .select('id')
      .eq('vehicle_id', activeVehicle.id)
      .maybeSingle()
    if (catalogError || !catalog) {
      setIpcLoading(false)
      return
    }
    const { data } = await supabase
      .from('ipc_parts')
      .select('id, diagram_id, branch, catalog_group, group_name, subgroup, diagram_title, item_no, part_number, replacement_numbers, quantity, name, usage, remarks, source_url, price_url')
      .eq('catalog_id', catalog.id)
      .order('part_number')
      .limit(5000)
    setIpcParts(data || [])
    setIpcLoading(false)
  }, [activeVehicle])

  useEffect(() => { fetchIpcParts() }, [fetchIpcParts])

  const clean = (form) => {
    const out = { ...form }
    delete out.ipcParts
    delete out.snag_ipc_parts
    Object.keys(out).forEach(k => { if (out[k] === '') out[k] = null })
    if (Array.isArray(out.conditions) && out.conditions.length === 0) out.conditions = null
    out.vehicle_id = activeVehicle.id
    return out
  }

  const syncIpcParts = async (snagId, links = []) => {
    const { error: deleteError } = await supabase.from('snag_ipc_parts').delete().eq('snag_id', snagId)
    if (deleteError) return deleteError
    const rows = links.map(link => ({
      snag_id: snagId,
      ipc_part_id: link.ipc_part_id,
      quantity_needed: Number(link.quantity_needed || 1),
      note: link.note || null,
    }))
    if (rows.length === 0) return null
    const { error: insertError } = await supabase.from('snag_ipc_parts').insert(rows)
    return insertError
  }

  const handleAdd = async (form) => {
    setSaving(true); setError(null)
    const { data, error } = await supabase.from('snags').insert([clean(form)]).select('id').single()
    if (error) { setError(error.message); setSaving(false); return }
    const linkError = await syncIpcParts(data.id, form.ipcParts)
    if (linkError) { setError(linkError.message); setSaving(false); return }
    await fetchLogs(); setSaving(false); setView('list')
  }

  const handleEdit = async (form) => {
    setSaving(true); setError(null)
    const { error } = await supabase.from('snags').update(clean(form)).eq('id', selected.id)
    if (error) { setError(error.message); setSaving(false); return }
    const linkError = await syncIpcParts(selected.id, form.ipcParts)
    if (linkError) { setError(linkError.message); setSaving(false); return }
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
  const safetyCritical = logs.filter(s =>
    ACTIVE_STATUSES.includes(s.status) && SAFETY_CRITICAL.includes(s.safety_impact)).length
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
      <SnagForm
        onSave={handleAdd}
        onCancel={() => setView('list')}
        saving={saving}
        lastOdometer={lastOdometer}
        ipcParts={ipcParts}
        ipcLoading={ipcLoading}
      />
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
          conditions: selected.conditions || [],
          is_recurring: selected.is_recurring ?? false,
          ipcParts: (selected.snag_ipc_parts || []).map(link => ({ ...link, part: link.ipc_parts })),
        }}
        onSave={handleEdit}
        onCancel={() => setView('list')}
        saving={saving}
        lastOdometer={lastOdometer}
        ipcParts={ipcParts}
        ipcLoading={ipcLoading}
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
            <div className="card-label">Safety-critical</div>
            <div className="card-value" style={{ color: safetyCritical ? '#e74c3c' : undefined }}>{safetyCritical}</div>
            <div className="card-sub">affects safety &amp; open</div>
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
                    {log.title} {log.is_recurring && <span title="Recurring issue" style={{ color: '#e67e22' }}>↻</span>}
                    {(log.suspected_system || (log.conditions && log.conditions.length > 0)) && (
                      <div style={{ color: 'var(--text-dim)', fontSize: 11 }}>
                        {[log.suspected_system, (log.conditions || []).join(', ')].filter(Boolean).join(' · ')}
                      </div>
                    )}
                    {log.resolved_at && (
                      <div style={{ color: 'var(--text-dim)', fontSize: 11 }}>resolved {log.resolved_at}</div>
                    )}
                    {(log.snag_ipc_parts || []).length > 0 && (
                      <div style={{ color: 'var(--text-dim)', fontSize: 11, marginTop: 3 }}>
                        IPC: {(log.snag_ipc_parts || []).map(link => {
                          const part = link.ipc_parts || {}
                          return `${part.part_number}${link.quantity_needed ? ` x${Number(link.quantity_needed).toLocaleString()}` : ''}`
                        }).join(', ')}
                      </div>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${SEVERITY_BADGE[log.severity] || 'badge'}`}>{log.severity}</span>
                    {SAFETY_BADGE[log.safety_impact] && (
                      <div style={{ marginTop: 4 }}><span className={`badge ${SAFETY_BADGE[log.safety_impact]}`}>{log.safety_impact}</span></div>
                    )}
                  </td>
                  <td><span className={`badge ${STATUS_BADGE[log.status] || 'badge'}`}>{log.status}</span></td>
                  <td className="mono">{log.odometer_km ? Number(log.odometer_km).toLocaleString() : '—'}</td>
                  <td>
                    <div className="row-actions">
                      {ACTIVE_STATUSES.includes(log.status) && (
                        <button className="row-btn" onClick={() => handleMarkFixed(log)}>Fix</button>
                      )}
                      {ACTIVE_STATUSES.includes(log.status) && (
                        <button className="row-btn" onClick={() => navigate('/work-orders', {
                          state: {
                            newFromSnag: {
                              id: log.id,
                              title: log.title,
                              ipcParts: log.snag_ipc_parts || [],
                            },
                          },
                        })}>→ Job</button>
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
