import { describe, it, expect } from 'vitest'
import { matchesPart, filterParts, groupOptions } from './search'

const parts = [
  { id: 'p1', diagram_id: 'd1', branch: 'body', catalog_group: '24', part_number: 'A2022401617', replacement_numbers: '', name: 'ENGINE MOUNTING FRONT LEFT', usage: '', remarks: '' },
  { id: 'p2', diagram_id: 'd2', branch: 'body', catalog_group: '26', part_number: 'A2022600109', replacement_numbers: 'A2022600209', name: 'SHIFT LEVER', usage: 'AUTOMATIC', remarks: 'M 6X20' },
]

describe('matchesPart', () => {
  it('matches part number, replacement number, name, usage, and remarks', () => {
    expect(matchesPart(parts[0], 'A2022401617')).toBe(true)
    expect(matchesPart(parts[1], 'A2022600209')).toBe(true)
    expect(matchesPart(parts[1], 'shift')).toBe(true)
    expect(matchesPart(parts[1], 'automatic')).toBe(true)
    expect(matchesPart(parts[1], 'm 6x20')).toBe(true)
  })
})

describe('filterParts', () => {
  it('filters by query, diagram, group, and branch', () => {
    expect(filterParts(parts, { query: 'engine' }).map(p => p.id)).toEqual(['p1'])
    expect(filterParts(parts, { diagramId: 'd2' }).map(p => p.id)).toEqual(['p2'])
    expect(filterParts(parts, { group: '24' }).map(p => p.id)).toEqual(['p1'])
    expect(filterParts(parts, { branch: 'body' }).map(p => p.id)).toEqual(['p1', 'p2'])
  })
})

describe('groupOptions', () => {
  it('counts diagrams per group', () => {
    expect(groupOptions([
      { catalog_group: '24', group_name: '24' },
      { catalog_group: '24', group_name: '24' },
      { catalog_group: '26', group_name: '26' },
    ])).toEqual([
      { value: '24', label: '24', count: 2 },
      { value: '26', label: '26', count: 1 },
    ])
  })
})
