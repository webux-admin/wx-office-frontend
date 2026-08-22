/**
 * What the position dialogs hold, and what they send.
 *
 * <p>No amount is worked out here. The only rule this file knows about money is a rule about
 * the form: a line carries either a percentage or an amount as its discount, never both. The
 * backend refuses the other case, and the mask has to say so before the request goes out.
 */
import { formatAmount, formatDate, formatPercent, parseDecimal } from '../../lib/format'
import type { SelectableEntry } from '../../lib/masterData'
import type { DocumentLine, DocumentLineKind, VatCategory } from '../../lib/types'

/** What a line looks like when it comes from the catalogue. */
export type ProductLine = {
  productId: number
  quantity: number
  discountPercent?: number
  /** Discount on the whole line, in the same basis as the resolved unit price. */
  discountAmount?: number
  serviceDateFrom?: string
  serviceDateTo?: string
  /** Where the line goes; left out it is appended. Never sent when a line is edited. */
  position?: number
}

/** What a line looks like when it is written by hand. */
export type FreeLine = {
  description: string
  quantity: number
  unit: string
  unitPrice: number
  discountPercent?: number
  /** Discount on the whole line, in the same basis as `unitPrice`. */
  discountAmount?: number
  vatCategory: VatCategory
  priceIncludesVat: boolean
  serviceDateFrom?: string
  serviceDateTo?: string
  /** Where the line goes; left out it is appended. Never sent when a line is edited. */
  position?: number
}

/** The kinds of line that shape the document instead of charging for something. */
export type StructureLineKind = Exclude<DocumentLineKind, 'ITEM'>

/** What a comment, a subtotal or a page break looks like on its way to the backend. */
export type StructureLine = {
  kind: StructureLineKind
  /** The comment, or the caption of a subtotal. A page break carries none. */
  text?: string
  /** Where the line goes; left out it is appended. Never sent when a line is edited. */
  position?: number
}

/** The three structure kinds in the order they are offered when the catalogue is silent. */
export const STRUCTURE_KINDS: readonly StructureLineKind[] = ['COMMENT', 'SUBTOTAL', 'PAGE_BREAK']

/** The two discount fields of a position dialog, as the strings they were typed as. */
export type DiscountFields = { percent: string; amount: string }

/** Both discount fields empty, the state a new line starts in. */
export const NO_DISCOUNT: DiscountFields = { percent: '', amount: '' }

/**
 * Takes the percentage the user typed and drops the amount as soon as there is one.
 *
 * @param fields the two fields as they stand
 * @param percent what was typed into the percentage field
 * @returns the new state of both fields
 */
export function withDiscountPercent(fields: DiscountFields, percent: string): DiscountFields {
  return { percent, amount: percent.trim() === '' ? fields.amount : '' }
}

/**
 * Takes the amount the user typed and drops the percentage as soon as there is one.
 *
 * @param fields the two fields as they stand
 * @param amount what was typed into the amount field
 * @returns the new state of both fields
 */
export function withDiscountAmount(fields: DiscountFields, amount: string): DiscountFields {
  return { amount, percent: amount.trim() === '' ? fields.percent : '' }
}

/**
 * Which discount field must stay locked, because the other one carries a value.
 *
 * @param fields the two fields as they stand
 * @returns the field to lock, or null while both are empty
 */
export function lockedDiscount(fields: DiscountFields): 'percent' | 'amount' | null {
  if (fields.percent.trim() !== '') return 'amount'
  if (fields.amount.trim() !== '') return 'percent'
  return null
}

/**
 * The discount as the API takes it.
 *
 * <p>At most one of the two is set. Should both fields somehow carry a value, the percentage
 * wins — that is the one the mask locks the other against.
 *
 * @param fields the two fields as they stand
 * @returns what to put into the request body
 */
export function discountPayload(fields: DiscountFields): {
  discountPercent?: number
  discountAmount?: number
} {
  const percent = parseDecimal(fields.percent)
  if (percent !== null) return { discountPercent: percent }
  const amount = parseDecimal(fields.amount)
  if (amount !== null) return { discountAmount: amount }
  return {}
}

/**
 * Fills the two discount fields from a stored line, for the dialog that edits it.
 *
 * <p>A stored zero counts as no discount and leaves the field empty: it would otherwise look
 * like a deliberate "0 %" and lock the other field for no reason.
 *
 * @param line the line being edited, undefined for a new one
 * @returns the fields to start the dialog with
 */
export function discountFieldsOf(line: DocumentLine | undefined): DiscountFields {
  if (!line) return NO_DISCOUNT
  return {
    percent: line.discountPercent ? String(line.discountPercent) : '',
    amount: line.discountAmount ? String(line.discountAmount) : '',
  }
}

/** What the mask complains about before a position goes out, one sentence per field. */
export type LineProblems = {
  quantity?: string
  unitPrice?: string
  percent?: string
  amount?: string
}

/**
 * Says what keeps a position from being sent.
 *
 * <p>Every rule here is one the backend enforces as well. It is repeated in the mask because
 * a refusal that arrives after the dialog was submitted is a refusal the user cannot read
 * next to the field that caused it.
 *
 * <p>A negative quantity is deliberately allowed: a returned item carries one. Only zero is
 * refused, the way the backend refuses it.
 *
 * <p>A discount field that carries something unreadable is a problem of its own. It cannot be
 * sent, and sending nothing instead would raise the amount of the line without saying so.
 *
 * @param fields the values as they were typed; `unitPrice` only where the line names its own
 * @returns a sentence per field that is wrong, empty when the line may be sent
 */
