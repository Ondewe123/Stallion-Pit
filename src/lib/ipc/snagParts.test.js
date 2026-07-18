import { describe, it, expect } from 'vitest'
import {
  addSelectedIpcPart,
  filterIpcParts,
  groupLabel,
  ipcBranchOptions,
  ipcDiagramOptions,
  ipcGroupOptions,
  rankIpcParts,
  selectedIpcPartIds,
  toWorkOrderPartRows,
} from './snagParts'

const ipcParts = [
  {
    id: 'ipc-1',
    branch: 'engine',
    catalog_group: '22',
    group_name: '22',
    subgroup: '010',
    diagram_title: 'ENGINE SUSPENSION',
    part_number: 'A2022401617',
    replacement_numbers: '',
    name: 'ENGINE MOUNTING FRONT LEFT',
    usage: '',
    remarks: '',
  },
  {
    id: 'ipc-2',
    branch: 'transmission',
    catalog_group: '26',
    group_name: '26',
    subgroup: '020',
    diagram_title: 'FLOOR SHIFT,AUTOMATIC TRANSMISSION',
    part_number: 'A2022600109',
    replacement_numbers: 'A2022600209',
    name: 'SHIFT LEVER',
    usage: '423: 5 SPEED AUTOMATIC',
    remarks: 'M 6X20',
  },
  {
    id: 'ipc-3',
    branch: 'body',
    catalog_group: '67',
    group_name: '67',
    subgroup: '030',
    diagram_title: 'WINDSHIELD GLASS',
    item_no: '5',
    part_number: 'A2026700100',
    replacement_numbers: '',
    name: 'WINDSHIELD',
    usage: 'LAMINATED GLASS',
    remarks: '',
  },
  {
    id: 'ipc-4',
    branch: 'body',
    catalog_group: '86',
    group_name: '86',
    subgroup: '040',
    diagram_title: 'WIPER SYSTEM',
    item_no: '12',
    part_number: 'A2028200145',
    replacement_numbers: '',
    name: 'WIPER ARM',
    usage: '',
    remarks: '',
  },
  {
    id: 'ipc-5',
    branch: 'body_chassis_44V',
    catalog_group: '54',
    group_name: '54',
    subgroup: '091',
    diagram_title: 'HEADLAMP CABLE HARNESS',
    item_no: '10',
    part_number: 'A0085453728',
    replacement_numbers: '',
    name: 'CLUTCH WINDSHIELD WASHER PUMP;2-POLE',
    usage: '',
    remarks: '',
  },
]

describe('filterIpcParts', () => {
  it('matches part number, replacement number, name, usage, and remarks', () => {
    expect(filterIpcParts(ipcParts, 'A2022401617').map(p => p.id)).toEqual(['ipc-1'])
    expect(filterIpcParts(ipcParts, 'A2022600209').map(p => p.id)).toEqual(['ipc-2'])
    expect(filterIpcParts(ipcParts, 'mounting').map(p => p.id)).toEqual(['ipc-1'])
    expect(filterIpcParts(ipcParts, 'automatic').map(p => p.id)).toEqual(['ipc-2'])
    expect(filterIpcParts(ipcParts, 'm 6x20').map(p => p.id)).toEqual(['ipc-2'])
  })

  it('treats windscreen and windshield as equivalent search terms', () => {
    expect(filterIpcParts(ipcParts, 'windscreen').map(p => p.id)).toEqual(['ipc-3', 'ipc-5'])
  })
})

describe('rankIpcParts', () => {
  it('uses snag details to rank likely replacement parts above unrelated matches', () => {
    const ranked = rankIpcParts(ipcParts, {
      snagTitle: 'Cracked windscreen',
      description: 'Cracked by stone on Southern Bypass',
    })

    expect(ranked.map(p => p.id).slice(0, 2)).toEqual(['ipc-3', 'ipc-4'])
  })

  it('combines manual search with group, branch, and diagram filters', () => {
    expect(rankIpcParts(ipcParts, { query: 'glass', group: '67' }).map(p => p.id)).toEqual(['ipc-3'])
    expect(rankIpcParts(ipcParts, { branch: 'engine' }).map(p => p.id)).toEqual(['ipc-1'])
    expect(rankIpcParts(ipcParts, { diagramKey: 'body|86|040|WIPER SYSTEM' }).map(p => p.id)).toEqual(['ipc-4'])
  })

  it('uses windscreen synonyms when searching and ranking sparse IPC rows', () => {
    const ranked = rankIpcParts(ipcParts, {
      query: 'windscreen',
      snagTitle: 'Cracked windscreen',
    })

    expect(ranked.map(p => p.id)).toEqual(['ipc-3', 'ipc-5'])
  })
})

describe('IPC picker options', () => {
  it('builds stable group, branch, and diagram options from IPC parts', () => {
    expect(groupLabel('67', '67')).toBe('67 - Glass')
    expect(ipcGroupOptions(ipcParts).find(option => option.value === '67')).toEqual({
      value: '67',
      label: '67 - Glass',
      count: 1,
    })
    expect(ipcBranchOptions(ipcParts)).toContainEqual({ value: 'body', label: 'body', count: 2 })
    expect(ipcDiagramOptions(ipcParts, { group: '86' })).toEqual([{
      value: 'body|86|040|WIPER SYSTEM',
      label: '86/040 - WIPER SYSTEM',
      count: 1,
    }])
  })
})

describe('addSelectedIpcPart', () => {
  it('adds a new IPC part with quantity 1 and does not duplicate existing parts', () => {
    const first = addSelectedIpcPart([], ipcParts[0])
    const second = addSelectedIpcPart(first, ipcParts[0])

    expect(first).toEqual([{ ipc_part_id: 'ipc-1', quantity_needed: 1, part: ipcParts[0] }])
    expect(second).toEqual(first)
  })
})

describe('selectedIpcPartIds', () => {
  it('extracts stable ids from selected links', () => {
    expect(selectedIpcPartIds([
      { ipc_part_id: 'ipc-1' },
      { ipc_part_id: 'ipc-2' },
    ])).toEqual(['ipc-1', 'ipc-2'])
  })
})

describe('toWorkOrderPartRows', () => {
  it('creates planned work-order part rows from selected IPC links', () => {
    expect(toWorkOrderPartRows([
      { ipc_part_id: 'ipc-1', quantity_needed: 2, part: ipcParts[0] },
    ], 'wo-1')).toEqual([{
      work_order_id: 'wo-1',
      ipc_part_id: 'ipc-1',
      part_name: 'ENGINE MOUNTING FRONT LEFT',
      part_number: 'A2022401617',
      brand: 'IPC',
      status: 'Planned',
      quantity: 2,
      unit_cost_kes: null,
      total_cost_kes: null,
    }])
  })
})
