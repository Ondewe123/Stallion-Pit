// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Ipc, { filterVisibleDiagrams } from './Ipc'

const mockState = vi.hoisted(() => ({
  activeVehicle: null,
  catalogResponses: new Map(),
}))

vi.mock('../contexts/VehicleContext', () => ({
  useVehicle: () => ({ activeVehicle: mockState.activeVehicle }),
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table) => mockState.createQuery(table),
  },
}))

function deferred() {
  let resolve
  const promise = new Promise(r => { resolve = r })
  return { promise, resolve }
}

mockState.createQuery = (table) => ({
  vehicleId: null,
  select() { return this },
  order() { return this },
  eq(column, value) {
    if (column === 'vehicle_id') this.vehicleId = value
    return this
  },
  maybeSingle() {
    if (table !== 'ipc_catalogs') throw new Error(`Unexpected maybeSingle on ${table}`)
    return mockState.catalogResponses.get(this.vehicleId).promise
  },
})

function renderIpc() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => { root.render(<Ipc />) })
  return { container, root }
}

describe('Ipc vehicle switching', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    mockState.catalogResponses = new Map()
    mockState.activeVehicle = { id: 'vehicle-a', name: 'Mercedes', vin: 'VIN-A' }
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.clearAllMocks()
  })

  it('does not render vehicle A catalog after switching to vehicle B before A resolves', async () => {
    const aCatalog = deferred()
    const bCatalog = deferred()
    mockState.catalogResponses.set('vehicle-a', aCatalog)
    mockState.catalogResponses.set('vehicle-b', bCatalog)

    const { container, root } = renderIpc()

    mockState.activeVehicle = { id: 'vehicle-b', name: 'Polo', vin: 'VIN-B' }
    act(() => { root.render(<Ipc />) })

    aCatalog.resolve({
      data: { id: 'catalog-a', source_name: 'ILcats', model_code: 'A-CATALOG' },
      error: null,
    })
    await aCatalog.promise
    await Promise.resolve()

    expect(container.textContent).toContain('Polo')
    expect(container.textContent).not.toContain('A-CATALOG')

    await act(async () => {
      bCatalog.resolve({ data: null, error: null })
      await bCatalog.promise
    })
    expect(container.textContent).toContain('No IPC imported for this vehicle yet.')
  })

  it('does not render vehicle A errors after switching to vehicle B before A rejects', async () => {
    const aCatalog = deferred()
    const bCatalog = deferred()
    mockState.catalogResponses.set('vehicle-a', aCatalog)
    mockState.catalogResponses.set('vehicle-b', bCatalog)

    const { container, root } = renderIpc()

    mockState.activeVehicle = { id: 'vehicle-b', name: 'Polo', vin: 'VIN-B' }
    act(() => { root.render(<Ipc />) })

    aCatalog.resolve({ data: null, error: { message: 'A failed' } })
    await aCatalog.promise
    await Promise.resolve()

    expect(container.textContent).toContain('Polo')
    expect(container.textContent).not.toContain('A failed')

    await act(async () => {
      bCatalog.resolve({ data: null, error: null })
      await bCatalog.promise
    })
  })
})

describe('filterVisibleDiagrams', () => {
  const diagrams = [
    { id: 'empty', catalog_group: '01', branch: 'engine', part_count: 0 },
    { id: 'filled', catalog_group: '01', branch: 'engine', part_count: 4 },
    { id: 'other', catalog_group: '46', branch: 'body', part_count: 2 },
  ]

  it('hides 0-part diagrams when requested', () => {
    expect(filterVisibleDiagrams(diagrams, { hideEmptyDiagrams: true }).map(d => d.id)).toEqual(['filled', 'other'])
  })

  it('keeps group and branch filters with hide-empty enabled', () => {
    expect(filterVisibleDiagrams(diagrams, {
      group: '01',
      branch: 'engine',
      hideEmptyDiagrams: true,
    }).map(d => d.id)).toEqual(['filled'])
  })
})
