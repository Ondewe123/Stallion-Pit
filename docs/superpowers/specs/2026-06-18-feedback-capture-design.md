# In-App Feedback & Capture System — Design Spec

**Date:** 2026-06-18
**Status:** Approved, ready for implementation plan
**Module:** Cross-cutting (T0 tooling) — not a vehicle data module

---

## 1. Purpose

A one-click, in-app way to capture a bug, error, or idea from any page. The user
clicks a floating button; the system grabs a screenshot of the current page,
freezes a rolling breadcrumb log of what they were just doing, and bundles that
with a typed comment into a persisted report. Reports land in Supabase so they
survive sessions, are listed in-app as a lightweight issue tracker, and can be
read by Claude on demand via the Supabase MCP connector — making
debugging/development fast because the screenshot + action log + comment tell the
whole story without back-and-forth.

### Architectural reality
Stallion Pit is a **pure client-side SPA** (React 19 · Vite 8 · React Router 7 ·
Supabase). There is **no custom backend server** that could log "what the user was
trying to do." Therefore the log is captured **client-side**: the app instruments
itself in the browser, keeping a rolling breadcrumb trail (navigation, Supabase
calls + errors, console errors, key button clicks) that is frozen at the moment
the report is submitted. Same end result the user wants, captured in the browser.

---

## 2. Architecture overview

Four pieces, each with one job:

1. **Breadcrumb recorder** — `src/lib/feedback/breadcrumbs.js`
   In-memory ring buffer (last ~50 events). Always running. Records navigation,
   Supabase calls/errors, console errors, button clicks. Pure module, no React.
   Every public function is wrapped so a broken breadcrumb never throws into app code.

2. **Supabase instrumentation** — `src/lib/feedback/instrument.js`
   Wraps the existing `supabase` client so every query auto-logs a breadcrumb
   (table, op, error) without changing any of the 12 pages. Always calls through
   to the real client even if logging fails.

3. **Feedback widget** — `src/components/Feedback/*`
   The floating button + capture modal (screenshot preview, comment box, type
   picker, submit). Mounted once in `Layout.jsx`. Shows on every page including
   mobile, positioned to clear the mobile bottom nav.

4. **Report store** — `src/lib/feedback/reports.js`
   Screenshot upload to Supabase Storage + row insert; reading/updating reports
   for the in-app list; context-snapshot builder; status→`resolved_at` logic.

---

## 3. Data model (Supabase)

New migration `0011_feedback.sql`.

### Table `feedback_reports` (owner-RLS, `user_id uuid default auth.uid()`)

| column | type | notes |
|---|---|---|
| `id` | uuid pk default gen_random_uuid() | |
| `user_id` | uuid default auth.uid() | RLS owner column |
| `type` | text | `'bug' \| 'error' \| 'idea'` (check constraint) |
| `status` | text default `'open'` | `'open' \| 'in_progress' \| 'resolved'` (check constraint) |
| `comment` | text | user's typed description |
| `screenshot_path` | text | path in Storage bucket; **nullable** (capture can fail) |
| `breadcrumbs` | jsonb | the frozen event trail |
| `context` | jsonb | url, route, active vehicle id+name, user email, viewport, app version/git commit |
| `page_url` | text | denormalized from context for quick glance |
| `created_at` | timestamptz default now() | |
| `resolved_at` | timestamptz | nullable; set when status→resolved |

RLS policies: `auth.uid() = user_id` for select/insert/update/delete — identical
to the established pattern in `0005_owner_rls.sql`.

### Storage bucket `feedback-screenshots`
- Private bucket, owner-scoped policies.
- Object path: `{user_id}/{report_id}.png`.

`breadcrumbs` and `context` as `jsonb` means a single-row read tells the whole
story — no joins — when Claude reads via MCP.

---

## 4. Breadcrumb capture

Rolling buffer, last ~50 events, oldest dropped, frozen (deep-copied) at submit.

