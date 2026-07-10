# Stallion Pit — Parts Photos, Supplier Links & Fetch-Details Autofill — Design Spec

**Date:** 2026-07-11 (revised same day after testing real source data)
**Status:** Approved for planning
**Depends on:** `parts` (0002/0012), `documents` (0014) — both already live.

**Revision note:** the first draft of this spec assumed the source data was autodoc.co.uk links in
GBP. Reading the real file (`Data/Polo.xls.xlsx`) and test-fetching a few of its actual links showed
that's wrong: the real workflow uses **neoriginal.ru** (OEM part lookup, ~40% of the time shows a
price in whatever currency, rarely a photo) and **ilcats.ru** (an Electronic Parts Catalog used only
to confirm the correct OEM number, not a shop) to identify the right part, with the actual *purchase*
happening on whatever site has it in stock — which varies per part. The design below reflects that:
"Fetch details" targets **any pasted product link**, not one host, and price display is
currency-aware rather than assuming GBP.

## 1. Purpose

Populate the Parts page with a real ~40-item parts list for the 2004 VW Polo Classic (ZA spec),
sourced from `Data/Polo.xls.xlsx` (OEM numbers researched via neoriginal.ru/ilcats.ru). Make the
underlying workflow repeatable going forward: paste whichever product link you actually buy a part
from and have the app pull its name, price, and photo automatically — instead of manually
screenshotting/copy-pasting into a spreadsheet as done today.

## 2. Goals / non-goals

**Goals**
- Attach a supplier link and a photo to a part.
- One-click "Search on Autodoc" convenience (no scraping — just a prefilled search URL; one common
  starting point among several, not the only source).
- "Fetch details" — given *any* pasted product URL, auto-fill part name, show a price hint (with
  currency auto-detected and roughly converted to KES), and attach the product photo when present.
- One-time bulk import of the VW parts list directly from `Data/Polo.xls.xlsx` (already read
  successfully) using the same fetch logic, so all real rows get populated without manual re-entry.

**Non-goals**
- No general web search across multiple sites for a part number — the user still finds the specific
  product page themselves (via neoriginal.ru, Autodoc, AliExpress, a local shop, wherever); the app
  only fetches metadata from a URL already chosen.
- No live FX/shipping-rate API — currency→KES conversion is a small static, editable table, and
  shipping is one flat estimate, both clearly labeled "approx," never written as fact into
  `unit_cost_kes`.
- No permanent in-app CSV/XLSX import UI — the bulk import is a one-off local script.
- No changes to existing `parts`/`documents` RLS policies.

## 3. Data model

### `supabase/migrations/0016_parts_supplier_url.sql`
Additive, nullable — existing rows/UI unaffected:
```sql
alter table public.parts add column if not exists supplier_url text;
```

### Photos
No new table. Reuse `public.documents` exactly as `Documents.jsx` already uses it:
`kind = 'Photo'`, `part_id = <parts.id>`, file in the existing private `documents` storage bucket.
`PartsLog.jsx` queries `documents` where `part_id = this part` to show a thumbnail, the same way
`Documents.jsx` already builds signed-URL thumbnails for images (`isImage(mime_type)` +
`createSignedUrl`).

## 4. Shared parsing/fetch module — `src/lib/fetchPart/`

One implementation, used by both the API route (§5) and the import script (§7) — no duplicated
scraping logic.

- **`parseProductPage.js`** — pure function `parseProductHtml(html) → { title, imageUrl, price,
  currencyCode }`. Extracts via string/regex, no new dependency (no cheerio):
  1. Look for a `<script type="application/ld+json">` block containing a `Product` node; if found,
     `JSON.parse` it and read `name`, `image`, `offers.price`, `offers.priceCurrency` (an ISO 4217
     code like `GBP`/`RUB`/`ZAR` when present — the most reliable currency signal).
  2. Fall back to `<meta property="og:title" content="...">` / `og:image` if JSON-LD is missing or
     incomplete.
  3. If no structured currency code was found but a price-looking string was (e.g. "875,75 ₽" or
     "£24.99"), map common symbols (`£`→GBP, `€`→EUR, `$`→USD, `₽`→RUB, `R`→ZAR, `Ksh`/`KES`→KES) to
     a code; if the symbol is ambiguous or absent, leave `currencyCode` and `price` as the raw matched
     text only — never guess a currency.
  4. Any field that can't be found comes back `null`/unset — never throws on a partial or "no data"
     page. Unit-tested against fixture HTML snippets (JSON-LD-with-Product, JSON-LD-partial,
     meta-tags-only, symbol-only price, and a "nothing found" page) — no live network calls in tests.
