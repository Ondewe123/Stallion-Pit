// Wrap the global fetch so every Supabase PostgREST request leaves a breadcrumb.
// Instrumenting at the fetch layer (rather than proxying the query builder) keeps
// the fluent `.from().select().eq()` chain untouched and captures HTTP errors.

import { record } from './breadcrumbs'

const REST_RE = /\/rest\/v1\/([^?/]+)/
const METHOD_OP = { GET: 'select', POST: 'insert', PATCH: 'update', PUT: 'upsert', DELETE: 'delete' }

export function makeLoggingFetch(baseFetch) {
  return async function loggingFetch(input, init = {}) {
    const url = typeof input === 'string' ? input : input?.url || ''
    const method = (init.method || (typeof input !== 'string' && input?.method) || 'GET').toUpperCase()
    const match = REST_RE.exec(url)
    const table = match ? safeDecode(match[1]) : null
    const op = METHOD_OP[method] || method

    let res
    try {
      res = await baseFetch(input, init)
    } catch (err) {
      if (table) record({ kind: 'supabase', table, op, ok: false, error: String(err?.message || err) })
      throw err
    }

    if (table) {
      const entry = { kind: 'supabase', table, op, status: res.status, ok: res.ok }
      if (!res.ok) entry.error = await readError(res)
      record(entry)
    }
    return res
  }
}

async function readError(res) {
  try {
    const body = await res.clone().json()
    return body?.message || body?.error || body?.hint || `HTTP ${res.status}`
  } catch {
    return `HTTP ${res.status}`
  }
}

function safeDecode(s) {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}
