import { describe, expect, it } from 'vitest'
import type { AccountType, FiscalYear, PriorYearLine } from '../../lib/types'
import {
  emptyPriorYearRow,
  filledPriorYearRowsOf,
  followingYearOf,
  offersPriorYearCapture,
  priorYearBalanceOf,
  priorYearBlockerOf,
  priorYearCandidateOf,
  priorYearCaptureLabelOf,
  priorYearFormOf,
  priorYearRequestOf,
  priorYearResultOf,
  yearBeforeOf,
  type PriorYearForm,
} from './priorYearForm'

/**
 * Eight captured lines, as the backend answers them: 452'125.75 on either side, and a profit of
 * 15'470.55 on the income accounts — which is also what the balance sheet accounts leave over.
 */
const CAPTURED: PriorYearLine[] = [
  { accountId: 1, accountNumber: '1020', accountName: 'Bankguthaben', debit: 48210.55, credit: 0 },
  { accountId: 3, accountNumber: '1100', accountName: 'Forderungen', debit: 127400, credit: 0 },
  { accountId: 5, accountNumber: '2000', accountName: 'Verbindlichkeiten', debit: 0, credit: 41900 },
  { accountId: 8, accountNumber: '2800', accountName: 'Grundkapital', debit: 0, credit: 100000 },
  { accountId: 9, accountNumber: '2970', accountName: 'Gewinnvortrag', debit: 0, credit: 18240 },
  { accountId: 12, accountNumber: '3200', accountName: 'Handelserlöse', debit: 0, credit: 291985.75 },
  { accountId: 14, accountNumber: '4200', accountName: 'Handelswarenaufwand', debit: 238115.2, credit: 0 },
  { accountId: 16, accountNumber: '6000', accountName: 'Raumaufwand', debit: 38400, credit: 0 },
]

/** What type each of those accounts has, the way the chart answers. */
const TYPES: Record<number, AccountType> = {
  1: 'ASSET',
  3: 'ASSET',
  5: 'LIABILITY',
  8: 'EQUITY',
  9: 'EQUITY',
  12: 'REVENUE',
  14: 'EXPENSE',
  16: 'EXPENSE',
}

const typeOf = (accountId: number) => TYPES[accountId]

function year(over: Partial<FiscalYear>): FiscalYear {
  return {
    id: 3,
    label: '2026',
    numberYear: 2026,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    status: 'OPEN',
    deletable: false,
    editable: false,
    spansAFullCalendarYear: true,
    postedEntries: 0,
    postedEntriesBesidesOpening: 0,
    ...over,
  }
}

/** The changeover year: its opening entry and eleven postings beside it. */
function changeoverYear(): FiscalYear {
  return year({ id: 3, postedEntries: 12, postedEntriesBesidesOpening: 11 })
}

describe('priorYearFormOf', () => {
  /** The captured lines, editable, with one empty row after them. */
  it('priorYearFormOfTest', () => {
    const form = priorYearFormOf(CAPTURED)

    expect(form.rows).toHaveLength(9)
    expect(form.rows[0]).toEqual({
      accountId: 1,
      accountNumber: '1020',
      accountName: 'Bankguthaben',
      debit: '48210.55',
      credit: null,
    })
    expect(form.rows[2].debit).toBeNull()
    expect(form.rows[2].credit).toBe('41900.00')
    expect(form.rows[8].accountId).toBeNull()
  })

  /** Nothing captured is not an error: the grid opens with its one empty row. */
  it('priorYearFormOfWithoutCapturedLinesTest', () => {
    expect(priorYearFormOf([]).rows).toEqual([emptyPriorYearRow()])
  })

  /** A pre-filled grid is balanced by construction — the backend refused anything else. */
  it('priorYearFormOfIsBalancedTest', () => {
    const form = priorYearFormOf(CAPTURED)

    expect(priorYearBalanceOf(form)).toEqual({
      debit: 452125.75,
      credit: 452125.75,
      difference: 0,
    })
    expect(priorYearBlockerOf(form)).toBeUndefined()
  })
})

