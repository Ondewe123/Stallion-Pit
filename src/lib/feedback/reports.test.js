import { describe, it, expect, vi } from 'vitest'
import { buildContext, statusPatch, withTimeout, newId, updateReport, deleteReport } from './reports'

describe('newId', () => {
  it('returns a v4-shaped uuid', () => {
    expect(newId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('falls back without crypto.randomUUID (older iOS)', () => {
    const spy = vi.spyOn(globalThis, 'crypto', 'get').mockReturnValue(undefined)
    try {
      expect(newId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    } finally {
      spy.mockRestore()
    }
  })

  it('generates distinct ids', () => {
    expect(newId()).not.toBe(newId())
  })
})

describe('withTimeout', () => {
  it('resolves with the value when the promise settles first', async () => {
    const r = await withTimeout(Promise.resolve('ok'), 1000)
    expect(r).toEqual({ timedOut: false, value: 'ok' })
  })

  it('flags timedOut when the timer wins (promise never settles)', async () => {
    vi.useFakeTimers()
    try {
      const never = new Promise(() => {})
      const p = withTimeout(never, 5000)
      await vi.advanceTimersByTimeAsync(5000)
      const r = await p
      expect(r.timedOut).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('captures a rejection without throwing', async () => {
    const r = await withTimeout(Promise.reject(new Error('boom')), 1000)
    expect(r.timedOut).toBe(false)
    expect(r.error).toBeInstanceOf(Error)
  })
})

describe('buildContext', () => {
  it('shapes the context snapshot from injected values', () => {
    const ctx = buildContext({
      user: { email: 'a@b.com' },
      activeVehicle: { id: 'v1', name: 'Polo' },
      href: 'http://localhost:5173/fuel',
      route: '/fuel',
      viewport: { w: 1280, h: 800 },
      appVersion: 'abc1234',
    })
    expect(ctx).toEqual({
      url: 'http://localhost:5173/fuel',
      route: '/fuel',
      vehicle_id: 'v1',
      vehicle_name: 'Polo',
      user_email: 'a@b.com',
      viewport: { w: 1280, h: 800 },
      app_version: 'abc1234',
    })
  })

  it('tolerates missing user/vehicle', () => {
    const ctx = buildContext({ user: null, activeVehicle: null, href: '/', route: '/', viewport: { w: 0, h: 0 } })
    expect(ctx.vehicle_id).toBeNull()
    expect(ctx.vehicle_name).toBeNull()
    expect(ctx.user_email).toBeNull()
    expect(ctx.app_version).toBe('dev')
  })
})

describe('statusPatch', () => {
  const now = () => '2026-06-18T00:00:00.000Z'
  it('sets resolved_at when resolving', () => {
    expect(statusPatch('resolved', now)).toEqual({ status: 'resolved', resolved_at: '2026-06-18T00:00:00.000Z' })
  })
  it('clears resolved_at for non-resolved statuses', () => {
    expect(statusPatch('open', now)).toEqual({ status: 'open', resolved_at: null })
    expect(statusPatch('in_progress', now)).toEqual({ status: 'in_progress', resolved_at: null })
  })
})

describe('updateReport', () => {
  it('patches comment + type by id', async () => {
    const calls = {}
    const client = {
      from: (t) => { calls.table = t; return {
        update: (patch) => { calls.patch = patch; return {
          eq: (col, val) => { calls.eq = [col, val]; return Promise.resolve({ error: null }) },
        } },
      } },
    }
    const r = await updateReport('r1', { comment: 'fixed text', type: 'idea' }, client)
    expect(calls.table).toBe('feedback_reports')
    expect(calls.patch).toEqual({ comment: 'fixed text', type: 'idea' })
    expect(calls.eq).toEqual(['id', 'r1'])
    expect(r.error).toBeNull()
  })

  it('maps a blank comment to null', async () => {
    let patch
    const client = { from: () => ({ update: (p) => { patch = p; return { eq: () => Promise.resolve({ error: null }) } } }) }
    await updateReport('r1', { comment: '' }, client)
    expect(patch).toEqual({ comment: null })
  })

  it('returns the error message on failure', async () => {
    const client = { from: () => ({ update: () => ({ eq: () => Promise.resolve({ error: { message: 'nope' } }) }) }) }
    expect(await updateReport('r1', { type: 'bug' }, client)).toEqual({ error: 'nope' })
  })
})

describe('deleteReport', () => {
  it('removes the screenshot then deletes the row', async () => {
    const seq = []
    const client = {
      storage: { from: () => ({ remove: (paths) => { seq.push(['remove', paths]); return Promise.resolve({ error: null }) } }) },
      from: (t) => ({ delete: () => ({ eq: (c, v) => { seq.push(['delete', t, c, v]); return Promise.resolve({ error: null }) } }) }),
    }
    const r = await deleteReport('r1', 'uid/r1.png', client)
    expect(seq).toEqual([['remove', ['uid/r1.png']], ['delete', 'feedback_reports', 'id', 'r1']])
    expect(r.error).toBeNull()
  })

  it('skips storage when there is no screenshot path', async () => {
    const seq = []
    const client = { from: () => ({ delete: () => ({ eq: () => { seq.push('delete'); return Promise.resolve({ error: null }) } }) }) }
    const r = await deleteReport('r1', null, client)
    expect(seq).toEqual(['delete'])
    expect(r.error).toBeNull()
  })
})
