import { describe, it, expect } from 'vitest'
import { assertSafeUrl } from './ssrfGuard.mjs'

const fakeLookup = (address) => async () => ({ address })

describe('assertSafeUrl', () => {
  it('allows a normal https url resolving to a public address', async () => {
    await expect(assertSafeUrl('https://example.com/part/123', { lookup: fakeLookup('93.184.216.34') }))
      .resolves.toBeInstanceOf(URL)
  })
  it('rejects non-http(s) schemes', async () => {
    await expect(assertSafeUrl('file:///etc/passwd')).rejects.toThrow('http/https')
  })
  it('rejects an invalid URL string', async () => {
    await expect(assertSafeUrl('not a url')).rejects.toThrow('valid URL')
  })
  it('rejects localhost by hostname', async () => {
    await expect(assertSafeUrl('http://localhost:3000/x')).rejects.toThrow('local address')
  })
  it('rejects a literal private IPv4 host', async () => {
    await expect(assertSafeUrl('http://192.168.1.5/x')).rejects.toThrow('private address')
  })
  it('rejects a hostname that resolves to a private address', async () => {
    await expect(assertSafeUrl('https://sneaky.example.com/x', { lookup: fakeLookup('10.0.0.5') }))
      .rejects.toThrow('resolves to a private address')
  })
  it('rejects the literal 0.0.0.0 host', async () => {
    await expect(assertSafeUrl('http://0.0.0.0/x')).rejects.toThrow('private address')
  })
  it('rejects the bare "0" shorthand host', async () => {
    await expect(assertSafeUrl('http://0/x')).rejects.toThrow('private address')
  })
  it('rejects an IPv4-mapped IPv6 literal host wrapping a private address', async () => {
    await expect(assertSafeUrl('http://[::ffff:10.0.0.5]/x')).rejects.toThrow('private address')
  })
  it('rejects a hostname that resolves to an IPv4-mapped IPv6 private address', async () => {
    await expect(assertSafeUrl('https://sneaky2.example.com/x', { lookup: fakeLookup('::ffff:10.0.0.5') }))
      .rejects.toThrow('resolves to a private address')
  })
})
