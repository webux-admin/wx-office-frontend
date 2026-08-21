import type {
  CopyPriceMode,
  DocumentCategory,
  DocumentType,
  DocumentTypeCopy,
} from '../../lib/types'

/**
 * The document type mask while it is being filled in.
 *
 * <p>Copies are held as plain labels rather than as `{position, label}`: the position is the
 * position in the list, and keeping it in two places invites the two to disagree.
 */
export type DocumentTypeForm = {
  category: DocumentCategory
  code: string
  name: string
  numberPrefix: string
  /** Id of the form it prints on, as a string, because that is what a `<select>` holds. */
  documentLayoutId: string
  /** One label per printed copy, in printing order. Empty means one copy without a label. */
  copies: string[]
  /** The kinds it may be taken over from, in the order they are offered. */
  predecessorTypeIds: number[]
  copyPriceMode: CopyPriceMode
}

/** How many copies of one document may come out of the printer; the backend agrees. */
export const MAX_COPIES = 9

/** How many kinds one kind may be taken over from; the backend agrees. */
export const MAX_PREDECESSORS = 10

const MAX_CODE_LENGTH = 20
const MAX_NAME_LENGTH = 60
const MAX_PREFIX_LENGTH = 10
const MAX_COPY_LABEL_LENGTH = 60

/** What a copy is usually called, offered in this order when the tenant adds one. */
export const COPY_LABELS = ['Original', 'Kopie', 'Buchhaltung', 'Spedition', 'Kunde']

/**
 * An empty mask, for a kind of document that is being added.
 *
 * <p>Starts on Auftrag because that is the only category with a mask of its own today. The
 * form is left empty and filled by the mask with the tenant's standard one.
 */
export function emptyDocumentType(): DocumentTypeForm {
  return {
    category: 'ORDER',
    code: '',
    name: '',
    numberPrefix: '',
    documentLayoutId: '',
    copies: [],
    predecessorTypeIds: [],
    copyPriceMode: 'RECALCULATE',
  }
}

/**
 * Fills the mask from a stored kind of document.
 *
 * @param type the kind as the API returned it
 * @returns the mask, with every missing value as an empty string and nothing invented
 */
export function toForm(type: DocumentType): DocumentTypeForm {
  return {
    category: type.category,
    code: type.code,
    name: type.name,
    numberPrefix: type.numberPrefix ?? '',
    documentLayoutId: type.documentLayoutId === undefined ? '' : `${type.documentLayoutId}`,
    copies: (type.copies ?? []).map((copy) => copy.label),
    predecessorTypeIds: type.predecessorTypeIds ?? [],
    copyPriceMode: type.copyPriceMode ?? 'RECALCULATE',
  }
}

/**
 * Turns the mask into the payload of `POST`/`PUT /api/tenants/{id}/document-types`.
 *
 * <p>Everything goes out, every time. Both endpoints replace the whole record: a field left
 * out does not keep its stored value, it resets — no copies, no predecessors, no form, the
 * prefix back to the code. That is why this mask has one Save button and not one per
 * register.
 *
 * <p>The category and the code only count when a kind is created; afterwards the backend
 * discards them. They still travel, because leaving the code out fails validation.
 *
 * @param form the filled in mask
 * @returns the kind as the API wants it
 */
export function toPayload(form: DocumentTypeForm): Record<string, unknown> {
  return {
    category: form.category,
    code: form.code.trim(),
    name: form.name.trim(),
    numberPrefix: form.numberPrefix.trim() || undefined,
    documentLayoutId: form.documentLayoutId === '' ? undefined : Number(form.documentLayoutId),
    copies: enteredCopies(form.copies),
    predecessorTypeIds: form.predecessorTypeIds,
    copyPriceMode: form.copyPriceMode,
  }
}

/**
 * Checks the rules the backend would otherwise answer with, so the mask can name the field
 * before the request goes out.
 *
 * @param form the filled in mask
 * @param creating whether the kind does not exist yet, which is when the code is read
 * @returns the first German complaint, or `null` when the mask may be sent
 */
export function firstComplaint(form: DocumentTypeForm, creating: boolean): string | null {
  if (creating && form.code.trim() === '') {
    return 'Eine Belegart braucht einen Code. Er steht danach fest.'
  }
  if (form.code.trim().length > MAX_CODE_LENGTH) {
    return `Der Code darf höchstens ${MAX_CODE_LENGTH} Zeichen lang sein.`
  }
  if (form.name.trim() === '') return 'Eine Belegart braucht eine Bezeichnung.'
  if (form.name.trim().length > MAX_NAME_LENGTH) {
    return `Die Bezeichnung darf höchstens ${MAX_NAME_LENGTH} Zeichen lang sein.`
  }
  if (form.numberPrefix.trim().length > MAX_PREFIX_LENGTH) {
    return `Das Nummernpräfix darf höchstens ${MAX_PREFIX_LENGTH} Zeichen lang sein.`
  }
  // The prefix falls back to the code, and the code may be twice as long as a prefix. The
  // backend refuses that rather than cutting the code in half, so the mask says so first.
  if (form.numberPrefix.trim() === '' && form.code.trim().length > MAX_PREFIX_LENGTH) {
    return `Ein Code über ${MAX_PREFIX_LENGTH} Zeichen taugt nicht als Nummernpräfix. `
      + 'Bitte ein eigenes angeben.'
  }
  return copyComplaint(form.copies)
}

