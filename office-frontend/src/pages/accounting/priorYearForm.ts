import { parseDecimal } from '../../lib/format'
import type {
  AccountType,
  FiscalYear,
  PriorYearLine,
  PriorYearRequest,
} from '../../lib/types'

/**
 * The prior year grid as a piece of state, with the checks it can make itself.
 *
 * <p><b>Beside `openingForm.ts`, not on top of it.</b> The two grids look alike and write the
 * same record, but they differ in three things this file owns: the rows are pre-filled from what
 * was captured rather than from a proposal, the payload carries no fiscal year (it stands in the
 * path of `PUT /prior-year-balances`), and the grid works out the year's result from the income
 * accounts among the typed rows. Rebuilding the opening form for that would have changed the
 * file the setup wizard stands on.
 *
 * <p>Nothing here recalculates what the backend decides. The booking date is derived on the
 * server — always the last day of the year being captured — and the balance is enforced by a
 * deferred constraint trigger in the database. This file only catches what somebody can see at
 * a glance, so the screen says it in German rather than echoing a sentence from the server.
 */

/** One row of the prior year grid, as it is typed. */
export type PriorYearRow = {
  accountId: number | null
  accountNumber: string
  accountName: string
  /**
   * As typed, so a half entered amount stays on screen — and `null` while nobody has typed
   * here. Not the empty string: an emptied field is a value like any other and has to stay
   * empty, while «untouched» is what a pre-filled row starts from.
   */
  debit: string | null
  credit: string | null
}

/** The whole grid. */
export type PriorYearForm = {
  rows: PriorYearRow[]
}

/** The two sums of the grid and the difference between them. */
export type PriorYearBalance = {
  debit: number
  credit: number
  difference: number
}

/**
 * The year's result as far as the grid shows it: what the income accounts among the rows add up
 * to, and whether there are any.
 *
 * <p>`hasIncomeRows` is separate from a zero result on purpose: a capture without a single
 * income account goes through and yields 0.00 — the note of the prior year's income statement
 * then stays — and the screen has to say that rather than show a zero that looks like a
 * balanced year.
 */
export type PriorYearResult = {
  result: number
  hasIncomeRows: boolean
}

/**
 * The grid a screen opens with: the captured balances, all of them editable, and one empty row.
 *
 * <p>Number and name come from the frozen copies on the entry line, not from today's chart —
 * the same reading the screen shows before anybody types.
 *
 * @param captured the lines that already stand, empty where nothing is captured
 * @returns the grid, with one empty row at the end to type into
 */
export function priorYearFormOf(captured: readonly PriorYearLine[]): PriorYearForm {
  return {
    rows: [...captured.map(rowOf), emptyPriorYearRow()],
  }
}

/** One captured line as a row, with a zero side left untouched rather than shown as 0.00. */
function rowOf(line: PriorYearLine): PriorYearRow {
  return {
    accountId: line.accountId,
    accountNumber: line.accountNumber,
    accountName: line.accountName,
    debit: line.debit === 0 ? null : line.debit.toFixed(2),
    credit: line.credit === 0 ? null : line.credit.toFixed(2),
  }
}

/** The row at the end of the grid, waiting for an account nobody has picked yet. */
export function emptyPriorYearRow(): PriorYearRow {
  return {
    accountId: null,
    accountNumber: '',
    accountName: '',
    debit: null,
    credit: null,
  }
}

/** The rows that carry something at all: an account and an amount on one of the two sides. */
export function filledPriorYearRowsOf(form: PriorYearForm): PriorYearRow[] {
  return form.rows.filter((row) => row.accountId !== null && carriesAnAmount(row))
}

/**
 * The two sums of the grid and the difference between them.
 *
 * <p>Shown always, even at 0.00: a difference that only appears when it is wrong is one nobody
 * looks for.
 *
 * <p><b>It counts exactly the rows the payload carries.</b> An amount typed into the trailing row
 * before an account was picked is dropped by {@link priorYearRequestOf}; counting it here would
 * show «Differenz 0.00» over a grid that goes out unbalanced.
 *
 * @param form the grid as it stands
 * @returns debit, credit and debit minus credit
 */
export function priorYearBalanceOf(form: PriorYearForm): PriorYearBalance {
  const counted = filledPriorYearRowsOf(form)
  const debit = sumOf(counted.map((row) => row.debit))
  const credit = sumOf(counted.map((row) => row.credit))
  return { debit, credit, difference: round(debit - credit) }
}

