import type { PrintLayout } from '../../lib/types'

/** The «Neue Druckvorlage» dialog while it is being filled in. */
export type NewLayoutForm = {
  /** Id of the form to start from, as a string. Empty means an empty standard arrangement. */
  sourceId: string
  code: string
  name: string
}

/** The longest code the column can hold; the backend agrees. */
export const MAX_LAYOUT_CODE_LENGTH = 30

/** The longest name the column can hold; the backend agrees. */
export const MAX_LAYOUT_NAME_LENGTH = 60

/** What a form code may look like — the same rule the backend checks. */
const CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]*$/

/**
 * Proposes code and name for a copy of a form.
 *
 * <p>Both stay editable: the proposal only saves typing for the common case, which is a
 * second form much like the first.
 *
 * @param source the form being copied, `undefined` for an empty arrangement
 * @returns the dialog as it opens
 */
export function suggestCopy(source: PrintLayout | undefined): NewLayoutForm {
  if (source === undefined) {
    return { sourceId: '', code: '', name: '' }
  }
  return {
    sourceId: `${source.id}`,
    code: `${source.code}-2`.slice(0, MAX_LAYOUT_CODE_LENGTH),
    name: `${source.name} (Kopie)`.slice(0, MAX_LAYOUT_NAME_LENGTH),
  }
}

/**
 * Checks what the backend would otherwise answer with.
 *
 * @param form the filled in dialog
 * @returns the first German complaint, or `null` when it may be sent
 */
export function layoutComplaint(form: NewLayoutForm): string | null {
  const code = form.code.trim()
  if (code === '') return 'Eine Druckvorlage braucht einen Code.'
  if (code.length > MAX_LAYOUT_CODE_LENGTH) {
    return `Der Code darf höchstens ${MAX_LAYOUT_CODE_LENGTH} Zeichen lang sein.`
  }
  if (!CODE_PATTERN.test(code.toUpperCase())) {
    return 'Ein Code besteht aus Buchstaben, Ziffern, Bindestrich und Unterstrich und beginnt '
      + 'mit einem Buchstaben oder einer Ziffer.'
  }
  const name = form.name.trim()
  if (name === '') return 'Eine Druckvorlage braucht eine Bezeichnung.'
  if (name.length > MAX_LAYOUT_NAME_LENGTH) {
    return `Die Bezeichnung darf höchstens ${MAX_LAYOUT_NAME_LENGTH} Zeichen lang sein.`
  }
  return null
}

/**
 * Says in words who prints on a form, for a table cell.
 *
 * <p>Names rather than a count: «3 Belegarten» sends the reader looking for which three, and
 * that is the very question this column exists to answer.
 *
 * @param form the form as the API returned it
 * @param limit how many names to spell out before counting the rest
 * @returns for example "Auftrag, Lieferschein +1", or an empty string when nobody uses it
 */
export function describeUsers(form: PrintLayout, limit = 2): string {
  const names = (form.usedBy ?? []).map((type) => type.name)
  if (names.length === 0) return ''
  if (names.length <= limit) return names.join(', ')
  return `${names.slice(0, limit).join(', ')} +${names.length - limit}`
}
