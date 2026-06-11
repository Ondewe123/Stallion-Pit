import { useVehicle } from '../contexts/VehicleContext'

export default function VehicleSelector() {
  const { vehicles, activeVehicle, selectVehicle, loading } = useVehicle()

  if (loading) return (
    <div className="vehicle-selector vehicle-selector-loading">
      Loading...
    </div>
  )

  if (!vehicles.length) return (
    <div className="vehicle-selector vehicle-selector-empty">
      No vehicles
    </div>
  )

  return (
    <div className="vehicle-selector">
      <div className="vehicle-selector-label">Active Vehicle</div>
      <div className="vehicle-selector-tabs">
        {vehicles.map(v => (
          <button
            key={v.id}
            className={`vehicle-tab ${activeVehicle?.id === v.id ? 'vehicle-tab-active' : ''}`}
            onClick={() => selectVehicle(v)}
            title={`${v.year} ${v.make} ${v.model}`}
          >
            <span className="vehicle-tab-name">{v.name}</span>
            <span className="vehicle-tab-year">{v.year}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
