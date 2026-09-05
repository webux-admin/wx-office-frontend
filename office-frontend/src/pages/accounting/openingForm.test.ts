import { describe, expect, it } from 'vitest'
import type { OpenItemTotal, SuggestedLine } from '../../lib/types'
import {
  emptyRow,
  filledRowsOf,
  openingBalanceOf,
  openingBlockerOf,
  openingFormOf,
  openingRequestOf,
  shownForm,
  type OpeningForm,
} from './openingForm'

const SUGGESTION: SuggestedLine[] = [
  { accountId: 1, accountNumber: '1000', accountName: 'Kasse', fromOpenItems: false },
  { accountId: 3, accountNumber: '1100', accountName: 'Debitoren', fromOpenItems: true },
  { accountId: 8, accountNumber: '2800', accountName: 'Kapital', fromOpenItems: false },
]

describe('openingFormOf', () => {
  /** The proposed rows, plus one empty one to type into. */
  it('openingFormOfTest', () => {
    const form = openingFormOf(SUGGESTION)

    expect(form.rows).toHaveLength(4)
    expect(form.rows[0].accountNumber).toBe('1000')
    expect(form.rows[0].debit).toBeNull()
    expect(form.rows[3].accountId).toBeNull()
  })

  /** Nothing proposed is not an error: the grid opens with its one empty row. */
  it('openingFormOfWithoutASuggestionTest', () => {
    expect(openingFormOf([]).rows).toHaveLength(1)
  })
})

describe('openingBalanceOf', () => {
  /** The ordinary case: two sides that meet. */
  it('openingDifferenceTest', () => {
    const form = grid([['1000', '420.00', null], ['2800', null, '420.00']])

    expect(openingBalanceOf(form)).toEqual({ debit: 420, credit: 420, difference: 0 })
  })

  /**
   * <b>The difference counts exactly the rows the payload carries.</b> An amount typed into the
   * trailing row before an account was picked is dropped by `openingRequestOf`; counting it here
   * would show «Differenz 0.00» over a grid that goes out unbalanced.
   */
  it('openingDifferenceIgnoresARowWithoutAnAccountTest', () => {
    const form = grid([
      ['1100', '10000.00', null],
      ['2000', null, '4000.00'],
      [null, null, '6000.00'],
    ])

    expect(openingBalanceOf(form)).toEqual({ debit: 10000, credit: 4000, difference: 6000 })
    // And the button stays shut, with the sentence that names what is wrong.
    expect(openingBlockerOf(form)).toMatch(/stimmen noch nicht überein/)
  })

  /** An amount without an account is named outright, once the two sides do meet. */
  it('openingRefusesAnAmountWithoutAnAccountTest', () => {
    const form = grid([
      ['1100', '10000.00', null],
      ['2000', null, '10000.00'],
      [null, '500.00', null],
    ])

    expect(openingBalanceOf(form).difference).toBe(0)
    expect(openingBlockerOf(form)).toMatch(/kein Konto/)
  })

  /** A half typed amount counts as nothing rather than breaking the sum. */
  it('openingDifferenceWithAHalfTypedAmountTest', () => {
    const form = grid([['1000', '38’110.55', null], ['2800', null, '.'], ['2970', null, '10']])

    expect(openingBalanceOf(form).debit).toBe(38110.55)
    expect(openingBalanceOf(form).credit).toBe(10)
  })
})

describe('openingBlockerOf', () => {
  /** Saving is blocked until the two sides meet — the rule the database enforces as well. */
  it('openingBlocksSaveOnDifferenceTest', () => {
    const form = grid([['1000', '420.00', null], ['2800', null, '400.00']])

    expect(openingBlockerOf(form)).toMatch(/stimmen noch nicht überein/)
    expect(openingBlockerOf(grid([['1000', '420.00', null], ['2800', null, '420.00']])))
      .toBeUndefined()
  })

  /** One line books nothing, and two lines on one account book nothing either. */
  it('openingRefusesOneLineTest', () => {
    expect(openingBlockerOf(grid([['1000', '420.00', null]]))).toMatch(/mindestens zwei Zeilen/)
    expect(openingBlockerOf(grid([['1000', '420.00', null], ['1000', null, '420.00']])))
      .toMatch(/demselben Konto/)
  })
})

