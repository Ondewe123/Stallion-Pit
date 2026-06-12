// Parse an aCar XML backup → generate db/seed_golden.sql (the golden import/restore file).
// Does NOT touch the database. Run: node scripts/import-acar.mjs
//
// Output: db/seed_golden.sql  — truncates data tables (auth untouched) + re-inserts the
// full aCar dataset with fixed UUIDs. Re-runnable any time to reset to the pristine state.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'

// deterministic uuid from a stable key → reproducible seed_golden.sql across runs
const stableUuid = (s) =>
  ((h) => [h.slice(0, 8), h.slice(8, 12), h.slice(12, 16), h.slice(16, 20), h.slice(20, 32)].join('-'))(
    createHash('sha1').update('stallion-pit:' + s).digest('hex'))

const DIR = 'Acar Old Records/12th June 2026'

const decode = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&amp;/g, '&')

// id -> <name> lookup for a given element tag
function loadLookup(file, tag) {
  const xml = readFileSync(`${DIR}/${file}`, 'utf8')
  const map = {}
  const re = new RegExp(`<${tag} id="(\\d+)"[^>]*>([\\s\\S]*?)</${tag}>`, 'g')
  let m
  while ((m = re.exec(xml))) {
    const nameM = m[2].match(/<name>([\s\S]*?)<\/name>/)
    map[m[1]] = nameM ? decode(nameM[1]).trim() : null
  }
  return map
}

const fuelTypes = loadLookup('fuel-types.xml', 'fuel-type')
const subtypes = loadLookup('event-subtypes.xml', 'event-subtype')

let xml = readFileSync(`${DIR}/vehicles.xml`, 'utf8')
xml = xml.replace(/<photo>[\s\S]*?<\/photo>/g, '<photo></photo>')  // drop embedded image blobs

const field = (b, tag) => {
  const m = b.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))
  if (!m) return null
  const v = decode(m[1]).trim()
  return v === '' ? null : v
}
const num = (b, tag) => { const v = field(b, tag); return v == null ? null : parseFloat(v) }
const bool = (b, tag) => field(b, tag) === 'true'
const isoDate = (b, tag) => {
  const v = field(b, tag); if (!v) return null
  const m = v.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  return m ? `${m[3]}-${m[1]}-${m[2]}` : null
}
const titleCase = (s) => (s ? s[0].toUpperCase() + s.slice(1) : null)
const toMonths = (interval, unit) => {
  if (interval == null) return null
  const u = (unit || 'months').toLowerCase()
  if (u.startsWith('year')) return interval * 12
  if (u.startsWith('week')) return Math.round(interval * 7 / 30.44 * 10) / 10
  if (u.startsWith('day')) return Math.round(interval / 30.44 * 10) / 10
  return interval
}

