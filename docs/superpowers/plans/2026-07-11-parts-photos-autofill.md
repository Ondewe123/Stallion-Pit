# Parts Photos, Supplier Links & Fetch-Details Autofill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a supplier-link + photo to parts, a "Fetch details" button that auto-fills a part's name/price/photo from any pasted product URL, and import the real ~45-item VW Polo parts list from `Data/Polo.xls.xlsx`.

**Architecture:** A pure HTML parser (`parseProductPage.js`) extracts title/image/price/currency from JSON-LD or meta tags. A server-only resolver (`resolvePastedPart.mjs`) wraps it with an SSRF-safe fetch and a photo upload to the existing `documents` Supabase bucket. A thin Vercel function (`api/fetch-part.mjs`) exposes that to the browser behind normal Supabase auth. The exact same resolver is reused by a one-off Node script that bulk-imports the real parts list, so there is exactly one implementation of "fetch a product page's details."

**Tech Stack:** React 19 + Vite, Supabase (Postgres/Auth/Storage), Vercel serverless functions (Node, Web-standard Request/Response), Vitest. No new npm dependencies.

**Reference spec:** `docs/superpowers/specs/2026-07-11-parts-photos-autodoc-design.md`

## Global Constraints

- No new npm dependencies (no cheerio, no xlsx-parsing library) — parsing is string/regex-based; the one-off `.xlsx` read uses Python/openpyxl (already confirmed present on this machine), completely outside the JS project.
- This repo's ESLint (`eslint.config.js`) only lints `**/*.{js,jsx}` with **browser** globals (no `process`, no Node built-ins). Any new file that uses Node-only APIs (`process.env`, `node:dns`, etc.) MUST use a `.mjs` extension to stay out of that lint pass — matches the existing `scripts/backup.mjs` convention. Files with zero Node-specific globals (pure parsing/math) stay `.js`.
- Vitest only discovers `src/**/*.test.{js,jsx}` (see `vite.config.js` → `test.include`) — test files must keep the `.test.js` extension even when the source under test is `.mjs`; they simply `import` the `.mjs` file with its explicit extension.
- All new relative imports between the new files use explicit file extensions (`./foo.js`, `./foo.mjs`) — required for Node's native ESM loader when `api/fetch-part.mjs` and `scripts/import-parts.mjs` run outside Vite's bundler.
- Never commit anything under `Data/` (it's untracked already — the source `.xlsx` and any files we generate from it are personal data, not repo content) and never commit `.env.local` (already gitignored via the `*.local` pattern).
- `resolvePastedPart.mjs`/`ssrfGuard.mjs` are server-only — never imported from `src/pages/*.jsx` or any browser code. The browser talks to them only via an HTTP call to `/api/fetch-part`.
- Follow this repo's existing conventions: Vitest `describe/it/expect` (explicit imports, not globals), `clean()`-style `''→null` handling in Supabase forms, confirm-before-destructive-action UI patterns, `try/catch/finally` on every async submit handler.

---

### Task 1: Migration 0016 — `supplier_url` column

**Files:**
- Create: `supabase/migrations/0016_parts_supplier_url.sql`

**Interfaces:**
- Produces: `public.parts.supplier_url` (nullable `text`) — consumed by Task 7's form and Task 10's import script.

- [ ] **Step 1: Write the migration file**

```sql
alter table public.parts add column if not exists supplier_url text;
```

- [ ] **Step 2: Apply it to the live database**

Open the SQL editor for the Stallion Pit Supabase project (ref `mwakgpzcqoalxtvqucki`, confirmed from this repo's `.env` → `VITE_SUPABASE_URL`):

`https://supabase.com/dashboard/project/mwakgpzcqoalxtvqucki/sql/new`

**You're in the right place if:** running `select column_name from information_schema.columns where table_name = 'parts' order by 1;` shows existing columns like `oem_number` and `warranty_months` (from earlier migrations 0002/0012) — confirms this is the Stallion Pit `parts` table, not some other project.

Paste and run the migration SQL from Step 1. **Expected result:** `select column_name from information_schema.columns where table_name = 'parts' and column_name = 'supplier_url';` now returns one row.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0016_parts_supplier_url.sql
git commit -m "feat(parts): add supplier_url column"
```

---

### Task 2: `parseProductPage.js` — pure HTML parser

**Files:**
- Create: `src/lib/fetchPart/parseProductPage.js`
- Test: `src/lib/fetchPart/parseProductPage.test.js`

**Interfaces:**
- Produces: `parseProductHtml(html: string) → { title: string|null, imageUrl: string|null, price: number|null, currencyCode: string|null }` — consumed by Task 5's `resolvePastedPart.mjs`.

- [ ] **Step 1: Write the failing tests**

```js
// src/lib/fetchPart/parseProductPage.test.js
import { describe, it, expect } from 'vitest'
import { parseProductHtml } from './parseProductPage.js'

const JSONLD_FULL = `<html><head>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Product","name":"Wheel House Liner Left",
"image":"https://cdn.example.com/liner-left.jpg",
"offers":{"@type":"Offer","price":"24.99","priceCurrency":"GBP"}}
</script>
</head><body></body></html>`

const JSONLD_NO_PRICE = `<html><head>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Product","name":"Boot Gas Strut",
"image":"https://cdn.example.com/strut.jpg"}
</script>
</head><body></body></html>`

const META_ONLY = `<html><head>
<meta property="og:title" content="Steering Angle Sensor 6Q0959654B" />
<meta property="og:image" content="https://cdn.example.com/sensor.jpg" />
</head><body></body></html>`

const SYMBOL_PRICE_ONLY = `<html><body>
<h1>Подкрылок лев VW: POLO (02-09)</h1>
<div class="price">875,75 ₽</div>
</body></html>`

const NOTHING_FOUND = `<html><body><p>Нет данных</p></body></html>`

describe('parseProductHtml', () => {
  it('reads title, image, price and currency from JSON-LD Product', () => {
    expect(parseProductHtml(JSONLD_FULL)).toEqual({
      title: 'Wheel House Liner Left',
      imageUrl: 'https://cdn.example.com/liner-left.jpg',
      price: 24.99,
      currencyCode: 'GBP',
    })
  })

  it('returns null price/currency when JSON-LD has no offers', () => {
    expect(parseProductHtml(JSONLD_NO_PRICE)).toEqual({
      title: 'Boot Gas Strut',
      imageUrl: 'https://cdn.example.com/strut.jpg',
      price: null,
      currencyCode: null,
    })
  })

  it('falls back to og:title/og:image when there is no JSON-LD', () => {
    expect(parseProductHtml(META_ONLY)).toEqual({
      title: 'Steering Angle Sensor 6Q0959654B',
      imageUrl: 'https://cdn.example.com/sensor.jpg',
      price: null,
      currencyCode: null,
    })
  })

  it('extracts a symbol-formatted price when no structured data is present', () => {
    expect(parseProductHtml(SYMBOL_PRICE_ONLY)).toEqual({
      title: null,
      imageUrl: null,
      price: 875.75,
      currencyCode: 'RUB',
    })
  })

  it('returns all nulls for a page with nothing findable, without throwing', () => {
    expect(parseProductHtml(NOTHING_FOUND)).toEqual({
      title: null,
      imageUrl: null,
      price: null,
      currencyCode: null,
    })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- parseProductPage`
Expected: FAIL — `parseProductPage.js` does not exist / `parseProductHtml is not a function`.

- [ ] **Step 3: Write the implementation**

```js
// src/lib/fetchPart/parseProductPage.js
// Pure, browser-safe: no Node-only APIs. Extracts product metadata from raw HTML
// via JSON-LD (preferred) with meta-tag and symbol-price fallbacks. Never throws —
// a page with nothing findable just returns all-null fields.

const SYMBOL_PATTERNS = [
  { code: 'GBP', re: /£\s?(\d[\d,]*\.\d{2})/ },
  { code: 'EUR', re: /€\s?(\d[\d,]*\.\d{2})/ },
  { code: 'USD', re: /\$\s?(\d[\d,]*\.\d{2})/ },
  { code: 'RUB', re: /(\d[\d\s]*,\d{2})\s?₽/ },
]

function parseAmount(raw, code) {
  const cleaned = code === 'RUB'
    ? raw.replace(/\s/g, '').replace(',', '.')
    : raw.replace(/,/g, '')
  return Number(cleaned)
}

function extractSymbolPrice(html) {
  for (const { code, re } of SYMBOL_PATTERNS) {
    const m = re.exec(html)
    if (m) return { amount: parseAmount(m[1], code), currencyCode: code }
  }
  return null
}

function extractJsonLdProduct(html) {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let match
  while ((match = re.exec(html))) {
    let data
    try { data = JSON.parse(match[1]) } catch { continue }
    const nodes = Array.isArray(data) ? data : (Array.isArray(data['@graph']) ? data['@graph'] : [data])
    const product = nodes.find(n => n && (n['@type'] === 'Product' ||
      (Array.isArray(n['@type']) && n['@type'].includes('Product'))))
    if (product) return product
  }
  return null
}

function decodeEntities(s) {
  return s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
}

function metaContent(html, property) {
  const re = new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i')
  const m = re.exec(html)
  return m ? decodeEntities(m[1]) : null
}

export function parseProductHtml(html) {
  const result = { title: null, imageUrl: null, price: null, currencyCode: null }

  const product = extractJsonLdProduct(html)
  if (product) {
    if (product.name) result.title = String(product.name)
    if (product.image) result.imageUrl = Array.isArray(product.image) ? product.image[0] : String(product.image)
    const offers = Array.isArray(product.offers) ? product.offers[0] : product.offers
    if (offers) {
      if (offers.price != null) result.price = Number(offers.price)
      if (offers.priceCurrency) result.currencyCode = String(offers.priceCurrency).toUpperCase()
    }
  }

  if (!result.title) result.title = metaContent(html, 'og:title')
  if (!result.imageUrl) result.imageUrl = metaContent(html, 'og:image')

  if (result.price == null) {
    const symbolPrice = extractSymbolPrice(html)
    if (symbolPrice) {
      result.price = symbolPrice.amount
      result.currencyCode = symbolPrice.currencyCode
    }
  }

  return result
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- parseProductPage`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/fetchPart/parseProductPage.js src/lib/fetchPart/parseProductPage.test.js
git commit -m "feat(parts): add product-page HTML parser"
```

---

### Task 3: `priceEstimate.js` — currency-aware KES estimate

**Files:**
- Create: `src/lib/priceEstimate.js`
- Test: `src/lib/priceEstimate.test.js`

**Interfaces:**
- Produces: `CURRENCY_TO_KES: Record<string, number>`, `SHIPPING_ESTIMATE_KES: number`,
  `estimateLandedKes(price: number|null, currencyCode: string|null) → number|null` — consumed by
  Task 7's `PartsLog.jsx` price hint.

- [ ] **Step 1: Write the failing tests**

```js
// src/lib/priceEstimate.test.js
import { describe, it, expect } from 'vitest'
import { estimateLandedKes, CURRENCY_TO_KES, SHIPPING_ESTIMATE_KES } from './priceEstimate.js'

describe('estimateLandedKes', () => {
  it('converts a known currency and adds the shipping estimate', () => {
    expect(estimateLandedKes(24.99, 'GBP'))
      .toBeCloseTo(24.99 * CURRENCY_TO_KES.GBP + SHIPPING_ESTIMATE_KES, 2)
  })
  it('is case-insensitive on the currency code', () => {
    expect(estimateLandedKes(10, 'gbp')).toBe(estimateLandedKes(10, 'GBP'))
  })
  it('returns null for an unrecognized currency', () => {
    expect(estimateLandedKes(10, 'XYZ')).toBeNull()
  })
  it('returns null when price or currency is missing', () => {
    expect(estimateLandedKes(null, 'GBP')).toBeNull()
    expect(estimateLandedKes(10, null)).toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- priceEstimate`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write the implementation**

```js
// src/lib/priceEstimate.js
// Rough, manually-maintained estimates — NOT live data. Update whenever they drift
// noticeably; there is no live FX/shipping API by design (see design spec §2 non-goals).
// Rates as of 2026-07.
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
  if (rate == null) return null
  return price * rate + SHIPPING_ESTIMATE_KES
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- priceEstimate`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/priceEstimate.js src/lib/priceEstimate.test.js
git commit -m "feat(parts): add currency-aware landed-cost estimate"
```

---

### Task 4: `ssrfGuard.mjs` — safe-URL guard

**Files:**
- Create: `src/lib/fetchPart/ssrfGuard.mjs`
- Test: `src/lib/fetchPart/ssrfGuard.test.js`

**Interfaces:**
- Produces: `async assertSafeUrl(url: string, opts？: { lookup?: (hostname: string) => Promise<{address: string}> }) → Promise<URL>` (throws `Error` with a human-readable message on rejection) — consumed by Task 5's `resolvePastedPart.mjs`.

- [ ] **Step 1: Write the failing tests**

```js
// src/lib/fetchPart/ssrfGuard.test.js
import { describe, it, expect } from 'vitest'
import { assertSafeUrl } from './ssrfGuard.mjs'

const fakeLookup = (address) => async () => ({ address })

describe('assertSafeUrl', () => {
  it('allows a normal https url resolving to a public address', async () => {
    await expect(assertSafeUrl('https://example.com/part/123', { lookup: fakeLookup('93.184.216.34') }))
      .resolves.toBeInstanceOf(URL)
  })
  it('rejects non-http(s) schemes', async () => {
    await expect(assertSafeUrl('file:///etc/passwd')).rejects.toThrow('http/https')
  })
  it('rejects an invalid URL string', async () => {
    await expect(assertSafeUrl('not a url')).rejects.toThrow('valid URL')
  })
  it('rejects localhost by hostname', async () => {
    await expect(assertSafeUrl('http://localhost:3000/x')).rejects.toThrow('local address')
  })
  it('rejects a literal private IPv4 host', async () => {
    await expect(assertSafeUrl('http://192.168.1.5/x')).rejects.toThrow('private address')
  })
  it('rejects a hostname that resolves to a private address', async () => {
    await expect(assertSafeUrl('https://sneaky.example.com/x', { lookup: fakeLookup('10.0.0.5') }))
      .rejects.toThrow('resolves to a private address')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- ssrfGuard`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write the implementation**

```js
// src/lib/fetchPart/ssrfGuard.mjs
// Server-only (uses node:dns) — never import this from React/browser code.
// Defense-in-depth for /api/fetch-part accepting an arbitrary user-pasted URL:
// blocks obviously-local/private targets even though the endpoint already requires
// the app's normal auth.
import { promises as nodeDns } from 'node:dns'

const PRIVATE_V4 = [
  /^127\./, /^10\./, /^192\.168\./, /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
]

function isPrivateAddress(address) {
  if (address === '::1') return true
  if (address.startsWith('fe80:') || address.startsWith('fc') || address.startsWith('fd')) return true
  return PRIVATE_V4.some(re => re.test(address))
}

export async function assertSafeUrl(rawUrl, { lookup = (host) => nodeDns.lookup(host) } = {}) {
  let parsed
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new Error('Not a valid URL')
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http/https links are supported')
  }

  const hostname = parsed.hostname
  if (hostname === 'localhost' || hostname === '::1') {
    throw new Error('That link points to a local address')
  }
  if (isPrivateAddress(hostname)) {
    throw new Error('That link points to a private address')
  }

  let address
  try {
    ({ address } = await lookup(hostname))
  } catch {
    throw new Error("Could not resolve that link's address")
  }
  if (isPrivateAddress(address)) {
    throw new Error('That link resolves to a private address')
  }

  return parsed
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- ssrfGuard`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/fetchPart/ssrfGuard.mjs src/lib/fetchPart/ssrfGuard.test.js
git commit -m "feat(parts): add SSRF guard for pasted product URLs"
```

---

### Task 5: `resolvePastedPart.mjs` — fetch, parse, upload

**Files:**
- Create: `src/lib/fetchPart/resolvePastedPart.mjs`
- Test: `src/lib/fetchPart/resolvePastedPart.test.js`

**Interfaces:**
- Consumes: `parseProductHtml` (Task 2), `assertSafeUrl` (Task 4), `newId`/`storagePath` from
  `src/lib/docs.js` (existing).
- Produces: `async resolvePastedPart(url: string, { supabaseClient, userId, fetchImpl？, lookup？ }) →
  Promise<{ title, price, currencyCode, documentId, documentPath, fileName, mimeType, fileSize }>`
  (all fields nullable except when successfully found) — consumed by Task 6's `api/fetch-part.mjs`
  and Task 10's `scripts/import-parts.mjs`. `supabaseClient` only needs `.storage.from(bucket).upload(path, bytes, opts)`.

- [ ] **Step 1: Write the failing tests**

```js
// src/lib/fetchPart/resolvePastedPart.test.js
import { describe, it, expect, vi } from 'vitest'
import { resolvePastedPart } from './resolvePastedPart.mjs'

function htmlResponse(html) {
  return {
    ok: true, status: 200,
    arrayBuffer: async () => new TextEncoder().encode(html).buffer,
    headers: { get: () => 'text/html' },
  }
}
function imageResponse(bytes, contentType = 'image/jpeg') {
  return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer, headers: { get: () => contentType } }
}

const PAGE_WITH_IMAGE = `<html><head>
<script type="application/ld+json">
{"@type":"Product","name":"Wheel House Liner Left","image":"https://cdn.example.com/liner.jpg","offers":{"price":"24.99","priceCurrency":"GBP"}}
</script></head></html>`

const PAGE_NO_IMAGE = `<html><head>
<script type="application/ld+json">
{"@type":"Product","name":"Boot Gas Strut","offers":{"price":"9.5","priceCurrency":"GBP"}}
</script></head></html>`

const fakeLookupPublic = async () => ({ address: '93.184.216.34' })

describe('resolvePastedPart', () => {
  it('parses title/price/currency and uploads the photo', async () => {
    const uploadMock = vi.fn().mockResolvedValue({ error: null })
    const supabaseClient = { storage: { from: () => ({ upload: uploadMock }) } }
    const bytes = new Uint8Array([1, 2, 3])
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(htmlResponse(PAGE_WITH_IMAGE))
      .mockResolvedValueOnce(imageResponse(bytes))

    const result = await resolvePastedPart('https://example.com/part/1', {
      supabaseClient, userId: 'user-1', fetchImpl, lookup: fakeLookupPublic,
    })

    expect(result.title).toBe('Wheel House Liner Left')
    expect(result.price).toBe(24.99)
    expect(result.currencyCode).toBe('GBP')
    expect(result.documentPath).toMatch(/^user-1\//)
    expect(result.mimeType).toBe('image/jpeg')
    expect(result.fileSize).toBe(3)
    expect(uploadMock).toHaveBeenCalledTimes(1)
  })

  it('still returns title/price when there is no image', async () => {
    const supabaseClient = { storage: { from: () => ({ upload: vi.fn() }) } }
    const fetchImpl = vi.fn().mockResolvedValueOnce(htmlResponse(PAGE_NO_IMAGE))

    const result = await resolvePastedPart('https://example.com/part/2', {
      supabaseClient, userId: 'user-1', fetchImpl, lookup: fakeLookupPublic,
    })

    expect(result.title).toBe('Boot Gas Strut')
    expect(result.documentPath).toBeNull()
  })

  it('rejects a private-address URL before fetching anything', async () => {
    const supabaseClient = { storage: { from: () => ({ upload: vi.fn() }) } }
    const fetchImpl = vi.fn()

    await expect(resolvePastedPart('http://192.168.1.5/x', { supabaseClient, userId: 'u', fetchImpl }))
      .rejects.toThrow('private address')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('throws a clear error when the page itself fails to fetch', async () => {
    const supabaseClient = { storage: { from: () => ({ upload: vi.fn() }) } }
    const fetchImpl = vi.fn().mockResolvedValueOnce({ ok: false, status: 404 })

    await expect(resolvePastedPart('https://example.com/missing', {
      supabaseClient, userId: 'u', fetchImpl, lookup: fakeLookupPublic,
    })).rejects.toThrow('HTTP 404')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- resolvePastedPart`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write the implementation**

```js
// src/lib/fetchPart/resolvePastedPart.mjs
// Server-only — never import this from React/browser code.
import { assertSafeUrl } from './ssrfGuard.mjs'
import { parseProductHtml } from './parseProductPage.js'
import { newId, storagePath } from '../docs.js'

const DOCUMENTS_BUCKET = 'documents'
const MAX_HTML_BYTES = 2_000_000
const MAX_IMAGE_BYTES = 8_000_000
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36'

async function readCappedBytes(res, maxBytes) {
  const buf = new Uint8Array(await res.arrayBuffer())
  if (buf.byteLength > maxBytes) throw new Error('Response too large')
  return buf
}

export async function resolvePastedPart(url, { supabaseClient, userId, fetchImpl = fetch, lookup } = {}) {
  const lookupOpt = lookup ? { lookup } : undefined
  await assertSafeUrl(url, lookupOpt)

  const pageRes = await fetchImpl(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!pageRes.ok) throw new Error(`Could not fetch that link (HTTP ${pageRes.status})`)
  const htmlBytes = await readCappedBytes(pageRes, MAX_HTML_BYTES)
  const html = new TextDecoder('utf-8').decode(htmlBytes)
  const parsed = parseProductHtml(html)

  const result = {
    title: parsed.title, price: parsed.price, currencyCode: parsed.currencyCode,
    documentId: null, documentPath: null, fileName: null, mimeType: null, fileSize: null,
  }

  if (parsed.imageUrl) {
    try {
      await assertSafeUrl(parsed.imageUrl, lookupOpt)
      const imgRes = await fetchImpl(parsed.imageUrl)
      if (imgRes.ok) {
        const bytes = await readCappedBytes(imgRes, MAX_IMAGE_BYTES)
        const mimeType = imgRes.headers.get('content-type') || 'application/octet-stream'
        const fileName = (parsed.imageUrl.split('/').pop() || 'photo').split('?')[0] || 'photo.jpg'
        const documentId = newId()
        const documentPath = storagePath(userId, documentId, fileName)
        const { error: upErr } = await supabaseClient.storage.from(DOCUMENTS_BUCKET)
          .upload(documentPath, bytes, { contentType: mimeType, upsert: true })
        if (!upErr) {
          result.documentId = documentId
          result.documentPath = documentPath
          result.fileName = fileName
          result.mimeType = mimeType
          result.fileSize = bytes.byteLength
        }
      }
    } catch {
      // Photo is best-effort — title/price still stand even if the image
      // can't be fetched/uploaded (e.g. it's itself behind a private address,
      // or the upload fails). Never let a photo problem fail the whole call.
    }
  }

  return result
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- resolvePastedPart`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/fetchPart/resolvePastedPart.mjs src/lib/fetchPart/resolvePastedPart.test.js
git commit -m "feat(parts): add resolvePastedPart — fetch, parse, upload photo"
```

---

### Task 6: `api/fetch-part.mjs` — Vercel function

**Files:**
- Create: `api/fetch-part.mjs`
- Test: `api/fetch-part.test.js`

**Interfaces:**
- Consumes: `resolvePastedPart` (Task 5), `createClient` from `@supabase/supabase-js` (existing dep).
- Produces: HTTP `POST /api/fetch-part` — body `{ url: string }`, header `Authorization: Bearer
  <supabase access token>` → `200 { title, price, currencyCode, documentId, documentPath, fileName,
  mimeType, fileSize }` | `401 { error }` (no/invalid session) | `400 { error }` (bad request body) |
  `422 { error }` (resolvePastedPart threw) — consumed by Task 7's `PartsLog.jsx`.

- [ ] **Step 1: Widen the Vitest include pattern to cover `api/`**

The existing `vite.config.js` only discovers tests under `src/**` (`test.include:
['src/**/*.test.{js,jsx}']`), so a test file under `api/` would silently never run. Modify
`vite.config.js`:

```js
  test: {
    // pure-function unit tests (src/lib/calc) — no DOM needed
    environment: 'node',
    include: ['src/**/*.test.{js,jsx}', 'api/**/*.test.{js,jsx}'],
  },
```

- [ ] **Step 2: Write the failing tests**

```js
// api/fetch-part.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getUserMock = vi.fn()
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ auth: { getUser: getUserMock } })),
}))

const resolvePastedPartMock = vi.fn()
vi.mock('../src/lib/fetchPart/resolvePastedPart.mjs', () => ({
  resolvePastedPart: resolvePastedPartMock,
}))

const { default: handler } = await import('./fetch-part.mjs')

function req(body, headers = {}) {
  return new Request('https://app.example.com/api/fetch-part', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

describe('POST /api/fetch-part', () => {
  beforeEach(() => { getUserMock.mockReset(); resolvePastedPartMock.mockReset() })

  it('rejects a request with no Authorization header', async () => {
    const res = await handler(req({ url: 'https://example.com/part' }))
    expect(res.status).toBe(401)
  })

  it('rejects an invalid session token', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: { message: 'bad token' } })
    const res = await handler(req({ url: 'https://example.com/part' }, { authorization: 'Bearer bad' }))
    expect(res.status).toBe(401)
  })

  it('returns the resolved part details for a valid session', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    resolvePastedPartMock.mockResolvedValue({
      title: 'Boot Gas Strut', price: 9.5, currencyCode: 'GBP',
      documentId: null, documentPath: null, fileName: null, mimeType: null, fileSize: null,
    })

    const res = await handler(req({ url: 'https://example.com/part' }, { authorization: 'Bearer good' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.title).toBe('Boot Gas Strut')
  })

  it('returns 422 with the error message when resolvePastedPart throws', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    resolvePastedPartMock.mockRejectedValue(new Error('That link points to a private address'))

    const res = await handler(req({ url: 'http://192.168.1.5/x' }, { authorization: 'Bearer good' }))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toMatch(/private address/)
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- api/fetch-part`
Expected: FAIL — `api/fetch-part.mjs` does not exist.

- [ ] **Step 4: Write the implementation**

```js
// api/fetch-part.mjs
// Vercel serverless function (Node runtime, Web-standard Request/Response).
// Verifies the caller's Supabase session, then constructs a client scoped to that
// user's own access token (not a service-role key) so the photo upload naturally
// respects the existing owner-scoped `documents` storage RLS policies.
import { createClient } from '@supabase/supabase-js'
import { resolvePastedPart } from '../src/lib/fetchPart/resolvePastedPart.mjs'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

export default async function handler(request) {
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  let body
  try {
    body = await request.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }
  const url = body?.url
  if (!url || typeof url !== 'string') return jsonResponse({ error: 'Missing "url"' }, 400)

  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) return jsonResponse({ error: 'Missing Authorization header' }, 401)

  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  const { data: userData, error: userErr } = await authClient.auth.getUser(token)
  if (userErr || !userData?.user) return jsonResponse({ error: 'Not signed in' }, 401)

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  try {
    const result = await resolvePastedPart(url, { supabaseClient: userClient, userId: userData.user.id })
    return jsonResponse(result, 200)
  } catch (err) {
    return jsonResponse({ error: err.message || 'Could not fetch that link' }, 422)
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- api/fetch-part`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add vite.config.js api/fetch-part.mjs api/fetch-part.test.js
git commit -m "feat(parts): add /api/fetch-part Vercel function"
```

- [ ] **Step 7: Manual smoke test after a preview deploy**

`api/fetch-part.mjs` needs a real Vercel runtime (Request/Response globals, actual network) beyond
what the mocked unit tests cover, and there's no Vercel CLI installed locally. Push this work to a
non-`main` branch (per this project's existing branch discipline) and let Vercel's automatic preview
deployment build it. Then, with the Stallion Pit app open in a browser and signed in:

1. Open DevTools → Network tab, reload the page, find any request to
   `https://mwakgpzcqoalxtvqucki.supabase.co/rest/v1/...` and copy its `Authorization` header value
   (starts with `Bearer `).
2. Run (replace `<preview-url>` and `<token>`):
   ```bash
   curl -s -X POST https://<preview-url>/api/fetch-part \
     -H "content-type: application/json" \
     -H "authorization: Bearer <token>" \
     -d '{"url":"https://www.neoriginal.ru/spares/vw/6Q0809957A"}'
   ```
3. **Expected:** a `200` JSON body with `"title"` containing the Russian mudguard title and a numeric
   `"price"`/`"currencyCode":"RUB"` (this exact URL was confirmed during design to show a real price).
4. Also try a URL with no Authorization header — expect `401`.

---

### Task 7: `PartsLog.jsx` — Part link field, Search/Fetch buttons, price hint

**Files:**
- Modify: `src/pages/PartsLog.jsx`

**Interfaces:**
- Consumes: `estimateLandedKes` (Task 3), `supabase` client (existing `src/lib/supabase.js`),
  `POST /api/fetch-part` (Task 6).
- Produces: `PartForm`'s `onSave` callback signature changes from `onSave(form)` to
  `onSave(form, pendingPhoto)` where `pendingPhoto` is `null` or the `/api/fetch-part` response object
  — consumed by Task 8's `handleAdd`/`handleEdit`.

- [ ] **Step 1: Add the import and the new form field to `EMPTY_FORM`**

In `src/pages/PartsLog.jsx`, add near the top imports:

```js
import { estimateLandedKes } from '../lib/priceEstimate'
```

In `EMPTY_FORM`, add `supplier_url: ''` right after `part_number: ''`:

```js
const EMPTY_FORM = {
  purchased_at: new Date().toISOString().split('T')[0],
  part_name: '',
  part_number: '',
  supplier_url: '',
  brand: '',
  ...
```

- [ ] **Step 2: Add local state and handlers inside `PartForm`**

Right after the existing `const [showInv, setShowInv] = useState(...)` line in `PartForm`, add:

```js
  const [fetching, setFetching] = useState(false)
  const [fetchError, setFetchError] = useState(null)
  const [pendingPhoto, setPendingPhoto] = useState(null)
  const [priceHint, setPriceHint] = useState(null)

  const searchAutodoc = () => {
    const q = form.part_number || form.part_name
    if (!q) return
    window.open('https://www.autodoc.co.uk/search?keyword=' + encodeURIComponent(q), '_blank', 'noopener')
  }

  const fetchDetails = async () => {
    if (!form.supplier_url) return
    setFetching(true); setFetchError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/fetch-part', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({ url: form.supplier_url }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Could not fetch that link')
      if (body.title && !form.part_name) set('part_name', body.title)
      setPriceHint(body.price != null ? {
        raw: body.price, currencyCode: body.currencyCode,
        landedKes: estimateLandedKes(body.price, body.currencyCode),
      } : null)
      setPendingPhoto(body.documentPath ? body : null)
    } catch (err) {
      setFetchError(err.message)
    } finally {
      setFetching(false)
    }
  }
```

This needs `supabase` imported in `PartsLog.jsx` — it already is (see existing `import { supabase }
from '../lib/supabase'` at the top of the file).

- [ ] **Step 3: Add the Part Link field to the form JSX**

Right after the existing Part Number / Brand `form-row-2` block (the one with `Part Number` and
`Brand` inputs), insert:

```jsx
      <div className="form-group">
        <label>Part link</label>
        <input value={form.supplier_url} onChange={e => set('supplier_url', e.target.value)}
          placeholder="paste the product page URL you're buying from" />
        <div className="row-actions" style={{ marginTop: 6 }}>
          <button type="button" className="row-btn" onClick={searchAutodoc}>Search on Autodoc</button>
          <button type="button" className="row-btn" onClick={fetchDetails}
            disabled={!form.supplier_url || fetching}>
            {fetching ? 'Fetching…' : 'Fetch details'}
          </button>
        </div>
        {fetchError && <p className="form-error" style={{ marginTop: 4 }}>{fetchError}</p>}
      </div>
```

- [ ] **Step 4: Show the price hint under Unit Cost (KES)**

In the existing Quantity/Unit Cost `form-row-2` block, inside the Unit Cost `form-group`, add the
hint paragraph right after the `<input>`:

```jsx
        <div className="form-group">
          <label>Unit Cost (KES)</label>
          <input type="number" step="0.01" value={form.unit_cost_kes}
            onChange={e => set('unit_cost_kes', e.target.value)} placeholder="e.g. 1200" />
          {priceHint && (
            <p className="page-sub" style={{ marginTop: 4 }}>
              Found: {priceHint.raw}{priceHint.currencyCode ? ` ${priceHint.currencyCode}` : ''}
              {priceHint.landedKes != null &&
                ` → approx KES ${Math.round(priceHint.landedKes).toLocaleString()} (rate + shipping estimate)`}
            </p>
          )}
        </div>
```

- [ ] **Step 5: Thread `pendingPhoto` through `handleSubmit`**

Change the existing `handleSubmit` in `PartForm`:

```js
  const handleSubmit = (e) => { e.preventDefault(); onSave(form, pendingPhoto) }
```

- [ ] **Step 6: Manual verification**

Run `npm run dev`, sign in, go to Parts → + Log Part. Paste a real URL into **Part link** (e.g.
`https://www.neoriginal.ru/spares/vw/6Q0809957A`) and click **Fetch details**.

**Expected:** Part Name fills in (if it was blank) with the Russian mudguard title; a "Found: 875.75
RUB → approx KES ..." line appears under Unit Cost. Click **Search on Autodoc** — a new tab opens to
an Autodoc search prefilled with the part number/name.

- [ ] **Step 7: Commit**

```bash
git add src/pages/PartsLog.jsx
git commit -m "feat(parts): add part-link field with fetch-details autofill"
```

---

### Task 8: `PartsLog.jsx` — post-save photo attach + list thumbnails

**Files:**
- Modify: `src/pages/PartsLog.jsx`

**Interfaces:**
- Consumes: `pendingPhoto` from Task 7's `PartForm`.
- Produces: on save, inserts a `documents` row (`kind: 'Photo'`) linked to the part — visible both on
  the Parts list (as a thumbnail) and on the existing Documents page.

- [ ] **Step 1: Add a shared photo-insert helper and thread it through save handlers**

Inside the `PartsLog` component (not `PartForm`), add this helper right before `handleAdd`:

```js
  const insertPhotoDoc = async (photo, partId) => {
    const { error } = await supabase.from('documents').insert([{
      id: photo.documentId,
      vehicle_id: activeVehicle.id,
      file_path: photo.documentPath,
      file_name: photo.fileName,
      mime_type: photo.mimeType,
      file_size: photo.fileSize,
      kind: 'Photo',
      part_id: partId,
    }])
    if (error) console.error('[parts] photo attach failed:', error.message)
  }
```

Replace `handleAdd` and `handleEdit`:

```js
  const handleAdd = async (form, pendingPhoto) => {
    setSaving(true); setError(null)
    const { data, error } = await supabase.from('parts').insert([clean(form)]).select().single()
    if (error) { setError(error.message); setSaving(false); return }
    if (pendingPhoto?.documentPath) await insertPhotoDoc(pendingPhoto, data.id)
    await fetchLogs(); setSaving(false); setView('list')
  }

  const handleEdit = async (form, pendingPhoto) => {
    setSaving(true); setError(null)
    const { error } = await supabase.from('parts').update(clean(form)).eq('id', selected.id)
    if (error) { setError(error.message); setSaving(false); return }
    if (pendingPhoto?.documentPath) await insertPhotoDoc(pendingPhoto, selected.id)
    await fetchLogs(); setSaving(false); setView('list')
  }
```

- [ ] **Step 2: Fetch photo thumbnails alongside the parts list**

Add state near the other `useState` calls in `PartsLog`:

```js
  const [photoThumbs, setPhotoThumbs] = useState({})   // part_id -> signed url
```

Replace `fetchLogs`:

```js
  const fetchLogs = useCallback(async () => {
    if (!activeVehicle) return
    setLoading(true)
    const { data } = await supabase
      .from('parts')
      .select('*')
      .eq('vehicle_id', activeVehicle.id)
      .order('purchased_at', { ascending: false })
    const list = data || []
    setLogs(list)
    setLoading(false)

    const ids = list.map(l => l.id)
    if (ids.length) {
      const { data: docs } = await supabase
        .from('documents')
        .select('part_id, file_path')
        .eq('kind', 'Photo')
        .in('part_id', ids)
      const entries = await Promise.all((docs || []).map(async d => {
        const { data: signed } = await supabase.storage.from('documents').createSignedUrl(d.file_path, 3600)
        return [d.part_id, signed?.signedUrl || null]
      }))
      setPhotoThumbs(Object.fromEntries(entries))
    } else {
      setPhotoThumbs({})
    }
  }, [activeVehicle])
```

- [ ] **Step 3: Render the thumbnail in the list**

In the table row, replace the existing `<td className="primary">` cell content:

```jsx
                  <td className="primary">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {photoThumbs[log.id] && (
                        <img src={photoThumbs[log.id]} alt=""
                          style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
                      )}
                      <div>
                        {log.part_name}
                        {(log.brand || log.part_number || log.oem_number) && (
                          <div style={{ color: 'var(--text-dim)', fontSize: 11 }}>
                            {[log.brand, log.oem_number || log.part_number].filter(Boolean).join(' · ')}
                          </div>
                        )}
                        {log.location && <div style={{ color: 'var(--text-dim)', fontSize: 11 }}>📍 {log.location}</div>}
                      </div>
                    </div>
                  </td>
```

- [ ] **Step 4: Manual verification**

In the running dev server, add a part with a real URL, click Fetch details (confirm a photo was
found — try `https://www.neoriginal.ru/spares/vw/6Q0809957A` if it still shows a price, or any other
product URL with an og:image), save it.

**Expected:** the parts list row now shows a small thumbnail next to the part name. Go to the
Documents page — the same photo appears there too (`kind: Photo`, linked to that part), proving it's
the same `documents` row, not a parallel mechanism.

- [ ] **Step 5: Commit**

```bash
git add src/pages/PartsLog.jsx
git commit -m "feat(parts): attach fetched photo to documents, show thumbnail in list"
```

---

### Task 9: Pre-process `Data/Polo.xls.xlsx` into a clean entry list

**Files:**
- Create: `Data/preprocess_polo_xlsx.py` (throwaway — not committed; `Data/` is untracked)
- Produces: `Data/polo-parts-clean.json` (untracked)

**Interfaces:**
- Produces: a JSON array of `{ row: number, part_name: string, part_number: string|null,
  supplier_url: string|null }` — consumed by Task 10's `scripts/import-parts.mjs`.

- [ ] **Step 1: Write the pre-processing script**

```python
# Data/preprocess_polo_xlsx.py
# One-off: groups the real (messy) VW Polo parts spreadsheet into a clean entry list.
# Every non-blank cell in column A becomes its own entry (no merge heuristics — see
# design-plan discussion of why: the sheet mixes real parts, still-unresearched
# placeholder items, and a handful of equivalent-number/vehicle-variant notes that
# aren't reliably distinguishable by position alone; keeping each line as its own
# row is predictable and easy to clean up by hand afterward in the app itself).
# Column A = description. Column B = OEM number + a hyperlink (neoriginal.ru = a
# real part page; ilcats.ru = a reference/citation, not a part page — ignored).
import json
import openpyxl

SRC = r"D:\stallion-pit\Data\Polo.xls.xlsx"
OUT = r"D:\stallion-pit\Data\polo-parts-clean.json"

wb = openpyxl.load_workbook(SRC, data_only=True)
ws = wb["Sheet1"]


def cell_link(cell):
    return cell.hyperlink.target if cell.hyperlink else None


entries = []

for r in range(1, ws.max_row + 1):
    a_cell = ws.cell(row=r, column=1)
    b_cell = ws.cell(row=r, column=2)
    a_val = a_cell.value
    b_val = b_cell.value
    b_link = cell_link(b_cell)

    a_text = str(a_val).strip() if a_val is not None else ""
    b_text = str(b_val).strip() if b_val is not None else ""

    if not a_text:
        continue                       # nothing in column A -> not a usable row
    if a_text.startswith("From <"):
        continue                       # ilcats citation line, no real content

    supplier_url = b_link if (b_link and "neoriginal.ru" in b_link) else None
    part_number = b_text if supplier_url else None

    entries.append({
        "row": r,
        "part_name": a_text,
        "part_number": part_number,
        "supplier_url": supplier_url,
    })

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(entries, f, ensure_ascii=False, indent=2)

print(f"Wrote {len(entries)} entries to {OUT}\n")
for e in entries:
    marker = "with link" if e["supplier_url"] else "no link yet"
    print(f"  row {e['row']:>3}  [{marker:11}]  {e['part_name'][:70]}")
```

- [ ] **Step 2: Run it and sanity-check the output**

Run: `python "D:\stallion-pit\Data\preprocess_polo_xlsx.py"`

**Expected:** prints one line per entry (roughly 45-55, given the real file has ~48 rows with a
value in column A once blank/citation rows are excluded). Read through the printed list:

- Rows like "Steering Angle Sensor", "Wheel house liner left", "Radiator" etc. should show
  `[with link]`.
- A handful of short fragments (e.g. "035 133 335", "rhd", "automatic", and the very first few
  numbered items like "1. Sump") should show `[no link yet]` — expected, not a bug (see the script's
  comment above).

If anything looks structurally wrong (e.g. a real part description showing as `no link yet` when you
can see it clearly has a neoriginal.ru link in the original file), stop and re-inspect that row with
openpyxl before continuing — don't proceed to Task 10 on data you haven't checked.

No commit for this task — both the script and its output live under the untracked `Data/` directory
by design.

---

### Task 10: `scripts/import-parts.mjs` — bulk import

**Files:**
- Create: `scripts/import-parts.mjs`

**Interfaces:**
- Consumes: `resolvePastedPart` (Task 5), `Data/polo-parts-clean.json` (Task 9).
- Produces: rows in `public.parts` and `public.documents` for the confirmed vehicle.

- [ ] **Step 1: Write the script**

```js
// scripts/import-parts.mjs
// One-off import: reads Data/polo-parts-clean.json (Task 9's output) and inserts each
// entry into `parts`, attempting a price/photo fetch via the same resolvePastedPart
// logic the app's Fetch Details button uses.
//
// Usage (PowerShell, from project root):
//   $env:NODE_OPTIONS="--use-system-ca"; node scripts/import-parts.mjs <vehicle_id> <user_id> [--apply]
//
// Without --apply: dry run — prints what would happen, writes nothing.
// With --apply: actually inserts parts + documents rows.
//
// Reads:
//   VITE_SUPABASE_URL          from .env
//   SUPABASE_SERVICE_ROLE_KEY  from .env.local  (gitignored — bypasses RLS for this one-time import)

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { resolvePastedPart } from '../src/lib/fetchPart/resolvePastedPart.mjs'

function readEnv(file) {
  const out = {}
  if (!existsSync(file)) return out
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) out[m[1]] = m[2].trim()
  }
  return out
}

function fail(msg) { console.error('\n✗ ' + msg + '\n'); process.exit(1) }

const [, , vehicleId, userId, ...rest] = process.argv
const apply = rest.includes('--apply')
if (!vehicleId || !userId) fail('Usage: node scripts/import-parts.mjs <vehicle_id> <user_id> [--apply]')

const env = { ...readEnv('.env'), ...readEnv('.env.local') }
const url = env.VITE_SUPABASE_URL
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
if (!url) fail('Missing VITE_SUPABASE_URL in .env')
if (!serviceKey || serviceKey.length < 20) fail('Missing SUPABASE_SERVICE_ROLE_KEY in .env.local')

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

const DATA_FILE = 'Data/polo-parts-clean.json'
if (!existsSync(DATA_FILE)) fail(`Missing ${DATA_FILE} — run Data/preprocess_polo_xlsx.py first`)
const rowsToImport = JSON.parse(readFileSync(DATA_FILE, 'utf8'))

console.log(`\n${apply ? 'IMPORTING' : 'DRY RUN'} ${rowsToImport.length} entries for vehicle ${vehicleId}\n`)

let imported = 0, noLink = 0, failed = 0
for (const entry of rowsToImport) {
  let fetched = null
  if (entry.supplier_url) {
    try {
      fetched = await resolvePastedPart(entry.supplier_url, { supabaseClient: admin, userId })
    } catch (err) {
      console.log(`  ⚠ fetch failed for "${entry.part_name}": ${err.message}`)
    }
  } else {
    noLink++
  }

  const partRow = {
    vehicle_id: vehicleId,
    purchased_at: new Date().toISOString().split('T')[0],
    part_name: fetched?.title || entry.part_name,
    part_number: entry.part_number,
    supplier_url: entry.supplier_url,
    category: 'Other',
    status: 'Purchased',
    quantity: 1,
  }

  console.log(`  ${entry.part_name.slice(0, 50).padEnd(50)}` +
    (fetched?.price != null ? ` | ${fetched.price} ${fetched.currencyCode || ''}` : '') +
    (fetched?.documentPath ? ' | photo' : ''))

  if (!apply) continue

  const { data, error } = await admin.from('parts').insert([partRow]).select().single()
  if (error) { console.log(`    ✗ insert failed: ${error.message}`); failed++; continue }
  imported++

  if (fetched?.documentPath) {
    const { error: docErr } = await admin.from('documents').insert([{
      id: fetched.documentId,
      vehicle_id: vehicleId,
      file_path: fetched.documentPath,
      file_name: fetched.fileName,
      mime_type: fetched.mimeType,
      file_size: fetched.fileSize,
      kind: 'Photo',
      part_id: data.id,
    }])
    if (docErr) console.log(`    ⚠ photo row failed: ${docErr.message}`)
  }
}

console.log(apply
  ? `\nImported: ${imported} · no link: ${noLink} · failed: ${failed}\n`
  : `\nDry run complete — ${rowsToImport.length} entries listed above, ${noLink} with no supplier link. Re-run with --apply to write.\n`)
```

- [ ] **Step 2: Commit the script (not the generated data)**

```bash
git add scripts/import-parts.mjs
git commit -m "feat(parts): add one-off VW Polo parts bulk-import script"
```

- [ ] **Step 3: Confirm the target vehicle, user, and status before running for real**

Two things to confirm with Chris before `--apply`:

1. **Which vehicle and which Supabase user.** Open the SQL editor:
   `https://supabase.com/dashboard/project/mwakgpzcqoalxtvqucki/sql/new`
   Run:
   ```sql
   select id, name, make, model, year from public.vehicles order by name;
   select id, email from auth.users order by created_at;
   ```
   **You're in the right place if:** the vehicles list matches Chris's actual Stallion Pit fleet
   (not an unfamiliar project). Pick the `id` for the VW Polo and the `id` for Chris's account.

2. **The `status` value.** Most of these ~48 entries are parts Chris still needs to source/confirm
   the number for — not things already bought. The existing `parts.status` enum
   (`In Stock / Purchased / Fitted / Returned`) has no "wanted/still shopping" value, and adding one
   is out of scope for this feature (would touch filters/badges elsewhere). The script above defaults
   every imported row to `status: 'Purchased'` as the closest existing fit — confirm with Chris this
   is acceptable (he can bulk-edit statuses afterward in the Parts UI) before running `--apply`, or
   change that one field in the script if he'd rather default to `'In Stock'` instead.

- [ ] **Step 4: Dry run**

```bash
$env:NODE_OPTIONS="--use-system-ca"; node scripts/import-parts.mjs <vehicle_id> <user_id>
```

**Expected:** prints one line per entry with whatever price/photo was found, ending with a "Dry run
complete" summary. Read through it — this is the last check before anything is written.

- [ ] **Step 5: Live run**

```bash
$env:NODE_OPTIONS="--use-system-ca"; node scripts/import-parts.mjs <vehicle_id> <user_id> --apply
```

**Expected:** "Imported: N · no link: M · failed: 0" (investigate any failures — the summary prints
enough to identify which row). Open the Parts page in the app and confirm the list now shows the
imported entries, with thumbnails on the ones that had a photo.

---

### Task 11: Full verification sweep

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass, including the ~19 new tests added in Tasks 2-6.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no errors. (The `.mjs` files under `src/lib/fetchPart/` and `api/` are outside this
project's lint glob by design — see Global Constraints — so this only checks the `.js`/`.jsx` files.)

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: builds cleanly. Confirms `PartsLog.jsx`'s new imports (`estimateLandedKes`) resolve, and
that nothing under `src/lib/fetchPart/*.mjs` got accidentally imported into browser code (it
shouldn't have been — only `api/fetch-part.mjs` imports `resolvePastedPart.mjs`, and Vite doesn't
touch the `api/` directory at all).
