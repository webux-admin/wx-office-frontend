import { formatDate, parseDecimal } from '../../lib/format'
import type { PriceEntryResult, PriceEntryRow } from '../../lib/types'

/**
 * One price somebody typed, together with what stood in the field before.
 *
 * <p>The old value travels with the change on purpose. The screen filters and pages while it
 * is being filled in, so the row a price belongs to is not necessarily on screen any more when
 * the save happens — and without the old value nothing could say afterwards whether the field
 * was really changed.
 */
export type PriceEdit = {
  /** What is in the field now, exactly as typed. */
  text: string
  /** What stood there, empty where the target had no price of its own. */
  stored: string
  /** The product, so a complaint can name it. */
  name: string
}

/** Every typed price, keyed by product. */
export type PriceEdits = Record<number, PriceEdit>

/**
 * The own price of a row, as it belongs in the field.
 *
 * <p>Not formatted with thousands separators: the value goes straight back into an input, and
 * an apostrophe in a number field is a value nobody can save.
 *
 * @param row the row as the server sent it
 * @returns the amount as text, empty where the target has no price of its own
 */
export function ownPriceText(row: PriceEntryRow): string {
  return row.ownPrice === undefined || row.ownPrice === null ? '' : String(row.ownPrice)
}

/**
 * What one field shows: what was typed for it, otherwise what is stored.
 *
 * @param row   the row as the server sent it
 * @param edits everything typed so far
 * @returns the text of the field
 */
export function fieldValue(row: PriceEntryRow, edits: PriceEdits): string {
  return edits[row.productId]?.text ?? ownPriceText(row)
}

/**
 * Records one keystroke.
 *
 * <p>Typing the stored value back, character for character, takes the change away again
 * instead of leaving a change that changes nothing.
 *
 * @param edits everything typed so far
 * @param row   the row that was typed in
 * @param text  what is in the field now
 * @returns the new set of changes
 */
export function withEdit(edits: PriceEdits, row: PriceEntryRow, text: string): PriceEdits {
  const stored = ownPriceText(row)
  const next = { ...edits }
  if (text === stored) {
    delete next[row.productId]
    return next
  }
  next[row.productId] = { text, stored, name: row.name }
  return next
}

/**
 * Takes one field back to what is stored.
 *
 * @param edits everything typed so far
 * @param productId the product whose field is being reset
 * @returns the new set of changes
 */
export function withoutEdit(edits: PriceEdits, productId: number): PriceEdits {
  const next = { ...edits }
  delete next[productId]
  return next
}

/**
 * The amount as a number, or what makes it unusable.
 *
 * <p>An empty field is not a price of nought — it means «this product follows the group
 * again» — so it answers `null` as a legitimate value rather than as a complaint.
 */
function amountOf(text: string): { price: number | null } | 'unreadable' {
  if (text.trim() === '') return { price: null }
  const price = parseDecimal(text)
  return price === null ? 'unreadable' : { price }
}

/**
 * Whether a typed value really differs from what is stored.
 *
 * <p>Compared as numbers, so «120.00» over a stored 120 is not counted as a change. A value
 * that does not read as a number counts as a change — it has to reach the complaint rather
 * than be quietly dropped.
 *
 * @param edit one typed price
 * @returns true when saving would write or remove something
 */
export function isRealChange(edit: PriceEdit): boolean {
  const typed = amountOf(edit.text)
  const stored = amountOf(edit.stored)
  if (typed === 'unreadable') return true
  if (stored === 'unreadable') return true
  return typed.price !== stored.price
}

/**
 * How many prices a save would touch.
 *
 * @param edits everything typed so far
 * @returns the count the button says
 */
export function editedCount(edits: PriceEdits): number {
  return Object.values(edits).filter(isRealChange).length
}

/**
 * The rows of the request.
 *
 * <p>Only what really changed: a field somebody clicked into and left alone is not a price.
 * A price of `undefined` takes the target's own row away.
 *
 * <p>A value that does not read as a number is left out rather than sent as an empty field.
 * {@link firstComplaint} stops such a save before it starts; if it ever did not, leaving the
 * row out changes nothing, while sending it empty would delete a price because of a typo.
 *
 * @param edits everything typed so far
 * @returns the payload rows, in ascending product order so a retry sends the same request
 */
export function payloadRows(edits: PriceEdits): { productId: number; price?: number }[] {
  const rows: { productId: number; price?: number }[] = []
  for (const [productId, edit] of Object.entries(edits)) {
    if (!isRealChange(edit)) continue
    const typed = amountOf(edit.text)
    if (typed === 'unreadable') continue
    rows.push({ productId: Number(productId), price: typed.price ?? undefined })
  }
  return rows.sort((left, right) => left.productId - right.productId)
}

