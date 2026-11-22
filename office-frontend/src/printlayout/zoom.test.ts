import { describe, expect, it } from 'vitest'
import { fitZoom, formatZoom, stepZoom, ZOOM_FIT_MIN, ZOOM_MAX, ZOOM_MIN } from './zoom'

const A4 = { width: 210, height: 297 }

describe('stepZoom', () => {
  it('stepZoomTest', () => {
    expect(stepZoom(1, 1)).toBe(1.1)
    expect(stepZoom(1, -1)).toBe(0.9)
  })

  it('stepZoomFromBetweenTwoStopsTest', () => {
    // A fitted zoom is rarely a stop itself; the next stop is the neighbour, not two away.
    expect(stepZoom(0.68, 1)).toBe(0.75)
    expect(stepZoom(0.68, -1)).toBe(0.67)
  })

  it('stepZoomAtTheEndsTest', () => {
    expect(stepZoom(ZOOM_MAX, 1)).toBe(ZOOM_MAX)
    expect(stepZoom(ZOOM_MIN, -1)).toBe(ZOOM_MIN)
    // From a fit below the manual range the first step in reaches the range.
    expect(stepZoom(0.3, 1)).toBe(0.5)
    expect(stepZoom(0.3, -1)).toBe(ZOOM_MIN)
  })
})

describe('fitZoom', () => {
  it('fitZoomTest', () => {
    // 600 px of height for 297 mm: the height is what limits, at 53 %.
    expect(fitZoom({ width: 900, height: 600 }, A4)).toBe(0.53)
  })

  it('fitZoomLimitedByTheWidthTest', () => {
    expect(fitZoom({ width: 400, height: 2000 }, A4)).toBe(0.5)
  })

  it('fitZoomNeverEnlargesTest', () => {
    // A small format on a large screen is shown at its real size, not blown up.
    expect(fitZoom({ width: 3000, height: 2000 }, { width: 148, height: 210 })).toBe(1)
  })

  it('fitZoomOnATinyScreenTest', () => {
    expect(fitZoom({ width: 50, height: 50 }, A4)).toBe(ZOOM_FIT_MIN)
  })

  it('fitZoomWithoutRoomOrPaperTest', () => {
    // Nothing measured yet: 100 %, rather than a division by zero.
    expect(fitZoom({ width: 0, height: 600 }, A4)).toBe(1)
    expect(fitZoom({ width: 900, height: -1 }, A4)).toBe(1)
    expect(fitZoom({ width: 900, height: 600 }, { width: 0, height: 297 })).toBe(1)
  })
})

describe('formatZoom', () => {
  it('formatZoomTest', () => {
    expect(formatZoom(0.75)).toBe('75 %')
  })

  it('formatZoomRoundsTest', () => {
    expect(formatZoom(0.674)).toBe('67 %')
    expect(formatZoom(1)).toBe('100 %')
  })
})
