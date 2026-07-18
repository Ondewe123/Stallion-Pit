export function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let inQuotes = false

  const pushCell = () => {
    row.push(cell)
    cell = ''
  }
  const pushRow = () => {
    if (row.length === 1 && row[0] === '' && rows.length === 0) return
    rows.push(row)
    row = []
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const next = text[i + 1]
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        cell += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      pushCell()
    } else if (ch === '\n') {
      pushCell()
      pushRow()
    } else if (ch !== '\r') {
      cell += ch
    }
  }
  if (inQuotes) throw new Error('Malformed CSV: unterminated quoted field')
  pushCell()
  if (row.some(v => v !== '')) pushRow()

  const [headers, ...body] = rows
  if (!headers) return []
  return body.map(values => Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ''])))
}
