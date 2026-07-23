import { useState, useEffect, useCallback, Fragment } from 'react'
import { listReports, updateReportStatus, updateReport, deleteReport, screenshotUrl } from '../lib/feedback/reports'

const TYPES = ['bug', 'error', 'idea']

const FILTERS = [
  { key: 'open', label: 'Open' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'all', label: 'All' },
]
const TYPE_BADGE = { bug: 'badge-amber', error: 'badge-red', idea: 'badge-green' }
const STATUS_BADGE = { open: 'badge-amber', in_progress: 'badge-gold', resolved: 'badge-green' }
const NEXT_STATUS = { open: 'in_progress', in_progress: 'resolved', resolved: 'open' }
const NEXT_LABEL = { open: 'Start', in_progress: 'Resolve', resolved: 'Reopen' }

const crumbLine = (b) => {
  const time = b.t?.split('T')[1]?.replace('Z', '') || ''
  const detail =
    b.route ||
    b.label ||
    (b.table ? `${b.table} ${b.op}${b.error ? ' ✗ ' + b.error : ''}` : '') ||
    b.message ||
    ''
  return `${time}  ${b.kind}  ${detail}`
}

export default function Feedback() {
  const [filter, setFilter] = useState('open')
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)
  const [shotUrls, setShotUrls] = useState({})
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({ comment: '', type: 'bug' })
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [saving, setSaving] = useState(false)

  const fetchReports = useCallback(async () => {
    setLoading(true)
    const { data } = await listReports(filter)
    setReports(data || [])
    setLoading(false)
  }, [filter])

  useEffect(() => {
    fetchReports()
  }, [fetchReports])

  const toggle = async (r) => {
    if (expanded === r.id) {
      setExpanded(null)
      return
    }
    setExpanded(r.id)
    if (r.screenshot_path && !shotUrls[r.id]) {
      const url = await screenshotUrl(r.screenshot_path)
      setShotUrls((p) => ({ ...p, [r.id]: url }))
    }
  }

  const advance = async (r) => {
    await updateReportStatus(r.id, NEXT_STATUS[r.status])
    await fetchReports()
  }

  const startEdit = (r) => {
    setDeleteConfirm(null)
    setEditingId(r.id)
    setEditForm({ comment: r.comment || '', type: r.type || 'bug' })
  }

  const saveEdit = async (r) => {
    setSaving(true)
    await updateReport(r.id, editForm)
    setSaving(false)
    setEditingId(null)
    await fetchReports()
  }

  const doDelete = async (r) => {
    await deleteReport(r.id, r.screenshot_path)
    setDeleteConfirm(null)
    await fetchReports()
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>Feedback</h2>
        <p className="page-sub">bugs, errors &amp; ideas captured in-app</p>
      </div>

      <div className="row-actions" style={{ margin: '16px 0', flexWrap: 'wrap' }}>
        {FILTERS.map((f) => (
          <button key={f.key} className={`row-btn ${filter === f.key ? 'vehicle-tab-active' : ''}`} onClick={() => setFilter(f.key)}>
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="placeholder-card">
          <p>Loading...</p>
        </div>
      ) : reports.length === 0 ? (
        <div className="placeholder-card">
          <span>🐞</span>
          <p>No {filter !== 'all' ? filter.replace('_', ' ') + ' ' : ''}reports</p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Type</th>
                <th>Status</th>
                <th>Comment</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <Fragment key={r.id}>
                  <tr onClick={() => toggle(r)} style={{ cursor: 'pointer' }}>
                    <td className="mono">{r.created_at?.split('T')[0]}</td>
                    <td>
                      <span className={`badge ${TYPE_BADGE[r.type] || 'badge'}`}>{r.type}</span>
                    </td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[r.status] || 'badge'}`}>{r.status.replace('_', ' ')}</span>
                    </td>
                    <td className="primary">{r.comment || <span style={{ color: 'var(--text-faint)' }}>—</span>}</td>
                    <td>
                      <div className="row-actions">
                        {deleteConfirm === r.id ? (
                          <>
                            <button className="row-btn row-btn-danger" onClick={(e) => { e.stopPropagation(); doDelete(r) }}>Confirm</button>
                            <button className="row-btn" onClick={(e) => { e.stopPropagation(); setDeleteConfirm(null) }}>Cancel</button>
                          </>
                        ) : (
                          <>
                            <button className="row-btn" onClick={(e) => { e.stopPropagation(); startEdit(r) }}>Edit</button>
                            <button className="row-btn" onClick={(e) => { e.stopPropagation(); advance(r) }}>{NEXT_LABEL[r.status]}</button>
                            <button className="row-btn row-btn-danger" onClick={(e) => { e.stopPropagation(); setDeleteConfirm(r.id) }}>Delete</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                  {editingId === r.id && (
                    <tr>
                      <td colSpan={5} style={{ background: 'var(--surface)' }}>
                        <div style={{ padding: '12px 8px', display: 'grid', gap: 10, maxWidth: 520 }}>
                          <div className="form-group">
                            <label>Type</label>
                            <select value={editForm.type} onChange={(e) => setEditForm((f) => ({ ...f, type: e.target.value }))}>
                              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                            </select>
                          </div>
                          <div className="form-group">
                            <label>Comment</label>
                            <textarea rows={3} value={editForm.comment}
                              onChange={(e) => setEditForm((f) => ({ ...f, comment: e.target.value }))}
                              style={{ resize: 'vertical' }} />
                          </div>
                          <div className="row-actions">
                            <button className="btn-secondary" onClick={() => setEditingId(null)} disabled={saving}>Cancel</button>
                            <button className="btn-primary" style={{ width: 'auto', padding: '8px 20px' }}
                              onClick={() => saveEdit(r)} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  {expanded === r.id && (
                    <tr>
                      <td colSpan={5} style={{ background: 'var(--surface)' }}>
                        <div style={{ padding: '12px 8px', display: 'grid', gap: 12 }}>
                          <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>
                            {r.page_url} · {r.context?.vehicle_name || 'no vehicle'} · v{r.context?.app_version || '—'}
                          </div>
                          {r.screenshot_path &&
                            (shotUrls[r.id] ? (
                              <a href={shotUrls[r.id]} target="_blank" rel="noreferrer">
                                <img src={shotUrls[r.id]} alt="screenshot" style={{ maxWidth: '100%', borderRadius: 8, border: '1px solid var(--border)' }} />
                              </a>
                            ) : (
                              <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>loading screenshot…</span>
                            ))}
                          <div>
                            <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 4 }}>Breadcrumbs ({(r.breadcrumbs || []).length})</div>
                            <pre style={{ margin: 0, maxHeight: 240, overflow: 'auto', fontSize: 11, whiteSpace: 'pre-wrap' }}>
                              {(r.breadcrumbs || []).map(crumbLine).join('\n')}
                            </pre>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
