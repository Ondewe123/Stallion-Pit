# Stallion Pit - VIN-Specific IPC Catalog - Design Spec

**Date:** 2026-07-18
**Status:** Approved direction; ready for implementation planning
**Feature:** Interactive illustrated parts catalog (IPC/EPC) per vehicle
**Initial source files:** `IPC/ilcats-ADB2020186F450004-diagrams (1).csv` and `IPC/ilcats-ADB2020186F450004-parts (1).csv`

## 1. Purpose

Add an interactive IPC page for each vehicle. The first catalog is for the Mercedes VIN
`ADB2020186F450004` (model `202.018`, engine `111.920`, gearbox `717.416`). The design must also
support adding a Polo catalog soon without changing the core architecture.

The IPC is reference data: it helps find diagram groups, item numbers, part numbers, replacement
numbers, quantities, remarks, and price/source links. It is separate from the existing `parts`
inventory table, which tracks parts Chris wants, owns, bought, fitted, or returned.

## 2. Goals And Non-Goals

Goals:
- Store IPC data in dedicated Supabase tables, not local-only files.
- Tie each IPC catalog to one exact vehicle/VIN.
- Make the IPC interactive: browse diagrams, filter groups, search parts, view diagram images, and
  inspect parts for the active vehicle.
- Keep the schema ready for multiple future catalogs, including the Polo.
- Avoid touching shared financial-app tables or generic shared names.
- Provide a dry-run importer for the two CSV files, with `--apply` required for live writes.

Non-goals for the first version:
- No in-app CSV upload UI.
- No manual/PDF reader yet; manuals will be added later as a separate vehicle document/manual area.
- No hot-spot clicking on diagram images yet, because the CSVs do not provide image coordinates.
- No automatic write into the existing `parts` inventory from IPC rows yet.
- No destructive reset/restore flow for IPC data.

## 3. Data Model

Use dedicated tables with owner-scoped RLS. All tables include `user_id uuid not null references
auth.users(id) default auth.uid()` and policies of the form `auth.uid() = user_id`.

### `public.ipc_catalogs`

One row per imported catalog.

Columns:
- `id uuid primary key default gen_random_uuid()`
- `vehicle_id uuid not null references public.vehicles(id) on delete cascade`
- `vin text not null`
- `model_code text`
- `engine_code text`
- `gearbox_code text`
- `source_name text not null default 'ILcats'`
- `source_file_prefix text`
- `notes text`
- `user_id uuid not null references auth.users(id) default auth.uid()`
- `created_at timestamptz not null default now()`

Indexes/constraints:
- Unique per owner and VIN/source: `(user_id, vin, source_name)`.
- Index on `(vehicle_id)`.

### `public.ipc_diagrams`

One row per diagram/subgroup.

Columns:
- `id uuid primary key default gen_random_uuid()`
- `catalog_id uuid not null references public.ipc_catalogs(id) on delete cascade`
- `branch text not null`
- `catalog_group text not null`
- `group_name text`
- `subgroup text not null`
- `diagram_title text not null`
- `part_count integer not null default 0`
- `source_url text`
- `image_url text`
- `user_id uuid not null references auth.users(id) default auth.uid()`
- `created_at timestamptz not null default now()`

Indexes/constraints:
- Unique per catalog/branch/group/subgroup: `(catalog_id, branch, catalog_group, subgroup)`.
- Index on `(catalog_id, catalog_group, subgroup)`.

### `public.ipc_parts`

One row per part row from the catalog.

Columns:
- `id uuid primary key default gen_random_uuid()`
- `catalog_id uuid not null references public.ipc_catalogs(id) on delete cascade`
- `diagram_id uuid references public.ipc_diagrams(id) on delete set null`
- `vin text not null`
- `model_code text`
- `engine_code text`
- `gearbox_code text`
- `branch text not null`
- `catalog_group text not null`
- `group_name text`
- `subgroup text not null`
- `diagram_title text`
- `item_no text`
- `part_number text not null`
- `replacement_numbers text`
- `quantity text`
- `name text not null`
- `usage text`
- `remarks text`
- `source_url text`
- `diagram_image_url text`
- `price_url text`
- `user_id uuid not null references auth.users(id) default auth.uid()`
- `created_at timestamptz not null default now()`

Indexes:
- `(catalog_id, catalog_group, subgroup)`
- `(catalog_id, part_number)`
- Optional trigram/search index can wait until real UI performance requires it.

## 4. Import Workflow

Add `scripts/import-ipc.mjs`.

