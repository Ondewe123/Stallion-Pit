import { describe, expect, it } from 'vitest'
import { parseAutocompleteResponse, parsePlaceDetails, parseComputeRoutesResponse } from './parse'

describe('parseAutocompleteResponse', () => {
  it('extracts placeId + display text from each suggestion', () => {
    const json = {
      suggestions: [
        { placePrediction: { placeId: 'ChIJ111', text: { text: 'Nairobi, Kenya' } } },
        { placePrediction: { placeId: 'ChIJ222', text: { text: 'Naivasha, Kenya' } } },
      ],
    }
    expect(parseAutocompleteResponse(json)).toEqual([
      { placeId: 'ChIJ111', text: 'Nairobi, Kenya' },
      { placeId: 'ChIJ222', text: 'Naivasha, Kenya' },
    ])
  })
  it('returns an empty array when there are no suggestions', () => {
    expect(parseAutocompleteResponse({})).toEqual([])
    expect(parseAutocompleteResponse(null)).toEqual([])
  })
})

describe('parsePlaceDetails', () => {
  it('extracts address + lat/lng', () => {
    const json = {
      formattedAddress: 'Nairobi, Kenya',
      location: { latitude: -1.2921, longitude: 36.8219 },
    }
    expect(parsePlaceDetails(json)).toEqual({ address: 'Nairobi, Kenya', lat: -1.2921, lng: 36.8219 })
  })
  it('returns null when the place has no location', () => {
    expect(parsePlaceDetails({})).toBeNull()
  })
})

describe('parseComputeRoutesResponse', () => {
  it('converts metres to km and duration seconds to minutes', () => {
    const json = {
      routes: [{ distanceMeters: 42000, duration: '1800s', polyline: { encodedPolyline: 'abc123' } }],
    }
    expect(parseComputeRoutesResponse(json)).toEqual({ distanceKm: 42, durationMin: 30, encodedPolyline: 'abc123' })
  })
  it('returns null when there is no route', () => {
    expect(parseComputeRoutesResponse({ routes: [] })).toBeNull()
    expect(parseComputeRoutesResponse({})).toBeNull()
  })
})
