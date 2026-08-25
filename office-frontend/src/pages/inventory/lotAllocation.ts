import { formatQuantity, parseDecimal } from '../../lib/format'
import { lotKindLabel } from '../../lib/inventory'
import type { LotAllocation, LotKind, LotProposal, LotProposalLine } from '../../lib/types'

/**
 * One number and what of the booked quantity falls on it, while it is being filled in.
 *
 * <p>The same row for both kinds: a serial number is a lot of one piece, drawn as a chip
 * instead of a table row but held in the same shape. `lotNumber: null` is the stock that was
 * there before the product was tracked — it can be used up, never added to.
 */
export type LotRow = {
  /** Identifies the row while it is being edited; never sent and never shown. */
  key: string
  /** The lot as the server knows it, `null` for one that is being typed or scanned. */
  lotId: number | null
  lotNumber: string | null
  expiryDate?: string | null
  expired: boolean
  /** What lies at the location. Absent on a receipt, where nothing lies yet. */
  available?: number
  /** What is being allocated, as the input holds it. */
  quantity: string
}

/** How long a lot number may be, as the column and the request both cap it. */
export const LOT_NUMBER_MAX = 60

/** How many numbers the generator hands out at most, as `InventoryRules` caps it. */
export const SERIAL_PROPOSAL_MAX = 500

/**
 * The rows of a take-out, as the server suggests them.
 *
 * <p>Earliest expiry first, expired ones behind the fresh with nothing filled in — choosable,
 * never chosen. The stock without a number comes last and only where there is any: a row
 * reading «Bestand ohne Chargennummer: 0» is noise on every product that was tracked from its
 * first booking.
 *
 * @param proposal what the server suggests taking
 * @param allowWithoutNumber false drops the row without a number, for callers that cannot
 *                           carry it — a document position freezes a number, and the stock
 *                           without one has none to freeze (backend ADR-0069)
 * @returns the rows, prefilled with the suggested quantities
 */
export function proposalRows(
  proposal: LotProposal | undefined,
  allowWithoutNumber = true,
): LotRow[] {
  if (proposal === undefined) return []
  const rows = proposal.lines.map(lineRow)
  if (!allowWithoutNumber) return rows
  const free = proposal.withoutNumber
  if (free !== undefined && free !== null && free.available > 0) rows.push(lineRow(free))
  return rows
}

/**
 * The one row a receipt of a batch starts with, carrying the whole quantity.
 *
 * <p>The normal case is one delivery under one number, so the field is one line and a glance
 * — splitting a receipt over two batches is the exception and costs a click.
 *
 * @param quantity what is being booked, absent while the field is empty
 * @returns a single empty row
 */
export function receiptRows(quantity: number | null): LotRow[] {
  return [{ ...emptyRow('row-1'), quantity: quantity === null ? '' : `${quantity}` }]
}

/**
 * An empty row for a batch number somebody types.
 *
 * @param key identifies the row while it is edited
 * @returns the row, without a number and without a quantity
 */
export function emptyRow(key: string): LotRow {
  return { key, lotId: null, lotNumber: '', expired: false, quantity: '' }
}

/**
 * The key the next typed row gets.
 *
 * <p>Counted rather than random, so the same sequence of clicks always builds the same rows —
 * a random key would make every render a new row for React and take the focus out of the
 * field being typed in.
 *
 * @param rows the rows so far
 * @returns a key none of them holds
 */
export function nextKey(rows: readonly LotRow[]): string {
  const used = rows
    .map((row) => Number(row.key.replace('row-', '')))
    .filter((number) => Number.isFinite(number))
  return `row-${Math.max(0, ...used) + 1}`
}

/**
 * One serial number as a row of exactly one piece.
 *
 * @param lotNumber the number, as it was typed, scanned or generated
 * @returns the row
 */
export function serialRow(lotNumber: string): LotRow {
  return {
    key: `sn-${lotNumber}`,
    lotId: null,
    lotNumber,
    expired: false,
    quantity: '1',
  }
}

/**
 * Takes a number into the list, unless it is already in it.
 *
 * <p>Scanning the same label twice is a slip of the hand, not a second piece: the number stays
 * once and the caller is told which row to highlight. Without that a double scan silently
 * books one piece too many.
 *
 * @param rows the numbers so far
 * @param input what was typed or scanned
 * @returns the rows and the key of the row a repeated number is already in
 */
export function addSerialNumber(
  rows: readonly LotRow[],
  input: string,
): { rows: LotRow[]; duplicate: string | null } {
  const lotNumber = input.trim()
  if (lotNumber === '') return { rows: [...rows], duplicate: null }
  const known = rows.find((row) => sameNumber(row.lotNumber, lotNumber))
  if (known !== undefined) return { rows: [...rows], duplicate: known.key }
  return { rows: [...rows, serialRow(lotNumber)], duplicate: null }
}