Inputs:
- `--vehicle-id <uuid>`
- `--diagrams "IPC/...diagrams.csv"`
- `--parts "IPC/...parts.csv"`
- `--apply` to write; without it, dry-run only

Environment:
- Reads `VITE_SUPABASE_URL` from `.env`.
- Reads `SUPABASE_SERVICE_ROLE_KEY` from `.env.local` for admin import.
- Requires an explicit `vehicle_id` so the importer never guesses.

Behavior:
1. Parse both CSVs with a real CSV parser or a small safe parser that handles quoted commas.
2. Validate that all part rows share the same VIN.
3. Fetch the target vehicle and confirm its `vin` matches the CSV VIN.
4. Upsert one `ipc_catalogs` row.
5. Upsert diagrams.
6. Insert/upsert parts and link each part to its diagram by branch/group/subgroup.
7. Print counts by branch/group and sample rows.

Safety:
- Dry-run is the default.
- `--apply` must print the exact target vehicle and VIN before writing.
- No deletes on existing app tables.
- If re-import is needed, it should delete/recreate only rows under the one `ipc_catalogs.id`, never
  broad table-wide data.

## 5. UI Design

Add route `/ipc` and a desktop/mobile-more nav item named `IPC`.

Page behavior:
- Uses `activeVehicle` from `VehicleContext`.
- Loads the catalog where `ipc_catalogs.vehicle_id = activeVehicle.id`.
- If no catalog exists, shows a clear empty state: no IPC imported for this vehicle yet.

Layout:
- Header: vehicle name, VIN, catalog source, total diagrams, total parts.
- Controls:
  - search box for part number, replacement number, item name, usage, and remarks
  - group filter
  - branch filter, useful once engine/transmission catalogs are imported
- Diagram list:
  - compact rows/cards with group/subgroup, title, and part count
  - selecting a diagram updates the main panel
- Main panel:
  - diagram title and image from `image_url`
  - source link to ILcats
  - parts table filtered to the selected diagram or search results
- Part row actions:
  - copy part number
  - open price URL
  - open source diagram URL

First version table columns:
- item number
- part number
- name
- quantity
- replacement numbers
- usage
- remarks
- actions

## 6. Future Polo Support

The schema is intentionally catalog-based instead of Mercedes-specific:
- A Polo import creates a second `ipc_catalogs` row tied to the Polo `vehicle_id`.
- The same `/ipc` page works because it keys off `activeVehicle.id`.
- The import script accepts file paths and vehicle id, so no code change is needed for a second car
  unless the Polo CSV format differs materially.

If the Polo source uses a different column shape, add a parser adapter while keeping the same
normalized `ipc_*` tables.

## 7. Manual Support Later

Manuals should not be mixed into the IPC rows. Later options:
- Store manuals in the existing `documents` bucket/table with a new kind such as `Manual`, or
- Add a dedicated `vehicle_manuals` table if manuals need chapters, bookmarks, or search.

For this slice, the IPC page can include a disabled or empty "Manuals coming later" area only if it
does not distract from the working catalog.

## 8. Shared Supabase Guardrails

Because the Supabase project/table space is shared with another financial app:
- Only create clearly app-specific tables: `ipc_catalogs`, `ipc_diagrams`, `ipc_parts`.
- Do not alter generic shared tables.
- Do not add policies with generic names on existing shared objects.
- Do not reuse the existing `parts` table for IPC reference rows.
- Do not add broad delete/restore/reset behavior.
- Keep import operations scoped to one `ipc_catalogs.id`.

## 9. Testing And Verification

Unit tests:
- CSV parsing handles quoted commas and empty fields.
- Import mapping creates stable diagram keys.
- Search helper matches part number, replacement number, and name.

Manual verification:
1. Run importer dry-run for the Mercedes files.
2. Confirm reported VIN is `ADB2020186F450004`.
3. Confirm target vehicle VIN matches before `--apply`.
4. Apply import.
5. Open `/ipc` with the Mercedes selected.
6. Confirm diagram count is 297 and part count is 3079.
7. Search `A2022401617` and see the engine mounting row.
8. Switch to the Polo and confirm the empty state appears until a Polo IPC is imported.

Build verification:
- `npm test`
- `npm run build`

## 10. Implementation Plan Seed

Suggested implementation order:
1. Migration `0017_ipc_catalog.sql`.
2. Pure CSV/import mapping helpers with tests.
3. `scripts/import-ipc.mjs` dry-run, then apply mode.
4. IPC query/search helpers.
5. `src/pages/Ipc.jsx` route and navigation.
6. Verify with Mercedes import and UI smoke test.
