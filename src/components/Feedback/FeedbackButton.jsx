import { useState } from 'react'
import FeedbackModal from './FeedbackModal'

export default function FeedbackButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="fb-fab" onClick={() => setOpen(true)} title="Report a bug, error, or idea" aria-label="Report feedback">
        🐞
      </button>
      {open && <FeedbackModal onClose={() => setOpen(false)} />}
    </>
  )
}
