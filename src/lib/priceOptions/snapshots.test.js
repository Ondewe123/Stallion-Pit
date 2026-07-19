import { describe, expect, it } from 'vitest'
import { linkPriceSnapshots, priceSnapshotKey } from './snapshots.js'

describe('priceSnapshotKey', () => {
  it('uses snag id and IPC part id as the stable history key', () => {
    expect(priceSnapshotKey('snag-1', 'ipc-1')).toBe('snag-1::ipc-1')
  })
})

describe('linkPriceSnapshots', () => {
  it('attaches latest options and older history to snag IPC links', () => {
    const snapshots = [
      { id: 'old', snag_id: 'snag-1', ipc_part_id: 'ipc-1', fetched_at: '2026-01-01T10:00:00Z' },
      { id: 'new-1', snag_id: 'snag-1', ipc_part_id: 'ipc-1', fetched_at: '2026-07-19T10:00:00Z' },
      { id: 'new-2', snag_id: 'snag-1', ipc_part_id: 'ipc-1', fetched_at: '2026-07-19T10:00:01Z' },
      { id: 'other', snag_id: 'snag-2', ipc_part_id: 'ipc-2', fetched_at: '2026-07-19T10:00:00Z' },
    ]

    expect(linkPriceSnapshots('snag-1', 'ipc-1', snapshots, 2)).toEqual({
      latest: [
        { id: 'new-2', snag_id: 'snag-1', ipc_part_id: 'ipc-1', fetched_at: '2026-07-19T10:00:01Z' },
        { id: 'new-1', snag_id: 'snag-1', ipc_part_id: 'ipc-1', fetched_at: '2026-07-19T10:00:00Z' },
      ],
      history: [
        { id: 'new-2', snag_id: 'snag-1', ipc_part_id: 'ipc-1', fetched_at: '2026-07-19T10:00:01Z' },
        { id: 'new-1', snag_id: 'snag-1', ipc_part_id: 'ipc-1', fetched_at: '2026-07-19T10:00:00Z' },
        { id: 'old', snag_id: 'snag-1', ipc_part_id: 'ipc-1', fetched_at: '2026-01-01T10:00:00Z' },
      ],
    })
  })
})
