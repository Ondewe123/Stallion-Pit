// src/lib/maps/routes.js
// Thin fetch wrapper around the Routes API `computeRoutes`. Same client-side-safe-key model as
// places.js.
import { parseComputeRoutesResponse } from './parse'

const ENDPOINT = 'https://routes.googleapis.com/directions/v2:computeRoutes'

export async function computeRoute(origin, destination, apiKey) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline',
    },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
      destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE',
    }),
  })
  if (!res.ok) throw new Error(`Route lookup failed (${res.status})`)
  const parsed = parseComputeRoutesResponse(await res.json())
  if (!parsed) throw new Error('No route found between those two places')
  return parsed
}
