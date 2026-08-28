import { formatDate, formatQuantity, parseDecimal } from '../../lib/format'
import { lotKindLabel } from '../../lib/inventory'
import type {
  IssuedLot,
  LotAllocation,
  LotKind,
  LotProposal,
  LotProposalLine,
  SerialNumberHolding,
} from '../../lib/types'

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

/** How many lots a take-out proposal names at most, as `LotProposal.MAX_LINES` caps it. */
export const LOT_PROPOSAL_MAX_LINES = 20

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

/** What taking one number in did to the rows. */
export type SerialTake = {
  rows: LotRow[]
  /** The key of the row that already carries this number as a piece, for the highlight. */
  duplicate: string | null
  /** True where the number is none the location holds, so nothing was taken. */
  unlisted: boolean
}

/**
 * Takes a number in: a new one as a row of its own, one the list already names by picking it.
 *
 * <p>«Already recorded» means a number that already carries a piece, not one that merely
 * stands in the list. The server lists every lot at the location and proposes only some — the
 * expired ones and everything beyond the asked quantity come with nothing filled in, so that
 * another piece can be chosen (backend ADR-0069). Reading those as a repeat would leave them
 * unreachable from every way in, and the position could only ever be what FEFO named.
 *
 * <p>Scanning the same label twice is a slip of the hand, not a second piece: the number stays
 * once and the caller is told which row to highlight. Without that a double scan silently
 * books one piece too many.
 *
 * @param rows the numbers so far, the listed ones among them
 * @param input what was typed or scanned
 * @param onlyListed true on a take-out whose list is known to name every number the location
 *                   holds: one that is not in it has no stock there and is refused rather than
 *                   counted against the open quantity
 * @returns the rows, the row a repeated number stands in, and whether it was refused
 */
export function addSerialNumber(
  rows: readonly LotRow[],
  input: string,
  onlyListed = false,
): SerialTake {
  const lotNumber = input.trim()
  if (lotNumber === '') return { rows: [...rows], duplicate: null, unlisted: false }
  const listed = rows.find((row) => sameNumber(row.lotNumber, lotNumber))
  if (listed !== undefined) {
    if ((parseDecimal(listed.quantity) ?? 0) > 0) {
      return { rows: [...rows], duplicate: listed.key, unlisted: false }
    }
    // Listed and not picked: the piece lies there, it was only not proposed. Taking it is
    // what listing it is for.
    return { rows: withQuantity(rows, listed.key, '1'), duplicate: null, unlisted: false }
  }
  if (onlyListed) return { rows: [...rows], duplicate: null, unlisted: true }
  return { rows: [...rows, serialRow(lotNumber)], duplicate: null, unlisted: false }
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
): SerialTake {
  return numbers.reduce<SerialTake>(
    (carried, number) => {
      const next = addSerialNumber(carried.rows, number)
      return {
        rows: next.rows,
        duplicate: next.duplicate ?? carried.duplicate,
        unlisted: next.unlisted || carried.unlisted,
      }
    },
    { rows: [...rows], duplicate: null, unlisted: false },
  )
}

/**
 * Puts a number that once went out into the batch lines.
 *
 * <p>Into the line that is still without a number, so the everyday return — one line, the
 * whole quantity, one batch — is a single click. A second click on another number opens a
 * line of its own instead of overwriting the first.
 *
 * <p>A number that is already in stands once: picking it twice is a slip of the hand, and
 * two lines under one number would be refused by the server anyway.
 *
 * @param rows the lines so far
 * @param lotNumber the number that was picked
 * @returns the lines with that number in them
 */
export function withIssuedNumber(rows: readonly LotRow[], lotNumber: string): LotRow[] {
  const picked = lotNumber.trim()
  if (picked === '') return [...rows]
  if (rows.some((row) => sameNumber(row.lotNumber, picked))) return [...rows]
  const free = rows.find((row) => row.lotNumber !== null && row.lotNumber.trim() === '')
  if (free !== undefined) return withNumber(rows, free.key, picked)
  return [...rows, { ...emptyRow(nextKey(rows)), lotNumber: picked }]
}

/**
 * What is said about a number that is not among the ones that last went out.
 *
 * <p>A warning and never a block: the choice on a return is free (backend ADR-0073). It says
 * «not among the last ones» rather than «never delivered», because that is all the answer
 * knows — the server names the most recent numbers, not every number this product ever
 * carried out of the house. The list is capped, so this sentence can appear over a number
 * that is very much out with a customer; the price of an extract is one needless sentence,
 * which is exactly why nothing is refused here (backend ADR-0073).
 *
 * @param rows the lines as they stand
 * @param issued what last went out, absent while the answer is on its way
 * @returns the German sentence, or `null` where every number is one that went out
 */
