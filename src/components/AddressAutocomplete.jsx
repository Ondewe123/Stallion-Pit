// src/components/AddressAutocomplete.jsx
import { useEffect, useRef, useState } from 'react'
import { autocompletePlaces, getPlaceDetails } from '../lib/maps/places'

const DEBOUNCE_MS = 300

export default function AddressAutocomplete({ label, placeholder, apiKey, value, onSelect }) {
  const [text, setText] = useState(value?.address || '')
  const [suggestions, setSuggestions] = useState([])
  const [open, setOpen] = useState(false)
  const [error, setError] = useState(null)
  const debounceRef = useRef(null)

  useEffect(() => {
    setText(value?.address || '')
  }, [value?.address])

  const handleChange = (e) => {
    const next = e.target.value
    setText(next)
    setError(null)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!next.trim()) { setSuggestions([]); setOpen(false); return }
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await autocompletePlaces(next, apiKey)
        setSuggestions(results)
        setOpen(results.length > 0)
      } catch (err) {
        setError(err.message)
        setOpen(false)
      }
    }, DEBOUNCE_MS)
  }

  const handlePick = async (suggestion) => {
    setOpen(false)
    setText(suggestion.text)
    try {
      const details = await getPlaceDetails(suggestion.placeId, apiKey)
      onSelect({ address: details.address || suggestion.text, lat: details.lat, lng: details.lng })
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="form-group address-autocomplete">
      <label>{label}</label>
      <input
        value={text}
        onChange={handleChange}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={() => setOpen(suggestions.length > 0)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && (
        <ul className="address-suggestions">
          {suggestions.map(s => (
            // onMouseDown (not onClick) fires before the input's onBlur closes the list
            <li key={s.placeId} onMouseDown={() => handlePick(s)}>{s.text}</li>
          ))}
        </ul>
      )}
      {error && <div className="form-error" style={{ marginTop: 4 }}>{error}</div>}
    </div>
  )
}
