import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useVehicle } from '../contexts/VehicleContext'
import { supabase } from '../lib/supabase'
import { filterParts, groupOptions } from '../lib/ipc/search'
import { isCurrentVehicleRequest, scopeVehicleLoad } from '../lib/ipc/vehicleScope'

const copyText = async (text) => {
  try { await navigator.clipboard.writeText(text) } catch { /* non-fatal */ }
}

const PAGE_SIZE = 1000

export async function fetchAllRows(queryFactory) {
  const rows = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1
    const { data, error } = await queryFactory().range(from, to)
    if (error) return { data: rows, error }
    rows.push(...(data || []))
    if (!data || data.length < PAGE_SIZE) return { data: rows, error: null }
  }
}

export default function Ipc() {
  const { activeVehicle } = useVehicle()
  const activeVehicleId = activeVehicle?.id || ''
  const latestVehicleId = useRef(activeVehicleId)
  latestVehicleId.current = activeVehicleId
  const [catalog, setCatalog] = useState(null)
  const [loadedVehicleId, setLoadedVehicleId] = useState('')
  const [diagrams, setDiagrams] = useState([])
  const [parts, setParts] = useState([])
  const [selectedDiagramId, setSelectedDiagramId] = useState('')
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState('')
  const [branch, setBranch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [errorVehicleId, setErrorVehicleId] = useState('')

  useEffect(() => {
    let cancelled = false
    const vehicleId = activeVehicleId
    const isCurrent = () => isCurrentVehicleRequest(latestVehicleId.current, vehicleId, cancelled)

    const fetchData = async () => {
      if (!vehicleId) {
        setLoading(false)
        setLoadedVehicleId('')
        setErrorVehicleId('')
        return
      }

      setLoading(true)
      setError(null)
      setErrorVehicleId('')
      setCatalog(null)
      setLoadedVehicleId('')
      setDiagrams([])
      setParts([])
      setSelectedDiagramId('')

      const { data: cat, error: catErr } = await supabase
        .from('ipc_catalogs').select('*').eq('vehicle_id', vehicleId).maybeSingle()
      if (!isCurrent()) return
      if (catErr) {
        setError(catErr.message)
        setErrorVehicleId(vehicleId)
        setLoading(false)
        return
      }
      if (!cat) {
        setLoading(false)
        return
      }

      const [{ data: diagramRows, error: diagramErr }, { data: partRows, error: partErr }] = await Promise.all([
        fetchAllRows(() => supabase
          .from('ipc_diagrams')
          .select('*')
          .eq('catalog_id', cat.id)
          .order('catalog_group')
          .order('subgroup')),
        fetchAllRows(() => supabase
          .from('ipc_parts')
          .select('*')
          .eq('catalog_id', cat.id)
          .order('catalog_group')
          .order('subgroup')
          .order('item_no')),
      ])
      if (!isCurrent()) return
      if (diagramErr || partErr) {
        setError(diagramErr?.message || partErr?.message)
        setErrorVehicleId(vehicleId)
        setLoading(false)
        return
      }
      setCatalog(cat)
      setLoadedVehicleId(vehicleId)
      setDiagrams(diagramRows || [])
      setParts(partRows || [])
      setSelectedDiagramId(diagramRows?.[0]?.id || '')
      setLoading(false)
    }

    fetchData()
    return () => { cancelled = true }
  }, [activeVehicleId])

  const scoped = scopeVehicleLoad({
    activeVehicleId,
    loadedVehicleId,
    catalog,
    diagrams,
    parts,
    error,
    errorVehicleId,
  })
  const catalogForActiveVehicle = scoped.catalog
  const diagramsForActiveVehicle = scoped.diagrams
  const partsForActiveVehicle = scoped.parts
  const errorForActiveVehicle = scoped.error

  const groups = useMemo(() => groupOptions(diagramsForActiveVehicle), [diagramsForActiveVehicle])
  const branches = useMemo(() => [...new Set(diagramsForActiveVehicle.map(d => d.branch).filter(Boolean))].sort(), [diagramsForActiveVehicle])
  const selectedDiagram = diagramsForActiveVehicle.find(d => d.id === selectedDiagramId) || null
  const shownParts = useMemo(() => filterParts(partsForActiveVehicle, {
    query, diagramId: query ? '' : selectedDiagramId, group, branch,
  }), [partsForActiveVehicle, query, selectedDiagramId, group, branch])
  const visibleDiagrams = diagramsForActiveVehicle.filter(d =>
    (!group || d.catalog_group === group) && (!branch || d.branch === branch)
  )

  if (!activeVehicle) return (
    <div className="page">
      <div className="page-header"><h2>IPC</h2></div>
      <div className="placeholder-card"><p>Select a vehicle to view its parts catalog</p></div>
    </div>
  )

  return (
    <div className="page">
      <div className="page-header">
        <h2>IPC</h2>
        <p className="page-sub">
          {activeVehicle.name}{activeVehicle.vin ? ` - VIN ${activeVehicle.vin}` : ''}
          {catalogForActiveVehicle ? ` - ${diagramsForActiveVehicle.length} diagrams - ${partsForActiveVehicle.length} parts` : ''}
        </p>
      </div>
      {errorForActiveVehicle && <div className="form-error">{errorForActiveVehicle}</div>}
      {loading ? (
        <div className="placeholder-card"><p>Loading IPC...</p></div>
      ) : !catalogForActiveVehicle ? (
        <div className="placeholder-card"><p>No IPC imported for this vehicle yet.</p></div>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="form-row-2">
              <div className="form-group">
                <label>Search parts</label>
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder="part number, replacement, name, usage, remarks" />
              </div>
              <div className="form-group">
                <label>Group</label>
                <select value={group} onChange={e => { setGroup(e.target.value); setSelectedDiagramId('') }}>
                  <option value="">All groups</option>
                  {groups.map(g => <option key={g.value} value={g.value}>{g.label} ({g.count})</option>)}
                </select>
              </div>
            </div>
            <div className="form-row-2">
              <div className="form-group">
                <label>Branch</label>
                <select value={branch} onChange={e => { setBranch(e.target.value); setSelectedDiagramId('') }}>
                  <option value="">All branches</option>
                  {branches.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Catalog</label>
                <input value={`${catalogForActiveVehicle.source_name} - ${catalogForActiveVehicle.model_code || ''} ${catalogForActiveVehicle.engine_code || ''} ${catalogForActiveVehicle.gearbox_code || ''}`.trim()} readOnly />
              </div>
            </div>
          </div>

          <div className="ipc-layout">
            <div className="table-wrapper">
              <table className="data-table">
                <thead><tr><th>Diagram</th><th>Parts</th></tr></thead>
                <tbody>{visibleDiagrams.map(d => (
                  <tr key={d.id} onClick={() => setSelectedDiagramId(d.id)} style={{ cursor: 'pointer' }}>
                    <td className={selectedDiagramId === d.id ? 'primary' : ''}>
                      {d.catalog_group}/{d.subgroup}
                      <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{d.diagram_title}</div>
                    </td>
                    <td className="mono">{d.part_count}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>

            <div className="ipc-detail-pane">
              {selectedDiagram && (
                <div className="card ipc-diagram-card">
                  <div className="card-label">{selectedDiagram.catalog_group}/{selectedDiagram.subgroup}</div>
                  <h3 style={{ marginTop: 4 }}>{selectedDiagram.diagram_title}</h3>
                  {selectedDiagram.image_url && (
                    <div className="ipc-diagram-image">
                      <img src={selectedDiagram.image_url} alt={selectedDiagram.diagram_title} />
                    </div>
                  )}
                  {selectedDiagram.source_url && (
                    <button className="row-btn" style={{ marginTop: 10 }} onClick={() => window.open(selectedDiagram.source_url, '_blank', 'noopener')}>Open source</button>
                  )}
                </div>
              )}
              <div className="ipc-parts-panel">
                <div className="ipc-parts-panel-header">
                  <span>Parts</span>
                  <strong>{shownParts.length}</strong>
                </div>
                <div className="table-wrapper ipc-parts-table">
                  <table className="data-table">
                    <thead><tr><th>Item</th><th>Part Number</th><th>Name</th><th>Qty</th><th>Replacement</th><th>Notes</th><th></th></tr></thead>
                    <tbody>{shownParts.map(part => (
                      <tr key={part.id}>
                        <td className="mono">{part.item_no || '-'}</td>
                        <td className="mono primary">{part.part_number}</td>
                        <td>{part.name}</td>
                        <td className="mono">{part.quantity || '-'}</td>
                        <td className="mono">{part.replacement_numbers || '-'}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{[part.usage, part.remarks].filter(Boolean).join(' - ') || '-'}</td>
                        <td><div className="row-actions">
                          <button className="row-btn" onClick={() => copyText(part.part_number)}>Copy</button>
                          {part.price_url && <button className="row-btn" onClick={() => window.open(part.price_url, '_blank', 'noopener')}>Price</button>}
                        </div></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
