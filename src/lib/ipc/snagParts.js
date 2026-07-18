const searchableText = (part) => [
  part?.part_number,
  part?.replacement_numbers,
  part?.name,
  part?.usage,
  part?.remarks,
  part?.diagram_title,
  part?.catalog_group,
  part?.subgroup,
  part?.branch,
  part?.item_no,
].filter(Boolean).join(' ').toLowerCase()

const CATALOG_GROUP_NAMES = {
  '01': 'Engine',
  '03': 'Crankshaft and pistons',
  '05': 'Camshaft and valves',
  '07': 'Fuel injection and engine electronics',
  '09': 'Air intake and compressor',
  '13': 'Belt drive, pumps and compressor',
  '14': 'Intake, exhaust and vacuum system',
  '15': 'Starter, alternator and ignition',
  '18': 'Engine lubrication',
  '20': 'Engine cooling',
  '22': 'Engine supports',
  '24': 'Engine suspension',
  '25': 'Clutch',
  '26': 'Transmission shift controls',
  '29': 'Pedal assembly',
  '30': 'Throttle and control linkage',
  '31': 'Trailer coupling',
  '32': 'Suspension',
  '33': 'Front axle',
  '35': 'Rear axle',
  '40': 'Wheels',
  '41': 'Propeller shaft',
  '42': 'Brakes',
  '46': 'Steering',
  '47': 'Fuel system',
  '49': 'Exhaust system',
  '50': 'Radiator and cooling system',
  '52': 'Engine compartment panels',
  '54': 'Electrical equipment and wiring',
  '58': 'Tools, accessories and plates',
  '60': 'Body shell',
  '61': 'Floor panels',
  '62': 'Front body structure',
  '63': 'Side panels and rear fender',
  '64': 'Rear end',
  '65': 'Roof',
  '67': 'Glass',
  '68': 'Interior trim and insulation',
  '69': 'Interior fittings and headliner',
  '72': 'Front doors',
  '73': 'Rear doors',
  '75': 'Rear lid',
  '78': 'Sliding roof',
  '80': 'Vacuum and central locking',
  '82': 'Electrical switches, lighting and instruments',
  '83': 'Heating and air conditioning',
  '86': 'Wash/wipe system',
  '88': 'Exterior panels and bumpers',
  '91': 'Front seats',
  '92': 'Rear seats',
  '98': 'Tool and safety equipment',
  '99': 'Special equipment and accessories',
}

const SYSTEM_GROUP_HINTS = [
  { terms: ['windscreen', 'windshield', 'glass', 'window', 'cracked', 'stone chip'], groups: ['67', '86'] },
  { terms: ['wiper', 'washer', 'wash wipe'], groups: ['86'] },
  { terms: ['steering', 'power steering', 'rack', 'tie rod'], groups: ['46'] },
  { terms: ['brake', 'brakes', 'abs', 'handbrake'], groups: ['42'] },
  { terms: ['suspension', 'shock', 'strut', 'spring', 'bush'], groups: ['32', '33', '35'] },
  { terms: ['cooling', 'radiator', 'coolant', 'overheat', 'thermostat'], groups: ['20', '50'] },
  { terms: ['fuel', 'pump', 'tank', 'injector'], groups: ['07', '47'] },
  { terms: ['transmission', 'gearbox', 'shift', 'lever'], groups: ['25', '26'] },
  { terms: ['engine mount', 'mounting', 'engine support'], groups: ['22', '24'] },
  { terms: ['engine', 'oil', 'misfire', 'idle'], groups: ['01', '05', '07', '13', '14', '15', '18'] },
  { terms: ['electrical', 'light', 'lamp', 'switch', 'battery', 'alternator'], groups: ['15', '54', '82'] },
  { terms: ['hvac', 'heater', 'aircon', 'air conditioning', 'ac'], groups: ['83'] },
  { terms: ['body', 'bumper', 'door', 'panel', 'trim'], groups: ['60', '62', '63', '64', '68', '72', '73', '88'] },
  { terms: ['exhaust', 'silencer', 'muffler'], groups: ['14', '49'] },
  { terms: ['tyre', 'tire', 'wheel', 'rim'], groups: ['40'] },
]

const SEARCH_SYNONYMS = {
  windscreen: ['windshield'],
  windshield: ['windscreen'],
}

const tokenize = (value) =>
  String(value || '').toLowerCase().match(/[a-z0-9]+/g) || []

const expandedTokens = (value) => {
  const tokens = tokenize(value)
  const expanded = new Set(tokens)
  for (const token of tokens) {
    for (const synonym of SEARCH_SYNONYMS[token] || []) expanded.add(synonym)
  }
  return [...expanded]
}

