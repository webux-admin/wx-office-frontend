import { formatQuantity } from './format'
import type {
  MovementDirection,
  MovementReason,
  ShortageCause,
  StockEffect,
  StockLocation,
  StockReservationStatus,
  StockReversalLine,
} from './types'

/**
 * The rights that guard the inventory, as
 * {@code ch.webux.office.user.Permission} spells them.
 *
 * <p>Five, not one: looking at stock, booking it, setting the module up, counting an
 * inventory and posting that count are different responsibilities. Whoever counts does not
 * thereby decide that the difference goes into the stock.
 */
export const INVENTORY_RIGHTS = {
  read: 'INVENTORY_READ',
  move: 'INVENTORY_MOVE',
  configure: 'INVENTORY_CONFIGURE',
  count: 'INVENTORY_COUNT',
  countPost: 'INVENTORY_COUNT_POST',
} as const

/** Path of the stock location screen within the application. */
export const STOCK_LOCATION_PATH = '/lagerorte'

/** Path of the movement journal within the application. */
export const STOCK_MOVEMENT_PATH = '/lagerbewegungen'

/** Path of the stock list within the application. */
export const STOCK_PATH = '/bestand'

/** Path of the shortfall list within the application. */
export const STOCK_SHORTAGE_PATH = '/unterdeckung'

/** Path of the reservation list within the application. */
export const STOCK_RESERVATION_PATH = '/reservierungen'

/**
 * How old a reservation has to be for the tidy-up chip to keep it.
 *
 * <p>A reservation has no expiry date and no nightly job clears it out (backend ADR-0066), so
 * this list is the only tool there is. The threshold sits in the open, as a chip next to the
 * search — not hidden in a column setting.
 */
export const STALE_RESERVATION_DAYS = 30

/**
 * The common prefix of every inventory resource.
 *
 * <p>The module nests under one segment instead of spreading eight flat resources over the
 * tenant, so its addresses show that they belong together (backend ADR-0061).
 *
 * @param tenantId the tenant
 * @returns the address, without a trailing slash
 */
export function inventoryUrl(tenantId: number): string {
  return `/api/tenants/${tenantId}/inventory`
}

/**
 * The REST resource of the stock locations.
 *
 * @param tenantId the tenant
 * @returns the address, without a trailing slash
 */
export function stockLocationsUrl(tenantId: number): string {
  return `${inventoryUrl(tenantId)}/locations`
}

/**
 * The REST resource of the movement journal.
 *
 * @param tenantId the tenant
 * @returns the address, without a trailing slash
 */
export function stockMovementsUrl(tenantId: number): string {
  return `${inventoryUrl(tenantId)}/movements`
}

/**
 * The REST resource that moves goods between two locations.
 *
 * @param tenantId the tenant
 * @returns the address, without a trailing slash
 */
export function stockTransfersUrl(tenantId: number): string {
  return `${inventoryUrl(tenantId)}/transfers`
}

/**
 * The REST resource of the stock a product has, one row per location.
 *
 * @param tenantId the tenant
 * @returns the address, without a trailing slash
 */
export function stockBalancesUrl(tenantId: number): string {
  return `${inventoryUrl(tenantId)}/balances`
}

/**
 * The REST resource of the stock list, one row per product and location.
 *
 * <p>Not the same as {@link stockBalancesUrl}: that one answers the locations of a single
 * product as an array, this one is the paged list with sorting and quick search.
 *
 * @param tenantId the tenant
 * @returns the address, without a trailing slash
 */
export function stockUrl(tenantId: number): string {
  return `${inventoryUrl(tenantId)}/stock`
}

/**
 * The REST resource of the shortfall list.
 *
 * @param tenantId the tenant
 * @returns the address, without a trailing slash
 */
export function stockShortagesUrl(tenantId: number): string {
  return `${stockUrl(tenantId)}/shortages`
}

