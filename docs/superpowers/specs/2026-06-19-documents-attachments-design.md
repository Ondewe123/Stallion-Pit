# Stallion Pit — Documents & Attachments (T2, slice 3 — final) — Design Spec

**Date:** 2026-06-19
**Status:** Approved for planning
**Tier:** T2 (supporting data), final slice. Depends on: T0, T1, T2.1, T2.2 (done).
**After this:** T2 complete → T3 (intelligence/output).
**Concurrency:** repo at 0013; another session has WIP in `consumption.js`/`Dashboard.jsx`. This slice
uses migration **0014**, mirrors the Feedback Storage conventions, and stages **only its own files**.

## 1. Purpose
A central document library: upload receipts, invoices, logbook scans, insurance/inspection
certificates, and photos for a vehicle, optionally linked to a work order / part / service / snag.
Backed by a private Supabase Storage bucket with owner-folder RLS (same pattern as Feedback
screenshots).

## 2. Goals / non-goals
**Goals**
- `documents` table + private `documents` bucket (owner-scoped, `{user_id}/{id}.{ext}`).
- `/documents` page: upload, list (image thumbnails via signed URLs, file rows otherwise), kind tag,
  optional link to WO/part/service/snag, download, delete (object + row), kind filter.
- Pure, tested helpers for path/kind/extension + a safe id generator.

**Non-goals**
- Inline attachment panels inside Work Orders/Snags (fast follow; this slice is the central library).
- Image resizing/OCR/virus scanning.
- Public sharing links.

## 3. Data model — `supabase/migrations/0014_documents.sql`
Owner-scoped RLS (0005 pattern) + a private bucket with owner-folder Storage policies
(copied from 0011 Feedback). Idempotent. Applied live.
```
documents
  id             uuid pk default gen_random_uuid()
  vehicle_id     uuid not null → vehicles(id) on delete cascade
  file_path      text not null            -- {user_id}/{id}.{ext} within the bucket
  file_name      text not null            -- original filename
  mime_type      text
  file_size      numeric
  kind           text not null default 'Other'
                   check (kind in ('Receipt','Invoice','Logbook','Insurance','Inspection','Photo','Other'))
  title          text
  note           text
  work_order_id  uuid → work_orders(id)  on delete set null
  part_id        uuid → parts(id)        on delete set null
  service_log_id uuid → service_logs(id) on delete set null
  snag_id        uuid → snags(id)        on delete set null
  user_id        uuid not null → auth.users(id) default auth.uid()
  created_at     timestamptz not null default now()
index (vehicle_id, created_at desc)
```
Bucket `documents` (private). Storage policies: a user may only touch objects whose first path
segment equals their `auth.uid()` — `(storage.foldername(name))[1] = auth.uid()::text` for
select/insert/update/delete (exactly the Feedback bucket pattern).

## 4. Pure logic — `src/lib/docs.js` (+ `docs.test.js`)
No Supabase/React deps:
- `KINDS` = ['Receipt','Invoice','Logbook','Insurance','Inspection','Photo','Other'].
- `extFromName(name)` → lowercase extension or ''.
- `storagePath(userId, id, fileName)` → `${userId}/${id}.${ext}` (no trailing dot if no ext).
- `isImage(mime)` → mime starts with 'image/'.
- `newId()` → `crypto.randomUUID()` when available, else an RFC4122-v4 built from
  `crypto.getRandomValues` (so it works in insecure contexts / older Safari — the same class of bug
  the Feedback module hit). Returns a uuid-shaped string.
Tests: ext parsing (with/without/uppercase), path build, isImage true/false/null, newId format +
uniqueness across two calls.

## 5. UI — `src/pages/Documents.jsx` (route `/documents`)
- Uses `useAuth()` for `user.id` (needed for the storage path) and `useVehicle()` for scope.
- **Upload (view 'add')**: file input + kind select + title + note + optional link selects (this
  vehicle's work orders / parts / services / snags). On submit: `id = newId()`,
  `path = storagePath(user.id, id, file.name)`, `storage.from('documents').upload(path, file, {contentType})`,
  then insert the row (with the same `id`). Errors surfaced; no silent throw.
- **List**: kind filter tabs (All + kinds). Image docs show a thumbnail (lazy `createSignedUrl`, 1h);
  others show a 📄 row. Each row: title/file_name, kind badge, linked-entity badge(s), created date,
  **Download** (opens signed URL) and **Delete** (removes the storage object then the row, with confirm).
- Conventions: `clean()` `''→null`; confirm-before-delete; existing badge/table styles.
- **Nav**: desktop sidebar `📄 Docs` (`desktopOnly`; mobile bottom bar stays at 8).

## 6. Work breakdown
1. `0014_documents.sql` — table + bucket + RLS; apply live; verify owner/stranger + bucket exists.
2. `src/lib/docs.js` + `docs.test.js`.
3. `src/pages/Documents.jsx` — upload/list/thumbnail/download/delete + link selects + kind filter.
4. Route `/documents` + nav (`desktopOnly`) in App.jsx / Layout.jsx.
5. tests (sequential — parallel OOMs under concurrent load) / lint / build; commit own files only.

## 7. Risks & mitigations
- **Insecure-context uuid** — `newId()` falls back to `getRandomValues` (don't repeat the Feedback
  `crypto.randomUUID` crash).
- **Orphaned storage objects** — delete removes the object first, then the row; if object delete
  fails, surface and stop (row stays, re-deletable).
- **Private bucket display** — images need `createSignedUrl`; never assume a public URL.
- **Concurrency** — migration 0014; stage only own paths; don't touch Dashboard/consumption.
- **Build/test under load** — verify with `npx vitest run --no-file-parallelism`.

## 8. Success criteria
- [ ] `0014` applied live; bucket `documents` exists; owner sees own docs, stranger sees none.
- [ ] Upload an image + a PDF, link one to a work order, see thumbnail/row, download works, delete
      removes object + row.
- [ ] `npm test` (sequential) passes incl. docs tests; build clean; no new lint patterns; other
      session's files untouched.
- [ ] **T2 tier complete.**
