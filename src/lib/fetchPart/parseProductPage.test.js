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

// Real-world markup separates the number and currency symbol into different
// elements (confirmed against an actual neoriginal.ru product page) — this is
// NOT the same shape as SYMBOL_PRICE_ONLY above, where they're already adjacent.
const SYMBOL_PRICE_SPLIT_ACROSS_TAGS = `<html><body>
<div class="bestOffer--info-price"><div class="list--cell list--cell-price"><span>875,75</span>&nbsp;
					₽
					<div class="offerCard--item"></div></div></div>
</body></html>`

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

  it('extracts a symbol-formatted price even when split across tags/whitespace', () => {
    expect(parseProductHtml(SYMBOL_PRICE_SPLIT_ACROSS_TAGS)).toEqual({
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
