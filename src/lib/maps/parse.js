// Pure response-shape parsers for the Google Places (New) and Routes APIs. Kept separate from
// the fetch calls so the parsing logic is unit-testable against fixture JSON, without hitting
// the network — these fixtures are also the executable spec of the exact shape the fetch
// wrappers (places.js, routes.js) depend on.

export function parseAutocompleteResponse(json) {
  const suggestions = json?.suggestions || []
  return suggestions
    .map(s => s.placePrediction)
    .filter(Boolean)
    .map(p => ({ placeId: p.placeId, text: p.text?.text || '' }))
}

export function parsePlaceDetails(json) {
  const loc = json?.location
  if (!loc) return null
  return {
    address: json.formattedAddress || json.displayName?.text || '',
    lat: loc.latitude,
    lng: loc.longitude,
  }
}

function parseDurationSeconds(duration) {
  if (!duration) return null
  const match = /^(\d+(?:\.\d+)?)s$/.exec(duration)
  return match ? Number(match[1]) : null
}

export function parseComputeRoutesResponse(json) {
  const route = json?.routes?.[0]
  if (!route) return null
  const seconds = parseDurationSeconds(route.duration)
  return {
    distanceKm: route.distanceMeters != null ? route.distanceMeters / 1000 : null,
    durationMin: seconds != null ? seconds / 60 : null,
    encodedPolyline: route.polyline?.encodedPolyline || null,
  }
}