describe('priorYearBalanceOf', () => {
  /** The ordinary case: three typed rows that meet, and the trailing empty row ignored. */
  it('priorYearBalanceOfTest', () => {
    const form = grid([
      ['1020', '1250.00', null],
      ['2000', null, '250.00'],
      ['2800', null, '1000.00'],
      [null, null, null],
    ])

    expect(priorYearBalanceOf(form)).toEqual({ debit: 1250, credit: 1250, difference: 0 })
  })

  /** Two sides that do not meet, with the difference signed as debit minus credit. */
  it('priorYearBalanceOfWithADifferenceTest', () => {
    const form = grid([['1020', '1250.00', null], ['2800', null, '1250.05']])

    expect(priorYearBalanceOf(form)).toEqual({ debit: 1250, credit: 1250.05, difference: -0.05 })
  })

  /** An amount without an account is not counted — it never reaches the payload either. */
  it('priorYearBalanceOfIgnoresARowWithoutAnAccountTest', () => {
    const form = grid([
      ['1100', '10000.00', null],
      ['2000', null, '4000.00'],
      [null, null, '6000.00'],
    ])

    expect(priorYearBalanceOf(form)).toEqual({ debit: 10000, credit: 4000, difference: 6000 })
  })

  /** A half typed amount counts as nothing until it is a number. */
  it('priorYearBalanceOfWithAHalfTypedAmountTest', () => {
    const form = grid([['1020', '1’250.50', null], ['2800', null, 'abc']])

    expect(priorYearBalanceOf(form)).toEqual({ debit: 1250.5, credit: 0, difference: 1250.5 })
  })

  /** An empty grid adds up to nothing on both sides. */
  it('priorYearBalanceOfWithAnEmptyGridTest', () => {
    expect(priorYearBalanceOf({ rows: [emptyPriorYearRow()] })).toEqual({
      debit: 0,
      credit: 0,
      difference: 0,
    })
  })
})

describe('priorYearBlockerOf', () => {
  /** A balanced grid over two accounts may be saved. */
  it('priorYearBlockerOfTest', () => {
    const form = grid([['1020', '420.00', null], ['2800', null, '420.00']])

    expect(priorYearBlockerOf(form)).toBeUndefined()
  })

  /** Unbalanced: the sentence names the two sides. */
  it('priorYearBlockerOfWithADifferenceTest', () => {
    const form = grid([['1020', '420.00', null], ['2800', null, '400.00']])

    expect(priorYearBlockerOf(form)).toMatch(/stimmen noch nicht überein/)
  })

  /** One row alone is not a set of balances. */
  it('priorYearBlockerOfWithOneLineTest', () => {
    const form = grid([['1020', '420.00', null], [null, null, null]])

    expect(priorYearBlockerOf(form)).toMatch(/mindestens zwei Zeilen/)
  })

  /** Two rows on the same account book nothing. */
  it('priorYearBlockerOfWithTheSameAccountTwiceTest', () => {
    const form = grid([['1020', '420.00', null], ['1020', null, '420.00']])

    expect(priorYearBlockerOf(form)).toMatch(/demselben Konto/)
  })

  /** An account without an amount is not a line: the grid is one line short. */
  it('priorYearBlockerOfWithAnAccountWithoutAnAmountTest', () => {
    const form = grid([['1020', '420.00', null], ['2800', null, null]])

    expect(priorYearBlockerOf(form)).toMatch(/mindestens zwei Zeilen/)
  })

  /** An amount without an account is named outright, once the two sides do meet. */
  it('priorYearBlockerOfWithAnAmountWithoutAnAccountTest', () => {
    const form = grid([
      ['1020', '420.00', null],
      ['2800', null, '420.00'],
      [null, '500.00', null],
    ])

    expect(priorYearBlockerOf(form)).toMatch(/Betrag, aber kein Konto/)
  })

  /** Exactly zero, reached through amounts that would fail on a floating point tail. */
  it('priorYearBlockerOfWithExactlyZeroTest', () => {
    const form = grid([
      ['1020', '0.10', null],
      ['1100', '0.20', null],
      ['2800', null, '0.30'],
    ])

    expect(priorYearBalanceOf(form).difference).toBe(0)
    expect(priorYearBlockerOf(form)).toBeUndefined()
  })
})

