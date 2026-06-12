import { useState, useEffect, useCallback } from 'react'
import { useVehicle } from '../contexts/VehicleContext'
import { supabase } from '../lib/supabase'

const DUE_SOON_KM = 1000
const DUE_SOON_DAYS = 30

const EMPTY_FORM = {
  item: '',
  distance_interval_km: '',
  time_interval_months: '',
  last_done_odometer: '',
  last_done_date: '',
  next_due_odometer: '',
  next_due_date: '',
  notes: '',
}

const daysUntil = (dateStr) => {
  if (!dateStr) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const d = new Date(dateStr + 'T00:00:00')
  return Math.round((d - today) / 86400000)
}

const addMonths = (dateStr, months) => {
  const d = new Date(dateStr + 'T00:00:00')
  d.setMonth(d.getMonth() + Math.round(Number(months)))
  return d.toISOString().split('T')[0]
}

function evaluate(item, currentOdo) {
  const remKm = item.next_due_odometer != null && currentOdo
    ? Number(item.next_due_odometer) - currentOdo : null
  const remDays = daysUntil(item.next_due_date)
  let status = 'ok'
  if ((remKm != null && remKm < 0) || (remDays != null && remDays < 0)) status = 'overdue'
  else if ((remKm != null && remKm <= DUE_SOON_KM) || (remDays != null && remDays <= DUE_SOON_DAYS)) status = 'soon'
  return { remKm, remDays, status }
}

const kmText = (remKm) => remKm == null ? null
  : remKm < 0 ? `OVERDUE by ${Math.abs(remKm).toLocaleString()} km` : `in ${remKm.toLocaleString()} km`
const dayText = (remDays) => remDays == null ? null
  : remDays < 0 ? `OVERDUE by ${Math.abs(remDays)} d` : `in ${remDays} d`

const STATUS_META = {
  overdue: { badge: 'badge-red', label: 'Overdue' },
  soon: { badge: 'badge-amber', label: 'Due soon' },
  ok: { badge: 'badge-green', label: 'OK' },
}

function MaintForm({ initial = EMPTY_FORM, onSave, onCancel, saving }) {
  const [form, setForm] = useState({ ...EMPTY_FORM, ...initial })
  const set = (field, value) => setForm(f => ({ ...f, [field]: value }))
  const handleSubmit = (e) => { e.preventDefault(); onSave(form) }

  return (
    <form onSubmit={handleSubmit} className="maint-form">
      <div className="form-group">
        <label>Item *</label>
        <input value={form.item} onChange={e => set('item', e.target.value)}
          placeholder="e.g. Engine Oil &amp; Filter" required />
      </div>

      <div className="form-row-2">
        <div className="form-group">
          <label>Every (km)</label>
          <input type="number" value={form.distance_interval_km}
            onChange={e => set('distance_interval_km', e.target.value)} placeholder="e.g. 8000" />
        </div>
        <div className="form-group">
          <label>Every (months)</label>
          <input type="number" value={form.time_interval_months}
            onChange={e => set('time_interval_months', e.target.value)} placeholder="e.g. 12" />
        </div>
      </div>

      <div className="form-row-2">
        <div className="form-group">
          <label>Last Done (odometer km)</label>
          <input type="number" value={form.last_done_odometer}
            onChange={e => set('last_done_odometer', e.target.value)} placeholder="optional" />
        </div>
        <div className="form-group">
          <label>Last Done (date)</label>
          <input type="date" value={form.last_done_date}
            onChange={e => set('last_done_date', e.target.value)} />
        </div>
      </div>

      <div className="form-row-2">
        <div className="form-group">
          <label>Next Due (odometer km)</label>
          <input type="number" value={form.next_due_odometer}
            onChange={e => set('next_due_odometer', e.target.value)} placeholder="auto from interval if blank" />
        </div>
        <div className="form-group">
          <label>Next Due (date)</label>
          <input type="date" value={form.next_due_date}
            onChange={e => set('next_due_date', e.target.value)} />
        </div>
      </div>

      <div className="form-group">
        <label>Notes</label>
        <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
          placeholder="Any notes..." rows={2} style={{ resize: 'vertical' }} />
      </div>

      <div className="form-actions">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="submit" className="btn-primary"
          style={{ width: 'auto', padding: '10px 28px' }} disabled={saving}>
          {saving ? 'Saving...' : 'Save Item'}
        </button>
      </div>
    </form>
  )
}

