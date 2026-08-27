# Feedback Audit and Backlog Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every unresolved feedback report an evidence-backed disposition, close stale completed items safely, and leave genuine bugs and features in clearly assigned workstreams.

**Architecture:** Extend the existing `feedback_reports` row with additive triage metadata, centralize resolution-patch rules in `src/lib/feedback/reports.js`, and add an evidence form to the existing Feedback page. A versioned audit ledger maps the 20-report snapshot to production verification steps; audit execution updates reports only through the authenticated app and produces Release 1+ follow-up plans for genuine work.

**Tech Stack:** React 19, Vite 8, Vitest 3, Supabase JavaScript 2.106, PostgreSQL/RLS, Supabase CLI, Vercel production deployment.

**Spec:** `docs/superpowers/specs/2026-08-27-feedback-backlog-resolution-design.md`

## Global Constraints

- Audit the deployed app before changing the status of any real report.
- Preserve original report comments, screenshots, breadcrumbs, page URLs, and timestamps.
- Do not delete non-test reports.
- Use only these terminal outcomes: verified resolved, duplicate, cannot reproduce, or assigned feature plan.
- `resolution_note` is mandatory for any terminal outcome.
- A duplicate must reference an existing canonical report owned by the signed-in user.
- No production schema change is applied until tests, lint, build, and migration review pass locally.
- Never expose `SUPABASE_SERVICE_ROLE_KEY` in browser code, logs, screenshots, or committed files.
- Keep `feedback_reports` owner-scoped with `TO authenticated`, `USING ((select auth.uid()) = user_id)`, and `WITH CHECK ((select auth.uid()) = user_id)` for updates.
- Explicitly grant only the existing application operations required by `authenticated`; do not grant feedback-table access to `anon`.
- Use Africa/Nairobi when recording human-readable audit times; store database timestamps as `timestamptz`.
- Reproduced correctness defects remain `in_progress` and get a bounded Release 1 plan; do not fix unrelated defects inside this plan.
- Existing real fuel, parts, IPC, snag, route, and feedback records must not be deleted for testing.

---

## File Map

- CLI-generated `supabase/migrations/*_feedback_triage_metadata.sql` — additive columns, constraints, index, grants, and hardened update policy.
- `src/lib/feedback/reports.js` — pure resolution validation/patching plus the Supabase update function.
- `src/lib/feedback/reports.test.js` — unit tests for terminal dispositions, evidence requirements, clearing stale metadata, and database updates.
- `src/components/Feedback/FeedbackResolutionForm.jsx` — focused form for verified resolution, duplicate, and cannot-reproduce outcomes.
- `src/components/Feedback/FeedbackResolutionForm.test.jsx` — component interaction and validation tests.
- `src/pages/Feedback.jsx` — integrate triage actions, show evidence, expose errors, and prevent evidence-free resolution.
- `src/pages/Feedback.test.jsx` — page integration tests for opening the resolution form, saving, reopening, and displaying dispositions.
- `docs/feedback-audits/2026-08-27-release-0.md` — immutable report snapshot plus live verification ledger.
- `docs/roadmap.md` — link Release 0 and record the resulting counts after production audit.

---

### Task 1: Add Feedback Triage Metadata Safely

**Files:**
- Create via Supabase CLI: the path printed by `npx supabase migration new feedback_triage_metadata` under `supabase/migrations/`
- Reference: `supabase/migrations/0011_feedback.sql`

**Interfaces:**
- Consumes: existing `public.feedback_reports(id, status, resolved_at, user_id)`.
- Produces: nullable columns `disposition`, `canonical_report_id`, `resolution_note`, `verified_at`, and `verified_app_version` available through Supabase Data API.

- [ ] **Step 1: Inspect the CLI and create the migration through the supported generator**

Run:

```powershell
npx supabase --version
npx supabase migration --help
npx supabase migration new feedback_triage_metadata
Get-ChildItem supabase\migrations\*_feedback_triage_metadata.sql | Select-Object -ExpandProperty FullName
```

Expected: exactly one new empty migration path is printed. Save that exact path in `$feedbackMigrationPath` for the remaining steps; do not rename it manually.

- [ ] **Step 2: Write the additive migration**

Put this SQL into `$feedbackMigrationPath`:

