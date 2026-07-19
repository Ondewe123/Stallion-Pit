// Local database backup / export.
//
// Dumps every data table to a timestamped folder under backups/ in BOTH:
//   - <table>.csv  — header + rows, for spreadsheets / human review (also serves as CSV export)
//   - <table>.sql  — re-importable INSERT statements
//
// Run (PowerShell, from project root):
//   $env:NODE_OPTIONS="--use-system-ca"; npm run backup
//
// Reads:
//   VITE_SUPABASE_URL          from .env
//   SUPABASE_SERVICE_ROLE_KEY  from .env.local  (gitignored — bypasses RLS so ALL rows are dumped)
//
// backups/ is gitignored. The service_role key must NEVER be committed.

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'

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

const env = { ...readEnv('.env'), ...readEnv('.env.local') }
const url = env.VITE_SUPABASE_URL
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY

if (!url) fail('Missing VITE_SUPABASE_URL in .env')
if (!serviceKey || serviceKey.includes('PASTE') || serviceKey.length < 20) {
  fail('Missing SUPABASE_SERVICE_ROLE_KEY in .env.local.\n' +
       '  Supabase dashboard → Project Settings → API → service_role (Reveal, Copy)\n' +
       '  Put it in .env.local as:  SUPABASE_SERVICE_ROLE_KEY=<key>')
}
if (serviceKey.startsWith('sb_publishable') || /anon/i.test(serviceKey)) {
  fail('That looks like the ANON/publishable key. Backups need the service_role (secret) key to bypass RLS.')
}

// Order matters for SQL re-import: parents before children (FK).
const TABLES = ['vehicles', 'fuel_logs', 'service_logs', 'parts', 'snags', 'maintenance_schedules', 'part_price_snapshots']
// Generated columns can't be inserted into — skip them in the SQL dump.
const GENERATED = { fuel_logs: ['derived_price_per_litre'] }

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

const sqlVal = (v) => v == null ? 'null'
  : typeof v === 'number' ? String(v)
  : typeof v === 'boolean' ? (v ? 'true' : 'false')
  : typeof v === 'object' ? `'${JSON.stringify(v).replace(/'/g, "''")}'`
  : `'${String(v).replace(/'/g, "''")}'`

const csvCell = (v) => {
  if (v == null) return ''
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

async function fetchAll(table) {
  const rows = []
  const page = 1000
  for (let from = 0; ; from += page) {
    const { data, error } = await admin.from(table).select('*').range(from, from + page - 1)
    if (error) fail(`fetch ${table}: ${error.message}`)
    rows.push(...data)
    if (data.length < page) break
  }
  return rows
}

const pad = (n) => String(n).padStart(2, '0')
const d = new Date()
const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`
const outDir = `backups/${stamp}`
mkdirSync(outDir, { recursive: true })

console.log(`\nBacking up to ${outDir}/ ...`)
let grand = 0
for (const table of TABLES) {
  const rows = await fetchAll(table)
  grand += rows.length
  const cols = rows.length ? Object.keys(rows[0]) : []
  const insertCols = cols.filter(c => !(GENERATED[table] || []).includes(c))

  // CSV (all columns, including generated)
  const csv = [cols.map(csvCell).join(','), ...rows.map(r => cols.map(c => csvCell(r[c])).join(','))].join('\n')
  writeFileSync(`${outDir}/${table}.csv`, csv + '\n')

  // SQL (insertable columns only)
  let sql = `-- ${table}: ${rows.length} rows — backup ${stamp}\n`
  for (const r of rows) {
    sql += `insert into public.${table} (${insertCols.join(', ')}) values (` +
      insertCols.map(c => sqlVal(r[c])).join(', ') + ');\n'
  }
  writeFileSync(`${outDir}/${table}.sql`, sql)

  console.log(`  ${table.padEnd(22)} ${String(rows.length).padStart(5)} rows`)
}
console.log(`\n✓ Backed up ${grand} rows across ${TABLES.length} tables → ${outDir}/\n`)
