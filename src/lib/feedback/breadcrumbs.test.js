import { describe, it, expect, beforeEach } from 'vitest'
import { record, snapshot, clear } from './breadcrumbs'

describe('breadcrumbs ring buffer', () => {
  beforeEach(() => clear())

  it('records events and stamps a timestamp', () => {
    record({ kind: 'nav', route: '/fuel' })
    const snap = snapshot()
    expect(snap).toHaveLength(1)
    expect(snap[0].kind).toBe('nav')
    expect(snap[0].route).toBe('/fuel')
    expect(typeof snap[0].t).toBe('string')
  })

  it('caps at 50 events, dropping the oldest', () => {
    for (let i = 0; i < 60; i++) record({ kind: 'nav', n: i })
    const snap = snapshot()
    expect(snap).toHaveLength(50)
    expect(snap[0].n).toBe(10) // 0..9 dropped
    expect(snap[49].n).toBe(59)
  })

  it('snapshot returns an independent copy', () => {
    record({ kind: 'nav', n: 1 })
    const snap = snapshot()
    snap[0].n = 999
    expect(snapshot()[0].n).toBe(1)
  })

  it('never throws on bad input', () => {
    expect(() => record(null)).not.toThrow()
    expect(() => record(undefined)).not.toThrow()
    expect(() => record('nope')).not.toThrow()
  })

  it('clear empties the buffer', () => {
    record({ kind: 'nav' })
    clear()
    expect(snapshot()).toHaveLength(0)
  })
})
