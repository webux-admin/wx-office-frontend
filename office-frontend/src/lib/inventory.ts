import type { MovementDirection, MovementReason, StockLocation } from './types'

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
