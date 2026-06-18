import { describe, it, expect } from 'vitest'
import { buildContext, statusPatch } from './reports'

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
