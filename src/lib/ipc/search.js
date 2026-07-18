const haystack = (part) => [
  part.part_number,
  part.replacement_numbers,
  part.name,
  part.usage,
  part.remarks,
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

function groupLabel(code, sourceName) {
  const key = String(code || '').trim()
  const name = String(sourceName || '').trim()
  const hasUsefulSourceName = name && name !== key && !/^\d+$/.test(name)
  const labelName = hasUsefulSourceName ? name : CATALOG_GROUP_NAMES[key]
  return labelName ? `${key} - ${labelName}` : key
}

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
    const current = counts.get(key) || { value: key, label: groupLabel(key, diagram.group_name), count: 0 }
    current.count += 1
    counts.set(key, current)
  }
  return [...counts.values()].sort((a, b) => String(a.value).localeCompare(String(b.value)))
}