describe('priorYearResultOf', () => {
  /** Revenue 291'985.75 against expense 276'515.20 is a profit of 15'470.55. */
  it('priorYearResultOfTest', () => {
    const form = priorYearFormOf(CAPTURED)

    expect(priorYearResultOf(form, typeOf)).toEqual({ result: 15470.55, hasIncomeRows: true })
  })

  /** Expense above revenue is a loss, signed negative. */
  it('priorYearResultOfWithALossTest', () => {
    const form = grid([
      ['3200', null, '1000.00'],
      ['4200', '1500.00', null],
      ['2800', '500.00', null],
    ])

    expect(priorYearResultOf(form, typeOf)).toEqual({ result: -500, hasIncomeRows: true })
    // With the equity row read as an expense too, the loss grows by that row.
    expect(priorYearResultOf(form, (id) => (id === 12 ? 'REVENUE' : 'EXPENSE'))).toEqual({
      result: -1000,
      hasIncomeRows: true,
    })
  })

  /** Only balance sheet accounts: no result, and the screen has to say so. */
  it('priorYearResultOfWithoutIncomeRowsTest', () => {
    const form = grid([['1020', '420.00', null], ['2800', null, '420.00']])

    expect(priorYearResultOf(form, typeOf)).toEqual({ result: 0, hasIncomeRows: false })
  })

  /** A chart that has not answered yet: every account counts as a balance account. */
  it('priorYearResultOfWithoutTheChartTest', () => {
    const form = priorYearFormOf(CAPTURED)

    expect(priorYearResultOf(form, () => undefined)).toEqual({ result: 0, hasIncomeRows: false })
  })
})

describe('priorYearRequestOf', () => {
  /** The trailing empty row falls away, the tax code is always null, no date and no year. */
  it('priorYearRequestOfTest', () => {
    const form = grid([
      ['1020', '420.00', null],
      ['2800', null, '420.00'],
      [null, null, null],
    ])

    const request = priorYearRequestOf(form, false, '')

    expect(request).toEqual({
      replaceExisting: false,
      reason: null,
      lines: [
        { accountId: 1, debit: 420, credit: null, taxCodeId: null },
        { accountId: 8, debit: null, credit: 420, taxCodeId: null },
      ],
    })
    expect(request).not.toHaveProperty('bookingDate')
    expect(request).not.toHaveProperty('fiscalYearId')
  })

  /** A replacement carries its reason; without one the reason is not sent at all. */
  it('priorYearRequestOfWithAReplacementTest', () => {
    const form = grid([['1020', '420.00', null], ['2800', null, '420.00']])

    expect(priorYearRequestOf(form, true, 'Zahlendreher').reason).toBe('Zahlendreher')
    expect(priorYearRequestOf(form, false, 'Zahlendreher').reason).toBeNull()
  })

  /** The tax code stays null even on a row of the captured grid that came back from the server. */
  it('priorYearRequestOfNeverCarriesATaxCodeTest', () => {
    const request = priorYearRequestOf(priorYearFormOf(CAPTURED), true, 'neu')

    expect(request.lines).toHaveLength(8)
    expect(request.lines.every((line) => line.taxCodeId === null)).toBe(true)
  })

  /** An empty grid sends no lines — the server answers that, not the screen. */
  it('priorYearRequestOfWithAnEmptyGridTest', () => {
    expect(priorYearRequestOf({ rows: [emptyPriorYearRow()] }, false, '').lines).toEqual([])
  })
})

describe('priorYearCandidateOf', () => {
  /** Without a name, the earliest year — whatever order the list came in. */
  it('priorYearCandidateOfTest', () => {
    const years = [
      year({ id: 4, label: '2027', startDate: '2027-01-01', endDate: '2027-12-31' }),
      year({ id: 2, label: '2025', startDate: '2025-01-01', endDate: '2025-12-31' }),
      year({ id: 3 }),
    ]

    expect(priorYearCandidateOf(years, null)?.id).toBe(2)
  })

  /** A named year wins over the earliest. */
  it('priorYearCandidateOfWithANamedYearTest', () => {
    const years = [year({ id: 2, startDate: '2025-01-01', endDate: '2025-12-31' }), year({ id: 3 })]

    expect(priorYearCandidateOf(years, 3)?.id).toBe(3)
  })

  /** A name that matches nothing falls back to the earliest rather than to nothing. */
  it('priorYearCandidateOfWithAnUnknownNameTest', () => {
    expect(priorYearCandidateOf([year({ id: 3 })], 99)?.id).toBe(3)
  })

  /** No years, no candidate. */
  it('priorYearCandidateOfWithoutYearsTest', () => {
    expect(priorYearCandidateOf([], null)).toBeUndefined()
  })
})

