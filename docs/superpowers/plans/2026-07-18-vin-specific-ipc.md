# VIN-Specific IPC Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Supabase-backed, VIN-specific interactive IPC/EPC page for the active vehicle, starting with the Mercedes ILcats CSV export and ready for a future Polo import.

**Architecture:** Dedicated `ipc_*` Supabase tables hold catalogs, diagrams, and parts, keyed by `vehicle_id` and VIN. A dry-run-first Node importer maps the two CSV files into those tables. The React `/ipc` page reads only the active vehicle's catalog and provides browse/search/diagram/part interactions without mixing reference catalog rows into the existing `parts` inventory.

**Tech Stack:** React 19, Vite 8, React Router 7, Supabase JS 2, Vitest 3, plain Node ESM scripts, existing CSS/component conventions.

## Global Constraints

- The Supabase project/table space is shared with another financial app; do not alter generic shared tables.
- Use only clearly app-specific tables: `ipc_catalogs`, `ipc_diagrams`, `ipc_parts`.
- Do not reuse the existing `parts` table for IPC reference rows.
- Do not add broad delete/restore/reset behavior.
- Import operations must be scoped to one `ipc_catalogs.id`.
- Dry-run must be the default for the IPC importer; `--apply` is required for live writes.
- The first catalog is exact-VIN for `ADB2020186F450004`; the same architecture must support a later Polo catalog.
- Manuals are not part of this slice.

---

## File Structure

- Create `supabase/migrations/0017_ipc_catalog.sql`: table/index/RLS migration for `ipc_catalogs`, `ipc_diagrams`, and `ipc_parts`.
- Create `src/lib/ipc/csv.js`: small RFC4180-ish parser for the CSV files.
- Create `src/lib/ipc/importMapping.js`: pure mapping, validation, stable diagram keys, and searchable text helpers.
- Create `src/lib/ipc/importMapping.test.js`: Vitest coverage for parser/mapping/search.
- Create `scripts/import-ipc.mjs`: dry-run/apply importer using service-role key from `.env.local`.
- Create `src/lib/ipc/search.js`: pure helpers used by the page for filtering.
- Create `src/lib/ipc/search.test.js`: focused search/filter tests.
- Create `src/pages/Ipc.jsx`: interactive IPC page.
- Modify `src/App.jsx`: add `/ipc` route.
- Modify `src/components/Layout.jsx`: add desktop/mobile-more IPC nav item.

---

### Task 1: Supabase IPC Schema

**Files:**
- Create: `supabase/migrations/0017_ipc_catalog.sql`

**Interfaces:**
- Produces: tables `public.ipc_catalogs`, `public.ipc_diagrams`, `public.ipc_parts`.
- Later tasks rely on columns exactly as named in this migration.

- [ ] **Step 1: Create migration**

Create `supabase/migrations/0017_ipc_catalog.sql` with:

```sql
-- 0017_ipc_catalog.sql
-- VIN-specific illustrated parts catalog (IPC/EPC) reference data.
-- Dedicated Stallion Pit tables; no shared financial-app tables are altered.

create table if not exists public.ipc_catalogs (
  id                 uuid primary key default gen_random_uuid(),
  vehicle_id         uuid not null references public.vehicles(id) on delete cascade,
  vin                text not null,
  model_code         text,
  engine_code        text,
  gearbox_code       text,
  source_name        text not null default 'ILcats',
  source_file_prefix text,
  notes              text,
  user_id            uuid not null references auth.users(id) default auth.uid(),
  created_at         timestamptz not null default now()
);

create unique index if not exists ipc_catalogs_owner_vin_source_idx
  on public.ipc_catalogs (user_id, vin, source_name);
create index if not exists ipc_catalogs_vehicle_idx
  on public.ipc_catalogs (vehicle_id);
alter table public.ipc_catalogs enable row level security;

create table if not exists public.ipc_diagrams (
  id             uuid primary key default gen_random_uuid(),
  catalog_id     uuid not null references public.ipc_catalogs(id) on delete cascade,
  branch         text not null,
  catalog_group  text not null,
  group_name     text,
  subgroup       text not null,
  diagram_title  text not null,
  part_count     integer not null default 0,
  source_url     text,
  image_url      text,
  user_id        uuid not null references auth.users(id) default auth.uid(),
  created_at     timestamptz not null default now()
);

create unique index if not exists ipc_diagrams_catalog_key_idx
  on public.ipc_diagrams (catalog_id, branch, catalog_group, subgroup);
create index if not exists ipc_diagrams_catalog_group_idx
  on public.ipc_diagrams (catalog_id, catalog_group, subgroup);
alter table public.ipc_diagrams enable row level security;

create table if not exists public.ipc_parts (
  id                  uuid primary key default gen_random_uuid(),
  catalog_id          uuid not null references public.ipc_catalogs(id) on delete cascade,
  diagram_id          uuid references public.ipc_diagrams(id) on delete set null,
  vin                 text not null,
  model_code          text,
  engine_code         text,
  gearbox_code        text,
  branch              text not null,
  catalog_group       text not null,
  group_name          text,
  subgroup            text not null,
  diagram_title       text,
  item_no             text,
  part_number         text not null,
  replacement_numbers text,
  quantity            text,
  name                text not null,
  usage               text,
  remarks             text,
  source_url          text,
  diagram_image_url   text,
  price_url           text,
  user_id             uuid not null references auth.users(id) default auth.uid(),
  created_at          timestamptz not null default now()
);

create index if not exists ipc_parts_catalog_diagram_idx
  on public.ipc_parts (catalog_id, catalog_group, subgroup);
create index if not exists ipc_parts_catalog_part_number_idx
  on public.ipc_parts (catalog_id, part_number);
alter table public.ipc_parts enable row level security;

do $$
declare
  t text;
  tables text[] := array['ipc_catalogs', 'ipc_diagrams', 'ipc_parts'];
begin
  foreach t in array tables loop
    execute format('drop policy if exists "%1$s owner select" on public.%1$I', t);
    execute format('drop policy if exists "%1$s owner insert" on public.%1$I', t);
    execute format('drop policy if exists "%1$s owner update" on public.%1$I', t);
    execute format('drop policy if exists "%1$s owner delete" on public.%1$I', t);
    execute format($f$create policy "%1$s owner select" on public.%1$I for select to authenticated using (auth.uid() = user_id)$f$, t);
    execute format($f$create policy "%1$s owner insert" on public.%1$I for insert to authenticated with check (auth.uid() = user_id)$f$, t);
    execute format($f$create policy "%1$s owner update" on public.%1$I for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)$f$, t);
    execute format($f$create policy "%1$s owner delete" on public.%1$I for delete to authenticated using (auth.uid() = user_id)$f$, t);
  end loop;
end $$;
```

