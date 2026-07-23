import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import { DEFAULT_THEME, isValidTheme, getStoredTheme, storeTheme, applyTheme } from '../lib/theme'

const ThemeContext = createContext({ theme: DEFAULT_THEME, setTheme: () => {} })

export function ThemeProvider({ children }) {
  const { user } = useAuth()
  const [theme, setThemeState] = useState(() => getStoredTheme() || DEFAULT_THEME)

  // Apply on mount (the index.html inline script already did this before paint;
  // this keeps React state in sync with whatever's actually on <html>).
  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  // Once logged in, reconcile with the account's saved preference (cross-device sync).
  useEffect(() => {
    if (!user) return
    let cancelled = false
    supabase
      .from('user_settings')
      .select('value')
      .eq('user_id', user.id)
      .eq('key', 'theme')
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled || error || !data) return
        const remote = data.value
        if (isValidTheme(remote) && remote !== theme) {
          setThemeState(remote)
          storeTheme(remote)
        }
      })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const setTheme = useCallback((next) => {
    if (!isValidTheme(next)) return
    setThemeState(next)
    applyTheme(next)
    storeTheme(next)
    if (user) {
      supabase
        .from('user_settings')
        .upsert({ user_id: user.id, key: 'theme', value: next }, { onConflict: 'user_id,key' })
        .then(() => {}) // fire-and-forget — never blocks the visual flip
    }
  }, [user])

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
