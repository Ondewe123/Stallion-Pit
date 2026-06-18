// Rolling in-memory breadcrumb buffer. Pure module, no React. Every public
// function is wrapped so a broken breadcrumb can never throw into app code.

const MAX = 50
const buffer = []

export function record(event) {
  try {
    if (!event || typeof event !== 'object') return
    buffer.push({ ...event, t: new Date().toISOString() })
    while (buffer.length > MAX) buffer.shift()
  } catch {
    /* breadcrumbs must never break the app */
  }
}

export function snapshot() {
  try {
    return buffer.map((e) => ({ ...e }))
  } catch {
    return []
  }
}

export function clear() {
  buffer.length = 0
}

// --- global listeners (browser only; called once at startup) ---

let installed = false

export function installGlobalListeners() {
  if (installed || typeof window === 'undefined') return
  installed = true
  try {
    const origError = console.error.bind(console)
    console.error = (...args) => {
      record({ kind: 'console', level: 'error', message: args.map(stringify).join(' ').slice(0, 500) })
      origError(...args)
    }
    const origWarn = console.warn.bind(console)
    console.warn = (...args) => {
      record({ kind: 'console', level: 'warn', message: args.map(stringify).join(' ').slice(0, 500) })
      origWarn(...args)
    }
    window.addEventListener('error', (e) => {
      record({ kind: 'exception', message: String(e?.message || 'error').slice(0, 500) })
    })
    window.addEventListener('unhandledrejection', (e) => {
      record({ kind: 'exception', message: String(e?.reason?.message || e?.reason || 'unhandledrejection').slice(0, 500) })
    })
    document.addEventListener(
      'click',
      (e) => {
        const el = e.target?.closest?.('button, a, [role="button"]')
        if (!el) return
        const label = (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 60)
        if (label) record({ kind: 'click', label })
      },
      true, // capture phase — fire even if the handler stops propagation
    )
  } catch {
    /* never break startup */
  }
}

function stringify(v) {
  try {
    return typeof v === 'string' ? v : JSON.stringify(v)
  } catch {
    return String(v)
  }
}
