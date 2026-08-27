import { describe, it, expect, vi } from 'vitest'
import {
  buildContext, statusPatch, withTimeout, newId, updateReport, deleteReport,
  resolutionPatch, reopenPatch, updateReportResolution, reopenReport,
} from './reports'

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

describe('resolutionPatch', () => {
  const now = () => '2026-08-27T20:00:00.000Z'

  it('builds a verified resolved patch', () => {
    expect(resolutionPatch({
      outcome: 'resolved',
      note: 'Verified dashboard table in production.',
      appVersion: 'abc1234',
    }, now)).toEqual({ value: {
      status: 'resolved',
      resolved_at: '2026-08-27T20:00:00.000Z',
      disposition: null,
      canonical_report_id: null,
      resolution_note: 'Verified dashboard table in production.',
      verified_at: '2026-08-27T20:00:00.000Z',
      verified_app_version: 'abc1234',
    }, error: null })
  })

  it('requires evidence for every terminal outcome', () => {
    expect(resolutionPatch({ outcome: 'resolved', note: ' ' }, now).error)
      .toBe('Add verification evidence before closing this report.')
  })

  it('requires a different canonical report for duplicates', () => {
    expect(resolutionPatch({
      outcome: 'duplicate', note: 'Same request.', reportId: 'r1', canonicalReportId: 'r1',
    }, now).error).toBe('Choose a different canonical report.')
  })

  it('builds a duplicate patch with canonical id', () => {
    expect(resolutionPatch({
      outcome: 'duplicate', note: 'Covered by the route alternatives report.',
      reportId: 'r1', canonicalReportId: 'r2', appVersion: 'abc1234',
    }, now).value).toMatchObject({
      status: 'resolved', disposition: 'duplicate', canonical_report_id: 'r2',
    })
  })

  it('builds a cannot-reproduce patch without a canonical id', () => {
    expect(resolutionPatch({
      outcome: 'cannot_reproduce', note: 'Tested Chrome and Android against build abc1234.',
    }, now).value).toMatchObject({
      status: 'resolved', disposition: 'cannot_reproduce', canonical_report_id: null,
    })
  })
})

describe('reopenPatch', () => {
  it('clears all terminal metadata', () => {
    expect(reopenPatch()).toEqual({
      status: 'open', resolved_at: null, disposition: null,
      canonical_report_id: null, resolution_note: null,
      verified_at: null, verified_app_version: null,
    })
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

describe('resolution updates', () => {
  const clientWithUpdate = (capture) => ({
    from: (table) => ({
      update: (patch) => ({
        eq: (column, id) => {
          capture.push({ table, patch, column, id })
          return Promise.resolve({ error: null })
        },
      }),
    }),
  })

  it('writes a validated resolution patch by id', async () => {
    const calls = []
    const result = await updateReportResolution('r1', {
      outcome: 'resolved', note: 'Verified.', appVersion: 'abc1234',
    }, clientWithUpdate(calls), () => '2026-08-27T20:00:00.000Z')
    expect(result).toEqual({ error: null })
    expect(calls[0]).toMatchObject({ table: 'feedback_reports', column: 'id', id: 'r1' })
    expect(calls[0].patch).toMatchObject({ status: 'resolved', resolution_note: 'Verified.' })
  })

  it('does not call Supabase when validation fails', async () => {
    const calls = []
    const result = await updateReportResolution('r1', {
      outcome: 'resolved', note: '',
    }, clientWithUpdate(calls))
    expect(result.error).toBe('Add verification evidence before closing this report.')
    expect(calls).toEqual([])
  })

  it('reopens and clears evidence by id', async () => {
    const calls = []
    expect(await reopenReport('r1', clientWithUpdate(calls))).toEqual({ error: null })
    expect(calls[0].patch).toEqual(reopenPatch())
  })
})
