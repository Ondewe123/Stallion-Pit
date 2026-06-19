import { useState } from 'react'
import { useVehicle } from '../contexts/VehicleContext'
import { supabase } from '../lib/supabase'
import { vehicleRenewals, worstRenewalStatus } from '../lib/calc/renewals'

const today = () => new Date().toISOString().split('T')[0]
const RENEWAL_BADGE = { overdue: 'badge-red', soon: 'badge-amber', ok: 'badge-green' }

const EMPTY_FORM = {
  name: '', make: '', model: '', sub_model: '', year: '',
  engine_code: '', engine_description: '', transmission: '',
  drive_type: '', body_type: '', fuel_type: 'Petrol',
  color: '', license_plate: '', vin: '', purchase_date: '',
  purchase_price_kes: '', odometer_at_purchase: '',
  fuel_tank_capacity: '', oil_capacity_litres: '', oil_spec: '',
  gearbox_code: '', tyre_size: '', battery_spec: '', coolant_spec: '', obd_notes: '',
  insurance_expiry: '', inspection_expiry: '', licence_expiry: '', insurance_note: '',
  notes: '',
}

function VehicleForm({ initial = EMPTY_FORM, onSave, onCancel, saving }) {
  const [form, setForm] = useState({ ...EMPTY_FORM, ...initial })
  const set = (field, value) => setForm(f => ({ ...f, [field]: value }))

  const handleSubmit = (e) => { e.preventDefault(); onSave(form) }

  return (
    <form onSubmit={handleSubmit} className="vehicle-form">
      <div className="form-section-title">Identity</div>
      <div className="form-row">
        <div className="form-group">
          <label>Nickname *</label>
          <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Mercedes" required />
        </div>
        <div className="form-group">
          <label>Make *</label>
          <input value={form.make} onChange={e => set('make', e.target.value)} placeholder="e.g. Mercedes-Benz" required />
        </div>
        <div className="form-group">
          <label>Model *</label>
          <input value={form.model} onChange={e => set('model', e.target.value)} placeholder="e.g. C180" required />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Sub Model</label>
          <input value={form.sub_model} onChange={e => set('sub_model', e.target.value)} placeholder="e.g. Base, 9N" />
        </div>
        <div className="form-group">
          <label>Year *</label>
          <input type="number" value={form.year} onChange={e => set('year', e.target.value)} placeholder="e.g. 1996" min="1900" max="2100" required />
        </div>
        <div className="form-group">
          <label>Fuel Type</label>
          <select value={form.fuel_type} onChange={e => set('fuel_type', e.target.value)}>
            <option>Petrol</option><option>Diesel</option><option>Hybrid</option><option>Electric</option>
          </select>
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Body Type</label>
          <input value={form.body_type} onChange={e => set('body_type', e.target.value)} placeholder="e.g. Sedan, Hatchback" />
        </div>
        <div className="form-group">
          <label>Transmission</label>
          <input value={form.transmission} onChange={e => set('transmission', e.target.value)} placeholder="e.g. Manual 5-speed" />
        </div>
        <div className="form-group">
          <label>Drive Type</label>
          <select value={form.drive_type} onChange={e => set('drive_type', e.target.value)}>
            <option value="">— select —</option>
            <option>FWD</option><option>RWD</option><option>AWD</option><option>4WD</option>
          </select>
        </div>
      </div>
      <div className="form-section-title">Engine & Technical</div>
      <div className="form-row">
        <div className="form-group">
          <label>Engine Code</label>
          <input value={form.engine_code} onChange={e => set('engine_code', e.target.value)} placeholder="e.g. M111.920" />
        </div>
        <div className="form-group">
          <label>Engine Description</label>
          <input value={form.engine_description} onChange={e => set('engine_description', e.target.value)} placeholder="e.g. 1.8L NA Petrol" />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Oil Capacity (L with filter)</label>
          <input type="number" step="0.1" value={form.oil_capacity_litres} onChange={e => set('oil_capacity_litres', e.target.value)} placeholder="e.g. 5.5" />
        </div>
        <div className="form-group">
          <label>Oil Spec</label>
          <input value={form.oil_spec} onChange={e => set('oil_spec', e.target.value)} placeholder="e.g. 5W-40 MB 229.3" />
        </div>
        <div className="form-group">
          <label>Fuel Tank Capacity (L)</label>
          <input type="number" step="0.1" value={form.fuel_tank_capacity} onChange={e => set('fuel_tank_capacity', e.target.value)} placeholder="e.g. 62" />
        </div>
      </div>
      <div className="form-section-title">Registration & Purchase</div>
      <div className="form-row">
        <div className="form-group">
          <label>License Plate</label>
          <input value={form.license_plate} onChange={e => set('license_plate', e.target.value)} placeholder="e.g. KDG 123A" />
        </div>
        <div className="form-group">
          <label>VIN</label>
          <input value={form.vin} onChange={e => set('vin', e.target.value)} placeholder="Chassis / VIN number" />
        </div>
        <div className="form-group">
          <label>Color</label>
          <input value={form.color} onChange={e => set('color', e.target.value)} placeholder="e.g. Silver" />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Purchase Date</label>
          <input type="date" value={form.purchase_date} onChange={e => set('purchase_date', e.target.value)} />
        </div>
        <div className="form-group">
          <label>Purchase Price (KES)</label>
          <input type="number" value={form.purchase_price_kes} onChange={e => set('purchase_price_kes', e.target.value)} placeholder="e.g. 50000" />
        </div>
        <div className="form-group">
          <label>Odometer at Purchase (km)</label>
          <input type="number" value={form.odometer_at_purchase} onChange={e => set('odometer_at_purchase', e.target.value)} placeholder="e.g. 165000" />
        </div>
      </div>
      <div className="form-section-title">Specs (Tyres, Battery, Fluids)</div>
      <div className="form-row">
        <div className="form-group">
          <label>Gearbox Code</label>
          <input value={form.gearbox_code} onChange={e => set('gearbox_code', e.target.value)} placeholder="e.g. 717.4" />
        </div>
        <div className="form-group">
          <label>Tyre Size</label>
          <input value={form.tyre_size} onChange={e => set('tyre_size', e.target.value)} placeholder="e.g. 195/65 R15" />
        </div>
        <div className="form-group">
          <label>Battery</label>
          <input value={form.battery_spec} onChange={e => set('battery_spec', e.target.value)} placeholder="e.g. 60Ah 540A" />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Coolant Spec</label>
          <input value={form.coolant_spec} onChange={e => set('coolant_spec', e.target.value)} placeholder="e.g. G12++, MB 325.0" />
        </div>
        <div className="form-group">
          <label>OBD Notes</label>
          <input value={form.obd_notes} onChange={e => set('obd_notes', e.target.value)} placeholder="protocol / adapter / port" />
        </div>
      </div>

      <div className="form-section-title">Renewals</div>
      <div className="form-row">
        <div className="form-group">
          <label>Insurance Expiry</label>
          <input type="date" value={form.insurance_expiry || ''} onChange={e => set('insurance_expiry', e.target.value)} />
        </div>
        <div className="form-group">
          <label>Inspection Expiry</label>
          <input type="date" value={form.inspection_expiry || ''} onChange={e => set('inspection_expiry', e.target.value)} />
        </div>
        <div className="form-group">
          <label>Licence Expiry</label>
          <input type="date" value={form.licence_expiry || ''} onChange={e => set('licence_expiry', e.target.value)} />
        </div>
      </div>
      <div className="form-group">
        <label>Insurance / Policy Note</label>
        <input value={form.insurance_note} onChange={e => set('insurance_note', e.target.value)} placeholder="provider · policy number" />
      </div>

      <div className="form-group">
        <label>Notes</label>
        <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
          placeholder="Known issues, history, modifications..." rows={3} style={{ resize: 'vertical' }} />
      </div>
      <div className="form-actions">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="submit" className="btn-primary" style={{ width: 'auto', padding: '10px 28px' }} disabled={saving}>
          {saving ? 'Saving...' : 'Save Vehicle'}
        </button>
      </div>
    </form>
  )
}

