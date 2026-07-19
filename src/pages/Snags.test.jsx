// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { snagPricePlanningLinks } from './Snags.jsx'

describe('snagPricePlanningLinks', () => {
  it('returns linked IPC parts that can show price planning controls on the snags list', () => {
    expect(snagPricePlanningLinks({
      snag_ipc_parts: [
        {
          ipc_part_id: 'ipc-1',
          quantity_needed: 1,
          ipc_parts: { part_number: 'A2024703941', name: 'SENSOR WITH PUMP' },
        },
        {
          ipc_part_id: 'ipc-2',
          quantity_needed: 1,
          ipc_parts: { name: 'Missing part number' },
        },
      ],
    })).toEqual([
      {
        ipc_part_id: 'ipc-1',
        quantity_needed: 1,
        ipc_parts: { part_number: 'A2024703941', name: 'SENSOR WITH PUMP' },
        part: { part_number: 'A2024703941', name: 'SENSOR WITH PUMP' },
      },
    ])
  })
})
