import { formatQuantity, parseDecimal, toIsoDate } from '../../lib/format'
import { lotKindOf, manualReasonsFor, tracksLots } from '../../lib/inventory'
import type {
  BookStockRequest,
  LotAllocation,
  MovementDirection,
  MovementReason,
  Product,
  StockBalance,
  StockLocation,
  TransferStockRequest,
} from '../../lib/types'

/**
 * The three things the dialog can do.
 *
 * <p>A transfer is a kind of its own rather than a direction, because it has two locations
 * and no reason to choose — the backend always writes `TRANSFER_OUT` and `TRANSFER_IN`.
 */
export type BookingKind = 'IN' | 'OUT' | 'TRANSFER'

/** One booking while it is being filled in. Every value is a string, as an input holds it. */
export type BookStockForm = {
  kind: BookingKind
  reason: MovementReason
  product: Product | null
  /** What is in the product field: a search term, or the label of the product taken over. */
  productTerm: string
  locationId: string
  toLocationId: string
  quantity: string
  bookedOn: string
  unitCost: string
  unitCostCurrency: string
  note: string
  /** Which numbers the quantity is made of. Always empty for a product nobody tracks. */
  lots: LotAllocation[]
}

/**
 * An empty dialog.
 *
 * @param today the day the booking starts on, the current one by default
 * @param currency the tenant's currency, used as the default for a cost
 * @returns a receipt for nothing, dated today
 */
export function emptyBookStockForm(today = toIsoDate(), currency = 'CHF'): BookStockForm {
  return {
    kind: 'IN',
    reason: 'RECEIPT',
    product: null,
    productTerm: '',
    locationId: '',
    toLocationId: '',
    quantity: '',
    bookedOn: today,
    unitCost: '',
    unitCostCurrency: currency,
    note: '',
    lots: [],
  }
}

/**
 * Switches the dialog to another operation and puts a fitting reason in.
 *
 * <p>A receipt booked as an issue would be refused by the backend, so the reason follows the
 * operation rather than staying whatever was chosen before. The cost goes with it: it is
 * only asked for on a receipt.
 *
 * @param form the dialog
 * @param kind the operation now chosen
 * @returns the updated dialog
 */
export function applyKind(form: BookStockForm, kind: BookingKind): BookStockForm {
  if (kind === form.kind) return form
  const reason = kind === 'TRANSFER' ? form.reason : manualReasonsFor(kind)[0]
  return {
    ...form,
    kind,
    reason,
    toLocationId: kind === 'TRANSFER' ? form.toLocationId : '',
    unitCost: kind === 'IN' ? form.unitCost : '',
    // A receipt names numbers that do not exist yet, an issue picks numbers that lie
    // somewhere. Carrying one over into the other would send numbers nobody chose.
    lots: [],
  }
}

/**
 * Whether the booking has to name lot or serial numbers.
 *
 * @param form the dialog
 * @returns true where the chosen product is tracked
 */
export function needsLots(form: BookStockForm): boolean {
  return tracksLots(form.product)
}

/**
 * Which way the lot field is asked in: a transfer takes numbers out of its source.
 *
 * @param form the dialog
 * @returns the direction the numbers are chosen for
 */
export function lotDirectionOf(form: BookStockForm): MovementDirection {
  return form.kind === 'IN' ? 'IN' : 'OUT'
}

/**
 * What is still without a number, as a sentence for the foot of the dialog.
 *
 * <p>Stands next to the disabled button rather than appearing after the click: whoever has to
 * press to find out what is missing learns to guess instead of to read.
 *
 * @param form the dialog
 * @returns the German sentence, or `null` when every piece carries a number
 */
export function lotsComplaint(form: BookStockForm): string | null {
  if (!needsLots(form)) return null
  const quantity = parseDecimal(form.quantity)
  if (quantity === null || quantity <= 0) return null
  const allocated = form.lots.reduce((sum, lot) => sum + lot.quantity, 0)
  const open = Math.round((quantity - allocated) * 10_000) / 10_000
  if (open === 0) return null
  const kind = lotKindOf(form.product?.tracking)
  if (open < 0) return `Es sind ${formatQuantity(-open)} zu viel zugeordnet.`
  return kind === 'SERIAL'
    ? `Es fehlen noch ${formatQuantity(open)} Seriennummern.`
    : `${formatQuantity(open)} sind noch keiner Charge zugeordnet.`
}

