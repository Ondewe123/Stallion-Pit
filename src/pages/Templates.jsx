import { useState, useEffect, useCallback } from 'react'
import { useVehicle } from '../contexts/VehicleContext'
import { supabase } from '../lib/supabase'
import { applyTemplate } from '../lib/calc/templates'

const PRIORITY = { 1: { label: 'Critical', badge: 'badge-red' }, 2: { label: 'High', badge: 'badge-amber' }, 3: { label: 'Normal', badge: 'badge-gold' }, 4: { label: 'Low', badge: 'badge' } }
const DIFF_BADGE = { Easy: 'badge-green', Moderate: 'badge-gold', Hard: 'badge-amber', Pro: 'badge-red' }
const DIFFICULTIES = ['Easy', 'Moderate', 'Hard', 'Pro']

const EMPTY_TPL = { name: '', make: '', model: '', sub_model: '', engine_code: '', notes: '' }
const EMPTY_ITEM = {
  item: '', category: '', distance_interval_km: '', time_interval_months: '', priority: 3,
  diy_difficulty: '', parts_needed: '', consumables_needed: '', torque_spec: '',
  warn_threshold_km: '', warn_threshold_days: '', spec_source: '', sort_order: 0,
}

const clean = (form) => {
  const out = { ...form }
  Object.keys(out).forEach(k => { if (out[k] === '') out[k] = null })
  return out
}

function TemplateForm({ initial = EMPTY_TPL, onSave, onCancel, saving }) {
  const [form, setForm] = useState({ ...EMPTY_TPL, ...initial })
  const set = (f, v) => setForm(p => ({ ...p, [f]: v }))
  return (
    <form onSubmit={e => { e.preventDefault(); onSave(form) }}>
      <div className="form-group">
        <label>Template Name *</label>
        <input value={form.name} onChange={e => set('name', e.target.value)} required placeholder="e.g. Mercedes-Benz W202 C180 (M111)" />
      </div>
      <div className="form-row-2">
        <div className="form-group"><label>Make</label><input value={form.make} onChange={e => set('make', e.target.value)} /></div>
        <div className="form-group"><label>Model</label><input value={form.model} onChange={e => set('model', e.target.value)} /></div>
      </div>
      <div className="form-row-2">
        <div className="form-group"><label>Sub Model</label><input value={form.sub_model} onChange={e => set('sub_model', e.target.value)} /></div>
        <div className="form-group"><label>Engine Code</label><input value={form.engine_code} onChange={e => set('engine_code', e.target.value)} /></div>
      </div>
      <div className="form-group"><label>Notes</label><textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} style={{ resize: 'vertical' }} /></div>
      <div className="form-actions">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="submit" className="btn-primary" style={{ width: 'auto', padding: '10px 28px' }} disabled={saving}>{saving ? 'Saving...' : 'Save Template'}</button>
      </div>
    </form>
  )
}