function VehicleDetail({ vehicle, onEdit, onBack }) {
  const specs = [
    { label: 'Engine Code',    value: vehicle.engine_code },
    { label: 'Engine',         value: vehicle.engine_description },
    { label: 'Transmission',   value: vehicle.transmission },
    { label: 'Drive Type',     value: vehicle.drive_type },
    { label: 'Body Type',      value: vehicle.body_type },
    { label: 'Fuel Type',      value: vehicle.fuel_type },
    { label: 'Color',          value: vehicle.color },
    { label: 'License Plate',  value: vehicle.license_plate },
    { label: 'VIN',            value: vehicle.vin },
    { label: 'Gearbox Code',   value: vehicle.gearbox_code },
    { label: 'Oil Capacity',   value: vehicle.oil_capacity_litres ? `${vehicle.oil_capacity_litres}L` : null },
    { label: 'Oil Spec',       value: vehicle.oil_spec },
    { label: 'Coolant Spec',   value: vehicle.coolant_spec },
    { label: 'Tank Capacity',  value: vehicle.fuel_tank_capacity ? `${vehicle.fuel_tank_capacity}L` : null },
    { label: 'Tyre Size',      value: vehicle.tyre_size },
    { label: 'Battery',        value: vehicle.battery_spec },
    { label: 'OBD Notes',      value: vehicle.obd_notes },
    { label: 'Purchase Date',  value: vehicle.purchase_date },
    { label: 'Purchase Price', value: vehicle.purchase_price_kes ? `KES ${Number(vehicle.purchase_price_kes).toLocaleString()}` : null },
    { label: 'ODO at Purchase',value: vehicle.odometer_at_purchase ? `${Number(vehicle.odometer_at_purchase).toLocaleString()} km` : null },
  ].filter(s => s.value)

  return (
    <div className="vehicle-detail">
      <div className="vehicle-detail-header">
        <button className="btn-back" onClick={onBack}>← Fleet</button>
        <div className="vehicle-detail-title">
          <h3>{vehicle.name}</h3>
          <span className="vehicle-detail-sub">{vehicle.year} {vehicle.make} {vehicle.model}</span>
        </div>
        <button className="btn-secondary" onClick={onEdit}>Edit Vehicle</button>
      </div>
      <div className="spec-grid">
        {specs.map(s => (
          <div key={s.label} className="spec-item">
            <div className="spec-label">{s.label}</div>
            <div className="spec-value">{s.value}</div>
          </div>
        ))}
      </div>
      {(() => {
        const renewals = vehicleRenewals(vehicle, today())
        if (!renewals.length) return null
        return (
          <div style={{ marginTop: 24 }}>
            <div className="spec-label" style={{ marginBottom: 8 }}>Renewals</div>
            <div className="row-actions" style={{ flexWrap: 'wrap', gap: 10 }}>
              {renewals.map(r => (
                <span key={r.key} className={`badge ${RENEWAL_BADGE[r.status]}`} style={{ padding: '6px 12px' }}>
                  {r.label}: {r.date} · {r.status === 'overdue' ? `overdue ${Math.abs(r.days)}d` : `${r.days}d`}
                </span>
              ))}
            </div>
            {vehicle.insurance_note && <p className="page-sub" style={{ marginTop: 8 }}>{vehicle.insurance_note}</p>}
          </div>
        )
      })()}
      {vehicle.notes && (
        <div className="vehicle-notes">
          <div className="spec-label" style={{ marginBottom: 8 }}>Notes</div>
          <p>{vehicle.notes}</p>
        </div>
      )}
    </div>
  )
}

