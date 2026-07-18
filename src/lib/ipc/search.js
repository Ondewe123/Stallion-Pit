const haystack = (part) => [
  part.part_number,
  part.replacement_numbers,
  part.name,
  part.usage,
  part.remarks,
].filter(Boolean).join(' ').toLowerCase()

export function matchesPart(part, query) {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return true
  return haystack(part).includes(q)
}

export function filterParts(parts, { query = '', diagramId = '', group = '', branch = '' } = {}) {
  return (parts || []).filter(part => {
    if (diagramId && part.diagram_id !== diagramId) return false
    if (group && part.catalog_group !== group) return false
    if (branch && part.branch !== branch) return false
    return matchesPart(part, query)
  })
}

export function groupOptions(diagrams) {
  const counts = new Map()
  for (const diagram of diagrams || []) {
    const key = diagram.catalog_group
    if (!key) continue
    const current = counts.get(key) || { value: key, label: diagram.group_name || key, count: 0 }
    current.count += 1
    counts.set(key, current)
  }
  return [...counts.values()].sort((a, b) => String(a.value).localeCompare(String(b.value)))
}
