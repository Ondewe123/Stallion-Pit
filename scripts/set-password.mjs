// Set (or create) a Supabase Auth user's password — admin helper.
//
// Run (PowerShell, from project root):
//   $env:NODE_OPTIONS="--use-system-ca"; node scripts/set-password.mjs
//   $env:NODE_OPTIONS="--use-system-ca"; node scripts/set-password.mjs someone@example.com MyPass123
//
// Defaults: email = chris.odeny@gmail.com, password = Test123
//
// Reads:
//   VITE_SUPABASE_URL          from .env        (already present)
//   SUPABASE_SERVICE_ROLE_KEY  from .env.local  (gitignored — you add it)
//
// The service_role key bypasses RLS and can manage any user. NEVER commit it.

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'

function readEnv(file) {
  const out = {}
  if (!existsSync(file)) return out
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) out[m[1]] = m[2].trim()
  }
  return out
}

const env = { ...readEnv('.env'), ...readEnv('.env.local') }
const url = env.VITE_SUPABASE_URL
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY

const email = (process.argv[2] || 'chris.odeny@gmail.com').trim()
const password = (process.argv[3] || 'Test123').trim()

function fail(msg) { console.error('\n✗ ' + msg + '\n'); process.exit(1) }

if (!url) fail('Missing VITE_SUPABASE_URL in .env')
if (!serviceKey || serviceKey.includes('PASTE') || serviceKey.length < 20) {
  fail('Missing SUPABASE_SERVICE_ROLE_KEY in .env.local.\n' +
       '  Get it: Supabase dashboard → Project Settings → API → Project API keys → service_role (Reveal, Copy)\n' +
       '  Put it in .env.local as:  SUPABASE_SERVICE_ROLE_KEY=<key>')
}
if (serviceKey.startsWith('sb_publishable') || /anon/i.test(serviceKey)) {
  fail('That looks like the ANON/publishable key. Admin actions need the service_role (secret) key.')
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

console.log(`\nTarget user: ${email}`)

// Find the user by email (paginate just in case).
let found = null
for (let page = 1; page <= 20; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
  if (error) fail('listUsers failed: ' + error.message + '  (if this is a TLS/fetch error, re-run with NODE_OPTIONS=--use-system-ca and check your connection)')
  found = data.users.find(u => (u.email || '').toLowerCase() === email.toLowerCase())
  if (found || data.users.length < 1000) break
}

if (found) {
  const { error } = await admin.auth.admin.updateUserById(found.id, { password })
  if (error) fail('Password update failed: ' + error.message)
  console.log(`✓ Password updated for existing user (id ${found.id}).`)
} else {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) fail('User create failed: ' + error.message)
  console.log(`✓ No existing user — created ${email} (id ${data.user.id}), auto-confirmed.`)
}

console.log(`\nYou can now log in with:\n  email:    ${email}\n  password: ${password}\n`)
