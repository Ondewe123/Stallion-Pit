// src/lib/maps/places.js
// Thin fetch wrappers around the Places API (New). No SDK — a referrer-restricted browser API
// key (see docs/superpowers/specs/2026-07-23-route-cost-planner-design.md §4) is safe to call
// directly from the client, same trust model as the public Supabase anon key.
import { parseAutocompleteResponse, parsePlaceDetails } from './parse'

const BASE = 'https://places.googleapis.com/v1'

export async function autocompletePlaces(input, apiKey) {
  if (!input || !input.trim()) return []
  const res = await fetch(`${BASE}/places:autocomplete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey },
    body: JSON.stringify({ input, includedRegionCodes: ['ke'] }),
  })
  if (!res.ok) throw new Error(`Places autocomplete failed (${res.status})`)
  return parseAutocompleteResponse(await res.json())
}

export async function getPlaceDetails(placeId, apiKey) {
  const res = await fetch(`${BASE}/places/${placeId}`, {
    headers: { 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': 'formattedAddress,location,displayName' },
  })
  if (!res.ok) throw new Error(`Place details failed (${res.status})`)
  const details = parsePlaceDetails(await res.json())
  if (!details) throw new Error('That place has no location data')
  return details
}
