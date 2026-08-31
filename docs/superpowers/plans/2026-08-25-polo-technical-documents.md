# Polo VIN Profile and Technical Documents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store the Polo's verified technical identity and supporting photos, and make official workshop documents a first-class private document type with Fleet access.

**Architecture:** Reuse the owner-scoped `vehicles` row for stable identity and the existing private `documents` bucket/table for evidence and manuals. Extend the documents check constraint and UI kinds; a compact Fleet section queries only document metadata, while Documents remains responsible for uploads, signed URL access and deletion.

**Tech Stack:** React 19, Vite 8, Vitest, Supabase Postgres and private Storage.

**Spec:** `docs/superpowers/specs/2026-08-25-polo-technical-documents-design.md`

## Global Constraints

- Store only owner-supplied or legally obtained files; never download or redistribute third-party workshop manuals.
- Treat `WVWZZZ9NZ4U010537`, `BBY` and `GJG` as the approved Polo facts; do not invent oil, torque, wiring or gearbox specifications.
- Keep every document and storage object owner-scoped under the existing private `documents` bucket.
- Retain the original identification photo files as evidence, rather than replacing them with OCR-derived text.
- The manual source, edition/date and vehicle applicability belong in the existing document `note` field.

---

### Task 1: Extend technical document classification in the database and shared helper

**Files:**
- Create: `supabase/migrations/0023_technical_documents.sql`
- Modify: `src/lib/docs.js`
- Modify: `src/lib/docs.test.js`

**Interfaces:**
- Produces `KINDS`, including `Workshop Manual`, `Maintenance Manual`, `Wiring Diagram`, `Technical Bulletin`, and `Identification Photo`.
- Produces an owner-scoped `documents.kind` constraint accepting all existing and new values.

- [ ] **Step 1: Write the failing helper test**

```js
import { KINDS, isTechnicalDocument } from './docs'

it('lists technical document kinds and recognises them', () => {
  expect(KINDS).toContain('Workshop Manual')
  expect(KINDS).toContain('Identification Photo')
  expect(isTechnicalDocument({ kind: 'Workshop Manual' })).toBe(true)
  expect(isTechnicalDocument({ kind: 'Photo' })).toBe(false)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- src/lib/docs.test.js`

Expected: FAIL because `isTechnicalDocument` is not exported and the new kinds are absent.

- [ ] **Step 3: Write minimal implementation**

```js
export const KINDS = [
  'Receipt', 'Invoice', 'Logbook', 'Insurance', 'Inspection', 'Photo',
  'Workshop Manual', 'Maintenance Manual', 'Wiring Diagram',
  'Technical Bulletin', 'Identification Photo', 'Other',
]

const TECHNICAL_KINDS = new Set([
  'Workshop Manual', 'Maintenance Manual', 'Wiring Diagram',
  'Technical Bulletin', 'Identification Photo',
])

export function isTechnicalDocument(doc) {
  return TECHNICAL_KINDS.has(doc?.kind)
}
```

Create migration `0023_technical_documents.sql` that drops the existing `documents_kind_check` constraint if it exists and adds it again with exactly the old and new kinds. Do not alter rows, Storage policies, RLS or other document columns.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm.cmd test -- src/lib/docs.test.js`

Expected: PASS.

- [ ] **Step 5: Apply and verify the migration**

Apply `0023_technical_documents.sql` using the approved Supabase workflow. Confirm its check constraint accepts the new kinds and leaves owner RLS unchanged.

- [ ] **Step 6: Commit**

```powershell
git add supabase/migrations/0023_technical_documents.sql src/lib/docs.js src/lib/docs.test.js
git commit -m "feat(documents): add technical document categories"
```

### Task 2: Surface technical document kinds in Documents

**Files:**
- Modify: `src/pages/Documents.jsx`
- Modify: `src/lib/docs.js`
- Modify: `src/lib/docs.test.js`

**Interfaces:**
- Consumes `KINDS` and `isTechnicalDocument(doc)` from `src/lib/docs.js`.
- Produces upload choices, filters and readable badges for technical document kinds.

- [ ] **Step 1: Write the failing badge test**

```js
import { documentBadgeClass } from './docs'

