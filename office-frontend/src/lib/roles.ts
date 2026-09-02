/**
 * Where the roles of a tenant are read and cached.
 *
 * <p>Its own building block since the role list got a second reader: the role mask maintains
 * them, the accounting state screen only asks whether anybody holds the accounting rights. The
 * key used to stand in the middle of the mask, and a key written twice is a cache that goes
 * stale in one of the two.
 */

/**
 * @param tenantId the tenant
 * @returns address of the role list of that tenant
 */
export function rolesUrl(tenantId: number): string {
  return `/api/tenants/${tenantId}/roles`
}

/**
 * @param tenantId the tenant
 * @returns cache key of the role list of that tenant
 */
export function rolesKey(tenantId: number): readonly unknown[] {
  return ['roles', tenantId]
}
