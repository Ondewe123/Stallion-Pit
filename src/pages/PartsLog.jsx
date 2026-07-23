import { useState, useEffect, useCallback } from 'react'
import { useVehicle } from '../contexts/VehicleContext'
import { supabase } from '../lib/supabase'
import { computeWarrantyUntil, warrantyStatus } from '../lib/calc/parts'
import { estimateLandedKes } from '../lib/priceEstimate'

const CATEGORIES = [
  'Engine', 'Brakes', 'Suspension', 'Filters', 'Electrical',
  'Body', 'Tyres', 'Fluids', 'Consumable', 'Other',
]
const STATUSES = ['Wanted', 'In Stock', 'Purchased', 'Fitted', 'Returned']
const AVAILABLE = ['In Stock', 'Purchased']     // counts as on-hand / available — Wanted excluded on purpose
const FILTERS = ['All', 'Wanted', 'In stock', 'Fitted', 'Returned']
const today = () => new Date().toISOString().split('T')[0]

const EMPTY_FORM = {
  purchased_at: new Date().toISOString().split('T')[0],
  part_name: '',
  part_number: '',
  supplier_url: '',
  brand: '',
  category: 'Engine',
  supplier: '',
  quantity: '1',
  unit_cost_kes: '',
  odometer_km: '',
  status: 'In Stock',
  oem_number: '',
  equivalent_numbers: '',
  location: '',
  warranty_months: '',
  warranty_until: '',
  on_hand_qty: '',
  notes: '',
}

const lineTotal = (form) => {
  const qty = parseFloat(form.quantity)
  const unit = parseFloat(form.unit_cost_kes)
  if (isNaN(qty) || isNaN(unit)) return null
  return qty * unit
}

const STATUS_BADGE = { Wanted: 'badge', 'In Stock': 'badge-gold', Fitted: 'badge-green', Purchased: 'badge-amber', Returned: 'badge' }
const WARRANTY_BADGE = { active: 'badge-green', expired: 'badge' }
const WARRANTY_LABEL = { active: 'Under warranty', expired: 'Warranty expired' }

