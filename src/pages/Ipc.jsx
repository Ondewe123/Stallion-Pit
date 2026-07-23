import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useVehicle } from '../contexts/VehicleContext'
import { supabase } from '../lib/supabase'
import { filterParts, groupOptions } from '../lib/ipc/search'
import { filterByVehicleOptions } from '../lib/ipc/optionCodes'
import { isCurrentVehicleRequest, scopeVehicleLoad } from '../lib/ipc/vehicleScope'
import { fetchAllRows } from '../lib/supabase/fetchAllRows'

const copyText = async (text) => {
  try { await navigator.clipboard.writeText(text) } catch { /* non-fatal */ }
}

export function buildSnagIpcPartLink(part, snagId) {
  if (!part?.id || !snagId) return null
  return {
    snag_id: snagId,
    ipc_part_id: part.id,
    quantity_needed: 1,
  }
}

const today = () => new Date().toISOString().split('T')[0]

export function buildSnagFromIpcPart(part, vehicleId, reportedAt = today()) {
  if (!part?.part_number || !vehicleId) return null
  const group = [part.catalog_group, part.subgroup].filter(Boolean).join('/')
  const context = [
    `IPC part ${part.part_number}`,
    group && `Group ${group}`,
    part.diagram_title,
  ].filter(Boolean).join(' - ')
  return {
    vehicle_id: vehicleId,
    reported_at: reportedAt,
    title: `Replace ${part.name || part.part_number}`,
    description: context,
    severity: 'Medium',
    status: 'Open',
  }
}

export function filterVisibleDiagrams(diagrams, { group = '', branch = '', hideEmptyDiagrams = false } = {}) {
  return (diagrams || []).filter(d =>
    (!group || d.catalog_group === group) &&
    (!branch || d.branch === branch) &&
    (!hideEmptyDiagrams || Number(d.part_count || 0) > 0)
  )
}

