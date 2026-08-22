import { parseDecimal } from '../../lib/format'
import type { PriceRow, Product } from '../../lib/types'

/**
 * One line of the price table while it is being filled in.
 *
 * <p>Every value is a string, because that is what an input holds. `key` exists only for
 * React: a row that has never been saved has no id, and using the index would make the whole
 * table jump whenever a line above it is removed.
 *
 * <p>`priceGroup` empty means the base price — the step everything falls back to when neither
 * a customer price nor a group price applies.
 */
export type PriceRowForm = {
  key: string
  id?: number
  priceGroup: string
  minQuantity: string
  validFrom: string
  validTo: string
  price: string
}

let nextKey = 0

/**
 * An empty line for the price table.
 *
 * @returns the line, as the base price from the first unit and without end
 */
export function emptyPriceRow(): PriceRowForm {
  nextKey += 1
  return {
    key: `new-${nextKey}`,
    priceGroup: '',
    minQuantity: '',
    validFrom: '',
    validTo: '',
    price: '',
  }
}

/**
 * Fills the price table from a stored product.
 *
 * @param product the product as the API returned it, or `null` while creating
 * @returns one line per stored price, in the order the backend sorted them
 */
export function toPriceRowForm(product: Product | null): PriceRowForm[] {
  return (product?.prices ?? []).map((row) => {
    nextKey += 1
    return {
      key: row.id === undefined ? `stored-${nextKey}` : `stored-${row.id}`,
      id: row.id,
      priceGroup: row.priceGroupId?.toString() ?? '',
      // 0 is the base entry and needs no saying; showing it would suggest it were a choice.
      minQuantity: row.minQuantity ? row.minQuantity.toString() : '',
      validFrom: row.validFrom ?? '',
      validTo: row.validTo ?? '',
      price: row.price.toString(),
    }
  })
}

/**
 * Whether a line is still completely untouched.
 *
 * <p>Only such a line may be dropped on the way out. A line where anything at all was typed
 * counts, even if the amount does not read as a number — dropping it would delete a stored
 * price because of a typo.
 *
 * @param row the line of the table
 * @returns true when every field of the line is empty
 */
export function isBlankRow(row: PriceRowForm): boolean {
  return (
    row.priceGroup === '' &&
    row.minQuantity.trim() === '' &&
    row.validFrom === '' &&
    row.validTo === '' &&
    row.price.trim() === ''
  )
}

/**
 * Turns the price table into the payload of `PUT /products/{id}/prices`.
 *
 * <p>Only untouched lines are left out: a freshly added line nobody filled in is not a price
 * of nought. A line that was written but does not read as a number is **not** dropped here —
 * it is refused by {@link firstPriceComplaint} before the request is built, because the
 * request replaces the stored list and a dropped line means a deleted price.
 *
 * @param rows the lines of the table
 * @returns the prices as the API wants them
 */
export function toPricePayload(rows: PriceRowForm[]): PriceRow[] {
  const payload: PriceRow[] = []
  for (const row of rows) {
    if (isBlankRow(row)) continue
    payload.push({
      priceGroupId: row.priceGroup === '' ? undefined : Number(row.priceGroup),
      minQuantity: parseDecimal(row.minQuantity) ?? undefined,
      validFrom: row.validFrom === '' ? undefined : row.validFrom,
      validTo: row.validTo === '' ? undefined : row.validTo,
      price: parseDecimal(row.price) ?? 0,
    })
  }
  return payload
}

/**
 * Whether the price table has to be sent at all.
 *
 * <p>Its own request, so a mask that nobody touched stays one call. Compared as payloads
 * rather than as lines, because a line the operator started and left empty is not a change.
 *
 * @param rows the lines of the table
 * @param product the stored product, or `null` while creating
 * @returns true when the stored prices differ from what the table holds
 */
export function pricesChanged(rows: PriceRowForm[], product: Product | null): boolean {
  const wanted = toPricePayload(rows)
  const stored = toPricePayload(toPriceRowForm(product))
  return JSON.stringify(wanted) !== JSON.stringify(stored)
}

/**
 * Checks what can be checked here, which is little.
 *
 * <p>Whether two periods overlap is decided by the backend, and by the database behind it.
 * This only catches what the operator can see at a glance, so the mask can say it in German
 * instead of echoing an English sentence from the server.
 *
 * <p>It has a second job that is not cosmetic. The request replaces the whole stored list, so
 * a number the mask cannot read must stop the save: sending the line without it would delete
 * a price the operator meant to correct.
 *
 * @param rows the lines of the table
 * @returns the German complaint, or `null` when nothing is obviously wrong
 */
export function firstPriceComplaint(rows: PriceRowForm[]): string | null {
  for (const row of rows) {
    if (isBlankRow(row)) continue
    if (parseDecimal(row.price) === null) {
      return 'Jede Preiszeile braucht einen lesbaren Betrag, zum Beispiel 1250.00.'
    }
    if (row.minQuantity.trim() !== '' && parseDecimal(row.minQuantity) === null) {
      return 'Ab Menge muss eine Zahl sein, zum Beispiel 10.'
    }
    if (row.validFrom !== '' && row.validTo !== '' && row.validTo < row.validFrom) {
      return 'Das Bis-Datum darf nicht vor dem Ab-Datum liegen.'
    }
  }
  return null
}