const diagramKey = (part) => [
  part?.branch,
  part?.catalog_group,
  part?.subgroup,
  part?.diagram_title,
].map(value => String(value || '').trim()).join('|')

const countOptions = (parts, getValue, getLabel) => {
  const counts = new Map()
  for (const part of parts || []) {
    const value = getValue(part)
    if (!value) continue
    const current = counts.get(value) || { value, label: getLabel(part, value), count: 0 }
    current.count += 1
    counts.set(value, current)
  }
  return [...counts.values()].sort((a, b) => String(a.value).localeCompare(String(b.value)))
}

const inferredGroups = (text) => {
  const normalized = String(text || '').toLowerCase()
  const groups = new Set()
  for (const hint of SYSTEM_GROUP_HINTS) {
    if (hint.terms.some(term => normalized.includes(term))) {
      hint.groups.forEach(group => groups.add(group))
    }
  }
  return groups
}

const scorePart = (part, { queryTokens, contextTokens, preferredGroups }) => {
  const text = searchableText(part)
  let score = 0

  if (preferredGroups.has(part.catalog_group)) score += 80
  if (part.diagram_title && [...preferredGroups].some(group => part.catalog_group === group)) score += 10

  for (const token of queryTokens) {
    if (!token) continue
    if (String(part.part_number || '').toLowerCase().includes(token)) score += 45
    else if (String(part.replacement_numbers || '').toLowerCase().includes(token)) score += 35
    else if (String(part.name || '').toLowerCase().includes(token)) score += 30
    else if (text.includes(token)) score += 15
    else score -= 8
  }

  for (const token of contextTokens) {
    if (token.length < 3) continue
    if (String(part.name || '').toLowerCase().includes(token)) score += 18
    else if (String(part.diagram_title || '').toLowerCase().includes(token)) score += 14
    else if (text.includes(token)) score += 5
  }

  return score
}

export function filterIpcParts(parts, query) {
  const queryTokens = tokenize(query)
  if (queryTokens.length === 0) return parts || []
  const alternatives = queryTokens.map(token => [token, ...(SEARCH_SYNONYMS[token] || [])])
  return (parts || []).filter(part => {
    const text = searchableText(part)
    return alternatives.every(group => group.some(token => text.includes(token)))
  })
}

export function groupLabel(code, sourceName) {
  const key = String(code || '').trim()
  const name = String(sourceName || '').trim()
  const hasUsefulSourceName = name && name !== key && !/^\d+$/.test(name)
  const labelName = hasUsefulSourceName ? name : CATALOG_GROUP_NAMES[key]
  return labelName ? `${key} - ${labelName}` : key
}

export function ipcGroupOptions(parts) {
  return countOptions(
    parts,
    part => part?.catalog_group,
    part => groupLabel(part?.catalog_group, part?.group_name),
  )
}

export function ipcBranchOptions(parts) {
  return countOptions(parts, part => part?.branch, (_part, value) => value)
}

export function ipcDiagramOptions(parts, { group = '', branch = '' } = {}) {
  return countOptions(
    (parts || []).filter(part =>
      (!group || part.catalog_group === group) &&
      (!branch || part.branch === branch)
    ),
    diagramKey,
    part => `${part.catalog_group}/${part.subgroup} - ${part.diagram_title}`,
  )
}

export function rankIpcParts(parts, {
  query = '',
  snagTitle = '',
  description = '',
  suspectedSystem = '',
  group = '',
  branch = '',
  diagramKey: selectedDiagramKey = '',
  useSmartContext = true,
} = {}) {
  const queryTokens = expandedTokens(query)
  const context = useSmartContext ? [snagTitle, description, suspectedSystem].filter(Boolean).join(' ') : ''
  const contextTokens = expandedTokens(context)
  const preferredGroups = inferredGroups(context)
  const hasSearch = queryTokens.length > 0

  return (parts || [])
    .filter(part => {
      if (group && part.catalog_group !== group) return false
      if (branch && part.branch !== branch) return false
      if (selectedDiagramKey && diagramKey(part) !== selectedDiagramKey) return false
      if (!hasSearch) return true
      return tokenize(query).every(token => {
        const text = searchableText(part)
        return [token, ...(SEARCH_SYNONYMS[token] || [])].some(candidate => text.includes(candidate))
      })
    })
    .map((part, index) => ({
      part,
      index,
      score: scorePart(part, { queryTokens, contextTokens, preferredGroups }),
    }))
    .sort((a, b) =>
      b.score - a.score ||
      String(a.part.catalog_group || '').localeCompare(String(b.part.catalog_group || '')) ||
      String(a.part.part_number || '').localeCompare(String(b.part.part_number || '')) ||
      a.index - b.index
    )
    .map(item => item.part)
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