export function diagramSublevelOptions(diagrams) {
  return (diagrams || [])
    .map(d => ({
      value: d.id,
      label: [d.catalog_group, d.subgroup].filter(Boolean).join('/') + (d.diagram_title ? ` - ${d.diagram_title}` : ''),
      count: Number(d.part_count || 0),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
}

export function buildPartFilterState({ query = '', selectedDiagramId = '', group = '', branch = '' } = {}) {
  return {
    query,
    diagramId: selectedDiagramId,
    group,
    branch,
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
  const [hideEmptyDiagrams, setHideEmptyDiagrams] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [errorVehicleId, setErrorVehicleId] = useState('')
  const [snags, setSnags] = useState([])
  const [snagsLoading, setSnagsLoading] = useState(false)
  const [assignSelections, setAssignSelections] = useState({})
  const [assigningPartId, setAssigningPartId] = useState('')
  const [creatingPartId, setCreatingPartId] = useState('')
  const [assignMessage, setAssignMessage] = useState(null)

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

  useEffect(() => {
    let cancelled = false
    const fetchSnags = async () => {
      if (!activeVehicleId) {
        setSnags([])
        return
      }
      setSnagsLoading(true)
      const { data, error: snagError } = await supabase
        .from('snags')
        .select('id, title, status, severity, reported_at')
        .eq('vehicle_id', activeVehicleId)
        .order('reported_at', { ascending: false })
      if (cancelled) return
      setSnags(snagError ? [] : data || [])
      setSnagsLoading(false)
    }
    fetchSnags()
    return () => { cancelled = true }
  }, [activeVehicleId])

  const assignPartToSnag = async (part) => {
    const snagId = assignSelections[part.id]
    const row = buildSnagIpcPartLink(part, snagId)
    if (!row) {
      setAssignMessage({ type: 'error', text: 'Choose a snag first.' })
      return
    }
    setAssigningPartId(part.id)
    setAssignMessage(null)
    const { error: assignError } = await supabase
      .from('snag_ipc_parts')
      .upsert([row], { onConflict: 'snag_id,ipc_part_id', ignoreDuplicates: true })
    setAssigningPartId('')
    if (assignError) {
      setAssignMessage({ type: 'error', text: assignError.message })
      return
    }
    const snag = snags.find(item => item.id === snagId)
    setAssignMessage({ type: 'success', text: `${part.part_number} assigned${snag ? ` to ${snag.title}` : ''}.` })
  }

  const createSnagFromPart = async (part) => {
    const snag = buildSnagFromIpcPart(part, activeVehicleId)
    if (!snag) {
      setAssignMessage({ type: 'error', text: 'Could not create a snag for this part.' })
      return
    }
    setCreatingPartId(part.id)
    setAssignMessage(null)
    const { data, error: snagError } = await supabase
      .from('snags')
      .insert([snag])
      .select('id, title, status, severity, reported_at')
      .single()
    if (snagError) {
      setCreatingPartId('')
      setAssignMessage({ type: 'error', text: snagError.message })
      return
    }
    const { error: linkError } = await supabase
      .from('snag_ipc_parts')
      .insert([buildSnagIpcPartLink(part, data.id)])
    setCreatingPartId('')
    if (linkError) {
      setAssignMessage({ type: 'error', text: linkError.message })
      return
    }
    setSnags(current => [data, ...current])
    setAssignSelections(current => ({ ...current, [part.id]: data.id }))
    setAssignMessage({ type: 'success', text: `Created snag "${data.title}" and linked ${part.part_number}.` })
  }

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
  const rawPartsForActiveVehicle = scoped.parts
  const activeOptionCodes = activeVehicle?.option_codes || []
  const partsForActiveVehicle = useMemo(() =>
    filterByVehicleOptions(rawPartsForActiveVehicle, activeOptionCodes),
    [rawPartsForActiveVehicle, activeOptionCodes])
  const errorForActiveVehicle = scoped.error

  const groups = useMemo(() => groupOptions(diagramsForActiveVehicle), [diagramsForActiveVehicle])
  const branches = useMemo(() => [...new Set(diagramsForActiveVehicle.map(d => d.branch).filter(Boolean))].sort(), [diagramsForActiveVehicle])
  const visibleDiagrams = useMemo(() => filterVisibleDiagrams(diagramsForActiveVehicle, {
    group, branch, hideEmptyDiagrams,
  }), [diagramsForActiveVehicle, group, branch, hideEmptyDiagrams])
  const sublevelOptions = useMemo(() => diagramSublevelOptions(visibleDiagrams), [visibleDiagrams])
  const selectedDiagram = visibleDiagrams.find(d => d.id === selectedDiagramId) || null
  const partFilterState = useMemo(() => buildPartFilterState({
    query, selectedDiagramId, group, branch,
  }), [query, selectedDiagramId, group, branch])
  const shownParts = useMemo(() => filterParts(partsForActiveVehicle, partFilterState), [partsForActiveVehicle, partFilterState])

  useEffect(() => {
    if (!catalogForActiveVehicle || !visibleDiagrams.length) return
    if (visibleDiagrams.some(d => d.id === selectedDiagramId)) return
    setSelectedDiagramId(visibleDiagrams[0].id)
  }, [catalogForActiveVehicle, selectedDiagramId, visibleDiagrams])

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
          {catalogForActiveVehicle ? ` - ${diagramsForActiveVehicle.length} diagrams - ${partsForActiveVehicle.length} applicable parts` : ''}
        </p>
      </div>
      {errorForActiveVehicle && <div className="form-error">{errorForActiveVehicle}</div>}
      {assignMessage && (
        <div className={assignMessage.type === 'error' ? 'form-error' : 'form-success'}>{assignMessage.text}</div>
      )}
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
            <div className="form-group">
              <label>Sub-level / diagram</label>
              <select
                value={selectedDiagramId}
                onChange={e => setSelectedDiagramId(e.target.value)}
                disabled={!sublevelOptions.length}
              >
                {sublevelOptions.map(option => (
                  <option key={option.value} value={option.value}>{option.label} ({option.count})</option>
                ))}
              </select>
            </div>
            <label className="ipc-checkbox">
              <input
                type="checkbox"
                checked={hideEmptyDiagrams}
                onChange={e => setHideEmptyDiagrams(e.target.checked)}
              />
              <span>Hide diagrams with 0 parts</span>
            </label>
          </div>

          <div className="ipc-layout">
            <div className="table-wrapper">
              <table className="data-table">
                <thead><tr><th>Diagram</th><th>Parts</th></tr></thead>
                <tbody>{visibleDiagrams.map(d => (
                  <tr key={d.id} onClick={() => setSelectedDiagramId(d.id)} style={{ cursor: 'pointer' }}>
                    <td className={selectedDiagramId === d.id ? 'primary' : ''}>
                      {d.catalog_group}/{d.subgroup}
                      <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{d.diagram_title}</div>
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
                        <td style={{ fontSize: 12, color: 'var(--text-faint)' }}>{[part.usage, part.remarks].filter(Boolean).join(' - ') || '-'}</td>
                        <td>
                          <div className="ipc-part-actions">
                            <div className="row-actions">
                              <button className="row-btn" onClick={() => copyText(part.part_number)}>Copy</button>
                              {part.price_url && <button className="row-btn" onClick={() => window.open(part.price_url, '_blank', 'noopener')}>Price</button>}
                            </div>
                            <div className="ipc-assign-row">
                              <select
                                value={assignSelections[part.id] || ''}
                                onChange={e => setAssignSelections(current => ({ ...current, [part.id]: e.target.value }))}
                                disabled={snagsLoading || snags.length === 0}
                                title="Assign this IPC part to an existing snag"
                              >
                                <option value="">{snagsLoading ? 'Loading snags...' : snags.length ? 'Assign to snag...' : 'No snags'}</option>
                                {snags.map(snag => (
                                  <option key={snag.id} value={snag.id}>
                                    {snag.title} ({snag.status})
                                  </option>
                                ))}
                              </select>
                              <button
                                className="row-btn vehicle-tab-active"
                                onClick={() => assignPartToSnag(part)}
                                disabled={!assignSelections[part.id] || assigningPartId === part.id}
                              >
                                {assigningPartId === part.id ? 'Assigning...' : 'Assign'}
                              </button>
                              <button
                                className="row-btn"
                                onClick={() => createSnagFromPart(part)}
                                disabled={creatingPartId === part.id}
                              >
                                {creatingPartId === part.id ? 'Creating...' : 'Create snag'}
                              </button>
                            </div>
                          </div>
                        </td>
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