/**
 * Takes what was typed into the quantity field.
 *
 * <p>A minus is not accepted at all — not refused after the click, but never entered: the
 * sign is made by the operation, and a typed one is one keystroke away from turning a
 * delivery into a receipt.
 *
 * @param input the raw field value
 * @returns the value the field should show
 */
export function acceptQuantity(input: string): string {
  return input.replace(/-/g, '')
}

/**
 * Whether the dialog shows a location at all.
 *
 * <p>A tenant with one single active location has nothing to choose, and a field carrying a
 * value without an alternative is noise. A transfer always shows both, because it needs two
 * and a tenant with one location cannot make one (frontend ADR-0014).
 *
 * @param locations the active locations of the tenant
 * @returns true from two active locations upwards
 */
export function showsLocationFields(locations: StockLocation[]): boolean {
  return locations.length >= 2
}

/**
 * The stock a location holds right now, as the projection reports it.
 *
 * @param balances the rows of the chosen product
 * @param locationId the location, as the field holds it
 * @returns the quantity, 0 where nothing was ever booked there
 */
export function stockAt(balances: StockBalance[], locationId: string): number {
  const id = Number(locationId)
  return balances.find((balance) => balance.locationId === id)?.quantity ?? 0
}

/**
 * The line under the fields: what the stock is now, and what it will be.
 *
 * <p>The only chance to catch a mistake before it becomes unchangeable. A transfer shows both
 * locations, because that is where the two numbers move.
 *
 * @param form the dialog
 * @param balances the stock rows of the chosen product
 * @param locations the active locations, to name them
 * @returns the lines to show, empty while the dialog cannot say anything yet
 */
export function previewLines(
  form: BookStockForm,
  balances: StockBalance[],
  locations: StockLocation[],
): string[] {
  const quantity = parseDecimal(form.quantity)
  if (form.product === null || quantity === null || quantity <= 0) return []
  const name = (id: string) =>
    locations.find((location) => `${location.id}` === id)?.name ?? 'Lagerort'

  if (form.kind === 'TRANSFER') {
    if (form.locationId === '' || form.toLocationId === '') return []
    if (form.locationId === form.toLocationId) return []
    return [
      line(name(form.locationId), stockAt(balances, form.locationId), -quantity),
      line(name(form.toLocationId), stockAt(balances, form.toLocationId), quantity),
    ]
  }
  if (form.locationId === '') return []
  const signed = form.kind === 'OUT' ? -quantity : quantity
  return [line(name(form.locationId), stockAt(balances, form.locationId), signed)]
}

function line(locationName: string, before: number, change: number): string {
  return `${locationName}: ${formatQuantity(before)} → ${formatQuantity(before + change)}`
}

/**
 * The yellow line: this booking takes the location below zero, and it is allowed to.
 *
 * <p>Only where the location warns. One set to block refuses with a 409 that names the
 * numbers, and offering «Trotzdem buchen» for it would be a lie — the server says no again.
 * Backdating is what makes a negative stock a normal state rather than a defect.
 *
 * @param form the dialog
 * @param balances the stock rows of the chosen product
 * @param locations the active locations, for their names and their policy
 * @returns the German warning, or `null` when the booking stays at or above zero
 */
export function shortfallWarning(
  form: BookStockForm,
  balances: StockBalance[],
  locations: StockLocation[],
): string | null {
  const quantity = parseDecimal(form.quantity)
  if (form.product === null || quantity === null || quantity <= 0) return null
  if (form.kind === 'IN' || form.locationId === '') return null
  const source = locations.find((location) => `${location.id}` === form.locationId)
  if (source === undefined || source.negativeStockPolicy === 'BLOCK') return null
  const after = stockAt(balances, form.locationId) - quantity
  if (after >= 0) return null
  return `${source.name} steht danach auf ${formatQuantity(after)}.`
}

/**
 * What the mask says about a scanned code nothing matches.
 *
 * <p>The field keeps the code all the same, so it can be corrected instead of typed again.
 *
 * @param code the string the scanner or the hand scanner delivered
 * @returns the German sentence
 */
export function unknownBarcodeMessage(code: string): string {
  return `Kein Artikel zu ${code} gefunden.`
}