function ItemForm({ initial = EMPTY_ITEM, onSave, onCancel, saving }) {
  const [form, setForm] = useState({ ...EMPTY_ITEM, ...initial })
  const set = (f, v) => setForm(p => ({ ...p, [f]: v }))
  return (
    <form onSubmit={e => { e.preventDefault(); onSave(form) }}>
      <div className="form-row-2">
        <div className="form-group"><label>Item *</label><input value={form.item} onChange={e => set('item', e.target.value)} required placeholder="e.g. Engine Oil & Filter" /></div>
        <div className="form-group"><label>Category</label><input value={form.category} onChange={e => set('category', e.target.value)} placeholder="Engine, Brakes, …" /></div>
      </div>
      <div className="form-row-2">
        <div className="form-group"><label>Every (km)</label><input type="number" value={form.distance_interval_km} onChange={e => set('distance_interval_km', e.target.value)} placeholder="e.g. 10000" /></div>
        <div className="form-group"><label>Every (months)</label><input type="number" value={form.time_interval_months} onChange={e => set('time_interval_months', e.target.value)} placeholder="e.g. 12" /></div>
      </div>
      <div className="form-row-2">
        <div className="form-group">
          <label>Priority</label>
          <select value={form.priority} onChange={e => set('priority', e.target.value)}>
            {[1, 2, 3, 4].map(p => <option key={p} value={p}>{p} — {PRIORITY[p].label}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>DIY Difficulty</label>
          <select value={form.diy_difficulty} onChange={e => set('diy_difficulty', e.target.value)}>
            <option value="">—</option>
            {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      </div>
      <div className="form-row-2">
        <div className="form-group"><label>Warn before (km)</label><input type="number" value={form.warn_threshold_km} onChange={e => set('warn_threshold_km', e.target.value)} placeholder="default 1000" /></div>
        <div className="form-group"><label>Warn before (days)</label><input type="number" value={form.warn_threshold_days} onChange={e => set('warn_threshold_days', e.target.value)} placeholder="default 30" /></div>
      </div>
      <div className="form-group"><label>Parts Needed</label><input value={form.parts_needed} onChange={e => set('parts_needed', e.target.value)} placeholder="e.g. Oil filter element" /></div>
      <div className="form-group"><label>Consumables</label><input value={form.consumables_needed} onChange={e => set('consumables_needed', e.target.value)} placeholder="e.g. ~5 L 5W-40" /></div>
      <div className="form-row-2">
        <div className="form-group"><label>Torque Spec</label><input value={form.torque_spec} onChange={e => set('torque_spec', e.target.value)} placeholder="e.g. Sump plug 25 Nm" /></div>
        <div className="form-group"><label>Sort Order</label><input type="number" value={form.sort_order} onChange={e => set('sort_order', e.target.value)} /></div>
      </div>
      <div className="form-group"><label>Spec Source / Note</label><input value={form.spec_source} onChange={e => set('spec_source', e.target.value)} placeholder="e.g. verify vs manual" /></div>
      <div className="form-actions">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="submit" className="btn-primary" style={{ width: 'auto', padding: '10px 28px' }} disabled={saving}>{saving ? 'Saving...' : 'Save Item'}</button>
      </div>
    </form>
  )
}

export default function Templates() {
  const { activeVehicle } = useVehicle()
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('list') // list | detail | tplForm | itemForm
  const [selectedTpl, setSelectedTpl] = useState(null)
  const [selectedItem, setSelectedItem] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [apply, setApply] = useState(null) // { preview, applying } | null

  const fetchTemplates = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('maintenance_templates')
      .select('*, template_items(*)')
      .order('name', { ascending: true })
    const rows = (data || []).map(t => ({ ...t, template_items: (t.template_items || []).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)) }))
    setTemplates(rows)
    setSelectedTpl(prev => prev ? rows.find(r => r.id === prev.id) || null : null)
    setLoading(false)
  }, [])

  useEffect(() => { fetchTemplates() }, [fetchTemplates])

  // ── template CRUD ──
  const saveTemplate = async (form) => {
    setSaving(true); setError(null)
    const payload = clean(form)
    const res = selectedTpl && view === 'tplForm' && selectedTpl.id
      ? await supabase.from('maintenance_templates').update(payload).eq('id', selectedTpl.id)
      : await supabase.from('maintenance_templates').insert([payload])
    if (res.error) { setError(res.error.message); setSaving(false); return }
    setSaving(false); setView(selectedTpl?.id ? 'detail' : 'list')
    await fetchTemplates()
  }
  const deleteTemplate = async (id) => {
    await supabase.from('maintenance_templates').delete().eq('id', id)
    setDeleteConfirm(null); setSelectedTpl(null); setView('list')
    await fetchTemplates()
  }

  // ── item CRUD ──
  const saveItem = async (form) => {
    setSaving(true); setError(null)
    const payload = { ...clean(form), template_id: selectedTpl.id }
    const res = selectedItem
      ? await supabase.from('template_items').update(payload).eq('id', selectedItem.id)
      : await supabase.from('template_items').insert([payload])
    if (res.error) { setError(res.error.message); setSaving(false); return }
    setSaving(false); setView('detail')
    await fetchTemplates()
  }
  const deleteItem = async (id) => {
    await supabase.from('template_items').delete().eq('id', id)
    setDeleteConfirm(null)
    await fetchTemplates()
  }

  // ── apply to current vehicle ──
  const startApply = async () => {
    setError(null)
    const { data: existing, error: e } = await supabase
      .from('maintenance_schedules').select('item').eq('vehicle_id', activeVehicle.id)
    if (e) { setError(e.message); return }
    const preview = applyTemplate(selectedTpl.template_items, activeVehicle.id, existing || [])
    setApply({ preview, applying: false })
  }
  const confirmApply = async () => {
    setApply(a => ({ ...a, applying: true })); setError(null)
    if (apply.preview.toInsert.length) {
      const { error: e } = await supabase.from('maintenance_schedules').insert(apply.preview.toInsert)
      if (e) { setError(e.message); setApply(a => ({ ...a, applying: false })); return }
    }
    setApply(null)
  }

  // ───────── views ─────────
  if (view === 'tplForm') {
    return (
      <div className="page">
        <div className="page-header"><h2>{selectedTpl?.id ? 'Edit' : 'New'} Template</h2></div>
        {error && <div className="form-error">{error}</div>}
        <TemplateForm initial={selectedTpl?.id ? selectedTpl : EMPTY_TPL} onSave={saveTemplate}
          onCancel={() => setView(selectedTpl?.id ? 'detail' : 'list')} saving={saving} />
      </div>
    )
  }

  if (view === 'itemForm') {
    return (
      <div className="page">
        <div className="page-header"><h2>{selectedItem ? 'Edit' : 'Add'} Item · {selectedTpl.name}</h2></div>
        {error && <div className="form-error">{error}</div>}
        <ItemForm initial={selectedItem || EMPTY_ITEM} onSave={saveItem} onCancel={() => setView('detail')} saving={saving} />
      </div>
    )
  }

  if (view === 'detail' && selectedTpl) {
    const items = selectedTpl.template_items || []
    return (
      <div className="page">
        <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <button className="row-btn" onClick={() => { setSelectedTpl(null); setView('list') }} style={{ marginBottom: 8 }}>← All templates</button>
            <h2>{selectedTpl.name} {selectedTpl.is_builtin && <span className="badge badge-green">built-in</span>}</h2>
            <p className="page-sub">
              {[selectedTpl.make, selectedTpl.model, selectedTpl.engine_code].filter(Boolean).join(' · ') || 'Custom template'} · {items.length} items
            </p>
            {selectedTpl.notes && <p className="page-sub" style={{ color: 'var(--text-faint)' }}>{selectedTpl.notes}</p>}
          </div>
          <div className="row-actions" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button className="btn-primary" style={{ width: 'auto', padding: '8px 16px' }} onClick={startApply} disabled={!activeVehicle}>
              Apply to {activeVehicle?.name || 'vehicle'}
            </button>
            <button className="row-btn" onClick={() => { setSelectedItem(null); setView('itemForm') }}>+ Item</button>
            <button className="row-btn" onClick={() => setView('tplForm')}>Edit</button>
            {deleteConfirm === selectedTpl.id ? (
              <>
                <button className="row-btn row-btn-danger" onClick={() => deleteTemplate(selectedTpl.id)}>Confirm</button>
                <button className="row-btn" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              </>
            ) : <button className="row-btn row-btn-danger" onClick={() => setDeleteConfirm(selectedTpl.id)}>Delete</button>}
          </div>
        </div>

        {error && <div className="form-error">{error}</div>}

        {apply && (
          <div className="card" style={{ marginBottom: 16, borderColor: 'var(--accent)' }}>
            <div className="card-label">Apply “{selectedTpl.name}” to {activeVehicle?.name}</div>
            <p style={{ margin: '8px 0' }}>
              Will <strong>add {apply.preview.toInsert.length}</strong> new item{apply.preview.toInsert.length === 1 ? '' : 's'}
              {apply.preview.skipped.length > 0 && <> · <span style={{ color: 'var(--text-faint)' }}>skip {apply.preview.skipped.length} already on this vehicle ({apply.preview.skipped.join(', ')})</span></>}.
              Existing items and their history are never changed.
            </p>
            <div className="row-actions">
              <button className="btn-primary" style={{ width: 'auto', padding: '8px 20px' }} onClick={confirmApply}
                disabled={apply.applying || apply.preview.toInsert.length === 0}>
                {apply.applying ? 'Applying…' : `Add ${apply.preview.toInsert.length} items`}
              </button>
              <button className="row-btn" onClick={() => setApply(null)}>Cancel</button>
            </div>
          </div>
        )}

        {items.length === 0 ? (
          <div className="placeholder-card"><span>📋</span><p>No items yet — add one</p></div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead><tr><th>Item</th><th>Interval</th><th>Priority</th><th>DIY</th><th>Parts / Consumables</th><th></th></tr></thead>
              <tbody>
                {items.map(it => {
                  const interval = [it.distance_interval_km ? `${Number(it.distance_interval_km).toLocaleString()} km` : null,
                    it.time_interval_months ? `${Number(it.time_interval_months)} mo` : null].filter(Boolean).join(' / ') || '—'
                  const pri = PRIORITY[it.priority] || PRIORITY[3]
                  return (
                    <tr key={it.id}>
                      <td className="primary">{it.item}{it.category && <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{it.category}</div>}</td>
                      <td className="mono" style={{ fontSize: 12 }}>{interval}</td>
                      <td><span className={`badge ${pri.badge}`}>{pri.label}</span></td>
                      <td>{it.diy_difficulty ? <span className={`badge ${DIFF_BADGE[it.diy_difficulty] || 'badge'}`}>{it.diy_difficulty}</span> : '—'}</td>
                      <td style={{ fontSize: 12 }}>
                        {it.parts_needed && <div>{it.parts_needed}</div>}
                        {it.consumables_needed && <div style={{ color: 'var(--text-faint)' }}>{it.consumables_needed}</div>}
                        {it.torque_spec && <div style={{ color: 'var(--text-faint)' }}>🔩 {it.torque_spec}</div>}
                        {!it.parts_needed && !it.consumables_needed && !it.torque_spec && '—'}
                      </td>
                      <td>
                        <div className="row-actions">
                          <button className="row-btn" onClick={() => { setSelectedItem(it); setView('itemForm') }}>Edit</button>
                          {deleteConfirm === it.id ? (
                            <>
                              <button className="row-btn row-btn-danger" onClick={() => deleteItem(it.id)}>Confirm</button>
                              <button className="row-btn" onClick={() => setDeleteConfirm(null)}>Cancel</button>
                            </>
                          ) : <button className="row-btn row-btn-danger" onClick={() => setDeleteConfirm(it.id)}>Delete</button>}
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

  // list view
  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h2>Maintenance Templates</h2>
          <p className="page-sub">Reusable service schedules · apply to a vehicle to create its tracked items</p>
        </div>
        <button className="btn-primary" style={{ width: 'auto', padding: '10px 24px' }}
          onClick={() => { setSelectedTpl(null); setView('tplForm') }}>+ New Template</button>
      </div>

      {loading ? (
        <div className="placeholder-card"><p>Loading...</p></div>
      ) : templates.length === 0 ? (
        <div className="placeholder-card"><span>📋</span><p>No templates yet — create one</p></div>
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead><tr><th>Template</th><th>Vehicle</th><th>Items</th><th></th></tr></thead>
            <tbody>
              {templates.map(t => (
                <tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => { setSelectedTpl(t); setView('detail') }}>
                  <td className="primary">{t.name} {t.is_builtin && <span className="badge badge-green">built-in</span>}</td>
                  <td style={{ fontSize: 12 }}>{[t.make, t.model, t.engine_code].filter(Boolean).join(' · ') || '—'}</td>
                  <td>{t.template_items?.length || 0}</td>
                  <td><button className="row-btn" onClick={() => { setSelectedTpl(t); setView('detail') }}>Open →</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
