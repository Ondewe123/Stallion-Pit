import { describe, it, expect } from 'vitest'
import { extFromName, storagePath, isImage, newId } from './docs'

describe('extFromName', () => {
  it('extracts a lowercase extension', () => {
    expect(extFromName('receipt.PDF')).toBe('pdf')
    expect(extFromName('photo.jpeg')).toBe('jpeg')
    expect(extFromName('a.b.c.png')).toBe('png')
  })
  it('returns empty when there is no extension', () => {
    expect(extFromName('logbook')).toBe('')
    expect(extFromName('')).toBe('')
    expect(extFromName(null)).toBe('')
  })
})

describe('storagePath', () => {
  it('builds {userId}/{id}.{ext}', () => {
    expect(storagePath('u1', 'd1', 'invoice.pdf')).toBe('u1/d1.pdf')
  })
  it('omits the dot when the file has no extension', () => {
    expect(storagePath('u1', 'd1', 'scan')).toBe('u1/d1')
  })
})

describe('isImage', () => {
  it('is true for image mime types', () => {
    expect(isImage('image/png')).toBe(true)
    expect(isImage('image/jpeg')).toBe(true)
  })
  it('is false otherwise', () => {
    expect(isImage('application/pdf')).toBe(false)
    expect(isImage('')).toBe(false)
    expect(isImage(null)).toBe(false)
    expect(isImage(undefined)).toBe(false)
  })
})

describe('newId', () => {
  it('returns a uuid-shaped string', () => {
    expect(newId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  })
  it('returns distinct ids', () => {
    expect(newId()).not.toBe(newId())
  })
})
