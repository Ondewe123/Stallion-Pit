# Stallion Pit — Parts Photos, Supplier Links & Autodoc Autofill — Design Spec

**Date:** 2026-07-11
**Status:** Approved for planning
**Depends on:** `parts` (0002/0012), `documents` (0014) — both already live.

## 1. Purpose

Populate the Parts page with a real ~40-item shopping list for the VW (sourced from autodoc.co.uk
while shopping for spares), and make that workflow repeatable: paste a part's Autodoc product link
and have the app pull its name, price, and photo automatically, instead of manually
screenshotting/copy-pasting into a spreadsheet as done today.

## 2. Goals / non-goals

**Goals**
- Attach a supplier link and a photo to a part.
- One-click "Search on Autodoc" convenience (no scraping — just a prefilled search URL).
- "Fetch details" — given a pasted Autodoc product URL, auto-fill part name, show a price hint, and
  attach the product photo.
- One-time bulk import of the existing VW parts list (from an exported CSV) using the same fetch
  logic, so all ~40 rows get populated without manual re-entry or transcription from a screenshot.

**Non-goals**
- No general web search / multi-site scraping — Autodoc only, via an explicit pasted product URL.
- No live FX or shipping-rate API — GBP→KES + shipping is a static, editable estimate, clearly
  labeled "approx," never written as fact into `unit_cost_kes`.
- No permanent in-app CSV import UI — the bulk import is a one-off local script.
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

- **`parseAutodocPage.js`** — pure function `parseAutodocHtml(html) → { title, imageUrl, price,
  currency }`. Extracts via string/regex, no new dependency (no cheerio):
  1. Look for a `<script type="application/ld+json">` block containing a `Product` node; if found,
     `JSON.parse` it and read `name`, `image`, `offers.price`, `offers.priceCurrency`.
  2. Fall back to `<meta property="og:title" content="...">` / `og:image` if JSON-LD is missing or
     incomplete.
  3. Any field that can't be found comes back `null` — never throws on a partial page. Unit-tested
     against fixture HTML snippets (a real Autodoc product page saved locally, JSON-LD-only, and
     meta-tag-only variants) — no live network calls in tests.
- **`resolveAutodocPart.js`** — impure: `resolveAutodocPart(url, { supabaseAdmin, userId }) → {
  title, price, currency, documentPath }`.
  1. Validates `new URL(url).hostname` is `autodoc.co.uk` or `www.autodoc.co.uk` — throws otherwise
     (defense in depth: stops this from being usable as an arbitrary URL fetcher/proxy).
  2. `fetch(url)` server-side with a normal browser `User-Agent` header, calls `parseAutodocHtml`.
  3. If `imageUrl` was found: fetches the image bytes, generates an id (`newId()` from the existing
     `src/lib/docs.js` — already isomorphic, no React/browser dependency), builds its storage path
     (`storagePath(userId, id, imageUrl)`), and uploads to the `documents` bucket via
     `supabaseAdmin.storage`.
  4. Returns `{ title, price, currency, documentPath }` (`documentPath` is `null` if no image was
     found or the upload failed — callers still get the title/price).

## 5. Backend — `api/fetch-part.js` (Vercel serverless function)

- `POST { url }` → calls `resolveAutodocPart(url, { supabaseAdmin, userId })` and returns the result
  as JSON, or a 4xx with a plain error message on bad/non-Autodoc URLs.
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
    network call from our side, cannot break.
  - **Fetch details** — POSTs the pasted link to `/api/fetch-part`; on success, fills **Part Name**
    only if it's currently blank, and shows a price hint under **Unit Cost (KES)**:
    `Autodoc: £24.99 → approx landed KES 8,623 (FX + shipping estimate)` — computed via
    `estimateLandedKes` below (24.99 × 205 + 3,500). Unit Cost itself stays a plain editable number
    input — the hint never silently overwrites it.
  - The returned `documentPath` (if any) is held in local form state; once the part is saved
    (insert/update returns the row `id`), a `documents` row is inserted
    (`kind: 'Photo', part_id: <id>, file_path: documentPath`), mirroring the insert shape
    `Documents.jsx` already uses.
