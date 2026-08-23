import type { StockLocation } from './types'

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

/**
 * The REST resource of the stock locations.
 *
 * @param tenantId the tenant
 * @returns the address, without a trailing slash
 */
export function stockLocationsUrl(tenantId: number): string {
  return `/api/tenants/${tenantId}/inventory/locations`
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
