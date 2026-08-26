import { describe, expect, it } from 'vitest'
import type { DocumentLine } from '../../lib/types'
import {
  allocatedQuantity,
  carriedLots,
  carriesText,
  discountFieldsOf,
  discountPayload,
  editorOf,
  EVERYTHING_TOUCHED,
  hasProblem,
  itemLineCount,
  lineProblems,
  lotHeadline,
  lotProblems,
  lotSummary,
  moreDetailsSummary,
  lockedDiscount,
  NO_DISCOUNT,
  NOTHING_TOUCHED,
  openQuantity,
  signedLots,
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

describe('allocatedQuantity', () => {
  it('allocatedQuantityTest', () => {
    expect(
      allocatedQuantity([
        { lotNumber: 'L-2604', quantity: 3 },
        { lotNumber: 'L-2605', quantity: 2 },
      ]),
    ).toBe(5)
  })

  it('allocatedQuantityWithNoLotsTest', () => {
    expect(allocatedQuantity([])).toBe(0)
    expect(allocatedQuantity(undefined)).toBe(0)
  })

  it('allocatedQuantityOnAReturnTest', () => {
    // Signed, like the line: two negative entries cover a return of two.
    expect(
      allocatedQuantity([
        { lotNumber: 'SN-4711', quantity: -1 },
        { lotNumber: 'SN-4712', quantity: -1 },
      ]),
    ).toBe(-2)
  })
})

describe('carriedLots', () => {
  const picked = { productId: 9, entries: [{ lotNumber: 'SN-4711', quantity: 1 }] }
  const tracked = { id: 9, tracking: 'SERIAL' as const }

  /** The everyday case: the numbers were picked for this product and this document books. */
  it('carriedLotsTest', () => {
    expect(carriedLots(picked, 9, tracked, 'ISSUE')).toEqual([
      { lotNumber: 'SN-4711', quantity: 1 },
    ])
    expect(carriedLots(picked, 9, tracked, 'ISSUE_IF_NOT_BOOKED')).toHaveLength(1)
  })

  /**
   * Typing over the product name and picking another one leaves the numbers behind: they name
   * pieces lying under the product they were picked for, and the endpoint refuses them on any
   * other.
   */
  it('carriedLotsOfAnotherProductTest', () => {
    expect(carriedLots(picked, 7, { id: 7, tracking: 'NONE' }, 'ISSUE')).toEqual([])
    expect(carriedLots(picked, 8, { id: 8, tracking: 'SERIAL' }, 'ISSUE')).toEqual([])
  })

  /** A product that was followed when the line was written and is not any more. */
  it('carriedLotsOnAnUntrackedProductTest', () => {
    expect(carriedLots(picked, 9, { id: 9, tracking: 'NONE' }, 'ISSUE')).toEqual([])
    expect(carriedLots(picked, 9, { id: 9, tracking: undefined }, 'ISSUE')).toEqual([])
  })

  /** An Offerte moves nothing and names nothing, whatever is followed. */
  it('carriedLotsWhereNothingIsBookedTest', () => {
    expect(carriedLots(picked, 9, tracked, 'NONE')).toEqual([])
    expect(carriedLots(picked, 9, tracked, 'RESERVE')).toEqual([])
    expect(carriedLots(picked, 9, tracked, undefined)).toEqual([])
  })

  /** While the search field carries a term rather than a product there is nothing to send. */
  it('carriedLotsWithoutAProductTest', () => {
    expect(carriedLots(picked, undefined, undefined, 'ISSUE')).toEqual([])
    expect(carriedLots({ entries: [] }, 9, tracked, 'ISSUE')).toEqual([])
  })

  /**
   * The position names a product whose details are not there — still on their way, or refused
   * for good to a clerk without `PRODUCT_READ`. Answering «no numbers» would strip the stored
   * position of the ones it carries on the very next save, silently and for good.
   */
  it('carriedLotsWhileTheProductIsUnknownTest', () => {
    expect(carriedLots(picked, 9, undefined, 'ISSUE')).toEqual([
      { lotNumber: 'SN-4711', quantity: 1 },
    ])
  })
})

describe('signedLots', () => {
  it('signedLotsTest', () => {
    expect(signedLots([{ lotNumber: 'L-2604', quantity: 3 }], 5)).toEqual([
      { lotNumber: 'L-2604', quantity: 3 },
    ])
  })

  /** A return names the same pieces the other way round. */
  it('signedLotsOnAReturnTest', () => {
    expect(
      signedLots(
        [
          { lotNumber: 'SN-4711', quantity: 1 },
          { lotNumber: 'SN-4712', quantity: 1 },
        ],
        -2,
      ),
    ).toEqual([
      { lotNumber: 'SN-4711', quantity: -1 },
      { lotNumber: 'SN-4712', quantity: -1 },
    ])
  })

  /**
   * The sign is read fresh every time, never remembered: a position picked as an issue and
   * then turned into a return must not keep pointing the way it did.
   */
  it('signedLotsTurnedOverTest', () => {
    expect(signedLots([{ lotNumber: 'SN-4711', quantity: -1 }], 1)).toEqual([
      { lotNumber: 'SN-4711', quantity: 1 },
    ])
  })

  it('signedLotsWithoutAQuantityTest', () => {
    expect(signedLots([], 5)).toEqual([])
    expect(signedLots([{ lotNumber: 'L-2604', quantity: 3 }], null)).toEqual([
      { lotNumber: 'L-2604', quantity: 3 },
    ])
  })
})

describe('lotHeadline', () => {
  it('lotHeadlineTest', () => {
    expect(lotHeadline(5, [{ lotNumber: 'L-2604', quantity: 3 }])).toBe(
      'Menge 5 · zugeordnet 3 · offen 2',
    )
  })

  /** A return counts pieces like everything else; the sign is a fact of the line. */
  it('lotHeadlineOnAReturnTest', () => {
    expect(lotHeadline(-2, [{ lotNumber: 'SN-4711', quantity: -1 }])).toBe(
      'Menge 2 · zugeordnet 1 · offen 1',
    )
  })

  /** Worded the way the field words it, so the two lines can never contradict each other. */
  it('lotHeadlineWithTooManyTest', () => {
    expect(
      lotHeadline(1, [
        { lotNumber: 'SN-4711', quantity: 1 },
        { lotNumber: 'SN-4712', quantity: 1 },
      ]),
    ).toBe('Menge 1 · zugeordnet 2 · 1 zu viel')
  })

  it('lotHeadlineWithoutAQuantityTest', () => {
    expect(lotHeadline(null, [])).toBe('Menge — · zugeordnet 0 · offen 0')
  })
})

describe('openQuantity', () => {
  it('openQuantityTest', () => {
    expect(openQuantity(5, [{ lotNumber: 'L-2604', quantity: 3 }])).toBe(2)
  })

  it('openQuantityWhenCoveredTest', () => {
    expect(openQuantity(5, [{ lotNumber: 'L-2604', quantity: 5 }])).toBe(0)
  })

  it('openQuantityOnReturnLineTest', () => {
    expect(openQuantity(-2, [{ lotNumber: 'SN-4711', quantity: -1 }])).toBe(-1)
  })

  it('openQuantityWithoutAQuantityTest', () => {
    expect(openQuantity(null, [])).toBe(0)
  })

  /**
   * Four decimals, the way a quantity is kept. Without the rounding the split below answers a
   * millionth instead of zero, and the button stays dark over a position that is complete.
   */
  it('openQuantityWithFractionsTest', () => {
    expect(
      openQuantity(5, [
        { lotNumber: 'L-2604', quantity: 1.1 },
        { lotNumber: 'L-2605', quantity: 3.9 },
      ]),
    ).toBe(0)
  })
})

describe('lotProblems', () => {
  it('lotProblemsTest', () => {
    expect(lotProblems(5, 'LOT', [{ lotNumber: 'L-2604', quantity: 3 }])).toBe(
      'Noch 2 ohne Nummer.',
    )
  })

  it('lotProblemsWithTooManyNumbersTest', () => {
    // A shortened quantity over a stored allocation is the ordinary way here: the numbers stay,
    // the quantity drops, and the mask asks for the correction. Saying «noch ohne Nummer» there
    // would contradict the field, which says «zu viel zugeordnet» three lines below.
    expect(
      lotProblems(4, 'SERIAL', [
        { lotNumber: 'SN-4711', quantity: 1 },
        { lotNumber: 'SN-4712', quantity: 1 },
        { lotNumber: 'SN-4713', quantity: 1 },
        { lotNumber: 'SN-4714', quantity: 1 },
        { lotNumber: 'SN-4715', quantity: 1 },
      ]),
    ).toBe('Es sind 1 zu viel zugeordnet.')
  })

  it('lotProblemsWhenCoveredTest', () => {
    expect(
      lotProblems(5, 'LOT', [
        { lotNumber: 'L-2604', quantity: 3 },
        { lotNumber: 'L-2605', quantity: 2 },
      ]),
    ).toBeUndefined()
  })

  it('lotProblemsOnAnUntrackedProductTest', () => {
    // A product nobody follows never has an open quantity of numbers.
    expect(lotProblems(5, 'NONE', [])).toBeUndefined()
    expect(lotProblems(5, undefined, [])).toBeUndefined()
  })

  it('lotProblemsWithDuplicateNumberTest', () => {
    expect(
      lotProblems(2, 'SERIAL', [
        { lotNumber: 'SN-4711', quantity: 1 },
        { lotNumber: 'sn-4711', quantity: 1 },
      ]),
    ).toBe('sn-4711 steht zweimal auf dieser Position.')
  })

  it('lotProblemsWithSerialQuantityTest', () => {
    expect(lotProblems(2, 'SERIAL', [{ lotNumber: 'SN-4711', quantity: 2 }])).toBe(
      'SN-4711 ist eine Seriennummer und bewegt genau ein Stück.',
    )
  })

  it('lotProblemsWithAZeroEntryTest', () => {
    expect(lotProblems(2, 'LOT', [{ lotNumber: 'L-2604', quantity: 0 }])).toBe(
      'Eine Nummer ohne Menge sagt nichts aus.',
    )
  })

  it('lotProblemsWithTooManyNumbersOnAReturnTest', () => {
    // The counterpart of lotProblemsWithTooManyNumbersTest, and the reason the overshoot cannot
    // be read off the sign of the open quantity: here it is -1 on a line that is short by one,
    // and +1 on this one, which is over by one. Only «open points against the line» tells them
    // apart.
    expect(
      lotProblems(-2, 'SERIAL', [
        { lotNumber: 'SN-4711', quantity: -1 },
        { lotNumber: 'SN-4712', quantity: -1 },
        { lotNumber: 'SN-4713', quantity: -1 },
      ]),
    ).toBe('Es sind 1 zu viel zugeordnet.')
  })

  it('lotProblemsOnAReturnTest', () => {
    expect(lotProblems(-2, 'SERIAL', [{ lotNumber: 'SN-4711', quantity: -1 }])).toBe(
      'Noch 1 ohne Nummer.',
    )
    expect(
      lotProblems(-2, 'SERIAL', [
        { lotNumber: 'SN-4711', quantity: -1 },
        { lotNumber: 'SN-4712', quantity: -1 },
      ]),
    ).toBeUndefined()
  })
})

describe('lotSummary', () => {
  it('lotSummaryTest', () => {
    expect(
      lotSummary([
        { lotNumber: 'L-2604', tracking: 'LOT', quantity: 3 },
        { lotNumber: 'L-2605', tracking: 'LOT', quantity: 2 },
      ]),
    ).toBe('Chargen: L-2604, L-2605')
  })

  it('lotSummaryOfSerialsTest', () => {
    expect(lotSummary([{ lotNumber: 'SN-4711', tracking: 'SERIAL', quantity: 1 }])).toBe(
      'Serien: SN-4711',
    )
  })

  it('lotSummaryWithManyLotsTest', () => {
    // A table row is one line; the printed document carries all of them.
    const many = ['A', 'B', 'C', 'D', 'E'].map((suffix) => ({
      lotNumber: `SN-${suffix}`,
      tracking: 'SERIAL' as const,
      quantity: 1,
    }))

    expect(lotSummary(many)).toBe('Serien: SN-A, SN-B, SN-C, +2')
  })

  it('lotSummaryWithoutLotsTest', () => {
    expect(lotSummary([])).toBe('')
    expect(lotSummary(undefined)).toBe('')
  })
})
