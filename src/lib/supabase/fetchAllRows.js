const DEFAULT_PAGE_SIZE = 1000

export async function fetchAllRows(queryFactory, pageSize = DEFAULT_PAGE_SIZE) {
  const rows = []
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1
    const { data, error } = await queryFactory().range(from, to)
    if (error) return { data: rows, error }
    rows.push(...(data || []))
    if (!data || data.length < pageSize) return { data: rows, error: null }
  }
}
