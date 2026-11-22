import { describe, expect, it } from 'vitest'
import type { LayoutPage } from '../lib/types'
import { DEFAULT_PAGE } from './definition'
import { sampleForm } from './fixtures'
import {
  allowsPaymentPartAtBottom,
  contentWidthOf,
  flowRegionOf,
  paperSizeOf,
} from './paper'

const page = (change: Partial<LayoutPage> = {}): LayoutPage => ({ ...DEFAULT_PAGE, ...change })

describe('paperSizeOf', () => {
  it('paperSizeOfTest', () => {
    expect(paperSizeOf(page())).toEqual({ width: 210, height: 297 })
  })

  it('paperSizeOfLandscapeTest', () => {
    expect(paperSizeOf(page({ orientation: 'LANDSCAPE' }))).toEqual({ width: 297, height: 210 })
    expect(paperSizeOf(page({ format: 'A5', orientation: 'LANDSCAPE' }))).toEqual({
      width: 210,
      height: 148,
    })
  })

  it('paperSizeOfEveryNamedFormatTest', () => {
    expect(paperSizeOf(page({ format: 'A5' }))).toEqual({ width: 148, height: 210 })
    expect(paperSizeOf(page({ format: 'A3' }))).toEqual({ width: 297, height: 420 })
    expect(paperSizeOf(page({ format: 'LETTER' }))).toEqual({ width: 215.9, height: 279.4 })
    expect(paperSizeOf(page({ format: 'LEGAL' }))).toEqual({ width: 215.9, height: 355.6 })
  })

  it('paperSizeOfCustomTest', () => {
    // A custom format is taken as given; the orientation says nothing about it.
    expect(
      paperSizeOf(
        page({ format: 'CUSTOM', orientation: 'LANDSCAPE', customWidth: 100, customHeight: 150 }),
      ),
    ).toEqual({ width: 100, height: 150 })
  })

  it('paperSizeOfCustomWithoutSidesTest', () => {
    expect(paperSizeOf(page({ format: 'CUSTOM' }))).toEqual({ width: 210, height: 297 })
  })
})

describe('contentWidthOf', () => {
  it('contentWidthOfTest', () => {
    expect(contentWidthOf(page())).toBe(170)
  })

  it('contentWidthOfWithoutMarginsTest', () => {
    expect(contentWidthOf(page({ marginLeft: 0, marginRight: 0 }))).toBe(210)
  })

  it('contentWidthOfWithMarginsWiderThanThePaperTest', () => {
    expect(contentWidthOf(page({ marginLeft: 150, marginRight: 150 }))).toBe(0)
  })
})

describe('flowRegionOf', () => {
  it('flowRegionOfTest', () => {
    // First page: from `flow.top` 103 down to the bottom margin of 22.
    expect(flowRegionOf(sampleForm(), 'first')).toEqual({ x: 20, y: 103, width: 170, height: 172 })
  })

  it('flowRegionOfAFollowingPageTest', () => {
    expect(flowRegionOf(sampleForm(), 'following')).toEqual({
      x: 20,
      y: 18,
      width: 170,
      height: 257,
    })
  })

  it('flowRegionOfWithNoRoomLeftTest', () => {
    const form = sampleForm()
    expect(flowRegionOf({ ...form, flow: { ...form.flow, top: 290 } }, 'first').height).toBe(0)
  })
})

describe('allowsPaymentPartAtBottom', () => {
  it('allowsPaymentPartAtBottomTest', () => {
    expect(allowsPaymentPartAtBottom(page())).toBe(true)
  })

  it('allowsPaymentPartAtBottomOnOtherPaperTest', () => {
    expect(allowsPaymentPartAtBottom(page({ orientation: 'LANDSCAPE' }))).toBe(false)
    expect(allowsPaymentPartAtBottom(page({ format: 'A5' }))).toBe(false)
    expect(allowsPaymentPartAtBottom(page({ format: 'LETTER' }))).toBe(false)
  })

  it('allowsPaymentPartAtBottomOnCustomPaperTest', () => {
    // Exactly 210 wide and at least 297 high — a longer sheet of the same width qualifies.
    expect(
      allowsPaymentPartAtBottom(page({ format: 'CUSTOM', customWidth: 210, customHeight: 297 })),
    ).toBe(true)
    expect(
      allowsPaymentPartAtBottom(page({ format: 'CUSTOM', customWidth: 210, customHeight: 400 })),
    ).toBe(true)
    expect(
      allowsPaymentPartAtBottom(page({ format: 'CUSTOM', customWidth: 210, customHeight: 296.9 })),
    ).toBe(false)
    expect(
      allowsPaymentPartAtBottom(page({ format: 'CUSTOM', customWidth: 210.5, customHeight: 297 })),
    ).toBe(false)
  })
})
