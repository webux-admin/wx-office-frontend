import { describe, expect, it } from 'vitest'
import {
  DUNNING_GROUPINGS,
  DUNNING_GROUPING_HINTS,
  DUNNING_RIGHTS,
  FEE_BOOKINGS,
  FEE_VAT_MODES,
  activeLevelCount,
  escalationProblem,
  insertPlaceholder,
  isHighestLevel,
  singleInvoiceTokensIn,
} from './dunning'
import type { DunningGrouping, DunningLevel, DunningPlaceholder } from './types'

/** One level, with only the parts these functions look at spelled out. */
function level(overrides: Partial<DunningLevel> = {}): DunningLevel {
  return {
    id: 1,
    levelNo: 1,
    dunningTypeId: 7,
    dunningTypeName: 'Zahlungserinnerung',
    daysAfterDue: 10,
    paymentDays: 10,
    minDaysSincePrevious: 0,
    feeAmount: 0,
    active: true,
    ...overrides,
  }
}

/** The four shipped levels, as the backend creates them on first use. */
function shipped(): DunningLevel[] {
  return [
    level({ id: 1, levelNo: 1, daysAfterDue: 10, minDaysSincePrevious: 0 }),
    level({ id: 2, levelNo: 2, daysAfterDue: 20, minDaysSincePrevious: 10 }),
    level({ id: 3, levelNo: 3, daysAfterDue: 30, minDaysSincePrevious: 10 }),
    level({ id: 4, levelNo: 4, daysAfterDue: 45, minDaysSincePrevious: 10 }),
  ]
}

describe('isHighestLevel', () => {
  it('isHighestLevelTest', () => {
    const levels = shipped()

    expect(isHighestLevel(levels, levels[3])).toBe(true)
  })

  it('isHighestLevelOfAMiddleLevelTest', () => {
    const levels = shipped()

    expect(isHighestLevel(levels, levels[1])).toBe(false)
  })

  /** The only level is also the highest, so it may go. */
  it('isHighestLevelOfTheOnlyLevelTest', () => {
    const only = level()

    expect(isHighestLevel([only], only)).toBe(true)
  })

  /** A switched off level still holds its position, so it still blocks the one below. */
  it('isHighestLevelWithASwitchedOffTopTest', () => {
    const levels = shipped()
    levels[3] = { ...levels[3], active: false }

    expect(isHighestLevel(levels, levels[2])).toBe(false)
  })
})

describe('activeLevelCount', () => {
  it('activeLevelCountTest', () => {
    expect(activeLevelCount(shipped())).toBe(4)
  })

  it('activeLevelCountWithSwitchedOffLevelsTest', () => {
    const levels = shipped()
    levels[3] = { ...levels[3], active: false }

    expect(activeLevelCount(levels)).toBe(3)
  })

  it('activeLevelCountOfNothingTest', () => {
    expect(activeLevelCount([])).toBe(0)
  })
})

describe('escalationProblem', () => {
  it('escalationProblemOfTheShippedSequenceTest', () => {
    expect(escalationProblem(shipped())).toBeNull()
  })

  it('escalationProblemOfASingleLevelTest', () => {
    expect(escalationProblem([level()])).toBeNull()
  })

  it('escalationProblemOfNothingTest', () => {
    expect(escalationProblem([])).toBeNull()
  })

  it('escalationProblemWithAnEarlierDeadlineTest', () => {
    const levels = [level({ id: 1, levelNo: 1, daysAfterDue: 20 }),
      level({ id: 2, levelNo: 2, daysAfterDue: 10 })]

    expect(escalationProblem(levels)).toContain('Stufe 2')
  })

  /** The same day twice is allowed; only going backwards is not. */
  it('escalationProblemWithEqualDeadlinesTest', () => {
    const levels = [level({ id: 1, levelNo: 1, daysAfterDue: 20 }),
      level({ id: 2, levelNo: 2, daysAfterDue: 20 })]

    expect(escalationProblem(levels)).toBeNull()
  })

  it('escalationProblemWithASmallerFeeTest', () => {
    const levels = [level({ id: 1, levelNo: 1, feeAmount: 20 }),
      level({ id: 2, levelNo: 2, daysAfterDue: 20, feeAmount: 10 })]

    expect(escalationProblem(levels)).toContain('Gebühr')
  })

  it('escalationProblemWithALongerPaymentPeriodTest', () => {
    const levels = [level({ id: 1, levelNo: 1, paymentDays: 10 }),
      level({ id: 2, levelNo: 2, daysAfterDue: 20, paymentDays: 20 })]

    expect(escalationProblem(levels)).toContain('Zahlfrist')
  })

  /** A switched off level is not part of the escalation and must not block a fix. */
  it('escalationProblemIgnoresSwitchedOffLevelsTest', () => {
    const levels = [
      level({ id: 1, levelNo: 1, daysAfterDue: 10 }),
      level({ id: 2, levelNo: 2, daysAfterDue: 5, paymentDays: 30, active: false }),
      level({ id: 3, levelNo: 3, daysAfterDue: 30 }),
    ]

    expect(escalationProblem(levels)).toBeNull()
  })

  /** The order is judged by position, whatever order the list arrives in. */
  it('escalationProblemSortsFirstTest', () => {
    const levels = [
      level({ id: 3, levelNo: 3, daysAfterDue: 30 }),
      level({ id: 1, levelNo: 1, daysAfterDue: 10 }),
      level({ id: 2, levelNo: 2, daysAfterDue: 20 }),
    ]

    expect(escalationProblem(levels)).toBeNull()
  })
})

