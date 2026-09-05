import { parseDecimal } from '../../lib/format'
import type { OpenItemTotal, SuggestedLine } from '../../lib/types'

/**
 * The opening grid as a piece of state, with the checks it can make itself.
 *
 * <p>Nothing here recalculates what the backend decides. The booking date is derived on the
 * server from `posting_starts_on`, the three bolts are its answer, and the balance is enforced
 * by a deferred constraint trigger in the database. This file only catches what somebody can see
 * at a glance, so the screen says it in German rather than echoing a sentence from the server.
 */

/** One row of the opening grid, as it is typed. */
export type OpeningRow = {
  accountId: number | null
  accountNumber: string
  accountName: string
  /**
   * As typed, so a half entered amount stays on screen — and `null` while nobody has typed here.
   *
   * <p>Not the empty string: an emptied field is a value like any other and has to stay empty,
   * while «untouched» is what lets the proposal show through. It is read during render rather
   * than written into the state, so no late answer overwrites a keystroke — the same reading the
   * fiscal year form follows.
   */
  debit: string | null
  credit: string | null
  /**
   * Whether the amount shown in this row was proposed rather than typed.
   *
   * <p>Worked out, never stored. It is true for the receivables row while nobody has touched it:
   * the figure comes from the open items of <b>today</b> and not from the changeover day, so
   * calling it a proposal is the honest word for it.
   */
  proposed: boolean
}

/** The whole grid. */
export type OpeningForm = {
  rows: OpeningRow[]
}

/**
 * The grid a wizard opens with: the handful of rows the backend proposed, all of them empty.
 *
 * <p><b>What is missing is left out and is never an error.</b> A chart without a cash account
 * gives one row fewer; a proposal must never be the reason a wizard refuses to go on.
 *
 * @param suggestion the rows the setup state proposed
 * @returns the grid, with one empty row at the end to type into
 */
export function openingFormOf(suggestion: readonly SuggestedLine[]): OpeningForm {
  return {
    rows: [...suggestion.map(rowOf), emptyRow()],
  }
}

/** One proposed account, without an amount. */
function rowOf(line: SuggestedLine): OpeningRow {
  return {
    accountId: line.accountId,
    accountNumber: line.accountNumber,
    accountName: line.accountName,
    debit: null,
    credit: null,
    proposed: false,
  }
}

/** The row at the end of the grid, waiting for an account nobody proposed. */
export function emptyRow(): OpeningRow {
  return {
    accountId: null,
    accountNumber: '',
    accountName: '',
    debit: null,
    credit: null,
    proposed: false,
  }
}

/**
 * The grid as it is shown: the typed values, with the receivables proposal where nobody typed.
 *
 * <p><b>Exactly one row is filled, and it says so.</b> The others are typed off the transfer
 * balance sheet; only this one has a figure the application already holds, and it is the figure
 * of <b>today</b> rather than of the changeover day — hence the mark, and hence the sentence
 * under the grid.
 *
 * <p>Worked out during render and never written into the form: a late answer must not overwrite
 * a keystroke, and the mark disappears by itself the moment somebody types into the row.
 *
 * <p>The foreign currency rows of the answer are deliberately not used: an opening entry is kept
 * in the ledger currency, and they appear in the reconciliation line only.
 *
 * <p>Where the chart has no receivables account, or where the caller holds no `INVOICE_READ` and
 * therefore has no figure, nothing happens at all — and that is not an error.
 *
 * @param form the grid as it stands
 * @param suggestion the proposed rows, which say which one is the receivables row
 * @param totals what is open per currency, empty where it could not be read
 * @param ledgerCurrency what the books are kept in
 * @returns the grid as the screen shows it, with at most one row carrying a proposal
 */
export function shownForm(
  form: OpeningForm,
  suggestion: readonly SuggestedLine[],
  totals: readonly OpenItemTotal[],
  ledgerCurrency: string,
): OpeningForm {
  const receivable = suggestion.find((line) => line.fromOpenItems)
  const total = totals.find((row) => row.currencyCode === ledgerCurrency)
  if (receivable === undefined || total === undefined) {
    return form
  }
  return {
    rows: form.rows.map((row) =>
      row.accountId === receivable.accountId && row.debit === null && row.credit === null
        ? { ...row, debit: total.openTotal.toFixed(2), proposed: true }
        : row,
    ),
  }
}

