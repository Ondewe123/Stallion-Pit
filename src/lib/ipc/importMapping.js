const trim = (value) => {
  const text = String(value ?? '').trim()
  return text === '' ? null : text
}

export function diagramKey(row) {
  return [row.branch, row.catalog_group ?? row.group, row.subgroup].map(v => String(v ?? '').trim()).join('|')
}

export function searchTextForPart(part) {
  return [
    part.part_number,
    part.replacement_numbers,
    part.name,
    part.usage,
    part.remarks,
  ].filter(Boolean).join(' ').toLowerCase()
}

export function buildIpcImport(diagramRows, partRows, { vehicleId, userId, sourceName = 'ILcats', sourceFilePrefix = null }) {
  if (!partRows.length) throw new Error('IPC parts file has no rows')
  const vins = [...new Set(partRows.map(r => trim(r.vin)).filter(Boolean))]
  if (vins.length !== 1) throw new Error('IPC parts file contains multiple VINs')
  const first = partRows[0]
  const vin = vins[0]

  const catalog = {
    vehicle_id: vehicleId,
    vin,
    model_code: trim(first.model_code),
    engine_code: trim(first.engine_code),
    gearbox_code: trim(first.gearbox_code),
    source_name: sourceName,
    source_file_prefix: sourceFilePrefix,
    user_id: userId,
  }

  const diagrams = diagramRows.map(row => ({
    branch: trim(row.branch),
    catalog_group: trim(row.group),
    group_name: trim(row.group_name),
    subgroup: trim(row.subgroup),
    diagram_title: trim(row.diagram_title),
    part_count: Number(row.part_count || 0),
    source_url: trim(row.source_url),
    image_url: trim(row.image_url),
    user_id: userId,
    _key: diagramKey({ ...row, catalog_group: row.group }),
  }))

  const parts = partRows.map(row => ({
    vin: trim(row.vin),
    model_code: trim(row.model_code),
    engine_code: trim(row.engine_code),
    gearbox_code: trim(row.gearbox_code),
    branch: trim(row.branch),
    catalog_group: trim(row.catalog_group),
    group_name: trim(row.group_name),
    subgroup: trim(row.subgroup),
    diagram_title: trim(row.diagram_title),
    item_no: trim(row.item_no),
    part_number: trim(row.part_number),
    replacement_numbers: trim(row.replacement_numbers),
    quantity: trim(row.quantity),
    name: trim(row.name),
    usage: trim(row.usage),
    remarks: trim(row.remarks),
    source_url: trim(row.source_url),
    diagram_image_url: trim(row.diagram_image_url),
    price_url: trim(row.price_url),
    user_id: userId,
    _diagramKey: diagramKey(row),
  }))

  return { catalog, diagrams, parts }
}
