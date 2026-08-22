import { describe, expect, it } from 'vitest'
import type { DocumentLine } from '../../lib/types'
import {
  carriesText,
  discountFieldsOf,
  discountPayload,
  editorOf,
  EVERYTHING_TOUCHED,
  hasProblem,
  itemLineCount,
  lineProblems,
  moreDetailsSummary,
  lockedDiscount,
  NO_DISCOUNT,
  NOTHING_TOUCHED,
  structureKindOptions,
  structureLineProblem,
  visibleProblems,
  withDiscountAmount,
  withDiscountPercent,
  withTouched,
  type LineProblems,
  type TouchedFields,
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

describe('moreDetailsSummary', () => {
  it('moreDetailsSummaryTest', () => {
    expect(moreDetailsSummary({ percent: '10', amount: '' }, '2026-01-01', '2026-01-31')).toBe(
      'Rabatt 10 % · Leistung 01.01.2026 bis 31.01.2026',
    )
  })

  it('moreDetailsSummaryWithNothingInItTest', () => {
    expect(moreDetailsSummary(NO_DISCOUNT, '', '')).toBeUndefined()
  })

  it('moreDetailsSummaryWithADiscountAmountTest', () => {
    expect(moreDetailsSummary({ percent: '', amount: '12.5' }, '', '')).toBe('Rabatt 12.50')
  })

  it('moreDetailsSummaryWithOnlyOneDayTest', () => {
    expect(moreDetailsSummary(NO_DISCOUNT, '2026-01-01', '')).toBe('Leistung ab 01.01.2026')
    expect(moreDetailsSummary(NO_DISCOUNT, '', '2026-01-31')).toBe('Leistung bis 31.01.2026')
  })

  /** A stored zero is no discount, and `discountFieldsOf` leaves the field empty for it. */
  it('moreDetailsSummaryWithADiscountOfZeroTest', () => {
    expect(moreDetailsSummary({ percent: '0', amount: '' }, '', '')).toBe('Rabatt 0 %')
  })

  it('moreDetailsSummaryWithAHalfTypedFigureTest', () => {
    expect(moreDetailsSummary({ percent: '-', amount: '' }, '', '')).toBeUndefined()
  })
})

describe('lineProblems', () => {
  it('lineProblemsTest', () => {
    expect(lineProblems({ quantity: '3', discount: { percent: '10', amount: '' } })).toEqual({})
  })

  it('lineProblemsWithoutAQuantityTest', () => {
    const problems = lineProblems({ quantity: '', discount: NO_DISCOUNT })

    expect(problems.quantity).toBe('Die Menge fehlt.')
    expect(hasProblem(problems)).toBe(true)
  })

  it('lineProblemsWithAQuantityOfZeroTest', () => {
    expect(lineProblems({ quantity: '0', discount: NO_DISCOUNT }).quantity).toBe(
      'Die Menge darf nicht null sein.',
    )
  })

  it('lineProblemsWithANegativeQuantityTest', () => {
    // A returned item carries one, so it is not a problem.
    expect(lineProblems({ quantity: '-2', discount: NO_DISCOUNT })).toEqual({})
  })

  it('lineProblemsWithADiscountThatIsNotANumberTest', () => {
    // "10%" used to be dropped without a word: the line went out ten per cent too dear while
    // the mask still showed a discount.
    expect(
      lineProblems({ quantity: '1', discount: { percent: '10%', amount: '' } }).percent,
    ).toBe('Der Rabatt ist keine Zahl.')
    expect(
      lineProblems({ quantity: '1', discount: { percent: '', amount: 'zehn' } }).amount,
    ).toBe('Der Rabatt ist keine Zahl.')
  })

  it('lineProblemsWithAnEmptyDiscountTest', () => {
    // Empty is not unreadable: most lines carry no discount at all.
    expect(lineProblems({ quantity: '1', discount: { percent: '  ', amount: '' } })).toEqual({})
  })

  it('lineProblemsWithADiscountOutOfRangeTest', () => {
    expect(
      lineProblems({ quantity: '1', discount: { percent: '120', amount: '' } }).percent,
    ).toBe('Der Rabatt liegt zwischen 0 und 100 Prozent.')
    expect(
      lineProblems({ quantity: '1', discount: { percent: '', amount: '-5' } }).amount,
    ).toBe('Der Rabatt darf nicht negativ sein.')
  })

  it('lineProblemsWithoutAUnitPriceTest', () => {
    const problems = lineProblems({ quantity: '1', unitPrice: '', discount: NO_DISCOUNT })

    expect(problems.unitPrice).toBe('Der Einzelpreis fehlt.')
  })

  it('lineProblemsWithADescriptionTest', () => {
    expect(
      lineProblems({ description: 'Beratung vor Ort', quantity: '3', discount: NO_DISCOUNT }),
    ).toEqual({})
  })

  it('lineProblemsWithoutADescriptionTest', () => {
    const problems = lineProblems({ description: '   ', quantity: '1', discount: NO_DISCOUNT })

    // Blanks are no description. The backend refuses the line either way.
    expect(problems.description).toBe('Die Bezeichnung fehlt.')
    expect(hasProblem(problems)).toBe(true)
  })

  it('lineProblemsWithoutADescriptionFieldTest', () => {
    // A line from the catalogue takes its description from the product; the dialog that
    // picks one hands no description in, and must not be asked for one.
    expect(lineProblems({ quantity: '1', discount: NO_DISCOUNT }).description).toBeUndefined()
  })
})

describe('withTouched', () => {
  it('withTouchedTest', () => {
    expect(withTouched(NOTHING_TOUCHED, 'unitPrice')).toEqual({ unitPrice: true })
  })

  it('withTouchedKeepsTheOthersTest', () => {
    expect(withTouched({ quantity: true }, 'unitPrice')).toEqual({
      quantity: true,
      unitPrice: true,
    })
  })

  it('withTouchedTwiceTest', () => {
    const once = withTouched(NOTHING_TOUCHED, 'percent')

    // The same field again is no change at all, and must not make the dialog draw anew.
    expect(withTouched(once, 'percent')).toBe(once)
  })

  it('withTouchedLeavesTheOldSetAloneTest', () => {
    withTouched(NOTHING_TOUCHED, 'amount')

    expect(NOTHING_TOUCHED).toEqual({})
  })
})

describe('visibleProblems', () => {
  it('visibleProblemsTest', () => {
    const problems = lineProblems({ quantity: '0', unitPrice: '', discount: NO_DISCOUNT })

    const shown = visibleProblems(problems, { quantity: true })

    // The quantity was typed into, the price was not: only the quantity may say anything.
    expect(shown).toEqual({ quantity: 'Die Menge darf nicht null sein.' })
  })

  it('visibleProblemsWithNothingTouchedTest', () => {
    const problems = lineProblems({ quantity: '1', unitPrice: '', discount: NO_DISCOUNT })

    expect(visibleProblems(problems, NOTHING_TOUCHED)).toEqual({})
  })

  it('visibleProblemsWithEverythingTouchedTest', () => {
    const problems = lineProblems({
      quantity: '',
      unitPrice: '',
      discount: { percent: '10%', amount: '' },
    })

    const shown = visibleProblems(problems, {
      quantity: true,
      unitPrice: true,
      percent: true,
      amount: true,
    })

    expect(shown).toEqual(problems)
  })

  it('visibleProblemsWithoutAProblemTest', () => {
    expect(visibleProblems({}, { quantity: true, unitPrice: true })).toEqual({})
  })

  it('visibleProblemsKeepAnUnsendableLineUnsendableTest', () => {
    const problems = lineProblems({ quantity: '1', unitPrice: '', discount: NO_DISCOUNT })

    // What the mask says and what it lets through are two questions. A line without a price
    // stays unsendable while the dialog is still silent about it — the send is refused on the
    // full set, not on the shown one, and the button is no longer locked for it.
    expect(hasProblem(problems)).toBe(true)
    expect(hasProblem(visibleProblems(problems, NOTHING_TOUCHED))).toBe(false)
  })

  it('visibleProblemsShowTheDescriptionTest', () => {
    const problems = lineProblems({ description: '', quantity: '1', discount: NO_DISCOUNT })

    expect(visibleProblems(problems, { description: true })).toEqual({
      description: 'Die Bezeichnung fehlt.',
    })
  })

  it('visibleProblemsShowAFieldNoListKnowsTest', () => {
    // Cast on purpose: the point of this case is a field that no list next to the problems
    // has ever heard of. What is shown is decided on the keys the problems carry, so a field
    // added later is never swallowed while it still locks the dialog.
    const problems = { serviceDate: 'Das Leistungsdatum fehlt.' } as unknown as LineProblems
    const touched = { serviceDate: true } as unknown as TouchedFields

    expect(visibleProblems(problems, touched)).toEqual(problems)
  })

  it('visibleProblemsWithEverythingTouchedAtOnceTest', () => {
    const problems = lineProblems({
      description: '',
      quantity: '0',
      unitPrice: '',
      discount: { percent: '10%', amount: '' },
    })

    // What the press on the send button does: every field counts as dealt with, so the
    // dialog names all four at once instead of one per visit.
    expect(visibleProblems(problems, EVERYTHING_TOUCHED)).toEqual(problems)
  })
})
