import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { parseCsv } from '../src/lib/ipc/csv.js'
import { buildIpcImport } from '../src/lib/ipc/importMapping.js'

function readEnv(file) {
  const out = {}
  if (!existsSync(file)) return out
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) out[m[1]] = m[2].trim()
  }
  return out
}

function arg(name) {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : null
}

function fail(message) {
  console.error('\nX ' + message + '\n')
  process.exit(1)
}

const vehicleId = arg('--vehicle-id')
const diagramsFile = arg('--diagrams')
const partsFile = arg('--parts')
const apply = process.argv.includes('--apply')

if (!vehicleId || !diagramsFile || !partsFile) {
  fail('Usage: node scripts/import-ipc.mjs --vehicle-id <uuid> --diagrams <csv> --parts <csv> [--apply]')
}
if (!existsSync(diagramsFile)) fail(`Missing diagrams file: ${diagramsFile}`)
if (!existsSync(partsFile)) fail(`Missing parts file: ${partsFile}`)

const env = { ...readEnv('.env'), ...readEnv('.env.local'), ...process.env }
const url = env.VITE_SUPABASE_URL
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
if (!url) fail('Missing VITE_SUPABASE_URL in .env')
if (!serviceKey || serviceKey.includes('PASTE') || serviceKey.length < 20) {
  fail('Missing SUPABASE_SERVICE_ROLE_KEY in .env.local')
}
if (serviceKey.startsWith('sb_publishable') || /anon/i.test(serviceKey)) {
  fail('That looks like the ANON/publishable key. This import needs the service_role key.')
}

const diagramRows = parseCsv(readFileSync(diagramsFile, 'utf8'))
const partRows = parseCsv(readFileSync(partsFile, 'utf8'))
const userId = env.IMPORT_USER_ID || env.SEED_OWNER_UID || null
if (!userId) fail('Set IMPORT_USER_ID in the environment for owner-stamped IPC rows.')

const mapped = buildIpcImport(diagramRows, partRows, {
  vehicleId,
  userId,
  sourceName: 'ILcats',
  sourceFilePrefix: partsFile.replace(/^.*[\\/]/, '').replace(/-parts.*$/i, ''),
})

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

const { data: vehicle, error: vehicleError } = await admin
  .from('vehicles')
  .select('id, name, make, model, year, vin, user_id')
  .eq('id', vehicleId)
  .single()
if (vehicleError) fail(`Could not read target vehicle: ${vehicleError.message}`)
if ((vehicle.vin || '').trim() !== mapped.catalog.vin) {
  fail(`VIN mismatch. Vehicle "${vehicle.name}" has "${vehicle.vin}", IPC file has "${mapped.catalog.vin}".`)
}
if (vehicle.user_id !== userId) {
  fail(`Owner mismatch. Vehicle user_id is ${vehicle.user_id}, IMPORT_USER_ID is ${userId}.`)
}

const byBranch = new Map()
for (const d of mapped.diagrams) byBranch.set(d.branch, (byBranch.get(d.branch) || 0) + 1)

console.log(`\n${apply ? 'IMPORTING' : 'DRY RUN'} IPC catalog`)
console.log(`Vehicle: ${vehicle.name} | ${vehicle.year} ${vehicle.make} ${vehicle.model}`)
console.log(`VIN: ${mapped.catalog.vin}`)
console.log(`Diagrams: ${mapped.diagrams.length}`)
console.log(`Parts: ${mapped.parts.length}`)
console.log('Branches:', [...byBranch.entries()].map(([k, v]) => `${k}=${v}`).join(', '))
console.log('Sample part:', mapped.parts[0]?.part_number, mapped.parts[0]?.name)

if (!apply) {
  console.log('\nDry run complete. Re-run with --apply to write IPC rows.\n')
} else {
  const { data: catalog, error: catalogError } = await admin
    .from('ipc_catalogs')
    .upsert([mapped.catalog], { onConflict: 'user_id,vin,source_name' })
    .select('id')
    .single()
  if (catalogError) fail(`Catalog upsert failed: ${catalogError.message}`)

  const { error: partsDeleteError } = await admin.from('ipc_parts').delete().eq('catalog_id', catalog.id)
  const { error: diagramsDeleteError } = await admin.from('ipc_diagrams').delete().eq('catalog_id', catalog.id)
  const deleteErrors = [
    partsDeleteError && `ipc_parts delete failed: ${partsDeleteError.message}`,
    diagramsDeleteError && `ipc_diagrams delete failed: ${diagramsDeleteError.message}`,
  ].filter(Boolean)
  if (deleteErrors.length) fail(deleteErrors.join('\n'))

  const diagramsForInsert = mapped.diagrams.map(({ _key, ...row }) => ({ ...row, catalog_id: catalog.id }))
  const { data: insertedDiagrams, error: diagramError } = await admin
    .from('ipc_diagrams')
    .insert(diagramsForInsert)
    .select('id, branch, catalog_group, subgroup')
  if (diagramError) fail(`Diagram insert failed: ${diagramError.message}`)

  const diagramIds = new Map(insertedDiagrams.map(d => [[d.branch, d.catalog_group, d.subgroup].join('|'), d.id]))
  const partRowsForInsert = mapped.parts.map(({ _diagramKey, ...row }) => ({
    ...row,
    catalog_id: catalog.id,
    diagram_id: diagramIds.get(_diagramKey) || null,
  }))

  const chunk = 500
  let inserted = 0
  for (let i = 0; i < partRowsForInsert.length; i += chunk) {
    const slice = partRowsForInsert.slice(i, i + chunk)
    const { error } = await admin.from('ipc_parts').insert(slice)
    if (error) fail(`Part insert failed after ${inserted} rows: ${error.message}`)
    inserted += slice.length
  }

  console.log(`\nImported IPC catalog ${catalog.id}: ${insertedDiagrams.length} diagrams, ${inserted} parts.\n`)
}
