// Server-only (uses node:dns) — never import this from React/browser code.
// Defense-in-depth for /api/fetch-part accepting an arbitrary user-pasted URL:
// blocks obviously-local/private targets even though the endpoint already requires
// the app's normal auth.
import { promises as nodeDns } from 'node:dns'

const PRIVATE_V4 = [
  /^127\./, /^10\./, /^192\.168\./, /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^0\./, // 0.0.0.0/8 — covers the literal 0.0.0.0 and the bare "0" shorthand
          // (the WHATWG URL parser normalizes a bare "0" hostname to "0.0.0.0").
]

// Matches an IPv4-mapped IPv6 address in either the dotted-decimal form
// (e.g. "::ffff:10.0.0.5", as node:dns may return) or the compressed-hex
// form (e.g. "::ffff:a00:5", which is what the WHATWG URL parser normalizes
// a literal "[::ffff:10.0.0.5]" hostname to).
const IPV4_MAPPED_DOTTED = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i
const IPV4_MAPPED_HEX = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i

function extractIpv4MappedAddress(address) {
  const dotted = address.match(IPV4_MAPPED_DOTTED)
  if (dotted) return dotted[1]
  const hex = address.match(IPV4_MAPPED_HEX)
  if (hex) {
    const high = parseInt(hex[1], 16)
    const low = parseInt(hex[2], 16)
    return [(high >> 8) & 0xff, high & 0xff, (low >> 8) & 0xff, low & 0xff].join('.')
  }
  return null
}

function isPrivateAddress(address) {
  // Bracketed IPv6 literals (e.g. "[::1]") come from URL#hostname; strip the
  // brackets so the checks below see the bare address either way.
  const normalized = address.startsWith('[') && address.endsWith(']')
    ? address.slice(1, -1)
    : address

  if (normalized === '::1') return true
  if (normalized.startsWith('fe80:') || normalized.startsWith('fc') || normalized.startsWith('fd')) return true

  const mappedV4 = extractIpv4MappedAddress(normalized)
  if (mappedV4) return PRIVATE_V4.some(re => re.test(mappedV4))

  return PRIVATE_V4.some(re => re.test(normalized))
}

export async function assertSafeUrl(rawUrl, { lookup = (host) => nodeDns.lookup(host) } = {}) {
  let parsed
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new Error('Not a valid URL')
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http/https links are supported')
  }

  const hostname = parsed.hostname
  if (hostname === 'localhost' || hostname === '::1') {
    throw new Error('That link points to a local address')
  }
  if (isPrivateAddress(hostname)) {
    throw new Error('That link points to a private address')
  }

  let address
  try {
    ({ address } = await lookup(hostname))
  } catch {
    throw new Error("Could not resolve that link's address")
  }
  if (isPrivateAddress(address)) {
    throw new Error('That link resolves to a private address')
  }

  return parsed
}