- [ ] **Step 2: Review migration for shared-Supabase safety**

Run:

```powershell
rg -n "alter table public\.(?!ipc_)|truncate|drop table|storage\.objects|documents|parts" supabase\migrations\0017_ipc_catalog.sql
```

Expected: no output except possible references in comments. If output shows changes to non-IPC tables, stop and fix before continuing.

- [ ] **Step 3: Commit**

```powershell
git add supabase\migrations\0017_ipc_catalog.sql
git commit -m "feat(ipc): add catalog schema"
```

---

### Task 2: Pure CSV Parsing And IPC Mapping

**Files:**
- Create: `src/lib/ipc/csv.js`
- Create: `src/lib/ipc/importMapping.js`
- Create: `src/lib/ipc/importMapping.test.js`

**Interfaces:**
- Produces `parseCsv(text: string): Array<Record<string,string>>`.
- Produces `diagramKey(row): string`.
- Produces `buildIpcImport(diagramRows, partRows, { vehicleId, userId, sourceName, sourceFilePrefix })`.
- Produces `searchTextForPart(part): string`.

- [ ] **Step 1: Write failing tests**

Create `src/lib/ipc/importMapping.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { parseCsv } from './csv'
import { diagramKey, buildIpcImport, searchTextForPart } from './importMapping'

const diagramsCsv = `branch,group,group_name,subgroup,diagram_title,part_count,source_url,image_url
body_chassis_44V,24,24,015,ENGINE SUSPENSION,41,https://source.example/diagram,https://img.example/diagram.png
body_chassis_44V,26,26,060,"FLOOR SHIFT,AUTOMATIC TRANSMISSION",44,https://source.example/shift,https://img.example/shift.png
`

const partsCsv = `vin,model_code,engine_code,gearbox_code,branch,catalog_group,group_name,subgroup,diagram_title,item_no,part_number,replacement_numbers,quantity,name,usage,remarks,source_url,diagram_image_url,price_url
ADB2020186F450004,202.018,111.920,717.416,body_chassis_44V,24,24,015,ENGINE SUSPENSION,5,A2022401617,,1,ENGINE MOUNTING FRONT LEFT,,,https://source.example/diagram,https://img.example/diagram.png,https://price.example/A2022401617
ADB2020186F450004,202.018,111.920,717.416,body_chassis_44V,26,26,060,"FLOOR SHIFT,AUTOMATIC TRANSMISSION",10,A2022600109,A2022600209,-,SHIFT LEVER,"423: 5 SPEED AUTOMATIC",M 6X20,https://source.example/shift,https://img.example/shift.png,https://price.example/A2022600109
`

describe('parseCsv', () => {
  it('handles quoted commas and empty fields', () => {
    const rows = parseCsv(diagramsCsv)
    expect(rows).toHaveLength(2)
    expect(rows[1].diagram_title).toBe('FLOOR SHIFT,AUTOMATIC TRANSMISSION')
  })
})

describe('diagramKey', () => {
  it('uses branch, group, and subgroup', () => {
    expect(diagramKey({ branch: 'body', catalog_group: '24', subgroup: '015' })).toBe('body|24|015')
  })
})

describe('buildIpcImport', () => {
  it('normalizes catalog, diagram, and part rows', () => {
    const result = buildIpcImport(parseCsv(diagramsCsv), parseCsv(partsCsv), {
      vehicleId: 'vehicle-1',
      userId: 'user-1',
      sourceName: 'ILcats',
      sourceFilePrefix: 'ilcats-ADB2020186F450004',
    })
    expect(result.catalog).toMatchObject({
      vehicle_id: 'vehicle-1',
      user_id: 'user-1',
      vin: 'ADB2020186F450004',
      model_code: '202.018',
      engine_code: '111.920',
      gearbox_code: '717.416',
    })
    expect(result.diagrams).toHaveLength(2)
    expect(result.parts).toHaveLength(2)
    expect(result.parts[0]).toMatchObject({
      part_number: 'A2022401617',
      name: 'ENGINE MOUNTING FRONT LEFT',
      catalog_group: '24',
      subgroup: '015',
    })
  })

  it('rejects mixed VIN input', () => {
    const rows = parseCsv(partsCsv)
    rows[1].vin = 'DIFFERENT'
    expect(() => buildIpcImport(parseCsv(diagramsCsv), rows, {
      vehicleId: 'vehicle-1',
      userId: 'user-1',
      sourceName: 'ILcats',
      sourceFilePrefix: 'mixed',
    })).toThrow('IPC parts file contains multiple VINs')
  })
})

describe('searchTextForPart', () => {
  it('includes part number, replacement number, name, usage, and remarks', () => {
    const text = searchTextForPart({
      part_number: 'A2022600109',
      replacement_numbers: 'A2022600209',
      name: 'SHIFT LEVER',
      usage: 'AUTOMATIC',
      remarks: 'M 6X20',
    })
    expect(text).toContain('a2022600109')
    expect(text).toContain('a2022600209')
    expect(text).toContain('shift lever')
    expect(text).toContain('automatic')
    expect(text).toContain('m 6x20')
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```powershell
npm test -- src/lib/ipc/importMapping.test.js
```

Expected: FAIL because `src/lib/ipc/csv.js` and `src/lib/ipc/importMapping.js` do not exist.

- [ ] **Step 3: Implement CSV parser**

Create `src/lib/ipc/csv.js`:

```js
export function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let inQuotes = false

  const pushCell = () => {
    row.push(cell)
    cell = ''
  }
  const pushRow = () => {
    if (row.length === 1 && row[0] === '' && rows.length === 0) return
    rows.push(row)
    row = []
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const next = text[i + 1]
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        cell += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      pushCell()
    } else if (ch === '\n') {
      pushCell()
      pushRow()
    } else if (ch !== '\r') {
      cell += ch
    }
  }
  pushCell()
  if (row.some(v => v !== '')) pushRow()

  const [headers, ...body] = rows
  if (!headers) return []
  return body.map(values => Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ''])))
}
```

- [ ] **Step 4: Implement mapping helpers**

Create `src/lib/ipc/importMapping.js`:

```js
const trim = (value) => {
  const text = String(value ?? '').trim()
  return text === '' ? null : text
}

