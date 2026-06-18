import { supabase } from '../supabase'

const BUCKET = 'feedback-screenshots'

export function buildContext({ user, activeVehicle, href, route, viewport, appVersion }) {
  return {
    url: href ?? null,
    route: route ?? null,
    vehicle_id: activeVehicle?.id ?? null,
    vehicle_name: activeVehicle?.name ?? null,
    user_email: user?.email ?? null,
    viewport: viewport ?? null,
    app_version: appVersion ?? 'dev',
  }
}

export function statusPatch(status, now = () => new Date().toISOString()) {
  return { status, resolved_at: status === 'resolved' ? now() : null }
}

export async function submitReport({ type, comment, screenshotBlob, userId, context, breadcrumbs, client = supabase }) {
  const id = crypto.randomUUID()
  let screenshot_path = null

  if (screenshotBlob && userId) {
    const path = `${userId}/${id}.png`
    const { error: upErr } = await client.storage
      .from(BUCKET)
      .upload(path, screenshotBlob, { contentType: 'image/png', upsert: true })
    if (!upErr) screenshot_path = path
    // a failed screenshot upload is non-fatal: still save the report
  }

  const { error } = await client.from('feedback_reports').insert([
    {
      id,
      type,
      comment: comment || null,
      screenshot_path,
      breadcrumbs: breadcrumbs ?? [],
      context: context ?? {},
      page_url: context?.url ?? null,
    },
  ])
  return { error: error ? error.message : null }
}

export async function listReports(filter = 'open', client = supabase) {
  let q = client.from('feedback_reports').select('*').order('created_at', { ascending: false })
  if (filter !== 'all') q = q.eq('status', filter)
  return q
}

export async function updateReportStatus(id, status, client = supabase) {
  const { error } = await client.from('feedback_reports').update(statusPatch(status)).eq('id', id)
  return { error: error ? error.message : null }
}

// Convenience: build the screenshot's signed display URL for the reports page.
export async function screenshotUrl(path, client = supabase) {
  if (!path) return null
  const { data } = await client.storage.from(BUCKET).createSignedUrl(path, 3600)
  return data?.signedUrl ?? null
}
