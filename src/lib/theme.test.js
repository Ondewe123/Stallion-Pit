// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { THEMES, DEFAULT_THEME, isValidTheme, getStoredTheme, storeTheme, applyTheme } from './theme'

describe('isValidTheme', () => {
  it('accepts known theme names', () => {
    expect(isValidTheme('dark')).toBe(true)
    expect(isValidTheme('light')).toBe(true)
  })
  it('rejects unknown values', () => {
    expect(isValidTheme('farmhouse-cream')).toBe(false)
    expect(isValidTheme(null)).toBe(false)
    expect(isValidTheme(undefined)).toBe(false)
    expect(isValidTheme(42)).toBe(false)
  })
})

describe('THEMES / DEFAULT_THEME', () => {
  it('lists exactly dark and light, default dark', () => {
    expect(THEMES).toEqual(['dark', 'light'])
    expect(DEFAULT_THEME).toBe('dark')
  })
})

describe('getStoredTheme', () => {
  beforeEach(() => localStorage.clear())

  it('returns null when nothing is stored', () => {
    expect(getStoredTheme()).toBe(null)
  })

  it('returns the stored value when valid', () => {
    localStorage.setItem('sp-theme', 'light')
    expect(getStoredTheme()).toBe('light')
  })

  it('returns null when the stored value is invalid', () => {
    localStorage.setItem('sp-theme', 'not-a-theme')
    expect(getStoredTheme()).toBe(null)
  })

  it('returns null instead of throwing when localStorage is unavailable', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    expect(getStoredTheme()).toBe(null)
    spy.mockRestore()
  })
})

describe('storeTheme', () => {
  beforeEach(() => localStorage.clear())

  it('writes the value to localStorage', () => {
    storeTheme('light')
    expect(localStorage.getItem('sp-theme')).toBe('light')
  })

  it('does not throw when localStorage is unavailable', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    expect(() => storeTheme('light')).not.toThrow()
    spy.mockRestore()
  })
})

describe('applyTheme', () => {
  it('sets data-theme on the document root', () => {
    applyTheme('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    applyTheme('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})