/**
 * Moves one printed copy up or down, which is what changes the order in the PDF.
 *
 * @param copies the labels in printing order
 * @param index the copy being moved
 * @param direction -1 for up, 1 for down
 * @returns the new order, unchanged when the move would leave the list
 */
export function withMovedCopy(
  copies: readonly string[],
  index: number,
  direction: -1 | 1,
): string[] {
  return withMoved(copies, index, direction)
}

/**
 * Moves one predecessor up or down, which is the order of the «Übernehmen aus» menu.
 *
 * @param ids the ids in the order they are offered
 * @param index the entry being moved
 * @param direction -1 for up, 1 for down
 * @returns the new order, unchanged when the move would leave the list
 */
export function withMovedPredecessor(
  ids: readonly number[],
  index: number,
  direction: -1 | 1,
): number[] {
  return withMoved(ids, index, direction)
}

/**
 * Adds a kind as a predecessor or removes it again.
 *
 * <p>Adding puts it last, because the order is the order of the menu and a new entry has no
 * claim to the top.
 *
 * @param ids the ids in the order they are offered
 * @param id the kind being switched
 * @param on whether it may be taken over from
 * @returns the new list, unchanged when the id is already in the wanted state
 */
export function togglePredecessor(ids: readonly number[], id: number, on: boolean): number[] {
  if (!on) return ids.filter((entry) => entry !== id)
  return ids.includes(id) ? [...ids] : [...ids, id]
}

/**
 * The label to offer for the next copy someone adds.
 *
 * @param count how many copies there are already
 * @returns a usual name, or a numbered one once the usual ones are used up
 */
export function nextCopyLabel(count: number): string {
  return COPY_LABELS[count] ?? `Exemplar ${count + 1}`
}

/**
 * Says in words how often a kind is printed, for a table cell.
 *
 * @param copies the copies as the API returned them
 * @returns for example "3 ×", and "1 ×" for a kind that names no copies at all
 */
export function describeCopies(copies: DocumentTypeCopy[] | undefined): string {
  const count = copies?.length ?? 0
  return `${count === 0 ? 1 : count} ×`
}

/** The two things a copy of a document can do with its amounts, in German. */
export const COPY_PRICE_MODES: { value: CopyPriceMode; label: string; hint: string }[] = [
  {
    value: 'RECALCULATE',
    label: 'Neu aus dem Katalog holen',
    hint: 'Die Kopie rechnet mit den Preisen von heute.',
  },
  {
    value: 'COPY',
    label: 'Beträge des Originals behalten',
    hint: 'Die Kopie trägt dieselben Beträge wie der Beleg, aus dem sie stammt.',
  },
]

/** The copies the mask actually holds, numbered by their place in the list. */
function enteredCopies(labels: readonly string[]): DocumentTypeCopy[] {
  const entered: DocumentTypeCopy[] = []
  for (const label of labels) {
    if (label.trim() === '') continue
    entered.push({ position: entered.length + 1, label: label.trim() })
  }
  return entered
}

/** The rules a set of copies has to keep. */
function copyComplaint(labels: readonly string[]): string | null {
  // A row without a label is dropped on the way out. Saying so is the difference between a
  // copy somebody decided against and one that quietly disappeared.
  if (labels.some((label) => label.trim() === '')) {
    return 'Eine Ausfertigung braucht eine Beschriftung. Sonst die Zeile entfernen.'
  }
  if (labels.some((label) => label.trim().length > MAX_COPY_LABEL_LENGTH)) {
    return `Eine Beschriftung darf höchstens ${MAX_COPY_LABEL_LENGTH} Zeichen lang sein.`
  }
  if (labels.length > MAX_COPIES) {
    return `Ein Beleg wird höchstens ${MAX_COPIES} Mal gedruckt.`
  }
  return null
}

function withMoved<T>(entries: readonly T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction
  if (index < 0 || index >= entries.length || target < 0 || target >= entries.length) {
    return [...entries]
  }
  const moved = [...entries]
  const [entry] = moved.splice(index, 1)
  moved.splice(target, 0, entry)
  return moved
}
