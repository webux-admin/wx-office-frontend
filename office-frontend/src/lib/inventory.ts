import { formatDate, formatQuantity } from './format'
import type {
  LotKind,
  MovementDirection,
  MovementReason,
  ProductAvailability,
  ProductTracking,
  ReservationHolder,
  ShortageCause,
  StockEffect,
  StockLocation,
  StockReservationStatus,
  StockReversalLine,
  StockShortfall,
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
 * The REST resource that answers what is free of a product.
 *
 * <p>Two shapes, one address. A single product gets its own path and answers with the split by
 * location and the documents holding it; a list of products answers with bare sums and is what
 * the hit list of the product search asks — one request for twenty rows, because a request per
 * row would be twenty round trips per keystroke.
 *
 * @param tenantId the tenant
 * @param productIds one product, or the products of a hit list
 * @returns the address, with the query string where a list was asked for
 */
export function availabilityUrl(
  tenantId: number,
  productIds: number | readonly number[],
): string {
  const base = `${inventoryUrl(tenantId)}/availability`
  if (typeof productIds === 'number') return `${base}/${productIds}`
  return `${base}?productIds=${productIds.join(',')}`
}

/**
 * Query key of what is free of a product.
 *
 * <p>The two shapes are kept apart on purpose: a batch over one single id is a different answer
 * than the single one — it carries no split and no holders — and letting them share a cache
 * entry would empty the fact box the moment a hit list is drawn.
 *
 * @param tenantId the tenant
 * @param productIds one product, or the products of a hit list
 * @returns the key TanStack Query caches that answer under
 */
export function availabilityKey(
  tenantId: number,
  productIds: number | readonly number[],
): (string | number)[] {
  return typeof productIds === 'number'
    ? ['stock-availability', tenantId, productIds]
    : ['stock-availability', tenantId, 'batch', productIds.join(',')]
}

/**
 * One shortfall as a sentence: «Hauptlager: 3 verfügbar, 5 gebraucht — 4 sind für AU-2026-0142
 * reserviert».
 *
 * <p>The location comes first because it is what makes the figure checkable: a tenant with two
 * stores has stock somewhere else, and a bare «3 verfügbar» would look like a lie. The holding
 * documents come last because they are the answer to the follow-up question, not to the first
 * one.
 *
 * <p>Without a reservation the sentence ends after «gebraucht»: there is nobody to name, and
 * «0 sind für niemanden reserviert» is noise.
 *
 * @param shortfall what the stock check reported for one product
 * @returns the sentence for that product
 */
export function shortfallText(shortfall: StockShortfall): string {
  const head =
    `${shortfall.locationName}: ${formatQuantity(shortfall.available)} verfügbar,` +
    ` ${formatQuantity(shortfall.required)} gebraucht`
  const names = (shortfall.heldBy ?? [])
    .map((holder) => holder.documentNumber)
    .filter((number): number is string => number !== undefined && number !== '')
  if (shortfall.reserved === 0 || names.length === 0) return head
  return `${head} — ${formatQuantity(shortfall.reserved)} sind für ${holderNames(names)}`
    + ' reserviert'
}

/**
 * Who holds a quantity back, as a half sentence: «reserviert für AU-2026-0142».
 *
 * <p>For the hint under a fact, where {@link shortfallText} would be a sentence too many. Empty
 * where nobody holds anything — «reserviert für niemanden» is noise.
 *
 * @param holders the documents holding it, biggest share first
 * @returns the half sentence, empty where there is nothing to name
 */
export function reservedForText(holders: readonly ReservationHolder[] | undefined): string {
  const names = (holders ?? [])
    .map((holder) => holder.documentNumber)
    .filter((number): number is string => number !== undefined && number !== '')
  return names.length === 0 ? '' : `reserviert für ${holderNames(names)}`
}

/**
 * Names the documents holding a quantity, at most two of them.
 *
 * <p>A product spoken for by nine orders would otherwise turn one sentence into a list nobody
 * reads. Two names and a count carry the same message: it is not one forgotten order.
 *
 * @param names the document numbers, biggest share first
 * @returns for example «AU-2026-0142 und AU-2026-0143 und 2 weitere»
 */
function holderNames(names: readonly string[]): string {
  if (names.length === 1) return names[0]
  const shown = names.slice(0, 2).join(' und ')
  const rest = names.length - 2
  if (rest <= 0) return shown
  return `${shown} und ${rest === 1 ? 'einen weiteren' : `${rest} weitere`}`
}

/**
 * The line under the «Verfügbar» fact: «Bestand 12 · 4 reserviert».
 *
 * <p>The fact itself carries one number, because three numbers side by side make every reader
 * do the subtraction. Stock and reserved quantity stand underneath so the one number can still
 * be checked, and a tenant with goods in two stores also reads where they lie — a shortfall in
 * the main store while the outer one is full is a transport job, not a purchase.
 *
 * @param availability what is free of the product, absent while it is on its way
 * @returns the line, empty where no stock is kept of that product
 */
export function availabilityHint(availability: ProductAvailability | undefined): string {
  if (availability === undefined || !availability.stockManaged) return ''
  const parts = [`Bestand ${formatQuantity(availability.onHand ?? 0)}`]
  if ((availability.reserved ?? 0) !== 0) {
    parts.push(`${formatQuantity(availability.reserved)} reserviert`)
  }
  const holding = (availability.locations ?? []).filter((location) => location.onHand !== 0)
  if (holding.length > 1) {
    holding.forEach((location) =>
      parts.push(`${location.locationName} ${formatQuantity(location.onHand)}`),
    )
  }
  return parts.join(' · ')
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
 * What is free of a product at one store.
 *
 * <p>The document mask needs this rather than the whole-tenant figure: a Lieferschein that
 * delivers from the outside store must not be told what lies in the main one, or it reports a
 * quantity that has nothing to do with what will be booked (ADR-0067 of the backend).
 *
 * <p>Without a store, and for an answer that carries no per-store split, the whole-tenant
 * figure stays — that is the tenant with one store, where both figures are the same number.
 * A store the product has never lain in comes back as a free quantity of zero, which is what
 * it is.
 *
 * @param availability what the inventory answered for the product, undefined while unknown
 * @param locationId the store the document delivers from, undefined for the whole tenant
 * @returns the same answer narrowed to that store, undefined when there is none
 */
export function availabilityAt(
  availability: ProductAvailability | undefined,
  locationId: number | undefined,
): ProductAvailability | undefined {
  if (availability === undefined || locationId === undefined) return availability
  if (availability.locations === undefined) return availability
  const here = availability.locations.find((entry) => entry.locationId === locationId)
  return {
    ...availability,
    onHand: here?.onHand ?? 0,
    reserved: here?.reserved ?? 0,
    availableQuantity: here?.availableQuantity ?? 0,
    locations: here === undefined ? [] : [here],
  }
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

// --- lots and serial numbers -------------------------------------------------

/**
 * Which kind of number a product is followed by, if any.
 *
 * <p>Derived from the product rather than chosen: a lot and a serial number are one model,
 * and which of the two a product uses is a decision of the product master
 * (backend ADR-0067).
 *
 * @param tracking how closely the product is followed
 * @returns the kind, or `undefined` for a product nobody tracks
 */
export function lotKindOf(tracking: ProductTracking | undefined): LotKind | undefined {
  return tracking === 'LOT' || tracking === 'SERIAL' ? tracking : undefined
}

/**
 * Whether a booking of this product has to name numbers at all.
 *
 * @param product the product, absent while none is chosen
 * @returns true where every booked quantity has to be split into lots
 */
export function tracksLots(product: { tracking?: ProductTracking } | null | undefined): boolean {
  return lotKindOf(product?.tracking) !== undefined
}

/** What one number is called on screen. */
export function lotKindLabel(kind: LotKind | undefined): string {
  if (kind === 'LOT') return 'Charge'
  if (kind === 'SERIAL') return 'Seriennummer'
  return ''
}

/** What several of them are called, for a panel heading or a column. */
export function lotKindLabelPlural(kind: LotKind | undefined): string {
  if (kind === 'LOT') return 'Chargen'
  if (kind === 'SERIAL') return 'Seriennummern'
  return ''
}

/**
 * What an expiry date says about a lot, in words.
 *
 * <p>A word, not only a colour: whoever cannot tell red from grey still has to read that this
 * batch is past its date. It warns and sorts — it never refuses (backend ADR-0067).
 *
 * @param lot the expiry date and whether it has passed
 * @returns for example «abgelaufen am 12.03.2026», empty on goods that do not expire
 */
export function expiryLabel(lot: {
  expiryDate?: string | null
  expired?: boolean
}): string {
  if (lot.expiryDate === undefined || lot.expiryDate === null || lot.expiryDate === '') return ''
  const date = formatDate(lot.expiryDate)
  return lot.expired === true ? `abgelaufen am ${date}` : `haltbar bis ${date}`
}

/**
 * The REST resource of the lots of one product.
 *
 * <p>Under the product, not under the inventory: a lot only ever exists for one product, and
 * a flat list of every lot a tenant holds has no screen that would open it.
 *
 * @param tenantId the tenant
 * @param productId the product
 * @returns the address, without a trailing slash
 */
export function productLotsUrl(tenantId: number, productId: number): string {
  return `/api/tenants/${tenantId}/products/${productId}/lots`
}

/**
 * The endpoint that suggests which lots to take out, earliest expiry first.
 *
 * @param tenantId the tenant
 * @param productId the product
 * @returns the address, without a query string
 */
export function lotProposalUrl(tenantId: number, productId: number): string {
  return `/api/tenants/${tenantId}/products/${productId}/lot-proposal`
}

/**
 * The endpoint that computes running serial numbers without saving any of them.
 *
 * @param tenantId the tenant
 * @param productId the product
 * @returns the address
 */
export function serialNumberProposalUrl(tenantId: number, productId: number): string {
  return `/api/tenants/${tenantId}/products/${productId}/serial-number-proposal`
}

/**
 * The REST resource of one lot, for changing or freezing it.
 *
 * @param tenantId the tenant
 * @param lotId the lot
 * @returns the address
 */
export function lotUrl(tenantId: number, lotId: number): string {
  return `${inventoryUrl(tenantId)}/lots/${lotId}`
}

/**
 * The endpoint that freezes one lot, with a reason.
 *
 * @param tenantId the tenant
 * @param lotId the lot
 * @returns the address
 */
export function blockLotUrl(tenantId: number, lotId: number): string {
  return `${lotUrl(tenantId, lotId)}/block`
}

/**
 * The endpoint that lets a frozen lot be given out again.
 *
 * @param tenantId the tenant
 * @param lotId the lot
 * @returns the address
 */
export function unblockLotUrl(tenantId: number, lotId: number): string {
  return `${lotUrl(tenantId, lotId)}/unblock`
}

/**
 * Query key of the lots of one product.
 *
 * <p>The filters are part of the key, so the panel in the product mask and the picker in the
 * booking dialog do not share one cache entry.
 *
 * @param tenantId the tenant
 * @param productId the product
 * @param query the query string the list asked with
 * @returns the key TanStack Query caches that page under
 */
export function productLotsKey(
  tenantId: number,
  productId: number,
  query: string,
): (string | number)[] {
  return ['product-lots', tenantId, productId, query]
}

/**
 * Query key of a take-out proposal.
 *
 * <p>Quantity and location are part of the key: the same product asked for eight pieces gets
 * a different answer than asked for two.
 *
 * @param tenantId the tenant
 * @param productId the product
 * @param locationId the location taken from, as the field holds it
 * @param quantity how much is being booked
 * @returns the key TanStack Query caches that proposal under
 */
export function lotProposalKey(
  tenantId: number,
  productId: number,
  locationId: string,
  quantity: number,
): (string | number)[] {
  return ['lot-proposal', tenantId, productId, locationId, quantity]
}