export function diagramKey(row) {
  return [row.branch, row.catalog_group ?? row.group, row.subgroup].map(v => String(v ?? '').trim()).join('|')
}

export function searchTextForPart(part) {
  return [
    part.part_number,
    part.replacement_numbers,
    part.name,
    part.usage,
    part.remarks,
  ].filter(Boolean).join(' ').toLowerCase()
}

export function buildIpcImport(diagramRows, partRows, { vehicleId, userId, sourceName = 'ILcats', sourceFilePrefix = null }) {
  if (!partRows.length) throw new Error('IPC parts file has no rows')
  const vins = [...new Set(partRows.map(r => trim(r.vin)).filter(Boolean))]
  if (vins.length !== 1) throw new Error('IPC parts file contains multiple VINs')
  const first = partRows[0]
  const vin = vins[0]

  const catalog = {
    vehicle_id: vehicleId,
    vin,
    model_code: trim(first.model_code),
    engine_code: trim(first.engine_code),
    gearbox_code: trim(first.gearbox_code),
    source_name: sourceName,
    source_file_prefix: sourceFilePrefix,
    user_id: userId,
  }

  const diagrams = diagramRows.map(row => ({
    branch: trim(row.branch),
    catalog_group: trim(row.group),
    group_name: trim(row.group_name),
    subgroup: trim(row.subgroup),
    diagram_title: trim(row.diagram_title),
    part_count: Number(row.part_count || 0),
    source_url: trim(row.source_url),
    image_url: trim(row.image_url),
    user_id: userId,
    _key: diagramKey({ ...row, catalog_group: row.group }),
  }))

  const parts = partRows.map(row => ({
    vin: trim(row.vin),
    model_code: trim(row.model_code),
    engine_code: trim(row.engine_code),
    gearbox_code: trim(row.gearbox_code),
    branch: trim(row.branch),
    catalog_group: trim(row.catalog_group),
    group_name: trim(row.group_name),
    subgroup: trim(row.subgroup),
    diagram_title: trim(row.diagram_title),
    item_no: trim(row.item_no),
    part_number: trim(row.part_number),
    replacement_numbers: trim(row.replacement_numbers),
    quantity: trim(row.quantity),
    name: trim(row.name),
    usage: trim(row.usage),
    remarks: trim(row.remarks),
    source_url: trim(row.source_url),
    diagram_image_url: trim(row.diagram_image_url),
    price_url: trim(row.price_url),
    user_id: userId,
    _diagramKey: diagramKey(row),
  }))

  return { catalog, diagrams, parts }
}
```

- [ ] **Step 5: Run tests to verify pass**

Run:

```powershell
npm test -- src/lib/ipc/importMapping.test.js
```

Expected: PASS for all tests in `importMapping.test.js`.

- [ ] **Step 6: Commit**

```powershell
git add src\lib\ipc\csv.js src\lib\ipc\importMapping.js src\lib\ipc\importMapping.test.js
git commit -m "feat(ipc): add CSV import mapping"
```

---

### Task 3: Dry-Run-First IPC Importer

**Files:**
- Create: `scripts/import-ipc.mjs`

**Interfaces:**
- Consumes `parseCsv` and `buildIpcImport`.
- Produces command:
  `node scripts/import-ipc.mjs --vehicle-id <uuid> --diagrams <csv> --parts <csv> [--apply]`

- [ ] **Step 1: Create importer**

Create `scripts/import-ipc.mjs`:

```js
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { parseCsv } from '../src/lib/ipc/csv.js'
import { buildIpcImport } from '../src/lib/ipc/importMapping.js'

