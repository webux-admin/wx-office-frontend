import { parseDecimal } from '../../lib/format'
import type { DocumentPrintout, Printer, PrinterTray } from '../../lib/types'

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
  /** Id of the printer, as a string; empty means none is stored. */
  printerId: string
  /** Id of the tray, as a string; empty means none is stored. */
  trayId: string
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
    printerId: printout.printerId === undefined ? '' : `${printout.printerId}`,
    trayId: printout.trayId === undefined ? '' : `${printout.trayId}`,
    documentLayoutId:
      printout.documentLayoutId === undefined ? '' : `${printout.documentLayoutId}`,
    internal: printout.internal === true,
  }))
}

/** One copy as `PUT /{documents}/{id}/printouts` takes it. */
export type PrintoutPayload = {
  label: string
  copies: number
  printerId?: number
  trayId?: number
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
      printerId: row.printerId === '' ? undefined : Number(row.printerId),
      trayId: row.trayId === '' ? undefined : Number(row.trayId),
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
    // A tray belongs to a printer. Without one there is nothing it could belong to, and the
    // backend would refuse the pair rather than quietly dropping half of it.
    if (row.trayId !== '' && row.printerId === '') {
      return 'Ein Schacht gehört zu einem Drucker. Bitte zuerst den Drucker wählen.'
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
 * @returns a usual name and one sheet, on no printer in particular
 */
export function nextPrintoutRow(count: number): PrintoutRow {
  return {
    label: PRINTOUT_LABELS[count] ?? `Exemplar ${count + 1}`,
    copies: '1',
    printerId: '',
    trayId: '',
    documentLayoutId: '',
    internal: false,
  }
}

/**
 * What the printer of one copy is called.
 *
 * <p>The name the document froze wins: whoever prints may hold `ORDER_READ` without
 * `PRINTER_READ`, and then there is no list of printers to look the id up in.
 *
 * @param printout the copy
 * @param printers the printers of the tenant, empty when they may not be read
 * @returns the name, or `null` when no printer is stored or none of that id is known
 */
export function printerNameOf(
  printout: Pick<DocumentPrintout, 'printerId' | 'printerName'>,
  printers: readonly Printer[] = [],
): string | null {
  if (printout.printerName !== undefined && printout.printerName !== '') {
    return printout.printerName
  }
  if (printout.printerId === undefined) return null
  return printers.find((printer) => printer.id === printout.printerId)?.name ?? null
}

/**
 * What the tray of one copy is called.
 *
 * @param printout the copy
 * @param printers the printers of the tenant, empty when they may not be read
 * @returns the name, or `null` when no tray is stored or none of that id is known
 */
export function trayNameOf(
  printout: Pick<DocumentPrintout, 'printerId' | 'trayId' | 'trayName'>,
  printers: readonly Printer[] = [],
): string | null {
  if (printout.trayName !== undefined && printout.trayName !== '') return printout.trayName
  if (printout.trayId === undefined) return null
  return traysOf(printers, printout.printerId)
    .find((tray) => tray.id === printout.trayId)?.name ?? null
}

/**
 * The trays one printer offers.
 *
 * @param printers the printers of the tenant
 * @param printerId the printer, `undefined` while none is chosen
 * @returns its trays in the order they are kept, empty for a printer with a single tray
 */
export function traysOf(
  printers: readonly Printer[],
  printerId: number | undefined,
): PrinterTray[] {
  if (printerId === undefined) return []
  return printers.find((printer) => printer.id === printerId)?.trays ?? []
}

/**
 * The printers a copy may be set to.
 *
 * <p>Deactivated ones are left out, except the one this copy already carries: dropping it
 * would silently change the copy the moment somebody opens the mask.
 *
 * @param printers every printer of the tenant
 * @param chosenId the printer the copy carries, `undefined` when it carries none
 * @returns the printers to offer, in the order they came
 */
export function selectablePrinters(
  printers: readonly Printer[],
  chosenId: number | undefined,
): Printer[] {
  return printers.filter((printer) => printer.active !== false || printer.id === chosenId)
}

/**
 * Says in one line where a copy goes, for the box that stands next to the print dialog.
 *
 * <p>The wording says outright that nothing is set where nothing is set. "Standarddrucker"
 * would be an answer this application cannot give: it does not know what the browser will
 * offer.
 *
 * @param printout the copy
 * @param printers the printers of the tenant, empty when they may not be read
 * @returns for example "Empfang · Schacht 1" or "Kein Drucker hinterlegt"
 */
export function describeTarget(
  printout: DocumentPrintout,
  printers: readonly Printer[] = [],
): string {
  const printer = printerNameOf(printout, printers)
  if (printer === null) return 'Kein Drucker hinterlegt'
  const tray = trayNameOf(printout, printers)
  return tray === null ? printer : `${printer} · ${tray}`
}

/**
 * Says which copy is being printed, for a screen reader to announce.
 *
 * <p>The queue changes only text inside a box that stays on screen, so without a spoken
 * line nothing tells a reader that the step moved on. It repeats what the box shows: the
 * label, how many sheets and where they are meant to go.
 *
 * @param step     which copy is due, counted from 1
 * @param total    how many copies are printed in all
 * @param printout the copy, absent for a document that names none and is printed once
 * @param printers the printers of the tenant, empty when they may not be read
 * @returns for example "Ausfertigung 2 von 3: Buchhaltung, 2 Exemplare, Empfang · Schacht 1"
 */
export function describePrintStep(
  step: number,
  total: number,
  printout: DocumentPrintout | undefined,
  printers: readonly Printer[] = [],
): string {
  const where = `Ausfertigung ${step} von ${total}`
  if (printout === undefined) {
    return `${where}: Beleg ohne Beschriftung, 1 Exemplar, Kein Drucker hinterlegt`
  }
  return `${where}: ${printout.label}, ${describeSheets(printout.copies)}, ${describeTarget(printout, printers)}`
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
        printout.printerId ?? '',
        printout.trayId ?? '',
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
