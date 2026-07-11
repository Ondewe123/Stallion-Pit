// Vercel serverless function (Node runtime, Web-standard Request/Response).
// Verifies the caller's Supabase session, then constructs a client scoped to that
// user's own access token (not a service-role key) so the photo upload naturally
// respects the existing owner-scoped `documents` storage RLS policies.
import { createClient } from '@supabase/supabase-js'
import { resolvePastedPart } from '../src/lib/fetchPart/resolvePastedPart.mjs'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

export default async function handler(request) {
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  let body
  try {
    body = await request.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }
  const url = body?.url
  if (!url || typeof url !== 'string') return jsonResponse({ error: 'Missing "url"' }, 400)

  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) return jsonResponse({ error: 'Missing Authorization header' }, 401)

  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  const { data: userData, error: userErr } = await authClient.auth.getUser(token)
  if (userErr || !userData?.user) return jsonResponse({ error: 'Not signed in' }, 401)

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  try {
    const result = await resolvePastedPart(url, { supabaseClient: userClient, userId: userData.user.id })
    return jsonResponse(result, 200)
  } catch (err) {
    return jsonResponse({ error: err.message || 'Could not fetch that link' }, 422)
  }
}