function readEnv(file) {
  const out = {}
  if (!existsSync(file)) return out
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) out[m[1]] = m[2].trim()
  }
  return out
}

function arg(name) {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : null
}

function fail(message) {
  console.error('\nX ' + message + '\n')
  process.exit(1)
}

const vehicleId = arg('--vehicle-id')
const diagramsFile = arg('--diagrams')
const partsFile = arg('--parts')
const apply = process.argv.includes('--apply')

if (!vehicleId || !diagramsFile || !partsFile) {
  fail('Usage: node scripts/import-ipc.mjs --vehicle-id <uuid> --diagrams <csv> --parts <csv> [--apply]')
}
if (!existsSync(diagramsFile)) fail(`Missing diagrams file: ${diagramsFile}`)
if (!existsSync(partsFile)) fail(`Missing parts file: ${partsFile}`)

const env = { ...readEnv('.env'), ...readEnv('.env.local') }
const url = env.VITE_SUPABASE_URL
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
if (!url) fail('Missing VITE_SUPABASE_URL in .env')
if (!serviceKey || serviceKey.includes('PASTE') || serviceKey.length < 20) {
  fail('Missing SUPABASE_SERVICE_ROLE_KEY in .env.local')
}
if (serviceKey.startsWith('sb_publishable') || /anon/i.test(serviceKey)) {
  fail('That looks like the ANON/publishable key. This import needs the service_role key.')
}

const diagramRows = parseCsv(readFileSync(diagramsFile, 'utf8'))
const partRows = parseCsv(readFileSync(partsFile, 'utf8'))
const userId = env.IMPORT_USER_ID || env.SEED_OWNER_UID || null
if (!userId) fail('Set IMPORT_USER_ID in the environment for owner-stamped IPC rows.')

const mapped = buildIpcImport(diagramRows, partRows, {
  vehicleId,
  userId,
  sourceName: 'ILcats',
  sourceFilePrefix: partsFile.replace(/^.*[\\/]/, '').replace(/-parts.*$/i, ''),
})

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

const { data: vehicle, error: vehicleError } = await admin
  .from('vehicles')
  .select('id, name, make, model, year, vin, user_id')
  .eq('id', vehicleId)
  .single()
if (vehicleError) fail(`Could not read target vehicle: ${vehicleError.message}`)
if ((vehicle.vin || '').trim() !== mapped.catalog.vin) {
  fail(`VIN mismatch. Vehicle "${vehicle.name}" has "${vehicle.vin}", IPC file has "${mapped.catalog.vin}".`)
}
if (vehicle.user_id !== userId) {
  fail(`Owner mismatch. Vehicle user_id is ${vehicle.user_id}, IMPORT_USER_ID is ${userId}.`)
}

const byBranch = new Map()
for (const d of mapped.diagrams) byBranch.set(d.branch, (byBranch.get(d.branch) || 0) + 1)

console.log(`\n${apply ? 'IMPORTING' : 'DRY RUN'} IPC catalog`)
console.log(`Vehicle: ${vehicle.name} | ${vehicle.year} ${vehicle.make} ${vehicle.model}`)
console.log(`VIN: ${mapped.catalog.vin}`)
console.log(`Diagrams: ${mapped.diagrams.length}`)
console.log(`Parts: ${mapped.parts.length}`)
console.log('Branches:', [...byBranch.entries()].map(([k, v]) => `${k}=${v}`).join(', '))
console.log('Sample part:', mapped.parts[0]?.part_number, mapped.parts[0]?.name)

