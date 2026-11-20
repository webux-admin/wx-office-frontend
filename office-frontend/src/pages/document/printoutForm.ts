import { parseDecimal } from '../../lib/format'
import type { DocumentPrintout } from '../../lib/types'

/**
 * The copies of one document while they are being edited.
 *
 * <p>Every field is a string, because that is what an input and a `<select>` hold. They become
 * numbers once, on the way out, rather than on every keystroke.
 */
export type PrintoutRow = {
  /** Row id of a stored copy; absent for one the mask has just added. */
  id?: number
  label: string
  copies: string
  /**
   * Id of the form this copy prints on, as a string. Empty means the copy is made from the
   * document itself, which is what every copy did before forms could differ per copy.
   */
  documentLayoutId: string
  /** True for a copy that stays in the house and is never mailed to the customer. */
  internal: boolean
}

/** How many copies one document may be printed in; the backend agrees. */
export const MAX_PRINTOUTS = 9

/** How many sheets one copy may ask for; the backend agrees. */
export const MAX_SHEETS = 99

/** Longest label a copy may carry. */
const MAX_LABEL_LENGTH = 60

/** What a copy is usually called, offered in this order when one is added. */
const PRINTOUT_LABELS = ['Original', 'Kopie', 'Buchhaltung', 'Spedition', 'Kunde']

/**
 * Fills the mask from the stored copies.
 *
 * @param printouts the copies as the API returned them, in printing order
 * @returns one row per copy, with nothing invented
 */
export function toPrintoutRows(printouts: readonly DocumentPrintout[] | undefined): PrintoutRow[] {
  return (printouts ?? []).map((printout) => ({
    id: printout.id,
    label: printout.label ?? '',
    copies: `${printout.copies ?? 1}`,
    documentLayoutId:
      printout.documentLayoutId === undefined ? '' : `${printout.documentLayoutId}`,
    internal: printout.internal === true,
  }))
}

/** One copy as `PUT /{documents}/{id}/printouts` takes it. */
export type PrintoutPayload = {
  label: string
  copies: number
  documentLayoutId?: number
  internal: boolean
}

/**
 * Turns the mask into the payload of `PUT /{documents}/{id}/printouts`.
 *
 * <p>The whole list goes out every time: the endpoint replaces it, so a row left out is a row
 * deleted.
 *
 * <p>Neither id nor position travels. The order of the list is the order on the paper, and the
 * backend numbers the rows from it — sending a position as well would let the two disagree.
 *
 * @param rows the rows in printing order
 * @returns the copies as the API wants them
 */
export function toPrintoutPayload(rows: readonly PrintoutRow[]): {
  printouts: PrintoutPayload[]
} {
  return {
    printouts: rows.map((row) => ({
      label: row.label.trim(),
      copies: parseDecimal(row.copies) ?? 1,
      documentLayoutId:
        row.documentLayoutId === '' ? undefined : Number(row.documentLayoutId),
      internal: row.internal,
    })),
  }
}

/**
 * Checks the rules the backend would otherwise answer with, so the mask can name the problem
 * before the request goes out.
 *
 * @param rows the rows in printing order
 * @returns the first German complaint, or `null` when the list may be sent
 */
export function printoutComplaint(rows: readonly PrintoutRow[]): string | null {
  if (rows.length > MAX_PRINTOUTS) {
    return `Ein Beleg wird in höchstens ${MAX_PRINTOUTS} Ausfertigungen gedruckt.`
  }
  for (const row of rows) {
    if (row.label.trim() === '') {
      return 'Eine Ausfertigung braucht eine Beschriftung. Sonst die Zeile entfernen.'
    }
    if (row.label.trim().length > MAX_LABEL_LENGTH) {
      return `Eine Beschriftung darf höchstens ${MAX_LABEL_LENGTH} Zeichen lang sein.`
    }
    const sheets = parseDecimal(row.copies)
    if (sheets === null) return 'Die Anzahl ist keine Zahl.'
    if (!Number.isInteger(sheets)) return 'Die Anzahl ist eine ganze Zahl.'
    if (sheets < 1 || sheets > MAX_SHEETS) {
      return `Die Anzahl liegt zwischen 1 und ${MAX_SHEETS}.`
    }
  }
  return null
}

