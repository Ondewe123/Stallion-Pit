// Wrap the global fetch so every Supabase PostgREST request leaves a breadcrumb.
// Instrumenting at the fetch layer (rather than proxying the query builder) keeps
// the fluent `.from().select().eq()` chain untouched and captures HTTP errors.

import { record } from './breadcrumbs'

const REST_RE = /\/rest\/v1\/([^?/]+)/
const METHOD_OP = { GET: 'select', POST: 'insert', PATCH: 'update', PUT: 'upsert', DELETE: 'delete' }

// HTTP header values must be ISO-8859-1 with no control chars; anything else makes the
// browser's fetch() throw a synchronous "Failed to execute 'fetch': Invalid value" before
// any request is sent. A stray control/non-Latin-1 char in an auth token (e.g. from an
// OAuth redirect) therefore crashes the whole login. This sanitises plain-object headers:
// it drops null/undefined values and strips disallowed characters, returning a NEW init
// (never mutating the caller's). It logs whatever it cleaned so the offending bytes are
// visible. Headers/array header shapes are passed through untouched.
export function sanitizeInit(init = {}) {
  const h = init && init.headers
  if (!h || typeof h !== 'object' || typeof Headers !== 'undefined' && h instanceof Headers || Array.isArray(h)) {
    return init
  }
  let changed = false
  const clean = {}
  for (const [k, v] of Object.entries(h)) {
    if (v == null) { changed = true; continue }
    const s = String(v)
    const safe = s.replace(/[^\x20-\x7E]/g, '')
    if (safe !== s) {
      changed = true
      // eslint-disable-next-line no-console
      console.warn('[fetch] stripped invalid chars from header', k, 'codes:', [...s].map(c => c.charCodeAt(0)).join(','))
    }
    clean[k] = safe
  }
  return changed ? { ...init, headers: clean } : init
}

export function makeLoggingFetch(baseFetch) {
  return async function loggingFetch(input, init = {}) {
    init = sanitizeInit(init)
    const url = typeof input === 'string' ? input : input?.url || ''
    const method = (init.method || (typeof input !== 'string' && input?.method) || 'GET').toUpperCase()
    const match = REST_RE.exec(url)
    const table = match ? safeDecode(match[1]) : null
    const op = METHOD_OP[method] || method

    let res
    try {
      res = await baseFetch(input, init)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[fetch] failed', method, url, '-', String(err?.message || err))
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
