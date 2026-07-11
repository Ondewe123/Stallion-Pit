// Server-only (uses node:dns) — never import this from React/browser code.
// Defense-in-depth for /api/fetch-part accepting an arbitrary user-pasted URL:
// blocks obviously-local/private targets even though the endpoint already requires
// the app's normal auth.
import { promises as nodeDns } from 'node:dns'

const PRIVATE_V4 = [
  /^127\./, /^10\./, /^192\.168\./, /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
]

function isPrivateAddress(address) {
  if (address === '::1') return true
  if (address.startsWith('fe80:') || address.startsWith('fc') || address.startsWith('fd')) return true
  return PRIVATE_V4.some(re => re.test(address))
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