/**
 * Moves one copy up or down, which is what changes the order of the print.
 *
 * @param rows the rows in printing order
 * @param index the row being moved
 * @param direction -1 for up, 1 for down
 * @returns the new order, unchanged when the move would leave the list
 */
export function withMovedPrintout(
  rows: readonly PrintoutRow[],
  index: number,
  direction: -1 | 1,
): PrintoutRow[] {
  const target = index + direction
  if (index < 0 || index >= rows.length || target < 0 || target >= rows.length) {
    return [...rows]
  }
  const moved = [...rows]
  const [row] = moved.splice(index, 1)
  moved.splice(target, 0, row)
  return moved
}

/**
 * A fresh row for a copy somebody adds.
 *
 * @param count how many copies there are already
 * @returns a usual name and one sheet
 */
export function nextPrintoutRow(count: number): PrintoutRow {
  return {
    label: PRINTOUT_LABELS[count] ?? `Exemplar ${count + 1}`,
    copies: '1',
    documentLayoutId: '',
    internal: false,
  }
}

/**
 * Says which copy is being printed, for a screen reader to announce.
 *
 * <p>The queue changes only text inside a box that stays on screen, so without a spoken
 * line nothing tells a reader that the step moved on. It repeats what the box shows: the
 * label and how many sheets.
 *
 * @param step     which copy is due, counted from 1
 * @param total    how many copies are printed in all
 * @param printout the copy, absent for a document that names none and is printed once
 * @returns for example "Ausfertigung 2 von 3: Buchhaltung, 2 Exemplare"
 */
export function describePrintStep(
  step: number,
  total: number,
  printout: DocumentPrintout | undefined,
): string {
  const where = `Ausfertigung ${step} von ${total}`
  if (printout === undefined) {
    return `${where}: Beleg ohne Beschriftung, 1 Exemplar`
  }
  return `${where}: ${printout.label}, ${describeSheets(printout.copies)}`
}

/**
 * Says how many sheets a copy asks for, for a line the user reads before choosing in the
 * dialog of the browser.
 *
 * @param copies how many sheets
 * @returns for example "1 Exemplar" or "2 Exemplare"
 */
export function describeSheets(copies: number | undefined): string {
  const sheets = copies === undefined || copies < 1 ? 1 : copies
  return `${sheets} ${sheets === 1 ? 'Exemplar' : 'Exemplare'}`
}

/**
 * A stamp over the stored copies, used as the `key` of the editing section.
 *
 * <p>The section holds what was typed in `useState`. That has to give way when the stored
 * list changes underneath it — after a save, or after the draft was taken over from another
 * document. A key does that without a second state and without an effect that synchronises.
 *
 * @param printouts the copies as the API returned them
 * @returns a string that changes whenever any stored value does
 */
export function printoutsKey(printouts: readonly DocumentPrintout[] | undefined): string {
  return (printouts ?? [])
    .map((printout) =>
      [
        printout.id ?? '',
        printout.position,
        printout.label,
        printout.copies,
        printout.documentLayoutId ?? '',
        printout.internal === true ? 'i' : '',
      ].join(':'),
    )
    .join('|')
}

/**
 * Where the PDF of one copy is fetched from.
 *
 * <p>A query parameter on the document rather than a path of its own: a copy is not a resource
 * — it exists only on the way to the printer, and the archive holds one original per document
 * (ADR-0024 of the backend).
 *
 * @param base the document, for example `/api/tenants/1/orders/42`
 * @param printoutId row id of the copy, absent for the document with all of its copies
 * @returns the path to fetch
 */
export function pdfPathOf(base: string, printoutId: number | undefined): string {
  if (printoutId === undefined) return `${base}/pdf`
  return `${base}/pdf?printoutId=${printoutId}`
}
