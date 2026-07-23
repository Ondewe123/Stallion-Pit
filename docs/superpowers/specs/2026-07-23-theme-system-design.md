# Theme System — Design Spec

**Date:** 2026-07-23
**Status:** Approved, pending implementation
**Branch:** `main` (small enough to build directly, verify locally before any deploy)
**Author:** Chris (Ondewe) + Claude (brainstorming session)

---

## 1. Goal

Give Stallion Pit a dark/light theme system, modeled on the token-based approach already
proven in the KukuFarm project (`THEME.md`, `docs/superpowers/specs/2026-06-03-farmhouse-theme-system-design.md`).
Today's dark "Pit" look becomes the `dark` theme (still the default); add one new `light`
theme ("Showroom Paper") with the same layout, fonts, and gold accent identity. The user's
choice follows them across devices (laptop, iPad, Infinix phone) via Supabase, applied
instantly on load with no flash.

## 2. Constraints & non-goals

- **No business logic changes.** Fuel log, parts, snags, maintenance, IPC, feedback — all untouched.
- **Two themes only** (per user decision): `dark` (existing look, default) and `light`. Not
  building a KukuFarm-style multi-theme picker page or theme gallery.
- **Colour keeps its meaning:** danger=red, warning=amber, success=green, gold accent = brand/
  primary action — consistent in both themes.
- **One additive migration:** a small generic `user_settings` key/value table (reusable for
  future settings beyond theme), not a `users.theme_preference` column. Owner-scoped RLS, no
  existing data touched.
- **Not in scope:** additional themes/accents, OS-auto light/dark switching, a dedicated
  settings/appearance page (the toggle lives in the sidebar + mobile top bar).

## 3. Current state

- **Stack:** Vite + React 19, plain CSS (no Tailwind), all styling in one file:
  [src/index.css](../../../src/index.css). Fonts: Bebas Neue (display), DM Sans (body), DM Mono
  (mono/labels).
- Colours are already centralized as CSS custom properties on `:root` (`--black`, `--charcoal`,
  `--steel`, `--gold`, `--red`, `--amber`, `--green`, etc.) — much further along than KukuFarm's
  starting point (which had ~900 raw Tailwind utility occurrences). No renaming-at-scale needed
  in components; the rename happens once, centrally, in `index.css`.
- A handful of components hardcode hex literals inline instead of using the CSS vars — mostly
  status colours (`#e74c3c`, `#f39c12`, `#27ae60`, `#e67e22`) and recharts chart config
  (`Analysis.jsx`, `FuelLog.jsx`). These must route through tokens to re-colour with the theme.
- No theme concept exists today; `data-theme` is never set anywhere.

## 4. Architecture / approach

### 4.1 Token layer — semantic rename in `index.css`

Rename literal tokens to semantic ones, then define both a `dark` and `light` value for each
under `[data-theme="…"]` blocks (`:root` defaults to `dark`, matching today's look exactly so
existing dark-theme users see zero visual change).

| Old (literal) | New (semantic) | Dark value (unchanged) | Light value (new) |
|---|---|---|---|
| `--black` | `--bg` | `#0a0a0a` | `#f4f1ea` |
| `--charcoal` | `--surface` | `#141414` | `#fdfcf8` |
| `--steel` | `--surface-2` | `#1e1e1e` | `#ece7db` |
| `--border` | `--border` *(kept)* | `#252525` | `#ddd6c8` |
| `--muted` | `--border-strong` | `#3a3a3a` | `#c8bfa9` |
| `--text-dim` | `--text-faint` | `#555` | `#9a8f7d` |
| `--text-mid` | `--text-muted` | `#888` | `#6e6455` |
| `--text` | `--text` *(kept)* | `#c8c8c8` | `#4a4438` |
| `--white` | `--text-strong` | `#efefef` | `#2b2620` |
| `--gold` | `--accent` | `#c9a84c` | `#8a6d2a` (darkened for contrast on light bg) |
| `--gold-dim` | `--accent-dim` | `#7a6230` | `#6e5726` |
| `--gold-glow` | `--accent-soft` | `rgba(201,168,76,.1)` | `rgba(138,109,42,.12)` |
| `--red` | `--danger` | `#c0392b` | `#a8291b` |
| `--amber` | `--warning` | `#c87d1a` | `#a8650f` |
| `--green` | `--success` | `#2a7a4a` | `#1f6138` |
| `--red-bg` | `--danger-soft` | `rgba(192,57,43,.12)` | `rgba(168,41,27,.10)` |
| `--amber-bg` | `--warning-soft` | `rgba(200,125,26,.12)` | `rgba(168,101,15,.10)` |
| `--green-bg` | `--success-soft` | `rgba(42,122,74,.12)` | `rgba(31,97,56,.10)` |
| *(new)* | `--chart-grid`, `--chart-axis`, `--chart-tip-bg`, `--chart-tip-border` | today's chart hexes (`#2a2a2a`, `#8a8a8a`, `#161616`, `#333`) | light-tuned equivalents |