/**
 * The REST resource of the reservations.
 *
 * @param tenantId the tenant
 * @returns the address, without a trailing slash
 */
export function stockReservationsUrl(tenantId: number): string {
  return `${inventoryUrl(tenantId)}/reservations`
}

/**
 * The endpoint that ends one reservation, with a reason.
 *
 * @param tenantId the tenant
 * @param reservationId the reservation
 * @returns the address
 */
export function releaseReservationUrl(tenantId: number, reservationId: number): string {
  return `${stockReservationsUrl(tenantId)}/${reservationId}/release`
}

/**
 * Query key of the stock location list.
 *
 * <p>Built here rather than typed out in the screens, so a rename has exactly one place.
 *
 * @param tenantId the tenant
 * @returns the key TanStack Query caches the list under
 */
export function stockLocationsKey(tenantId: number): (string | number)[] {
  return ['stock-locations', tenantId]
}

/**
 * Whether the masks show a stock location at all.
 *
 * <p>A tenant with one single location has nothing to choose: the field would carry a value
 * without an alternative in every mask. Derived from the data rather than from a setting —
 * a switch can disagree with reality, the list never can
 * (see ADR-0014 of this repository).
 *
 * @param locations the active locations of the tenant
 * @returns true from two active locations upwards
 */
export function showsLocationChoice(locations: StockLocation[] | undefined): boolean {
  return (locations ?? []).filter((location) => location.active !== false).length >= 2
}

/**
 * How a location is named where one line has to do.
 *
 * @param location the location, absent while none is chosen
 * @returns for example «HAUPT · Hauptlager», empty where none is given
 */
export function stockLocationLabel(location: StockLocation | undefined): string {
  if (location === undefined) return ''
  return `${location.code} · ${location.name}`
}

/**
 * Query key of the movement journal.
 *
 * <p>The filters are part of the key, so two differently filtered lists do not share one
 * cache entry — the same shape `salesDocumentListKey` uses.
 *
 * @param tenantId the tenant
 * @param query the query string the list asked with
 * @returns the key TanStack Query caches that page under
 */
export function stockMovementListKey(tenantId: number, query: string): (string | number)[] {
  return ['stock-movements', tenantId, query]
}

/**
 * Query key of the last movements of one product.
 *
 * @param tenantId the tenant
 * @param productId the product
 * @returns the key TanStack Query caches those rows under
 */
export function stockMovementLatestKey(
  tenantId: number,
  productId: number,
): (string | number)[] {
  return ['stock-movements-latest', tenantId, productId]
}

/**
 * Query key of the stock one product has, one row per location.
 *
 * @param tenantId the tenant
 * @param productId the product
 * @returns the key TanStack Query caches those rows under
 */
export function stockBalanceKey(tenantId: number, productId: number): (string | number)[] {
  return ['stock-balances', tenantId, productId]
}

/**
 * Query key of the stock list.
 *
 * <p>The filters are part of the key, so two differently filtered lists do not share one
 * cache entry.
 *
 * @param tenantId the tenant
 * @param query the query string the list asked with
 * @returns the key TanStack Query caches that page under
 */
export function stockListKey(tenantId: number, query: string): (string | number)[] {
  return ['stock-list', tenantId, query]
}

/**
 * Query key of the shortfall list.
 *
 * @param tenantId the tenant
 * @param query the query string the list asked with
 * @returns the key TanStack Query caches that page under
 */
export function stockShortageListKey(tenantId: number, query: string): (string | number)[] {
  return ['stock-shortages', tenantId, query]
}

/**
 * Query key of the reservation list.
 *
 * <p>The filters are part of the key, so the list on the reservation screen and the panel in
 * the product mask do not share one cache entry.
 *
 * @param tenantId the tenant
 * @param query the query string the list asked with
 * @returns the key TanStack Query caches that page under
 */
export function stockReservationListKey(tenantId: number, query: string): (string | number)[] {
  return ['stock-reservations', tenantId, query]
}

