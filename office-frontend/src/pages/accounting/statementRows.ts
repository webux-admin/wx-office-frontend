import type { Statement, StatementRow } from '../../lib/types'

/**
 * The two switches of a statement — and nothing else.
 *
 * <p><b>They change what is shown, never what is counted.</b> Every figure comes out of the
 * backend and is not touched here: a subtotal stays the sum of its positions even where one of
 * them is hidden, which is what makes a page with half its positions hidden still add up.
 *
 * <p>Pure functions without rendering, so the two rules are checked without a screen — the same
 * cases run on the server in `StatementDisplayTest`, because the printed page has to show what
 * the screen showed.
 */

/** Whether one figure counts as nothing. An absent prior column counts as nil, not as a figure. */
function isNil(amount: number | null | undefined): boolean {
  return amount === null || amount === undefined || amount === 0
}

/**
 * Whether a row is nil in <b>both</b> columns.
 *
 * @param row one line of the report
 * @returns true where neither the year nor the year before carries a figure
 */
export function isEmptyRow(row: StatementRow): boolean {
  return isNil(row.amount) && isNil(row.priorAmount)
}

/**
 * The rows a screen or a printout shows.
 *
 * <p><b>Only positions are hidden</b> — that is what the switch says it does. The headings, the
 * subtotals, the two totals and the proof stay where they are, so a page with half its positions
 * hidden still reads as a balance sheet.
 *
 * <p>A position that carried a figure last year and none this year is the most telling line of
 * the whole report; hiding it because the current column is nil would turn OR Art. 958d Abs. 2
 * on its head. So a row goes only where <b>both</b> columns are nil.
 *
 * <p>Two kinds of line are never hidden, however nil they read. A <b>worked-out</b> line — the
 * result of the income statement, and «Saldo der Erfolgsrechnung» under the result line of the
 * balance sheet — is not a position that happens to be empty; it is the answer the report exists
 * for, and a result of nil is still the result. And a position with a <b>gross</b> half that
 * carries a figure stays even where the two halves cancel: hiding it would net expense against
 * income, which is exactly what OR Art. 958c Abs. 1 Ziff. 7 forbids.
 *
 * <p>What stands under a hidden position goes with it. An account line left behind under a
 * heading that is no longer there reads as belonging to the position above it — a wrong figure
 * in the wrong place, not merely an untidy one.
 *
 * @param rows the whole report as the backend sent it
 * @param hideEmpty whether positions nil in both columns are left out
 * @param withAccounts whether the accounts under a position are shown. The two halves of a gross
 *   position are not accounts and stay either way — OR Art. 958c Abs. 1 Ziff. 7 knows no
 *   exception from the ban on offsetting
 * @returns the rows to show, in the same order
 */
export function shownRows(
  rows: readonly StatementRow[],
  hideEmpty: boolean,
  withAccounts: boolean,
): StatementRow[] {
  // Worked out before the pass, because the two halves stand *after* the position they belong to
  // and a forward walk would have hidden it already.
  const grossAndFilled = new Set(
    rows
      .filter((row) => row.kind === 'GROSS' && row.position && !isEmptyRow(row))
      .map((row) => row.position as string),
  )
  const shown: StatementRow[] = []
  let underAHiddenPosition = false
  rows.forEach((row) => {
    const isChild = row.kind === 'ACCOUNT' || row.kind === 'GROSS'
    if (!isChild) {
      underAHiddenPosition = false
    }
    if (!withAccounts && row.kind === 'ACCOUNT') {
      return
    }
    if (isChild && underAHiddenPosition) {
      return
    }
    if (hideEmpty && isHideable(row, grossAndFilled) && isEmptyRow(row)) {
      underAHiddenPosition = true
      return
    }
    shown.push(row)
  })
  return shown
}

/**
 * Whether one row may be taken away at all.
 *
 * <p>Only an ordinary position may. A worked-out line stays, and so does a position one of whose
 * gross halves carries a figure — see the note on {@link shownRows}.
 */
function isHideable(row: StatementRow, grossAndFilled: ReadonlySet<string>): boolean {
  return (
    row.kind === 'POSITION'
    && !row.synthetic
    && !(row.position !== null && row.position !== undefined && grossAndFilled.has(row.position))
  )
}

/**
 * How far a row is indented on the screen, in pixels.
 *
 * <p>The level comes from the backend, so the screen never works out from the row kind how deep
 * a line sits — that would be a second truth beside the one the printout reads.
 *
 * @param row one line of the report
 * @returns the left padding of its first cell
 */
export function indentOf(row: StatementRow): number {
  return row.level * 16
}

/**
 * Whether a row is set in bold: the headings, the sums and the proof.
 *
 * @param row one line of the report
 * @returns true where the line carries the structure rather than a figure of its own
 */
export function isStrongRow(row: StatementRow): boolean {
  return (
    row.kind === 'GROUP' ||
    row.kind === 'SUBTOTAL' ||
    row.kind === 'TOTAL' ||
    row.kind === 'CONTROL'
  )
}

/**
 * The label of a row as the screen writes it.
 *
 * <p>An account line leads with its number, and a position that the law calls a negative item
 * says so — the addition is a labelling fact and never a sign, so it is written next to the
 * label rather than being read off the amount.
 *
 * @param row one line of the report
 * @returns what stands in the first column
 */
export function labelOf(row: StatementRow): string {
  if (row.accountNumber) {
    return `${row.accountNumber} ${row.label}`
  }
  return row.label
}

/**
 * The heading of the current column: the cut-off day, or the last day of the year.
 *
 * @param statement the report
 * @returns the date the first amount column is headed with
 */
export function columnDateOf(statement: Statement): string {
  return statement.asOf && statement.asOf !== '' ? statement.asOf : statement.endDate
}
