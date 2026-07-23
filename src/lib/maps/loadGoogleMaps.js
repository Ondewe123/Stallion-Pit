// src/lib/maps/loadGoogleMaps.js
// Lazily injects the Maps JavaScript API script tag on first use (only when RoutePlanner mounts),
// same reasoning as the existing dynamic `html2canvas` import for the feedback screenshot
// feature — no other page's bundle or load time is affected. Caches the load promise so repeat
// mounts never re-inject the script.

let loadPromise = null

export function loadGoogleMaps(apiKey) {
  if (typeof window !== 'undefined' && window.google?.maps) return Promise.resolve(window.google.maps)
  if (loadPromise) return loadPromise
  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=geometry&v=weekly`
    script.async = true
    script.onload = () => resolve(window.google.maps)
    script.onerror = () => { loadPromise = null; reject(new Error('Failed to load Google Maps')) }
    document.head.appendChild(script)
  })
  return loadPromise
}