- **`resolvePastedPart.js`** — impure: `resolvePastedPart(url, { supabaseAdmin, userId }) → {
  title, price, currencyCode, documentPath }`.
  1. Basic SSRF hygiene, since this now accepts an arbitrary user-pasted URL rather than one
     allow-listed host: reject non-`http(s)` schemes, reject hostnames that resolve to loopback/
     private/link-local IP ranges (`127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`,
     `169.254.0.0/16`, `::1`) or literal `localhost`. This only matters if the caller's own session
     were ever compromised (the endpoint requires the app's normal auth), but it's cheap insurance —
     the same class of guard any link-preview/unfurl feature applies.
  2. `fetch(url)` server-side with a normal browser `User-Agent` header and a timeout, capped response
     size, and at most 2 redirects followed; calls `parseProductHtml`.
  3. If `imageUrl` was found: fetches the image bytes, generates an id (`newId()` from the existing
     `src/lib/docs.js` — already isomorphic, no React/browser dependency), builds its storage path
     (`storagePath(userId, id, imageUrl)`), and uploads to the `documents` bucket via
     `supabaseAdmin.storage`.
  4. Returns `{ title, price, currencyCode, documentPath }` — any field may be `null`; callers still
     get whatever subset was found (commonly: title only, or title + price, rarely + photo, based on
     what real neoriginal.ru pages showed during testing).

## 5. Backend — `api/fetch-part.js` (Vercel serverless function)

- `POST { url }` → calls `resolvePastedPart(url, { supabaseAdmin, userId })` and returns the result
  as JSON, or a 4xx with a plain error message on an unfetchable/rejected URL.
- `supabaseAdmin` is a service-role Supabase client constructed inside the function from
  `process.env.SUPABASE_SERVICE_ROLE_KEY` — set as a Vercel-only env var, never sent to the browser,
  separate from the existing `VITE_SUPABASE_ANON_KEY` used client-side.
- `userId` comes from the caller's Supabase session (verify the request's bearer token server-side
  before using it as the storage folder) so the uploaded photo lands under that user's existing
  owner-scoped `documents` folder convention.
- No change needed to `vercel.json`: Vercel resolves an actual serverless function under `/api`
  before falling back to the SPA catch-all rewrite, so `/api/fetch-part` won't be swallowed by the
  `index.html` rewrite. Confirmed as a build/smoke-test step, not left as an assumption.

## 6. Frontend — `PartsLog.jsx`

- **Form**: new **Part link** field (`supplier_url`) with two buttons next to it:
  - **Search on Autodoc** — `window.open('https://www.autodoc.co.uk/search?keyword=' +
    encodeURIComponent(part_number || part_name), '_blank', 'noopener')`. Pure convenience, no
    network call from our side, cannot break. (One quick-search shortcut among several possible
    sources — not implying Autodoc is where the part is actually bought.)
  - **Fetch details** — POSTs whatever link is pasted (any site) to `/api/fetch-part`; on success,
    fills **Part Name** only if it's currently blank, and shows a price hint under **Unit Cost
    (KES)**, e.g.: `Found: 875.75 ₽ → approx KES 4,726 (rate + shipping estimate)` when a currency
    was recognized — computed via `estimateLandedKes` below (875.75 × 1.4 + 3,500) — or just
    `Found: 875.75 ₽` (no KES conversion) when it wasn't. Unit Cost itself stays a plain editable
    number input — the hint never silently overwrites it.
  - The returned `documentPath` (if any) is held in local form state; once the part is saved
    (insert/update returns the row `id`), a `documents` row is inserted
    (`kind: 'Photo', part_id: <id>, file_path: documentPath`), mirroring the insert shape
    `Documents.jsx` already uses.
- **Price estimate constants** — `src/lib/priceEstimate.js`:
  ```js
  // Rough, manually-maintained estimates — update whenever they drift noticeably.
  // Rates as of 2026-07; not live data.
  export const CURRENCY_TO_KES = {
    GBP: 205,
    USD: 130,
    EUR: 150,
    RUB: 1.4,
    ZAR: 7.5,
    KES: 1,
  }
  export const SHIPPING_ESTIMATE_KES = 3500 // flat rough per-parcel estimate, any source

  export function estimateLandedKes(price, currencyCode) {
    if (price == null || currencyCode == null) return null
    const rate = CURRENCY_TO_KES[currencyCode.toUpperCase()]
    if (rate == null) return null           // unrecognized currency — no guess
    return price * rate + SHIPPING_ESTIMATE_KES
  }
  ```
- **List view**: part row thumbnail — small image if a `documents` row with `kind='Photo'` and
  matching `part_id` exists (batch-fetch signed URLs the same way `Documents.jsx` does for its
  grid, keyed by `part_id` instead of `doc.id`), else the existing text-only row. In practice many
  rows won't have one — that's an expected, not exceptional, outcome.

## 7. One-off bulk import — `scripts/import-parts.mjs`

Reads `Data/Polo.xls.xlsx` **directly** — no CSV export needed; already confirmed readable (Python/
openpyxl inspection during design). The real sheet is not a clean one-row-per-part table:

- Most parts: description in column A, `OEM number` + a `neoriginal.ru` link in column B, followed a
  couple of rows later by a `From <ilcats.ru ...>` reference row (the citation for where the number
  was confirmed — informational only, not imported as its own part or stored on the row).