if (!apply) {
  console.log('\nDry run complete. Re-run with --apply to write IPC rows.\n')
  process.exit(0)
}

const { data: catalog, error: catalogError } = await admin
  .from('ipc_catalogs')
  .upsert([mapped.catalog], { onConflict: 'user_id,vin,source_name' })
  .select('id')
  .single()
if (catalogError) fail(`Catalog upsert failed: ${catalogError.message}`)

await admin.from('ipc_parts').delete().eq('catalog_id', catalog.id)
await admin.from('ipc_diagrams').delete().eq('catalog_id', catalog.id)

const diagramsForInsert = mapped.diagrams.map(({ _key, ...row }) => ({ ...row, catalog_id: catalog.id }))
const { data: insertedDiagrams, error: diagramError } = await admin
  .from('ipc_diagrams')
  .insert(diagramsForInsert)
  .select('id, branch, catalog_group, subgroup')
if (diagramError) fail(`Diagram insert failed: ${diagramError.message}`)

const diagramIds = new Map(insertedDiagrams.map(d => [[d.branch, d.catalog_group, d.subgroup].join('|'), d.id]))
const partRowsForInsert = mapped.parts.map(({ _diagramKey, ...row }) => ({
  ...row,
  catalog_id: catalog.id,
  diagram_id: diagramIds.get(_diagramKey) || null,
}))

const chunk = 500
let inserted = 0
for (let i = 0; i < partRowsForInsert.length; i += chunk) {
  const slice = partRowsForInsert.slice(i, i + chunk)
  const { error } = await admin.from('ipc_parts').insert(slice)
  if (error) fail(`Part insert failed after ${inserted} rows: ${error.message}`)
  inserted += slice.length
}

console.log(`\nImported IPC catalog ${catalog.id}: ${insertedDiagrams.length} diagrams, ${inserted} parts.\n`)
```

- [ ] **Step 2: Run importer dry-run**

Run:

```powershell
$env:IMPORT_USER_ID="3563089a-faec-4143-8b6e-34fd7ca2d5ec"; node scripts\import-ipc.mjs --vehicle-id <MERCEDES_VEHICLE_ID> --diagrams "IPC\ilcats-ADB2020186F450004-diagrams (1).csv" --parts "IPC\ilcats-ADB2020186F450004-parts (1).csv"
```

Expected: dry-run output shows VIN `ADB2020186F450004`, 297 diagrams, 3079 parts. If vehicle id is unknown, first query `vehicles` using Supabase tools or a one-off read-only script, then rerun dry-run.

- [ ] **Step 3: Confirm dry-run has no writes**

Run:

```powershell
rg -n "Dry run complete|--apply|delete\\(\\)|insert\\(" scripts\import-ipc.mjs
```

Expected: dry-run exits before any delete/insert path.

- [ ] **Step 4: Commit**

```powershell
git add scripts\import-ipc.mjs
git commit -m "feat(ipc): add dry-run importer"
```

---

### Task 4: IPC Search Helpers

**Files:**
- Create: `src/lib/ipc/search.js`
- Create: `src/lib/ipc/search.test.js`

**Interfaces:**
- Produces `matchesPart(part, query): boolean`.
- Produces `filterParts(parts, { query, diagramId, group, branch }): Array`.
- Produces `groupOptions(diagrams): Array<{ value: string, label: string, count: number }>`.

- [ ] **Step 1: Write failing tests**

Create `src/lib/ipc/search.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { matchesPart, filterParts, groupOptions } from './search'

const parts = [
  { id: 'p1', diagram_id: 'd1', branch: 'body', catalog_group: '24', part_number: 'A2022401617', replacement_numbers: '', name: 'ENGINE MOUNTING FRONT LEFT', usage: '', remarks: '' },
  { id: 'p2', diagram_id: 'd2', branch: 'body', catalog_group: '26', part_number: 'A2022600109', replacement_numbers: 'A2022600209', name: 'SHIFT LEVER', usage: 'AUTOMATIC', remarks: 'M 6X20' },
]

describe('matchesPart', () => {
  it('matches part number, replacement number, name, usage, and remarks', () => {
    expect(matchesPart(parts[0], 'A2022401617')).toBe(true)
    expect(matchesPart(parts[1], 'A2022600209')).toBe(true)
    expect(matchesPart(parts[1], 'shift')).toBe(true)
    expect(matchesPart(parts[1], 'automatic')).toBe(true)
    expect(matchesPart(parts[1], 'm 6x20')).toBe(true)
  })
})

describe('filterParts', () => {
  it('filters by query, diagram, group, and branch', () => {
    expect(filterParts(parts, { query: 'engine' }).map(p => p.id)).toEqual(['p1'])
    expect(filterParts(parts, { diagramId: 'd2' }).map(p => p.id)).toEqual(['p2'])
    expect(filterParts(parts, { group: '24' }).map(p => p.id)).toEqual(['p1'])
    expect(filterParts(parts, { branch: 'body' }).map(p => p.id)).toEqual(['p1', 'p2'])
  })
})

