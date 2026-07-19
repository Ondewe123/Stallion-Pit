import { createClient } from '@supabase/supabase-js'
import { estimateUkToKenyaFreight, fetchAutodocOptionsForPart } from '../src/lib/priceOptions/autodoc.mjs'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function requireString(value, name) {
  if (!value || typeof value !== 'string') throw new Error(`Missing "${name}"`)
  return value
}

function snapshotRow({ userId, snagId, ipcPartId, option, freight }) {
  return {
    user_id: userId,
    snag_id: snagId,
    ipc_part_id: ipcPartId,
    supplier: 'autodoc',
    searched_part_number: option.searchedPartNumber,
    product_title: option.title,
    brand: option.brand,
    supplier_article_number: option.articleNumber,
    product_url: option.productUrl,
    image_url: option.imageUrl,
    price: option.price,
    currency_code: option.currencyCode,
    freight_provider: freight.provider,
    freight_method: freight.method,
    freight_weight_kg: freight.weightKg,
    freight_cost: freight.freightGbp,
    freight_currency_code: 'GBP',
    fx_rate_to_kes: freight.fxRateToKes,
    landed_cost_kes: freight.landedCostKes,
    raw: { option },
  }
}

export default async function handler(request) {
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  let body
  try {
    body = await request.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  let snagId
  let ipcPartId
  try {
    snagId = requireString(body?.snagId, 'snagId')
    ipcPartId = requireString(body?.ipcPartId, 'ipcPartId')
  } catch (err) {
    return jsonResponse({ error: err.message }, 400)
  }

  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) return jsonResponse({ error: 'Missing Authorization header' }, 401)

  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  const { data: userData, error: userErr } = await authClient.auth.getUser(token)
  if (userErr || !userData?.user) return jsonResponse({ error: 'Not signed in' }, 401)

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  const { data: link, error: linkError } = await userClient
    .from('snag_ipc_parts')
    .select('id, snag_id, ipc_part_id, ipc_parts(id, part_number, replacement_numbers, name)')
    .eq('snag_id', snagId)
    .eq('ipc_part_id', ipcPartId)
    .maybeSingle()
  if (linkError) return jsonResponse({ error: linkError.message }, 422)
  if (!link?.ipc_parts) return jsonResponse({ error: 'That IPC part is not linked to this snag.' }, 404)

  try {
    const result = await fetchAutodocOptionsForPart(link.ipc_parts)
    if (!result.options.length) {
      return jsonResponse({ supplier: 'autodoc', searchedPartNumbers: result.searchedPartNumbers, snapshots: [] })
    }

    const rows = result.options.map(option => {
      const freight = estimateUkToKenyaFreight({
        priceGbp: option.price,
        weightKg: body?.weightKg,
        method: body?.freightMethod || 'air',
      })
      return snapshotRow({
        userId: userData.user.id,
        snagId,
        ipcPartId,
        option,
        freight,
      })
    })

    const { data: snapshots, error: insertError } = await userClient
      .from('part_price_snapshots')
      .insert(rows)
      .select('*')
    if (insertError) return jsonResponse({ error: insertError.message }, 422)

    return jsonResponse({
      supplier: 'autodoc',
      searchedPartNumbers: result.searchedPartNumbers,
      snapshots: snapshots || [],
    })
  } catch (err) {
    return jsonResponse({ error: err.message || 'Could not fetch prices from Autodoc' }, 422)
  }
}