- A few parts have extra column-A-only lines directly under them before the next entry — either
  alternate/equivalent part numbers (e.g. "035 133 335", "N 100 834 01") or vehicle-variant notes
  (e.g. "rhd", "petrol eng.+", "automatic"). These get appended to that part's `notes`/
  `equivalent_numbers`, not inserted as separate parts.
- A handful of rows near the top (e.g. "1. Sump", "2. Drivers window switch") have a description but
  no researched number/link yet — still imported, as a part row with just `part_name` set, so they
  show up in the app as "still needs a number," matching what they actually are.

Because this file's row-grouping needs judgement calls (matching the heuristics above), it's done in
two steps rather than one blind pass:
1. A throwaway pre-processing pass (I run this once, not part of the app or repo) reads the xlsx and
   groups rows into a clean list of `{ part_name, part_number, supplier_url, notes }` entries,
   printed for a quick sanity check against the original file before anything touches the database.
2. `scripts/import-parts.mjs` (matches the existing `scripts/backup.mjs` convention — plain Node ESM,
   not part of the shipped app) takes that clean list, and for each entry with a `supplier_url` calls
   `resolvePastedPart` (same module, §4) to attempt a price/photo; inserts a `parts` row (category
   defaulted to `'Other'` for later manual cleanup) and, if a photo was uploaded, a `documents` row.
- Usage: `node scripts/import-parts.mjs <vehicle_id>` (vehicle confirmed with Chris before running —
  whichever vehicle in the app corresponds to this VW Polo).
- Continues past a failing row (dead link, page changed shape, network blip) rather than aborting the
  batch; prints a final summary — `imported: N, no-link: N, failed: N` with the failed entries'
  identifying text — so nothing silently vanishes.
- Needs the same `SUPABASE_SERVICE_ROLE_KEY` (read from a local `.env`, never committed) to bypass
  RLS for the one-time insert on Chris's behalf.
- Dry-run against a handful of entries first (print what would be inserted, no writes) before running
  it for real against the whole file.

## 8. Error handling

- `parseProductHtml` never throws on a page it can't fully parse — returns whatever subset of
  `{title, imageUrl, price, currencyCode}` it found, including nothing at all (the "no data" case
  seen on real neoriginal.ru pages during testing is a normal, expected result, not an error).
- `resolvePastedPart` only throws on a genuinely bad URL (wrong scheme, private/loopback host,
  unreachable, or response too large) — `/api/fetch-part` turns that into a 4xx JSON body
  (`{ error: '...' }`); the "Fetch details" button shows that message inline (reusing the existing
  `form-error` styling) rather than hanging or failing silently.
- Import script: per-row try/catch, failures logged with the row's part name/link and counted in the
  summary, loop continues.

## 9. Testing

- `parseProductPage.test.js` — fixture-HTML unit tests: JSON-LD Product present, JSON-LD partial
  (missing price), meta-tags-only, symbol-only price with no structured currency, and a genuinely
  empty/"no data" page — no live network calls, consistent with this repo's existing pure-function
  test style (`fuelUsage.test.js`, `parts.test.js`).
- `priceEstimate.test.js` — `estimateLandedKes`: known currency, unrecognized currency → null, null
  price → null, basic arithmetic check.
- Manual: paste a couple of real links (a neoriginal.ru one that showed a price during design, and an
  Autodoc one) in dev, confirm Fetch details fills whatever each page actually has, and a photo (when
  present) shows up against the part and in the Documents page.
- Manual: run the import script's dry-run against a handful of entries first, confirm the grouping
  heuristics matched the real file correctly, before running it for real against the whole list.

## 10. Work breakdown

1. `0016_parts_supplier_url.sql` — add column; apply live.
2. `src/lib/fetchPart/parseProductPage.js` + tests (fixtures).
3. `src/lib/fetchPart/resolvePastedPart.js` (uses `parseProductPage.js` + `docs.js` helpers + SSRF
   guard).
4. `api/fetch-part.js` — Vercel function wiring auth + the resolver; set
   `SUPABASE_SERVICE_ROLE_KEY` in Vercel project env vars.
5. `src/lib/priceEstimate.js` + tests.
6. `PartsLog.jsx` — Part link field, Search/Fetch buttons, price hint, post-save documents insert,
   list thumbnail.
7. Pre-process `Data/Polo.xls.xlsx` into a clean entry list (sanity-checked against the source);
   confirm target `vehicle_id` with Chris; `scripts/import-parts.mjs`; dry-run, then run for real.
8. Build / lint / tests; commit.

## 11. Success criteria

- [ ] `0016` applied live; existing parts unaffected.
- [ ] Pasting a real product URL (any site) and clicking Fetch details fills whatever the page
      actually has — name, and price/photo when present — without erroring on pages with neither.
- [ ] "Search on Autodoc" opens a correctly prefilled search tab.
- [ ] Photo attached to a part also appears on the Documents page (proving it's really the same
      `documents` row, not a parallel mechanism).
- [ ] Import script successfully populates the VW's parts from `Polo.xls.xlsx`, correctly grouping
      the multi-line entries, with a clear summary of anything it couldn't resolve.
- [ ] `npm test` passes (incl. new fixture-based parser tests); build clean.