/**
 * Takes a whole run of generated numbers in, skipping the ones already there.
 *
 * @param rows the numbers so far
 * @param numbers what the generator handed out
 * @returns the rows and the key of the last number that was already in
 */
export function addSerialNumbers(
  rows: readonly LotRow[],
  numbers: readonly string[],
): { rows: LotRow[]; duplicate: string | null } {
  return numbers.reduce<{ rows: LotRow[]; duplicate: string | null }>(
    (carried, number) => {
      const next = addSerialNumber(carried.rows, number)
      return { rows: next.rows, duplicate: next.duplicate ?? carried.duplicate }
    },
    { rows: [...rows], duplicate: null },
  )
}

/**
 * Puts a typed quantity into one row.
 *
 * <p>A minus is not accepted at all, for the same reason the booking quantity refuses one: the
 * sign is made by the operation, not by the keyboard.
 *
 * @param rows the rows
 * @param key the row that was typed in
 * @param input the raw field value
 * @returns the updated rows
 */
export function withQuantity(rows: readonly LotRow[], key: string, input: string): LotRow[] {
  const quantity = input.replace(/-/g, '')
  return rows.map((row) => (row.key === key ? { ...row, quantity } : row))
}

/**
 * Puts a typed number into one row.
 *
 * @param rows the rows
 * @param key the row that was typed in
 * @param lotNumber the raw field value
 * @returns the updated rows
 */
export function withNumber(rows: readonly LotRow[], key: string, lotNumber: string): LotRow[] {
  return rows.map((row) => (row.key === key ? { ...row, lotNumber } : row))
}

/**
 * Drops one row.
 *
 * @param rows the rows
 * @param key the row to remove
 * @returns the remaining rows
 */
export function withoutRow(rows: readonly LotRow[], key: string): LotRow[] {
  return rows.filter((row) => row.key !== key)
}

/**
 * What the rows add up to.
 *
 * <p>Counts exactly what would travel to the server: a quantity on a line whose number is
 * still empty is not allocated to anything. Counting it would let the header say «offen 0»
 * while the booking is refused for want of a number.
 *
 * @param rows the rows
 * @returns the sum, counting an empty or numberless line as nothing
 */
export function allocatedOf(rows: readonly LotRow[]): number {
  return toAllocations(rows).reduce((sum, allocation) => sum + allocation.quantity, 0)
}

/**
 * What is still waiting to be given a number.
 *
 * @param quantity what is being booked, absent while the field is empty
 * @param rows the rows
 * @returns the difference; negative means more was allocated than booked
 */
export function openOf(quantity: number | null, rows: readonly LotRow[]): number {
  return round((quantity ?? 0) - allocatedOf(rows))
}

/**
 * Whether the whole quantity carries a number.
 *
 * @param quantity what is being booked, absent while the field is empty
 * @param rows the rows
 * @returns true when nothing is open and nothing is over
 */
export function isAllocated(quantity: number | null, rows: readonly LotRow[]): boolean {
  return quantity !== null && quantity > 0 && openOf(quantity, rows) === 0
}

/**
 * The line over the field: «Menge 5 · zugeordnet 3 · offen 2».
 *
 * <p>Three numbers rather than one, because the one that matters is the third and nobody
 * should have to subtract to see it.
 *
 * @param quantity what is being booked, absent while the field is empty
 * @param rows the rows
 * @returns the line
 */
export function allocationSummary(quantity: number | null, rows: readonly LotRow[]): string {
  const booked = quantity === null ? '—' : formatQuantity(quantity)
  const open = openOf(quantity, rows)
  const rest = open < 0 ? `${formatQuantity(-open)} zu viel` : `offen ${formatQuantity(open)}`
  return `Menge ${booked} · zugeordnet ${formatQuantity(allocatedOf(rows))} · ${rest}`
}

/**
 * What is announced after a number was taken in.
 *
 * <p>Read out rather than only drawn: whoever scans looks at the label in their hand, not at
 * the screen, and has to hear that the piece arrived.
 *
 * @param lotNumber the number that was taken in
 * @param quantity what is being booked, absent while the field is empty
 * @param rows the rows after it was taken in
 * @returns for example «SN-4711 hinzugefügt, 4 von 5 zugeordnet»
 */
export function allocationAnnouncement(
  lotNumber: string,
  quantity: number | null,
  rows: readonly LotRow[],
): string {
  const booked = quantity === null ? '—' : formatQuantity(quantity)
  return `${lotNumber} hinzugefügt, ${formatQuantity(allocatedOf(rows))} von ${booked} zugeordnet`
}

/**
 * Turns the rows into what the booking sends.
 *
 * <p>Empty rows fall away rather than travelling as a zero: a row somebody added and left
 * alone is not a statement about the goods.
 *
 * @param rows the rows
 * @returns one entry per number that carries a quantity
 */
