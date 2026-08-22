import type { Printer, PrinterTray } from '../../lib/types'

/**
 * One paper tray while it is being entered.
 *
 * <p>No id: the backend matches a tray by its code, so a renamed tray keeps its place and a
 * new code is a new tray.
 */
export type TrayRow = {
  code: string
  name: string
}

/**
 * The printer mask while it is being filled in.
 *
 * <p>The trays are part of it, not a list of their own: a tray without its printer means
 * nothing, and the endpoint takes both together.
 */
export type PrinterForm = {
  code: string
  name: string
  location: string
  /** Whether it may still be chosen; a deactivated printer is switched on again here. */
  active: boolean
  /** The trays in the order they are offered. */
  trays: TrayRow[]
}

/** How many trays one printer may carry; the backend agrees. */
export const MAX_TRAYS = 20

const MAX_CODE_LENGTH = 20
const MAX_NAME_LENGTH = 60
const MAX_LOCATION_LENGTH = 100

/** What a code may consist of once it is upper cased. */
const CODE_PATTERN = /^[A-Z0-9_-]+$/

/** An empty mask, for a printer that is being added. */
export const EMPTY_PRINTER: PrinterForm = {
  code: '',
  name: '',
  location: '',
  active: true,
  trays: [],
}

/**
 * Fills the mask from a stored printer.
 *
 * @param printer the printer as the API returned it
 * @returns the mask, with every missing field as an empty string and no tray invented
 */
export function toPrinterForm(printer: Printer): PrinterForm {
  return {
    code: printer.code,
    name: printer.name,
    location: printer.location ?? '',
    active: printer.active !== false,
    trays: (printer.trays ?? []).map((tray) => ({ code: tray.code, name: tray.name })),
  }
}

/**
 * Turns the mask into the payload of `POST`/`PUT /api/tenants/{id}/printers`.
 *
 * <p>Everything goes out every time: the update replaces the whole record, so a tray left out
 * is a tray deleted. The position of a tray is its place in the list and is never held twice.
 *
 * <p>The code is upper cased on the way out. Storing `empfang` next to `EMPFANG` would give a
 * tenant two printers that read as one.
 *
 * @param form the filled in mask
 * @returns the printer as the API wants it
 */
export function toPrinterPayload(form: PrinterForm): {
  code: string
  name: string
  location?: string
  active: boolean
  trays: PrinterTray[]
} {
  return {
    code: form.code.trim().toUpperCase(),
    name: form.name.trim(),
    location: form.location.trim() || undefined,
    active: form.active,
    // No id: the backend matches a tray by its code, and the position is the place in the
    // list. Sending either as well would let two answers to the same question disagree.
    trays: form.trays.map((tray, index) => ({
      code: tray.code.trim().toUpperCase(),
      name: tray.name.trim(),
      position: index + 1,
    })),
  }
}

/**
 * Checks the rules the backend would otherwise answer with, so the mask can name the problem
 * before the request goes out.
 *
 * @param form the filled in mask
 * @param creating whether the printer does not exist yet, which is when the code is read
 * @returns the first German complaint, or `null` when the mask may be sent
 */
export function printerComplaint(form: PrinterForm, creating: boolean): string | null {
  const code = form.code.trim().toUpperCase()
  if (creating) {
    if (code === '') return 'Ein Drucker braucht einen Code. Er steht danach fest.'
    if (code.length > MAX_CODE_LENGTH) {
      return `Der Code darf höchstens ${MAX_CODE_LENGTH} Zeichen lang sein.`
    }
    if (!CODE_PATTERN.test(code)) {
      return 'Ein Druckercode besteht aus Buchstaben, Ziffern, Bindestrich und Unterstrich.'
    }
  }
  if (form.name.trim() === '') return 'Ein Drucker braucht eine Bezeichnung.'
  if (form.name.trim().length > MAX_NAME_LENGTH) {
    return `Die Bezeichnung darf höchstens ${MAX_NAME_LENGTH} Zeichen lang sein.`
  }
  if (form.location.trim().length > MAX_LOCATION_LENGTH) {
    return `Der Standort darf höchstens ${MAX_LOCATION_LENGTH} Zeichen lang sein.`
  }
  return trayComplaint(form.trays)
}

/**
 * Moves one tray up or down, which is the order it is offered in.
 *
 * @param trays the trays in the order they are offered
 * @param index the tray being moved
 * @param direction -1 for up, 1 for down
 * @returns the new order, unchanged when the move would leave the list
 */
export function withMovedTray(
  trays: readonly TrayRow[],
  index: number,
  direction: -1 | 1,
): TrayRow[] {
  const target = index + direction
  if (index < 0 || index >= trays.length || target < 0 || target >= trays.length) {
    return [...trays]
  }
  const moved = [...trays]
  const [tray] = moved.splice(index, 1)
  moved.splice(target, 0, tray)
  return moved
}

/**
 * A fresh row for a tray somebody adds.
 *
 * @param count how many trays there are already
 * @returns a numbered code and name, which is what a tray is usually called
 */
export function nextTrayRow(count: number): TrayRow {
  return { code: `S${count + 1}`, name: `Schacht ${count + 1}` }
}

/**
 * Says in words what a printer offers, for a table cell.
 *
 * @param printer the printer as the API returned it
 * @returns the tray names, or a sentence for a printer that names none
 */
export function describeTrays(printer: Printer): string {
  const trays = printer.trays ?? []
  if (trays.length === 0) return 'Ein Schacht'
  return trays.map((tray) => tray.name).join(', ')
}

/** The rules a set of trays has to keep. */
function trayComplaint(trays: readonly TrayRow[]): string | null {
  if (trays.length > MAX_TRAYS) return `Ein Drucker trägt höchstens ${MAX_TRAYS} Schächte.`
  const seen = new Set<string>()
  for (const tray of trays) {
    const code = tray.code.trim().toUpperCase()
    if (code === '') return 'Ein Schacht braucht einen Code. Sonst die Zeile entfernen.'
    if (code.length > MAX_CODE_LENGTH) {
      return `Ein Schachtcode darf höchstens ${MAX_CODE_LENGTH} Zeichen lang sein.`
    }
    if (!CODE_PATTERN.test(code)) {
      return 'Ein Schachtcode besteht aus Buchstaben, Ziffern, Bindestrich und Unterstrich.'
    }
    if (seen.has(code)) return `Der Schachtcode ${code} kommt zweimal vor.`
    seen.add(code)
    if (tray.name.trim() === '') return 'Ein Schacht braucht eine Bezeichnung.'
    if (tray.name.trim().length > MAX_NAME_LENGTH) {
      return `Eine Schachtbezeichnung darf höchstens ${MAX_NAME_LENGTH} Zeichen lang sein.`
    }
  }
  return null
}
