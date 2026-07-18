import { describe, expect, it } from 'vitest'
import { isCurrentVehicleRequest, scopeVehicleLoad } from './vehicleScope'

describe('isCurrentVehicleRequest', () => {
  it('rejects a deferred response after the active vehicle changes', () => {
    const requestVehicleId = 'vehicle-a'
    let latestVehicleId = 'vehicle-a'
    expect(isCurrentVehicleRequest(latestVehicleId, requestVehicleId)).toBe(true)

    latestVehicleId = 'vehicle-b'
    expect(isCurrentVehicleRequest(latestVehicleId, requestVehicleId)).toBe(false)
  })

  it('rejects a cancelled request even when vehicle ids match', () => {
    expect(isCurrentVehicleRequest('vehicle-a', 'vehicle-a', true)).toBe(false)
  })
})

describe('scopeVehicleLoad', () => {
  it('does not expose vehicle A catalog data after switching to vehicle B', () => {
    const scoped = scopeVehicleLoad({
      activeVehicleId: 'vehicle-b',
      loadedVehicleId: 'vehicle-a',
      catalog: { id: 'catalog-a', source_name: 'ILcats' },
      diagrams: [{ id: 'diagram-a', diagram_title: 'A diagram' }],
      parts: [{ id: 'part-a', name: 'A part' }],
      error: null,
      errorVehicleId: '',
    })

    expect(scoped.catalog).toBeNull()
    expect(scoped.diagrams).toEqual([])
    expect(scoped.parts).toEqual([])
  })

  it('does not expose vehicle A errors after switching to vehicle B', () => {
    const scoped = scopeVehicleLoad({
      activeVehicleId: 'vehicle-b',
      loadedVehicleId: '',
      catalog: null,
      diagrams: [],
      parts: [],
      error: 'A failed',
      errorVehicleId: 'vehicle-a',
    })

    expect(scoped.error).toBeNull()
  })
})
