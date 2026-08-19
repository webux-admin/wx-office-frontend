import { labelForm } from '../../lib/masterData'
import type { MasterDataEntry, MasterDataList } from '../../lib/types'

/**
 * One value of a selection list while it is being entered.
 *
 * <p>Its own module because the dialog and the screen around it share it: the screen holds the
 * form, the dialog only shows it.
 */
export type EntryForm = {
  code: string
  name: string
  shortName: string
  description: string
  documentLanguage: boolean
  /** The name in the other document languages, by language code. */
  translations: Record<string, string>
}

/** An empty form, for a value that is being added. */
export const EMPTY_ENTRY: EntryForm = {
  code: '',
  name: '',
  shortName: '',
  description: '',
  documentLanguage: false,
  translations: {},
}

/**
 * Fills the form from a stored value.
 *
 * <p>The wording shown is the translation for the tenant's own language where there is one:
 * `name` is only the fallback, and a value delivered with the application carries a German one
 * whichever language the tenant works in.
 *
 * @param entry the value as the API returned it
 * @param defaultLanguage code of the tenant's default language, whose text is the name
 * @returns the form, with every missing field as an empty string
 */
export function toEntryForm(entry: MasterDataEntry, defaultLanguage: string): EntryForm {
  return {
    code: entry.code,
    name: entry.labels?.[defaultLanguage] ?? entry.name,
    shortName: entry.shortName ?? '',
    description: entry.description ?? '',
    documentLanguage: entry.documentLanguage === true,
    translations: labelForm(entry.labels, defaultLanguage),
  }
}

/**
 * What the backend demands of a code in this list, as a German sentence.
 *
 * <p>Three lists carry a code from a standard rather than one the tenant invents; the backend
 * refuses anything else, and it says so in English. Naming the format here keeps that answer
 * out of the mask.
 *
 * @param list the list the value belongs to
 * @returns the hint for the code field
 */
export function codeHintFor(list: MasterDataList): string {
  switch (list) {
    case 'languages':
      return 'Zwei Kleinbuchstaben nach ISO 639-1, zum Beispiel de.'
    case 'countries':
      return 'Zwei Grossbuchstaben nach ISO 3166-1, zum Beispiel CH.'
    case 'currencies':
      return 'Drei Grossbuchstaben nach ISO 4217, zum Beispiel CHF.'
    default:
      return 'Kurzzeichen, mit dem Belege auf den Wert zeigen. Später nicht mehr änderbar.'
  }
}

/**
 * Checks a value before it is sent, for the rules the backend answers in English.
 *
 * @param form the filled in form
 * @param list the list the value belongs to
 * @returns the German complaint, or `null` when nothing is obviously wrong
 */
export function entryComplaint(form: EntryForm, list: MasterDataList): string | null {
  if (form.code.trim() === '') return 'Der Wert braucht einen Code.'
  if (form.name.trim() === '') return 'Der Wert braucht eine Bezeichnung.'
  const code = form.code.trim()
  if (list === 'languages' && !/^[a-z]{2}$/.test(code)) {
    return 'Ein Sprachcode besteht aus zwei Kleinbuchstaben, zum Beispiel de.'
  }
  if (list === 'countries' && !/^[A-Z]{2}$/.test(code)) {
    return 'Ein Ländercode besteht aus zwei Grossbuchstaben, zum Beispiel CH.'
  }
  if (list === 'currencies' && !/^[A-Z]{3}$/.test(code)) {
    return 'Ein Währungscode besteht aus drei Grossbuchstaben, zum Beispiel CHF.'
  }
  return null
}
