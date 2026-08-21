/**
 * What the head of a draft holds, and what it sends.
 *
 * <p>Nothing is priced here and nothing is converted here. The one rule this file knows
 * about money is which positions a re-pricing cannot answer for: the ones somebody typed a
 * figure into. The mask names them before the request goes out, because afterwards nothing
 * on screen says which lines were left alone.
 */
import { parseDecimal } from '../../lib/format'
import type { CopyPriceMode, DocumentLine, SalesDocument } from '../../lib/types'

/**
 * The head of a draft while it is being edited.
 *
 * <p>Every field is a string, because that is what an input holds. Turning them into what the
 * API expects happens once, on the way out.
 */
export type HeaderForm = {
  documentDate: string
  /** Language code, empty while the list has not arrived. */
  language: string
  /** Currency code as its stable code, for example `CHF`. */
  currency: string
  exchangeRate: string
  exchangeRateDate: string
}

/**
 * Payload of `PUT /api/tenants/{tenantId}/{documents}/{id}/header`.
 *
 * <p>A field that is left out stays as it is stored. That is why the payload is built from
 * what actually changed: sending the customer back unchanged would make the backend take the
 * address out of the master data again, and a draft written before the customer moved would
 * quietly move with them.
 */
export type UpdateHeaderRequest = {
  partnerId?: number
  documentDate?: string
  languageCode?: string
  currencyCode?: string
  exchangeRate?: number
  exchangeRateDate?: string
  /** What happens to the catalogue lines; `RECALCULATE` prices them anew. */
  priceMode?: CopyPriceMode
}

/**
 * Fills the section from a stored document.
 *
 * @param document the draft as the API returned it
 * @returns the section, with every missing field as an empty string
 */
export function toHeaderForm(document: SalesDocument): HeaderForm {
  return {
    documentDate: document.documentDate ?? '',
    language: document.language ?? '',
    currency: document.currency ?? '',
    exchangeRate: document.exchangeRate?.toString() ?? '',
    exchangeRateDate: document.exchangeRateDate ?? '',
  }
}

/**
 * A key over the stored head, for the `key` of the section that edits it.
 *
 * <p>The section holds what was typed in local state, and that state has to give way when the
 * document changes underneath it — after a customer change, which rewrites language and
 * payment term, or after the backend normalised what was sent. Remounting on a new key is the
 * whole mechanism: no second copy of the values, no effect that syncs them.
 *
 * @param document the draft as the API returned it
 * @returns a string that differs as soon as any field of the head differs
 */
export function headerKey(document: SalesDocument): string {
  const form = toHeaderForm(document)
  return [form.documentDate, form.language, form.currency, form.exchangeRate, form.exchangeRateDate].join('|')
}

/**
 * A key over the stored payment terms, for the `key` of the section that edits them.
 *
 * <p>Same reason as {@link headerKey}: a customer change rewrites the term, and the section
 * has to show what is stored rather than what stood in it before the change.
 *
 * @param document the document as the API returned it
 * @returns a string that differs as soon as term or due date differ
 */
export function paymentKey(document: SalesDocument): string {
  return `${document.paymentTerm ?? ''}|${document.dueDate ?? ''}`
}

/**
 * Whether the currency in the section differs from the one the document is written in.
 *
 * <p>Worth saying out loud in the mask: the backend converts every amount on the document at
 * the exchange rate, so the figures change even though nobody typed a new one (ADR-0037).
 *
 * @param form the section as it stands
 * @param document the stored draft
 */
export function currencyChanged(form: HeaderForm, document: SalesDocument): boolean {
  return form.currency !== '' && form.currency !== document.currency
}

/**
 * Whether anything in the section differs from what is stored.
 *
 * @param form the section as it stands
 * @param document the stored draft
 * @returns true while the "Übernehmen" button would send nothing
 */
export function headerUnchanged(form: HeaderForm, document: SalesDocument): boolean {
  const stored = toHeaderForm(document)
  return (Object.keys(stored) as (keyof HeaderForm)[]).every(
    (field) => form[field].trim() === stored[field].trim(),
  )
}

/**
 * The head as the API takes it.
 *
 * <p>Only changed fields travel, see {@link UpdateHeaderRequest}. An emptied exchange rate is
 * therefore not sent as a removal: a rate is dropped by writing the document in the currency
 * of the tenant, not by clearing the field.
 *
 * @param form the section as it stands
 * @param document the stored draft
 * @param priceMode what happens to the catalogue lines
 * @returns what to put into the request body
 */
export function headerPayload(
  form: HeaderForm,
  document: SalesDocument,
  priceMode: CopyPriceMode,
): UpdateHeaderRequest {
  const stored = toHeaderForm(document)
  const rate = parseDecimal(form.exchangeRate)
  return {
    documentDate: changed(form.documentDate, stored.documentDate),
    languageCode: changed(form.language, stored.language),
    currencyCode: changed(form.currency, stored.currency),
    exchangeRate: changed(form.exchangeRate, stored.exchangeRate) && rate !== null ? rate : undefined,
    exchangeRateDate: changed(form.exchangeRateDate, stored.exchangeRateDate),
    priceMode,
  }
}

function changed(value: string, stored: string): string | undefined {
  const trimmed = value.trim()
  return trimmed === stored.trim() ? undefined : trimmed
}

/**
 * The positions somebody typed a price into, by the number they are printed under.
 *
 * <p>These are the lines a re-pricing leaves alone: there is no catalogue entry behind them,
 * so nothing can be looked up. Whoever changes the customer or the currency has to read them
 * again, and the mask is the only place that knows which ones they are.
 *
 * @param lines the lines of the document, undefined for one that has none
 * @returns the line numbers in printing order, empty when every position comes from the
 *          catalogue
 */
export function freeLineNumbers(lines: readonly DocumentLine[] | undefined): number[] {
  return (lines ?? [])
    .filter((line) => line.kind === 'ITEM' && (line.productId === undefined || line.productId === null))
    .map((line) => line.lineNumber)
}

/**
 * Lists numbers the way they are read out loud in German: `2, 5 und 7`.
 *
 * @param numbers the line numbers, in the order they are printed
 * @returns the enumeration, an empty string for no numbers at all
 */
export function listNumbers(numbers: readonly number[]): string {
  if (numbers.length === 0) return ''
  if (numbers.length === 1) return String(numbers[0])
  return `${numbers.slice(0, -1).join(', ')} und ${numbers[numbers.length - 1]}`
}

/**
 * What the mask says before it re-prices a document that carries hand-written positions.
 *
 * <p>The backend reports nothing here, and rightly so: it does exactly what it was asked to
 * do. The warning belongs where the decision is taken.
 *
 * @param lines the lines of the document
 * @param priceMode what the user chose
 * @returns the sentence to show, or undefined when there is nothing to warn about
 */
export function freeLineWarning(
  lines: readonly DocumentLine[] | undefined,
  priceMode: CopyPriceMode,
): string | undefined {
  if (priceMode !== 'RECALCULATE') return undefined
  const numbers = freeLineNumbers(lines)
  if (numbers.length === 0) return undefined
  if (numbers.length === 1) {
    return `Position ${numbers[0]} ist von Hand geschrieben und behält ihre eingegebene Zahl. Bitte nachher prüfen.`
  }
  return `Die Positionen ${listNumbers(numbers)} sind von Hand geschrieben und behalten ihre eingegebenen Zahlen. Bitte nachher prüfen.`
}
