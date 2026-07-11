// src/lib/fetchPart/resolvePastedPart.test.js
import { describe, it, expect, vi } from 'vitest'
import { resolvePastedPart } from './resolvePastedPart.mjs'

function htmlResponse(html) {
  return {
    ok: true, status: 200,
    arrayBuffer: async () => new TextEncoder().encode(html).buffer,
    headers: { get: () => 'text/html' },
  }
}
function imageResponse(bytes, contentType = 'image/jpeg') {
  return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer, headers: { get: () => contentType } }
}

const PAGE_WITH_IMAGE = `<html><head>
<script type="application/ld+json">
{"@type":"Product","name":"Wheel House Liner Left","image":"https://cdn.example.com/liner.jpg","offers":{"price":"24.99","priceCurrency":"GBP"}}
</script></head></html>`

const PAGE_NO_IMAGE = `<html><head>
<script type="application/ld+json">
{"@type":"Product","name":"Boot Gas Strut","offers":{"price":"9.5","priceCurrency":"GBP"}}
</script></head></html>`

const fakeLookupPublic = async () => ({ address: '93.184.216.34' })

describe('resolvePastedPart', () => {
  it('parses title/price/currency and uploads the photo', async () => {
    const uploadMock = vi.fn().mockResolvedValue({ error: null })
    const supabaseClient = { storage: { from: () => ({ upload: uploadMock }) } }
    const bytes = new Uint8Array([1, 2, 3])
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(htmlResponse(PAGE_WITH_IMAGE))
      .mockResolvedValueOnce(imageResponse(bytes))

    const result = await resolvePastedPart('https://example.com/part/1', {
      supabaseClient, userId: 'user-1', fetchImpl, lookup: fakeLookupPublic,
    })

    expect(result.title).toBe('Wheel House Liner Left')
    expect(result.price).toBe(24.99)
    expect(result.currencyCode).toBe('GBP')
    expect(result.documentPath).toMatch(/^user-1\//)
    expect(result.mimeType).toBe('image/jpeg')
    expect(result.fileSize).toBe(3)
    expect(uploadMock).toHaveBeenCalledTimes(1)
  })

  it('still returns title/price when there is no image', async () => {
    const supabaseClient = { storage: { from: () => ({ upload: vi.fn() }) } }
    const fetchImpl = vi.fn().mockResolvedValueOnce(htmlResponse(PAGE_NO_IMAGE))

    const result = await resolvePastedPart('https://example.com/part/2', {
      supabaseClient, userId: 'user-1', fetchImpl, lookup: fakeLookupPublic,
    })

    expect(result.title).toBe('Boot Gas Strut')
    expect(result.documentPath).toBeNull()
  })

  it('rejects a private-address URL before fetching anything', async () => {
    const supabaseClient = { storage: { from: () => ({ upload: vi.fn() }) } }
    const fetchImpl = vi.fn()

    await expect(resolvePastedPart('http://192.168.1.5/x', { supabaseClient, userId: 'u', fetchImpl }))
      .rejects.toThrow('private address')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('throws a clear error when the page itself fails to fetch', async () => {
    const supabaseClient = { storage: { from: () => ({ upload: vi.fn() }) } }
    const fetchImpl = vi.fn().mockResolvedValueOnce({ ok: false, status: 404 })

    await expect(resolvePastedPart('https://example.com/missing', {
      supabaseClient, userId: 'u', fetchImpl, lookup: fakeLookupPublic,
    })).rejects.toThrow('HTTP 404')
  })
})
