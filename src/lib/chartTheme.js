import { useMemo } from 'react'
import { useTheme } from '../contexts/ThemeContext'

const DEFAULTS = {
  axis: '#8a8a8a',
  grid: '#2a2a2a',
  tooltipBg: '#161616',
  tooltipBorder: '#333',
  tooltipLabel: '#aaa',
  chart1: '#c9a227',
  chart2: '#4aa3df',
  chart3: '#e0794a',
  chart4: '#f39c12',
  chart5: '#27ae60',
  chart6: '#b07cc6',
}

export function readChartTheme(doc = document) {
  const style = getComputedStyle(doc.documentElement)
  const v = (name, fallback) => style.getPropertyValue(`--${name}`).trim() || fallback

  return {
    axis: { fontSize: 11, fill: v('chart-axis', DEFAULTS.axis) },
    grid: v('chart-grid', DEFAULTS.grid),
    tooltip: {
      contentStyle: {
        background: v('chart-tooltip-bg', DEFAULTS.tooltipBg),
        border: `1px solid ${v('chart-tooltip-border', DEFAULTS.tooltipBorder)}`,
        borderRadius: 4,
        fontSize: 12,
      },
      labelStyle: { color: v('chart-tooltip-label', DEFAULTS.tooltipLabel) },
    },
    series: {
      1: v('chart-1', DEFAULTS.chart1),
      2: v('chart-2', DEFAULTS.chart2),
      3: v('chart-3', DEFAULTS.chart3),
      4: v('chart-4', DEFAULTS.chart4),
      5: v('chart-5', DEFAULTS.chart5),
      6: v('chart-6', DEFAULTS.chart6),
    },
  }
}

export function useChartTheme() {
  const { theme } = useTheme()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => readChartTheme(), [theme])
}
