import { describe, it, expect, beforeEach } from 'vitest'
import { makeLoggingFetch } from './instrument'
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
})