```sql
alter table public.feedback_reports
  add column if not exists disposition text,
  add column if not exists canonical_report_id uuid references public.feedback_reports(id) on delete set null,
  add column if not exists resolution_note text,
  add column if not exists verified_at timestamptz,
  add column if not exists verified_app_version text;

alter table public.feedback_reports
  drop constraint if exists feedback_reports_disposition_check;
alter table public.feedback_reports
  add constraint feedback_reports_disposition_check
  check (disposition is null or disposition in ('duplicate', 'cannot_reproduce'));

alter table public.feedback_reports
  drop constraint if exists feedback_reports_duplicate_canonical_check;
alter table public.feedback_reports
  add constraint feedback_reports_duplicate_canonical_check
  check (
    (disposition = 'duplicate' and canonical_report_id is not null)
    or (disposition is distinct from 'duplicate' and canonical_report_id is null)
  );

create index if not exists feedback_reports_canonical_report_idx
  on public.feedback_reports (canonical_report_id)
  where canonical_report_id is not null;

grant select, insert, update, delete on public.feedback_reports to authenticated;
revoke all on public.feedback_reports from anon;

drop policy if exists "owner update feedback" on public.feedback_reports;
create policy "owner update feedback"
  on public.feedback_reports for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
```

Do not require `resolution_note` at database level: seven historical resolved rows predate this feature. The application validation added in Task 2 enforces evidence for all new terminal actions.

- [ ] **Step 3: Review migration safety before applying it anywhere**

Run:

```powershell
Get-Content $feedbackMigrationPath
rg -n "service_role|security definer|auth\.role\(\)|grant .* anon" $feedbackMigrationPath
git diff --check -- $feedbackMigrationPath
```

Expected: the first command shows only additive columns, constraints, index, explicit authenticated grants, anon revoke, and the update-policy replacement. The search returns no matches.

- [ ] **Step 4: Verify current Supabase guidance and check for relevant breaking changes**

Open the official Supabase changelog and RLS guide. Confirm before execution that:

- Data API grants and RLS are separate controls.
- UPDATE has a SELECT policy and uses both `USING` and `WITH CHECK`.
- No breaking change affects additive columns or PostgREST exposure for this existing table.

Expected: record the review date and links in the migration commit body. The April 2026 Data API auto-exposure change does not block an existing explicitly granted table, but the migration keeps the grant explicit.

- [ ] **Step 5: Apply the migration to a development/preview database and inspect the schema**

Use the configured Supabase connection for Stallion Pit's non-production target. Apply with the project's established migration workflow; if no non-production project exists, stop and obtain explicit approval before applying to production.

Run these read-only verification queries after application:

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'feedback_reports'
  and column_name in (
    'disposition', 'canonical_report_id', 'resolution_note',
    'verified_at', 'verified_app_version'
  )
order by column_name;

select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'feedback_reports'
order by policyname;

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'feedback_reports'
  and grantee in ('anon', 'authenticated')
order by grantee, privilege_type;
```

Expected: five nullable columns; owner-scoped update policy includes both predicates; authenticated has required privileges; anon has none.

- [ ] **Step 6: Exercise constraints inside a rolled-back transaction**

Run against the newest development/preview report selected by the statement itself:

```sql
begin;

update public.feedback_reports
set disposition = 'duplicate', canonical_report_id = null
where id = (
  select id from public.feedback_reports order by created_at desc limit 1
);
-- Expected: feedback_reports_duplicate_canonical_check violation.

rollback;
```

Then run a second transaction that selects two distinct development reports itself:

```sql
begin;

update public.feedback_reports
set disposition = 'duplicate',
    canonical_report_id = (
      select id from public.feedback_reports
      where id <> (select id from public.feedback_reports order by created_at desc limit 1)
      order by created_at desc limit 1
    ),
    resolution_note = 'Constraint verification only',
    verified_at = now(),
    verified_app_version = 'test'
where id = (select id from public.feedback_reports order by created_at desc limit 1);

select disposition, canonical_report_id, resolution_note
from public.feedback_reports
where id = (select id from public.feedback_reports order by created_at desc limit 1);

