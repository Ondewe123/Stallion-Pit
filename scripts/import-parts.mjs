// scripts/import-parts.mjs
// One-off import: reads Data/polo-parts-clean.json (Task 9's output) and inserts each
// entry into `parts`, attempting a price/photo fetch via the same resolvePastedPart
// logic the app's Fetch Details button uses.
//
// Usage (PowerShell, from project root):
//   $env:NODE_OPTIONS="--use-system-ca"; node scripts/import-parts.mjs <vehicle_id> <user_id> [--apply]
//
// Without --apply: dry run — prints what would happen, writes nothing.
// With --apply: actually inserts parts + documents rows.
//
// Reads:
//   VITE_SUPABASE_URL          from .env
//   SUPABASE_SERVICE_ROLE_KEY  from .env.local  (gitignored — bypasses RLS for this one-time import)

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { resolvePastedPart } from '../src/lib/fetchPart/resolvePastedPart.mjs'

function readEnv(file) {
  const out = {}
  if (!existsSync(file)) return out
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) out[m[1]] = m[2].trim()
  }
  return out
}

function fail(msg) { console.error('\n✗ ' + msg + '\n'); process.exit(1) }

const [, , vehicleId, userId, ...rest] = process.argv
const apply = rest.includes('--apply')
if (!vehicleId || !userId) fail('Usage: node scripts/import-parts.mjs <vehicle_id> <user_id> [--apply]')

const env = { ...readEnv('.env'), ...readEnv('.env.local') }
const url = env.VITE_SUPABASE_URL
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
if (!url) fail('Missing VITE_SUPABASE_URL in .env')
if (!serviceKey || serviceKey.length < 20) fail('Missing SUPABASE_SERVICE_ROLE_KEY in .env.local')

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

const DATA_FILE = 'Data/polo-parts-clean.json'
if (!existsSync(DATA_FILE)) fail(`Missing ${DATA_FILE} — run Data/preprocess_polo_xlsx.py first`)
const rowsToImport = JSON.parse(readFileSync(DATA_FILE, 'utf8'))

console.log(`\n${apply ? 'IMPORTING' : 'DRY RUN'} ${rowsToImport.length} entries for vehicle ${vehicleId}\n`)

let imported = 0, noLink = 0, failed = 0
for (const entry of rowsToImport) {
  if (!entry.supplier_url) noLink++

  // Dry run must be genuinely side-effect-free: resolvePastedPart() does a real
  // network fetch and, when it finds a product image, a real Storage upload — so
  // it must never run unless we're actually about to write rows.
  if (!apply) {
    console.log(`  ${entry.part_name.slice(0, 50).padEnd(50)}` +
      (entry.supplier_url ? ` | ${entry.supplier_url} (would fetch details)` : ' | (no link)'))
    continue
  }

  let fetched = null
  if (entry.supplier_url) {
    try {
      fetched = await resolvePastedPart(entry.supplier_url, { supabaseClient: admin, userId })
    } catch (err) {
      console.log(`  ⚠ fetch failed for "${entry.part_name}": ${err.message}`)
    }
  }

  const partRow = {
    vehicle_id: vehicleId,
    user_id: userId,
    purchased_at: new Date().toISOString().split('T')[0],
    part_name: fetched?.title || entry.part_name,
    part_number: entry.part_number,
    supplier_url: entry.supplier_url,
    category: 'Other',
    status: 'Purchased',
    quantity: 1,
  }

  console.log(`  ${entry.part_name.slice(0, 50).padEnd(50)}` +
    (fetched?.price != null ? ` | ${fetched.price} ${fetched.currencyCode || ''}` : '') +
    (fetched?.documentPath ? ' | photo' : ''))

  const { data, error } = await admin.from('parts').insert([partRow]).select().single()
  if (error) { console.log(`    ✗ insert failed: ${error.message}`); failed++; continue }
  imported++

  if (fetched?.documentPath) {
    const { error: docErr } = await admin.from('documents').insert([{
      id: fetched.documentId,
      vehicle_id: vehicleId,
      user_id: userId,
      file_path: fetched.documentPath,
      file_name: fetched.fileName,
      mime_type: fetched.mimeType,
      file_size: fetched.fileSize,
      kind: 'Photo',
      part_id: data.id,
    }])
    if (docErr) console.log(`    ⚠ photo row failed: ${docErr.message}`)
  }
}

console.log(apply
  ? `\nImported: ${imported} · no link: ${noLink} · failed: ${failed}\n`
  : `\nDry run complete — ${rowsToImport.length} entries listed above, ${noLink} with no supplier link. Re-run with --apply to write.\n`)