`--sidebar-w`, `--sidebar-w-collapsed`, `--font-*` are layout/type tokens, not colour — unchanged,
theme-independent.

Every existing `var(--old-name)` reference in `index.css` and any inline styles gets updated to
the new semantic name in the same pass — this is a single-file mechanical rename plus new
`[data-theme="light"]` block, not a hunt across every component.

### 4.2 Applying the theme (no flash)

- A tiny inline script in `index.html`'s `<head>` (before the stylesheet/app loads) reads
  `localStorage.getItem('sp-theme')` and sets `document.documentElement.dataset.theme` before
  first paint. Falls back to `'dark'` if unset or invalid.
- A new `ThemeContext` (`src/contexts/ThemeContext.jsx`), mounted alongside the existing
  `AuthContext`/`VehicleContext`:
  - On mount: applies the localStorage value immediately (already done pre-paint, this just
    syncs React state).
  - Once the user is authenticated (`AuthContext` resolves), fetch their saved preference from
    Supabase (`user_settings` where `key='theme'`) and reconcile — Supabase wins if it differs
    from the local cache (cross-device sync), but the local value is what rendered first so
    there's no flash even before that fetch resolves.
  - Exposes `{ theme, setTheme }`. `setTheme('light'|'dark')`:
    1. Sets `data-theme` on `<html>` immediately (instant visual flip).
    2. Writes to `localStorage`.
    3. Upserts `user_settings` (fire-and-forget, matching the feedback-widget pattern — never
       blocks the UI flip).

### 4.3 Persistence — generic `user_settings` table

New migration `0021_user_settings.sql`:

```sql
create table user_settings (
  user_id    uuid not null references auth.users(id) on delete cascade,
  key        text not null,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table user_settings enable row level security;

create policy "owner can read own settings"
  on user_settings for select using (auth.uid() = user_id);
create policy "owner can upsert own settings"
  on user_settings for insert with check (auth.uid() = user_id);
create policy "owner can update own settings"
  on user_settings for update using (auth.uid() = user_id);
```