export function neverIssuedWarning(
  rows: readonly LotRow[],
  issued: readonly IssuedLot[] | undefined,
): string | null {
  if (issued === undefined) return null
  const known = new Set(issued.map((one) => one.lotNumber.trim().toLocaleLowerCase('de-CH')))
  const strangers = rows
    .filter((row) => (parseDecimal(row.quantity) ?? 0) > 0)
    .map((row) => (row.lotNumber ?? '').trim())
    .filter((lotNumber) => lotNumber !== '')
    .filter((lotNumber) => !known.has(lotNumber.toLocaleLowerCase('de-CH')))
  if (strangers.length === 0) return null
  // Exactly one more is written out, as German writes it — «und eine weitere», never «und 1
  // weitere». The same rule the reservation sentence follows in `lib/inventory`.
  const rest = strangers.length - 1
  const more = rest === 1 ? 'eine weitere' : `${rest} weitere`
  const named = rest === 0 ? `${strangers[0]} ist` : `${strangers[0]} und ${more} sind`
  return `${named} nicht unter den zuletzt ausgelieferten Nummern. Die Rücknahme wird trotzdem gebucht.`
}

/**
 * What is said about a number that is already lying in the warehouse.
 *
 * <p>Unlike {@link neverIssuedWarning} this one names what will happen: the server refuses a
 * return that brings a piece back which never left, and it refuses it when the document is
 * issued (backend ADR-0077). Saying so while the number is typed saves searching for the guilty
 * position on a return over twenty devices (backend ADR-0081).
 *
 * <p>Still a warning and not a block. The mask does not decide what is refused — it asks, and
 * the server answers with a location only where a warning is due. A batch, a number nobody ever
 * wrote down and a number that lies nowhere all come back without one.
 *
 * <p>The location is named only where there is exactly one number to name it for. «SN-1 und
 * zwei weitere liegen in Hauptlager» would be a lie as soon as they lie in different places.
 *
 * @param rows the lines as they stand
 * @param holdings what the server answered about the numbers in them, by number
 * @returns the German sentence, or `null` where no number lies anywhere
 */
export function alreadyInStockWarning(
  rows: readonly LotRow[],
  holdings: ReadonlyMap<string, SerialNumberHolding>,
): string | null {
  const lying = rows
    .filter((row) => (parseDecimal(row.quantity) ?? 0) > 0)
    .map((row) => (row.lotNumber ?? '').trim())
    .filter((lotNumber) => lotNumber !== '')
    .map((lotNumber) => holdings.get(lotNumber.toLocaleLowerCase('de-CH')))
    .filter((holding): holding is SerialNumberHolding => (holding?.locationName ?? null) !== null)
  const named = lying.filter(
    (holding, at) => lying.findIndex((one) => one.lotNumber === holding.lotNumber) === at,
  )
  if (named.length === 0) return null
  if (named.length === 1) {
    return `${named[0].lotNumber} liegt bereits in ${named[0].locationName}.`
      + ' Das Ausstellen weist die Position ab.'
  }
  // Exactly one more is written out, as German writes it — «und eine weitere», never «und 1
  // weitere». The same rule the sentence above follows.
  const rest = named.length - 1
  const more = rest === 1 ? 'eine weitere' : `${rest} weitere`
  return `${named[0].lotNumber} und ${more} liegen bereits im Lager.`
    + ' Das Ausstellen weist die Position ab.'
}

/**
 * The document one number went out on, as one line: «LS-2026-0002 · 21.08.2026».
 *
 * @param issued the number as the journal answered it
 * @returns the line under the number
 */
export function issuedLabel(issued: IssuedLot): string {
  return `${issued.documentNumber} · ${formatDate(issued.bookedOn)}`
}

/**
 * Whether the answer names every number the location holds.
 *
 * <p>The server lists at most {@link LOT_PROPOSAL_MAX_LINES} lots. A full list may be one
 * short of the truth, so only a shorter one lets the field say that a scanned number has no
 * stock — a mask that refuses a number it merely did not hear about is worse than one that
 * stays quiet (backend ADR-0073).
 *
 * @param proposal what the server suggested, absent while it is on its way
 * @returns true where a number that is not in it provably has no stock at that location
 */
export function listsEveryNumber(proposal: LotProposal | undefined): boolean {
  return proposal !== undefined && proposal.lines.length < LOT_PROPOSAL_MAX_LINES
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
