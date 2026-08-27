// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import FeedbackResolutionForm from './FeedbackResolutionForm'

void React

const report = { id: 'r1', comment: 'Map invisible' }
const reports = [report, { id: 'r2', comment: 'Alternative routes and tolls' }]

function renderForm(onSubmit = vi.fn()) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => root.render(
    <FeedbackResolutionForm report={report} reports={reports} saving={false}
      onCancel={() => {}} onSubmit={onSubmit} appVersion="abc1234" />,
  ))
  return { container, onSubmit, root }
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
})

afterEach(() => { document.body.innerHTML = ''; vi.clearAllMocks() })

describe('FeedbackResolutionForm', () => {
  it('requires evidence before submit', () => {
    const { container, onSubmit } = renderForm()
    act(() => container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(container.textContent).toContain('Add verification evidence before closing this report.')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('shows canonical report selection only for duplicates', () => {
    const { container } = renderForm()
    const outcome = container.querySelector('[name="outcome"]')
    act(() => { outcome.value = 'duplicate'; outcome.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(container.querySelector('[name="canonicalReportId"]')).not.toBeNull()
    expect(container.textContent).toContain('Alternative routes and tolls')
  })

  it('submits trimmed evidence and build version', () => {
    const { container, onSubmit } = renderForm()
    const note = container.querySelector('[name="resolutionNote"]')
    act(() => { note.value = '  Verified in production.  '; note.dispatchEvent(new Event('input', { bubbles: true })) })
    act(() => container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(onSubmit).toHaveBeenCalledWith({
      outcome: 'resolved', note: 'Verified in production.', canonicalReportId: null, appVersion: 'abc1234',
    })
  })
})
