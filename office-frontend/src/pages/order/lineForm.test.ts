import { describe, expect, it } from 'vitest'
import type { DocumentLine } from '../../lib/types'
import {
  carriesText,
  discountFieldsOf,
  discountPayload,
  editorOf,
  itemLineCount,
  lockedDiscount,
  NO_DISCOUNT,
  structureKindOptions,
  structureLineProblem,
  withDiscountAmount,
  withDiscountPercent,
} from './lineForm'

/** A line the way the backend answers it, with only what a test cares about spelled out. */
function line(fields: Partial<DocumentLine>): DocumentLine {
  return {
    lineNumber: 1,
    kind: 'ITEM',
    priceIncludesVat: false,
    lineNet: 0,
    lineVat: 0,
    lineGross: 0,
    ...fields,
  }
}

describe('withDiscountPercent', () => {
  it('withDiscountPercentTest', () => {
    const fields = withDiscountPercent(NO_DISCOUNT, '10')

    expect(fields).toEqual({ percent: '10', amount: '' })
  })

  it('withDiscountPercentClearsTheAmountTest', () => {
    const fields = withDiscountPercent({ percent: '', amount: '25' }, '10')

    expect(fields.amount).toBe('')
  })

  it('withDiscountPercentEmptyKeepsTheAmountTest', () => {
    // Emptying the percentage must not wipe an amount the user has just typed instead.
    const fields = withDiscountPercent({ percent: '10', amount: '25' }, '')

    expect(fields).toEqual({ percent: '', amount: '25' })
  })

  it('withDiscountPercentBlankCountsAsEmptyTest', () => {
    const fields = withDiscountPercent({ percent: '', amount: '25' }, '   ')

    expect(fields.amount).toBe('25')
  })
})

describe('withDiscountAmount', () => {
  it('withDiscountAmountTest', () => {
    const fields = withDiscountAmount(NO_DISCOUNT, '25')

    expect(fields).toEqual({ percent: '', amount: '25' })
  })

  it('withDiscountAmountClearsThePercentageTest', () => {
    const fields = withDiscountAmount({ percent: '10', amount: '' }, '25')

    expect(fields.percent).toBe('')
  })

  it('withDiscountAmountEmptyKeepsThePercentageTest', () => {
    const fields = withDiscountAmount({ percent: '10', amount: '25' }, '')

    expect(fields).toEqual({ percent: '10', amount: '' })
  })
})

describe('lockedDiscount', () => {
  it('lockedDiscountTest', () => {
    expect(lockedDiscount({ percent: '10', amount: '' })).toBe('amount')
  })

  it('lockedDiscountWithAmountTest', () => {
    expect(lockedDiscount({ percent: '', amount: '25' })).toBe('percent')
  })

  it('lockedDiscountWithBothEmptyTest', () => {
    expect(lockedDiscount(NO_DISCOUNT)).toBeNull()
  })

  it('lockedDiscountWithZeroTest', () => {
    // A typed zero is a value, not an empty field: it locks the other one like any other.
    expect(lockedDiscount({ percent: '0', amount: '' })).toBe('amount')
  })
})

describe('discountPayload', () => {
  it('discountPayloadTest', () => {
    expect(discountPayload({ percent: '10', amount: '' })).toEqual({ discountPercent: 10 })
  })

  it('discountPayloadWithAmountTest', () => {
    expect(discountPayload({ percent: '', amount: "1'250.50" })).toEqual({
      discountAmount: 1250.5,
    })
  })

  it('discountPayloadWithCommaTest', () => {
    expect(discountPayload({ percent: '', amount: '25,5' })).toEqual({ discountAmount: 25.5 })
  })

  it('discountPayloadWithNothingTest', () => {
    expect(discountPayload(NO_DISCOUNT)).toEqual({})
  })

  it('discountPayloadWithBothTest', () => {
    // Cannot happen through the mask; if it does, only one of the two goes out.
    expect(discountPayload({ percent: '10', amount: '25' })).toEqual({ discountPercent: 10 })
  })

  it('discountPayloadWithNonsenseTest', () => {
    expect(discountPayload({ percent: 'zehn', amount: '' })).toEqual({})
  })
})

