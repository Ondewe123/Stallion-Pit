# Feedback Backlog Resolution — Design Specification

**Date:** 2026-08-27  
**Project:** Stallion Pit  
**Source:** `public.feedback_reports` in the live Stallion Pit Supabase project  
**Snapshot:** 27 total reports: 17 open, 3 in progress, 7 resolved; this design covers the 20 unresolved reports.

## 1. Goal

Turn every unresolved feedback report into a verified outcome without rebuilding features that already exist. The backlog will be audited against the deployed application first, then genuine work will be delivered in dependency-aware releases.

Every report must finish in exactly one of these states:

- **Resolved:** verified in production against explicit acceptance criteria.
- **Duplicate:** covered by another canonical report, with the canonical report ID recorded.
- **Cannot reproduce:** tested with recorded data, device/browser, and result; may be reopened if new evidence appears.
- **Feature plan:** converted into an approved, scoped implementation plan before development begins.

## 2. Operating Rules

1. Do not change a report's status merely because matching code exists. Verify the behavior in the deployed app.
2. Preserve the original report text, screenshot, breadcrumbs, and timestamps.
3. When a report contains several requests, split it into independently verifiable requirements. Resolve the original only when all requirements are delivered or linked to canonical follow-up reports.
4. Bugs that threaten calculation correctness or data integrity take priority over enhancements.
5. Each workstream ships as a small release with automated tests, a production smoke test, and feedback-status reconciliation.
6. Do not delete non-test reports. Use `resolved`, `duplicate`, or `cannot_reproduce` tracking metadata introduced by the triage workstream.
7. Existing owner-scoped RLS remains mandatory for every new table and Storage object.
8. No production schema or data changes occur during planning.

## 3. Recommended Approach

Use **triage-first workstreams**:

1. Add a repeatable audit workflow and verify the current deployment.
2. Close demonstrably completed reports and consolidate duplicates.
3. Fix correctness bugs before adding capabilities.
4. Deliver the remaining work in five bounded feature workstreams.
5. Reconcile feedback after every deployment so the list never becomes stale again.

This is preferred over oldest-first ordering because the oldest reports are often already implemented, and over page-by-page ordering because calculation defects must outrank cosmetic or analytical enhancements.

## 4. Current-State Findings

Repository inspection shows several unresolved reports already have matching implementations:

- Feedback editing and deletion: commit `efc9325`.
- Per-vehicle dashboard fuel totals: commit `f1e42ab`.
- Per-fill fuel columns and manual bad-data/gap exclusion: commits `e045391` and `ac90a71`.
- Editable fuel logs and consumption graph: commit `b4cefe1`.
- Parts photo retrieval from supplier links: commit `e83ca35`.
- IPC parts beside diagrams and empty-diagram filtering: commits `5f76601` and `e0e7227`.
- Snag-to-IPC parts and diagram previews: commits `c5effcc` and `86210b2`, followed by later picker fixes.
- Supplier price history for snag parts: migration `0020_part_price_snapshots.sql` and associated Snags implementation.
- Route cost planning and an embedded map: commits `af18989` through `3bf016c`.
- Work orders already support target dates, planned parts, and linked maintenance items through migration `0008_work_orders.sql`.
- The central `documents` system already supports optional `part_id` and `snag_id` links.

These findings are candidates for verification, not automatic closure.

## 5. Report-by-Report Disposition Map

| Report | Summary | Initial disposition | Verification or planned destination |
|---|---|---|---|
| `d15f6ca5` | Maintenance job date, shopping list, stock readiness | Feature plan | Workstream E: build on work orders, parts inventory, and maintenance links. |
| `0e476bda` | Upload or retrieve pictures in Parts add/edit | Partial feature plan | Verify supplier retrieval; add direct upload and replace/remove controls in Workstream C. |
| `ab32d071` | Alternative routes and tolls | Feature plan | Canonical report for Workstream D. |
| `8c4c5176` | Monthly, MTD, yearly, and YTD litres | Feature plan | Workstream B; reuse period aggregation helpers. |
| `6ae5415c` | Map invisible; select different routes | Split | Verify map in production under Workstream A; mark route-choice portion duplicate of `ab32d071`. |
| `e3a0da64` | Last two per-fill values look wrong | Correctness investigation | Workstream A: reproduce with the exact rows and document the formula/input chain. |
| `053c82af` | Daily averages over selectable periods | Feature plan | Workstream B: daily/weekly/fortnightly fuel and distance rates with clear denominators. |
| `9fd3250c` | Snag picker shows part numbers without diagrams | Verification candidate | Test current snag IPC picker and all linked diagram URLs in Workstream A. |
| `a54459b4` | IPC does not show all expected diagrams | Correctness investigation | Compare imported catalog counts with source CSV and rendered filters in Workstream A. |
| `f3f192d6` | Wrong IPC image | Correctness investigation | Trace selected diagram ID, source URL, and vehicle scope in Workstream A. |
| `fe3eeb3b` | Separate part number and description columns | Verification candidate | Confirm Parts list/add/edit fields and table columns in production. |
| `ffdcf083` | Snag photos plus component/part details | Partial feature plan | Existing documents can link a snag; add direct snag attachment UX in Workstream C. IPC part details remain canonical there. |
| `f874c5ba` | Add a picture or screenshot to a snag | Duplicate candidate | Canonicalize under `ffdcf083` after confirming both requests have the same desired outcome. |
| `73d535a1` | IPC preloading, AI snag understanding, supplier prices/history, repair data | Split | Verify IPC and price-history portions; place direct repair guidance in Workstream F; defer autonomous AI diagnosis until evidence and safety design are approved. |
| `e2e6e416` | Route fuel and operating-cost prediction | Verification candidate | Verify route planner across vehicles, then resolve; alternative routes remain under `ab32d071`. |
| `8f0355a1` | Per-row consumption and partial-fill accuracy | Verification candidate | Confirm Per-fill/segment columns, partial-fill explanation, and exclusion behavior. |
| `bf9649db` | Previous-month and MTD fuel per car | Verification candidate | Confirm dashboard per-car table and Analysis fleet totals. |
| `34863bcc` | Deleted fuel row leaves stale km-since calculation | Correctness investigation | Delete a disposable test row and confirm adjacency is derived from current rows, never persisted stale state. |
| `064a9d4f` | Feedback items need editing | Verification candidate | Edit and restore a test report's type/comment; verify delete confirmation without deleting real feedback. |
| `34070eba` | More than six months between fills breaks math | Verification candidate | Confirm gap warning and exclusion chain-break semantics on a disposable test case. |