describe('groupOptions', () => {
  it('counts diagrams per group', () => {
    expect(groupOptions([
      { catalog_group: '24', group_name: '24' },
      { catalog_group: '24', group_name: '24' },
      { catalog_group: '26', group_name: '26' },
    ])).toEqual([
      { value: '24', label: '24', count: 2 },
      { value: '26', label: '26', count: 1 },
    ])
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

```powershell
npm test -- src/lib/ipc/search.test.js
```

Expected: FAIL because `search.js` does not exist.

- [ ] **Step 3: Implement helper**

Create `src/lib/ipc/search.js`:

```js
const haystack = (part) => [
  part.part_number,
  part.replacement_numbers,
  part.name,
  part.usage,
  part.remarks,
].filter(Boolean).join(' ').toLowerCase()

export function matchesPart(part, query) {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return true
  return haystack(part).includes(q)
}

export function filterParts(parts, { query = '', diagramId = '', group = '', branch = '' } = {}) {
  return (parts || []).filter(part => {
    if (diagramId && part.diagram_id !== diagramId) return false
    if (group && part.catalog_group !== group) return false
    if (branch && part.branch !== branch) return false
    return matchesPart(part, query)
  })
}

export function groupOptions(diagrams) {
  const counts = new Map()
  for (const diagram of diagrams || []) {
    const key = diagram.catalog_group
    if (!key) continue
    const current = counts.get(key) || { value: key, label: diagram.group_name || key, count: 0 }
    current.count += 1
    counts.set(key, current)
  }
  return [...counts.values()].sort((a, b) => String(a.value).localeCompare(String(b.value)))
}
```

- [ ] **Step 4: Run tests to verify pass**

```powershell
npm test -- src/lib/ipc/search.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src\lib\ipc\search.js src\lib\ipc\search.test.js
git commit -m "feat(ipc): add catalog search helpers"
```

---

### Task 5: IPC Page, Route, And Navigation

**Files:**
- Create: `src/pages/Ipc.jsx`
- Modify: `src/App.jsx`
- Modify: `src/components/Layout.jsx`

**Interfaces:**
- Consumes `filterParts` and `groupOptions`.
- Consumes Supabase tables from Task 1.
- Produces route `/ipc`.

- [ ] **Step 1: Create page**

Create `src/pages/Ipc.jsx`:

```jsx
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useVehicle } from '../contexts/VehicleContext'
import { supabase } from '../lib/supabase'
import { filterParts, groupOptions } from '../lib/ipc/search'

const copyText = async (text) => {
  try { await navigator.clipboard.writeText(text) } catch { /* non-fatal */ }
}

export default function Ipc() {
  const { activeVehicle } = useVehicle()
  const [catalog, setCatalog] = useState(null)
  const [diagrams, setDiagrams] = useState([])
  const [parts, setParts] = useState([])
  const [selectedDiagramId, setSelectedDiagramId] = useState('')
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState('')
  const [branch, setBranch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchData = useCallback(async () => {
    if (!activeVehicle) return
    setLoading(true)
    setError(null)
    setCatalog(null)
    setDiagrams([])
    setParts([])
    setSelectedDiagramId('')

    const { data: cat, error: catErr } = await supabase
      .from('ipc_catalogs')
      .select('*')
      .eq('vehicle_id', activeVehicle.id)
      .maybeSingle()
    if (catErr) {
      setError(catErr.message)
      setLoading(false)
      return
    }
    if (!cat) {
      setLoading(false)
      return
    }

    const [{ data: diagramRows, error: diagramErr }, { data: partRows, error: partErr }] = await Promise.all([
      supabase.from('ipc_diagrams').select('*').eq('catalog_id', cat.id).order('catalog_group').order('subgroup'),
      supabase.from('ipc_parts').select('*').eq('catalog_id', cat.id).order('catalog_group').order('subgroup').order('item_no'),
    ])
    if (diagramErr || partErr) {
      setError(diagramErr?.message || partErr?.message)
      setLoading(false)
      return
    }
    setCatalog(cat)
    setDiagrams(diagramRows || [])
    setParts(partRows || [])
    setSelectedDiagramId(diagramRows?.[0]?.id || '')
    setLoading(false)
  }, [activeVehicle])

  useEffect(() => { fetchData() }, [fetchData])

  const groups = useMemo(() => groupOptions(diagrams), [diagrams])
  const branches = useMemo(() => [...new Set(diagrams.map(d => d.branch).filter(Boolean))].sort(), [diagrams])
  const selectedDiagram = diagrams.find(d => d.id === selectedDiagramId) || null
  const shownParts = useMemo(() => filterParts(parts, {
    query,
    diagramId: query ? '' : selectedDiagramId,
    group,
    branch,
  }), [parts, query, selectedDiagramId, group, branch])
  const visibleDiagrams = diagrams.filter(d =>
    (!group || d.catalog_group === group) &&
    (!branch || d.branch === branch)
  )

  if (!activeVehicle) return (
    <div className="page">
      <div className="page-header"><h2>IPC</h2></div>
      <div className="placeholder-card"><p>Select a vehicle to view its parts catalog</p></div>
    </div>
  )

  return (
    <div className="page">
      <div className="page-header">
        <h2>IPC</h2>
        <p className="page-sub">
          {activeVehicle.name} {activeVehicle.vin ? `· VIN ${activeVehicle.vin}` : ''}
          {catalog ? ` · ${diagrams.length} diagrams · ${parts.length} parts` : ''}
        </p>
      </div>

      {error && <div className="form-error">{error}</div>}

      {loading ? (
        <div className="placeholder-card"><p>Loading IPC...</p></div>
      ) : !catalog ? (
        <div className="placeholder-card">
          <p>No IPC imported for this vehicle yet.</p>
        </div>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="form-row-2">
              <div className="form-group">
                <label>Search parts</label>
                <input value={query} onChange={e => setQuery(e.target.value)}
                  placeholder="part number, replacement, name, usage, remarks" />
              </div>
              <div className="form-group">
                <label>Group</label>
                <select value={group} onChange={e => { setGroup(e.target.value); setSelectedDiagramId('') }}>
                  <option value="">All groups</option>
                  {groups.map(g => <option key={g.value} value={g.value}>{g.label} ({g.count})</option>)}
                </select>
              </div>
            </div>
            <div className="form-row-2">
              <div className="form-group">
                <label>Branch</label>
                <select value={branch} onChange={e => { setBranch(e.target.value); setSelectedDiagramId('') }}>
                  <option value="">All branches</option>
                  {branches.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Catalog</label>
                <input value={`${catalog.source_name} · ${catalog.model_code || ''} ${catalog.engine_code || ''} ${catalog.gearbox_code || ''}`.trim()} readOnly />
              </div>
            </div>
          </div>

          <div className="ipc-layout" style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 320px) 1fr', gap: 16 }}>
            <div className="table-wrapper">
              <table className="data-table">
                <thead><tr><th>Diagram</th><th>Parts</th></tr></thead>
                <tbody>
                  {visibleDiagrams.map(d => (
                    <tr key={d.id} onClick={() => setSelectedDiagramId(d.id)} style={{ cursor: 'pointer' }}>
                      <td className={selectedDiagramId === d.id ? 'primary' : ''}>
                        {d.catalog_group}/{d.subgroup}
                        <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{d.diagram_title}</div>
                      </td>
                      <td className="mono">{d.part_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              {selectedDiagram && (
                <div className="card" style={{ marginBottom: 16 }}>
                  <div className="card-label">{selectedDiagram.catalog_group}/{selectedDiagram.subgroup}</div>
                  <h3 style={{ marginTop: 4 }}>{selectedDiagram.diagram_title}</h3>
                  {selectedDiagram.image_url && (
                    <div style={{ marginTop: 12, background: '#fff', borderRadius: 4, overflow: 'auto' }}>
                      <img src={selectedDiagram.image_url} alt={selectedDiagram.diagram_title}
                        style={{ display: 'block', maxWidth: '100%', height: 'auto', margin: '0 auto' }} />
                    </div>
                  )}
                  {selectedDiagram.source_url && (
                    <button className="row-btn" style={{ marginTop: 10 }}
                      onClick={() => window.open(selectedDiagram.source_url, '_blank', 'noopener')}>Open source</button>
                  )}
                </div>
              )}

              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr><th>Item</th><th>Part Number</th><th>Name</th><th>Qty</th><th>Replacement</th><th>Notes</th><th></th></tr>
                  </thead>
                  <tbody>
                    {shownParts.map(part => (
                      <tr key={part.id}>
                        <td className="mono">{part.item_no || '-'}</td>
                        <td className="mono primary">{part.part_number}</td>
                        <td>{part.name}</td>
                        <td className="mono">{part.quantity || '-'}</td>
                        <td className="mono">{part.replacement_numbers || '-'}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                          {[part.usage, part.remarks].filter(Boolean).join(' · ') || '-'}
                        </td>
                        <td>
                          <div className="row-actions">
                            <button className="row-btn" onClick={() => copyText(part.part_number)}>Copy</button>
                            {part.price_url && <button className="row-btn" onClick={() => window.open(part.price_url, '_blank', 'noopener')}>Price</button>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add route**

Modify `src/App.jsx`:

```jsx
import Ipc from './pages/Ipc'
```

Add inside private child routes:

```jsx
<Route path="ipc" element={<Ipc />} />
```

- [ ] **Step 3: Add nav item**

Modify `src/components/Layout.jsx` by adding this to `NAV_ITEMS` near `Parts`:

```js
{ path: '/ipc', label: 'IPC', short: 'IPC', icon: '▦', desktopOnly: true },
```

- [ ] **Step 4: Run build**

```powershell
npm run build
```

Expected: build completes. If CSS layout is cramped on mobile, keep IPC in the More menu and add responsive CSS in the next step.

- [ ] **Step 5: Add responsive CSS only if needed**

If the two-column grid overflows, add to `src/App.css` or `src/index.css` near existing responsive rules:

```css
@media (max-width: 900px) {
  .ipc-layout {
    grid-template-columns: 1fr !important;
  }
}
```

Run `npm run build` again. Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src\pages\Ipc.jsx src\App.jsx src\components\Layout.jsx src\App.css src\index.css
git commit -m "feat(ipc): add interactive catalog page"
```

---

### Task 6: Apply Migration, Import Mercedes Catalog, And Verify

**Files:**
- No new files expected.
- Uses: `supabase/migrations/0017_ipc_catalog.sql`
- Uses: `scripts/import-ipc.mjs`

**Interfaces:**
- Consumes completed schema/importer/UI.
- Produces live IPC data for the Mercedes vehicle.

- [ ] **Step 1: Apply migration carefully**

Manual fallback:
1. Open Supabase SQL editor for the Stallion Pit project.
2. Paste all of `supabase/migrations/0017_ipc_catalog.sql`.
3. Click Run.
4. Expected result: tables `ipc_catalogs`, `ipc_diagrams`, and `ipc_parts` exist.

Ready-to-paste AI prompt for Supabase/Railway-style assistant:

```text
Apply only the SQL migration in supabase/migrations/0017_ipc_catalog.sql for the Stallion Pit project. Do not alter any existing non-IPC tables. Confirm that only public.ipc_catalogs, public.ipc_diagrams, and public.ipc_parts are created or changed, with owner-scoped RLS policies.
```

- [ ] **Step 2: Find Mercedes vehicle id**

Run a read-only Supabase query or equivalent:

```sql
select id, name, make, model, year, vin, user_id
from public.vehicles
where vin = 'ADB2020186F450004';
```

Expected: one Mercedes row. Copy `id` and `user_id`.

- [ ] **Step 3: Dry-run import**

```powershell
$env:IMPORT_USER_ID="<USER_ID_FROM_STEP_2>"; node scripts\import-ipc.mjs --vehicle-id <MERCEDES_VEHICLE_ID> --diagrams "IPC\ilcats-ADB2020186F450004-diagrams (1).csv" --parts "IPC\ilcats-ADB2020186F450004-parts (1).csv"
```

Expected:
- `DRY RUN IPC catalog`
- VIN `ADB2020186F450004`
- `Diagrams: 297`
- `Parts: 3079`

- [ ] **Step 4: Apply import**

```powershell
$env:IMPORT_USER_ID="<USER_ID_FROM_STEP_2>"; node scripts\import-ipc.mjs --vehicle-id <MERCEDES_VEHICLE_ID> --diagrams "IPC\ilcats-ADB2020186F450004-diagrams (1).csv" --parts "IPC\ilcats-ADB2020186F450004-parts (1).csv" --apply
```

Expected: importer reports one catalog id, 297 diagrams, and 3079 parts.

- [ ] **Step 5: Verify row counts**

Run:

```sql
select c.vin, count(distinct d.id) as diagrams, count(p.id) as parts
from public.ipc_catalogs c
left join public.ipc_diagrams d on d.catalog_id = c.id
left join public.ipc_parts p on p.catalog_id = c.id
where c.vin = 'ADB2020186F450004'
group by c.vin;
```

Expected: `diagrams = 297`, `parts = 3079`.

- [ ] **Step 6: Browser smoke test**

1. Start dev server: `npm run dev`.
2. Open `http://localhost:5173`.
3. Log in if needed.
4. Select the Mercedes vehicle.
5. Open `More -> IPC` or desktop sidebar `IPC`.
6. Expected: IPC header shows catalog counts.
7. Search `A2022401617`.
8. Expected: part row `ENGINE MOUNTING FRONT LEFT` appears.
9. Switch to the Polo.
10. Expected: empty state says no IPC imported for this vehicle yet.

- [ ] **Step 7: Full verification**

```powershell
npm test
npm run build
```

Expected: all tests pass and build completes.

- [ ] **Step 8: Commit any final fixes**

```powershell
git status --short
git add <only files changed for IPC>
git commit -m "feat(ipc): import Mercedes catalog"
```

Only commit if the implementation changed files after previous task commits. Do not stage untracked `.claude/`, `Data/`, or `IPC/` unless Chris explicitly wants the raw IPC files tracked.

---

## Self-Review

Spec coverage:
- Dedicated Supabase tables: Task 1.
- VIN-specific Mercedes import and future Polo support: Tasks 3 and 6.
- Interactive page: Task 5.
- Dry-run-first importer: Task 3.
- Shared Supabase guardrails: Global constraints, Task 1 review, Task 3 scoped deletes, Task 6 migration prompt.
- Manuals excluded: Global constraints and no task creates manual features.

No placeholders:
- The plan intentionally leaves `<MERCEDES_VEHICLE_ID>` and `<USER_ID_FROM_STEP_2>` as runtime values obtained in Task 6 Step 2. These are not design placeholders; they must be read from the live database immediately before import to avoid guessing.

Type consistency:
- `catalog_group`, `subgroup`, `branch`, `diagram_id`, and `catalog_id` names match across migration, importer, search helper, and UI.
