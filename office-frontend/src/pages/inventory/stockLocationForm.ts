import type { NegativeStockPolicy, StockLocation } from '../../lib/types'

/**
 * One stock location while it is being filled in.
 *
 * <p>Every value is a string or a flag, because that is what an input holds. `code` is only
 * read when a location is added — afterwards it is fixed, and the field is disabled.
 */
export type StockLocationForm = {
  code: string
  name: string
  binHint: string
  note: string
  negativeStockPolicy: NegativeStockPolicy
  active: boolean
}

/**
 * An empty dialog.
 *
 * @returns the form of a location that warns on a shortfall and is active
 */
export function emptyLocationForm(): StockLocationForm {
  return {
    code: '',
    name: '',
    binHint: '',
    note: '',
    negativeStockPolicy: 'WARN',
    active: true,
  }
}

/**
 * Fills the dialog from a stored location.
 *
 * @param location the location as the API returned it
 * @returns the form
 */
export function toLocationForm(location: StockLocation): StockLocationForm {
  return {
    code: location.code,
    name: location.name,
    binHint: location.binHint ?? '',
    note: location.note ?? '',
    negativeStockPolicy: location.negativeStockPolicy ?? 'WARN',
    active: location.active !== false,
  }
}

/**
 * Turns the dialog into the payload of the create or update request.
 *
 * <p>Empty free text fields are left out rather than sent as an empty string: the column
 * holds nothing, and «» would come back as a value nobody typed.
 *
 * @param form the dialog
 * @returns the location as the API wants it
 */
export function toLocationPayload(form: StockLocationForm): StockLocation {
  return {
    code: form.code.trim().toUpperCase(),
    name: form.name.trim(),
    binHint: form.binHint.trim() === '' ? undefined : form.binHint.trim(),
    note: form.note.trim() === '' ? undefined : form.note.trim(),
    negativeStockPolicy: form.negativeStockPolicy,
    active: form.active,
  }
}

/**
 * Checks what can be checked here, before anything is sent.
 *
 * <p>Whether the code is already taken is decided by the server, which knows every location
 * of the tenant. This catches the two things somebody sees at a glance, so the dialog can
 * say them in German rather than echo a sentence from the server.
 *
 * @param form     the dialog
 * @param creating true while a location is being added, when the code is still read
 * @returns the German complaint, or `null` when nothing is obviously wrong
 */
export function firstLocationComplaint(
  form: StockLocationForm,
  creating: boolean,
): string | null {
  if (creating && form.code.trim() === '') {
    return 'Ein Lagerort braucht einen Code, zum Beispiel HAUPT.'
  }
  if (form.name.trim() === '') {
    return 'Ein Lagerort braucht eine Bezeichnung.'
  }
  return null
}

/**
 * Whether a complaint belongs at the code field rather than above the dialog.
 *
 * <p>«Es gibt bereits einen Lagerort mit dem Code AUSSEN» is about one field, and a banner
 * over the whole dialog makes the reader look for what is wrong. Matched on the word rather
 * than on a code from the server: the backend answers a sentence, not a field name, and
 * inventing an error code for one message would be a contract for one case.
 *
 * @param message the complaint, as the dialog or the server worded it
 * @returns true when it should be shown at the code field
 */
export function belongsToCode(message: string): boolean {
  return message.toLowerCase().includes('code')
}