export default function Maintenance() {
  const { activeVehicle } = useVehicle()
  const [items, setItems] = useState([])
  const [currentOdo, setCurrentOdo] = useState(0)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('list')
  const [selected, setSelected] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  const fetchData = useCallback(async () => {
    if (!activeVehicle) return
    setLoading(true)
    const [{ data: rows }, { data: f }, { data: s }] = await Promise.all([
      supabase.from('maintenance_schedules').select('*').eq('vehicle_id', activeVehicle.id)
        .order('next_due_odometer', { ascending: true, nullsFirst: false }),
      supabase.from('fuel_logs').select('odometer_km').eq('vehicle_id', activeVehicle.id)
        .order('odometer_km', { ascending: false }).limit(1),
      supabase.from('service_logs').select('odometer_km').eq('vehicle_id', activeVehicle.id)
        .order('odometer_km', { ascending: false }).limit(1),
    ])
    setItems(rows || [])
    setCurrentOdo(Math.max(Number(f?.[0]?.odometer_km || 0), Number(s?.[0]?.odometer_km || 0)))
    setLoading(false)
  }, [activeVehicle])

  useEffect(() => { fetchData() }, [fetchData])

  const clean = (form) => {
    const out = { ...form }
    Object.keys(out).forEach(k => { if (out[k] === '') out[k] = null })
    out.vehicle_id = activeVehicle.id
    if (out.next_due_odometer == null && out.last_done_odometer != null && out.distance_interval_km != null)
      out.next_due_odometer = Number(out.last_done_odometer) + Number(out.distance_interval_km)
    if (out.next_due_date == null && out.last_done_date != null && out.time_interval_months != null)
      out.next_due_date = addMonths(out.last_done_date, out.time_interval_months)
    return out
  }

  const handleAdd = async (form) => {
    setSaving(true); setError(null)
    const { error } = await supabase.from('maintenance_schedules').insert([clean(form)])
    if (error) { setError(error.message); setSaving(false); return }
    await fetchData(); setSaving(false); setView('list')
  }

  const handleEdit = async (form) => {
    setSaving(true); setError(null)
    const { error } = await supabase.from('maintenance_schedules').update(clean(form)).eq('id', selected.id)
    if (error) { setError(error.message); setSaving(false); return }
    await fetchData(); setSaving(false); setView('list')
  }

  const handleDelete = async (id) => {
    await supabase.from('maintenance_schedules').delete().eq('id', id)
    setDeleteConfirm(null)
    await fetchData()
  }

  const handleMarkDone = async (item) => {
    const today = new Date().toISOString().split('T')[0]
    const patch = { last_done_odometer: currentOdo || item.last_done_odometer, last_done_date: today }
    if (item.distance_interval_km && currentOdo) patch.next_due_odometer = currentOdo + Number(item.distance_interval_km)
    if (item.time_interval_months) patch.next_due_date = addMonths(today, item.time_interval_months)
    await supabase.from('maintenance_schedules').update(patch).eq('id', item.id)
    await fetchData()
  }

  const evaluated = items.map(it => ({ ...it, ...evaluate(it, currentOdo) }))
  const overdueCount = evaluated.filter(e => e.status === 'overdue').length
  const soonCount = evaluated.filter(e => e.status === 'soon').length

  if (!activeVehicle) return (
    <div className="page">
      <div className="page-header"><h2>Maintenance Schedule</h2></div>
      <div className="placeholder-card"><span>📅</span><p>Select a vehicle to view its schedule</p></div>
    </div>
  )

  if (view === 'add') return (
    <div className="page">
      <div className="page-header">
        <h2>Add Schedule Item</h2>
        <p className="page-sub">{activeVehicle.name} · {activeVehicle.year} {activeVehicle.make} {activeVehicle.model}</p>
      </div>
      {error && <div className="form-error">{error}</div>}
      <MaintForm onSave={handleAdd} onCancel={() => setView('list')} saving={saving} />
    </div>
  )

  if (view === 'edit' && selected) return (
    <div className="page">
      <div className="page-header">
        <h2>Edit Schedule Item</h2>
        <p className="page-sub">{selected.item}</p>
      </div>
      {error && <div className="form-error">{error}</div>}
      <MaintForm
        initial={{
          ...selected,
          last_done_date: selected.last_done_date?.split('T')[0] || selected.last_done_date || '',
          next_due_date: selected.next_due_date?.split('T')[0] || selected.next_due_date || '',
        }}
        onSave={handleEdit}
        onCancel={() => setView('list')}
        saving={saving}
      />
    </div>
  )

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h2>Maintenance Schedule</h2>
          <p className="page-sub">
            {activeVehicle.name} · {activeVehicle.year} {activeVehicle.make} {activeVehicle.model}
            {currentOdo ? ` · now at ${currentOdo.toLocaleString()} km` : ''}
          </p>
        </div>
        <button className="btn-primary" style={{ width: 'auto', padding: '10px 24px' }}
          onClick={() => setView('add')}>
          + Add Item
        </button>
      </div>

      {items.length > 0 && (
        <div className="fuel-stats-grid">
          <div className="card">
            <div className="card-label">Overdue</div>
            <div className="card-value" style={{ color: overdueCount ? '#e74c3c' : undefined }}>{overdueCount}</div>
            <div className="card-sub">past due</div>
          </div>
          <div className="card">
            <div className="card-label">Due Soon</div>
            <div className="card-value" style={{ color: soonCount ? '#f39c12' : undefined }}>{soonCount}</div>
            <div className="card-sub">within {DUE_SOON_KM.toLocaleString()} km / {DUE_SOON_DAYS} d</div>
          </div>
          <div className="card">
            <div className="card-label">Total Items</div>
            <div className="card-value">{items.length}</div>
            <div className="card-sub">tracked</div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="placeholder-card"><p>Loading...</p></div>
      ) : items.length === 0 ? (
        <div className="placeholder-card">
          <span>📅</span>
          <p>No schedule items yet — add a service interval</p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Interval</th>
                <th>Next Due</th>
                <th>Remaining</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {evaluated.map(it => {
                const meta = STATUS_META[it.status]
                const interval = [
                  it.distance_interval_km ? `${Number(it.distance_interval_km).toLocaleString()} km` : null,
                  it.time_interval_months ? `${Number(it.time_interval_months)} mo` : null,
                ].filter(Boolean).join(' / ') || '—'
                const nextDue = [
                  it.next_due_odometer ? `${Number(it.next_due_odometer).toLocaleString()} km` : null,
                  it.next_due_date || null,
                ].filter(Boolean).join(' · ') || '—'
                return (
                  <tr key={it.id}>
                    <td className="primary">{it.item}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{interval}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{nextDue}</td>
                    <td style={{ fontSize: 12 }}>
                      {kmText(it.remKm) && <div>{kmText(it.remKm)}</div>}
                      {dayText(it.remDays) && <div style={{ color: 'var(--text-dim)' }}>{dayText(it.remDays)}</div>}
                      {it.remKm == null && it.remDays == null && '—'}
                    </td>
                    <td><span className={`badge ${meta.badge}`}>{meta.label}</span></td>
                    <td>
                      <div className="row-actions">
                        <button className="row-btn" onClick={() => handleMarkDone(it)}>Mark Done</button>
                        <button className="row-btn" onClick={() => { setSelected(it); setView('edit') }}>Edit</button>
                        {deleteConfirm === it.id ? (
                          <>
                            <button className="row-btn row-btn-danger" onClick={() => handleDelete(it.id)}>Confirm</button>
                            <button className="row-btn" onClick={() => setDeleteConfirm(null)}>Cancel</button>
                          </>
                        ) : (
                          <button className="row-btn row-btn-danger" onClick={() => setDeleteConfirm(it.id)}>Delete</button>
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