describe('shownForm', () => {
  /**
   * <b>The receivables row is filled from the open items and says so.</b> The figure is today's
   * and not the one of the changeover day, which is why it is called a proposal.
   */
  it('openingPrefillsTheReceivableRowTest', () => {
    const shown = shownForm(openingFormOf(SUGGESTION), SUGGESTION, totals(), 'CHF')

    const receivable = shown.rows.find((row) => row.accountNumber === '1100')
    expect(receivable?.debit).toBe('127400.00')
    expect(receivable?.proposed).toBe(true)
    // And exactly that one row: the others are typed off the transfer balance sheet.
    expect(shown.rows.filter((row) => row.proposed)).toHaveLength(1)
  })

  /** The mark goes the moment somebody types into the row — even to empty it. */
  it('openingPrefillLosesTheMarkOnTheFirstKeystrokeTest', () => {
    const typed: OpeningForm = {
      rows: openingFormOf(SUGGESTION).rows.map((row) =>
        row.accountNumber === '1100' ? { ...row, debit: '130000.00' } : row,
      ),
    }

    const shown = shownForm(typed, SUGGESTION, totals(), 'CHF')

    const receivable = shown.rows.find((row) => row.accountNumber === '1100')
    expect(receivable?.debit).toBe('130000.00')
    expect(receivable?.proposed).toBe(false)
  })

  /** Only the ledger currency is filled in: an opening entry is kept in francs. */
  it('openingPrefillsOnlyTheLedgerCurrencyTest', () => {
    const shown = shownForm(
      openingFormOf(SUGGESTION),
      SUGGESTION,
      [{ currencyCode: 'EUR', openTotal: 900, count: 2 }],
      'CHF',
    )

    expect(shown.rows.every((row) => row.debit === null)).toBe(true)
  })

  /** Without a receivables account nothing happens at all — and that is not an error. */
  it('openingPrefillsNothingWithoutTheReceivableAccountTest', () => {
    const without = SUGGESTION.filter((line) => !line.fromOpenItems)

    const shown = shownForm(openingFormOf(without), without, totals(), 'CHF')

    expect(shown.rows.some((row) => row.proposed)).toBe(false)
  })

  /** Without the right to read invoices there is no figure, and the grid stays empty. */
  it('openingPrefillsNothingWithoutTotalsTest', () => {
    const shown = shownForm(openingFormOf(SUGGESTION), SUGGESTION, [], 'CHF')

    expect(shown.rows.some((row) => row.proposed)).toBe(false)
  })
})

describe('openingRequestOf', () => {
  /** No booking date, no tax code, and the empty row left out. */
  it('openingRequestOfTest', () => {
    const form = grid([['1000', '420.00', null], ['2800', null, '420.00'], [null, null, null]])

    const request = openingRequestOf(form, 7, false, '')

    expect(request).toEqual({
      fiscalYearId: 7,
      replaceExisting: false,
      reason: null,
      lines: [
        { accountId: 1000, debit: 420, credit: null, taxCodeId: null },
        { accountId: 2800, debit: null, credit: 420, taxCodeId: null },
      ],
    })
  })

  /** A replacement carries its reason; without «ersetzen» the field stays empty. */
  it('openingRequestOfWithAReplacementTest', () => {
    const form = grid([['1000', '420.00', null], ['2800', null, '420.00']])

    expect(openingRequestOf(form, 7, true, 'Treuhänder hat korrigiert').reason)
      .toBe('Treuhänder hat korrigiert')
  })
})

describe('filledRowsOf and emptyRow', () => {
  it('filledRowsOfTest', () => {
    const form = grid([['1000', '420.00', null], [null, null, null], ['2800', null, null]])

    expect(filledRowsOf(form)).toHaveLength(1)
  })

  it('emptyRowTest', () => {
    expect(emptyRow()).toEqual({
      accountId: null,
      accountNumber: '',
      accountName: '',
      debit: null,
      credit: null,
      proposed: false,
    })
  })
})

function totals(): OpenItemTotal[] {
  return [{ currencyCode: 'CHF', openTotal: 127400, count: 34 }]
}

/** A grid built from triples of account number, debit and credit. */
function grid(rows: readonly [string | null, string | null, string | null][]): OpeningForm {
  return {
    rows: rows.map(([number, debit, credit]) => ({
      accountId: number === null ? null : Number(number),
      accountNumber: number ?? '',
      accountName: number === null ? '' : `Konto ${number}`,
      debit,
      credit,
      proposed: false,
    })),
  }
}
