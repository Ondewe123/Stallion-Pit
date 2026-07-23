# Theme System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dark/light theme system to Stallion Pit: rename the existing CSS custom properties to semantic names, add a light "Showroom Paper" theme, persist the user's choice to Supabase (with localStorage caching for instant no-flash apply), and expose a toggle in the sidebar/mobile top bar.

**Architecture:** Semantic CSS custom properties under `[data-theme="dark"|"light"]` blocks in `src/index.css` (dark values unchanged from today, light values new). A pre-paint inline script in `index.html` applies the cached theme before first render. A new `ThemeContext` syncs localStorage ⇄ Supabase and exposes `setTheme()`. Recharts colours are re-read from computed CSS custom properties via a small `chartTheme.js` helper so charts re-colour live on toggle.

**Tech Stack:** Vite + React 19 (plain CSS, no Tailwind), Supabase (Postgres + RLS), Vitest (`node` environment by default, `// @vitest-environment jsdom` per-file override where DOM/localStorage is needed — see `src/pages/Ipc.test.jsx` for the existing precedent).

## Global Constraints

- No business logic changes — this is styling + one additive table only.
- Dark theme values must be **pixel-identical** to today's look (only names change, not values) — existing users see zero visual change until they opt into light mode.
- Colour meaning stays consistent in both themes: danger=red, warning=amber, success=green, accent=gold (brand/primary action).
- Google's Sign-In button colours (`src/pages/Login.jsx` lines 81-90: `#4285F4`, `#34A853`, `#FBBC05`, `#EA4335`, `#fff`, `#3c4043`, `#dadce0`) are brand-mandated and must **not** be touched.
- The white backgrounds behind IPC diagram/part images (`.ipc-diagram-image`, `.snag-ipc-thumb`, `.snag-ipc-preview` in `src/index.css`) must **stay literal `#fff`** in both themes — they frame photographs/scanned diagrams, not UI chrome.
- `npm run build` and `npm run test` (or `npx vitest run`) must stay green after every task.
- Per the user's standing rule: application code changes are committed locally but **not pushed** to `origin/main` without a separate explicit go-ahead. The Supabase migration is additive/RLS-scoped and applied via the Supabase MCP as part of implementation (matching this repo's established pattern for prior features — see `supabase/migrations/0011_feedback.sql` et al.).

---

### Task 1: Rewrite design tokens in `src/index.css`

**Files:**
- Modify: `src/index.css:1-31` (root token block) and the hardcoded hex spots listed below.

