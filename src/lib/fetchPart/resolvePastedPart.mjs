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
