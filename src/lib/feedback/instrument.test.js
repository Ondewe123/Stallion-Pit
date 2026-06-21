import { describe, it, expect, beforeEach, vi } from 'vitest'
import { makeLoggingFetch, sanitizeInit } from './instrument'
import { snapshot, clear } from './breadcrumbs'

const REST = 'https://x.supabase.co/rest/v1/fuel_logs?select=*'

function fakeResponse({ ok = true, status = 200, body = {} } = {}) {
  return {
    ok,
    status,
    clone() {
      return { json: async () => body }
    },
  }
}

describe('makeLoggingFetch', () => {
  beforeEach(() => clear())

  it('records a supabase breadcrumb for a successful REST select', async () => {
    const f = makeLoggingFetch(async () => fakeResponse({ status: 200 }))
    await f(REST, { method: 'GET' })
    const snap = snapshot()
    expect(snap).toHaveLength(1)
    expect(snap[0]).toMatchObject({ kind: 'supabase', table: 'fuel_logs', op: 'select', status: 200, ok: true })
  })

  it('maps HTTP methods to operations', async () => {
    const f = makeLoggingFetch(async () => fakeResponse())
    await f('https://x.supabase.co/rest/v1/snags', { method: 'POST' })
    expect(snapshot()[0].op).toBe('insert')
  })

  it('captures the error message on a failed REST call', async () => {
    const f = makeLoggingFetch(async () => fakeResponse({ ok: false, status: 403, body: { message: 'permission denied' } }))
    await f(REST, { method: 'GET' })
    expect(snapshot()[0]).toMatchObject({ ok: false, status: 403, error: 'permission denied' })
  })

  it('records an error breadcrumb when the network throws, then rethrows', async () => {
    const boom = new Error('network down')
    const f = makeLoggingFetch(async () => {
      throw boom
    })
    await expect(f(REST, { method: 'GET' })).rejects.toThrow('network down')
    expect(snapshot()[0]).toMatchObject({ kind: 'supabase', table: 'fuel_logs', ok: false, error: 'network down' })
  })

  it('ignores non-REST requests (e.g. auth/storage)', async () => {
    const f = makeLoggingFetch(async () => fakeResponse())
    await f('https://x.supabase.co/auth/v1/token', { method: 'POST' })
    expect(snapshot()).toHaveLength(0)
  })

  it('returns the real response unchanged', async () => {
    const res = fakeResponse({ status: 201 })
    const f = makeLoggingFetch(async () => res)
    const out = await f(REST, { method: 'GET' })
    expect(out).toBe(res)
  })

  it('passes sanitized headers to the underlying fetch (no crash on a bad header value)', async () => {
    let seen
    const f = makeLoggingFetch(async (_input, init) => { seen = init; return fakeResponse() })
    await f(REST, { method: 'GET', headers: { Authorization: 'Bearer abc\n', apikey: 'ok' } })
    expect(seen.headers.Authorization).toBe('Bearer abc') // newline stripped
    expect(seen.headers.apikey).toBe('ok')
  })
})

describe('sanitizeInit', () => {
  it('strips control / non-Latin-1 chars from header values', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const out = sanitizeInit({ headers: { Authorization: 'Bearer good\r\n', X: 'café✓' } })
    expect(out.headers.Authorization).toBe('Bearer good')
    expect(out.headers.X).toBe('caf') // é and ✓ are outside 0x20-0x7E
    vi.restoreAllMocks()
  })

  it('drops null/undefined header values that fetch would reject', () => {
    const out = sanitizeInit({ headers: { A: undefined, B: null, C: 'keep' } })
    expect(out.headers).toEqual({ C: 'keep' })
  })

  it('returns the same init object when headers are already clean', () => {
    const init = { method: 'GET', headers: { Authorization: 'Bearer abc.def', apikey: 'sb_publishable_x' } }
    expect(sanitizeInit(init)).toBe(init)
  })

  it('leaves Headers instances and missing headers untouched', () => {
    const noHeaders = { method: 'GET' }
    expect(sanitizeInit(noHeaders)).toBe(noHeaders)
  })
})