const vehicles = []
const vehRe = /<vehicle id="(\d+)">([\s\S]*?)<\/vehicle>/g
let vm
while ((vm = vehRe.exec(xml))) {
  const block = vm[2]
  const tank = num(block, 'fuel-tank-capacity')
  const v = {
    uuid: stableUuid(vm[1]),
    name: field(block, 'name'),
    make: field(block, 'make'),
    model: field(block, 'model'),
    sub_model: field(block, 'sub-model'),
    year: num(block, 'year'),
    engine_description: field(block, 'engine'),
    transmission: field(block, 'transmission'),
    drive_type: field(block, 'drive-type'),
    body_type: field(block, 'body-type'),
    fuel_type: 'Petrol',
    fuel_tank_capacity: tank ? tank : null,
    purchase_date: null, purchase_price_kes: null, odometer_at_purchase: null,
    notes: 'Imported from aCar',
    fuels: [], services: [], maintenance: [],
  }

  const fRe = /<fillup-record id="\d+">([\s\S]*?)<\/fillup-record>/g
  let fm
  while ((fm = fRe.exec(block))) {
    const b = fm[1]
    v.fuels.push({
      logged_at: isoDate(b, 'date'),
      odometer_km: num(b, 'odometer-reading'),
      volume_litres: num(b, 'volume'),
      total_cost_kes: num(b, 'total-cost'),
      price_per_litre_kes: num(b, 'price-per-volume-unit'),
      is_partial: bool(b, 'partial'),
      has_additive: bool(b, 'has-fuel-additive'),
      additive_name: field(b, 'fuel-additive-name'),
      driving_mode: titleCase(field(b, 'driving-mode')),
      fuel_grade: fuelTypes[field(b, 'fuel-type-id')] || null,
      station: field(b, 'place-name'),
      notes: field(b, 'notes'),
    })
  }

  const eRe = /<event-record id="\d+">([\s\S]*?)<\/event-record>/g
  let em
  while ((em = eRe.exec(block))) {
    const b = em[1]
    if (field(b, 'type') === 'purchased') {
      v.purchase_date = isoDate(b, 'date')
      v.purchase_price_kes = num(b, 'total-cost') || null
      v.odometer_at_purchase = num(b, 'odometer-reading')
      continue
    }
    const cats = [...b.matchAll(/<subtype id="(\d+)"/g)].map(x => subtypes[x[1]]).filter(Boolean)
    const odo = num(b, 'odometer-reading')
    v.services.push({
      serviced_at: isoDate(b, 'date'),
      odometer_km: odo != null ? Math.round(odo) : null,
      category: cats.length ? cats.join(', ') : 'Service',
      description: field(b, 'notes'),
      workshop: field(b, 'place-name'),
      total_cost_kes: num(b, 'total-cost') ?? 0,
    })
  }
  const rRe = /<reminder ([^>]*)>([\s\S]*?)<\/reminder>/g
  let rm
  while ((rm = rRe.exec(block))) {
    const subM = rm[1].match(/event-subtype-id="(\d+)"/)
    const b = rm[2]
    const distInt = num(b, 'distance-interval')
    const distDue = num(b, 'distance-due')
    v.maintenance.push({
      item: (subM && subtypes[subM[1]]) || 'Service',
      distance_interval_km: distInt,
      time_interval_months: toMonths(num(b, 'time-interval'), field(b, 'time-unit')),
      last_done_odometer: (distDue != null && distInt != null) ? distDue - distInt : null,
      last_done_date: null,
      next_due_odometer: distDue,
      next_due_date: isoDate(b, 'time-due'),
      notes: 'Imported from aCar reminder',
    })
  }
  vehicles.push(v)
}

// ---- SQL generation ----
const q = (v) => v == null ? 'null'
  : typeof v === 'number' ? String(v)
  : typeof v === 'boolean' ? (v ? 'true' : 'false')
  : `'${String(v).replace(/'/g, "''")}'`

const rows = (cols, vals) => `(${cols.map(c => q(vals[c])).join(', ')})`

let sql = ''
sql += '-- ============================================================\n'
sql += '-- Stallion Pit — GOLDEN SEED (data imported from aCar backup)\n'
sql += '-- Re-run this file ANY TIME to reset the data to this pristine state.\n'
sql += '-- It truncates the data tables (auth/login is NOT touched) and re-inserts.\n'
sql += '-- ============================================================\n'
sql += 'begin;\n'
sql += 'truncate table public.snags, public.parts, public.maintenance_schedules, public.service_logs, public.fuel_logs, public.vehicles restart identity cascade;\n\n'

const vCols = ['id', 'name', 'make', 'model', 'sub_model', 'year', 'engine_description',
  'transmission', 'drive_type', 'body_type', 'fuel_type', 'fuel_tank_capacity',
  'purchase_date', 'purchase_price_kes', 'odometer_at_purchase', 'notes', 'is_active']
for (const v of vehicles) {
  sql += `insert into public.vehicles (${vCols.join(', ')}) values ` +
    rows(vCols, { ...v, id: v.uuid, is_active: true }) + ';\n'
}
sql += '\n'

