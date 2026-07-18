const EMPTY = []

export function isCurrentVehicleRequest(latestVehicleId, requestVehicleId, cancelled = false) {
  return !cancelled && latestVehicleId === requestVehicleId
}

export function scopeVehicleLoad({
  activeVehicleId,
  loadedVehicleId,
  catalog,
  diagrams,
  parts,
  error,
  errorVehicleId,
}) {
  const dataMatches = loadedVehicleId === activeVehicleId
  return {
    catalog: dataMatches ? catalog : null,
    diagrams: dataMatches ? diagrams : EMPTY,
    parts: dataMatches ? parts : EMPTY,
    error: errorVehicleId === activeVehicleId ? error : null,
  }
}