rollback;
```

Expected: the first transaction fails; the second shows the temporary values and rolls them back. The preview database must contain at least two reports. If it does not, create two clearly labeled preview-only test reports and delete only those exact rows after the checks.

- [ ] **Step 7: Run database advisors and commit the migration**

Run the Supabase database security/performance advisors and resolve any finding introduced by this migration. Then run:

```powershell
git add -- $feedbackMigrationPath
git commit -m "feat(feedback): add triage metadata"
```

Expected: one migration file committed; no application files yet.

---

### Task 2: Centralize Evidence-Backed Resolution Rules

**Files:**
- Modify: `src/lib/feedback/reports.js:39-40,102-126`
- Modify: `src/lib/feedback/reports.test.js:1-139`

**Interfaces:**
- Consumes: Task 1 columns and existing Supabase client injection pattern.
- Produces:
  - `TERMINAL_OUTCOMES = ['resolved', 'duplicate', 'cannot_reproduce']`
  - `resolutionPatch(input, now): { value: object|null, error: string|null }`
  - `reopenPatch(): object`
  - `updateReportResolution(id, input, client): Promise<{ error: string|null }>`
  - `reopenReport(id, client): Promise<{ error: string|null }>`

- [ ] **Step 1: Add failing tests for verified resolution and reopening**

Update the import and add these tests to `src/lib/feedback/reports.test.js`:

```js
import {
  buildContext, statusPatch, withTimeout, newId, updateReport, deleteReport,
  resolutionPatch, reopenPatch, updateReportResolution, reopenReport,
} from './reports'

describe('resolutionPatch', () => {
  const now = () => '2026-08-27T20:00:00.000Z'

  it('builds a verified resolved patch', () => {
    expect(resolutionPatch({
      outcome: 'resolved',
      note: 'Verified dashboard table in production.',
      appVersion: 'abc1234',
    }, now)).toEqual({ value: {
      status: 'resolved',
      resolved_at: '2026-08-27T20:00:00.000Z',
      disposition: null,
      canonical_report_id: null,
      resolution_note: 'Verified dashboard table in production.',
      verified_at: '2026-08-27T20:00:00.000Z',
      verified_app_version: 'abc1234',
    }, error: null })
  })

  it('requires evidence for every terminal outcome', () => {
    expect(resolutionPatch({ outcome: 'resolved', note: ' ' }, now).error)
      .toBe('Add verification evidence before closing this report.')
  })

  it('requires a different canonical report for duplicates', () => {
    expect(resolutionPatch({
      outcome: 'duplicate', note: 'Same request.', reportId: 'r1', canonicalReportId: 'r1',
    }, now).error).toBe('Choose a different canonical report.')
  })

  it('builds a duplicate patch with canonical id', () => {
    expect(resolutionPatch({
      outcome: 'duplicate', note: 'Covered by the route alternatives report.',
      reportId: 'r1', canonicalReportId: 'r2', appVersion: 'abc1234',
    }, now).value).toMatchObject({
      status: 'resolved', disposition: 'duplicate', canonical_report_id: 'r2',
    })
  })

  it('builds a cannot-reproduce patch without a canonical id', () => {
    expect(resolutionPatch({
      outcome: 'cannot_reproduce', note: 'Tested Chrome and Android against build abc1234.',
    }, now).value).toMatchObject({
      status: 'resolved', disposition: 'cannot_reproduce', canonical_report_id: null,
    })
  })
})

describe('reopenPatch', () => {
  it('clears all terminal metadata', () => {
    expect(reopenPatch()).toEqual({
      status: 'open', resolved_at: null, disposition: null,
      canonical_report_id: null, resolution_note: null,
      verified_at: null, verified_app_version: null,
    })
  })
})
```

- [ ] **Step 2: Run the focused test and observe the expected failure**

Run:

```powershell
npm test -- src/lib/feedback/reports.test.js
```

Expected: FAIL because `resolutionPatch`, `reopenPatch`, `updateReportResolution`, and `reopenReport` are not exported.

- [ ] **Step 3: Implement the pure rules**

Add after `statusPatch` in `src/lib/feedback/reports.js`:

```js
export const TERMINAL_OUTCOMES = ['resolved', 'duplicate', 'cannot_reproduce']

export function resolutionPatch({
  outcome, note, reportId = null, canonicalReportId = null, appVersion = 'dev',
}, now = () => new Date().toISOString()) {
  if (!TERMINAL_OUTCOMES.includes(outcome)) return { value: null, error: 'Choose a valid outcome.' }
  const evidence = String(note || '').trim()
  if (!evidence) return { value: null, error: 'Add verification evidence before closing this report.' }
  if (outcome === 'duplicate') {
    if (!canonicalReportId) return { value: null, error: 'Choose the canonical report.' }
    if (canonicalReportId === reportId) return { value: null, error: 'Choose a different canonical report.' }
  }
  const timestamp = now()
  return {
    value: {
      status: 'resolved',
      resolved_at: timestamp,
      disposition: outcome === 'resolved' ? null : outcome,
      canonical_report_id: outcome === 'duplicate' ? canonicalReportId : null,
      resolution_note: evidence,
      verified_at: timestamp,
      verified_app_version: appVersion || 'dev',
    },
    error: null,
  }
}

