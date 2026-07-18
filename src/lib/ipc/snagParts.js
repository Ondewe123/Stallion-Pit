const searchableText = (part) => [
  part?.part_number,
  part?.replacement_numbers,
  part?.name,
  part?.usage,
  part?.remarks,
].filter(Boolean).join(' ').toLowerCase()

export function filterIpcParts(parts, query) {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return parts || []
  return (parts || []).filter(part => searchableText(part).includes(q))
}

export function addSelectedIpcPart(selected, part) {
  if (!part?.id) return selected || []
  if ((selected || []).some(link => link.ipc_part_id === part.id)) return selected
  return [...(selected || []), { ipc_part_id: part.id, quantity_needed: 1, part }]
}

export function selectedIpcPartIds(selected) {
  return (selected || []).map(link => link.ipc_part_id).filter(Boolean)
}

export function toWorkOrderPartRows(selected, workOrderId) {
  return (selected || []).map(link => {
    const part = link.part || link.ipc_parts || {}
    return {
      work_order_id: workOrderId,
      ipc_part_id: link.ipc_part_id || part.id,
      part_name: part.name || part.part_number || 'IPC part',
      part_number: part.part_number || null,
      brand: 'IPC',
      status: 'Planned',
      quantity: Number(link.quantity_needed || 1),
      unit_cost_kes: null,
      total_cost_kes: null,
    }
  })
}
