// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { readChartTheme } from './chartTheme'

function fakeDocWithVars(vars) {
  const root = document.documentElement
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(`--${k}`, v))
  return document
}

describe('readChartTheme', () => {
  it('reads axis/grid/tooltip/series from CSS custom properties', () => {
    fakeDocWithVars({
      'chart-axis': '#111111',
      'chart-grid': '#222222',
      'chart-tooltip-bg': '#333333',
      'chart-tooltip-border': '#444444',
      'chart-tooltip-label': '#555555',
      'chart-1': '#aaaaaa',
      'chart-2': '#bbbbbb',
    })
    const t = readChartTheme()
    expect(t.axis).toEqual({ fontSize: 11, fill: '#111111' })
    expect(t.grid).toBe('#222222')
    expect(t.tooltip.contentStyle.background).toBe('#333333')
    expect(t.tooltip.contentStyle.border).toBe('1px solid #444444')
    expect(t.tooltip.labelStyle.color).toBe('#555555')
    expect(t.series[1]).toBe('#aaaaaa')
    expect(t.series[2]).toBe('#bbbbbb')
  })

  it('falls back to sensible defaults when a var is missing', () => {
    document.documentElement.style.cssText = ''
    const t = readChartTheme()
    expect(t.grid).toBe('#2a2a2a')
    expect(t.series[1]).toBe('#c9a227')
  })
})
