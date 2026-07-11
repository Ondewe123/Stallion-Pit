// src/lib/fetchPart/resolvePastedPart.mjs
// Server-only — never import this from React/browser code.
import { assertSafeUrl } from './ssrfGuard.mjs'
import { parseProductHtml } from './parseProductPage.js'
import { newId, storagePath } from '../docs.js'

const DOCUMENTS_BUCKET = 'documents'
const MAX_HTML_BYTES = 2_000_000
const MAX_IMAGE_BYTES = 8_000_000
const MAX_REDIRECT_HOPS = 2
const FETCH_TIMEOUT_MS = 10_000
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36'

async function readCappedBytes(res, maxBytes) {
  const buf = new Uint8Array(await res.arrayBuffer())
  if (buf.byteLength > maxBytes) throw new Error('Response too large')
  return buf
}

function isRedirectStatus(status) {
  return status >= 300 && status < 400
}

// Fetches with a timeout, aborting the request if it hasn't resolved in time.
// An aborted fetch rejects with an AbortError, which is left to propagate to
// the caller's existing error handling (no special-casing needed here).
//
// Always requests redirect: 'manual'. Without it, fetch()'s default
// redirect: 'follow' behavior transparently follows any 3xx internally and
// hands back only the final response — the caller never sees the
// intermediate redirect, so fetchWithGuard's per-hop assertSafeUrl re-check
// below can never run against the actual redirect target. redirect: 'manual'
// is placed after the caller-supplied init so it can never be overridden by
// an init that happens to set its own redirect option.
async function fetchWithTimeout(fetchImpl, url, init) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetchImpl(url, { ...init, redirect: 'manual', signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

// Fetches a URL, re-validating every redirect target against the SSRF guard
// before following it (never trusts the default follow-redirect behavior,
// which would sail straight past a private address hiding behind a 30x on an
// otherwise-public host). Follows at most MAX_REDIRECT_HOPS hops; a redirect
// beyond that throws. Used for both the page fetch and the image fetch so the
// redirect-following logic exists in exactly one place.
async function fetchWithGuard(url, fetchImpl, lookupOpt, init = {}) {
  let currentUrl = url
  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    await assertSafeUrl(currentUrl, lookupOpt)
    const res = await fetchWithTimeout(fetchImpl, currentUrl, init)
    if (!isRedirectStatus(res.status)) return res

    const location = res.headers.get('location')
    if (!location) return res // malformed redirect — let the caller's !res.ok handling report it

    if (hop === MAX_REDIRECT_HOPS) throw new Error('Too many redirects')
    currentUrl = new URL(location, currentUrl).toString()
  }
  // Unreachable — the loop above always returns or throws.
  throw new Error('Too many redirects')
}

export async function resolvePastedPart(url, { supabaseClient, userId, fetchImpl = fetch, lookup } = {}) {
  const lookupOpt = lookup ? { lookup } : undefined

  const pageRes = await fetchWithGuard(url, fetchImpl, lookupOpt, { headers: { 'User-Agent': USER_AGENT } })
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
      const imgRes = await fetchWithGuard(parsed.imageUrl, fetchImpl, lookupOpt)
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
