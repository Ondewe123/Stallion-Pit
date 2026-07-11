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
