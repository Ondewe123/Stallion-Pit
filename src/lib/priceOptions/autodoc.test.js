import { describe, expect, it } from 'vitest'
import {
  buildAutodocOemUrl,
  estimateUkToKenyaFreight,
  parseAutodocOemPage,
  partNumberSearchOrder,
} from './autodoc.mjs'

describe('partNumberSearchOrder', () => {
  it('searches the current IPC number before older or replacement numbers', () => {
    expect(partNumberSearchOrder({
      part_number: 'A 202 470 39 41',
      replacement_numbers: 'A2024700141, A2024702241',
    })).toEqual(['A2024703941', 'A2024700141', 'A2024702241'])
  })
})

describe('buildAutodocOemUrl', () => {
  it('builds the Autodoc OEM URL from a normalized Mercedes part number', () => {
    expect(buildAutodocOemUrl('A 202 470 39 41')).toBe('https://www.autodoc.co.uk/car-parts/oem/a2024703941')
  })
})

describe('parseAutodocOemPage', () => {
  it('extracts the first three priced product options from structured product data', () => {
    const html = `
      <script type="application/ld+json">
        [
          {"@type":"Product","name":"Fuel feed unit RIDEX","sku":"1382F0163","brand":{"name":"RIDEX"},"image":"https://img/ridex.jpg","offers":{"price":"97.49","priceCurrency":"GBP","url":"https://www.autodoc.co.uk/ridex/1382f0163"}},
          {"@type":"Product","name":"Fuel feed unit MAPCO","sku":"22868","brand":"MAPCO","offers":{"price":"72.99","priceCurrency":"GBP","url":"https://www.autodoc.co.uk/mapco/22868"}},
          {"@type":"Product","name":"Sender unit GEBE","sku":"9 6032 1","brand":{"name":"GEBE"},"offers":{"price":"220.00","priceCurrency":"GBP","url":"https://www.autodoc.co.uk/gebe/960321"}},
          {"@type":"Product","name":"Sender unit HOFFER","sku":"7507418","brand":{"name":"HOFFER"},"offers":{"price":"111.25","priceCurrency":"GBP"}}
        ]
      </script>`

    expect(parseAutodocOemPage(html, 'https://www.autodoc.co.uk/car-parts/oem/a2024703941')).toEqual([
      {
        title: 'Fuel feed unit RIDEX',
        brand: 'RIDEX',
        articleNumber: '1382F0163',
        price: 97.49,
        currencyCode: 'GBP',
        productUrl: 'https://www.autodoc.co.uk/ridex/1382f0163',
        imageUrl: 'https://img/ridex.jpg',
      },
      {
        title: 'Fuel feed unit MAPCO',
        brand: 'MAPCO',
        articleNumber: '22868',
        price: 72.99,
        currencyCode: 'GBP',
        productUrl: 'https://www.autodoc.co.uk/mapco/22868',
        imageUrl: null,
      },
      {
        title: 'Sender unit GEBE',
        brand: 'GEBE',
        articleNumber: '9 6032 1',
        price: 220,
        currencyCode: 'GBP',
        productUrl: 'https://www.autodoc.co.uk/gebe/960321',
        imageUrl: null,
      },
    ])
  })

  it('falls back to visible Autodoc product text when structured data is not present', () => {
    const html = `
      <h2>Fuel feed unit RIDEX A 202 470 39 41 Petrol</h2>
      Article number: 1382F0163
      Item number: 1382F0163
      Our price: £97.49
      Manufacturer: RIDEX
      Condition: New
      <h2>Fuel level sensor Alfa e-Parts A 202 470 39 41 164mm</h2>
      Article number: AF02511
      Our price: £107.99
      Manufacturer: Alfa e-Parts
    `

    expect(parseAutodocOemPage(html, 'https://www.autodoc.co.uk/car-parts/oem/a2024703941')).toEqual([
      {
        title: 'Fuel feed unit RIDEX A 202 470 39 41 Petrol',
        brand: 'RIDEX',
        articleNumber: '1382F0163',
        price: 97.49,
        currencyCode: 'GBP',
        productUrl: 'https://www.autodoc.co.uk/car-parts/oem/a2024703941',
        imageUrl: null,
      },
      {
        title: 'Fuel level sensor Alfa e-Parts A 202 470 39 41 164mm',
        brand: 'Alfa e-Parts',
        articleNumber: 'AF02511',
        price: 107.99,
        currencyCode: 'GBP',
        productUrl: 'https://www.autodoc.co.uk/car-parts/oem/a2024703941',
        imageUrl: null,
      },
    ])
  })
})

describe('estimateUkToKenyaFreight', () => {
  it('uses the air preset by default and converts product plus freight to KES', () => {
    expect(estimateUkToKenyaFreight({ priceGbp: 97.49, weightKg: 2 })).toEqual({
      method: 'air',
      provider: 'UK to Kenya estimate',
      weightKg: 2,
      freightGbp: 35,
      fxRateToKes: 205,
      landedCostKes: Math.round((97.49 + 35) * 205),
    })
  })
})
