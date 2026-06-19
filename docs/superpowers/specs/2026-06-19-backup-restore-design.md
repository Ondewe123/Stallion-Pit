# Stallion Pit — In-App Backup & Restore — Design Spec

**Date:** 2026-06-19
**Status:** Approved for planning
**Context:** User wants to play freely with workflows then revert. Inspired by Kuku Farm v5's
`/api/backup` + `/api/restore` (download one JSON of all tables; restore wipes + reinserts).
Stallion Pit has **no backend**, so this is done **client-side** via supabase-js under the
owner's RLS. Separate from the existing CLI `scripts/backup.mjs` (this is in-app, browser-driven).

## 1. Goals / non-goals
**Goals**
- One-click **Download**: a single JSON snapshot of all the owner's vehicle data.
- **Restore** from that file: full wipe-and-replace of the owner's rows, behind a typed confirm.
- IDs preserved so a restored snapshot is identical (links intact).

**Non-goals**
- Backing up Storage *files* (uploaded documents). DB rows are restored; the actual files remain in
  the private bucket untouched, so `documents.file_path` links keep working. (No base64 file blobs.)
- Backing up `feedback_reports` (belongs to the concurrent Feedback module).
- Server endpoints / scheduled backups (the CLI script + Supabase handle off-app copies).
- Merge/append restore (we do a true revert).

## 2. Tables covered (13)
vehicles, fuel_logs, service_logs, parts, snags, maintenance_schedules, maintenance_templates,
template_items, work_orders, work_order_parts, work_order_schedule_items, dtc_codes, documents.

## 3. Pure logic — `src/lib/backup.js` (+ `backup.test.js`)
No Supabase/React deps.
- `BACKUP_TABLES` — the 13 above.
- `RESTORE_ORDER` — FK-safe insert order:
  `vehicles, maintenance_templates, template_items, work_orders, fuel_logs, service_logs, parts,
  snags, maintenance_schedules, work_order_parts, work_order_schedule_items, dtc_codes, documents`.
  (work_orders is inserted early so the only forward/circular reference left is
  `work_orders.service_log_id`.)
- `DELETE_ORDER` = `RESTORE_ORDER` reversed (children before parents).
- `GENERATED = { fuel_logs: ['derived_price_per_litre'] }` — stripped before insert (generated col).
- `DEFERRED = { work_orders: ['service_log_id'] }` — nulled on insert, patched after (service_logs
  are inserted after work_orders).
- `buildBackup(dataByTable, meta)` → `{ metadata:{app:'stallion-pit',version,exported_at,owner_email},
  data:{table:rows} }`.
- `validateBackup(obj)` → null when OK, else an error string (checks `metadata.app==='stallion-pit'`
  and a `data` object).
- `rowsForInsert(table, rows)` → strips GENERATED cols, nulls DEFERRED cols; for `fuel_logs` sorts by
  `odometer_km` asc so the `km_since_last` trigger recomputes correctly.
- `deferredUpdates(table, rows)` → `[{id, patch}]` for rows whose deferred columns had values.
- `summarize(data)` → `[{table,count}]` (non-empty) for the confirm dialog.
Tests: build shape; validate good/bad/foreign; rowsForInsert strips generated + nulls deferred + sorts
fuel; deferredUpdates only for rows with values; summarize counts.

## 4. UI — `src/pages/Backup.jsx` (route `/backup`, desktop nav `💾 Backup`)
- **Download**: `Promise.all` select('*') over BACKUP_TABLES (RLS → owner rows only) → `buildBackup`
  with `exported_at`/`owner_email` (from `useAuth`) → Blob → anchor download
  `stallion-pit-backup-YYYY-MM-DD-HHMM.json`. Shows per-table counts after.
- **Restore**: file input → `JSON.parse` → `validateBackup` → show a summary (`summarize`) and a
  **type-"RESTORE"-to-confirm** box. On confirm:
  1. delete every owner row in `DELETE_ORDER` (`.delete().neq('id', <zero-uuid>)`),
  2. insert per `RESTORE_ORDER` using `rowsForInsert` (chunked 200),
  3. patch `DEFERRED` via `deferredUpdates`.
  Live step text; on any error, stop and surface it (data may be partially restored — the file is
  still intact to retry). On success, `window.location.reload()` so context + pages refetch.
- Safety copy: "This replaces ALL current data with the backup. Download a fresh backup first."

## 5. Risks & mitigations
- **FK violations on insert** — solved by RESTORE_ORDER + the single DEFERRED patch
  (`work_orders.service_log_id`); generated col stripped.
- **Partial restore on mid-way failure** (no client transaction) — ordered delete→insert→patch;
  surface the failing table; the JSON file is unharmed so the user can re-run. (A future Edge Function
  could wrap it in a real transaction.)
- **km_since_last trigger** — fuel rows inserted in odometer order so the trigger recomputes correctly.
- **Storage files** — not deleted by restore; `documents` rows reinsert pointing at existing files.
- **Concurrency** — new files only; no migration; never `git add -A`.

## 6. Success criteria
- [ ] Download yields a valid JSON with all 13 tables and correct counts.
- [ ] Mutate data (close a WO, add parts/snags), Restore the earlier file → state matches the snapshot
      exactly (verified by re-download diff or counts).
- [ ] Restore is blocked until "RESTORE" is typed.
- [ ] `npm test` (sequential) passes incl. backup tests; build clean; no new lint patterns.
