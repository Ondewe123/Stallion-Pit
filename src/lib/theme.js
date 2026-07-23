const STORAGE_KEY = 'sp-theme'

export const THEMES = ['dark', 'light']
export const DEFAULT_THEME = 'dark'

export function isValidTheme(value) {
  return THEMES.includes(value)
}

export function getStoredTheme() {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return isValidTheme(value) ? value : null
  } catch {
    return null
  }
}

export function storeTheme(theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // private browsing / storage disabled — theme still applies for this session
  }
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme
}