describe('yearBeforeOf', () => {
  /** Twelve months ending the day before the earliest year begins. */
  it('yearBeforeOfTest', () => {
    const years = [year({ id: 3 }), year({ id: 4, startDate: '2027-01-01', endDate: '2027-12-31' })]

    expect(yearBeforeOf(years)).toEqual({ startDate: '2025-01-01', endDate: '2025-12-31' })
  })

  /** A split year: the year before runs from April to March as well. */
  it('yearBeforeOfWithASplitYearTest', () => {
    const years = [year({ startDate: '2026-04-01', endDate: '2027-03-31' })]

    expect(yearBeforeOf(years)).toEqual({ startDate: '2025-04-01', endDate: '2026-03-31' })
  })

  /** A year that begins on a leap day: the day a year earlier does not exist and moves on. */
  it('yearBeforeOfWithALeapDayTest', () => {
    const years = [year({ startDate: '2028-02-29', endDate: '2029-02-27' })]

    expect(yearBeforeOf(years)).toEqual({ startDate: '2027-03-01', endDate: '2028-02-28' })
  })

  /** Without years there is nothing to stand before. */
  it('yearBeforeOfWithoutYearsTest', () => {
    expect(yearBeforeOf([])).toBeUndefined()
  })
})

describe('followingYearOf', () => {
  /** The year that begins the day after this one ends. */
  it('followingYearOfTest', () => {
    const captured = year({ id: 2, label: '2025', startDate: '2025-01-01', endDate: '2025-12-31' })
    const years = [captured, year({ id: 3 })]

    expect(followingYearOf(years, captured)?.id).toBe(3)
  })

  /** A year behind a gap is not the following one. */
  it('followingYearOfWithAGapTest', () => {
    const captured = year({ id: 2, label: '2025', startDate: '2025-01-01', endDate: '2025-12-31' })
    const years = [captured, year({ id: 4, startDate: '2027-01-01', endDate: '2027-12-31' })]

    expect(followingYearOf(years, captured)).toBeUndefined()
  })

  /** The last year has none. */
  it('followingYearOfWithoutALaterYearTest', () => {
    const only = year({})

    expect(followingYearOf([only], only)).toBeUndefined()
  })
})

describe('filledPriorYearRowsOf', () => {
  /** Rows with an account and an amount, and nothing else. */
  it('filledPriorYearRowsOfTest', () => {
    const form = grid([
      ['1020', '420.00', null],
      ['2800', null, null],
      [null, '5.00', null],
      [null, null, null],
    ])

    expect(filledPriorYearRowsOf(form).map((row) => row.accountNumber)).toEqual(['1020'])
  })
})

/**
 * A grid out of `[accountNumber, debit, credit]` triples. The account id is looked up in the
 * captured lines above; `null` as the number is a row nobody picked an account for.
 */
function grid(rows: [string | null, string | null, string | null][]): PriorYearForm {
  return {
    rows: rows.map(([accountNumber, debit, credit]) => {
      const known = CAPTURED.find((line) => line.accountNumber === accountNumber)
      return {
        accountId: accountNumber === null ? null : (known?.accountId ?? 99),
        accountNumber: accountNumber ?? '',
        accountName: known?.accountName ?? '',
        debit,
        credit,
      }
    }),
  }
}

