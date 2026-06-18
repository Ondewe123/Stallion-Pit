# In-App Feedback & Capture System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A one-click floating button on every page that captures a screenshot, a frozen breadcrumb log of recent actions, and a typed comment into a persisted Supabase report, listed in-app as a lightweight issue tracker.

**Architecture:** Stallion Pit is a pure client-side SPA (no backend), so "what the user was doing" is captured by instrumenting the app in the browser: a ring-buffer breadcrumb recorder fed by navigation, a `fetch`-layer Supabase logger, console-error hooks, and click hooks. A floating widget freezes that buffer, screenshots the page with `html2canvas`, and writes a row to `feedback_reports` (+ a screenshot in Storage). A `/feedback` page lists/manages reports.

**Tech Stack:** React 19, Vite 8, React Router 7, Supabase (Postgres + Storage), Vitest, `html2canvas` (new dependency).

## Global Constraints

- **Dev server:** port 5173, `strictPort` (see `vite.config.js`). Run with `NODE_OPTIONS=--use-system-ca npm run dev`. Never blanket-kill node — other workspaces run concurrently.
- **Tests:** `NODE_OPTIONS=--use-system-ca npm test` (Vitest). 51 currently green; keep them green.
- **RLS:** every table is owner-scoped — `user_id uuid not null references auth.users(id) default auth.uid()`, policies `auth.uid() = user_id`. Mirror `supabase/migrations/0005_owner_rls.sql` exactly. App inserts need no `user_id` (the default supplies it).
- **Migrations:** numbered `supabase/migrations/NNNN_*.sql`, idempotent (`create table if not exists`, `on conflict do nothing`). Next number is `0011`. Apply live via the Supabase MCP `apply_migration`.
- **Form helper:** pages map `'' → null` via a local `clean()` before insert/update (see `src/pages/Dtc.jsx`). Reuse that convention.
- **Capture must never break the app:** every breadcrumb/instrument code path is wrapped so it cannot throw into real app code; the Supabase fetch wrapper must always return the real response.
- **Nav:** desktop-only nav items use `desktopOnly: true` in `src/components/Layout.jsx` `NAV_ITEMS` so the mobile bottom bar stays uncluttered.
- **TLS/env note:** `NODE_OPTIONS=--use-system-ca` required for npm/node on this machine.

---

## File Structure

**Added**
- `supabase/migrations/0011_feedback.sql` — table + Storage bucket + owner policies.
- `src/lib/feedback/breadcrumbs.js` (+ `breadcrumbs.test.js`) — ring buffer + global listeners.
- `src/lib/feedback/instrument.js` (+ `instrument.test.js`) — `makeLoggingFetch`.
- `src/lib/feedback/reports.js` (+ `reports.test.js`) — `buildContext`, `statusPatch`, `submitReport`, `listReports`, `updateReportStatus`.
- `src/components/Feedback/FeedbackButton.jsx` — floating button.
- `src/components/Feedback/FeedbackModal.jsx` — capture modal (screenshot + comment + type + submit).
- `src/pages/Feedback.jsx` — reports list/management page.

**Modified**
- `src/lib/supabase.js` — pass `global.fetch = makeLoggingFetch(fetch)` to `createClient`.
- `src/main.jsx` — call `installGlobalListeners()` once at startup.
- `src/components/Layout.jsx` — mount `<FeedbackButton/>`; record a navigation breadcrumb on route change; add `/feedback` nav item (`desktopOnly`).
- `src/App.jsx` — add `/feedback` route + import.
- `src/index.css` — styles for floating button + modal.
- `vite.config.js` — `define` an app-version/commit string for context.
- `package.json` — add `html2canvas`.

---

## Task 1: Database migration (table + Storage bucket + policies)

**Files:**
- Create: `supabase/migrations/0011_feedback.sql`

**Interfaces:**
- Produces: table `public.feedback_reports` (columns per spec §3) and private Storage bucket `feedback-screenshots` with owner-folder policies. Later tasks insert rows and upload to `{user_id}/{report_id}.png`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0011_feedback.sql`:

```sql
-- 0011_feedback.sql — in-app feedback & capture reports.
--
-- One row per bug/error/idea captured from the floating in-app widget: a typed
-- comment, a frozen breadcrumb trail (jsonb), a context snapshot (jsonb), and a
-- pointer to a screenshot stored in the private `feedback-screenshots` bucket.
-- Owner-scoped RLS (0005 pattern). Idempotent. Apply live via MCP.

create table if not exists public.feedback_reports (
  id              uuid primary key default gen_random_uuid(),
  type            text not null default 'bug'
                    check (type in ('bug','error','idea')),
  status          text not null default 'open'
                    check (status in ('open','in_progress','resolved')),
  comment         text,
  screenshot_path text,
  breadcrumbs     jsonb not null default '[]'::jsonb,
  context         jsonb not null default '{}'::jsonb,
  page_url        text,
  user_id         uuid not null references auth.users(id) default auth.uid(),
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz
);
create index if not exists feedback_reports_status_idx
  on public.feedback_reports (status, created_at desc);

alter table public.feedback_reports enable row level security;

