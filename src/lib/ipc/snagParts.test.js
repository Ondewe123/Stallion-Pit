import { describe, it, expect } from 'vitest'
import {
  addSelectedIpcPart,
  filterIpcParts,
  selectedIpcPartIds,
  toWorkOrderPartRows,
} from './snagParts'

const ipcParts = [
  {
    id: 'ipc-1',
    part_number: 'A2022401617',
    replacement_numbers: '',
    name: 'ENGINE MOUNTING FRONT LEFT',
    usage: '',
    remarks: '',
  },
  {
    id: 'ipc-2',
    part_number: 'A2022600109',
    replacement_numbers: 'A2022600209',
    name: 'SHIFT LEVER',
    usage: '423: 5 SPEED AUTOMATIC',
    remarks: 'M 6X20',
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
