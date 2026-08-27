// @vitest-environment jsdom

import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Feedback from './Feedback'

void React

const reportApi = vi.hoisted(() => ({
  TERMINAL_OUTCOMES: ['resolved', 'duplicate', 'cannot_reproduce'],
  listReports: vi.fn(),
  updateReportStatus: vi.fn(),
  updateReport: vi.fn(),
  updateReportResolution: vi.fn(),
  reopenReport: vi.fn(),
  deleteReport: vi.fn(),
  screenshotUrl: vi.fn(),
}))

vi.mock('../lib/feedback/reports', () => reportApi)

vi.mock('../components/Feedback/FeedbackResolutionForm', () => ({
  default: ({ report, onSubmit, saving }) => (
    <div>
      <p>Resolution form for {report.id}</p>
      <button disabled={saving} onClick={() => onSubmit({
        outcome: 'duplicate',
        note: 'Verified duplicate after production review.',
        canonicalReportId: 'r2',
        appVersion: 'abc1234',
      })}>Save test resolution</button>
    </div>
  ),
}))

const inProgressReport = {
  id: 'r1',
  created_at: '2026-08-27T20:00:00.000Z',
  type: 'bug',
  status: 'in_progress',
  comment: 'Map invisible',
  screenshot_path: null,
  breadcrumbs: [],
  context: { vehicle_name: 'Polo', app_version: 'old1234' },
  page_url: '/routes',
  resolved_at: null,
  disposition: null,
  canonical_report_id: null,
  resolution_note: null,
  verified_at: null,
  verified_app_version: null,
}

const canonicalReport = {
  ...inProgressReport,
  id: 'r2',
  comment: 'Alternative routes and tolls',
  status: 'open',
}

let root

function button(container, label) {
  return [...container.querySelectorAll('button')].find((element) => element.textContent === label)
}

async function renderFeedback() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root.render(<Feedback />))
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
  return container
}

async function click(container, label) {
  await act(async () => {
    button(container, label).click()
    await Promise.resolve()
    await Promise.resolve()
  })
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  reportApi.listReports.mockImplementation(() => Promise.resolve({ data: [inProgressReport, canonicalReport], error: null }))
  reportApi.updateReportStatus.mockResolvedValue({ error: null })
  reportApi.updateReport.mockResolvedValue({ error: null })
  reportApi.updateReportResolution.mockResolvedValue({ error: null })
  reportApi.reopenReport.mockResolvedValue({ error: null })
  reportApi.deleteReport.mockResolvedValue({ error: null })
  reportApi.screenshotUrl.mockResolvedValue(null)
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('Feedback resolution workflow', () => {
  it('opens the resolution form from an in-progress report', async () => {
    const container = await renderFeedback()

    expect(button(container, 'Resolve…')).toBeTruthy()
    await click(container, 'Resolve…')

    expect(container.textContent).toContain('Resolution form for r1')
  })

  it('saves a resolution before refreshing the report list', async () => {
    const container = await renderFeedback()
    await click(container, 'Resolve…')

    await act(async () => {
      button(container, 'Save test resolution').click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(reportApi.updateReportResolution).toHaveBeenCalledWith('r1', {
      outcome: 'duplicate',
      note: 'Verified duplicate after production review.',
      canonicalReportId: 'r2',
      appVersion: 'abc1234',
    })
    expect(reportApi.listReports).toHaveBeenCalledTimes(3)
  })

  it('keeps the resolution form open when saving returns an error', async () => {
    reportApi.updateReportResolution.mockResolvedValue({ error: 'Database unavailable' })
    const container = await renderFeedback()
    await click(container, 'Resolve…')

    await act(async () => {
      button(container, 'Save test resolution').click()
      await Promise.resolve()
    })

    expect(container.textContent).toContain('Database unavailable')
    expect(container.textContent).toContain('Resolution form for r1')
    expect(reportApi.listReports).toHaveBeenCalledTimes(2)
  })

  it('reopens a resolved report through inline confirmation', async () => {
    reportApi.listReports.mockResolvedValue({ data: [{
      ...inProgressReport,
      status: 'resolved',
      resolution_note: 'Verified in production.',
      verified_at: '2026-08-28T00:00:00.000Z',
      verified_app_version: 'abc1234',
    }], error: null })
    const container = await renderFeedback()

    await click(container, 'Reopen')
    expect(button(container, 'Confirm reopen')).toBeTruthy()
    expect(reportApi.reopenReport).not.toHaveBeenCalled()

    await act(async () => {
      button(container, 'Confirm reopen').click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(reportApi.reopenReport).toHaveBeenCalledWith('r1')
    expect(reportApi.listReports).toHaveBeenCalledTimes(2)
  })

  it('shows duplicate resolution evidence and its canonical report in details', async () => {
    reportApi.listReports.mockResolvedValue({ data: [{
      ...inProgressReport,
      status: 'resolved',
      disposition: 'duplicate',
      canonical_report_id: 'r2',
      resolution_note: 'Tracked by the route alternatives work item.',
      verified_at: '2026-08-28T00:00:00.000Z',
      verified_app_version: 'abc1234',
    }, canonicalReport], error: null })
    const container = await renderFeedback()

    await act(async () => {
      container.querySelector('tbody tr').click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.textContent).toContain('Duplicate')
    expect(container.textContent).toContain('Tracked by the route alternatives work item.')
    expect(container.textContent).toContain('Alternative routes and tolls')
    expect(container.textContent).toContain('abc1234')
  })

  it('loads all reports to show a duplicate canonical reference outside the all filter', async () => {
    const duplicate = {
      ...inProgressReport,
      status: 'resolved',
      disposition: 'duplicate',
      canonical_report_id: 'r2',
      resolution_note: 'Tracked by the route alternatives work item.',
      verified_at: '2026-08-28T00:00:00.000Z',
      verified_app_version: 'abc1234',
    }
    reportApi.listReports.mockImplementation((filter) => Promise.resolve({
      data: filter === 'all' ? [duplicate, canonicalReport] : [duplicate],
      error: null,
    }))
    const container = await renderFeedback()

    await act(async () => {
      container.querySelector('tbody tr').click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(reportApi.listReports).toHaveBeenCalledWith('all')
    expect(container.textContent).toContain('Alternative routes and tolls')
  })

  it('does not delete a report until its explicit delete confirmation is used', async () => {
    const container = await renderFeedback()

    await click(container, 'Resolve…')
    expect(reportApi.deleteReport).not.toHaveBeenCalled()
    await click(container, 'Delete')
    expect(reportApi.deleteReport).not.toHaveBeenCalled()

    await act(async () => {
      button(container, 'Confirm').click()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(reportApi.deleteReport).toHaveBeenCalledWith('r1', null)
  })
})
