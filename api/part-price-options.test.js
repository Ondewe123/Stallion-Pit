import { beforeEach, describe, expect, it, vi } from 'vitest'

const getUserMock = vi.fn()
const fromMock = vi.fn()
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ auth: { getUser: getUserMock }, from: fromMock })),
}))

const fetchAutodocOptionsForPartMock = vi.fn()
vi.mock('../src/lib/priceOptions/autodoc.mjs', async () => {
  const actual = await vi.importActual('../src/lib/priceOptions/autodoc.mjs')
  return {
    ...actual,
    fetchAutodocOptionsForPart: fetchAutodocOptionsForPartMock,
  }
})

const { default: handler } = await import('./part-price-options.mjs')

function req(body, headers = {}) {
  return new Request('https://app.example.com/api/part-price-options', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

function selectLinkQuery(link) {
  return {
    select() { return this },
    eq() { return this },
    maybeSingle: vi.fn().mockResolvedValue({ data: link, error: null }),
  }
}

function insertSnapshotsQuery() {
  return {
    insert(rows) {
      return {
        select: vi.fn().mockResolvedValue({
          data: rows.map((row, index) => ({ id: `snapshot-${index + 1}`, ...row })),
          error: null,
        }),
      }
    },
  }
}

describe('POST /api/part-price-options', () => {
  beforeEach(() => {
    getUserMock.mockReset()
    fromMock.mockReset()
    fetchAutodocOptionsForPartMock.mockReset()
  })

  it('stores Autodoc price snapshots with UK-to-Kenya landed estimates', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    fromMock.mockImplementation(table => {
      if (table === 'snag_ipc_parts') return selectLinkQuery({
        id: 'link-1',
        snag_id: 'snag-1',
        ipc_part_id: 'ipc-1',
        ipc_parts: {
          id: 'ipc-1',
          part_number: 'A2024703941',
          replacement_numbers: 'A2024702241',
          name: 'SENSOR WITH PUMP',
        },
      })
      if (table === 'part_price_snapshots') return insertSnapshotsQuery()
      throw new Error(`Unexpected table ${table}`)
    })
    fetchAutodocOptionsForPartMock.mockResolvedValue({
      supplier: 'autodoc',
      searchedPartNumbers: ['A2024703941'],
      options: [{
        title: 'Fuel feed unit RIDEX',
        brand: 'RIDEX',
        articleNumber: '1382F0163',
        price: 97.49,
        currencyCode: 'GBP',
        productUrl: 'https://www.autodoc.co.uk/ridex/1382f0163',
        imageUrl: 'https://img/ridex.jpg',
        sourceUrl: 'https://www.autodoc.co.uk/car-parts/oem/a2024703941',
        searchedPartNumber: 'A2024703941',
      }],
    })

    const res = await handler(req({
      snagId: 'snag-1',
      ipcPartId: 'ipc-1',
      freightMethod: 'air',
      weightKg: 2,
    }, { authorization: 'Bearer good' }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.snapshots).toHaveLength(1)
    expect(body.snapshots[0]).toMatchObject({
      user_id: 'user-1',
      snag_id: 'snag-1',
      ipc_part_id: 'ipc-1',
      supplier: 'autodoc',
      searched_part_number: 'A2024703941',
      product_title: 'Fuel feed unit RIDEX',
      brand: 'RIDEX',
      supplier_article_number: '1382F0163',
      price: 97.49,
      currency_code: 'GBP',
      freight_method: 'air',
      freight_weight_kg: 2,
      freight_cost: 35,
      freight_currency_code: 'GBP',
      landed_cost_kes: Math.round((97.49 + 35) * 205),
    })
  })
})
