import { parseCsv } from './csv.js'

const DIAGRAM_HEADERS = ['branch', 'group', 'group_name', 'subgroup', 'diagram_title', 'part_count', 'source_url', 'image_url']
const PART_HEADERS = [
  'vin',
  'model_code',
  'engine_code',
  'gearbox_code',
  'branch',
  'catalog_group',
  'group_name',
  'subgroup',
  'diagram_title',
  'item_no',
  'part_number',
  'replacement_numbers',
  'quantity',
  'name',
  'usage',
  'remarks',
  'source_url',
  'diagram_image_url',
  'price_url',
]

const csvCell = (value) => {
  const text = String(value ?? '')
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

const toCsv = (headers, rows) =>
  [headers.join(','), ...rows.map(row => headers.map(header => csvCell(row[header])).join(','))].join('\n') + '\n'

const diagramKey = (row) => [
  row.branch,
  row.group,
  row.subgroup,
  row.source_url,
].map(value => String(value ?? '').trim()).join('|')

const partKey = (row) => [
  row.vin,
  row.branch,
  row.catalog_group,
  row.subgroup,
  row.item_no,
  row.part_number,
  row.replacement_numbers,
  row.quantity,
  row.name,
  row.usage,
  row.remarks,
].map(value => String(value ?? '').trim()).join('|')

const mergeRows = (groups, keyFor) => {
  const byKey = new Map()
  let inputRows = 0
  for (const rows of groups) {
    for (const row of rows) {
      inputRows += 1
      byKey.set(keyFor(row), row)
    }
  }
  return { inputRows, rows: [...byKey.values()] }
}

export function mergeIpcCsvFiles(files) {
  const diagramGroups = files.map(file => parseCsv(file.diagramsCsv || ''))
  const partGroups = files.map(file => parseCsv(file.partsCsv || ''))
  const diagrams = mergeRows(diagramGroups, diagramKey)
  const parts = mergeRows(partGroups, partKey)

  return {
    diagramsCsv: toCsv(DIAGRAM_HEADERS, diagrams.rows),
    partsCsv: toCsv(PART_HEADERS, parts.rows),
    summary: {
      inputDiagramRows: diagrams.inputRows,
      inputPartRows: parts.inputRows,
      outputDiagramRows: diagrams.rows.length,
      outputPartRows: parts.rows.length,
    },
  }
}