- **Price estimate constants** — `src/lib/priceEstimate.js`:
  ```js
  // Update these when rates drift — both are rough, user-set estimates, not live data.
  export const FX_RATE_GBP_TO_KES = 205   // approx GBP -> KES
  export const SHIPPING_ESTIMATE_KES = 3500 // flat per-parcel estimate (e.g. Kentex-style forwarder)
  export const estimateLandedKes = (gbpPrice) =>
    gbpPrice == null ? null : gbpPrice * FX_RATE_GBP_TO_KES + SHIPPING_ESTIMATE_KES
  ```
- **List view**: part row thumbnail — small image if a `documents` row with `kind='Photo'` and
  matching `part_id` exists (batch-fetch signed URLs the same way `Documents.jsx` does for its
  grid, keyed by `part_id` instead of `doc.id`), else the existing text-only row.

## 7. One-off bulk import — `scripts/import-parts.mjs`

Matches the existing `scripts/backup.mjs` convention (plain Node ESM script, not part of the
shipped app, run manually).

- Usage: `node scripts/import-parts.mjs <path-to-csv> <vehicle_id>`
- Reads the CSV (exported from the OneNote "VW / Spares Needed" table: part name + Autodoc link per
  row — exact columns confirmed against the real file once shared).
- For each row with a link: calls `resolveAutodocPart` (same module §4), then inserts a `parts` row
  (`part_name` from the fetched title if the CSV didn't already have one, `supplier_url`, category
  defaulted to `'Other'` for manual cleanup later) and, if a photo was uploaded, a `documents` row
  linking it.
- Continues past a failing row (bad/dead link, page changed shape, network blip) rather than
  aborting the batch; prints a final summary — `imported: N, skipped (no link): N, failed: N` with
  the failed rows' identifying text — so nothing silently vanishes.
- Needs the same `SUPABASE_SERVICE_ROLE_KEY` (read from a local `.env`, never committed) to bypass
  RLS for the one-time insert on Chris's behalf.

## 8. Error handling

- `parseAutodocHtml` never throws on a page it can't fully parse — returns whatever subset of
  `{title, imageUrl, price, currency}` it found; `resolveAutodocPart` only throws on a genuinely bad
  URL (wrong host / unreachable).
- `/api/fetch-part` turns thrown errors into a 4xx JSON body (`{ error: '...' }`); the "Fetch
  details" button shows that message inline (reusing the existing `form-error` styling) rather than
  hanging or failing silently.
- Import script: per-row try/catch, failures logged with the row's part name/link and counted in the
  summary, loop continues.

## 9. Testing

- `parseAutodocPage.test.js` — fixture-HTML unit tests (JSON-LD present, JSON-LD partial, JSON-LD
  absent/meta-tags-only, neither present) — no live network calls, consistent with this repo's
  existing pure-function test style (`fuelUsage.test.js`, `parts.test.js`).
- `priceEstimate.js` — trivial unit test for `estimateLandedKes` (null passthrough, basic arithmetic).
- Manual: paste a real Autodoc product URL in dev, confirm Fetch details fills name + price hint and
  a photo shows up against the part (and in the Documents page, since it's the same table).
- Manual: run the import script against a small (2-3 row) sample CSV first, confirm rows and photos
  land correctly, before running it against the full ~40-row file.

## 10. Work breakdown

1. `0016_parts_supplier_url.sql` — add column; apply live.
2. `src/lib/fetchPart/parseAutodocPage.js` + tests (fixtures).
3. `src/lib/fetchPart/resolveAutodocPart.js` (uses `parseAutodocPage.js` + `docs.js` helpers).
4. `api/fetch-part.js` — Vercel function wiring auth + the resolver; set
   `SUPABASE_SERVICE_ROLE_KEY` in Vercel project env vars.
5. `src/lib/priceEstimate.js` + trivial test.
6. `PartsLog.jsx` — Part link field, Search/Fetch buttons, price hint, post-save documents insert,
   list thumbnail.
7. `scripts/import-parts.mjs` — once the CSV is exported and shared; dry-run on a few rows first.
8. Build / lint / tests; commit.

## 11. Success criteria

- [ ] `0016` applied live; existing parts unaffected.
- [ ] Pasting a real Autodoc URL and clicking Fetch details fills name + price hint + photo.
- [ ] "Search on Autodoc" opens a correctly prefilled search tab.
- [ ] Photo attached to a part also appears on the Documents page (proving it's really the same
      `documents` row, not a parallel mechanism).
- [ ] Import script successfully populates the VW's ~40 parts from the exported CSV, with a clear
      summary of any rows it couldn't resolve.
- [ ] `npm test` passes (incl. new fixture-based parser tests); build clean.
