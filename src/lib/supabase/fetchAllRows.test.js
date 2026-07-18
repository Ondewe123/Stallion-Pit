import { describe, expect, it } from 'vitest'
import { fetchAllRows } from './fetchAllRows'

describe('fetchAllRows', () => {
  it('loads beyond Supabase default 1000 row pages', async () => {
    const pages = [1000, 1000, 1].map((length, page) => (
      Array.from({ length }, (_, row) => ({ id: `${page}-${row}` }))
    ))
    const ranges = []

    const result = await fetchAllRows(() => ({
      range(from, to) {
        ranges.push([from, to])
        return Promise.resolve({ data: pages.shift(), error: null })
      },
    }))

    expect(result.error).toBeNull()
    expect(result.data).toHaveLength(2001)
    expect(ranges).toEqual([[0, 999], [1000, 1999], [2000, 2999]])
  })
})
