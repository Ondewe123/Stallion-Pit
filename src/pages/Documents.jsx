import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useVehicle } from '../contexts/VehicleContext'
import { supabase } from '../lib/supabase'
import { KINDS, storagePath, isImage, newId } from '../lib/docs'

const BUCKET = 'documents'
const KIND_BADGE = { Photo: 'badge-green', Receipt: 'badge-gold', Invoice: 'badge-gold', Insurance: 'badge-amber', Inspection: 'badge-amber', Logbook: 'badge', Other: 'badge' }
const FILTERS = ['All', ...KINDS]

const fmtSize = (n) => {
  if (!n) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

const EMPTY_FORM = { kind: 'Photo', title: '', note: '', work_order_id: '', part_id: '', service_log_id: '', snag_id: '' }

export default function Documents() {
  const { user } = useAuth()
  const { activeVehicle } = useVehicle()
  const [docs, setDocs] = useState([])
  const [thumbs, setThumbs] = useState({})       // id -> signed url (images)
  const [links, setLinks] = useState({ workOrders: [], parts: [], services: [], snags: [] })
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('list')        // list | add
  const [form, setForm] = useState(EMPTY_FORM)
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('All')
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  const fetchData = useCallback(async () => {
    if (!activeVehicle) return
    setLoading(true)
    const [{ data: d }, { data: wo }, { data: p }, { data: s }, { data: sn }] = await Promise.all([
      supabase.from('documents').select('*').eq('vehicle_id', activeVehicle.id).order('created_at', { ascending: false }),
      supabase.from('work_orders').select('id, title').eq('vehicle_id', activeVehicle.id).order('opened_at', { ascending: false }),
      supabase.from('parts').select('id, part_name').eq('vehicle_id', activeVehicle.id).order('purchased_at', { ascending: false }),
      supabase.from('service_logs').select('id, serviced_at, category').eq('vehicle_id', activeVehicle.id).order('serviced_at', { ascending: false }),
      supabase.from('snags').select('id, title').eq('vehicle_id', activeVehicle.id).order('reported_at', { ascending: false }),
    ])
    const list = d || []
    setDocs(list)
    setLinks({ workOrders: wo || [], parts: p || [], services: s || [], snags: sn || [] })
    setLoading(false)
    // lazy signed-url thumbnails for images
    const imgs = list.filter(x => isImage(x.mime_type))
    const entries = await Promise.all(imgs.map(async x => {
      const { data } = await supabase.storage.from(BUCKET).createSignedUrl(x.file_path, 3600)
      return [x.id, data?.signedUrl || null]
    }))
    setThumbs(Object.fromEntries(entries))
  }, [activeVehicle])

  useEffect(() => { fetchData() }, [fetchData])

  const set = (f, v) => setForm(p => ({ ...p, [f]: v }))

  const handleUpload = async (e) => {
    e.preventDefault()
    if (!file) { setError('Choose a file first'); return }
    setSaving(true); setError(null)
    const id = newId()
    const path = storagePath(user.id, id, file.name)
    const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: true })
    if (up.error) { setError('Upload failed: ' + up.error.message); setSaving(false); return }
    const row = { id, vehicle_id: activeVehicle.id, file_path: path, file_name: file.name, mime_type: file.type || null, file_size: file.size || null }
    for (const k of ['kind', 'title', 'note', 'work_order_id', 'part_id', 'service_log_id', 'snag_id']) row[k] = form[k] === '' ? null : form[k]
    const { error: ie } = await supabase.from('documents').insert([row])
    if (ie) {
      await supabase.storage.from(BUCKET).remove([path]) // roll back the orphaned object
      setError('Save failed: ' + ie.message); setSaving(false); return
    }
    setSaving(false); setForm(EMPTY_FORM); setFile(null); setView('list'); await fetchData()
  }

  const download = async (doc) => {
    const { data, error: e } = await supabase.storage.from(BUCKET).createSignedUrl(doc.file_path, 60)
    if (e) { setError(e.message); return }
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  const handleDelete = async (doc) => {
    setError(null)
    const rm = await supabase.storage.from(BUCKET).remove([doc.file_path])
    if (rm.error) { setError('Could not delete file: ' + rm.error.message); return }
    await supabase.from('documents').delete().eq('id', doc.id)
    setDeleteConfirm(null); await fetchData()
  }

  const linkLabel = (doc) => {
    if (doc.work_order_id) return `🛠 ${links.workOrders.find(w => w.id === doc.work_order_id)?.title || 'Work order'}`
    if (doc.part_id) return `📦 ${links.parts.find(p => p.id === doc.part_id)?.part_name || 'Part'}`
    if (doc.service_log_id) { const s = links.services.find(x => x.id === doc.service_log_id); return `🔧 ${s ? (s.category || s.serviced_at) : 'Service'}` }
    if (doc.snag_id) return `⚠️ ${links.snags.find(n => n.id === doc.snag_id)?.title || 'Snag'}`
    return null
  }

  if (!activeVehicle) return (
    <div className="page"><div className="page-header"><h2>Documents</h2></div>
      <div className="placeholder-card"><span>📄</span><p>Select a vehicle to view documents</p></div></div>
  )

  if (view === 'add') return (
    <div className="page">
      <div className="page-header"><h2>Upload Document</h2>
        <p className="page-sub">{activeVehicle.name} · {activeVehicle.year} {activeVehicle.make} {activeVehicle.model}</p></div>
      {error && <div className="form-error">{error}</div>}
      <form onSubmit={handleUpload}>
        <div className="form-group">
          <label>File *</label>
          <input type="file" onChange={e => setFile(e.target.files?.[0] || null)} required />
          {file && <p className="page-sub" style={{ marginTop: 4 }}>{file.name} · {fmtSize(file.size)}</p>}
        </div>
        <div className="form-row-2">
          <div className="form-group">
            <label>Kind</label>
            <select value={form.kind} onChange={e => set('kind', e.target.value)}>{KINDS.map(k => <option key={k}>{k}</option>)}</select>
          </div>
          <div className="form-group"><label>Title</label><input value={form.title} onChange={e => set('title', e.target.value)} placeholder="optional label" /></div>
        </div>
        <div className="form-row-2">
          <div className="form-group">
            <label>Link to work order</label>
            <select value={form.work_order_id} onChange={e => set('work_order_id', e.target.value)}>
              <option value="">—</option>{links.workOrders.map(w => <option key={w.id} value={w.id}>{w.title}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Link to part</label>
            <select value={form.part_id} onChange={e => set('part_id', e.target.value)}>
              <option value="">—</option>{links.parts.map(p => <option key={p.id} value={p.id}>{p.part_name}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row-2">
          <div className="form-group">
            <label>Link to service</label>
            <select value={form.service_log_id} onChange={e => set('service_log_id', e.target.value)}>
              <option value="">—</option>{links.services.map(s => <option key={s.id} value={s.id}>{s.category || 'Service'} · {s.serviced_at}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Link to snag</label>
            <select value={form.snag_id} onChange={e => set('snag_id', e.target.value)}>
              <option value="">—</option>{links.snags.map(n => <option key={n.id} value={n.id}>{n.title}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group"><label>Note</label><textarea value={form.note} onChange={e => set('note', e.target.value)} rows={2} style={{ resize: 'vertical' }} /></div>
        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={() => { setView('list'); setFile(null); setForm(EMPTY_FORM) }} disabled={saving}>Cancel</button>
          <button type="submit" className="btn-primary" style={{ width: 'auto', padding: '10px 28px' }} disabled={saving}>{saving ? 'Uploading…' : 'Upload'}</button>
        </div>
      </form>
    </div>
  )

  const shown = filter === 'All' ? docs : docs.filter(d => d.kind === filter)

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div><h2>Documents</h2><p className="page-sub">{activeVehicle.name} · receipts, invoices, logbook, photos</p></div>
        <button className="btn-primary" style={{ width: 'auto', padding: '10px 24px' }} onClick={() => setView('add')}>+ Upload</button>
      </div>
      {error && <div className="form-error">{error}</div>}

      {docs.length > 0 && (
        <div className="row-actions" style={{ margin: '16px 0', flexWrap: 'wrap' }}>
          {FILTERS.map(f => <button key={f} className={`row-btn ${filter === f ? 'vehicle-tab-active' : ''}`} onClick={() => setFilter(f)}>{f}</button>)}
        </div>
      )}

      {loading ? <div className="placeholder-card"><p>Loading...</p></div>
        : docs.length === 0 ? <div className="placeholder-card"><span>📄</span><p>No documents yet — upload a receipt, scan or photo</p></div>
          : shown.length === 0 ? <div className="placeholder-card"><span>📄</span><p>No {filter} documents</p></div>
            : (
              <div className="fleet-grid">
                {shown.map(doc => {
                  const link = linkLabel(doc)
                  return (
                    <div key={doc.id} className="fleet-card" style={{ cursor: 'default' }}>
                      <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--charcoal, #161616)', borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
                        {thumbs[doc.id]
                          ? <img src={thumbs[doc.id]} alt={doc.title || doc.file_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : <span style={{ fontSize: 40 }}>📄</span>}
                      </div>
                      <div className="fleet-card-header">
                        <div className="fleet-card-name" style={{ fontSize: 14 }}>{doc.title || doc.file_name}</div>
                        <span className={`badge ${KIND_BADGE[doc.kind] || 'badge'}`}>{doc.kind}</span>
                      </div>
                      <div className="fleet-card-make" style={{ fontSize: 12 }}>{doc.file_name} · {fmtSize(doc.file_size)}</div>
                      {link && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>{link}</div>}
                      {doc.note && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>{doc.note}</div>}
                      <div className="row-actions" style={{ marginTop: 8 }}>
                        <button className="row-btn" onClick={() => download(doc)}>Download</button>
                        {deleteConfirm === doc.id ? (
                          <>
                            <button className="row-btn row-btn-danger" onClick={() => handleDelete(doc)}>Confirm</button>
                            <button className="row-btn" onClick={() => setDeleteConfirm(null)}>Cancel</button>
                          </>
                        ) : <button className="row-btn row-btn-danger" onClick={() => setDeleteConfirm(doc.id)}>Delete</button>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
    </div>
  )
}