describe('discountFieldsOf', () => {
  it('discountFieldsOfTest', () => {
    expect(discountFieldsOf(line({ discountPercent: 10 }))).toEqual({ percent: '10', amount: '' })
  })

  it('discountFieldsOfAmountTest', () => {
    expect(discountFieldsOf(line({ discountAmount: 25.5 }))).toEqual({
      percent: '',
      amount: '25.5',
    })
  })

  it('discountFieldsOfNewLineTest', () => {
    expect(discountFieldsOf(undefined)).toEqual(NO_DISCOUNT)
  })

  it('discountFieldsOfZeroTest', () => {
    expect(discountFieldsOf(line({ discountPercent: 0, discountAmount: 0 }))).toEqual(NO_DISCOUNT)
  })
})

describe('structureLineProblem', () => {
  it('structureLineProblemTest', () => {
    expect(structureLineProblem('COMMENT', 'Montage vor Ort')).toBeUndefined()
  })

  it('structureLineProblemWithoutTextTest', () => {
    expect(structureLineProblem('COMMENT', '   ')).toBe('Eine Kommentarzeile braucht einen Text.')
  })

  it('structureLineProblemForASubtotalWithoutCaptionTest', () => {
    expect(structureLineProblem('SUBTOTAL', '')).toBeUndefined()
  })

  it('structureLineProblemForAPageBreakTest', () => {
    expect(structureLineProblem('PAGE_BREAK', '')).toBeUndefined()
  })
})

describe('carriesText', () => {
  it('carriesTextTest', () => {
    expect(carriesText('COMMENT')).toBe(true)
    expect(carriesText('SUBTOTAL')).toBe(true)
  })

  it('carriesTextForAPageBreakTest', () => {
    expect(carriesText('PAGE_BREAK')).toBe(false)
  })
})

describe('structureKindOptions', () => {
  it('structureKindOptionsTest', () => {
    const options = structureKindOptions([
      { code: 'ITEM', name: 'Position' },
      { code: 'COMMENT', name: 'Kommentar' },
      { code: 'SUBTOTAL', name: 'Zwischentotal' },
      { code: 'PAGE_BREAK', name: 'Seitenwechsel' },
    ])

    expect(options.map((option) => option.code)).toEqual(['COMMENT', 'SUBTOTAL', 'PAGE_BREAK'])
  })

  it('structureKindOptionsWithoutCatalogueTest', () => {
    const options = structureKindOptions([])

    expect(options.map((option) => option.code)).toEqual(['COMMENT', 'SUBTOTAL', 'PAGE_BREAK'])
    expect(options[0].name).toBe('COMMENT')
  })

  it('structureKindOptionsWithOnlyItemTest', () => {
    const options = structureKindOptions([{ code: 'ITEM', name: 'Position' }])

    expect(options).toHaveLength(3)
  })
})

describe('editorOf', () => {
  it('editorOfTest', () => {
    expect(editorOf(line({ kind: 'ITEM', productId: 7 }))).toBe('product')
  })

  it('editorOfFreeLineTest', () => {
    expect(editorOf(line({ kind: 'ITEM' }))).toBe('free')
  })

  it('editorOfCommentTest', () => {
    expect(editorOf(line({ kind: 'COMMENT', description: 'Hinweis' }))).toBe('structure')
  })

  it('editorOfPageBreakTest', () => {
    expect(editorOf(line({ kind: 'PAGE_BREAK' }))).toBe('structure')
  })
})

describe('itemLineCount', () => {
  it('itemLineCountTest', () => {
    const lines = [
      line({ lineNumber: 1, kind: 'ITEM' }),
      line({ lineNumber: 2, kind: 'COMMENT' }),
      line({ lineNumber: 3, kind: 'ITEM' }),
      line({ lineNumber: 4, kind: 'SUBTOTAL' }),
    ]

    expect(itemLineCount(lines)).toBe(2)
  })

  it('itemLineCountWithoutLinesTest', () => {
    expect(itemLineCount(undefined)).toBe(0)
    expect(itemLineCount([])).toBe(0)
  })

  it('itemLineCountWithOnlyStructureLinesTest', () => {
    expect(itemLineCount([line({ kind: 'COMMENT' }), line({ kind: 'PAGE_BREAK' })])).toBe(0)
  })
})
