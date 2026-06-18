import { supabase } from '../supabase'
import { record } from './breadcrumbs'

const BUCKET = 'feedback-screenshots'

// Race a promise against a timer so a slow/hanging async step can't block the
// flow. Never rejects: returns { timedOut, value, error }. Used to keep the
// screenshot pipeline best-effort (see the feedback design spec §7).
export function withTimeout(promise, ms) {
  return new Promise((resolve) => {
    let settled = false
    let timer
    const done = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }
    timer = setTimeout(() => done({ timedOut: true }), ms)
    Promise.resolve(promise).then(
      (value) => done({ timedOut: false, value }),
      (error) => done({ timedOut: false, error }),
    )
  })
}

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

export async function submitReport({ type, comment, screenshotBlob, userId, context, breadcrumbs, client = supabase, onStep }) {
  const id = crypto.randomUUID()
  let screenshot_path = null

  if (screenshotBlob && userId) {
    onStep?.('screenshot')
    const path = `${userId}/${id}.png`
    // Bound the upload: on a slow device/connection a hanging Storage call must
    // never freeze the report. After 12s we give up and save without the image.
    const up = await withTimeout(
      client.storage.from(BUCKET).upload(path, screenshotBlob, { contentType: 'image/png', upsert: true }),
      12000,
    )
    if (up.timedOut) {
      record({ kind: 'feedback', message: 'screenshot upload timed out (12s) — report saved without image' })
    } else if (!up.value?.error) {
      screenshot_path = path
    }
    // a failed/slow screenshot upload is non-fatal: still save the report
  }

  onStep?.('insert')

  // Bound the insert too: submit must ALWAYS resolve, never spin forever. If the
  // DB write stalls (offline, dropped connection) we surface an error after 15s.
  const ins = await withTimeout(
    client.from('feedback_reports').insert([
      {
        id,
        type,
        comment: comment || null,
        screenshot_path,
        breadcrumbs: breadcrumbs ?? [],
        context: context ?? {},
        page_url: context?.url ?? null,
      },
    ]),
    15000,
  )
  if (ins.timedOut) return { error: 'Saving timed out — check your connection and try again.' }
  const error = ins.value?.error ?? ins.error
  return { error: error ? error.message || String(error) : null }
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