/**
 * Why the balances cannot be saved yet, or nothing where they can.
 *
 * <p>Four sentences and no more. Everything else — the tax code ban, a closed year, other posted
 * entries in it — is decided by the server, which is the only place that knows the chart and the
 * fiscal year.
 *
 * @param form the grid as it stands
 * @returns the German sentence, or `undefined` where the button may be pressed
 */
export function priorYearBlockerOf(form: PriorYearForm): string | undefined {
  const filled = filledPriorYearRowsOf(form)
  if (filled.length < 2) {
    return 'Vorjahressaldi brauchen mindestens zwei Zeilen auf zwei verschiedenen Konten.'
  }
  if (new Set(filled.map((row) => row.accountId)).size < 2) {
    return 'Zwei Zeilen auf demselben Konto buchen nichts. Wählen Sie ein zweites Konto.'
  }
  const { difference } = priorYearBalanceOf(form)
  if (difference !== 0) {
    return 'Soll und Haben stimmen noch nicht überein. Die Saldenliste Ihres Treuhänders geht auf 0.00 auf; erst dann lässt sie sich verbuchen.'
  }
  // An amount without an account never reaches the payload, so it must not reach the button
  // either — the grid would look balanced and go out unbalanced.
  if (form.rows.some((row) => row.accountId === null && carriesAnAmount(row))) {
    return 'Eine Zeile trägt einen Betrag, aber kein Konto. Wählen Sie das Konto, oder leeren Sie den Betrag.'
  }
  return undefined
}

/**
 * The year's result as the grid shows it: revenue minus expense over the income accounts among
 * the filled rows.
 *
 * <p>A control figure and nothing else — it is the number somebody holds against the closing of
 * their fiduciary, and it is never sent. Positive is a profit, negative a loss. Accounts whose
 * type is unknown here (a chart that has not answered yet) count as balance accounts.
 *
 * @param form the grid as it stands
 * @param typeOf what type an account has, `undefined` where it is not known
 * @returns the result and whether an income account is among the rows at all
 */
export function priorYearResultOf(
  form: PriorYearForm,
  typeOf: (accountId: number) => AccountType | undefined,
): PriorYearResult {
  let result = 0
  let hasIncomeRows = false
  for (const row of filledPriorYearRowsOf(form)) {
    const type = typeOf(row.accountId as number)
    if (type !== 'REVENUE' && type !== 'EXPENSE') continue
    hasIncomeRows = true
    // A revenue account carries its balance on the credit side, an expense account on the debit
    // side; either way the result grows with credits and shrinks with debits.
    result += (amountOf(row.credit) ?? 0) - (amountOf(row.debit) ?? 0)
  }
  return { result: round(result), hasIncomeRows }
}

/**
 * Turns the grid into what the endpoint takes.
 *
 * <p>No booking date and no fiscal year: the server derives the day — always the last one of the
 * year being captured — and the year stands in the path. Rows without an account or without an
 * amount are left out — the last row of a grid is almost always the empty one somebody stopped
 * typing in. `taxCodeId` is always `null`: a carried balance declares nothing.
 *
 * @param form the grid as it stands
 * @param replaceExisting whether an opening entry that stands may be replaced. Without it a
 *   year that has one answers 409 and names its journal number
 * @param reason why, for a replacement; mandatory as soon as `replaceExisting` is set
 * @returns the payload of `PUT /prior-year-balances`
 */
export function priorYearRequestOf(
  form: PriorYearForm,
  replaceExisting: boolean,
  reason: string,
): PriorYearRequest {
  return {
    replaceExisting,
    reason: replaceExisting ? reason : null,
    lines: filledPriorYearRowsOf(form).map((row) => ({
      accountId: row.accountId as number,
      debit: amountOf(row.debit),
      credit: amountOf(row.credit),
      taxCodeId: null,
    })),
  }
}

/**
 * The year the screen opens on.
 *
 * <p>The one named in the address where the fiscal year screen led here with one; otherwise the
 * earliest year the tenant keeps. The earliest and not the one today falls into:
 * the year before the changeover is, by its nature, the first year in the list — captured or
 * not yet — and where it does not exist yet, {@link yearBeforeOf} says which one to lay out.
 *
 * @param years the fiscal years the tenant keeps
 * @param namedId the year named in the address, `null` where none was
 * @returns the year to open on, or `undefined` where the tenant keeps none
 */
export function priorYearCandidateOf(
  years: readonly FiscalYear[],
  namedId: number | null,
): FiscalYear | undefined {
  const named = namedId === null ? undefined : years.find((year) => year.id === namedId)
  if (named !== undefined) return named
  return [...years].sort((left, right) => left.startDate.localeCompare(right.startDate))[0]
}