/**
 * The reasons the booking dialog offers, per direction.
 *
 * <p>Four of the eleven reasons are missing on purpose: the two halves of a transfer, the
 * counter booking and the difference of a stocktake belong to an operation of its own that
 * sets reason and sign itself. The backend refuses them too — this list only keeps the mask
 * from offering what would come back as a 400.
 */
const MANUAL_REASONS: Record<MovementDirection, MovementReason[]> = {
  IN: ['RECEIPT', 'OPENING', 'CUSTOMER_RETURN'],
  OUT: ['ISSUE', 'SCRAP', 'OWN_USE', 'LOSS'],
}

/**
 * Which reasons may be booked by hand in one direction.
 *
 * @param direction whether stock goes up or down
 * @returns the reasons, the most common one first
 */
export function manualReasonsFor(direction: MovementDirection): MovementReason[] {
  return MANUAL_REASONS[direction]
}

/**
 * What a shortfall is called on screen.
 *
 * <p>A word, not only a colour: whoever cannot tell red from amber has to be able to read
 * what is wrong with a row. Not a maintained catalogue either — the two causes are computed
 * by the query and cannot be renamed without changing what they mean.
 *
 * @param cause the cause, absent for a stock that is fine
 * @returns the wording, empty where there is nothing to say
 */
export function shortageCauseLabel(cause: ShortageCause | undefined): string {
  if (cause === 'NEGATIVE') return 'Negativ'
  if (cause === 'BELOW_MINIMUM') return 'Unter Mindestbestand'
  return ''
}

/**
 * Which badge tone a shortfall wears.
 *
 * <p>A booking mistake is the harder problem and wears the danger tone; a buying job is a
 * note and wears the accent.
 *
 * @param cause the cause, absent for a stock that is fine
 * @returns the tone of the badge, `undefined` where no badge is shown
 */
export function shortageCauseTone(
  cause: ShortageCause | undefined,
): 'danger' | 'accent' | undefined {
  if (cause === 'NEGATIVE') return 'danger'
  if (cause === 'BELOW_MINIMUM') return 'accent'
  return undefined
}

/**
 * Whether a movement may be taken back through the journal screen.
 *
 * <p>Only what somebody typed in. A movement a document wrote is taken back through that
 * document, and a counter booking is not itself reversed — it would leave two rows that undo
 * each other and say nothing.
 *
 * @param movement the row, absent while none is chosen
 * @returns true where the reversal dialog may be opened for it
 */
export function isReversible(movement: { sourceKind: string; reason: string } | undefined): boolean {
  if (movement === undefined) return false
  return movement.sourceKind === 'MANUAL' && movement.reason !== 'REVERSAL'
}

/**
 * Whether issuing a document of this kind moves stock at all.
 *
 * <p>`RESERVE` speaks a quantity for rather than moving it and writes no movement, so it
 * answers false here — the sentence about goods coming back does not apply to it.
 *
 * @param stockEffect what the kind of document says, absent on a document that carries none
 * @returns true where the Ausstellen button will write a movement
 */
export function booksStock(stockEffect: StockEffect | undefined): boolean {
  return stockEffect === 'ISSUE' || stockEffect === 'ISSUE_IF_NOT_BOOKED'
}

/**
 * Whether issuing a document of this kind speaks a quantity for instead of moving it.
 *
 * @param stockEffect what the kind of document says, absent on a document that carries none
 * @returns true for an order that reserves
 */
export function reservesStock(stockEffect: StockEffect | undefined): boolean {
  return stockEffect === 'RESERVE'
}

/**
 * Whether the inventory hears about this document at all.
 *
 * <p>Wider than {@link booksStock}: a mask that only asked «does it book» would show no
 * sentence at all on an order, which is exactly the document whose stock effect surprises
 * people.
 *
 * @param stockEffect what the kind of document says, absent on a document that carries none
 * @returns true for anything but `NONE`
 */