Captured event kinds:
- **Navigation** — each route visited, with timestamp.
- **Supabase calls** — table + operation (select/insert/update/delete) and, crucially,
  **any error returned** (DB error message + code).
- **Console errors & warnings** — app-logged errors plus uncaught exceptions.
- **Button/link clicks** — control label only (e.g. "clicked Close Work Order").

### Privacy
- **Never capture text typed into form fields.** Buttons/links only.
- Context includes user email (single-owner app) but no field input values.

---

## 5. Data flow — on click

1. User clicks the floating **🐞 button** → modal opens.
2. `html2canvas` snapshots the page → shown as a thumbnail preview in the modal.
3. Breadcrumb buffer is **frozen** (copied) at this instant; context snapshot taken.
4. User picks **Type** (Bug/Error/Idea), types a **comment**, hits **Submit**.
5. Screenshot uploads to Storage → row inserts into `feedback_reports` with the
   frozen breadcrumbs + context.
6. Toast: "Report saved." Modal closes.
7. **Feedback page** (`/feedback`, `desktopOnly` nav like Templates/DTC) lists
   reports — filter Open/In Progress/Resolved/All, view screenshot + comment +
   expandable breadcrumb trail, change status.

When the user says "look at my latest report," Claude queries `feedback_reports`
via the Supabase MCP, reads comment + breadcrumbs + context, and views the
screenshot from Storage.

---

## 6. Screenshot capture

- **`html2canvas`** (new dependency) — re-renders the current page to an image.
  One click, no browser permission prompt.
- Known limitation: occasionally imperfect CSS rendering (some shadows/fonts);
  cannot capture outside the app (no dev-tools). Acceptable for one-click UX.
- Output: PNG blob → uploaded to Storage.

---

## 7. Error handling & resilience

The capture system must **never break the app or block the user** — it fails quietly:

- **Screenshot fails** (`html2canvas` throws) → report still submits with
  `screenshot_path = null` and a breadcrumb noting the failure. Comment + log kept.
- **Upload or insert fails** (offline, RLS, network) → modal shows inline error and
  keeps the typed comment for retry; nothing lost.
- **Breadcrumb recorder errors** → wrapped in try/catch everywhere; a broken
  breadcrumb never throws into real app code. Supabase wrapper always calls through.
- **Buffer is bounded** (~50 events) so memory can't grow unbounded in a long session.

---

## 8. Testing

Pure-logic units get Vitest tests (matching `src/lib/calc/*.test.js`):

- **`breadcrumbs.test.js`** — ring buffer caps at 50, drops oldest, freeze returns
  an independent copy, never throws on bad input.
- **`reports.test.js`** — context-snapshot builder produces the right shape;
  status→`resolved_at` transition logic.

The React widget and Supabase wrapper are verified by **manual smoke test**
(click button → submit → see row + screenshot → appears in `/feedback` list),
since they are I/O-bound — consistent with how other modules were smoke-tested.

---

## 9. Files touched / added

**Added**
- `supabase/migrations/0011_feedback.sql`
- `src/lib/feedback/breadcrumbs.js` (+ `.test.js`)
- `src/lib/feedback/instrument.js`
- `src/lib/feedback/reports.js` (+ `.test.js`)
- `src/components/Feedback/FeedbackButton.jsx`
- `src/components/Feedback/FeedbackModal.jsx`
- `src/pages/Feedback.jsx`

**Modified**
- `src/lib/supabase.js` — apply instrumentation wrapper to exported client.
- `src/components/Layout.jsx` — mount the floating button; add `/feedback` nav item (`desktopOnly`).
- `src/App.jsx` — add `/feedback` route.
- `package.json` — add `html2canvas` dependency.

---

## 10. Out of scope (YAGNI)

- No severity/priority field (Type + Status is enough for a solo tracker).
- No assignees, comments threads, or notifications.
- No analytics/aggregation over reports.
- No native screen-capture API (permission prompt every time defeats one-click).
- No server-side log shipping (no backend exists).