/**
 * What the button says next to it.
 *
 * @param count how many prices were typed
 * @returns for example «3 Preise geändert», empty while nothing was typed
 */
export function changeCountText(count: number): string {
  if (count === 0) return ''
  return count === 1 ? '1 Preis geändert' : `${count} Preise geändert`
}

/**
 * Checks what can be checked here, before anything is sent.
 *
 * <p>Deliberately little: whether two periods overlap is decided by the backend and by the
 * database behind it. This catches what somebody can see at a glance, so the screen can say
 * it in German instead of echoing a sentence from the server.
 *
 * @param edits        everything typed so far
 * @param validFrom    the ab-date of the whole entry, empty for no start
 * @param validTo      the bis-date, empty for no end
 * @param targetChosen whether a price group or a customer is picked
 * @returns the German complaint, or `null` when nothing is obviously wrong
 */
export function firstComplaint(
  edits: PriceEdits,
  validFrom: string,
  validTo: string,
  targetChosen: boolean,
): string | null {
  if (!targetChosen) {
    return 'Wählen Sie zuerst eine Preisgruppe oder einen Kunden.'
  }
  if (validFrom !== '' && validTo !== '' && validTo < validFrom) {
    return 'Das Bis-Datum darf nicht vor dem Ab-Datum liegen.'
  }
  for (const edit of Object.values(edits)) {
    if (!isRealChange(edit)) continue
    const typed = amountOf(edit.text)
    if (typed === 'unreadable') {
      return `Der Preis von «${edit.name}» ist keine Zahl, zum Beispiel 1250.00.`
    }
    if (typed.price !== null && typed.price < 0) {
      return `Der Preis von «${edit.name}» darf nicht negativ sein.`
    }
  }
  return null
}

/**
 * What the screen reports after a save.
 *
 * <p>Names the two things nobody typed — a price taken away and a running price that was
 * ended — because a silent change to a price is the one thing this screen must not do.
 *
 * @param result the three counts of the answer
 * @returns the sentence to show
 */
export function savedText(result: PriceEntryResult): string {
  const parts: string[] = []
  if (result.written > 0) {
    parts.push(result.written === 1 ? '1 Preis gespeichert' : `${result.written} Preise gespeichert`)
  }
  if (result.removed > 0) {
    parts.push(result.removed === 1 ? '1 Preis entfernt' : `${result.removed} Preise entfernt`)
  }
  if (result.closed > 0) {
    parts.push(
      result.closed === 1
        ? '1 laufender Preis am Vortag beendet'
        : `${result.closed} laufende Preise am Vortag beendet`,
    )
  }
  return parts.length === 0 ? 'Nichts zu speichern' : `${parts.join(', ')}.`
}

/**
 * The row a key press moves the cursor to.
 *
 * <p>Down and up walk the column; the ends do not wrap, because a price list is read from top
 * to bottom and a cursor that jumps back to the first row reads as a mis-hit.
 *
 * @param key     the key that was pressed
 * @param current the row the cursor is in, zero based
 * @param count   how many rows are on screen
 * @returns the row to move to, or `null` when the press moves nothing
 */
export function nextRow(key: string, current: number, count: number): number | null {
  if (key === 'ArrowDown' || key === 'Enter' || key === 'NumpadEnter') {
    return current + 1 < count ? current + 1 : null
  }
  if (key === 'ArrowUp') return current > 0 ? current - 1 : null
  return null
}

/**
 * The day before an ISO date.
 *
 * <p>Counted in UTC on purpose: a date field carries a day, not a moment, and doing the sum
 * in local time turns 1 January into 30 December for everybody east of Greenwich.
 *
 * @param iso the first day of the new period, empty where none was given
 * @returns the day before as an ISO date, empty where nothing was given
 */
export function dayBefore(iso: string): string {
  if (iso === '') return ''
  const date = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return ''
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}

/**
 * Since when the own price shown in a field applies.
 *
 * <p>The field shows the row that applies on the first day of the period being typed, which
 * is often an older row running without an end. Saying so keeps that number from reading as
 * «this is already the price of the new period».
 *
 * @param row the row as the server sent it
 * @returns for example «ab 01.01.2020», empty where the target has no price of its own
 */
export function periodText(row: PriceEntryRow): string {
  if (row.ownPrice === undefined || row.ownPrice === null) return ''
  const from = row.ownValidFrom === undefined ? '' : `ab ${formatDate(row.ownValidFrom)}`
  const to = row.ownValidTo === undefined ? '' : `bis ${formatDate(row.ownValidTo)}`
  const period = [from, to].filter((part) => part !== '').join(' ')
  return period === '' ? 'ohne Zeitraum' : period
}