function PartForm({ initial = EMPTY_FORM, onSave, onCancel, saving, lastOdometer }) {
  const [form, setForm] = useState({ ...EMPTY_FORM, ...initial })
  const set = (field, value) => setForm(f => ({ ...f, [field]: value }))
  const [showInv, setShowInv] = useState(() =>
    !!(initial.oem_number || initial.equivalent_numbers || initial.location ||
      initial.warranty_months || initial.warranty_until || initial.on_hand_qty))

  const [fetching, setFetching] = useState(false)
  const [fetchError, setFetchError] = useState(null)
  const [pendingPhoto, setPendingPhoto] = useState(null)
  const [priceHint, setPriceHint] = useState(null)

  const searchAutodoc = () => {
    const q = form.part_number || form.part_name
    if (!q) return
    window.open('https://www.autodoc.co.uk/search?keyword=' + encodeURIComponent(q), '_blank', 'noopener')
  }

  const fetchDetails = async () => {
    if (!form.supplier_url) return
    setFetching(true); setFetchError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/fetch-part', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({ url: form.supplier_url }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Could not fetch that link')
      if (body.title && !form.part_name) set('part_name', body.title)
      setPriceHint(body.price != null ? {
        raw: body.price, currencyCode: body.currencyCode,
        landedKes: estimateLandedKes(body.price, body.currencyCode),
      } : null)
      setPendingPhoto(body.documentPath ? body : null)
    } catch (err) {
      setFetchError(err.message)
    } finally {
      setFetching(false)
    }
  }

  const total = lineTotal(form)   // derived — no effect needed

  const handleSubmit = (e) => { e.preventDefault(); onSave(form, pendingPhoto) }

  return (
    <form onSubmit={handleSubmit} className="parts-form">
      <div className="form-row-2">
        <div className="form-group">
          <label>Date *</label>
          <input type="date" value={form.purchased_at}
            onChange={e => set('purchased_at', e.target.value)} required />
        </div>
        <div className="form-group">
          <label>Part Name *</label>
          <input value={form.part_name} onChange={e => set('part_name', e.target.value)}
            placeholder="e.g. Oil filter" required />
        </div>
      </div>

      <div className="form-row-2">
        <div className="form-group">
          <label>Part Number</label>
          <input value={form.part_number} onChange={e => set('part_number', e.target.value)}
            placeholder="e.g. A 271 180 00 09" />
        </div>
        <div className="form-group">
          <label>Brand</label>
          <input value={form.brand} onChange={e => set('brand', e.target.value)}
            placeholder="e.g. Mann, Bosch" />
        </div>
      </div>

      <div className="form-group">
        <label>Part link</label>
        <input value={form.supplier_url} onChange={e => set('supplier_url', e.target.value)}
          placeholder="paste the product page URL you're buying from" />
        <div className="row-actions" style={{ marginTop: 6 }}>
          <button type="button" className="row-btn" onClick={searchAutodoc}>Search on Autodoc</button>
          <button type="button" className="row-btn" onClick={fetchDetails}
            disabled={!form.supplier_url || fetching}>
            {fetching ? 'Fetching…' : 'Fetch details'}
          </button>
        </div>
        {fetchError && <p className="form-error" style={{ marginTop: 4 }}>{fetchError}</p>}
      </div>

      <div className="form-row-2">
        <div className="form-group">
          <label>Category</label>
          <select value={form.category} onChange={e => set('category', e.target.value)}>
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Supplier</label>
          <input value={form.supplier} onChange={e => set('supplier', e.target.value)}
            placeholder="e.g. Kingsway, Autoxpress" />
        </div>
      </div>

      <div className="form-row-2">
        <div className="form-group">
          <label>Quantity</label>
          <input type="number" step="1" min="0" value={form.quantity}
            onChange={e => set('quantity', e.target.value)} placeholder="1" />
        </div>
        <div className="form-group">
          <label>Unit Cost (KES)</label>
          <input type="number" step="0.01" value={form.unit_cost_kes}
            onChange={e => set('unit_cost_kes', e.target.value)} placeholder="e.g. 1200" />
          {priceHint && (
            <p className="page-sub" style={{ marginTop: 4 }}>
              Found: {priceHint.raw}{priceHint.currencyCode ? ` ${priceHint.currencyCode}` : ''}
              {priceHint.landedKes != null &&
                ` → approx KES ${Math.round(priceHint.landedKes).toLocaleString()} (rate + shipping estimate)`}
            </p>
          )}
        </div>
      </div>

      <div className="form-group">
        <label>Total (KES) — Auto-calculated</label>
        <input type="text" readOnly
          value={total != null ? total.toLocaleString() : ''}
          placeholder="Quantity × Unit Cost"
          style={{ background: 'var(--surface)', color: 'var(--accent)', fontWeight: '500', cursor: 'not-allowed' }} />
      </div>

      <div className="form-row-2">
        <div className="form-group">
          <label>Odometer (km)</label>
          <input type="number" value={form.odometer_km}
            onChange={e => set('odometer_km', e.target.value)}
            placeholder={lastOdometer ? `Last: ${lastOdometer.toLocaleString()}` : 'optional'} />
        </div>
        <div className="form-group">
          <label>Status</label>
          <select value={form.status} onChange={e => set('status', e.target.value)}>
            {STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <button type="button" className="row-btn" style={{ marginBottom: 12 }} onClick={() => setShowInv(s => !s)}>
        {showInv ? '▾' : '▸'} Inventory &amp; warranty
      </button>

      {showInv && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="form-row-2">
            <div className="form-group">
              <label>OEM number</label>
              <input value={form.oem_number || ''} onChange={e => set('oem_number', e.target.value)} placeholder="genuine part number" />
            </div>
            <div className="form-group">
              <label>Equivalent / cross-ref numbers</label>
              <input value={form.equivalent_numbers || ''} onChange={e => set('equivalent_numbers', e.target.value)} placeholder="aftermarket equivalents" />
            </div>
          </div>
          <div className="form-row-2">
            <div className="form-group">
              <label>Storage location</label>
              <input value={form.location || ''} onChange={e => set('location', e.target.value)} placeholder="e.g. garage shelf B" />
            </div>
            <div className="form-group">
              <label>On-hand qty</label>
              <input type="number" value={form.on_hand_qty || ''} onChange={e => set('on_hand_qty', e.target.value)} placeholder="units on the shelf" />
            </div>
          </div>
          <div className="form-row-2">
            <div className="form-group">
              <label>Warranty (months)</label>
              <input type="number" value={form.warranty_months || ''} onChange={e => set('warranty_months', e.target.value)} placeholder="e.g. 12" />
            </div>
            <div className="form-group">
              <label>Warranty until</label>
              <input type="date" value={form.warranty_until || ''} onChange={e => set('warranty_until', e.target.value)} />
            </div>
          </div>
          <p className="page-sub" style={{ margin: 0 }}>Leave “warranty until” blank to auto-fill from purchase date + months.</p>
        </div>
      )}

      <div className="form-group">
        <label>Notes</label>
        <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
          placeholder="Any notes about this part..." rows={2} style={{ resize: 'vertical' }} />
      </div>

      <div className="form-actions">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="submit" className="btn-primary"
          style={{ width: 'auto', padding: '10px 28px' }} disabled={saving}>
          {saving ? 'Saving...' : 'Save Part'}
        </button>
      </div>
    </form>
  )
}

