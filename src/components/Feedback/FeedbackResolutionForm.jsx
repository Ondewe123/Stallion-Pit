import React, { useState } from 'react'
import { TERMINAL_OUTCOMES } from '../../lib/feedback/reports'

void React

const OUTCOME_LABELS = {
  resolved: 'Verified resolved',
  duplicate: 'Duplicate',
  cannot_reproduce: 'Cannot reproduce',
}

export default function FeedbackResolutionForm({ report, reports, saving, onCancel, onSubmit, appVersion }) {
  const [outcome, setOutcome] = useState('resolved')
  const [note, setNote] = useState('')
  const [canonicalReportId, setCanonicalReportId] = useState('')
  const [error, setError] = useState(null)
  const canonicalReports = reports.filter((candidate) => candidate.id !== report.id)

  const submit = (event) => {
    event.preventDefault()
    const trimmedNote = note.trim()
    if (!TERMINAL_OUTCOMES.includes(outcome)) {
      setError('Choose a valid outcome.')
      return
    }
    if (!trimmedNote) {
      setError('Add verification evidence before closing this report.')
      return
    }
    if (outcome === 'duplicate' && !canonicalReportId) {
      setError('Choose the canonical report.')
      return
    }
    setError(null)
    onSubmit({
      outcome,
      note: trimmedNote,
      canonicalReportId: outcome === 'duplicate' ? canonicalReportId : null,
      appVersion,
    })
  }

  return (
    <form onSubmit={submit}>
      <div className="form-group">
        <label htmlFor={`resolution-outcome-${report.id}`}>Outcome</label>
        <select id={`resolution-outcome-${report.id}`} name="outcome" value={outcome}
          onChange={(event) => { setOutcome(event.target.value); setError(null) }} disabled={saving}>
          {TERMINAL_OUTCOMES.map((value) => <option key={value} value={value}>{OUTCOME_LABELS[value]}</option>)}
        </select>
      </div>

      <div className="form-group">
        <label htmlFor={`resolution-note-${report.id}`}>Verification evidence</label>
        <textarea id={`resolution-note-${report.id}`} name="resolutionNote" rows={3} value={note}
          onInput={(event) => { setNote(event.target.value); setError(null) }} disabled={saving} />
      </div>

      {outcome === 'duplicate' && (
        <div className="form-group">
          <label htmlFor={`canonical-report-${report.id}`}>Canonical report</label>
          <select id={`canonical-report-${report.id}`} name="canonicalReportId" value={canonicalReportId}
            onChange={(event) => { setCanonicalReportId(event.target.value); setError(null) }} disabled={saving}>
            <option value="">Choose a report</option>
            {canonicalReports.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>{candidate.comment || candidate.id}</option>
            ))}
          </select>
        </div>
      )}

      {error && <div className="form-error">{error}</div>}

      <div className="row-actions">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save outcome'}</button>
      </div>
    </form>
  )
}