export default function Fleet() {
  const { vehicles, refreshVehicles, selectVehicle } = useVehicle()
  const [view, setView] = useState('list')
  const [selected, setSelected] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const clean = (form) => Object.fromEntries(
    Object.entries(form).map(([k, v]) => [k, v === '' ? null : v])
  )

  const handleAdd = async (form) => {
    setSaving(true); setError(null)
    const { error } = await supabase.from('vehicles').insert([clean(form)])
    if (error) { setError(error.message); setSaving(false); return }
    await refreshVehicles(); setSaving(false); setView('list')
  }

  const handleEdit = async (form) => {
    setSaving(true); setError(null)
    const { error } = await supabase.from('vehicles').update(clean(form)).eq('id', selected.id)
    if (error) { setError(error.message); setSaving(false); return }
    await refreshVehicles(); setSaving(false); setView('list')
  }

  const handleArchive = async (vehicle) => {
    if (!confirm(`Archive ${vehicle.name}? It will be hidden but data preserved.`)) return
    await supabase.from('vehicles').update({ is_active: false }).eq('id', vehicle.id)
    await refreshVehicles(); setView('list')
  }

  const openDetail = (vehicle) => { setSelected(vehicle); selectVehicle(vehicle); setView('detail') }

  const td = today()
  const renewalsDue = vehicles.filter(v => ['soon', 'overdue'].includes(worstRenewalStatus(v, td))).length

  if (view === 'add') return (
    <div className="page">
      <div className="page-header"><h2>Add Vehicle</h2><p className="page-sub">New vehicle to the fleet</p></div>
      {error && <div className="form-error">{error}</div>}
      <VehicleForm onSave={handleAdd} onCancel={() => setView('list')} saving={saving} />
    </div>
  )

  if (view === 'edit') return (
    <div className="page">
      <div className="page-header"><h2>Edit Vehicle</h2><p className="page-sub">{selected?.name}</p></div>
      {error && <div className="form-error">{error}</div>}
      <VehicleForm initial={selected} onSave={handleEdit} onCancel={() => setView('detail')} saving={saving} />
    </div>
  )

  if (view === 'detail' && selected) return (
    <div className="page">
      <VehicleDetail vehicle={selected} onEdit={() => setView('edit')} onBack={() => setView('list')} />
      <div style={{ marginTop: 32 }}>
        <button className="btn-danger" onClick={() => handleArchive(selected)}>Archive Vehicle</button>
      </div>
    </div>
  )

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div><h2>Fleet</h2><p className="page-sub">Your vehicles</p></div>
        <button className="btn-primary" style={{ width: 'auto', padding: '10px 24px' }} onClick={() => setView('add')}>
          + Add Vehicle
        </button>
      </div>
      {renewalsDue > 0 && (
        <div className="card" style={{ marginBottom: 16, borderColor: '#e74c3c' }}>
          <div className="card-label">⏰ Renewals</div>
          <div>{renewalsDue} vehicle{renewalsDue === 1 ? '' : 's'} with insurance / inspection / licence due soon or overdue — open the vehicle to see details.</div>
        </div>
      )}
      <div className="fleet-grid">
        {vehicles.map(v => {
          const ws = worstRenewalStatus(v, td)
          return (
          <div key={v.id} className="fleet-card" onClick={() => openDetail(v)}>
            <div className="fleet-card-header">
              <div className="fleet-card-name">{v.name}</div>
              <div className="fleet-card-year">{v.year}</div>
            </div>
            <div className="fleet-card-make">{v.make} {v.model}</div>
            {v.engine_code && <div className="fleet-card-engine">{v.engine_code} · {v.engine_description}</div>}
            <div className="fleet-card-meta">
              {v.transmission && <span>{v.transmission}</span>}
              {v.drive_type && <span>{v.drive_type}</span>}
              {v.fuel_type && <span>{v.fuel_type}</span>}
            </div>
            {v.license_plate && <div className="fleet-card-plate">{v.license_plate}</div>}
            {ws && (ws === 'soon' || ws === 'overdue') && (
              <div style={{ marginTop: 8 }}>
                <span className={`badge ${RENEWAL_BADGE[ws]}`}>⏰ Renewal {ws === 'overdue' ? 'overdue' : 'due'}</span>
              </div>
            )}
          </div>
          )
        })}
      </div>
    </div>
  )
}
