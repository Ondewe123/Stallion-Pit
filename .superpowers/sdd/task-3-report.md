# Task 3 Report: Dry-Run-First IPC Importer

## Status

DONE_WITH_CONCERNS

## Implementation

Created `scripts/import-ipc.mjs`.

- Parses diagrams and parts CSV files with `parseCsv` and maps them with `buildIpcImport`.
- Requires `--vehicle-id`, `--diagrams`, and `--parts`; writing requires explicit `--apply`.
- Reads only the target `vehicles` row before dry-run output, validates the IPC VIN and owner, then exits before every IPC catalog/diagram/part write path.
- Under `--apply`, upserts one IPC catalog and deletes/inserts only `ipc_parts` and `ipc_diagrams` rows whose `catalog_id` is that catalog.
- Inserts parts in batches of 500 and connects each part to its imported diagram.

## Checks

- `node --check scripts/import-ipc.mjs` passed.
- `npm.cmd test -- --run src/lib/ipc/importMapping.test.js` passed: 7 tests.
- Local CSV/mapping check passed: VIN `ADB2020186F450004`, 297 diagrams, 3079 parts.
- Static dry-run guard check confirmed the dry-run exit occurs before the delete/insert code paths.

## Concern

The live dry-run could not be executed because this worktree has no `.env.local` file with `SUPABASE_SERVICE_ROLE_KEY`. The importer correctly stopped before any network request or write with `Missing SUPABASE_SERVICE_ROLE_KEY in .env.local`. A live dry-run remains required once a service-role key and the Mercedes vehicle UUID are available.

## Review Fix

- Merged `process.env` after `.env` and `.env.local`, allowing runtime values such as `IMPORT_USER_ID` to override file defaults while retaining file-loaded Supabase defaults.
- Captured both scoped delete errors under `--apply` and fail before diagram or part inserts when either cleanup fails.