it('uses clear badges for technical document kinds', () => {
  expect(documentBadgeClass('Workshop Manual')).toBe('badge-gold')
  expect(documentBadgeClass('Identification Photo')).toBe('badge-green')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- src/lib/docs.test.js`

Expected: FAIL because `documentBadgeClass` is not exported.

- [ ] **Step 3: Write minimal implementation**

Add `documentBadgeClass(kind)` to `src/lib/docs.js` and use it in `Documents.jsx`. It returns `badge-gold` for workshop and maintenance manuals, `badge-amber` for wiring diagrams and technical bulletins, `badge-green` for identification photos, and preserves the current mappings for all existing kinds.

Leave upload, signed URL, thumbnail and deletion behaviour unchanged. Update the Documents subtitle to mention technical documents.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm.cmd test -- src/lib/docs.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/pages/Documents.jsx src/lib/docs.js src/lib/docs.test.js
git commit -m "feat(documents): present workshop document types"
```

### Task 3: Add Fleet technical-document summary

**Files:**
- Modify: `src/pages/Fleet.jsx`
- Create: `src/lib/technicalDocuments.js`
- Create: `src/lib/technicalDocuments.test.js`

**Interfaces:**
- `technicalDocumentSummary(documents)` consumes document metadata and returns `{ count, identificationPhotos }`.
- Fleet queries `id,file_path,file_name,mime_type,kind,title,note` for the selected vehicle and renders the summary only when `count > 0`.

- [ ] **Step 1: Write the failing summary test**

```js
import { technicalDocumentSummary } from './technicalDocuments'

it('counts manuals and retains only identification photographs for preview', () => {
  const result = technicalDocumentSummary([
    { id: 'manual', kind: 'Workshop Manual' },
    { id: 'vin-photo', kind: 'Identification Photo', mime_type: 'image/png' },
    { id: 'receipt', kind: 'Receipt' },
  ])
  expect(result.count).toBe(2)
  expect(result.identificationPhotos.map(doc => doc.id)).toEqual(['vin-photo'])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- src/lib/technicalDocuments.test.js`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Write minimal implementation**

```js
import { isTechnicalDocument } from './docs'

export function technicalDocumentSummary(documents = []) {
  const technical = documents.filter(isTechnicalDocument)
  return {
    count: technical.length,
    identificationPhotos: technical.filter(doc =>
      doc.kind === 'Identification Photo' && doc.mime_type?.startsWith('image/')
    ),
  }
}
```

In `Fleet.jsx`, load document metadata for the selected vehicle and sign URLs only for up to two identification photos. Render a `Technical documents` section after specs with its count, thumbnails and an `Open Documents` action that routes to `/documents`. Do not render the section when the count is zero; document errors must not block Fleet details.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm.cmd test -- src/lib/technicalDocuments.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/pages/Fleet.jsx src/lib/technicalDocuments.js src/lib/technicalDocuments.test.js
git commit -m "feat(fleet): show technical document summary"
```

### Task 4: Populate the Polo profile and preserve supplied evidence

**Files:**
- Modify: live `public.vehicles` row `ea244a14-2259-4e15-9390-47d2835bd988`
- Create: two live `public.documents` rows and private `documents` Storage objects

**Interfaces:**
- Vehicle update values: `vin`, `engine_code`, `engine_description`, `gearbox_code`, `transmission`, and `notes`.
- Evidence rows use `kind: 'Identification Photo'` and the standard `{user_id}/{document_id}.png` private-storage path.

- [ ] **Step 1: Inspect the current Polo row**

Run a read-only query for the Polo vehicle ID and display only `name`, `vin`, `engine_code`, `engine_description`, `gearbox_code`, `transmission` and `notes`.

- [ ] **Step 2: Update the confirmed Polo identity**

```js
{
  vin: 'WVWZZZ9NZ4U010537',
  engine_code: 'BBY',
  engine_description: '1.4L 16V petrol (BBY)',
  gearbox_code: 'GJG',
  transmission: 'Manual',
  notes: 'Imported from aCar. VIN and gearbox photo supplied by owner; BBY engine and GJG gearbox confirmed by owner. Verify any repair specifications against official Volkswagen erWin documents.',
}
```

- [ ] **Step 3: Upload original supplied images unchanged**

Upload the two supplied PNG files to private Storage and create documents titled `VIN / chassis-number evidence` and `GJG gearbox-code evidence`, both with `kind: 'Identification Photo'` and note `Owner-supplied identification photograph`.

- [ ] **Step 4: Verify live data without exposing credentials or signed URLs**

Read back the seven vehicle fields and two document metadata rows. Confirm both private objects exist and are scoped to the Polo vehicle.

### Task 5: Full verification and handoff

**Files:**
- Verify: `src/lib/docs.test.js`
- Verify: `src/lib/technicalDocuments.test.js`
- Verify: production bundle

- [ ] **Step 1: Run relevant tests**

Run: `npm.cmd test -- src/lib/docs.test.js src/lib/technicalDocuments.test.js`

Expected: PASS.

- [ ] **Step 2: Run the complete test suite**

Run: `npm.cmd test`

Expected: PASS.

- [ ] **Step 3: Build production assets**

Run: `npm.cmd run build`

Expected: Vite completes successfully.

- [ ] **Step 4: Manually verify in the application**

1. Open Stallion Pit and sign in.
2. Open **Fleet**, select **Polo**, then open its details.
3. Confirm VIN, BBY engine and GJG gearbox appear.
4. Confirm the Technical documents section shows two identification photos and select **Open Documents**.
5. Confirm Documents shows both evidence photos; upload a PDF as `Workshop Manual`, then download and delete it.
6. Confirm receipts, photos and existing filters continue to work.

- [ ] **Step 5: Commit local source changes**

```powershell
git add docs/roadmap.md docs/superpowers/specs/2026-08-25-polo-technical-documents-design.md docs/superpowers/plans/2026-08-25-polo-technical-documents.md supabase/migrations/0023_technical_documents.sql src/lib/docs.js src/lib/docs.test.js src/lib/technicalDocuments.js src/lib/technicalDocuments.test.js src/pages/Documents.jsx src/pages/Fleet.jsx
git commit -m "feat: add Polo technical documents"
```