Additive, new table, no existing data touched. Generic key/value shape (per the portable
playbook: "a generic `Setting`-style key/value config table beats a new table per config
concern") — theme is just the first row written to it; future per-user preferences reuse it.

### 4.4 Toggle UI

- A small sun/moon icon button in the sidebar footer ([Layout.jsx](../../../src/components/Layout.jsx)),
  next to the sign-out button — flips `dark ⇄ light` on click.
- The same control appears in the mobile top bar (`.mobile-topbar-right`), consistent with how
  the vehicle selector and sign-out already appear there.
- No settings page. No preview cards. Just a toggle — appropriate for a 2-theme system.

### 4.5 Charts (recharts)

`Analysis.jsx` and `FuelLog.jsx` currently hardcode `AXIS`, `GRID`, `TIP` style objects and
per-series stroke/fill colours as literal hex. Recharts needs real colour strings (not
unresolved `var(...)` — though modern browsers do resolve `var()` in inline SVG style props, so
this is actually safe to pass directly). Approach:

- Replace the hardcoded `AXIS`/`GRID`/`TIP` objects with values read via
  `getComputedStyle(document.documentElement)` at render time through a tiny helper
  `src/lib/chartTheme.js`, re-computed when `theme` (from `ThemeContext`) changes — this
  guarantees chart colours flip live when the user toggles, not just on next reload.
- Per-series stroke colours (`L/100km` gold line, `KES/L` blue, `KES/km` orange, fuel/service/
  parts bars) move to the new `--chart-1` … `--chart-5` tokens defined in §4.1, read the same way.

### 4.6 Inline hex cleanup

Sweep the ~20 inline `style={{ color: '#e74c3c' }}`-style occurrences (Dashboard, Snags, Dtc,
Maintenance, PartsLog, Fleet, Backup) to `var(--danger)` / `var(--warning)` / `var(--success)`.
Left untouched (theme-independent by design): Google "Sign in" button branding colours
(`Login.jsx`) and the white backgrounds behind IPC diagram/part images (`.ipc-diagram-image`,
`.snag-ipc-thumb`, `.snag-ipc-preview` — these frame photographs/scanned diagrams, not UI
chrome, and should stay white in both themes so the images render correctly).

## 5. Data flow

```
App mount
  → index.html inline script sets data-theme from localStorage (pre-paint)
  → ThemeProvider mounts, reads same localStorage value into state
  → AuthContext resolves user
  → ThemeProvider fetches user_settings(key='theme') from Supabase
      → if present and different from local: apply + update localStorage
      → if absent: leave as-is (first login on this account, or account never set one)
  → user clicks toggle
      → setTheme() flips data-theme, localStorage, and upserts Supabase (fire-and-forget)
```

## 6. Testing

- Unit tests for `ThemeContext`/theme helper: valid theme values only ('dark'/'light'), safe
  fallback when localStorage is empty/corrupt, no throw if `localStorage` is unavailable
  (matches the existing "feature-detect browser APIs" lesson from the feedback widget work).
- Unit test for `chartTheme.js`: returns expected keys, doesn't throw if a CSS var is missing.
- Existing test suite (195+ tests) must stay green; `npm run build` must stay clean.
- No visual regression tool — manual verification instead (see §7).

## 7. Manual verification (Chris, before merge/deploy)

1. Run `npm run dev`, load the app — confirm dark theme looks identical to today (pixel-for-
   pixel, since dark values are unchanged).
2. Click the new toggle in the sidebar footer — confirm instant flip to light theme, no flash,
   all pages readable (Dashboard, Fleet, FuelLog, PartsLog, Snags, Analysis charts, IPC, Login).
3. Reload the page in light mode — confirm it stays light (localStorage persisted), no flash of
   dark-then-light.
4. Log in on a second device/browser profile — confirm the Supabase-saved preference applies
   there too.
5. Check chart colours (Analysis, FuelLog) actually change with the toggle, are readable in both
   themes.
6. Check status colours (danger/warning/success) still read correctly in both themes on
   Dashboard, Snags, Dtc, Maintenance.
7. Mobile viewport (or real iPad/Infinix): confirm the top-bar toggle works and mobile bottom
   nav / top bar look correct in both themes.

## 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Flash of wrong theme on load | Inline pre-paint script in `index.html` sets `data-theme` from `localStorage` before any CSS/JS loads |
| Missed hardcoded hex (unreadable text in light mode) | Grep sweep for `#[0-9a-f]{3,6}` literals in `src/pages`/`src/components` post-rename; visual QA per §7 |
| Recharts colours not re-rendering on toggle | `chartTheme.js` reads `getComputedStyle` reactively, keyed off theme context state, not computed once at import time |
| Contrast failure in light theme | Manual contrast check on light theme text/bg/accent combos during §7 QA |
| `user_settings` RLS misconfigured (cross-user leakage) | Policies scoped to `auth.uid() = user_id` on all three ops; tested via Supabase MCP `get_advisors` after migration |

## 9. Out of scope / future

- Additional themes/accent variants.
- OS-level light/dark auto-detection.
- Dedicated Settings → Appearance page with preview cards.
- Per-role or farm/fleet-wide default theme.
