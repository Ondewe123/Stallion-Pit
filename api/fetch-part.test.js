import { describe, it, expect, vi, beforeEach } from 'vitest'

const getUserMock = vi.fn()
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ auth: { getUser: getUserMock } })),
}))

const resolvePastedPartMock = vi.fn()
vi.mock('../src/lib/fetchPart/resolvePastedPart.mjs', () => ({
  resolvePastedPart: resolvePastedPartMock,
}))

const { default: handler } = await import('./fetch-part.mjs')

function req(body, headers = {}) {
  return new Request('https://app.example.com/api/fetch-part', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

describe('POST /api/fetch-part', () => {
  beforeEach(() => { getUserMock.mockReset(); resolvePastedPartMock.mockReset() })

  it('rejects a request with no Authorization header', async () => {
    const res = await handler(req({ url: 'https://example.com/part' }))
    expect(res.status).toBe(401)
  })

  it('rejects an invalid session token', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: { message: 'bad token' } })
    const res = await handler(req({ url: 'https://example.com/part' }, { authorization: 'Bearer bad' }))
    expect(res.status).toBe(401)
  })

  it('returns the resolved part details for a valid session', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    resolvePastedPartMock.mockResolvedValue({
      title: 'Boot Gas Strut', price: 9.5, currencyCode: 'GBP',
      documentId: null, documentPath: null, fileName: null, mimeType: null, fileSize: null,
    })

    const res = await handler(req({ url: 'https://example.com/part' }, { authorization: 'Bearer good' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.title).toBe('Boot Gas Strut')
  })

  it('returns 422 with the error message when resolvePastedPart throws', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    resolvePastedPartMock.mockRejectedValue(new Error('That link points to a private address'))

    const res = await handler(req({ url: 'http://192.168.1.5/x' }, { authorization: 'Bearer good' }))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toMatch(/private address/)
  })
})