export function affectsStock(stockEffect: StockEffect | undefined): boolean {
  return booksStock(stockEffect) || reservesStock(stockEffect)
}

/**
 * What a reservation state is called on screen.
 *
 * <p>A word, not only a colour. Not a maintained catalogue either — the three states are the
 * life of a reservation and cannot be renamed without changing what they mean.
 *
 * @param status the state, absent while none is known
 * @returns the wording, empty where there is nothing to say
 */
export function reservationStatusLabel(status: StockReservationStatus | undefined): string {
  if (status === 'OPEN') return 'Offen'
  if (status === 'CONSUMED') return 'Verbraucht'
  if (status === 'RELEASED') return 'Freigegeben'
  return ''
}

/**
 * Which badge tone a reservation state wears.
 *
 * <p>Only what is still open wears a colour: it is the row that takes stock away from
 * somebody. What is done is done and reads as plain text.
 *
 * @param status the state, absent while none is known
 * @returns the tone, `undefined` for a plain badge
 */
export function reservationStatusTone(
  status: StockReservationStatus | undefined,
): 'accent' | undefined {
  return status === 'OPEN' ? 'accent' : undefined
}

/**
 * One line of the warning the reopen dialog shows: «12 Stk P-100 Schraube M4 · Hauptlager».
 *
 * <p>Quantity, unit, product and location, not a count of rows. Whoever takes a delivery note
 * back has to see what goes where — the goods may have left the building, and until the note is
 * issued again the stock shows more than the shelf holds.
 *
 * @param line one quantity that would come back
 * @returns the sentence for that row
 */
export function stockReversalLabel(line: StockReversalLine): string {
  const unit = line.unitShortName === undefined || line.unitShortName === ''
    ? ''
    : ` ${line.unitShortName}`
  const number = line.productNumber === undefined || line.productNumber === ''
    ? ''
    : `${line.productNumber} `
  return `${formatQuantity(line.quantity)}${unit} ${number}${line.productName}`
    + ` \u00b7 ${line.locationName}`
}

/**
 * What the Ausstellen button will do to the stock, as one sentence.
 *
 * <p>An order surprises people: it changes the free quantity without moving a thing, and
 * nobody expects that from a document that prints no delivery. So it gets a sentence of its
 * own rather than being folded into «bucht ab» or, worse, staying silent.
 *
 * @param stockEffect what the kind of document says, absent on a document that carries none
 * @param locationName what the location is called, absent while the mask does not know it
 * @returns the sentence, empty where issuing does nothing to the stock
 */
export function stockIssueNotice(
  stockEffect: StockEffect | undefined,
  locationName?: string,
): string {
  const where = locationName === undefined || locationName === '' ? '' : ` im ${locationName}`
  if (reservesStock(stockEffect)) {
    return `Ausstellen reserviert den Bestand${where}. Gebucht wird nichts —`
      + ' der Bestand bleibt, die verfügbare Menge sinkt.'
  }
  if (booksStock(stockEffect)) return `Ausstellen bucht den Bestand${where} ab.`
  return ''
}

/**
 * What taking a document back does to the reservations, as one sentence.
 *
 * <p>Two different events wearing the same button. An order gives up what it spoke for; a
 * delivery note hands back what it drew out of somebody else's reservation — and the second
 * one is the invisible half, because the goods coming back into stock is the part people
 * already expect (backend ADR-0066).
 *
 * @param stockEffect what the kind of document says, absent on a document that carries none
 * @returns the sentence, empty where the document holds no reservation either way
 */
export function reservationReturnNotice(stockEffect: StockEffect | undefined): string {
  if (reservesStock(stockEffect)) {
    return 'Die offenen Reservierungen dieses Belegs werden freigegeben.'
  }
  if (booksStock(stockEffect)) {
    return 'Die dafür verbrauchten Reservierungen des Auftrags werden wiederhergestellt.'
  }
  return ''
}