describe('the catalogues', () => {
  it('everyGroupingHasALabelAndAHintTest', () => {
    const codes: DunningGrouping[] = ['PER_INVOICE', 'PER_PARTNER']

    for (const code of codes) {
      expect(DUNNING_GROUPINGS[code]).toBeTruthy()
      expect(DUNNING_GROUPING_HINTS[code]).toBeTruthy()
    }
  })

  it('everyFeeCatalogueIsCompleteTest', () => {
    expect(Object.keys(FEE_BOOKINGS)).toHaveLength(2)
    expect(Object.keys(FEE_VAT_MODES)).toHaveLength(3)
  })

  /** Four rights, and `run` among them although no screen uses it yet. */
  it('theFourRightsTest', () => {
    expect(Object.values(DUNNING_RIGHTS)).toEqual([
      'DUNNING_READ',
      'DUNNING_WRITE',
      'DUNNING_CONFIGURE',
      'DUNNING_RUN',
    ])
  })
})

describe('insertPlaceholder', () => {
  it('insertPlaceholderTest', () => {
    const result = insertPlaceholder('Guten Tag ', 'kunde', 10, 10)

    expect(result.text).toBe('Guten Tag {{kunde}}')
    expect(result.cursor).toBe(19)
  })

  /** At the cursor, not at the end: a placeholder belongs inside the sentence. */
  it('insertPlaceholderInTheMiddleTest', () => {
    const result = insertPlaceholder('Guten Tag , wie geht es?', 'kunde', 10, 10)

    expect(result.text).toBe('Guten Tag {{kunde}}, wie geht es?')
  })

  it('insertPlaceholderReplacesTheSelectionTest', () => {
    const result = insertPlaceholder('Guten Tag NAME', 'kunde', 10, 14)

    expect(result.text).toBe('Guten Tag {{kunde}}')
  })

  it('insertPlaceholderIntoAnEmptyFieldTest', () => {
    expect(insertPlaceholder('', 'kunde', 0, 0).text).toBe('{{kunde}}')
  })

  /** A stale cursor from a field that shrank must not throw or lose text. */
  it('insertPlaceholderWithAnOutOfRangeCursorTest', () => {
    const result = insertPlaceholder('kurz', 'kunde', 99, 120)

    expect(result.text).toBe('kurz{{kunde}}')
  })

  it('insertPlaceholderWithAnInvertedSelectionTest', () => {
    const result = insertPlaceholder('Guten Tag', 'kunde', 5, 2)

    expect(result.text).toBe('Guten{{kunde}} Tag')
  })
})

describe('singleInvoiceTokensIn', () => {
  const catalogue: DunningPlaceholder[] = [
    { token: 'kunde', availableWhenCollective: true },
    { token: 'gesamtoffenerbetrag', availableWhenCollective: true },
    { token: 'rechnungsnummer', availableWhenCollective: false },
    { token: 'offenerbetrag', availableWhenCollective: false },
  ]

  it('singleInvoiceTokensInTest', () => {
    const used = singleInvoiceTokensIn(
      ['Ihre Rechnung {{rechnungsnummer}}', 'Offen {{offenerbetrag}}'],
      catalogue,
    )

    expect(used.sort()).toEqual(['offenerbetrag', 'rechnungsnummer'])
  })

  /** A text that only uses the always-available ones survives a collective letter. */
  it('singleInvoiceTokensInACollectiveSafeTextTest', () => {
    expect(singleInvoiceTokensIn(['{{kunde}} schuldet {{gesamtoffenerbetrag}}'], catalogue))
      .toEqual([])
  })

  it('singleInvoiceTokensInNothingTest', () => {
    expect(singleInvoiceTokensIn([], catalogue)).toEqual([])
    expect(singleInvoiceTokensIn([undefined, ''], catalogue)).toEqual([])
  })

  it('singleInvoiceTokensInNamesEachOnceTest', () => {
    const used = singleInvoiceTokensIn(
      ['{{rechnungsnummer}}', '{{rechnungsnummer}} noch einmal'],
      catalogue,
    )

    expect(used).toEqual(['rechnungsnummer'])
  })

  it('singleInvoiceTokensInIgnoresAnUnknownOneTest', () => {
    expect(singleInvoiceTokensIn(['{{quatsch}}'], catalogue)).toEqual([])
  })

  /** Spaces inside the braces are how the backend reads them too. */
  it('singleInvoiceTokensInWithSpacingTest', () => {
    expect(singleInvoiceTokensIn(['{{  rechnungsnummer  }}'], catalogue))
      .toEqual(['rechnungsnummer'])
  })
})
