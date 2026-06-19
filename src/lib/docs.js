// Pure document helpers — no React/Supabase deps, so they are unit-testable.

export const KINDS = ['Receipt', 'Invoice', 'Logbook', 'Insurance', 'Inspection', 'Photo', 'Other']

// Lowercase file extension (without the dot), or '' when there is none.
export function extFromName(name) {
  const m = /\.([a-zA-Z0-9]+)$/.exec(name || '')
  return m ? m[1].toLowerCase() : ''
}

// Storage object path: `{userId}/{id}.{ext}` (no trailing dot when the name has no extension).
export function storagePath(userId, id, fileName) {
  const ext = extFromName(fileName)
  return `${userId}/${id}${ext ? '.' + ext : ''}`
}

export function isImage(mime) {
  return !!mime && mime.startsWith('image/')
}

// RFC4122 v4 id. Uses crypto.randomUUID when available, else builds one from
// crypto.getRandomValues — so it also works in insecure contexts / older Safari
// (the same class of bug the Feedback module hit with a bare crypto.randomUUID()).
export function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map(x => x.toString(16).padStart(2, '0'))
  return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h.slice(8, 10).join('')}-${h.slice(10, 16).join('')}`
}