export default function PartsLog() {
  const { activeVehicle } = useVehicle()
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('list')   // list | add | edit
  const [selected, setSelected] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [filter, setFilter] = useState('All')
  const [photoThumbs, setPhotoThumbs] = useState({})   // part_id -> signed url

  const fetchLogs = useCallback(async () => {
    if (!activeVehicle) return
    setLoading(true)
    const { data } = await supabase
      .from('parts')
      .select('*')
      .eq('vehicle_id', activeVehicle.id)
      .order('purchased_at', { ascending: false })
    const list = data || []
    setLogs(list)
    setLoading(false)

    const ids = list.map(l => l.id)
    if (ids.length) {
      const { data: docs } = await supabase
        .from('documents')
        .select('part_id, file_path')
        .eq('kind', 'Photo')
        .in('part_id', ids)
      const entries = await Promise.all((docs || []).map(async d => {
        const { data: signed } = await supabase.storage.from('documents').createSignedUrl(d.file_path, 3600)
        return [d.part_id, signed?.signedUrl || null]
      }))
      setPhotoThumbs(Object.fromEntries(entries))
    } else {
      setPhotoThumbs({})
    }
  }, [activeVehicle])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  const clean = (form) => {
    const out = { ...form }
    Object.keys(out).forEach(k => { if (out[k] === '') out[k] = null })
    out.total_cost_kes = lineTotal(form)
    if (!out.warranty_until) out.warranty_until = computeWarrantyUntil(out)
    out.vehicle_id = activeVehicle.id
    return out
  }

  const insertPhotoDoc = async (photo, partId) => {
    const { error } = await supabase.from('documents').insert([{
      id: photo.documentId,
      vehicle_id: activeVehicle.id,
      file_path: photo.documentPath,
      file_name: photo.fileName,
      mime_type: photo.mimeType,
      file_size: photo.fileSize,
      kind: 'Photo',
      part_id: partId,
    }])
    if (error) console.error('[parts] photo attach failed:', error.message)
  }

  const handleAdd = async (form, pendingPhoto) => {
    setSaving(true); setError(null)
    const { data, error } = await supabase.from('parts').insert([clean(form)]).select().single()
    if (error) { setError(error.message); setSaving(false); return }
    if (pendingPhoto?.documentPath) await insertPhotoDoc(pendingPhoto, data.id)
    await fetchLogs(); setSaving(false); setView('list')
  }

  const handleEdit = async (form, pendingPhoto) => {
    setSaving(true); setError(null)
    const { error } = await supabase.from('parts').update(clean(form)).eq('id', selected.id)
    if (error) { setError(error.message); setSaving(false); return }
    if (pendingPhoto?.documentPath) await insertPhotoDoc(pendingPhoto, selected.id)
    await fetchLogs(); setSaving(false); setView('list')
  }

  const handleDelete = async (id) => {
    await supabase.from('parts').delete().eq('id', id)
    setDeleteConfirm(null)
    await fetchLogs()
  }

  const totalSpent = logs.reduce((sum, l) => sum + Number(l.total_cost_kes || 0), 0)
  const totalUnits = logs.reduce((sum, l) => sum + Number(l.quantity || 0), 0)
  const currentOdo = logs.reduce((max, l) => Math.max(max, Number(l.odometer_km || 0)), 0)
  const lastOdometer = currentOdo || null
  const td = today()
  const inStockCount = logs.filter(l => AVAILABLE.includes(l.status)).length
  const underWarranty = logs.filter(l => warrantyStatus(l, td) === 'active').length
  const shown = logs.filter(l =>
    filter === 'All' ? true
      : filter === 'In stock' ? AVAILABLE.includes(l.status)
        : l.status === filter)

  if (!activeVehicle) return (
    <div className="page">
      <div className="page-header"><h2>Parts Log</h2></div>
      <div className="placeholder-card"><span>📦</span><p>Select a vehicle to view parts</p></div>
    </div>
  )

  if (view === 'add') return (
    <div className="page">
      <div className="page-header">
        <h2>Log Part</h2>
        <p className="page-sub">{activeVehicle.name} · {activeVehicle.year} {activeVehicle.make} {activeVehicle.model}</p>
      </div>
      {error && <div className="form-error">{error}</div>}
      <PartForm onSave={handleAdd} onCancel={() => setView('list')} saving={saving} lastOdometer={lastOdometer} />
    </div>
  )

  if (view === 'edit' && selected) return (
    <div className="page">
      <div className="page-header">
        <h2>Edit Part</h2>
        <p className="page-sub">{selected.part_name}</p>
      </div>
      {error && <div className="form-error">{error}</div>}
      <PartForm
        initial={{ ...selected, purchased_at: selected.purchased_at?.split('T')[0] || selected.purchased_at }}
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
          <h2>Parts Log</h2>
          <p className="page-sub">{activeVehicle.name} · {activeVehicle.year} {activeVehicle.make} {activeVehicle.model}</p>
        </div>
        <button className="btn-primary" style={{ width: 'auto', padding: '10px 24px' }}
          onClick={() => setView('add')}>
          + Log Part
        </button>
      </div>

      {logs.length > 0 && (
        <div className="fuel-stats-grid">
          <div className="card">
            <div className="card-label">Total Spent</div>
            <div className="card-value">
              {totalSpent.toLocaleString()} <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>KES</span>
            </div>
            <div className="card-sub">on parts</div>
          </div>
          <div className="card">
            <div className="card-label">In Stock</div>
            <div className="card-value">{inStockCount}</div>
            <div className="card-sub">available parts</div>
          </div>
          <div className="card">
            <div className="card-label">Under Warranty</div>
            <div className="card-value" style={{ color: underWarranty ? 'var(--success-strong)' : undefined }}>{underWarranty}</div>
            <div className="card-sub">cover still active</div>
          </div>
          <div className="card">
            <div className="card-label">Total Entries</div>
            <div className="card-value">{logs.length}</div>
            <div className="card-sub">{totalUnits.toLocaleString()} units total</div>
          </div>
          <div className="card">
            <div className="card-label">Last Purchase</div>
            <div className="card-value" style={{ fontSize: 18 }}>{logs[0].part_name}</div>
            <div className="card-sub">{logs[0].purchased_at}{logs[0].supplier ? ` · ${logs[0].supplier}` : ''}</div>
          </div>
          <div className="card">
            <div className="card-label">Current Odometer</div>
            <div className="card-value">{currentOdo ? currentOdo.toLocaleString() : '—'} <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>km</span></div>
            <div className="card-sub">highest recorded</div>
          </div>
        </div>
      )}

      {logs.length > 0 && (
        <div className="row-actions" style={{ margin: '16px 0', flexWrap: 'wrap' }}>
          {FILTERS.map(f => (
            <button key={f} className={`row-btn ${filter === f ? 'vehicle-tab-active' : ''}`} onClick={() => setFilter(f)}>{f}</button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="placeholder-card"><p>Loading...</p></div>
      ) : logs.length === 0 ? (
        <div className="placeholder-card">
          <span>📦</span>
          <p>No parts logged yet — log your first part</p>
        </div>
      ) : shown.length === 0 ? (
        <div className="placeholder-card"><span>📦</span><p>No {filter.toLowerCase()} parts</p></div>
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Part</th>
                <th>Category</th>
                <th>Supplier</th>
                <th>Qty</th>
                <th>Total (KES)</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {shown.map(log => {
                const w = warrantyStatus(log, td)
                return (
                <tr key={log.id}>
                  <td className="mono">{log.purchased_at}</td>
                  <td className="primary">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {photoThumbs[log.id] && (
                        <img src={photoThumbs[log.id]} alt=""
                          style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
                      )}
                      <div>
                        {log.part_name}
                        {(log.brand || log.part_number || log.oem_number) && (
                          <div style={{ color: 'var(--text-faint)', fontSize: 11 }}>
                            {[log.brand, log.oem_number || log.part_number].filter(Boolean).join(' · ')}
                          </div>
                        )}
                        {log.location && <div style={{ color: 'var(--text-faint)', fontSize: 11 }}>📍 {log.location}</div>}
                      </div>
                    </div>
                  </td>
                  <td style={{ color: 'var(--text-faint)', fontSize: 12 }}>{log.category || '—'}</td>
                  <td style={{ color: 'var(--text-faint)', fontSize: 12 }}>{log.supplier || '—'}</td>
                  <td className="mono">{log.quantity != null ? Number(log.quantity).toLocaleString() : '—'}</td>
                  <td className="mono">{log.total_cost_kes != null ? Number(log.total_cost_kes).toLocaleString() : '—'}</td>
                  <td>
                    <span className={`badge ${STATUS_BADGE[log.status] || 'badge'}`}>{log.status}</span>
                    {w && <div style={{ marginTop: 4 }}><span className={`badge ${WARRANTY_BADGE[w]}`} title={log.warranty_until ? `until ${log.warranty_until}` : ''}>{WARRANTY_LABEL[w]}</span></div>}
                  </td>
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