describe('offersPriorYearCapture', () => {
  /** The ordinary changeover: an empty 2025 before a 2026 that carries postings. */
  it('offersPriorYearCaptureTest', () => {
    const before = year({ id: 2, label: '2025', startDate: '2025-01-01', endDate: '2025-12-31' })
    const years = [before, changeoverYear()]

    expect(offersPriorYearCapture(before, years)).toBe(true)
  })

  /** The changeover year itself carries postings and gets no button. */
  it('offersPriorYearCaptureOnThePostedYearTest', () => {
    const posted = changeoverYear()
    const years = [year({ id: 2, startDate: '2025-01-01', endDate: '2025-12-31' }), posted]

    expect(offersPriorYearCapture(posted, years)).toBe(false)
  })

  /** The captured balances are the opening entry of the year and do not cost it the way in. */
  it('offersPriorYearCaptureOnACapturedYearTest', () => {
    const captured = year({
      id: 2,
      startDate: '2025-01-01',
      endDate: '2025-12-31',
      postedEntries: 1,
      postedEntriesBesidesOpening: 0,
    })

    expect(offersPriorYearCapture(captured, [captured, changeoverYear()])).toBe(true)
  })

  /**
   * After a replacement the year carries three posted `OPENING` rows — the reversed opening,
   * its counter entry and the new one — and none of them is «other».
   */
  it('offersPriorYearCaptureAfterAReplacementTest', () => {
    const replaced = year({
      id: 2,
      startDate: '2025-01-01',
      endDate: '2025-12-31',
      postedEntries: 3,
      postedEntriesBesidesOpening: 0,
    })

    expect(offersPriorYearCapture(replaced, [replaced, changeoverYear()])).toBe(true)
  })

  /** One posting besides the opening is enough: the backend refuses the capture on that count. */
  it('offersPriorYearCaptureWithOneOtherPostingTest', () => {
    const posted = year({
      id: 2,
      startDate: '2025-01-01',
      endDate: '2025-12-31',
      postedEntries: 2,
      postedEntriesBesidesOpening: 1,
    })

    expect(offersPriorYearCapture(posted, [posted, changeoverYear()])).toBe(false)
  })

  /** Fourteen postings of its own and no opening entry: no way in either. */
  it('offersPriorYearCaptureWithOtherPostingsTest', () => {
    const posted = year({
      id: 2,
      startDate: '2025-01-01',
      endDate: '2025-12-31',
      postedEntries: 14,
      postedEntriesBesidesOpening: 14,
    })

    expect(offersPriorYearCapture(posted, [posted, changeoverYear()])).toBe(false)
  })

  /** Two empty years in a row: nobody has changed over yet, and the wizard is the way. */
  it('offersPriorYearCaptureWithoutAPostedLaterYearTest', () => {
    const before = year({ id: 2, startDate: '2025-01-01', endDate: '2025-12-31' })

    expect(offersPriorYearCapture(before, [before, year({ id: 3 })])).toBe(false)
  })

  /** A posted year that lies before, not after, is no changeover year. */
  it('offersPriorYearCaptureWithAnEarlierPostedYearTest', () => {
    const empty = year({ id: 3 })
    const earlier = year({
      id: 2,
      startDate: '2025-01-01',
      endDate: '2025-12-31',
      postedEntries: 40,
      postedEntriesBesidesOpening: 39,
    })

    expect(offersPriorYearCapture(empty, [earlier, empty])).toBe(false)
  })

  /** A closed year takes no posting, so it takes no capture either. */
  it('offersPriorYearCaptureOnAClosedYearTest', () => {
    const closed = year({
      id: 2,
      startDate: '2025-01-01',
      endDate: '2025-12-31',
      status: 'CLOSED',
    })

    expect(offersPriorYearCapture(closed, [closed, changeoverYear()])).toBe(false)
  })

  /** A closed year that carries its captured balances: closed is closed, there is no «ersetzen» on it. */
  it('offersPriorYearCaptureOnAClosedCapturedYearTest', () => {
    const closed = year({
      id: 2,
      startDate: '2025-01-01',
      endDate: '2025-12-31',
      status: 'CLOSED',
      postedEntries: 1,
      postedEntriesBesidesOpening: 0,
    })

    expect(offersPriorYearCapture(closed, [closed, changeoverYear()])).toBe(false)
  })

  /** The only year has nothing after it. */
  it('offersPriorYearCaptureWithOneYearTest', () => {
    const only = year({})

    expect(offersPriorYearCapture(only, [only])).toBe(false)
  })
})

describe('priorYearCaptureLabelOf', () => {
  /** Nothing posted: the way is called «erfassen». */
  it('priorYearCaptureLabelOfTest', () => {
    expect(priorYearCaptureLabelOf(year({ id: 2 }))).toBe('Vorjahressaldi erfassen')
  })

  /** The captured balances stand — one posted entry, none besides the opening — and the way says so. */
  it('priorYearCaptureLabelOfOnACapturedYearTest', () => {
    const captured = year({ id: 2, postedEntries: 1, postedEntriesBesidesOpening: 0 })

    expect(priorYearCaptureLabelOf(captured)).toBe('Vorjahressaldi ersetzen')
  })

  /** After a replacement three `OPENING` rows stand, and the new one among them is the opening. */
  it('priorYearCaptureLabelOfAfterAReplacementTest', () => {
    const replaced = year({ id: 2, postedEntries: 3, postedEntriesBesidesOpening: 0 })

    expect(priorYearCaptureLabelOf(replaced)).toBe('Vorjahressaldi ersetzen')
  })

  /** Postings without an opening entry are no opening entry: the word stays «erfassen». */
  it('priorYearCaptureLabelOfWithOtherPostingsOnlyTest', () => {
    const posted = year({ id: 2, postedEntries: 14, postedEntriesBesidesOpening: 14 })

    expect(priorYearCaptureLabelOf(posted)).toBe('Vorjahressaldi erfassen')
  })

  /**
   * The changeover year: an opening among its postings, so the word is «ersetzen». The word
   * alone — whether the way stands on the row at all is `offersPriorYearCapture`, which says no.
   */
  it('priorYearCaptureLabelOfOnTheChangeoverYearTest', () => {
    expect(priorYearCaptureLabelOf(changeoverYear())).toBe('Vorjahressaldi ersetzen')
  })
})
