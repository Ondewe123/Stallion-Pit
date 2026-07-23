import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import {
  BACKUP_TABLES, RESTORE_ORDER, DELETE_ORDER,
  buildBackup, validateBackup, rowsForInsert, deferredUpdates, summarize,
} from '../lib/backup'

const ZERO_UUID = '00000000-0000-0000-0000-000000000000'
const CHUNK = 200
const stamp = () => {
  const d = new Date(); const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

export default function Backup() {
  const { user } = useAuth()
  const [busy, setBusy] = useState(null)        // 'download' | 'restore' | null
  const [step, setStep] = useState('')
  const [error, setError] = useState(null)
  const [counts, setCounts] = useState(null)    // last download summary
  const [pending, setPending] = useState(null)  // { backup, summary, fileName } awaiting confirm
  const [confirmText, setConfirmText] = useState('')
  const [done, setDone] = useState(null)

  const doDownload = async () => {
    setBusy('download'); setError(null); setCounts(null)
    const results = await Promise.all(BACKUP_TABLES.map(t => supabase.from(t).select('*')))
    const dataByTable = {}
    for (let i = 0; i < BACKUP_TABLES.length; i++) {
      if (results[i].error) { setError(`Reading ${BACKUP_TABLES[i]}: ${results[i].error.message}`); setBusy(null); return }
      dataByTable[BACKUP_TABLES[i]] = results[i].data || []
    }
    const backup = buildBackup(dataByTable, { exported_at: new Date().toISOString(), owner_email: user?.email })
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `stallion-pit-backup-${stamp()}.json`
    document.body.appendChild(a); a.click(); a.remove()
    URL.revokeObjectURL(url)
    setCounts(summarize(backup.data))
    setBusy(null)
  }

  const onFile = async (e) => {
    setError(null); setDone(null); setPending(null); setConfirmText('')
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const obj = JSON.parse(await file.text())
      const err = validateBackup(obj)
      if (err) { setError(err); return }
      setPending({ backup: obj, summary: summarize(obj.data), fileName: file.name })
    } catch {
      setError('Could not read that file — is it a valid JSON backup?')
    }
    e.target.value = ''  // allow re-selecting the same file
  }

  const doRestore = async () => {
    if (!pending) return
    setBusy('restore'); setError(null)
    const data = pending.backup.data
    try {
      // 1. wipe (children first)
      for (const t of DELETE_ORDER) {
        setStep(`Clearing ${t}…`)
        const { error: e } = await supabase.from(t).delete().neq('id', ZERO_UUID)
        if (e) throw new Error(`Clearing ${t}: ${e.message}`)
      }
      // 2. insert (parents first), chunked
      for (const t of RESTORE_ORDER) {
        const rows = rowsForInsert(t, data[t])
        if (!rows.length) continue
        setStep(`Restoring ${t} (${rows.length})…`)
        for (let i = 0; i < rows.length; i += CHUNK) {
          const { error: e } = await supabase.from(t).insert(rows.slice(i, i + CHUNK))
          if (e) throw new Error(`Restoring ${t}: ${e.message}`)
        }
      }
      // 3. patch deferred FK columns
      for (const t of RESTORE_ORDER) {
        const ups = deferredUpdates(t, data[t])
        if (!ups.length) continue
        setStep(`Linking ${t}…`)
        for (const u of ups) {
          const { error: e } = await supabase.from(t).update(u.patch).eq('id', u.id)
          if (e) throw new Error(`Linking ${t}: ${e.message}`)
        }
      }
      setStep('Done — reloading…')
      setDone('Restore complete.')
      setTimeout(() => window.location.reload(), 900)
    } catch (err) {
      setError(err.message + ' — data may be partially restored; your backup file is intact, you can retry.')
      setBusy(null); setStep('')
    }
  }

  return (
    <div className="page">
      <div className="page-header"><h2>Backup &amp; Restore</h2>
        <p className="page-sub">Download a full snapshot of your data, or restore one to revert.</p></div>

      {error && <div className="form-error">{error}</div>}

      {/* Download */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-label">Download backup</div>
        <p style={{ margin: '8px 0' }}>Saves a single JSON file with all your vehicles, logs, work orders, parts, snags, schedules, templates, DTCs and document records.</p>
        <button className="btn-primary" style={{ width: 'auto', padding: '10px 24px' }} onClick={doDownload} disabled={!!busy}>
          {busy === 'download' ? 'Preparing…' : '⬇ Download backup'}
        </button>
        {counts && (
          <div style={{ marginTop: 12, fontSize: 13, color: 'var(--text-faint)' }}>
            Saved: {counts.map(c => `${c.count} ${c.table}`).join(' · ') || 'no data'}
          </div>
        )}
        <p className="page-sub" style={{ marginTop: 8 }}>Note: uploaded document <em>files</em> stay in storage and aren’t inside this file — their records are.</p>
      </div>

      {/* Restore */}
      <div className="card" style={{ borderColor: 'var(--danger-strong)' }}>
        <div className="card-label">Restore from backup</div>
        <p style={{ margin: '8px 0' }}>
          <strong style={{ color: 'var(--danger-strong)' }}>This replaces ALL your current data</strong> with the contents of the file.
          Download a fresh backup first if you might want today’s state back.
        </p>

        {!pending ? (
          <label className="btn-secondary" style={{ display: 'inline-block', cursor: busy ? 'not-allowed' : 'pointer' }}>
            Choose backup file…
            <input type="file" accept="application/json,.json" onChange={onFile} disabled={!!busy} style={{ display: 'none' }} />
          </label>
        ) : (
          <div>
            <div style={{ marginBottom: 8, fontSize: 13 }}>
              <strong>{pending.fileName}</strong>
              {pending.backup.metadata?.exported_at && <> · exported {new Date(pending.backup.metadata.exported_at).toLocaleString()}</>}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-faint)', marginBottom: 12 }}>
              Will restore: {pending.summary.map(c => `${c.count} ${c.table}`).join(' · ') || 'no data'}
            </div>
            <div className="form-group" style={{ maxWidth: 280 }}>
              <label>Type <strong>RESTORE</strong> to confirm</label>
              <input value={confirmText} onChange={e => setConfirmText(e.target.value)} placeholder="RESTORE" disabled={busy === 'restore'} />
            </div>
            <div className="row-actions">
              <button className="btn-primary" style={{ width: 'auto', padding: '10px 24px' }}
                onClick={doRestore} disabled={confirmText !== 'RESTORE' || busy === 'restore'}>
                {busy === 'restore' ? 'Restoring…' : 'Wipe & restore'}
              </button>
              <button className="row-btn" onClick={() => { setPending(null); setConfirmText('') }} disabled={busy === 'restore'}>Cancel</button>
            </div>
          </div>
        )}

        {busy === 'restore' && <div style={{ marginTop: 12, fontSize: 13, color: 'var(--accent)' }}>{step}</div>}
        {done && <div style={{ marginTop: 12, fontSize: 13, color: 'var(--success-strong)' }}>{done}</div>}
      </div>
    </div>
  )
}