/**
 * The two sums of the grid and the difference between them.
 *
 * <p>Shown always, even at 0.00: a difference that only appears when it is wrong is one nobody
 * looks for.
 *
 * <p><b>It counts exactly the rows the payload carries.</b> An amount typed into the trailing row
 * before an account was picked is dropped by {@link openingRequestOf}; counting it here would show
 * «Differenz 0.00» over a grid that goes out unbalanced, and the entry would be refused after the
 * changeover day had already been written.
 *
 * @param form the grid as it stands
 * @returns debit, credit and debit minus credit
 */
export function openingBalanceOf(form: OpeningForm): {
  debit: number
  credit: number
  difference: number
} {
  const counted = filledRowsOf(form)
  const debit = sumOf(counted.map((row) => row.debit))
  const credit = sumOf(counted.map((row) => row.credit))
  return { debit, credit, difference: round(debit - credit) }
}

/** The rows that carry something at all: an account and an amount on one of the two sides. */
export function filledRowsOf(form: OpeningForm): OpeningRow[] {
  return form.rows.filter(
    (row) =>
      row.accountId !== null
      && (amountOf(row.debit) !== null || amountOf(row.credit) !== null),
  )
}

/** One typed amount, and nothing where the field is untouched or unreadable. */
function amountOf(value: string | null): number | null {
  return value === null ? null : parseDecimal(value)
}

/**
 * Why the opening cannot be booked yet, or nothing where it can.
 *
 * <p>Three sentences and no more. Everything else — the three bolts, the tax code ban, the income
 * account on the first day of the year — is decided by the server, which is the only place that
 * knows the chart and the fiscal year.
 *
 * @param form the grid as it stands
 * @returns the German sentence, or `undefined` where the button may be pressed
 */
export function openingBlockerOf(form: OpeningForm): string | undefined {
  const filled = filledRowsOf(form)
  if (filled.length < 2) {
    return 'Eine Eröffnungsbuchung braucht mindestens zwei Zeilen auf zwei verschiedenen Konten.'
  }
  if (new Set(filled.map((row) => row.accountId)).size < 2) {
    return 'Zwei Zeilen auf demselben Konto buchen nichts. Wählen Sie ein zweites Konto.'
  }
  const { difference } = openingBalanceOf(form)
  if (difference !== 0) {
    return 'Soll und Haben stimmen noch nicht überein. Die Eröffnungsbilanz Ihres Treuhänders geht auf; erst dann lässt sie sich buchen.'
  }
  // An amount without an account never reaches the payload, so it must not reach the button
  // either — the grid would look balanced and go out unbalanced.
  if (form.rows.some((row) => row.accountId === null && carriesAnAmount(row))) {
    return 'Eine Zeile trägt einen Betrag, aber kein Konto. Wählen Sie das Konto, oder leeren Sie den Betrag.'
  }
  return undefined
}

/** Whether a row carries a readable amount on either side. */
function carriesAnAmount(row: OpeningRow): boolean {
  return amountOf(row.debit) !== null || amountOf(row.credit) !== null
}

/**
 * Turns the grid into what the endpoint takes.
 *
 * <p>No booking date: the server derives it from `posting_starts_on`. Rows without an account and
 * without an amount are left out — the last row of a grid is almost always the empty one somebody
 * stopped typing in.
 *
 * @param form the grid as it stands
 * @param fiscalYearId the year the opening belongs to
 * @param replaceExisting whether an opening that stands may be replaced. Without it a year that
 *   has one answers 409 and names its journal number
 * @param reason why, for a replacement; mandatory as soon as {@code replaceExisting} is set
 * @returns the payload of `POST /opening-entry`
 */
export function openingRequestOf(
  form: OpeningForm,
  fiscalYearId: number,
  replaceExisting: boolean,
  reason: string,
) {
  return {
    fiscalYearId,
    replaceExisting,
    reason: replaceExisting ? reason : null,
    lines: filledRowsOf(form).map((row) => ({
      accountId: row.accountId as number,
      debit: amountOf(row.debit),
      credit: amountOf(row.credit),
      taxCodeId: null,
    })),
  }
}

/** The sum of a column, with anything untouched or unreadable counting as nothing. */
function sumOf(values: readonly (string | null)[]): number {
  return round(values.reduce((total, value) => total + (amountOf(value) ?? 0), 0))
}

/** Two places, so a sum of typed francs does not fail on a floating point tail. */
function round(value: number): number {
  return Math.round(value * 100) / 100
}
