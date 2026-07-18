import { describe, expect, it } from 'vitest'
import {
  appliesToVehicleOptions,
  buildOptionCodeCandidates,
  filterByVehicleOptions,
  parseOptionRules,
} from './optionCodes'

describe('parseOptionRules', () => {
  it('extracts required and excluded option codes from IPC text', () => {
    const part = {
      usage: 'For options "580: AIR CONDITIONING"',
      remarks: 'Not for options "581: AUTOMATIC AIR CONDITIONER"',
    }

    expect(parseOptionRules(part)).toEqual({
      required: [{ code: '580', label: 'AIR CONDITIONING' }],
      excluded: [{ code: '581', label: 'AUTOMATIC AIR CONDITIONER' }],
    })
  })

  it('keeps unclear code mentions as candidates without turning them into rules', () => {
    const part = {
      usage: '580: AIR CONDITIONING',
      remarks: 'M 6X20',
    }

    expect(parseOptionRules(part)).toEqual({
      required: [],
      excluded: [],
    })
  })
})

describe('buildOptionCodeCandidates', () => {
  it('builds sorted selectable options with cleaned labels and counts', () => {
    const parts = [
      { usage: 'For options "580: AIR CONDITIONING"' },
      { remarks: 'Not for options "580: AIR CONDITIONING"' },
      { usage: 'For options "345: RAIN SENSOR"' },
    ]

    expect(buildOptionCodeCandidates(parts)).toEqual([
      { code: '345', label: 'RAIN SENSOR', count: 1, requiredCount: 1, excludedCount: 0 },
      { code: '580', label: 'AIR CONDITIONING', count: 2, requiredCount: 1, excludedCount: 1 },
    ])
  })

  it('cleans ILcats hyphen artifacts from option labels', () => {
    const parts = [
      { remarks: 'Not for options "024: SERIES PROD.INSTR.PANEL CONot for options DRIVER AIRBAG (100%)"' },
    ]

    expect(buildOptionCodeCandidates(parts)[0].label).toBe('SERIES PROD.INSTR.PANEL CO DRIVER AIRBAG (100%)')
  })
})

describe('appliesToVehicleOptions', () => {
  it('hides parts excluded by an installed option code', () => {
    const part = { remarks: 'Not for options "580: AIR CONDITIONING"' }

    expect(appliesToVehicleOptions(part, ['580'])).toBe(false)
    expect(appliesToVehicleOptions(part, ['581'])).toBe(true)
  })

  it('shows option-specific parts only when the matching option is installed', () => {
    const part = { usage: 'For options "345: RAIN SENSOR" Or "580: AIR CONDITIONING"' }

    expect(appliesToVehicleOptions(part, [])).toBe(false)
    expect(appliesToVehicleOptions(part, ['580'])).toBe(true)
  })

  it('does not hide parts with no clear option rules', () => {
    const part = { usage: '580: AIR CONDITIONING' }

    expect(appliesToVehicleOptions(part, [])).toBe(true)
  })
})

describe('filterByVehicleOptions', () => {
  it('filters a parts list by selected vehicle option codes', () => {
    const parts = [
      { id: 'normal', name: 'WINDSHIELD' },
      { id: 'with-ac', usage: 'For options "580: AIR CONDITIONING"' },
      { id: 'not-ac', remarks: 'Not for options "580: AIR CONDITIONING"' },
    ]

    expect(filterByVehicleOptions(parts, ['580']).map(part => part.id)).toEqual(['normal', 'with-ac'])
  })
})
