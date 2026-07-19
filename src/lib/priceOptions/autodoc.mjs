import { CURRENCY_TO_KES } from '../priceEstimate.js'

const AUTODOC_BASE = 'https://www.autodoc.co.uk/car-parts/oem/'
const MAX_OPTIONS = 3

export const UK_TO_KENYA_FREIGHT_PRESETS = {
  air: { method: 'air', provider: 'UK to Kenya estimate', rateGbpPerKg: 7.5, handlingGbp: 20 },
  sea: { method: 'sea', provider: 'UK to Kenya estimate', rateGbpPerKg: 2.5, handlingGbp: 20 },
}

export function normalizePartNumber(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function buildAutodocOemUrl(partNumber) {
  const normalized = normalizePartNumber(partNumber).toLowerCase()
  return `${AUTODOC_BASE}${encodeURIComponent(normalized)}`
}

function splitPartNumbers(value) {
  return String(value || '')
    .split(/[,\s;|/]+/)
    .map(normalizePartNumber)
    .filter(Boolean)
}

export function partNumberSearchOrder(part = {}) {
  return [
    normalizePartNumber(part.part_number),
    ...splitPartNumbers(part.replacement_numbers),
    ...splitPartNumbers(part.superseded_numbers?.join?.(',') || ''),
  ].filter((value, index, all) => value && all.indexOf(value) === index)
}

function asArray(value) {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function walkJsonLd(node, out = []) {
  if (!node) return out
  if (Array.isArray(node)) {
    node.forEach(child => walkJsonLd(child, out))
    return out
  }
  if (typeof node !== 'object') return out
  const type = node['@type']
  const types = Array.isArray(type) ? type : [type]
  if (types.includes('Product')) out.push(node)
  for (const key of ['@graph', 'itemListElement']) walkJsonLd(node[key], out)
  return out
}

function parseJsonLdProducts(html) {
  const products = []
  const scripts = String(html || '').matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
  for (const match of scripts) {
    try {
      products.push(...walkJsonLd(JSON.parse(match[1].trim())))
    } catch {
      // Supplier pages often contain unrelated malformed script blocks; ignore them.
    }
  }
  return products
}

function firstImage(image) {
  if (Array.isArray(image)) return image[0] || null
  return image || null
}

function brandName(brand) {
  if (!brand) return null
  return typeof brand === 'string' ? brand : brand.name || null
}

function offerFor(product) {
  return asArray(product.offers)[0] || {}
}

function productToOption(product, sourceUrl) {
  const offer = offerFor(product)
  const price = offer.price != null ? Number(String(offer.price).replace(',', '.')) : null
  if (price == null || Number.isNaN(price)) return null
  return {
    title: product.name || null,
    brand: brandName(product.brand),
    articleNumber: product.sku || product.mpn || null,
    price,
    currencyCode: String(offer.priceCurrency || 'GBP').toUpperCase(),
    productUrl: offer.url || product.url || sourceUrl,
    imageUrl: firstImage(product.image),
  }
}

function dedupeOptions(options) {
  const seen = new Set()
  return options.filter(option => {
    const key = [option.articleNumber, option.productUrl, option.price].join('|')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function htmlToText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(h\d|p|div|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .trim()
}

function previousMeaningfulLine(lines, index) {
  for (let i = index - 1; i >= 0; i -= 1) {
    const line = lines[i]?.trim()
    if (!line) continue
    if (/^(manufacturers?|details|reviews?|submit a review|show|image:)/i.test(line)) continue
    return line
  }
  return null
}

function parseVisibleProductBlocks(html, sourceUrl) {
  const lines = htmlToText(html).split(/\n+/).map(line => line.trim()).filter(Boolean)
  const out = []
  for (let i = 0; i < lines.length; i += 1) {
    const article = lines[i].match(/^Article number:\s*(.+)$/i)
    if (!article) continue
    const block = lines.slice(i, i + 14).join('\n')
    const price = block.match(/Our price:\s*£\s*([\d,.]+)/i)
    const manufacturer = block.match(/Manufacturer:\s*([^\n]+)/i)
    if (!price) continue
    out.push({
      title: previousMeaningfulLine(lines, i),
      brand: manufacturer?.[1]?.trim() || null,
      articleNumber: article[1].trim(),
      price: Number(price[1].replace(/,/g, '')),
      currencyCode: 'GBP',
      productUrl: sourceUrl,
      imageUrl: null,
    })
  }
  return out.filter(option => !Number.isNaN(option.price))
}

export function parseAutodocOemPage(html, sourceUrl, limit = MAX_OPTIONS) {
  const structured = parseJsonLdProducts(html)
    .map(product => productToOption(product, sourceUrl))
    .filter(Boolean)
  const fallback = structured.length ? [] : parseVisibleProductBlocks(html, sourceUrl)
  return dedupeOptions([...structured, ...fallback]).slice(0, limit)
}

export function estimateUkToKenyaFreight({ priceGbp, weightKg = 1, method = 'air' } = {}) {
  const preset = UK_TO_KENYA_FREIGHT_PRESETS[method] || UK_TO_KENYA_FREIGHT_PRESETS.air
  const safeWeight = Math.max(Number(weightKg) || 1, 0.1)
  const freightGbp = Number((safeWeight * preset.rateGbpPerKg + preset.handlingGbp).toFixed(2))
  const fxRateToKes = CURRENCY_TO_KES.GBP
  return {
    method: preset.method,
    provider: preset.provider,
    weightKg: safeWeight,
    freightGbp,
    fxRateToKes,
    landedCostKes: Math.round((Number(priceGbp || 0) + freightGbp) * fxRateToKes),
  }
}

export async function fetchAutodocOptionsForPart(part, { fetchImpl = fetch, limit = MAX_OPTIONS } = {}) {
  const searchedPartNumbers = []
  const options = []
  for (const partNumber of partNumberSearchOrder(part)) {
    const sourceUrl = buildAutodocOemUrl(partNumber)
    searchedPartNumbers.push(partNumber)
    const response = await fetchImpl(sourceUrl, {
      headers: {
        'user-agent': 'Mozilla/5.0 StallionPit/1.0 price planning',
        accept: 'text/html,application/xhtml+xml',
      },
    })
    if (!response.ok) continue
    const html = await response.text()
    options.push(...parseAutodocOemPage(html, sourceUrl, limit - options.length)
      .map(option => ({ ...option, sourceUrl, searchedPartNumber: partNumber })))
    if (options.length >= limit) break
  }
  return { supplier: 'autodoc', searchedPartNumbers, options: options.slice(0, limit) }
}