**Interfaces:**
- Produces: the full semantic token contract every later task and every existing style rule in this file relies on: `--bg`, `--surface`, `--surface-2`, `--border`, `--border-strong`, `--text-faint`, `--text-muted`, `--text`, `--text-strong`, `--accent`, `--accent-dim`, `--accent-soft`, `--danger`, `--danger-strong`, `--danger-soft`, `--danger-border`, `--warning`, `--warning-strong`, `--warning-soft`, `--warning-border`, `--success`, `--success-strong`, `--success-soft`, `--success-border`, `--chart-1`..`--chart-6`, `--chart-grid`, `--chart-axis`, `--chart-tooltip-bg`, `--chart-tooltip-border`, `--chart-tooltip-label`. All defined under `:root, [data-theme="dark"]` (today's values, unchanged) and `[data-theme="light"]` (new).

- [ ] **Step 1: Replace the root token block**

Replace `src/index.css` lines 1-31 (from the top of the file through the closing `}` of the original `:root` block) with:

```css
/* ============================================================
   STALLION PIT — Global Styles + Design Tokens
   ============================================================ */

@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500&display=swap');

:root, [data-theme="dark"] {
  --bg:              #0a0a0a;
  --surface:         #141414;
  --surface-2:       #1e1e1e;
  --border:          #252525;
  --border-strong:   #3a3a3a;
  --text-faint:      #555;
  --text-muted:      #888;
  --text:            #c8c8c8;
  --text-strong:     #efefef;

  --accent:          #c9a84c;
  --accent-dim:      #7a6230;
  --accent-soft:     rgba(201, 168, 76, 0.1);

  --danger:          #c0392b;
  --danger-strong:   #e74c3c;
  --danger-soft:     rgba(192, 57, 43, 0.12);
  --danger-border:   rgba(192, 57, 43, 0.4);

  --warning:         #c87d1a;
  --warning-strong:  #f39c12;
  --warning-soft:    rgba(200, 125, 26, 0.12);
  --warning-border:  rgba(200, 125, 26, 0.4);

  --success:         #2a7a4a;
  --success-strong:  #27ae60;
  --success-soft:    rgba(42, 122, 74, 0.12);
  --success-border:  rgba(42, 122, 74, 0.4);

  --chart-1: #c9a227;
  --chart-2: #4aa3df;
  --chart-3: #e0794a;
  --chart-4: #f39c12;
  --chart-5: #27ae60;
  --chart-6: #b07cc6;
  --chart-grid: #2a2a2a;
  --chart-axis: #8a8a8a;
  --chart-tooltip-bg: #161616;
  --chart-tooltip-border: #333;
  --chart-tooltip-label: #aaa;

  --sidebar-w:            220px;
  --sidebar-w-collapsed:  56px;
  --font-body:    'DM Sans', sans-serif;
  --font-mono:    'DM Mono', monospace;
  --font-display: 'Bebas Neue', sans-serif;
}

[data-theme="light"] {
  --bg:              #f4f1ea;
  --surface:         #fdfcf8;
  --surface-2:       #ece7db;
  --border:          #ddd6c8;
  --border-strong:   #c8bfa9;
  --text-faint:      #9a8f7d;
  --text-muted:      #6e6455;
  --text:            #4a4438;
  --text-strong:     #2b2620;

  --accent:          #8a6d2a;
  --accent-dim:      #6e5726;
  --accent-soft:     rgba(138, 109, 42, 0.12);

  --danger:          #a8291b;
  --danger-strong:   #c0392b;
  --danger-soft:     rgba(168, 41, 27, 0.10);
  --danger-border:   rgba(168, 41, 27, 0.35);

  --warning:         #a8650f;
  --warning-strong:  #c87d1a;
  --warning-soft:    rgba(168, 101, 15, 0.10);
  --warning-border:  rgba(168, 101, 15, 0.35);

  --success:         #1f6138;
  --success-strong:  #2a7a4a;
  --success-soft:    rgba(31, 97, 56, 0.10);
  --success-border:  rgba(31, 97, 56, 0.35);

  --chart-1: #a3811e;
  --chart-2: #3178a8;
  --chart-3: #c25f34;
  --chart-4: #c87d1a;
  --chart-5: #1f8a4c;
  --chart-6: #8a5ba3;
  --chart-grid: #e0dccf;
  --chart-axis: #8a7f6c;
  --chart-tooltip-bg: #fffdf8;
  --chart-tooltip-border: #ddd6c8;
  --chart-tooltip-label: #6e6455;
}
```

- [ ] **Step 2: Fix the hardcoded hex inside `.badge-red`/`.badge-amber`/`.badge-green`**

Find (originally around line 288-290, now shifted since the token block grew):

```css
.badge-red   { background: var(--red-bg);   color: #e74c3c; border: 1px solid rgba(192,57,43,0.4); }
.badge-amber { background: var(--amber-bg); color: #f39c12; border: 1px solid rgba(200,125,26,0.4); }
.badge-green { background: var(--green-bg); color: #27ae60; border: 1px solid rgba(42,122,74,0.4); }
```

Replace with:

```css
.badge-red   { background: var(--danger-soft);  color: var(--danger-strong);  border: 1px solid var(--danger-border); }
.badge-amber { background: var(--warning-soft); color: var(--warning-strong); border: 1px solid var(--warning-border); }
.badge-green { background: var(--success-soft); color: var(--success-strong); border: 1px solid var(--success-border); }
```

(Note: this pre-empts Task 2's rename for `--red-bg`/`--amber-bg`/`--green-bg` on these three lines specifically, since they're being rewritten by hand here anyway.)

- [ ] **Step 3: Fix `.login-error`**

Find:

```css
.login-error {
  background: var(--red-bg);
  border: 1px solid rgba(192,57,43,0.4);
  color: #e74c3c;
  border-radius: 3px;
  padding: 10px 14px;
  font-size: 12px;
  margin-bottom: 16px;
  font-family: var(--font-mono);
}
```

Replace with:

```css
.login-error {
  background: var(--danger-soft);
  border: 1px solid var(--danger-border);
  color: var(--danger-strong);
  border-radius: 3px;
  padding: 10px 14px;
  font-size: 12px;
  margin-bottom: 16px;
  font-family: var(--font-mono);
}
```

- [ ] **Step 4: Fix `.form-error` and `.form-success`**

Find:

```css
.form-error {
  background: var(--red-bg);
  border: 1px solid rgba(192,57,43,0.4);
  color: #e74c3c;
  border-radius: 3px;
  padding: 10px 14px;
  font-size: 12px;
  margin-bottom: 16px;
  font-family: var(--font-mono);
}
.form-success {
  background: var(--green-bg);
  border: 1px solid rgba(42,122,74,0.4);
  color: #27ae60;
  border-radius: 3px;
  padding: 10px 14px;
  font-size: 12px;
  margin-bottom: 16px;
  font-family: var(--font-mono);
}
```

Replace with:

```css
.form-error {
  background: var(--danger-soft);
  border: 1px solid var(--danger-border);
  color: var(--danger-strong);
  border-radius: 3px;
  padding: 10px 14px;
  font-size: 12px;
  margin-bottom: 16px;
  font-family: var(--font-mono);
}
.form-success {
  background: var(--success-soft);
  border: 1px solid var(--success-border);
  color: var(--success-strong);
  border-radius: 3px;
  padding: 10px 14px;
  font-size: 12px;
  margin-bottom: 16px;
  font-family: var(--font-mono);
}
```

- [ ] **Step 5: Fix `.row-btn-danger`**

Find:

```css
.row-btn-danger { border-color: rgba(192,57,43,0.3); color: var(--red); }
```

Replace with:

```css
.row-btn-danger { border-color: var(--danger-border); color: var(--danger); }
```

- [ ] **Step 6: Verify the dev server still starts and the page looks pixel-identical to before**

Run: `npm run dev` (or if already running, just reload the browser tab)
Expected: app loads with no console errors; visually identical to before this task (dark theme values are unchanged, only names changed — but every OTHER file in the repo still references the OLD names like `var(--charcoal)`, `var(--gold)`, `var(--black)` etc. at this point in the plan, so **the page will actually look broken/unstyled right now** — those old names no longer resolve to anything. This is expected and gets fixed in Task 2. Confirm only that `npm run build` compiles the CSS without a syntax error:

Run: `npm run build`
Expected: build succeeds (Vite doesn't validate that custom properties resolve — an unresolved `var(--charcoal)` is not a build error, just an unstyled element — so this build passing only proves the CSS is syntactically valid, not that the app looks right yet).

- [ ] **Step 7: Commit**

```bash
git add src/index.css
git commit -m "feat(theme): define semantic dark/light design tokens

Renames literal token names (--black, --charcoal, --gold, ...) to
semantic ones (--bg, --surface, --accent, ...) and adds a
[data-theme=light] block. Dark values are unchanged from today.
Old var() references elsewhere in the app still use the old names
and will be fixed in the next commit."
```

---

### Task 2: Bulk-rename `var(--old-name)` references across JSX files

**Files:**
- Modify (via `sed`, not Edit): `src/pages/Analysis.jsx`, `src/pages/Backup.jsx`, `src/pages/Dashboard.jsx`, `src/pages/Documents.jsx`, `src/pages/Dtc.jsx`, `src/pages/Feedback.jsx`, `src/pages/FuelLog.jsx`, `src/pages/Ipc.jsx`, `src/pages/Login.jsx`, `src/pages/Maintenance.jsx`, `src/pages/PartsLog.jsx`, `src/pages/ServiceLog.jsx`, `src/pages/Snags.jsx`, `src/pages/Templates.jsx`, `src/pages/WorkOrders.jsx`

**Interfaces:**
- Consumes: the token names produced by Task 1.
- Produces: every `var(--...)` reference in these 15 files now uses the new semantic names, matching `src/index.css`.

- [ ] **Step 1: Run the rename**

The old→new mapping (order matters — longer/more-specific names first so e.g. `--red-bg` is fully replaced before the bare `--red` pass runs):

```bash
FILES="src/pages/Analysis.jsx src/pages/Backup.jsx src/pages/Dashboard.jsx src/pages/Documents.jsx src/pages/Dtc.jsx src/pages/Feedback.jsx src/pages/FuelLog.jsx src/pages/Ipc.jsx src/pages/Login.jsx src/pages/Maintenance.jsx src/pages/PartsLog.jsx src/pages/ServiceLog.jsx src/pages/Snags.jsx src/pages/Templates.jsx src/pages/WorkOrders.jsx"

sed -i \
  -e 's/--gold-glow/--accent-soft/g' \
  -e 's/--gold-dim/--accent-dim/g' \
  -e 's/--gold/--accent/g' \
  -e 's/--red-bg/--danger-soft/g' \
  -e 's/--amber-bg/--warning-soft/g' \
  -e 's/--green-bg/--success-soft/g' \
  -e 's/--red/--danger/g' \
  -e 's/--amber/--warning/g' \
  -e 's/--green/--success/g' \
  -e 's/--black/--bg/g' \
  -e 's/--charcoal/--surface/g' \
  -e 's/--steel/--surface-2/g' \
  -e 's/--muted/--border-strong/g' \
  -e 's/--text-dim/--text-faint/g' \
  -e 's/--text-mid/--text-muted/g' \
  -e 's/--white/--text-strong/g' \
  $FILES
```

- [ ] **Step 2: Verify no old token names remain**

Run:
```bash
grep -rn -- '--gold\|--charcoal\|--steel\|--black\b\|--white\b\|--muted\b\|--red\b\|--amber\b\|--green\b\|--text-dim\|--text-mid' src/index.css src/pages/*.jsx
```
Expected: no output (empty — every old name has been renamed everywhere).

- [ ] **Step 3: Confirm the app looks right again**

Run: `npm run dev`, open the app in a browser.
Expected: app renders exactly as it did before Task 1 — dark background, gold accents, all pages readable. `data-theme` is not set on `<html>` yet (that comes in Task 5), so the `:root, [data-theme="dark"]` block applies via the bare `:root` selector, giving today's look by default.

- [ ] **Step 4: Run the existing test suite and build**

Run: `npx vitest run`
Expected: all existing tests pass (this task touches no logic, only CSS variable names inside `style={{ color: 'var(--foo)' }}` object literals — no test currently asserts on these values, so nothing should break).

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/pages/*.jsx
git commit -m "refactor(theme): rename CSS var references to match new token names

Mechanical find-and-replace across all pages that referenced the old
literal token names (--charcoal, --gold, --text-dim, ...) in inline
styles. No visual or logic change — dark theme renders identically."
```

---

### Task 3: Replace hardcoded status-colour hex literals with tokens

**Files:**
- Modify: `src/pages/Dashboard.jsx:117,122,189`, `src/pages/Dtc.jsx:157,158,180`, `src/pages/Backup.jsx:123,126,159`, `src/pages/Snags.jsx:802,807,848`, `src/pages/PartsLog.jsx:415`, `src/pages/Fleet.jsx:468`, `src/pages/Maintenance.jsx:291,296`, `src/pages/FuelLog.jsx:528`

**Interfaces:**
- Consumes: `--danger-strong`, `--warning-strong`, `--success-strong` tokens from Task 1.
- Produces: no more hardcoded hex status colours in these files — they now flip with the theme.

- [ ] **Step 1: Dashboard.jsx**

Find (appears twice, at lines 117 and 122):
```jsx
style={{ color: fleetOpenSnags ? '#e74c3c' : undefined }}
```
and
```jsx
style={{ color: fleetOverdue ? '#e74c3c' : undefined }}
```
Replace `'#e74c3c'` with `'var(--danger-strong)'` in both (use `replace_all` for the literal string `'#e74c3c'` since both spots map to the same token).

Find (line 189):
```jsx
style={{ color: openSnags.length ? '#f39c12' : undefined }}
```
Replace `'#f39c12'` with `'var(--warning-strong)'`.

- [ ] **Step 2: Dtc.jsx**

Line 157: replace `'#f39c12'` with `'var(--warning-strong)'`.
Line 158: replace `'#e74c3c'` with `'var(--danger-strong)'`.
Line 180: replace `'#e67e22'` with `'var(--warning-strong)'`.

- [ ] **Step 3: Backup.jsx**

Line 123 (`borderColor: '#e74c3c'`) and line 126 (`color: '#e74c3c'`): replace both occurrences of `'#e74c3c'` with `'var(--danger-strong)'` (use `replace_all`).
Line 159: replace `'#27ae60'` with `'var(--success-strong)'`.

- [ ] **Step 4: Snags.jsx**

Lines 802 and 807: replace both occurrences of `'#e74c3c'` with `'var(--danger-strong)'` (use `replace_all`).
Line 848: replace `'#e67e22'` with `'var(--warning-strong)'`.

- [ ] **Step 5: PartsLog.jsx**

Line 415: replace `'#27ae60'` with `'var(--success-strong)'`.

- [ ] **Step 6: Fleet.jsx**

Line 468: replace `'#e74c3c'` with `'var(--danger-strong)'`.

- [ ] **Step 7: Maintenance.jsx**

Line 291: replace `'#e74c3c'` with `'var(--danger-strong)'`.
Line 296: replace `'#f39c12'` with `'var(--warning-strong)'`.

- [ ] **Step 8: FuelLog.jsx**

Line 528: replace `'#e0a030'` with `'var(--warning-strong)'`.

- [ ] **Step 9: Verify nothing else hardcodes a status colour**

Run:
```bash
grep -n "#e74c3c\|#f39c12\|#27ae60\|#e67e22\|#e0a030" src/pages/*.jsx
```
Expected: no output.

- [ ] **Step 10: Run tests and build**

Run: `npx vitest run` — expected all pass.
Run: `npm run build` — expected success.

- [ ] **Step 11: Commit**

```bash
git add src/pages/Dashboard.jsx src/pages/Dtc.jsx src/pages/Backup.jsx src/pages/Snags.jsx src/pages/PartsLog.jsx src/pages/Fleet.jsx src/pages/Maintenance.jsx src/pages/FuelLog.jsx
git commit -m "refactor(theme): route hardcoded status colours through tokens

Dashboard/Dtc/Backup/Snags/PartsLog/Fleet/Maintenance/FuelLog had
hardcoded hex for danger/warning/success emphasis colours. These now
use var(--danger-strong)/var(--warning-strong)/var(--success-strong)
so they re-colour correctly in the light theme."
```

---

### Task 4: `src/lib/theme.js` — theme validation and storage helpers

**Files:**
- Create: `src/lib/theme.js`
- Test: `src/lib/theme.test.js`

**Interfaces:**
- Produces: `THEMES` (array `['dark', 'light']`), `DEFAULT_THEME` (`'dark'`), `isValidTheme(value)`, `getStoredTheme()`, `storeTheme(theme)`, `applyTheme(theme)`. These are consumed by Task 6 (`ThemeContext.jsx`) and Task 5 (`index.html` inline script re-implements the storage-read logic in plain JS since it runs before any module loads — see Task 5 for why it can't import this file).

- [ ] **Step 1: Write the failing tests**

Create `src/lib/theme.test.js`:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/theme.test.js`
Expected: FAIL — `Cannot find module './theme'` (the file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/lib/theme.js`:

```js
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/theme.test.js`
Expected: PASS (all 9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/theme.js src/lib/theme.test.js
git commit -m "feat(theme): add theme validation and storage helpers

isValidTheme/getStoredTheme/storeTheme/applyTheme — pure helpers used
by ThemeContext. Storage reads/writes are wrapped in try/catch so a
blocked localStorage (private browsing) degrades to session-only
theming instead of throwing."
```

---

### Task 5: Pre-paint theme script in `index.html`

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: the same `sp-theme` localStorage key and `['dark','light']` validity check as `src/lib/theme.js` (duplicated here in plain JS — this script runs in the `<head>` before any JS module loads, so it cannot `import` from `src/lib/theme.js`; keeping the two in sync is a 2-line duplication, not worth adding a build step to avoid).
- Produces: `data-theme` is set on `<html>` before first paint, so there is no flash of the wrong theme.

- [ ] **Step 1: Add the inline script**

Edit `index.html`, inserting a new `<script>` right after the `<meta name="viewport">` tag and before `<title>`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <script>
      (function () {
        try {
          var t = localStorage.getItem('sp-theme');
          if (t !== 'dark' && t !== 'light') t = 'dark';
          document.documentElement.dataset.theme = t;
        } catch (e) {
          document.documentElement.dataset.theme = 'dark';
        }
      })();
    </script>
    <title>stallion-pit</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Verify manually**

Run: `npm run dev`, open the app in a browser with devtools open.
Expected: In the Elements panel, `<html data-theme="dark">` is present immediately, even before React mounts (view page source / inspect element right after navigation — no flash).

Run in the browser console: `localStorage.setItem('sp-theme', 'light')`, then reload.
Expected: `<html data-theme="light">` from the very first paint (app will still render in dark colours until Task 1-2's tokens are actually toggled by something — that's fine, this task only proves the attribute is set correctly; visual light-mode correctness is confirmed once Task 6/8 wire up the toggle).

- [ ] **Step 3: Run the build**

Run: `npm run build`
Expected: succeeds (plain HTML/inline script, nothing for Vite to break).

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(theme): apply cached theme before first paint

Inline script in <head> reads localStorage('sp-theme') and sets
data-theme on <html> before any CSS/JS loads, so switching themes
never causes a flash of the wrong theme on reload."
```

---

### Task 6: `ThemeContext` — sync localStorage ⇄ Supabase, expose `setTheme`

**Files:**
- Create: `src/contexts/ThemeContext.jsx`
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `THEMES`, `DEFAULT_THEME`, `isValidTheme`, `getStoredTheme`, `storeTheme`, `applyTheme` from `src/lib/theme.js` (Task 4); `supabase` client from `src/lib/supabase.js`; `useAuth()` from `src/contexts/AuthContext.jsx` (needs `user` — `{ id, email, ... }` or `null`).
- Produces: `ThemeProvider` (wraps children), `useTheme()` returning `{ theme, setTheme }` where `theme` is `'dark'|'light'` and `setTheme(next)` is a function taking `'dark'|'light'`. Consumed by Task 8 (toggle button) and Task 9 (`chartTheme.js` re-read on theme change).
- Depends on the `user_settings` table from Task 7 existing before the Supabase read/write in this context will succeed — but the fetch/upsert calls degrade gracefully (caught errors, no UI break) if the table doesn't exist yet, so task order (6 before 7) is safe to build/test in isolation. Wire the actual DB verification into Task 7 instead.

- [ ] **Step 1: Create the context**

Create `src/contexts/ThemeContext.jsx`:

```jsx
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
```

- [ ] **Step 2: Wire it into `App.jsx`**

In `src/App.jsx`, add the import and wrap `AppRoutes` with `ThemeProvider`, nested inside `AuthProvider` (it needs `useAuth()`):

```jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { VehicleProvider } from './contexts/VehicleContext'
```

And change the final `export default function App()`:

```jsx
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          <AppRoutes />
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
```

- [ ] **Step 3: Verify manually (Supabase table doesn't exist yet — expect a harmless console error)**

Run: `npm run dev`, log in.
Expected: app loads and works normally. The Supabase `user_settings` select in the reconcile effect will fail (table doesn't exist until Task 7) — confirm this fails **silently** (caught by the `.then(({ data, error }) => ...)` destructure, `error` truthy causes early return, no thrown exception, no broken UI). Check the browser console: a logged network 404/400 from the failed query is expected and fine at this point; there must be no *uncaught* JS exception.

- [ ] **Step 4: Run tests and build**

Run: `npx vitest run` — expected all pass (no new test files touch this; `ThemeContext.jsx` itself is a React component with no test file, matching the existing convention for `AuthContext.jsx`/`VehicleContext.jsx`, neither of which have tests).
Run: `npm run build` — expected success.

- [ ] **Step 5: Commit**

```bash
git add src/contexts/ThemeContext.jsx src/App.jsx
git commit -m "feat(theme): add ThemeContext syncing localStorage and Supabase

setTheme() flips data-theme immediately, caches to localStorage, and
upserts the choice to Supabase (fire-and-forget) so it follows the
user across devices. Reconciles with the saved preference on login."
```

---

### Task 7: `user_settings` table migration

**Files:**
- Create: `supabase/migrations/0021_user_settings.sql`

**Interfaces:**
- Produces: `public.user_settings(user_id uuid, key text, value jsonb, updated_at timestamptz)`, primary key `(user_id, key)`, RLS scoped to `auth.uid() = user_id` for select/insert/update/delete. This is what Task 6's `ThemeContext` reads from and writes to (`.eq('key', 'theme')`, `value` stores the theme name as a JSON string, e.g. `"dark"`).

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/0021_user_settings.sql`:

```sql
-- 0021_user_settings.sql — generic per-user key/value settings store.
--
-- Reusable across future preferences; first consumer is the theme toggle
-- (key='theme', value='"dark"'|'"light"' as jsonb). Owner-scoped RLS
-- (0005 pattern). Additive, new table, no existing data touched. Idempotent.

create table if not exists public.user_settings (
  user_id    uuid not null references auth.users(id) on delete cascade default auth.uid(),
  key        text not null,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.user_settings enable row level security;

drop policy if exists "owner read settings"   on public.user_settings;
drop policy if exists "owner insert settings" on public.user_settings;
drop policy if exists "owner update settings" on public.user_settings;
drop policy if exists "owner delete settings" on public.user_settings;

create policy "owner read settings"   on public.user_settings for select using (auth.uid() = user_id);
create policy "owner insert settings" on public.user_settings for insert with check (auth.uid() = user_id);
create policy "owner update settings" on public.user_settings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner delete settings" on public.user_settings for delete using (auth.uid() = user_id);
```

- [ ] **Step 2: Apply the migration to the live Supabase project**

Use the `mcp__claude_ai_Supabase__apply_migration` tool with `name: "0021_user_settings"` and the SQL body above, targeting the Stallion Pit Supabase project.

Expected: migration applies without error.

- [ ] **Step 3: Verify the table and policies**

Use `mcp__claude_ai_Supabase__list_tables` (or run `select * from public.user_settings limit 1;` via `execute_sql`) to confirm the table exists with the expected columns.

Use `mcp__claude_ai_Supabase__get_advisors` (security advisors) to confirm no new RLS warnings were introduced.

- [ ] **Step 4: Re-verify Task 6's reconcile flow now succeeds cleanly**

Run: `npm run dev`, log in, check the browser console/network tab.
Expected: the `user_settings` select in `ThemeContext`'s reconcile effect now returns `200` with no rows (`data: null` from `.maybeSingle()`), instead of the earlier 404/400 — no console errors at all now.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0021_user_settings.sql
git commit -m "feat(db): add user_settings table for per-user preferences

Generic key/value store, owner-scoped RLS. First consumer is the
theme toggle (key='theme'); reusable for future preferences without
another migration."
```

---

### Task 8: Theme toggle button in `Layout.jsx`

**Files:**
- Modify: `src/components/Layout.jsx`

**Interfaces:**
- Consumes: `useTheme()` from `src/contexts/ThemeContext.jsx` (Task 6), returning `{ theme, setTheme }`.
- Produces: a visible sun/moon toggle in the sidebar footer (desktop) and the mobile top bar.

- [ ] **Step 1: Add the toggle**

In `src/components/Layout.jsx`, add the import:

```jsx
import { useTheme } from '../contexts/ThemeContext'
```

Inside `export default function Layout()`, add alongside the existing hooks:

```jsx
const { theme, setTheme } = useTheme()
const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark')
```

In the sidebar footer (replace the existing block):

```jsx
<div className="sidebar-footer">
  {!collapsed && <div className="sidebar-user">{user?.email}</div>}
  <button className="btn-secondary" onClick={toggleTheme} title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>
    {collapsed ? (theme === 'dark' ? '☀️' : '🌙') : (theme === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode')}
  </button>
  <button className="btn-signout" onClick={handleSignOut} title="Sign out">
    {collapsed ? '⏻' : 'Sign Out'}
  </button>
</div>
```

In the mobile top bar (replace the existing block):

```jsx
<header className="mobile-topbar">
  <span className="logo-text">STALLION <span className="logo-accent">PIT</span></span>
  <div className="mobile-topbar-right">
    <VehicleSelector />
    <button className="btn-signout mobile-signout" onClick={toggleTheme} title="Toggle theme">
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
    <button className="btn-signout mobile-signout" onClick={handleSignOut} title="Sign out">⏻</button>
  </div>
</header>
```

- [ ] **Step 2: Verify manually**

Run: `npm run dev`, log in.
Expected: a "☀️ Light Mode" button appears in the sidebar footer, above "Sign Out". Clicking it instantly flips the whole app to the light theme (cream background, dark text, all pages readable) and the button now reads "🌙 Dark Mode". Clicking again flips back. Reload the page — the last-chosen theme persists (no flash).

Resize the browser to mobile width (or open devtools device toolbar).
Expected: a sun/moon icon button appears in the top bar next to the sign-out icon; tapping it flips the theme the same way.

- [ ] **Step 3: Run tests and build**

Run: `npx vitest run` — expected all pass.
Run: `npm run build` — expected success.

- [ ] **Step 4: Commit**

```bash
git add src/components/Layout.jsx
git commit -m "feat(theme): add sidebar + mobile theme toggle

One-tap dark/light switch, wired to ThemeContext.setTheme(). Icon-only
when the sidebar is collapsed."
```

---

### Task 9: `chartTheme.js` — theme-aware recharts colours

**Files:**
- Create: `src/lib/chartTheme.js`
- Test: `src/lib/chartTheme.test.js`
- Modify: `src/pages/Analysis.jsx`, `src/pages/FuelLog.jsx`

**Interfaces:**
- Consumes: the `--chart-*` custom properties from Task 1 (read via `getComputedStyle`); `useTheme()` from Task 6 (to know when to re-read).
- Produces: `readChartTheme(doc)` (pure function, takes an optional `document`-like object for testing, defaults to global `document`) returning `{ axis: {fontSize, fill}, grid, tooltip: {contentStyle, labelStyle}, series: {1..6} }`. Also exports `useChartTheme()`, a hook wrapping `readChartTheme` in a `useMemo` keyed on the current theme.

- [ ] **Step 1: Write the failing test**

Create `src/lib/chartTheme.test.js`:

```js
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { readChartTheme } from './chartTheme'

function fakeDocWithVars(vars) {
  const root = document.documentElement
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(`--${k}`, v))
  return document
}

describe('readChartTheme', () => {
  it('reads axis/grid/tooltip/series from CSS custom properties', () => {
    fakeDocWithVars({
      'chart-axis': '#111111',
      'chart-grid': '#222222',
      'chart-tooltip-bg': '#333333',
      'chart-tooltip-border': '#444444',
      'chart-tooltip-label': '#555555',
      'chart-1': '#aaaaaa',
      'chart-2': '#bbbbbb',
    })
    const t = readChartTheme()
    expect(t.axis).toEqual({ fontSize: 11, fill: '#111111' })
    expect(t.grid).toBe('#222222')
    expect(t.tooltip.contentStyle.background).toBe('#333333')
    expect(t.tooltip.contentStyle.border).toBe('1px solid #444444')
    expect(t.tooltip.labelStyle.color).toBe('#555555')
    expect(t.series[1]).toBe('#aaaaaa')
    expect(t.series[2]).toBe('#bbbbbb')
  })

  it('falls back to sensible defaults when a var is missing', () => {
    document.documentElement.style.cssText = ''
    const t = readChartTheme()
    expect(t.grid).toBe('#2a2a2a')
    expect(t.series[1]).toBe('#c9a227')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/chartTheme.test.js`
Expected: FAIL — `Cannot find module './chartTheme'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/chartTheme.js`:

```js
import { useMemo } from 'react'
import { useTheme } from '../contexts/ThemeContext'

const DEFAULTS = {
  axis: '#8a8a8a',
  grid: '#2a2a2a',
  tooltipBg: '#161616',
  tooltipBorder: '#333',
  tooltipLabel: '#aaa',
  chart1: '#c9a227',
  chart2: '#4aa3df',
  chart3: '#e0794a',
  chart4: '#f39c12',
  chart5: '#27ae60',
  chart6: '#b07cc6',
}

export function readChartTheme(doc = document) {
  const style = getComputedStyle(doc.documentElement)
  const v = (name, fallback) => style.getPropertyValue(`--${name}`).trim() || fallback

  return {
    axis: { fontSize: 11, fill: v('chart-axis', DEFAULTS.axis) },
    grid: v('chart-grid', DEFAULTS.grid),
    tooltip: {
      contentStyle: {
        background: v('chart-tooltip-bg', DEFAULTS.tooltipBg),
        border: `1px solid ${v('chart-tooltip-border', DEFAULTS.tooltipBorder)}`,
        borderRadius: 4,
        fontSize: 12,
      },
      labelStyle: { color: v('chart-tooltip-label', DEFAULTS.tooltipLabel) },
    },
    series: {
      1: v('chart-1', DEFAULTS.chart1),
      2: v('chart-2', DEFAULTS.chart2),
      3: v('chart-3', DEFAULTS.chart3),
      4: v('chart-4', DEFAULTS.chart4),
      5: v('chart-5', DEFAULTS.chart5),
      6: v('chart-6', DEFAULTS.chart6),
    },
  }
}

export function useChartTheme() {
  const { theme } = useTheme()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => readChartTheme(), [theme])
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/chartTheme.test.js`
Expected: PASS (both tests).

- [ ] **Step 5: Wire it into `Analysis.jsx`**

In `src/pages/Analysis.jsx`, remove the module-level constants:

```js
const AXIS = { fontSize: 11, fill: '#8a8a8a' }
const GRID = '#2a2a2a'
const TIP = { background: '#161616', border: '1px solid #333', borderRadius: 4, fontSize: 12 }
```

Add the import:

```js
import { useChartTheme } from '../lib/chartTheme'
```

Inside `export default function Analysis()`, add near the top (after the existing `useState`/`useVehicle` hooks):

```js
const chart = useChartTheme()
```

Replace every use of `AXIS` with `chart.axis`, every `GRID` with `chart.grid`, every `TIP` with `chart.tooltip.contentStyle`, and every `labelStyle={{ color: '#aaa' }}` with `labelStyle={chart.tooltip.labelStyle}`. Replace the per-series hardcoded colours:
- `stroke="#c9a227"` (L/100km line) → `stroke={chart.series[1]}`
- `fill="#f39c12"` (fuel bar) → `fill={chart.series[4]}`
- `fill="#27ae60"` (service bar) → `fill={chart.series[5]}`
- `fill="#b07cc6"` (parts bar) → `fill={chart.series[6]}`
- `stroke="#4aa3df"` (KES/L line) → `stroke={chart.series[2]}`
- `stroke="#e0794a"` (KES/km line) → `stroke={chart.series[3]}`

- [ ] **Step 6: Wire it into `FuelLog.jsx`**

In `src/pages/FuelLog.jsx`, remove the same three module-level constants (`AXIS`, `GRID`, `TIP`), add the same `useChartTheme` import, call `const chart = useChartTheme()` inside the `ConsumptionTrend` component (the only place these constants are used in this file — it's a function component, so the hook call is valid there), and replace `AXIS`→`chart.axis`, `GRID`→`chart.grid`, `TIP`→`chart.tooltip.contentStyle`, `labelStyle={{ color: '#aaa' }}`→`labelStyle={chart.tooltip.labelStyle}`, and `stroke="#c9a227"`→`stroke={chart.series[1]}`.

- [ ] **Step 7: Verify manually**

Run: `npm run dev`, go to Analysis and Fuel Log pages in dark mode — confirm charts look identical to before (same colours, since dark-mode chart tokens match the old hardcoded hex exactly).

Toggle to light mode (Task 8's button) — confirm chart backgrounds/gridlines/tooltips/lines all switch to the light-tuned colours and remain readable (no dark tooltip on a light page, no invisible gridlines).

- [ ] **Step 8: Run tests and build**

Run: `npx vitest run` — expected all pass (existing suite + the 2 new `chartTheme.test.js` tests).
Run: `npm run build` — expected success.

- [ ] **Step 9: Commit**

```bash
git add src/lib/chartTheme.js src/lib/chartTheme.test.js src/pages/Analysis.jsx src/pages/FuelLog.jsx
git commit -m "feat(theme): make recharts colours theme-aware

chartTheme.js reads axis/grid/tooltip/series colours from the active
theme's CSS custom properties. Analysis and FuelLog charts now
re-colour live when the user toggles theme, instead of staying
hardcoded to the dark palette."
```

---

### Task 10: Final verification and manual QA handoff

**Files:** none (verification only)

**Interfaces:** none — this task confirms everything from Tasks 1-9 works together.

- [ ] **Step 1: Full automated check**

Run: `npx vitest run`
Expected: all tests pass (existing ~195+ tests, plus the new `theme.test.js` and `chartTheme.test.js` tests).

Run: `npm run build`
Expected: succeeds with no errors.

Run: `npm run lint`
Expected: no new lint errors introduced by this feature (pre-existing lint debt, if any, is out of scope).

- [ ] **Step 2: Grep sweep for anything missed**

Run:
```bash
grep -rn -- '--gold\|--charcoal\|--steel\|--black\b\|--white\b\|--muted\b\|--red\b\|--amber\b\|--green\b\|--text-dim\|--text-mid' src/
```
Expected: no output.

Run:
```bash
grep -n "#e74c3c\|#f39c12\|#27ae60\|#e67e22\|#e0a030" src/pages/*.jsx
```
Expected: no output.

- [ ] **Step 3: Write out the manual verification checklist for Chris**

Present this numbered list (matches §7 of the design spec) as the final message of this task — do not check any of these off yourself; they require a human eyeballing a real browser:

1. `npm run dev`, load the app — dark theme should look pixel-identical to before this feature (no visual regression).
2. Click the "☀️ Light Mode" button in the sidebar footer — instant flip to light theme, no flash, check readability on: Dashboard, Fleet, Fuel Log, Parts, Snags, Maintenance, Analysis (charts), IPC, Login screen.
3. Reload the page while in light mode — it should stay light (no flash back to dark first).
4. Log in from a second browser (or an incognito window) with the same account — confirm the Supabase-saved theme preference applies there too.
5. On the Analysis and Fuel Log pages, confirm chart colours (lines, bars, gridlines, tooltips) actually change between themes and stay readable in both.
6. Confirm status colours (danger/warning/success) still read correctly in both themes on Dashboard, Snags, Dtc, Maintenance, Backup, Fleet, PartsLog.
7. On a real phone or tablet (or the browser's device toolbar), confirm the mobile top-bar toggle works and the mobile bottom nav/top bar look correct in both themes.

- [ ] **Step 4: Stop and ask before pushing**

This plan's commits stay local. Do not run `git push` — ask the user whether to push to `origin/main` only after they've completed the manual verification checklist above.