## 6. Delivery Workstreams

### Workstream A — Production Audit and Correctness

**Purpose:** Establish the true backlog and resolve calculation/map/catalog defects before feature development.

Deliverables:

- A report-audit checklist containing report ID, environment, reproduction data, expected result, actual result, evidence, and disposition.
- Production smoke tests for feedback editing, dashboard totals, fuel rows, route map, Parts columns, IPC diagrams, and snag IPC previews.
- Targeted automated regression tests for every reproduced correctness defect.
- A reconciliation update for each verified report.
- Duplicate tracking without destroying original feedback.

Acceptance criteria:

- Every one of the 20 reports has recorded evidence and a disposition.
- No report is marked resolved solely from repository inspection.
- Fuel calculations are reproducible from visible source rows and documented formulas.
- IPC catalog counts can be reconciled from imported diagrams to rendered diagrams after filters.
- The production route map either renders successfully or produces a user-actionable configuration/API error.

### Workstream B — Fuel Period Insights

**Purpose:** Answer how much fuel and distance are used over useful calendar and rolling periods.

Scope:

- Fuel page summary for previous month, MTD, previous year, and YTD, scoped to the active vehicle.
- Average litres/day and kilometres/day for 7-day, 14-day, calendar-month, and YTD periods.
- Explicit labels distinguishing calendar totals from rolling averages.
- Empty-period and sparse-data explanations rather than misleading zeroes.
- Shared pure calculation helpers used by Fuel, Dashboard, and Analysis.

Acceptance criteria:

- Period boundaries use Africa/Nairobi local calendar dates.
- Totals include all purchased litres; `exclude_from_economy` only affects economy chains, not purchase totals.
- Tests cover year boundaries, leap years, no rows, partial periods, and multiple vehicles.

### Workstream C — Parts and Snag Media

**Purpose:** Make photos and component evidence available where parts and snags are created and reviewed.

Scope:

- Direct image upload in Parts add/edit in addition to existing supplier-link retrieval.
- Preview, replace, and remove actions with clear upload progress and errors.
- Direct multi-photo attachment from Snag add/edit using the existing private `documents` bucket and `snag_id` link.
- Thumbnail gallery in snag detail and explicit part-number/description presentation.
- Reuse the existing document schema and owner-folder Storage policies; do not introduce a second media store.

Acceptance criteria:

- JPG, PNG, and WebP uploads are validated for type and a documented size limit.
- Failed uploads do not create orphan document rows; failed row inserts clean up newly uploaded objects.
- Removing an attachment deletes both its database row and Storage object after confirmation.
- Photos remain owner-scoped and render through short-lived signed URLs.

### Workstream D — Alternative Routes and Tolls

**Purpose:** Let the user compare viable routes rather than accept a single route silently.

Scope:

- Request route alternatives from Google Routes API.
- Display distance, duration, toll status/estimated toll when provided, fuel cost, running cost, and total cost per alternative.
- Select one alternative and redraw only that route prominently on the map.
- Save the selected alternative and enough route metadata to reproduce its displayed summary.
- Explain when Google provides no toll price or only one route.

Acceptance criteria:

- Alternatives have stable UI keys and do not overwrite one another.
- Selecting an alternative updates both the map and all vehicle cost comparisons.
- Route calculation remains usable when toll data is unavailable.
- API errors and quota/configuration failures are visible and actionable.

### Workstream E — Maintenance Job Readiness

**Purpose:** Convert due maintenance into an executable job with a date, procurement list, and trustworthy readiness state.

Scope:

- Create a work order from one or more maintenance schedule items.
- Use the existing work-order `target_date` as the scheduled day.
- Convert planned parts/consumables into structured requirement lines with required quantity.
- Match requirements to `parts.on_hand_qty`; allow an explicit manual match when part numbers differ.
- Produce a shopping list for shortages.
- Show readiness as **Go**, **No Go**, or **Needs Review**.
- Treat tools, labour, appointments, and instructions as checklist items separate from inventory.

Readiness rules:

- **Go:** every required inventory line is matched and available in sufficient quantity, and every mandatory non-inventory prerequisite is confirmed.
- **No Go:** at least one confirmed requirement is unavailable or insufficient.
- **Needs Review:** a requirement is unmatched, quantity is unknown, or prerequisite status is unknown.

Acceptance criteria:

- Readiness is derived from current inventory and checklist state, not stored as a stale manual label.
- The shopping list contains only shortages and shows required, available, and missing quantities.
- Closing a work order keeps the existing service-log, fitted-parts, schedule-completion, and snag-resolution behavior intact.
- Inventory consumption is explicit and confirmed; creating or scheduling a work order never silently decrements stock.

### Workstream F — Repair Guidance and Assisted Research

**Purpose:** Provide sourced repair information after the structured IPC, snag, and price workflows are reliable.

Initial bounded scope:

- Attach workshop documents and extracted notes to a snag or work order.
- Present source, vehicle applicability, retrieval date, and page reference for each instruction.
- Generate a concise, clearly labeled summary from user-provided or authorized documents.
- Keep human confirmation mandatory before assigning parts or changing job readiness.

Out of scope for the first release:

- Autonomous diagnosis from a short snag description.
- Unsourced repair instructions.
- Automated purchasing.
- Treating supplier compatibility claims as verified VIN applicability.

This workstream requires its own design approval because repair guidance can affect vehicle safety.

## 7. Data and Interface Changes

Workstream A should extend `feedback_reports` additively with triage metadata rather than overload the user comment:

- `disposition text null`: `duplicate` or `cannot_reproduce`; `resolved` continues to use the existing status.
- `canonical_report_id uuid null references feedback_reports(id)` for duplicates.
- `resolution_note text null` containing concise verification evidence.
- `verified_at timestamptz null` and `verified_app_version text null`.

Feature workstreams should reuse existing entities wherever possible:

- Media: `documents` plus the private `documents` bucket.
- Maintenance execution: `work_orders`, `work_order_schedule_items`, and `work_order_parts`.
- Inventory: `parts.on_hand_qty` and part-number fields.
- Route persistence: extend `saved_routes` only with alternative/toll metadata actually displayed.
- Fuel analytics: pure client calculation helpers over existing `fuel_logs`; no aggregate table.

Any new database object must include an idempotent migration, grants required by the Data API, owner-scoped RLS with both `USING` and `WITH CHECK` for updates, and automated tests for mapping/derivation logic.

## 8. Error Handling and Evidence

- User-visible operations must show actionable errors; console-only errors are insufficient.
- Media uploads use compensating cleanup when the database insert fails.
- External map, supplier, and repair-data calls distinguish configuration, quota, network, parsing, and no-result states.
- A production verification record must never contain secrets, raw access tokens, or unrelated personal data.
- Disposable test records must be clearly named, restored where editing is tested, and deleted only after exact IDs are confirmed.

## 9. Testing Strategy

Each workstream uses test-driven implementation and must pass:

1. Focused Vitest tests for pure calculations, mapping, state derivation, and failure paths.
2. Existing full suite: `npm test`.
3. Lint: `npm run lint` with no new violations.
4. Production build: `npm run build`.
5. A manual production smoke test tied to the original feedback report IDs.
6. Post-deployment Supabase verification for new schema, RLS, and stored data.

Tests must use synthetic or disposable records. Existing real fuel, parts, snag, document, and feedback rows must not be deleted for testing.

## 10. Release Sequence

1. **Release 0 — Audit tooling and backlog cleanup**: Workstream A triage fields, checklist, production verification, safe status reconciliation.
2. **Release 1 — Correctness fixes**: any fuel, IPC, map, or feedback defects reproduced during Release 0.
3. **Release 2 — Fuel insights**: Workstream B.
4. **Release 3 — Parts and snag media**: Workstream C.
5. **Release 4 — Alternative routes and tolls**: Workstream D.
6. **Release 5 — Maintenance readiness**: Workstream E.
7. **Release 6 — Sourced repair guidance**: separately approved Workstream F.

After every release:

- Deploy and smoke-test production.
- Update only the reports covered by that release.
- Record the app version/commit and concise evidence.
- Recount open, in-progress, and resolved reports.
- Select the next release based on correctness risk and dependencies, not age alone.

## 11. Definition of Done

The feedback backlog is considered sorted when:

- All 20 currently unresolved reports have evidence-backed dispositions.
- All correctness defects are fixed or recorded as cannot reproduce with adequate evidence.
- Duplicate requests point to one canonical report.
- Every approved feature has a bounded implementation plan and release assignment.
- Production statuses match reality.
- The ongoing feedback workflow requires verification evidence before resolution, preventing the backlog from becoming stale again.
