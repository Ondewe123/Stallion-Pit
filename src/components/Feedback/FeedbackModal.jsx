import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useVehicle } from '../../contexts/VehicleContext'
import { useLocation } from 'react-router-dom'
import { snapshot } from '../../lib/feedback/breadcrumbs'
import { buildContext, submitReport, withTimeout } from '../../lib/feedback/reports'

const TYPES = [
  { key: 'bug', label: '🐞 Bug' },
  { key: 'error', label: '❗ Error' },
  { key: 'idea', label: '💡 Idea' },
]

export default function FeedbackModal({ onClose }) {
  const { user } = useAuth()
  const { activeVehicle } = useVehicle()
  const location = useLocation()

  const [type, setType] = useState('bug')
  const [comment, setComment] = useState('')
  const [preview, setPreview] = useState(null) // data URL
  const [saving, setSaving] = useState(false)
  const [step, setStep] = useState(null)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)

  // Frozen at open time so the report reflects "what I was just doing".
  const frozen = useRef({ breadcrumbs: snapshot(), blob: null })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { default: html2canvas } = await import('html2canvas')
        // scale 0.6 keeps the capture cheap on weaker devices (tablets/phones)
        // and the PNG small to upload; bounded so a slow render can't hang us.
        const cap = await withTimeout(
          html2canvas(document.body, { logging: false, useCORS: true, scale: 0.6 }),
          8000,
        )
        if (cancelled) return
        if (cap.timedOut || !cap.value) {
          setPreview(null)
          return
        }
        const canvas = cap.value
        setPreview(canvas.toDataURL('image/png'))
        canvas.toBlob((b) => {
          frozen.current.blob = b
        }, 'image/png')
      } catch {
        // screenshot is best-effort; report can still be submitted without one
        if (!cancelled) setPreview(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const context = buildContext({
      user,
      activeVehicle,
      href: window.location.href,
      route: location.pathname,
      viewport: { w: window.innerWidth, h: window.innerHeight },
      appVersion: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev',
    })
    const { error: err } = await submitReport({
      type,
      comment,
      screenshotBlob: frozen.current.blob,
      userId: user?.id,
      context,
      breadcrumbs: frozen.current.breadcrumbs,
      onStep: setStep,
    })
    setSaving(false)
    setStep(null)
    if (err) {
      setError(err)
      return
    }
    setDone(true)
    setTimeout(onClose, 900)
  }

  return (
    <div className="fb-overlay" onClick={onClose}>
      <div className="fb-modal" onClick={(e) => e.stopPropagation()}>
        <div className="fb-modal-header">
          <h3>Report feedback</h3>
          <button className="fb-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {done ? (
          <div className="fb-done">✓ Report saved</div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="fb-types">
              {TYPES.map((t) => (
                <button
                  type="button"
                  key={t.key}
                  className={`fb-type ${type === t.key ? 'fb-type-active' : ''}`}
                  onClick={() => setType(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <label className="fb-label">What happened / your idea</label>
            <textarea
              className="fb-comment"
              rows={4}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Describe the bug, error, or idea…"
              autoFocus
            />

            <div className="fb-preview">
              {preview ? (
                <img src={preview} alt="screenshot preview" />
              ) : (
                <span className="fb-preview-empty">Capturing screenshot…</span>
              )}
            </div>

            {error && <div className="form-error">{error}</div>}

            <div className="form-actions">
              <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" style={{ width: 'auto', padding: '10px 28px' }} disabled={saving}>
                {saving
                  ? step === 'screenshot'
                    ? 'Uploading screenshot…'
                    : step === 'insert'
                      ? 'Saving report…'
                      : 'Saving…'
                  : 'Submit'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