export function lineProblems(fields: {
  quantity: string
  unitPrice?: string
  discount: DiscountFields
}): LineProblems {
  const problems: LineProblems = {}
  const quantity = parseDecimal(fields.quantity)
  if (quantity === null) problems.quantity = 'Die Menge fehlt.'
  else if (quantity === 0) problems.quantity = 'Die Menge darf nicht null sein.'

  if (fields.unitPrice !== undefined) {
    const price = parseDecimal(fields.unitPrice)
    if (price === null) problems.unitPrice = 'Der Einzelpreis fehlt.'
    else if (price < 0) problems.unitPrice = 'Der Einzelpreis darf nicht negativ sein.'
  }

  // A figure that does not parse is refused rather than dropped. "10%" in the percentage
  // field used to be sent as no discount at all, so the line went out ten percent too dear
  // while the mask showed a discount and said nothing.
  const percent = parseDecimal(fields.discount.percent)
  if (percent === null && fields.discount.percent.trim() !== '') {
    problems.percent = 'Der Rabatt ist keine Zahl.'
  } else if (percent !== null && (percent < 0 || percent > 100)) {
    problems.percent = 'Der Rabatt liegt zwischen 0 und 100 Prozent.'
  }
  const amount = parseDecimal(fields.discount.amount)
  if (amount === null && fields.discount.amount.trim() !== '') {
    problems.amount = 'Der Rabatt ist keine Zahl.'
  } else if (amount !== null && amount < 0) {
    problems.amount = 'Der Rabatt darf nicht negativ sein.'
  }
  return problems
}

/**
 * @param problems what {@link lineProblems} found
 * @returns true while at least one field keeps the line from being sent
 */
export function hasProblem(problems: LineProblems): boolean {
  return Object.values(problems).some((one) => one !== undefined)
}

/**
 * Whether a discount stored on a line would be dropped by saving it.
 *
 * <p>A product can be marked as not discountable after a line was written with a discount.
 * The dialog then sends none, and the amount of the line rises — so it has to say so before
 * the user presses "Übernehmen".
 *
 * @param discountable whether the chosen product may be discounted at all
 * @param fields the two discount fields as they stand
 * @returns true when saving would silently remove a discount that is there
 */
export function dropsDiscount(discountable: boolean, fields: DiscountFields): boolean {
  return !discountable && lockedDiscount(fields) !== null
}

/**
 * What the folded away part of a position dialog carries, in one line.
 *
 * <p>A discount that nobody sees is a discount nobody corrects, and the same goes for a
 * period of supply, which decides the VAT rate. The fold may hide the fields; it may not hide
 * that something is in them.
 *
 * @param fields the two discount fields as they stand
 * @param from the first day of supply, empty for the document date
 * @param to the last day of supply, empty for none
 * @returns the line to put next to "Weitere Angaben", or undefined while everything is empty
 */
export function moreDetailsSummary(
  fields: DiscountFields,
  from: string,
  to: string,
): string | undefined {
  const entries: string[] = []
  const percent = parseDecimal(fields.percent)
  const amount = parseDecimal(fields.amount)
  if (percent !== null) entries.push(`Rabatt ${formatPercent(percent)}`)
  else if (amount !== null) entries.push(`Rabatt ${formatAmount(amount)}`)

  if (from !== '' && to !== '') entries.push(`Leistung ${formatDate(from)} bis ${formatDate(to)}`)
  else if (from !== '') entries.push(`Leistung ab ${formatDate(from)}`)
  else if (to !== '') entries.push(`Leistung bis ${formatDate(to)}`)

  return entries.length === 0 ? undefined : entries.join(' · ')
}

/**
 * Says what keeps a structure line from being saved.
 *
 * @param kind the kind chosen in the dialog
 * @param text the text as it was typed
 * @returns the sentence to show, or undefined when the line may be sent
 */
export function structureLineProblem(
  kind: StructureLineKind,
  text: string,
): string | undefined {
  if (kind === 'COMMENT' && text.trim() === '') return 'Eine Kommentarzeile braucht einen Text.'
  return undefined
}

/**
 * Whether a kind carries a text at all. A page break has nothing to say.
 *
 * @param kind the kind chosen in the dialog
 */
export function carriesText(kind: StructureLineKind): boolean {
  return kind !== 'PAGE_BREAK'
}

/**
 * The values the kind dropdown of the structure dialog offers.
 *
 * <p>`ITEM` is dropped: a position with a price is added through the other two dialogs. While
 * the catalogue is still on its way the codes stand in for their labels, so the dialog is
 * usable rather than empty.
 *
 * @param entries the `line-kind` catalogue as the API returned it
 * @returns the entries to offer, never empty
 */
export function structureKindOptions(
  entries: readonly SelectableEntry[],
): readonly SelectableEntry[] {
  const offered = entries.filter((entry) => entry.code !== 'ITEM')
  if (offered.length > 0) return offered
  return STRUCTURE_KINDS.map((code) => ({ code, name: code }))
}

/**
 * Which dialog edits a line.
 *
 * <p>A line from the catalogue keeps its product, so it is edited where the product is
 * chosen; a line written by hand carries its own price and VAT treatment.
 *
 * @param line the line that was clicked
 */
export function editorOf(line: DocumentLine): 'product' | 'free' | 'structure' {
  if (line.kind !== 'ITEM') return 'structure'
  return line.productId === undefined || line.productId === null ? 'free' : 'product'
}

/**
 * How many lines of a document are actually charged.
 *
 * <p>What the "Ausstellen" button asks: a document of nothing but comments is not a document.
 * The backend refuses it either way; this only spares the user the refusal.
 *
 * @param lines the lines of the document, undefined for one that has none
 */
export function itemLineCount(lines: readonly DocumentLine[] | undefined): number {
  return (lines ?? []).filter((line) => line.kind === 'ITEM').length
}
