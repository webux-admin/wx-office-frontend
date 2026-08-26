/**
 * What the position dialogs hold, and what they send.
 *
 * <p>No amount is worked out here. The only rule this file knows about money is a rule about
 * the form: a line carries either a percentage or an amount as its discount, never both. The
 * backend refuses the other case, and the mask has to say so before the request goes out.
 */
import { formatAmount, formatDate, formatPercent, formatQuantity, parseDecimal } from '../../lib/format'
import { booksStock, tracksLots } from '../../lib/inventory'
import type { SelectableEntry } from '../../lib/masterData'
import type {
  DocumentLine,
  DocumentLineKind,
  DocumentLineLot,
  Product,
  ProductTracking,
  StockEffect,
  VatCategory,
} from '../../lib/types'

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
  /**
   * The batches or serial numbers this position moves, signed like the quantity. Left out on
   * a product nobody follows (backend ADR-0069).
   */
  lots?: LineLotEntry[]
}

/**
 * One number and what of the position falls on it.
 *
 * <p>Sent signed like the line: a return of two pieces names two numbers with minus one each.
 * That is what makes the counter document of a Storno a plain negation.
 *
 * <p>Collected unsigned, as pieces — see {@link PickedLots}. The sign is the one of the line
 * and is put on by {@link signedLots} when the numbers are read, never when they are picked.
 */
export type LineLotEntry = {
  lotNumber: string
  quantity: number
}