const fCols = ['vehicle_id', 'logged_at', 'odometer_km', 'volume_litres', 'total_cost_kes',
  'price_per_litre_kes', 'is_partial', 'has_additive', 'additive_name', 'driving_mode',
  'fuel_grade', 'station', 'notes']
let nFuel = 0
for (const v of vehicles) for (const f of v.fuels) {
  sql += `insert into public.fuel_logs (${fCols.join(', ')}) values ` +
    rows(fCols, { ...f, vehicle_id: v.uuid }) + ';\n'
  nFuel++
}
sql += '\n'

const sCols = ['vehicle_id', 'serviced_at', 'odometer_km', 'category', 'description', 'workshop', 'total_cost_kes']
let nSvc = 0
for (const v of vehicles) for (const s of v.services) {
  sql += `insert into public.service_logs (${sCols.join(', ')}) values ` +
    rows(sCols, { ...s, vehicle_id: v.uuid }) + ';\n'
  nSvc++
}
sql += '\n'

const mCols = ['vehicle_id', 'item', 'distance_interval_km', 'time_interval_months',
  'last_done_odometer', 'last_done_date', 'next_due_odometer', 'next_due_date', 'notes', 'is_active']
let nMaint = 0
for (const v of vehicles) for (const m of v.maintenance) {
  sql += `insert into public.maintenance_schedules (${mCols.join(', ')}) values ` +
    rows(mCols, { ...m, vehicle_id: v.uuid, is_active: true }) + ';\n'
  nMaint++
}
sql += '\n'

// recompute km_since_last by previous odometer within each vehicle (trigger sets null on bulk insert)
sql += `update public.fuel_logs f set km_since_last = o.kml from (
  select id, odometer_km - lag(odometer_km) over (partition by vehicle_id order by odometer_km) as kml
  from public.fuel_logs
) o where o.id = f.id;\n`
sql += 'commit;\n'

mkdirSync('db', { recursive: true })
writeFileSync('db/seed_golden.sql', sql)

// ---- preview ----
console.log('Lookups: fuelTypes =', Object.keys(fuelTypes).length, ', subtypes =', Object.keys(subtypes).length)
console.log('Vehicles:', vehicles.length)
for (const v of vehicles) {
  console.log(`  - ${v.year} ${v.make} ${v.model} ${v.sub_model || ''} | ${v.fuels.length} fuel, ${v.services.length} services | purchased ${v.purchase_date || '—'} @ ${v.odometer_at_purchase || '—'}km for KES ${v.purchase_price_kes || '—'}`)
}
console.log('TOTAL fuel logs:', nFuel, '| TOTAL service logs:', nSvc, '| TOTAL maintenance:', nMaint)
console.log('\nSAMPLE fuel log:', JSON.stringify(vehicles[0].fuels[0], null, 2))
console.log('\nSAMPLE service log:', JSON.stringify(vehicles[0].services[0], null, 2))
console.log('\n→ wrote db/seed_golden.sql (' + (sql.length / 1024).toFixed(0) + ' KB)')