-- Owner-scoped policies (drop-then-create so the migration is re-runnable).
drop policy if exists "owner read feedback"   on public.feedback_reports;
drop policy if exists "owner insert feedback" on public.feedback_reports;
drop policy if exists "owner update feedback" on public.feedback_reports;
drop policy if exists "owner delete feedback" on public.feedback_reports;
create policy "owner read feedback"   on public.feedback_reports for select using (auth.uid() = user_id);
create policy "owner insert feedback" on public.feedback_reports for insert with check (auth.uid() = user_id);
create policy "owner update feedback" on public.feedback_reports for update using (auth.uid() = user_id);
create policy "owner delete feedback" on public.feedback_reports for delete using (auth.uid() = user_id);

-- Private screenshot bucket; objects keyed by `{user_id}/{report_id}.png`.
insert into storage.buckets (id, name, public)
values ('feedback-screenshots', 'feedback-screenshots', false)
on conflict (id) do nothing;

-- Storage policies: a user may only touch objects under their own uid folder.
drop policy if exists "owner read feedback shots"   on storage.objects;
drop policy if exists "owner write feedback shots"  on storage.objects;
drop policy if exists "owner update feedback shots" on storage.objects;
drop policy if exists "owner delete feedback shots" on storage.objects;
create policy "owner read feedback shots" on storage.objects for select
  using (bucket_id = 'feedback-screenshots' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owner write feedback shots" on storage.objects for insert
  with check (bucket_id = 'feedback-screenshots' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owner update feedback shots" on storage.objects for update
  using (bucket_id = 'feedback-screenshots' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owner delete feedback shots" on storage.objects for delete
  using (bucket_id = 'feedback-screenshots' and (storage.foldername(name))[1] = auth.uid()::text);
```

- [ ] **Step 2: Apply the migration live**

Use the Supabase MCP `apply_migration` with name `0011_feedback` and the SQL above (the MCP connector must be signed into the **Stallion Pit** org, project ref `mwakgpzcqoalxtvqucki`). Expected: success, no error.

- [ ] **Step 3: Verify the table and bucket exist**

Use the Supabase MCP `list_tables` → expect `feedback_reports` present. Run `execute_sql`: `select id, public from storage.buckets where id = 'feedback-screenshots';` → expect one row, `public = false`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0011_feedback.sql
git commit -m "feat(feedback): migration 0011 — feedback_reports table + screenshot bucket"
```

---

## Task 2: Breadcrumb ring buffer + global listeners

**Files:**
- Create: `src/lib/feedback/breadcrumbs.js`
- Test: `src/lib/feedback/breadcrumbs.test.js`

**Interfaces:**
- Produces:
  - `record(event: object): void` — push an event; appends `t` (ISO timestamp); never throws; caps buffer at `MAX = 50`, dropping oldest.
  - `snapshot(): object[]` — independent deep-ish copy of current buffer (callers may mutate freely).
  - `clear(): void` — empty the buffer.
  - `installGlobalListeners(): void` — idempotent; patches `console.error`/`console.warn`, `window` `error`/`unhandledrejection`, and a capture-phase `document` click listener that records the nearest button/link label. Safe to call once at startup.
- Consumes: nothing.

- [ ] **Step 1: Write the failing test**

Create `src/lib/feedback/breadcrumbs.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { record, snapshot, clear } from './breadcrumbs'

describe('breadcrumbs ring buffer', () => {
  beforeEach(() => clear())

  it('records events and stamps a timestamp', () => {
    record({ kind: 'nav', route: '/fuel' })
    const snap = snapshot()
    expect(snap).toHaveLength(1)
    expect(snap[0].kind).toBe('nav')
    expect(snap[0].route).toBe('/fuel')
    expect(typeof snap[0].t).toBe('string')
  })

  it('caps at 50 events, dropping the oldest', () => {
    for (let i = 0; i < 60; i++) record({ kind: 'nav', n: i })
    const snap = snapshot()
    expect(snap).toHaveLength(50)
    expect(snap[0].n).toBe(10)   // 0..9 dropped
    expect(snap[49].n).toBe(59)
  })

  it('snapshot returns an independent copy', () => {
    record({ kind: 'nav', n: 1 })
    const snap = snapshot()
    snap[0].n = 999
    expect(snapshot()[0].n).toBe(1)
  })

  it('never throws on bad input', () => {
    expect(() => record(null)).not.toThrow()
    expect(() => record(undefined)).not.toThrow()
    expect(() => record('nope')).not.toThrow()
  })

  it('clear empties the buffer', () => {
    record({ kind: 'nav' })
    clear()
    expect(snapshot()).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `NODE_OPTIONS=--use-system-ca npx vitest run src/lib/feedback/breadcrumbs.test.js`
Expected: FAIL — cannot resolve `./breadcrumbs`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/feedback/breadcrumbs.js`:

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `NODE_OPTIONS=--use-system-ca npx vitest run src/lib/feedback/breadcrumbs.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/feedback/breadcrumbs.js src/lib/feedback/breadcrumbs.test.js
git commit -m "feat(feedback): breadcrumb ring buffer + global listeners"
```

---

## Task 3: Supabase fetch-layer instrumentation

**Files:**
- Create: `src/lib/feedback/instrument.js`
- Test: `src/lib/feedback/instrument.test.js`

**Interfaces:**
- Consumes: `record` from `./breadcrumbs`.
- Produces: `makeLoggingFetch(baseFetch): fetch` — returns a `fetch`-compatible function that, for PostgREST requests (`/rest/v1/<table>`), records a `{ kind:'supabase', table, op, status, ok, error? }` breadcrumb and always returns/throws exactly what `baseFetch` did. Non-REST requests pass straight through with no breadcrumb. `op` maps `GET→select, POST→insert, PATCH→update, DELETE→delete`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/feedback/instrument.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { makeLoggingFetch } from './instrument'
import { snapshot, clear } from './breadcrumbs'

const REST = 'https://x.supabase.co/rest/v1/fuel_logs?select=*'

function fakeResponse({ ok = true, status = 200, body = {} } = {}) {
  return {
    ok,
    status,
    clone() {
      return { json: async () => body }
    },
  }
}

describe('makeLoggingFetch', () => {
  beforeEach(() => clear())

  it('records a supabase breadcrumb for a successful REST select', async () => {
    const f = makeLoggingFetch(async () => fakeResponse({ status: 200 }))
    await f(REST, { method: 'GET' })
    const snap = snapshot()
    expect(snap).toHaveLength(1)
    expect(snap[0]).toMatchObject({ kind: 'supabase', table: 'fuel_logs', op: 'select', status: 200, ok: true })
  })

  it('maps HTTP methods to operations', async () => {
    const f = makeLoggingFetch(async () => fakeResponse())
    await f('https://x.supabase.co/rest/v1/snags', { method: 'POST' })
    expect(snapshot()[0].op).toBe('insert')
  })

  it('captures the error message on a failed REST call', async () => {
    const f = makeLoggingFetch(async () => fakeResponse({ ok: false, status: 403, body: { message: 'permission denied' } }))
    await f(REST, { method: 'GET' })
    expect(snapshot()[0]).toMatchObject({ ok: false, status: 403, error: 'permission denied' })
  })

  it('records an error breadcrumb when the network throws, then rethrows', async () => {
    const boom = new Error('network down')
    const f = makeLoggingFetch(async () => { throw boom })
    await expect(f(REST, { method: 'GET' })).rejects.toThrow('network down')
    expect(snapshot()[0]).toMatchObject({ kind: 'supabase', table: 'fuel_logs', ok: false, error: 'network down' })
  })

  it('ignores non-REST requests (e.g. auth/storage)', async () => {
    const f = makeLoggingFetch(async () => fakeResponse())
    await f('https://x.supabase.co/auth/v1/token', { method: 'POST' })
    expect(snapshot()).toHaveLength(0)
  })

  it('returns the real response unchanged', async () => {
    const res = fakeResponse({ status: 201 })
    const f = makeLoggingFetch(async () => res)
    const out = await f(REST, { method: 'GET' })
    expect(out).toBe(res)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `NODE_OPTIONS=--use-system-ca npx vitest run src/lib/feedback/instrument.test.js`
Expected: FAIL — cannot resolve `./instrument`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/feedback/instrument.js`:

```js
// Wrap the global fetch so every Supabase PostgREST request leaves a breadcrumb.
// Instrumenting at the fetch layer (rather than proxying the query builder) keeps
// the fluent `.from().select().eq()` chain untouched and captures HTTP errors.

import { record } from './breadcrumbs'

const REST_RE = /\/rest\/v1\/([^?/]+)/
const METHOD_OP = { GET: 'select', POST: 'insert', PATCH: 'update', PUT: 'upsert', DELETE: 'delete' }

export function makeLoggingFetch(baseFetch) {
  return async function loggingFetch(input, init = {}) {
    const url = typeof input === 'string' ? input : input?.url || ''
    const method = (init.method || (typeof input !== 'string' && input?.method) || 'GET').toUpperCase()
    const match = REST_RE.exec(url)
    const table = match ? safeDecode(match[1]) : null
    const op = METHOD_OP[method] || method

    let res
    try {
      res = await baseFetch(input, init)
    } catch (err) {
      if (table) record({ kind: 'supabase', table, op, ok: false, error: String(err?.message || err) })
      throw err
    }

    if (table) {
      const entry = { kind: 'supabase', table, op, status: res.status, ok: res.ok }
      if (!res.ok) entry.error = await readError(res)
      record(entry)
    }
    return res
  }
}

async function readError(res) {
  try {
    const body = await res.clone().json()
    return body?.message || body?.error || body?.hint || `HTTP ${res.status}`
  } catch {
    return `HTTP ${res.status}`
  }
}

function safeDecode(s) {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `NODE_OPTIONS=--use-system-ca npx vitest run src/lib/feedback/instrument.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/feedback/instrument.js src/lib/feedback/instrument.test.js
git commit -m "feat(feedback): fetch-layer Supabase breadcrumb instrumentation"
```

---

## Task 4: Wire instrumentation into the app

**Files:**
- Modify: `src/lib/supabase.js`
- Modify: `src/main.jsx`
- Modify: `src/components/Layout.jsx` (navigation breadcrumb only; button comes in Task 6)
- Modify: `vite.config.js` (app-version define)

**Interfaces:**
- Consumes: `makeLoggingFetch` (Task 3), `installGlobalListeners`, `record` (Task 2).
- Produces: a live instrumented `supabase` client; `__APP_VERSION__` global string available to app code; navigation breadcrumbs on every route change.

- [ ] **Step 1: Instrument the Supabase client**

Replace the contents of `src/lib/supabase.js` with:

```js
import { createClient } from '@supabase/supabase-js'
import { makeLoggingFetch } from './feedback/instrument'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: makeLoggingFetch((...args) => fetch(...args)) },
})
```

- [ ] **Step 2: Install global listeners at startup**

In `src/main.jsx`, add the import and the call before `createRoot(...)`. Add near the top imports:

```js
import { installGlobalListeners } from './lib/feedback/breadcrumbs'
```

Then immediately before the `createRoot` / `ReactDOM` render call, add:

```js
installGlobalListeners()
```

- [ ] **Step 3: Add the app-version define to vite.config.js**

In `vite.config.js`, inside the `defineConfig({ ... })` object add a `define` key that exposes the short git commit (falling back to `'dev'` if git is unavailable). At the top of the file add:

```js
import { execSync } from 'node:child_process'

function gitCommit() {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'dev'
  }
}
```

Then add to the config object passed to `defineConfig`:

```js
  define: {
    __APP_VERSION__: JSON.stringify(gitCommit()),
  },
```

(Keep the existing `server: { port: 5173, strictPort: true }` and `plugins` entries intact.)

- [ ] **Step 4: Record a navigation breadcrumb on route change**

In `src/components/Layout.jsx`, add to the imports:

```js
import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { record } from '../lib/feedback/breadcrumbs'
```

(Merge `useEffect` into the existing `react` import and `useLocation` into the existing `react-router-dom` import rather than duplicating.) Then inside the `Layout` component body, after the existing hooks (`useAuth`, `useNavigate`, `useState`), add:

```js
  const location = useLocation()
  useEffect(() => {
    record({ kind: 'nav', route: location.pathname })
  }, [location.pathname])
```

- [ ] **Step 5: Verify the app still builds and tests pass**

Run: `NODE_OPTIONS=--use-system-ca npm test`
Expected: all tests PASS (51 prior + 11 new = 62).

Run: `NODE_OPTIONS=--use-system-ca npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/supabase.js src/main.jsx src/components/Layout.jsx vite.config.js
git commit -m "feat(feedback): instrument supabase client + nav/global breadcrumbs"
```

---

## Task 5: Report store (context, status, submit/list/update)

**Files:**
- Create: `src/lib/feedback/reports.js`
- Test: `src/lib/feedback/reports.test.js`

**Interfaces:**
- Consumes: `supabase` from `../supabase`; `snapshot` from `./breadcrumbs`.
- Produces:
  - `buildContext({ user, activeVehicle, href, route, viewport, appVersion }): object` — pure; returns `{ url, route, vehicle_id, vehicle_name, user_email, viewport, app_version }`.
  - `statusPatch(status, now?): { status, resolved_at }` — pure; `resolved_at` = `now()` when `status === 'resolved'`, else `null`. `now` defaults to a function returning an ISO string.
  - `submitReport({ type, comment, screenshotBlob, userId, context, breadcrumbs, client? }): Promise<{ error: string|null }>` — generates a uuid, uploads the screenshot (if any) to `feedback-screenshots/{userId}/{id}.png`, inserts the row.
  - `listReports(filter, client?): Promise<{ data, error }>` — filter is `'open'|'in_progress'|'resolved'|'all'`.
  - `updateReportStatus(id, status, client?): Promise<{ error }>`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/feedback/reports.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { buildContext, statusPatch } from './reports'

describe('buildContext', () => {
  it('shapes the context snapshot from injected values', () => {
    const ctx = buildContext({
      user: { email: 'a@b.com' },
      activeVehicle: { id: 'v1', name: 'Polo' },
      href: 'http://localhost:5173/fuel',
      route: '/fuel',
      viewport: { w: 1280, h: 800 },
      appVersion: 'abc1234',
    })
    expect(ctx).toEqual({
      url: 'http://localhost:5173/fuel',
      route: '/fuel',
      vehicle_id: 'v1',
      vehicle_name: 'Polo',
      user_email: 'a@b.com',
      viewport: { w: 1280, h: 800 },
      app_version: 'abc1234',
    })
  })

  it('tolerates missing user/vehicle', () => {
    const ctx = buildContext({ user: null, activeVehicle: null, href: '/', route: '/', viewport: { w: 0, h: 0 } })
    expect(ctx.vehicle_id).toBeNull()
    expect(ctx.vehicle_name).toBeNull()
    expect(ctx.user_email).toBeNull()
    expect(ctx.app_version).toBe('dev')
  })
})

describe('statusPatch', () => {
  const now = () => '2026-06-18T00:00:00.000Z'
  it('sets resolved_at when resolving', () => {
    expect(statusPatch('resolved', now)).toEqual({ status: 'resolved', resolved_at: '2026-06-18T00:00:00.000Z' })
  })
  it('clears resolved_at for non-resolved statuses', () => {
    expect(statusPatch('open', now)).toEqual({ status: 'open', resolved_at: null })
    expect(statusPatch('in_progress', now)).toEqual({ status: 'in_progress', resolved_at: null })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `NODE_OPTIONS=--use-system-ca npx vitest run src/lib/feedback/reports.test.js`
Expected: FAIL — cannot resolve `./reports`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/feedback/reports.js`:

```js
import { supabase } from '../supabase'

const BUCKET = 'feedback-screenshots'

export function buildContext({ user, activeVehicle, href, route, viewport, appVersion }) {
  return {
    url: href ?? null,
    route: route ?? null,
    vehicle_id: activeVehicle?.id ?? null,
    vehicle_name: activeVehicle?.name ?? null,
    user_email: user?.email ?? null,
    viewport: viewport ?? null,
    app_version: appVersion ?? 'dev',
  }
}

export function statusPatch(status, now = () => new Date().toISOString()) {
  return { status, resolved_at: status === 'resolved' ? now() : null }
}

export async function submitReport({ type, comment, screenshotBlob, userId, context, breadcrumbs, client = supabase }) {
  const id = crypto.randomUUID()
  let screenshot_path = null

  if (screenshotBlob && userId) {
    const path = `${userId}/${id}.png`
    const { error: upErr } = await client.storage
      .from(BUCKET)
      .upload(path, screenshotBlob, { contentType: 'image/png', upsert: true })
    if (!upErr) screenshot_path = path
    // a failed screenshot upload is non-fatal: still save the report
  }

  const { error } = await client.from('feedback_reports').insert([
    {
      id,
      type,
      comment: comment || null,
      screenshot_path,
      breadcrumbs: breadcrumbs ?? [],
      context: context ?? {},
      page_url: context?.url ?? null,
    },
  ])
  return { error: error ? error.message : null }
}

export async function listReports(filter = 'open', client = supabase) {
  let q = client.from('feedback_reports').select('*').order('created_at', { ascending: false })
  if (filter !== 'all') q = q.eq('status', filter)
  return q
}

export async function updateReportStatus(id, status, client = supabase) {
  const { error } = await client.from('feedback_reports').update(statusPatch(status)).eq('id', id)
  return { error: error ? error.message : null }
}

// Convenience: build the screenshot's signed display URL for the reports page.
export async function screenshotUrl(path, client = supabase) {
  if (!path) return null
  const { data } = await client.storage.from(BUCKET).createSignedUrl(path, 3600)
  return data?.signedUrl ?? null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `NODE_OPTIONS=--use-system-ca npx vitest run src/lib/feedback/reports.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/feedback/reports.js src/lib/feedback/reports.test.js
git commit -m "feat(feedback): report store — context, status, submit/list/update"
```

---

## Task 6: Feedback widget (floating button + capture modal)

**Files:**
- Create: `src/components/Feedback/FeedbackButton.jsx`
- Create: `src/components/Feedback/FeedbackModal.jsx`
- Modify: `src/components/Layout.jsx` (mount the button)
- Modify: `src/index.css` (styles)
- Modify: `package.json` (add `html2canvas`)

**Interfaces:**
- Consumes: `snapshot` (Task 2), `buildContext`, `submitReport` (Task 5), `useAuth`, `useVehicle`, `useLocation`.
- Produces: `<FeedbackButton/>` — a floating button that opens `<FeedbackModal/>`; the modal captures a screenshot via `html2canvas`, freezes breadcrumbs, collects type + comment, and calls `submitReport`.

- [ ] **Step 1: Install html2canvas**

Run: `NODE_OPTIONS=--use-system-ca npm install html2canvas`
Expected: adds `html2canvas` to `package.json` dependencies, no errors.

- [ ] **Step 2: Write the capture modal**

Create `src/components/Feedback/FeedbackModal.jsx`:

```js
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useVehicle } from '../../contexts/VehicleContext'
import { useLocation } from 'react-router-dom'
import { snapshot } from '../../lib/feedback/breadcrumbs'
import { buildContext, submitReport } from '../../lib/feedback/reports'

const TYPES = [
  { key: 'bug', label: '🐞 Bug' },
  { key: 'error', label: '❗ Error' },
  { key: 'idea', label: '💡 Idea' },
]

export default function FeedbackModal({ onClose }) {
  const { user } = useAuth()
  const { activeVehicle } = useVehicle()
  const location = useLocation()

  const [type, setType] = useState('bug')
  const [comment, setComment] = useState('')
  const [preview, setPreview] = useState(null)   // data URL
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)

  // Frozen at open time so the report reflects "what I was just doing".
  const frozen = useRef({ breadcrumbs: snapshot(), blob: null })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { default: html2canvas } = await import('html2canvas')
        const canvas = await html2canvas(document.body, { logging: false, useCORS: true })
        if (cancelled) return
        setPreview(canvas.toDataURL('image/png'))
        canvas.toBlob((b) => { frozen.current.blob = b }, 'image/png')
      } catch {
        // screenshot is best-effort; report can still be submitted without one
        if (!cancelled) setPreview(null)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const context = buildContext({
      user,
      activeVehicle,
      href: window.location.href,
      route: location.pathname,
      viewport: { w: window.innerWidth, h: window.innerHeight },
      appVersion: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev',
    })
    const { error: err } = await submitReport({
      type,
      comment,
      screenshotBlob: frozen.current.blob,
      userId: user?.id,
      context,
      breadcrumbs: frozen.current.breadcrumbs,
    })
    setSaving(false)
    if (err) { setError(err); return }
    setDone(true)
    setTimeout(onClose, 900)
  }

  return (
    <div className="fb-overlay" onClick={onClose}>
      <div className="fb-modal" onClick={(e) => e.stopPropagation()}>
        <div className="fb-modal-header">
          <h3>Report feedback</h3>
          <button className="fb-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {done ? (
          <div className="fb-done">✓ Report saved</div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="fb-types">
              {TYPES.map((t) => (
                <button
                  type="button"
                  key={t.key}
                  className={`fb-type ${type === t.key ? 'fb-type-active' : ''}`}
                  onClick={() => setType(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <label className="fb-label">What happened / your idea</label>
            <textarea
              className="fb-comment"
              rows={4}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Describe the bug, error, or idea…"
              autoFocus
            />

            <div className="fb-preview">
              {preview
                ? <img src={preview} alt="screenshot preview" />
                : <span className="fb-preview-empty">Capturing screenshot…</span>}
            </div>

            {error && <div className="form-error">{error}</div>}

            <div className="form-actions">
              <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
              <button type="submit" className="btn-primary" style={{ width: 'auto', padding: '10px 28px' }} disabled={saving}>
                {saving ? 'Saving…' : 'Submit'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Write the floating button**

Create `src/components/Feedback/FeedbackButton.jsx`:

```js
import { useState } from 'react'
import FeedbackModal from './FeedbackModal'

export default function FeedbackButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="fb-fab" onClick={() => setOpen(true)} title="Report a bug, error, or idea" aria-label="Report feedback">
        🐞
      </button>
      {open && <FeedbackModal onClose={() => setOpen(false)} />}
    </>
  )
}
```

- [ ] **Step 4: Mount the button in Layout**

In `src/components/Layout.jsx`, add the import:

```js
import FeedbackButton from './Feedback/FeedbackButton'
```

Then render it inside the `app-shell` div, just before the closing `</div>` of `app-shell` (after the mobile bottom nav `</nav>`):

```js
      <FeedbackButton />
```

- [ ] **Step 5: Add styles**

Append to `src/index.css`:

```css
/* --- Feedback widget --- */
.fb-fab {
  position: fixed;
  right: 18px;
  bottom: 80px; /* clear the mobile bottom nav */
  z-index: 1000;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  border: none;
  background: var(--accent, #e67e22);
  color: #fff;
  font-size: 22px;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
}
.fb-fab:hover { filter: brightness(1.08); }
@media (min-width: 900px) {
  .fb-fab { bottom: 24px; right: 24px; }
}
.fb-overlay {
  position: fixed; inset: 0; z-index: 1001;
  background: rgba(0, 0, 0, 0.55);
  display: flex; align-items: center; justify-content: center;
  padding: 16px;
}
.fb-modal {
  background: var(--surface, #1c1f26);
  border: 1px solid var(--border, #2c313c);
  border-radius: 12px;
  width: 100%; max-width: 480px;
  max-height: 90vh; overflow-y: auto;
  padding: 20px;
}
.fb-modal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.fb-modal-header h3 { margin: 0; }
.fb-close { background: none; border: none; color: var(--text-dim, #888); font-size: 24px; cursor: pointer; line-height: 1; }
.fb-types { display: flex; gap: 8px; margin-bottom: 14px; }
.fb-type { flex: 1; padding: 8px; border-radius: 8px; border: 1px solid var(--border, #2c313c); background: transparent; color: var(--text, #eee); cursor: pointer; }
.fb-type-active { background: var(--accent, #e67e22); border-color: var(--accent, #e67e22); color: #fff; }
.fb-label { display: block; font-size: 13px; color: var(--text-dim, #aaa); margin-bottom: 6px; }
.fb-comment { width: 100%; box-sizing: border-box; resize: vertical; margin-bottom: 14px; }
.fb-preview { border: 1px solid var(--border, #2c313c); border-radius: 8px; overflow: hidden; margin-bottom: 14px; min-height: 90px; display: flex; align-items: center; justify-content: center; }
.fb-preview img { width: 100%; display: block; }
.fb-preview-empty { color: var(--text-dim, #888); font-size: 13px; padding: 30px 0; }
.fb-done { padding: 28px; text-align: center; font-size: 16px; color: #2ecc71; }
```

- [ ] **Step 6: Smoke test the widget manually**

Start the dev server (reuse if already on 5173): `NODE_OPTIONS=--use-system-ca npm run dev`. In the browser at http://localhost:5173:
1. Confirm the 🐞 button is visible bottom-right on a page (e.g. Dashboard) and does not overlap the mobile bottom nav at a narrow width.
2. Click it → modal opens, screenshot preview appears within ~1s.
3. Pick **Bug**, type "smoke test report", click **Submit** → "✓ Report saved", modal closes.

Expected: no console errors thrown by the widget itself.

- [ ] **Step 7: Verify the row + screenshot landed**

Via Supabase MCP `execute_sql`: `select id, type, status, comment, screenshot_path, page_url, jsonb_array_length(breadcrumbs) as crumbs from feedback_reports order by created_at desc limit 1;`
Expected: one row, `type = 'bug'`, `comment = 'smoke test report'`, non-null `screenshot_path`, `crumbs > 0`.

- [ ] **Step 8: Commit**

```bash
git add src/components/Feedback src/components/Layout.jsx src/index.css package.json package-lock.json
git commit -m "feat(feedback): floating button + capture modal (html2canvas)"
```

---

## Task 7: Feedback management page

**Files:**
- Create: `src/pages/Feedback.jsx`
- Modify: `src/App.jsx` (route + import)
- Modify: `src/components/Layout.jsx` (`NAV_ITEMS` entry)

**Interfaces:**
- Consumes: `listReports`, `updateReportStatus`, `screenshotUrl` (Task 5).
- Produces: route `/feedback` showing reports with status filter, screenshot, comment, expandable breadcrumbs, and status controls.

- [ ] **Step 1: Write the page**

Create `src/pages/Feedback.jsx`:

```js
import { useState, useEffect, useCallback } from 'react'
import { listReports, updateReportStatus, screenshotUrl } from '../lib/feedback/reports'

const FILTERS = [
  { key: 'open', label: 'Open' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'all', label: 'All' },
]
const TYPE_BADGE = { bug: 'badge-amber', error: 'badge-red', idea: 'badge-green' }
const STATUS_BADGE = { open: 'badge-amber', in_progress: 'badge-gold', resolved: 'badge-green' }
const NEXT_STATUS = { open: 'in_progress', in_progress: 'resolved', resolved: 'open' }
const NEXT_LABEL = { open: 'Start', in_progress: 'Resolve', resolved: 'Reopen' }

export default function Feedback() {
  const [filter, setFilter] = useState('open')
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)
  const [shotUrls, setShotUrls] = useState({})

  const fetchReports = useCallback(async () => {
    setLoading(true)
    const { data } = await listReports(filter)
    setReports(data || [])
    setLoading(false)
  }, [filter])

  useEffect(() => { fetchReports() }, [fetchReports])

  const toggle = async (r) => {
    if (expanded === r.id) { setExpanded(null); return }
    setExpanded(r.id)
    if (r.screenshot_path && !shotUrls[r.id]) {
      const url = await screenshotUrl(r.screenshot_path)
      setShotUrls((p) => ({ ...p, [r.id]: url }))
    }
  }

  const advance = async (r) => {
    await updateReportStatus(r.id, NEXT_STATUS[r.status])
    await fetchReports()
  }

  return (
    <div className="page">
      <div className="page-header"><h2>Feedback</h2><p className="page-sub">bugs, errors & ideas captured in-app</p></div>

      <div className="row-actions" style={{ margin: '16px 0', flexWrap: 'wrap' }}>
        {FILTERS.map((f) => (
          <button key={f.key} className={`row-btn ${filter === f.key ? 'vehicle-tab-active' : ''}`} onClick={() => setFilter(f.key)}>{f.label}</button>
        ))}
      </div>

      {loading ? <div className="placeholder-card"><p>Loading...</p></div>
        : reports.length === 0 ? <div className="placeholder-card"><span>🐞</span><p>No {filter !== 'all' ? filter.replace('_', ' ') + ' ' : ''}reports</p></div>
          : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead><tr><th>When</th><th>Type</th><th>Status</th><th>Comment</th><th></th></tr></thead>
                <tbody>
                  {reports.map((r) => (
                    <>
                      <tr key={r.id} onClick={() => toggle(r)} style={{ cursor: 'pointer' }}>
                        <td className="mono">{r.created_at?.split('T')[0]}</td>
                        <td><span className={`badge ${TYPE_BADGE[r.type] || 'badge'}`}>{r.type}</span></td>
                        <td><span className={`badge ${STATUS_BADGE[r.status] || 'badge'}`}>{r.status.replace('_', ' ')}</span></td>
                        <td className="primary">{r.comment || <span style={{ color: 'var(--text-dim)' }}>—</span>}</td>
                        <td>
                          <button className="row-btn" onClick={(e) => { e.stopPropagation(); advance(r) }}>{NEXT_LABEL[r.status]}</button>
                        </td>
                      </tr>
                      {expanded === r.id && (
                        <tr key={r.id + '-d'}>
                          <td colSpan={5} style={{ background: 'var(--surface-2, #15171d)' }}>
                            <div style={{ padding: '12px 8px', display: 'grid', gap: 12 }}>
                              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                                {r.page_url} · {r.context?.vehicle_name || 'no vehicle'} · v{r.context?.app_version || '—'}
                              </div>
                              {r.screenshot_path && (
                                shotUrls[r.id]
                                  ? <a href={shotUrls[r.id]} target="_blank" rel="noreferrer"><img src={shotUrls[r.id]} alt="screenshot" style={{ maxWidth: '100%', borderRadius: 8, border: '1px solid var(--border)' }} /></a>
                                  : <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>loading screenshot…</span>
                              )}
                              <div>
                                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>Breadcrumbs ({(r.breadcrumbs || []).length})</div>
                                <pre style={{ margin: 0, maxHeight: 240, overflow: 'auto', fontSize: 11, whiteSpace: 'pre-wrap' }}>
                                  {(r.breadcrumbs || []).map((b, i) => `${b.t?.split('T')[1]?.replace('Z', '') || ''}  ${b.kind}  ${b.route || b.label || (b.table ? b.table + ' ' + b.op + (b.error ? ' ✗ ' + b.error : '') : '') || b.message || ''}`).join('\n')}
                                </pre>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
    </div>
  )
}
```

- [ ] **Step 2: Add the route**

In `src/App.jsx`, add the import alongside the other page imports:

```js
import Feedback from './pages/Feedback'
```

Then add the route inside the nested `<Route path="/" ...>` block, after the `analysis` route:

```js
        <Route path="feedback" element={<Feedback />} />
```

- [ ] **Step 3: Add the nav item**

In `src/components/Layout.jsx`, add to `NAV_ITEMS` (after the `analysis` entry):

```js
  { path: '/feedback',    label: 'Feedback',  short: 'Bugs',     icon: '🐞', desktopOnly: true },
```

- [ ] **Step 4: Verify build + tests**

Run: `NODE_OPTIONS=--use-system-ca npm test`
Expected: all PASS (62).

Run: `NODE_OPTIONS=--use-system-ca npm run build`
Expected: build succeeds.

- [ ] **Step 5: Smoke test the page**

With the dev server running, navigate to `/feedback` (sidebar "Feedback"):
1. The "smoke test report" from Task 6 appears under the **Open** filter.
2. Click the row → it expands showing the screenshot + breadcrumb trail (including the nav + the click + the insert into `feedback_reports`).
3. Click **Start** → status → in progress (row leaves the Open filter; appears under In Progress).
4. Click **Resolve** under In Progress → moves to Resolved.

Expected: status changes persist (re-filter to confirm).

- [ ] **Step 6: Commit**

```bash
git add src/pages/Feedback.jsx src/App.jsx src/components/Layout.jsx
git commit -m "feat(feedback): /feedback management page + nav + route"
```

---

## Task 8: Final verification

- [ ] **Step 1: Full test suite**

Run: `NODE_OPTIONS=--use-system-ca npm test`
Expected: all PASS (62 = 51 prior + 5 breadcrumbs + 6 instrument + 4 reports... note: 51+15=66 if counting each new `it`; the exact number is whatever Vitest reports — the requirement is zero failures).

- [ ] **Step 2: Production build**

Run: `NODE_OPTIONS=--use-system-ca npm run build`
Expected: succeeds, no errors.

- [ ] **Step 3: Lint (non-blocking)**

Run: `NODE_OPTIONS=--use-system-ca npm run lint`
Expected: no *new* error categories beyond the known pre-existing `react-hooks/set-state-in-effect` warnings (the `fetchReports` effect in `Feedback.jsx` will add one more of that same known category — acceptable, matches every other CRUD page).

- [ ] **Step 4: Read back a report via MCP (the payoff)**

Via Supabase MCP `execute_sql`, read the latest report's `comment`, `breadcrumbs`, and `context` and confirm the breadcrumb trail tells the story of what was done before submitting. This is the end-to-end proof that "Claude can read my reports."

- [ ] **Step 5: Update project memory**

Append to `C:\Users\Chris\.claude\projects\d--stallion-pit\memory\project-stallion-pit.md` a short note that the feedback/capture system is built (migration 0011, `src/lib/feedback/*`, `/feedback` page) and add an index line in `MEMORY.md`.

---

## Self-Review notes

- **Spec coverage:** §2 four-piece architecture → Tasks 2/3/5/6+7. §3 data model → Task 1. §4 breadcrumb capture → Task 2 (+ Task 3 supabase, Task 4 nav). §5 data flow → Tasks 6/7. §6 screenshot → Task 6. §7 error handling → wrapped throughout (breadcrumbs try/catch, non-fatal screenshot, inline submit error). §8 testing → Tasks 2/3/5 Vitest + manual smoke in 6/7. All §9 files accounted for.
- **Design deviation (improvement):** spec §2 said "wrap the supabase client"; this plan instruments at the `fetch` layer instead (`makeLoggingFetch` passed to `createClient`), which is lower-risk and more testable while achieving the identical breadcrumb outcome. Noted here intentionally.
- **Types consistent:** `record/snapshot/clear/installGlobalListeners`, `makeLoggingFetch`, `buildContext/statusPatch/submitReport/listReports/updateReportStatus/screenshotUrl` referenced identically across tasks.
```