/** What a line looks like when it is written by hand. */
export type FreeLine = {
  description: string
  /** Second line of the description, printed under it. Left out while it is empty. */
  subtitle?: string
  /** Longer text under the description, printed as well. Left out while it is empty. */
  note?: string
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
  description?: string
  quantity?: string
  unitPrice?: string
  percent?: string
  amount?: string
  /** What is still open between the quantity and the numbers named for it. */
  lots?: string
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
 * @param fields the values as they were typed; `description` and `unitPrice` only where the
 * line names its own, which is the line written by hand rather than picked from the catalogue
 * @returns a sentence per field that is wrong, empty when the line may be sent
 */
export function lineProblems(fields: {
  description?: string
  quantity: string
  unitPrice?: string
  discount: DiscountFields
}): LineProblems {
  const problems: LineProblems = {}
  if (fields.description !== undefined && fields.description.trim() === '') {
    problems.description = 'Die Bezeichnung fehlt.'
  }

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

/** A field of a position dialog that can carry a message of its own. */
export type LineField = keyof LineProblems

/** Which fields the user has already dealt with: typed into, or left again. */
export type TouchedFields = Partial<Record<LineField, boolean>>

/** Nothing touched, the state a dialog opens in. */
export const NOTHING_TOUCHED: TouchedFields = {}

/**
 * Every field dealt with, the state a dialog goes into when the user presses send.
 *
 * <p>That press is the moment the user has had their chance at all of them, so from then on
 * the mask may name everything that is wrong at once — including the fields they never
 * reached, which are exactly the ones keeping the position from going out.
 *
 * <p>Written out per field rather than gathered from a list: a new field of
 * {@link LineProblems} does not compile until it stands here, and a field missing here would
 * stay silent under the very press that is meant to uncover it.
 */
export const EVERYTHING_TOUCHED: Required<TouchedFields> = {
  description: true,
  quantity: true,
  unitPrice: true,
  percent: true,
  amount: true,
  lots: true,
}

/**
 * Notes that the user has dealt with a field, so what is wrong with it may be said.
 *
 * @param touched the fields dealt with so far
 * @param field the field that was typed into or left
 * @returns the fields dealt with, that one included
 */
export function withTouched(touched: TouchedFields, field: LineField): TouchedFields {
  if (touched[field]) return touched
  const marked: TouchedFields = { ...touched }
  marked[field] = true
  return marked
}

/**
 * What the mask may say out loud: the problems of fields the user has already dealt with.
 *
 * <p>A dialog that opens on an empty price and answers "Der Einzelpreis fehlt." blames the
 * user for something they have not had a chance to do. The line still cannot be sent —
 * {@link hasProblem} runs on the full set, not on this one — the mask only waits with the
 * sentence until the field has been typed into or left.
 *
 * <p>What is shown is decided on the keys the problems themselves carry, not on a list of
 * fields kept alongside them. A field forgotten in such a list would be swallowed here while
 * it still kept the position from going out — a dialog that refuses without a word.
 *
 * @param problems what {@link lineProblems} found
 * @param touched the fields the user has typed into or left
 * @returns the same problems, without those of fields nobody has touched yet
 */
export function visibleProblems(
  problems: LineProblems,
  touched: TouchedFields,
): LineProblems {
  const visible: LineProblems = {}
  // `Object.entries` widens the key to `string`; the cast names back what the record holds.
  for (const [field, message] of Object.entries(problems) as [LineField, string][]) {
    if (message !== undefined && touched[field]) visible[field] = message
  }
  return visible
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


// --- batches and serial numbers at the position (backend ADR-0069) -----------

/**
 * The numbers a position holds, together with the product they were picked for.
 *
 * <p>Kept as one value rather than as two states side by side: a number names a piece lying in
 * the store under one product, so it is only ever an answer about that product.
 *
 * <p>The entries count pieces and carry no sign. The line makes the sign, and it can still
 * turn from an issue into a return after the pick was made — stamped on at the pick, it would
 * point the wrong way from then on.
 */
export type PickedLots = {
  /** The product the numbers were picked for, absent while none is chosen. */
  productId?: number
  entries: LineLotEntry[]
}

/**
 * The numbers a position may take with it.
 *
 * <p>Empty wherever it may carry none: another product than the one they were picked for, a
 * product nobody follows any more, or a kind of document that books nothing. Sent on, they
 * would be numbers the endpoint refuses — «Für dieses Produkt gibt es die Nummer SN-4711
 * nicht» — over numbers the mask has long stopped showing, which is a refusal nobody can act
 * on (backend ADR-0069).
 *
 * <p>An unknown product is the opposite case and the dangerous one. While the details are
 * still on their way — or where a document clerk without `PRODUCT_READ` never gets them at
 * all — nothing here can tell a followed product from a plain one, and answering «none» would
 * strip a stored position of its numbers on the next save, silently and for good. What the
 * position already carries therefore stays on it until something is known that says otherwise.
 *
 * @param picked what was collected, with the product it was collected for
 * @param productId the product the position names, absent while the search field carries a
 *                  term rather than a product
 * @param product the details of that product, absent while they are on their way or refused
 * @param stockEffect what issuing this kind of document does to the stock
 * @returns the entries, empty wherever the position may carry none
 */
export function carriedLots(
  picked: PickedLots,
  productId: number | undefined,
  product: Pick<Product, 'id' | 'tracking'> | undefined,
  stockEffect: StockEffect | undefined,
): LineLotEntry[] {
  if (productId === undefined) return []
  if (picked.productId !== productId) return []
  if (product === undefined) return picked.entries
  if (!booksStock(stockEffect) || !tracksLots(product)) return []
  return picked.entries
}

/**
 * The numbers of a position signed the way its quantity is.
 *
 * <p>Read at the moment they are needed rather than written at the moment they are picked. A
 * position that turns from an issue of one piece into a return of one would otherwise keep
 * entries pointing the other way: the dialog would count «offen 2» over a field that reports
 * nothing open, and lock a position nobody can unlock (backend ADR-0069).
 *
 * @param lots the numbers as they were picked, counting pieces
 * @param quantity what the position sells, negative on a return
 * @returns the same numbers, each carrying the sign of the line
 */
export function signedLots(
  lots: readonly LineLotEntry[],
  quantity: number | null,
): LineLotEntry[] {
  const sign = (quantity ?? 0) < 0 ? -1 : 1
  return lots.map((lot) => ({ lotNumber: lot.lotNumber, quantity: sign * Math.abs(lot.quantity) }))
}

/**
 * How much of a position the numbers already cover.
 *
 * <p>Signed, like the line itself: a return of two pieces is covered by two entries of minus
 * one. Working with absolute values here would let a return be «covered» by two positive
 * entries, which is exactly the mistake the sign rule exists to prevent.
 *
 * @param lots the numbers named so far, undefined for none
 * @returns the sum, zero where nothing is named
 */
export function allocatedQuantity(lots: readonly LineLotEntry[] | undefined): number {
  return (lots ?? []).reduce((sum, lot) => sum + lot.quantity, 0)
}

/**
 * How much of a position still carries no number.
 *
 * <p>The figure the mask shows live as «Menge 5 · zugeordnet 3 · offen 2», and the one the
 * backend refuses the issuing over. Signed, so a return counts down the same way.
 *
 * @param quantity what the position sells, may be negative on a return
 * @param lots the numbers named so far, undefined for none
 * @returns what is still open; zero when the two match exactly
 */
export function openQuantity(
  quantity: number | null,
  lots: readonly LineLotEntry[] | undefined,
): number {
  // Rounded to the four decimals a quantity is kept in. Without it `5 - 1.1 - 3.9` answers a
  // millionth instead of zero, and «Übernehmen» stays dark over a split the field below it
  // already reports as complete.
  return Math.round(((quantity ?? 0) - allocatedQuantity(lots)) * 10_000) / 10_000
}

/**
 * The line over the block: «Menge 5 · zugeordnet 3 · offen 2».
 *
 * <p>Worded and counted exactly like the one the collecting field draws under it, so the two
 * can never say different things about one position. They stand three lines apart, and a
 * reader who sees «offen 2» over «offen 0» has no way of telling which one is lying.
 *
 * <p>Unsigned throughout: a return of two pieces reads «Menge 2 · zugeordnet 2 · offen 0» like
 * everything else. The sign is a fact of the line, not something to count with.
 *
 * @param quantity what the position sells, absent while the field is empty
 * @param lots the numbers named so far, signed like the line
 * @returns the line to draw
 */
export function lotHeadline(
  quantity: number | null,
  lots: readonly LineLotEntry[] | undefined,
): string {
  const booked = quantity === null ? '—' : formatQuantity(Math.abs(quantity))
  const allocated = Math.abs(allocatedQuantity(lots))
  const open = Math.round((Math.abs(quantity ?? 0) - allocated) * 10_000) / 10_000
  const rest = open < 0 ? `${formatQuantity(-open)} zu viel` : `offen ${formatQuantity(open)}`
  return `Menge ${booked} · zugeordnet ${formatQuantity(allocated)} · ${rest}`
}

/**
 * What keeps the numbers of a position from being sent.
 *
 * <p>Every rule here is one the backend enforces as well. It is repeated in the mask because
 * a refusal that arrives after the click is a refusal the user cannot read — and because the
 * open quantity is what they need in order to fix it.
 *
 * @param quantity what the position sells
 * @param tracking how closely the product is followed, undefined for one nobody follows
 * @param lots the numbers named so far
 * @returns the sentence, or undefined where nothing is wrong
 */
export function lotProblems(
  quantity: number | null,
  tracking: ProductTracking | undefined,
  lots: readonly LineLotEntry[] | undefined,
): string | undefined {
  if (tracking === undefined || tracking === 'NONE') return undefined
  const named = lots ?? []
  const seen = new Set<string>()
  for (const lot of named) {
    if (lot.quantity === 0) return 'Eine Nummer ohne Menge sagt nichts aus.'
    if (tracking === 'SERIAL' && Math.abs(lot.quantity) !== 1) {
      return `${lot.lotNumber} ist eine Seriennummer und bewegt genau ein Stück.`
    }
    const key = lot.lotNumber.trim().toLowerCase()
    if (seen.has(key)) return `${lot.lotNumber} steht zweimal auf dieser Position.`
    seen.add(key)
  }
  const open = openQuantity(quantity, named)
  if (open === 0) return undefined
  // Too many is not the same complaint as too few, and the field says so three lines below.
  // One wording for both put «Noch 1 ohne Nummer.» beside «Es sind 1 zu viel zugeordnet.» —
  // on the very path a shortened quantity leads to.
  //
  // The sign of `open` alone does not tell the two apart: these entries are signed, so a
  // return of 2 with one number assigned is also `-1`, and it is short, not over. What marks
  // an overshoot is `open` pointing against the line — the numbers reach past the quantity.
  const overshoot = open !== 0 && Math.sign(open) === -Math.sign(quantity ?? 0)
  if (overshoot) return `Es sind ${formatQuantity(Math.abs(open))} zu viel zugeordnet.`
  return `Noch ${formatQuantity(Math.abs(open))} ohne Nummer.`
}

/**
 * The numbers of a position as one line, for the positions table.
 *
 * <p>Shortened after three, because a table row is one line and forty serial numbers would
 * push every other column off the screen. The printed document shows all of them — that is
 * where the proof is needed, and there it may run over several lines (backend ADR-0069).
 *
 * @param lots the numbers of the line, undefined for none
 * @returns for example «Serien: SN-4711, SN-4712, +3», empty where the line carries none
 */
export function lotSummary(lots: readonly DocumentLineLot[] | undefined): string {
  const named = lots ?? []
  if (named.length === 0) return ''
  const head = named[0].tracking === 'SERIAL' ? 'Serien' : 'Chargen'
  const shown = named.slice(0, 3).map((lot) => lot.lotNumber)
  const rest = named.length - shown.length
  return `${head}: ${shown.join(', ')}${rest > 0 ? `, +${rest}` : ''}`
}
