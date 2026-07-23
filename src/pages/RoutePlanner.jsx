// src/pages/RoutePlanner.jsx
import { useEffect, useRef, useState } from 'react'
import { useVehicle } from '../contexts/VehicleContext'
import { useTheme } from '../contexts/ThemeContext'
import { supabase } from '../lib/supabase'
import { num, correctedConsumption } from '../lib/calc/consumption'
import { fleetRouteCosts } from '../lib/calc/routeCost'
import { computeRoute } from '../lib/maps/routes'
import { loadGoogleMaps } from '../lib/maps/loadGoogleMaps'
import AddressAutocomplete from '../components/AddressAutocomplete'

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
const kes = (n) => Math.round(Number(n || 0)).toLocaleString()

export default function RoutePlanner() {
  const { vehicles } = useVehicle()
  const { theme } = useTheme()
  const [fuel, setFuel] = useState([])
  const [savedRoutes, setSavedRoutes] = useState([])
  const [origin, setOrigin] = useState(null)
  const [destination, setDestination] = useState(null)
  const [route, setRoute] = useState(null)
  const [computing, setComputing] = useState(false)
  const [computeError, setComputeError] = useState(null)
  const [saveName, setSaveName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  const mapDivRef = useRef(null)
  const mapObjRef = useRef(null)
  const overlaysRef = useRef([])

  const fetchSavedRoutes = async () => {
    const { data } = await supabase.from('saved_routes').select('*').order('created_at', { ascending: false })
    setSavedRoutes(data || [])
  }

  useEffect(() => {
    supabase.from('fuel_logs')
      .select('vehicle_id, odometer_km, volume_litres, total_cost_kes, price_per_litre_kes, derived_price_per_litre, exclude_from_economy')
      .then(({ data }) => setFuel(data || []))
    fetchSavedRoutes()
  }, [])

  const vehiclesWithConsumption = vehicles.map(v => {
    const fuelDesc = fuel.filter(f => f.vehicle_id === v.id)
      .sort((a, b) => Number(b.odometer_km) - Number(a.odometer_km))
    const rollingL100 = correctedConsumption(fuelDesc, 10)
    const lastFill = fuelDesc[0]
    const pricePerLitre = lastFill ? (num(lastFill.derived_price_per_litre || lastFill.price_per_litre_kes) || null) : null
    return { id: v.id, name: v.name, running_cost_km: v.running_cost_km, rollingL100, pricePerLitre }
  })

  const runCompute = async (o, d) => {
    setComputing(true); setComputeError(null); setRoute(null)
    try {
      const result = await computeRoute(o, d, API_KEY)
      setRoute(result)
    } catch (err) {
      setComputeError(err.message)
    } finally {
      setComputing(false)
    }
  }

  const handleCompute = () => { if (origin && destination) runCompute(origin, destination) }

  const handleLoadSaved = (saved) => {
    const o = { address: saved.origin_address, lat: Number(saved.origin_lat), lng: Number(saved.origin_lng) }
    const d = { address: saved.destination_address, lat: Number(saved.destination_lat), lng: Number(saved.destination_lng) }
    setOrigin(o); setDestination(d)
    runCompute(o, d)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!origin || !destination || !route || !saveName.trim()) return
    setSaving(true); setSaveError(null)
    const { error } = await supabase.from('saved_routes').insert([{
      name: saveName.trim(),
      origin_address: origin.address, origin_lat: origin.lat, origin_lng: origin.lng,
      destination_address: destination.address, destination_lat: destination.lat, destination_lng: destination.lng,
      distance_km: route.distanceKm, duration_min: route.durationMin,
    }])
    if (error) { setSaveError(error.message); setSaving(false); return }
    setSaveName('')
    await fetchSavedRoutes()
    setSaving(false)
  }

  const handleDeleteSaved = async (saved) => {
    await supabase.from('saved_routes').delete().eq('id', saved.id)
    setDeleteConfirm(null)
    await fetchSavedRoutes()
  }

  // Draw/redraw the route on the embedded map whenever the computed route changes, or the
  // theme changes (the polyline color is read live from the --accent custom property, same
  // approach as src/lib/chartTheme.js for Recharts — never a hardcoded hex here).
  useEffect(() => {
    if (!route || !origin || !destination) return
    let cancelled = false
    ;(async () => {
      try {
        const maps = await loadGoogleMaps(API_KEY)
        if (cancelled || !mapDivRef.current) return
        if (!mapObjRef.current) {
          mapObjRef.current = new maps.Map(mapDivRef.current, { zoom: 11, center: { lat: origin.lat, lng: origin.lng } })
        }
        const map = mapObjRef.current
        overlaysRef.current.forEach(o => o.setMap(null))
        const path = maps.geometry.encoding.decodePath(route.encodedPolyline)
        const bounds = new maps.LatLngBounds()
        path.forEach(p => bounds.extend(p))
        const strokeColor = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#c9a84c'
        const polyline = new maps.Polyline({ path, map, strokeColor, strokeWeight: 4 })
        const originMarker = new maps.Marker({ position: { lat: origin.lat, lng: origin.lng }, map, label: 'A' })
        const destMarker = new maps.Marker({ position: { lat: destination.lat, lng: destination.lng }, map, label: 'B' })
        overlaysRef.current = [polyline, originMarker, destMarker]
        map.fitBounds(bounds)
      } catch (err) {
        setComputeError(err.message)
      }
    })()
    return () => { cancelled = true }
  }, [route, origin, destination, theme])

  if (!API_KEY) return (
    <div className="page">
      <div className="page-header"><h2>Routes</h2><p className="page-sub">Plan trips and compare fuel cost per vehicle</p></div>
      <div className="placeholder-card"><span>🗺️</span><p>Google Maps isn't configured yet — add VITE_GOOGLE_MAPS_API_KEY to your .env file.</p></div>
    </div>
  )

  const comparison = route ? fleetRouteCosts(route.distanceKm, vehiclesWithConsumption) : []

  return (
    <div className="page">
      <div className="page-header"><h2>Routes</h2><p className="page-sub">Plan trips and compare fuel cost per vehicle</p></div>

      <div className="card">
        <div className="card-label" style={{ marginBottom: 12 }}>Plan a Route</div>
        <div className="form-row-2">
          <AddressAutocomplete label="From" placeholder="Origin address" apiKey={API_KEY} value={origin} onSelect={setOrigin} />
          <AddressAutocomplete label="To" placeholder="Destination address" apiKey={API_KEY} value={destination} onSelect={setDestination} />
        </div>
        <div className="form-actions" style={{ justifyContent: 'flex-start' }}>
          <button className="btn-primary" style={{ width: 'auto', padding: '10px 28px' }}
            onClick={handleCompute} disabled={!origin || !destination || computing}>
            {computing ? 'Computing…' : 'Compute Route'}
          </button>
        </div>
        {computeError && <div className="form-error">{computeError}</div>}
      </div>

      {route && (
        <div className="route-results">
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div ref={mapDivRef} className="route-map" />
          </div>
          <div className="card">
            <div className="card-label" style={{ marginBottom: 8 }}>
              {route.distanceKm.toFixed(1)} km · {Math.round(route.durationMin)} min
            </div>
            <div className="table-wrapper">
              <table className="data-table">
                <thead><tr><th>Vehicle</th><th>L/100km</th><th>Fuel</th><th>Running</th><th>Total</th></tr></thead>
                <tbody>
                  {comparison.map(c => (
                    <tr key={c.id}>
                      <td className="primary">{c.name}</td>
                      <td className="mono">{vehiclesWithConsumption.find(v => v.id === c.id)?.rollingL100?.toFixed(2) || '—'}</td>
                      <td className="mono">{c.fuelCost != null ? `KES ${kes(c.fuelCost)}` : 'no data'}</td>
                      <td className="mono">{c.runningCost ? `KES ${kes(c.runningCost)}` : '—'}</td>
                      <td className="mono">{c.totalCost != null ? `KES ${kes(c.totalCost)}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <form onSubmit={handleSave} className="form-row-2" style={{ marginTop: 16 }}>
              <div className="form-group">
                <label>Save as</label>
                <input value={saveName} onChange={e => setSaveName(e.target.value)} placeholder="e.g. Home to Office" />
              </div>
              <div className="form-actions" style={{ alignItems: 'flex-end' }}>
                <button type="submit" className="btn-primary" style={{ width: 'auto', padding: '10px 24px' }} disabled={saving || !saveName.trim()}>
                  {saving ? 'Saving…' : 'Save this route'}
                </button>
              </div>
            </form>
            {saveError && <div className="form-error">{saveError}</div>}
          </div>
        </div>
      )}

      <h3 style={{ marginTop: 28, marginBottom: 12 }}>Saved Routes</h3>
      {savedRoutes.length === 0 ? (
        <div className="placeholder-card"><span>🗺️</span><p>No saved routes yet — compute one above and save it.</p></div>
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead><tr><th>Name</th><th>Distance</th><th>Duration</th><th>Cheapest</th><th /></tr></thead>
            <tbody>
              {savedRoutes.map(saved => {
                const cheapest = fleetRouteCosts(Number(saved.distance_km), vehiclesWithConsumption)[0]
                return (
                  <tr key={saved.id} style={{ cursor: 'pointer' }} onClick={() => handleLoadSaved(saved)}>
                    <td className="primary">{saved.name}</td>
                    <td className="mono">{Number(saved.distance_km).toFixed(1)} km</td>
                    <td className="mono">{Math.round(Number(saved.duration_min))} min</td>
                    <td className="mono">{cheapest && cheapest.totalCost != null ? `${cheapest.name} · KES ${kes(cheapest.totalCost)}` : '—'}</td>
                    <td onClick={e => e.stopPropagation()}>
                      {deleteConfirm === saved.id ? (
                        <div className="row-actions">
                          <button className="row-btn row-btn-danger" onClick={() => handleDeleteSaved(saved)}>Confirm</button>
                          <button className="row-btn" onClick={() => setDeleteConfirm(null)}>Cancel</button>
                        </div>
                      ) : <button className="row-btn row-btn-danger" onClick={() => setDeleteConfirm(saved.id)}>Delete</button>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