export function reopenPatch() {
  return {
    status: 'open', resolved_at: null, disposition: null,
    canonical_report_id: null, resolution_note: null,
    verified_at: null, verified_app_version: null,
  }
}
```

- [ ] **Step 4: Add failing database-adapter tests**

Append:

```js
describe('resolution updates', () => {
  const clientWithUpdate = (capture) => ({
    from: (table) => ({
      update: (patch) => ({
        eq: (column, id) => {
          capture.push({ table, patch, column, id })
          return Promise.resolve({ error: null })
        },
      }),
    }),
  })

  it('writes a validated resolution patch by id', async () => {
    const calls = []
    const result = await updateReportResolution('r1', {
      outcome: 'resolved', note: 'Verified.', appVersion: 'abc1234',
    }, clientWithUpdate(calls), () => '2026-08-27T20:00:00.000Z')
    expect(result).toEqual({ error: null })
    expect(calls[0]).toMatchObject({ table: 'feedback_reports', column: 'id', id: 'r1' })
    expect(calls[0].patch).toMatchObject({ status: 'resolved', resolution_note: 'Verified.' })
  })

  it('does not call Supabase when validation fails', async () => {
    const calls = []
    const result = await updateReportResolution('r1', {
      outcome: 'resolved', note: '',
    }, clientWithUpdate(calls))
    expect(result.error).toBe('Add verification evidence before closing this report.')
    expect(calls).toEqual([])
  })

  it('reopens and clears evidence by id', async () => {
    const calls = []
    expect(await reopenReport('r1', clientWithUpdate(calls))).toEqual({ error: null })
    expect(calls[0].patch).toEqual(reopenPatch())
  })
})
```

- [ ] **Step 5: Implement database adapters**

Add before `deleteReport`:

```js
export async function updateReportResolution(id, input, client = supabase, now) {
  const result = resolutionPatch({ ...input, reportId: id }, now)
  if (result.error) return { error: result.error }
  const { error } = await client.from('feedback_reports').update(result.value).eq('id', id)
  return { error: error ? error.message : null }
}

export async function reopenReport(id, client = supabase) {
  const { error } = await client.from('feedback_reports').update(reopenPatch()).eq('id', id)
  return { error: error ? error.message : null }
}
```

- [ ] **Step 6: Run focused tests and commit**

Run:

```powershell
npm test -- src/lib/feedback/reports.test.js
git diff --check -- src/lib/feedback/reports.js src/lib/feedback/reports.test.js
git add src/lib/feedback/reports.js src/lib/feedback/reports.test.js
git commit -m "feat(feedback): require resolution evidence"
```

Expected: all feedback library tests pass and the commit contains only the library and its tests.

---

### Task 3: Add the Resolution Form and Evidence Display

**Files:**
- Create: `src/components/Feedback/FeedbackResolutionForm.jsx`
- Create: `src/components/Feedback/FeedbackResolutionForm.test.jsx`
- Modify: `src/pages/Feedback.jsx:1-215`
- Create: `src/pages/Feedback.test.jsx`

**Interfaces:**
- Consumes: `TERMINAL_OUTCOMES`, `updateReportResolution`, `reopenReport`, current report row, all owner-visible reports, and `__APP_VERSION__`.
- Produces: `FeedbackResolutionForm({ report, reports, saving, onCancel, onSubmit })` where `onSubmit(input)` receives `{ outcome, note, canonicalReportId, appVersion }`.

- [ ] **Step 1: Write component tests before the form**

Create `src/components/Feedback/FeedbackResolutionForm.test.jsx` using the existing React 19 `createRoot`/`act` pattern from `src/pages/Ipc.test.jsx`. Cover these exact behaviors:

```jsx
// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import FeedbackResolutionForm from './FeedbackResolutionForm'

const report = { id: 'r1', comment: 'Map invisible' }
const reports = [report, { id: 'r2', comment: 'Alternative routes and tolls' }]

function renderForm(onSubmit = vi.fn()) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => root.render(
    <FeedbackResolutionForm report={report} reports={reports} saving={false}
      onCancel={() => {}} onSubmit={onSubmit} appVersion="abc1234" />,
  ))
  return { container, onSubmit, root }
}

afterEach(() => { document.body.innerHTML = ''; vi.clearAllMocks() })