/**
 * Checks what can be checked here, before anything is sent.
 *
 * <p>The decimal rule of the unit and the shortfall policy of the location are the server's
 * call — it knows both and answers in German. This catches what somebody sees at a glance,
 * above all a transfer onto the location it starts from.
 *
 * @param form the dialog
 * @returns the German complaint, or `null` when nothing is obviously wrong
 */
export function firstBookingComplaint(form: BookStockForm): string | null {
  if (form.product === null) {
    return 'Wählen Sie ein Produkt.'
  }
  const quantity = parseDecimal(form.quantity)
  if (quantity === null || quantity <= 0) {
    return 'Die Menge muss grösser als null sein.'
  }
  if (form.locationId === '') {
    return 'Wählen Sie einen Lagerort.'
  }
  if (form.kind === 'TRANSFER') {
    if (form.toLocationId === '') {
      return 'Wählen Sie den Ziel-Lagerort.'
    }
    if (form.toLocationId === form.locationId) {
      return 'Quelle und Ziel einer Umlagerung müssen verschieden sein.'
    }
  }
  if (form.bookedOn !== '' && form.bookedOn > toIsoDate()) {
    return 'Das Buchungsdatum darf nicht in der Zukunft liegen.'
  }
  if (form.unitCost.trim() !== '' && parseDecimal(form.unitCost) === null) {
    return 'Der Einstandspreis ist keine Zahl.'
  }
  return lotsComplaint(form)
}

/**
 * Whether the dialog may be sent at all.
 *
 * <p>Used to disable the button rather than to explain: a transfer onto the same location is
 * blocked before the click, not complained about after it.
 *
 * @param form the dialog
 * @returns true when nothing obvious is missing
 */
export function canSubmit(form: BookStockForm): boolean {
  return firstBookingComplaint(form) === null
}

/**
 * Turns the dialog into the payload of a receipt or an issue.
 *
 * @param form the dialog
 * @returns the booking as the API wants it, with an always positive quantity
 */
export function toBookPayload(form: BookStockForm): BookStockRequest {
  const cost = parseDecimal(form.unitCost)
  return {
    productId: form.product?.id ?? 0,
    locationId: Number(form.locationId),
    direction: form.kind as MovementDirection,
    reason: form.reason,
    quantity: parseDecimal(form.quantity) ?? 0,
    bookedOn: form.bookedOn === '' ? undefined : form.bookedOn,
    // All four price fields travel together or none of them does; the backend refuses an
    // amount without a currency (backend ADR-0062).
    unitCost: form.kind === 'IN' && cost !== null ? cost : undefined,
    unitCostCurrency:
      form.kind === 'IN' && cost !== null ? form.unitCostCurrency.toUpperCase() : undefined,
    note: form.note.trim() === '' ? undefined : form.note.trim(),
    // Left out rather than sent empty: the server refuses any entry on a product nobody
    // tracks, and an empty array would be one.
    lots: form.lots.length === 0 ? undefined : form.lots,
  }
}

/**
 * Turns the dialog into the payload of a transfer.
 *
 * @param form the dialog
 * @returns the move as the API wants it
 */
export function toTransferPayload(form: BookStockForm): TransferStockRequest {
  return {
    productId: form.product?.id ?? 0,
    fromLocationId: Number(form.locationId),
    toLocationId: Number(form.toLocationId),
    quantity: parseDecimal(form.quantity) ?? 0,
    bookedOn: form.bookedOn === '' ? undefined : form.bookedOn,
    note: form.note.trim() === '' ? undefined : form.note.trim(),
    lots: form.lots.length === 0 ? undefined : form.lots,
  }
}

/**
 * Whether a refusal from the server is a shortfall the user may book through anyway.
 *
 * <p>A location set to warn lets stock go negative and is answered normally; one set to block
 * answers 409 and cannot be talked round. The difference matters for the mask: offering
 * «Trotzdem buchen» where the server will refuse again would be a lie.
 *
 * @param status the HTTP status of the refusal
 * @returns true where the dialog should show the refusal and nothing else
 */
export function isBlockedByStock(status: number | undefined): boolean {
  return status === 409
}

/**
 * How a movement is named where one line has to do.
 *
 * @param product the product taken over
 * @returns for example «P-001 · Schraube», empty where none is chosen
 */
export function productLabel(product: Product | null): string {
  if (product === null) return ''
  return product.productNumber ? `${product.productNumber} · ${product.name}` : product.name
}