// ---- optional: apply directly to the live DB via the authenticated client ----
if (process.argv.includes('--apply')) {
  const { createClient } = await import('@supabase/supabase-js')
  const e = readFileSync('.env', 'utf8')
  const url = e.match(/VITE_SUPABASE_URL=(.+)/)[1].trim()
  const key = e.match(/VITE_SUPABASE_ANON_KEY=(.+)/)[1].trim()
  const sb = createClient(url, key)
  const { error: aerr } = await sb.auth.signInWithPassword({ email: 'chris.odeny@gmail.com', password: 'Test123' })
  if (aerr) { console.error('✗ login failed:', aerr.message); process.exit(1) }
  console.log('[apply] logged in — clearing data tables...')
  for (const t of ['snags', 'parts', 'maintenance_schedules', 'service_logs', 'fuel_logs', 'vehicles']) {
    const { error } = await sb.from(t).delete().neq('id', '00000000-0000-0000-0000-000000000000')
    if (error) { console.error(`✗ clear ${t}:`, error.message); process.exit(1) }
  }
  const vRows = vehicles.map(v => ({
    id: v.uuid, name: v.name, make: v.make, model: v.model, sub_model: v.sub_model, year: v.year,
    engine_description: v.engine_description, transmission: v.transmission, drive_type: v.drive_type,
    body_type: v.body_type, fuel_type: v.fuel_type, fuel_tank_capacity: v.fuel_tank_capacity,
    purchase_date: v.purchase_date, purchase_price_kes: v.purchase_price_kes,
    odometer_at_purchase: v.odometer_at_purchase, notes: v.notes, is_active: true,
  }))
  let res = await sb.from('vehicles').insert(vRows)
  if (res.error) { console.error('✗ vehicles:', res.error.message); process.exit(1) }
  const fuelRows = vehicles.flatMap(v => v.fuels.map(f => ({ vehicle_id: v.uuid, ...f })))
  for (let i = 0; i < fuelRows.length; i += 200) {
    res = await sb.from('fuel_logs').insert(fuelRows.slice(i, i + 200))
    if (res.error) { console.error('✗ fuel_logs:', res.error.message); process.exit(1) }
  }
  const svcRows = vehicles.flatMap(v => v.services.map(s => ({ vehicle_id: v.uuid, ...s })))
  res = await sb.from('service_logs').insert(svcRows)
  if (res.error) { console.error('✗ service_logs:', res.error.message); process.exit(1) }
  const mRows = vehicles.flatMap(v => v.maintenance.map(m => ({ vehicle_id: v.uuid, ...m, is_active: true })))
  if (mRows.length) {
    res = await sb.from('maintenance_schedules').insert(mRows)
    if (res.error) { console.error('✗ maintenance:', res.error.message); process.exit(1) }
  }
  console.log(`[apply] ✓ inserted ${vRows.length} vehicles, ${fuelRows.length} fuel, ${svcRows.length} services, ${mRows.length} maintenance`)
}

// ---- non-destructive: load ONLY maintenance schedules onto existing live vehicles ----
if (process.argv.includes('--maintenance')) {
  const { createClient } = await import('@supabase/supabase-js')
  const e = readFileSync('.env', 'utf8')
  const url = e.match(/VITE_SUPABASE_URL=(.+)/)[1].trim()
  const key = e.match(/VITE_SUPABASE_ANON_KEY=(.+)/)[1].trim()
  const sb = createClient(url, key)
  const { error: aerr } = await sb.auth.signInWithPassword({ email: 'chris.odeny@gmail.com', password: 'Test123' })
  if (aerr) { console.error('✗ login failed:', aerr.message); process.exit(1) }
  const { data: live, error: lerr } = await sb.from('vehicles').select('id, make, model, year')
  if (lerr) { console.error('✗ fetch vehicles:', lerr.message); process.exit(1) }
  const rows = []
  for (const v of vehicles) {
    if (!v.maintenance.length) continue
    const lv = live.find(l => l.make === v.make && l.model === v.model && Number(l.year) === Number(v.year))
    if (!lv) { console.warn(`! no live match for ${v.make} ${v.model} ${v.year}`); continue }
    for (const m of v.maintenance) rows.push({ vehicle_id: lv.id, ...m, is_active: true })
  }
  if (rows.length) {
    const vids = [...new Set(rows.map(r => r.vehicle_id))]
    await sb.from('maintenance_schedules').delete().in('vehicle_id', vids)  // idempotent re-run
    const res = await sb.from('maintenance_schedules').insert(rows)
    if (res.error) { console.error('✗ maintenance:', res.error.message); process.exit(1) }
  }
  console.log(`[maintenance] ✓ loaded ${rows.length} schedule items onto live vehicles`)
}