/**
 * The range of the year that would stand before the earliest one: twelve months ending the day
 * before it begins.
 *
 * <p>Only the dates. Name and series come from `GET /fiscal-years/preview`, the calculator of the
 * backend, so a split year is named the way every other year of this tenant is — a second naming
 * rule here would fall apart on the first «2025/26».
 *
 * @param years the fiscal years the tenant keeps
 * @returns first and last day of the year before the earliest, or `undefined` without years
 */
export function yearBeforeOf(
  years: readonly FiscalYear[],
): { startDate: string; endDate: string } | undefined {
  const earliest = priorYearCandidateOf(years, null)
  if (earliest === undefined) return undefined
  const [year, month, day] = earliest.startDate.split('-').map(Number)
  return {
    startDate: addDays(`${year - 1}-${pad(month)}-${pad(day)}`, 0),
    endDate: addDays(earliest.startDate, -1),
  }
}

/**
 * The year that begins the day after another one ends, or nothing where none does.
 *
 * <p>Matched on the first day and not on «any later year», the same way the backend finds the
 * year its notice speaks of: a year standing behind a gap is not the one whose opening entry the
 * closing run replaces.
 *
 * @param years the fiscal years the tenant keeps
 * @param year the year being captured
 * @returns the following year, or `undefined`
 */
export function followingYearOf(
  years: readonly FiscalYear[],
  year: FiscalYear,
): FiscalYear | undefined {
  const followingStart = addDays(year.endDate, 1)
  return years.find((candidate) => candidate.startDate === followingStart)
}

/**
 * Whether the fiscal year screen offers the way into the prior year screen on a year.
 *
 * <p>The year before the changeover: not closed, nothing posted in it besides its own opening
 * entry, and a later year that carries postings — the changeover year, whose first posting is
 * its opening entry. The captured balances <b>are</b> the opening entry of the captured year,
 * so they do not cost the row its way in; that is what `postedEntriesBesidesOpening` is for. A
 * year with other postings gets no button, because the backend refuses the capture on that very
 * count and a button whose only outcome is a refusal is a trap. What the way is called on the
 * row is {@link priorYearCaptureLabelOf}.
 *
 * <p>Two empty years in a row offer nothing: nobody has changed over yet, and the wizard is the
 * way then.
 *
 * @param year the year the row is about
 * @param years the fiscal years the tenant keeps
 * @returns whether the way stands on this row
 */
export function offersPriorYearCapture(year: FiscalYear, years: readonly FiscalYear[]): boolean {
  if (year.status === 'CLOSED' || year.postedEntriesBesidesOpening > 0) return false
  return years.some((later) => later.startDate > year.endDate && later.postedEntries > 0)
}

/**
 * What the way on a row is called: «Vorjahressaldi erfassen» while the year carries no opening
 * entry, «Vorjahressaldi ersetzen» once it does — the word the screen behind puts on its button
 * as well, because saving there reverses the entry that stands and writes the new one in one
 * step rather than correcting it.
 *
 * <p>Read off the two counts, because the list names no opening entry: posted entries above the
 * ones besides the opening are posted `OPENING` rows. The list cannot tell an opening that
 * stands from one a reopening of the year before took back without replacing it; in that one
 * case the row says «ersetzen» and the screen, which reads the entry itself, offers «Speichern
 * und verbuchen».
 *
 * @param year the year the row is about
 * @returns the German label of the way
 */
export function priorYearCaptureLabelOf(year: FiscalYear): string {
  return year.postedEntries > year.postedEntriesBesidesOpening
    ? 'Vorjahressaldi ersetzen'
    : 'Vorjahressaldi erfassen'
}

/** Whether a row carries a readable amount on either side. */
function carriesAnAmount(row: PriorYearRow): boolean {
  return amountOf(row.debit) !== null || amountOf(row.credit) !== null
}

/** One typed amount, and nothing where the field is untouched or unreadable. */
function amountOf(value: string | null): number | null {
  return value === null ? null : parseDecimal(value)
}

/** The sum of a column, with anything untouched or unreadable counting as nothing. */
function sumOf(values: readonly (string | null)[]): number {
  return round(values.reduce((total, value) => total + (amountOf(value) ?? 0), 0))
}

/** Two places, so a sum of typed francs does not fail on a floating point tail. */
function round(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Moves an ISO day by whole days, in UTC so no time zone can shift the date — and normalises a
 * day that does not exist, such as the 29th of February a year earlier, onto the next real one.
 */
function addDays(day: string, days: number): string {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10)
}

function pad(value: number): string {
  return `${value}`.padStart(2, '0')
}
