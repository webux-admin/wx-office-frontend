import { describe, expect, it } from 'vitest'
import { emptyDefinition } from './definition'
import { locateDrop, type SectionSpan } from './dropping'
import { sampleForm } from './fixtures'

/** Where the four sections of the sample form stand on the sheet. */
const SPANS: SectionSpan[] = [
  { top: 103, bottom: 110 },
  { top: 114, bottom: 160 },
  { top: 164, bottom: 180 },
  { top: 184, bottom: 204 },
]

const locate = (
  point: { x: number; y: number },
  what: 'element' | 'section' = 'element',
  extra: Partial<Parameters<typeof locateDrop>[0]> = {},
) =>
  locateDrop({
    definition: sampleForm(),
    view: 'first',
    sections: SPANS,
    point,
    what,
    fixed: false,
    ...extra,
  })

describe('locateDrop', () => {
  it('locateDropTest', () => {
    // Above the start of the content an element is fixed on the paper.
    expect(locate({ x: 60, y: 40 })).toEqual({
      point: { x: 60, y: 40 },
      target: { kind: 'page', x: 60, y: 40 },
      lineY: null,
    })
  })

  it('locateDropIntoTheFlowTest', () => {
    // Over the positions, in their lower half: a new free section goes below them.
    expect(locate({ x: 60, y: 150 })).toEqual({
      point: { x: 60, y: 150 },
      target: { kind: 'flow', index: 2, x: 40 },
      lineY: 162,
    })
    // In their upper half: above them.
    expect(locate({ x: 60, y: 120 })?.target).toEqual({ kind: 'flow', index: 1, x: 40 })
  })

  it('locateDropIntoAnExistingFreeSectionTest', () => {
    // The free section under the pointer takes the element, at the spot inside it.
    expect(locate({ x: 60, y: 190 })).toEqual({
      point: { x: 60, y: 190 },
      target: { kind: 'free', section: 3, x: 40, y: 6 },
      lineY: 184,
    })
  })

  it('locateDropBelowTheLastSectionTest', () => {
    expect(locate({ x: 60, y: 250 })?.target).toEqual({ kind: 'flow', index: 4, x: 40 })
    expect(locate({ x: 60, y: 250 })?.lineY).toBe(204)
  })

  it('locateDropInTheMarginsTest', () => {
    // Left of the content, and below the bottom margin, is the page: that is where a footer goes.
    expect(locate({ x: 10, y: 150 })?.target.kind).toBe('page')
    expect(locate({ x: 60, y: 280 })?.target.kind).toBe('page')
    // Exactly on the start line already counts as content.
    expect(locate({ x: 60, y: 103 })?.target.kind).toBe('flow')
  })

  it('locateDropForcedOntoThePageTest', () => {
    // Shift held: fixed on the paper even across the content.
    expect(locate({ x: 60, y: 150 }, 'element', { fixed: true })?.target).toEqual({
      kind: 'page',
      x: 60,
      y: 150,
    })
  })

  it('locateDropOnAFollowingPageTest', () => {
    // A following page takes fixed elements only, and no sections at all.
    expect(locate({ x: 60, y: 150 }, 'element', { view: 'following' })?.target.kind).toBe('page')
    expect(locate({ x: 60, y: 150 }, 'section', { view: 'following' })).toBeNull()
  })

  it('locateDropOfASectionTest', () => {
    // A section goes into the order wherever it is dropped on the sheet, margins included.
    expect(locate({ x: 5, y: 170 }, 'section')).toEqual({
      point: { x: 5, y: 170 },
      target: { kind: 'order', index: 2 },
      lineY: 162,
    })
    expect(locate({ x: 60, y: 20 }, 'section')?.target).toEqual({ kind: 'order', index: 0 })
    expect(locate({ x: 60, y: 290 }, 'section')?.target).toEqual({ kind: 'order', index: 4 })
  })

  it('locateDropIntoAnEmptyFormTest', () => {
    const empty = { definition: emptyDefinition(), sections: [] }
    expect(locate({ x: 60, y: 150 }, 'element', empty)).toMatchObject({
      target: { kind: 'flow', index: 0, x: 40 },
      lineY: 103,
    })
    expect(locate({ x: 60, y: 150 }, 'section', empty)).toMatchObject({
      target: { kind: 'order', index: 0 },
      lineY: 103,
    })
  })

  it('locateDropUnderThePaymentPartTest', () => {
    // The bottom 105 mm belong to the payment part: nothing flows there.
    expect(locate({ x: 60, y: 200 }, 'element', { coveredBottom: 105 })?.target.kind).toBe('page')
    expect(locate({ x: 60, y: 190 }, 'element', { coveredBottom: 105 })?.target.kind).toBe('free')
  })

  it('locateDropOffTheSheetTest', () => {
    expect(locate({ x: -1, y: 50 })).toBeNull()
    expect(locate({ x: 211, y: 50 })).toBeNull()
    expect(locate({ x: 50, y: 298 }, 'section')).toBeNull()
    // The edge itself is still the sheet.
    expect(locate({ x: 0, y: 0 })?.target.kind).toBe('page')
    expect(locate({ x: 210, y: 297 })?.target.kind).toBe('page')
  })
})