export function toAllocations(rows: readonly LotRow[]): LotAllocation[] {
  return rows
    .map((row) => ({
      lotNumber: row.lotNumber === null ? null : row.lotNumber.trim(),
      quantity: parseDecimal(row.quantity) ?? 0,
    }))
    .filter((allocation) => allocation.quantity > 0)
    .filter((allocation) => allocation.lotNumber === null || allocation.lotNumber !== '')
}

/**
 * What is wrong with the split, before anything is sent.
 *
 * <p>Shown next to the disabled button rather than after a click: a rule that only speaks once
 * the work is done teaches people to guess.
 *
 * @param quantity what is being booked, absent while the field is empty
 * @param rows the rows
 * @param kind whether the product carries batches or serial numbers
 * @returns the German complaint, or `null` when the split is sound
 */
export function lotComplaint(
  quantity: number | null,
  rows: readonly LotRow[],
  kind: LotKind,
): string | null {
  const numbered = rows.filter((row) => (parseDecimal(row.quantity) ?? 0) > 0)
  const missing = numbered.find(
    (row) => row.lotNumber !== null && row.lotNumber.trim() === '',
  )
  if (missing !== undefined) {
    return `Jede Zeile braucht eine ${lotKindLabel(kind)}.`
  }
  const twice = duplicateNumber(numbered)
  if (twice !== null) {
    return `Die ${lotKindLabel(kind)} ${twice} steht zweimal.`
  }
  const tooLong = numbered.find(
    (row) => row.lotNumber !== null && row.lotNumber.trim().length > LOT_NUMBER_MAX,
  )
  if (tooLong !== undefined) {
    return `Eine ${lotKindLabel(kind)} ist höchstens ${LOT_NUMBER_MAX} Zeichen lang.`
  }
  if (quantity === null || quantity <= 0) return null
  const open = openOf(quantity, rows)
  if (open > 0) {
    return kind === 'SERIAL'
      ? `Es fehlen noch ${formatQuantity(open)} Seriennummern.`
      : `Ordnen Sie die ganze Menge zu. Offen: ${formatQuantity(open)}.`
  }
  if (open < 0) {
    return `Es sind ${formatQuantity(-open)} zu viel zugeordnet.`
  }
  return null
}

/**
 * Whether the location cannot cover what is asked for.
 *
 * @param proposal what the server suggested, absent while it is on its way
 * @returns the German sentence, or `null` where every piece is covered
 */
export function uncoveredWarning(proposal: LotProposal | undefined): string | null {
  const uncovered = proposal?.uncovered ?? 0
  if (uncovered <= 0) return null
  return `${formatQuantity(uncovered)} sind an diesem Lagerort nicht gedeckt.`
}

/**
 * One row of a proposal, ready to be edited.
 *
 * @param line what the server suggested for one number
 * @returns the row
 */
function lineRow(line: LotProposalLine): LotRow {
  return {
    key: line.lotId === null ? 'free' : `lot-${line.lotId}`,
    lotId: line.lotId,
    lotNumber: line.lotNumber,
    expiryDate: line.expiryDate,
    expired: line.expired,
    available: line.available,
    quantity: line.proposed > 0 ? `${line.proposed}` : '',
  }
}

/**
 * The first number that carries a quantity twice.
 *
 * @param rows the rows that carry a quantity
 * @returns the number, or `null` where each stands once
 */
function duplicateNumber(rows: readonly LotRow[]): string | null {
  const seen = new Set<string>()
  for (const row of rows) {
    if (row.lotNumber === null) continue
    const key = row.lotNumber.trim().toLocaleLowerCase('de-CH')
    if (seen.has(key)) return row.lotNumber.trim()
    seen.add(key)
  }
  return null
}

/**
 * Whether two numbers are the same one.
 *
 * <p>Case is ignored, as the unique index in the database ignores it: `sn-4711` and `SN-4711`
 * are one number, and a scanner reading the second while the first is already in the list must
 * not add a piece.
 *
 * @param one the number of a row, `null` for the stock without a number
 * @param other what was typed or scanned
 * @returns true where they name the same lot
 */
function sameNumber(one: string | null, other: string): boolean {
  if (one === null) return false
  return one.trim().toLocaleLowerCase('de-CH') === other.trim().toLocaleLowerCase('de-CH')
}

/**
 * Rounds a difference to the four decimals the quantities are kept in.
 *
 * <p>Without it `5 - 1.1 - 3.9` answers a millionth instead of zero, and the button stays
 * disabled on a split that is in fact complete.
 *
 * @param value the difference
 * @returns the value at four decimals
 */
function round(value: number): number {
  return Math.round(value * 10_000) / 10_000
}