describe('FeedbackResolutionForm', () => {
  it('requires evidence before submit', () => {
    const { container, onSubmit } = renderForm()
    act(() => container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(container.textContent).toContain('Add verification evidence')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('shows canonical report selection only for duplicates', () => {
    const { container } = renderForm()
    const outcome = container.querySelector('[name="outcome"]')
    act(() => { outcome.value = 'duplicate'; outcome.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(container.querySelector('[name="canonicalReportId"]')).not.toBeNull()
    expect(container.textContent).toContain('Alternative routes and tolls')
  })

  it('submits trimmed evidence and build version', () => {
    const { container, onSubmit } = renderForm()
    const note = container.querySelector('[name="resolutionNote"]')
    act(() => { note.value = '  Verified in production.  '; note.dispatchEvent(new Event('input', { bubbles: true })) })
    act(() => container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(onSubmit).toHaveBeenCalledWith({
      outcome: 'resolved', note: 'Verified in production.', canonicalReportId: null, appVersion: 'abc1234',
    })
  })
})
```

- [ ] **Step 2: Run the component test and observe failure**

Run:

```powershell
npm test -- src/components/Feedback/FeedbackResolutionForm.test.jsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the focused form**

Create `src/components/Feedback/FeedbackResolutionForm.jsx` with:

- Outcome select: `resolved`, `duplicate`, `cannot_reproduce` with labels “Verified resolved”, “Duplicate”, and “Cannot reproduce”.
- Required evidence textarea named `resolutionNote`.
- Canonical select named `canonicalReportId`, shown only for duplicate, excluding `report.id`.
- Inline validation using the exact error strings from Task 2.
- Cancel and Save outcome buttons; both disabled while `saving`.
- A submit handler that trims evidence and passes the interface object exactly once.

Use existing classes (`form-group`, `row-actions`, `btn-primary`, `btn-secondary`, `form-error`) and semantic `<label>` elements; do not add inline color literals.

- [ ] **Step 4: Integrate resolution into the Feedback page**

In `src/pages/Feedback.jsx`:

1. Import `updateReportResolution`, `reopenReport`, and `FeedbackResolutionForm`.
2. Define `APP_VERSION` from `__APP_VERSION__`, matching `FeedbackModal.jsx`.
3. Replace evidence-free `NEXT_STATUS`/`advance` resolution with:
   - Open → `in_progress` through existing `updateReportStatus`.
   - In progress → open the resolution form.
   - Resolved → call `reopenReport` after confirmation.
4. Add `resolvingId` and `actionError` state.
5. Render `FeedbackResolutionForm` in an expanded row for the selected report.
6. Pass all reports loaded with filter `all` as canonical choices. If the current filtered list is not `all`, fetch canonical choices once through `listReports('all')`.
7. Display database/validation errors in `.form-error`; never close the form on failure.
8. In resolved report details, render:
   - “Verified resolved”, “Duplicate”, or “Cannot reproduce”.
   - Resolution note.
   - Canonical report short ID/comment for duplicates.
   - Verified build and time.
9. Keep comment/type editing independent from resolution evidence.
10. Keep report deletion available, but do not use it in the audit workflow.

- [ ] **Step 5: Add page integration tests**

Create `src/pages/Feedback.test.jsx` with jsdom. Mock `../lib/feedback/reports` and `FeedbackResolutionForm`. Assert:

- An in-progress report renders a “Resolve…” button and clicking it opens the form.
- Saving calls `updateReportResolution` with the selected report ID and refreshes only after success.
- A returned error is rendered and the form remains open.
- Reopening calls `reopenReport`, clears terminal metadata through the adapter, and refreshes.
- A resolved duplicate displays its resolution note and canonical reference.
- No action path calls `deleteReport` unless the explicit delete confirmation is used.

Use a mock report with all Task 1 fields populated so property names stay consistent across tests.

- [ ] **Step 6: Run focused and full UI tests**

Run:

```powershell
npm test -- src/components/Feedback/FeedbackResolutionForm.test.jsx src/pages/Feedback.test.jsx src/lib/feedback/reports.test.js
npm test
npm run lint
npm run build
```

Expected: all tests and build pass. Lint has no new violation category; if pre-existing violations remain, record their exact count and confirm none originate in the four changed/created UI files.

- [ ] **Step 7: Commit the triage UI**

Run:

```powershell
git diff --check -- src/components/Feedback/FeedbackResolutionForm.jsx src/components/Feedback/FeedbackResolutionForm.test.jsx src/pages/Feedback.jsx src/pages/Feedback.test.jsx
git add src/components/Feedback/FeedbackResolutionForm.jsx src/components/Feedback/FeedbackResolutionForm.test.jsx src/pages/Feedback.jsx src/pages/Feedback.test.jsx
git commit -m "feat(feedback): add evidence-backed triage UI"
```

Expected: a self-contained UI commit with tests.

---

### Task 4: Create the 20-Report Production Audit Ledger

**Files:**
- Create: `docs/feedback-audits/2026-08-27-release-0.md`
- Modify: `docs/roadmap.md`

**Interfaces:**
- Consumes: the 20 report IDs and initial dispositions from the approved spec.
- Produces: one auditable row per report with `Expected`, `Procedure`, `Actual`, `Evidence`, `Outcome`, `Canonical`, and `Follow-up plan` fields.

- [ ] **Step 1: Create the immutable snapshot header and outcome rules**

Create `docs/feedback-audits/2026-08-27-release-0.md` with:

```markdown
# Release 0 Feedback Audit — 2026-08-27

**Production:** https://stallion-pit.vercel.app  
**Starting snapshot:** 27 total; 17 open; 3 in progress; 7 resolved  
**Design:** ../superpowers/specs/2026-08-27-feedback-backlog-resolution-design.md  
**Plan:** ../superpowers/plans/2026-08-27-feedback-audit-backlog-cleanup.md

## Outcome Rules

- Resolved: behavior verified in deployed production and evidence recorded.
- Duplicate: canonical report selected and overlap described.
- Cannot reproduce: environment, data, procedure, and actual result recorded.
- Feature plan: report remains open or in progress and names its approved workstream plan.

## Audit Summary

| Outcome | Count |
|---|---:|
| Verified resolved | 0 |
| Duplicate | 0 |
| Cannot reproduce | 0 |
| Correctness plan required | 0 |
| Feature plan required | 0 |
| Not yet audited | 20 |
```

- [ ] **Step 2: Add all 20 report sections with exact verification procedures**

Use the approved spec order. Each section must contain the short ID, full original comment, page URL, created time in Africa/Nairobi, expected behavior, numbered reproduction steps, and blank `Actual`, `Evidence`, `Outcome`, `Canonical`, and `Follow-up plan` fields.

Use these scenario groups to keep procedures consistent:

- Feedback: `064a9d4f`.
- Dashboard/Analysis: `bf9649db`, `053c82af`.
- Fuel: `8c4c5176`, `e3a0da64`, `8f0355a1`, `34863bcc`, `34070eba`.
- Parts/media: `0e476bda`, `fe3eeb3b`.
- IPC/snags: `9fd3250c`, `a54459b4`, `f3f192d6`, `ffdcf083`, `f874c5ba`, `73d535a1`.
- Routes: `ab32d071`, `6ae5415c`, `e2e6e416`.
- Maintenance: `d15f6ca5`.

For screenshot-backed reports (`053c82af`, `a54459b4`, `f3f192d6`, `34863bcc`, `34070eba`), require the auditor to open the private signed screenshot from the Feedback page and describe the visible evidence without copying the signed URL into the ledger.

- [ ] **Step 3: Add exact reusable audit procedures**

Include these procedures in the ledger:

1. **Feedback edit:** create `[AUDIT TEST] Feedback edit`, edit its type/comment, restore it, then delete only that test report after confirming its exact ID.
2. **Fuel deletion:** use a dedicated temporary vehicle named `[AUDIT TEST] Fuel chain`; add odometers 1000, 1100, and 1250; delete only the 1100 test row; expect 250 km since on 1250; then remove the three test rows and vehicle after confirming IDs.
3. **Fuel long gap:** on the same temporary vehicle, add dated rows more than 180 days apart; expect a gap hint and null per-fill value after excluding the boundary.
4. **Route map:** compute Nairobi CBD → Naivasha; expect a visible polyline, A/B markers, distance, duration, and vehicle cost table; record actionable error text if it fails.
5. **IPC completeness:** record database diagram/part counts for the active vehicle, clear all UI filters, compare rendered options, then inspect the three reported diagram/snag cases.
6. **Part image:** paste a supported supplier URL and verify retrieval; separately verify that direct local-file upload is absent/present.
7. **Maintenance readiness:** verify existing work-order target date and planned-parts features, then record which shopping/readiness requirements remain absent.

Temporary-record cleanup is authorized only for records created by these procedures. Resolve and record exact IDs before deletion; never use broad filters or recursive filesystem/database operations.

- [ ] **Step 4: Link Release 0 from the roadmap**

Under `## Planned improvements` in `docs/roadmap.md`, add one row:

```markdown
| Now | Feedback Release 0 — audit and backlog cleanup | Verify all 20 unresolved reports, close stale completed work with evidence, consolidate duplicates, and route genuine work into bounded plans. | Approved — design and implementation plan ready |
```

Do not rewrite or discard the user's existing uncommitted roadmap changes. Apply only this narrow insertion.

- [ ] **Step 5: Review and commit documentation**

Run:

```powershell
rg -n "d15f6ca5|0e476bda|ab32d071|8c4c5176|6ae5415c|e3a0da64|053c82af|9fd3250c|a54459b4|f3f192d6|fe3eeb3b|ffdcf083|f874c5ba|73d535a1|e2e6e416|8f0355a1|bf9649db|34863bcc|064a9d4f|34070eba" docs/feedback-audits/2026-08-27-release-0.md
git diff --check -- docs/feedback-audits/2026-08-27-release-0.md docs/roadmap.md
git add docs/feedback-audits/2026-08-27-release-0.md docs/roadmap.md
git commit -m "docs(feedback): add production audit ledger"
```

Expected: each short ID appears exactly once as a report heading; the commit preserves unrelated roadmap edits.

---

### Task 5: Verify, Deploy, Audit Production, and Reconcile the Backlog

**Files:**
- Modify: `docs/feedback-audits/2026-08-27-release-0.md`
- Modify: `docs/roadmap.md`
- Create only if a defect is reproduced: `docs/superpowers/plans/2026-08-27-fuel-correctness.md`, `docs/superpowers/plans/2026-08-27-ipc-correctness.md`, or `docs/superpowers/plans/2026-08-27-route-map-correctness.md`

**Interfaces:**
- Consumes: Tasks 1–4, production app, authenticated Supabase session, Vercel deployment, original report evidence.
- Produces: deployed triage workflow, completed audit ledger, accurate live report statuses, final counts, and bounded follow-up plans.

- [ ] **Step 1: Run the full pre-deployment verification suite**

Run:

```powershell
npm test
npm run lint
npm run build
git status --short
git log --oneline -5
```

Expected: tests and build pass; no new lint violations; only known user-owned/unrelated files remain unstaged; the Release 0 commits are visible.

- [ ] **Step 2: Apply the reviewed migration to production**

Before applying, take a read-only count and schema snapshot. Apply the exact reviewed migration once using the project's Supabase migration workflow. Then rerun the Task 1 schema, policy, and grants queries.

Expected: the migration succeeds once; all 27 existing reports remain; new columns are null on historical rows; owner policies and grants match Task 1.

- [ ] **Step 3: Obtain explicit deployment authorization and deploy**

Do not push or deploy without the user's separate approval. After approval:

```powershell
git push origin main
npx vercel deploy --prod --yes
```

Expected: Vercel reports a production deployment for `stallion-pit.vercel.app`. Record the deployed short commit hash in the audit ledger.

- [ ] **Step 4: Smoke-test the triage workflow before touching real reports**

1. Open `https://stallion-pit.vercel.app` and sign in.
2. Submit `[AUDIT TEST] Feedback triage workflow` from the floating feedback button.
3. Open **Feedback** in the desktop sidebar.
4. Start the test report, choose **Resolve…**, attempt an empty evidence submission, and confirm it is rejected.
5. Copy the build value displayed in the feedback modal footer and resolve the test report with `Verified Release 0 triage form in production build ` followed by that exact value.
6. Reopen it and confirm status/evidence metadata clears.
7. Resolve it as cannot reproduce with test evidence.
8. Delete only this test report after confirming its full ID in the expanded details or read-only database query.

Expected: each state transition is visible after refresh; validation and database errors are user-visible; no real report changes during this smoke test.

- [ ] **Step 5: Execute all 20 audit procedures and fill evidence immediately**

Work through `docs/feedback-audits/2026-08-27-release-0.md` in this order:

1. Verification candidates with matching commits.
2. Duplicate candidates.
3. Correctness investigations.
4. Partial/new features.

After each report:

- Fill `Actual` and `Evidence` in the ledger.
- Choose exactly one outcome.
- If verified resolved, duplicate, or cannot reproduce, save that outcome through the Feedback resolution form.
- If a bug reproduces, set it to `in_progress`, leave `disposition` null, and name the Release 1 correctness plan.
- If it is unbuilt feature work, keep it open and name Workstream B–F.

Expected: no unaudited row remains. Do not batch status changes without recording evidence per report.

- [ ] **Step 6: Create bounded plans only for reproduced correctness defects**

For each distinct reproduced defect, use the approved design and the writing-plans workflow to create a separate plan. Consolidate reports only when they share one root cause and test boundary. Likely candidates are:

- Fuel calculation/display correctness: `e3a0da64`, `34863bcc`, `34070eba`.
- IPC catalog/image correctness: `9fd3250c`, `a54459b4`, `f3f192d6`.
- Route map visibility only: the map portion of `6ae5415c`.

Do not create a fix plan for a report that passes production verification.

- [ ] **Step 7: Verify final database counts and evidence integrity**

Run read-only queries:

```sql
select status, count(*)
from public.feedback_reports
group by status
order by status;

select coalesce(disposition, 'none') as disposition, count(*)
from public.feedback_reports
group by coalesce(disposition, 'none')
order by disposition;

select id, status, disposition, canonical_report_id,
       resolution_note is not null as has_evidence,
       verified_at, verified_app_version
from public.feedback_reports
where id in (
  'd15f6ca5-7573-4971-aeb3-14ade2ce7fd6',
  '0e476bda-672a-4475-a0cf-cf45ec52b918',
  'ab32d071-ba97-4db6-8f6d-76a682e372ff',
  '8c4c5176-1add-4f95-a2f9-c5adbf3a2433',
  '6ae5415c-20cd-4b48-9527-a80906d88f48',
  'e3a0da64-c37b-4e22-8534-3d1aef3ecc65',
  '053c82af-0d96-4abb-9bd9-fd96d44e9390',
  '9fd3250c-8aae-4d14-8b24-f1f8fa32e842',
  'a54459b4-1f35-4f04-b041-972dec07acbb',
  'f3f192d6-0343-4838-bc8f-d4816a4c9311',
  'fe3eeb3b-59fc-4e6c-a5ba-92f79c7b6873',
  'ffdcf083-0ba7-4086-843a-bc30d860ee49',
  'f874c5ba-4745-4c50-8890-d1563a4e63ef',
  '73d535a1-225c-400a-9c24-0997a6eef1d9',
  'e2e6e416-1ca4-4acd-896d-0ffccb4d3fbf',
  '8f0355a1-0e69-49dd-91df-5253bddeb08d',
  'bf9649db-4a9f-4108-b3a2-67ad2647e2de',
  '34863bcc-7b1c-4dd1-b259-295b3c66b12e',
  '064a9d4f-f81f-4a56-8011-c49a7335df7e',
  '34070eba-531e-429c-b4c8-7a5e844d5c00'
)
order by created_at desc;
```

Expected:

- Every terminally closed report has nonblank evidence and verification metadata.
- Every duplicate has a non-self canonical ID.
- Every reproduced bug is `in_progress` with no terminal disposition.
- Every unbuilt feature remains open and names its workstream in the audit ledger.

- [ ] **Step 8: Update roadmap counts and commit the completed audit**

Update the Release 0 roadmap row to `Complete` and add the final counts plus links to Release 1+ plans. Update the ledger summary so its categories total 20.

Run:

```powershell
git diff --check -- docs/feedback-audits/2026-08-27-release-0.md docs/roadmap.md docs/superpowers/plans
git add docs/feedback-audits/2026-08-27-release-0.md docs/roadmap.md docs/superpowers/plans
git commit -m "docs(feedback): complete Release 0 audit"
```

Expected: the final documentation commit contains audit evidence, final counts, and only the follow-up plans justified by reproduced defects.

- [ ] **Step 9: Report completion with evidence**

Provide the user:

- Starting and final status counts.
- IDs resolved, marked duplicate, cannot reproduce, left open as features, and moved in progress as reproduced bugs.
- Links to the audit ledger and each follow-up plan.
- Test, lint, build, migration, deployment, and production smoke-test results.
- Any manual decision still required before Release 1.

Do not claim the backlog is sorted unless all 20 ledger entries have evidence and an outcome.

---

## Plan Self-Review

- **Spec coverage:** Release 0 covers audit metadata, evidence-backed UI, all 20 reports, production verification, duplicate handling, cannot-reproduce handling, status reconciliation, and Release 1 plan routing. Feature implementation remains intentionally outside this plan.
- **Security:** Existing owner RLS is preserved and hardened for updates; Data API grants are explicit; anon access is revoked; service credentials remain server-side.
- **Data safety:** Real reports are never deleted; only exact disposable audit records may be cleaned up; original evidence fields are preserved.
- **Interface consistency:** `resolutionPatch`, `reopenPatch`, `updateReportResolution`, and `reopenReport` use the same column names and outcomes in tests, UI, migration, and audit procedures.
- **Verification:** Focused tests, full tests, lint, build, schema/policy/grant queries, database advisors, deployment smoke test, and per-report production evidence are all required.
