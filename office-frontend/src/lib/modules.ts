import type { TenantAccess } from './types'

/**
 * The screen that switches modules on and off, and what the session knows about them.
 *
 * <p>Its own building block rather than addresses typed into the screen: the module list is
 * read in three places — the mask, the sidebar and the overview — and a query key that is
 * written twice is a cache that goes stale in one of them.
 */

/** Path of the module screen within the application. */
export const MODULE_PATH = '/module'

/**
 * The rights the module screen runs on.
 *
 * <p>No right of its own. Whoever sets a tenant up switches its modules — that is the same
 * act, and a right nobody can explain gets granted to everyone (backend ADR-0079).
 */
export const MODULE_RIGHTS = {
  read: 'TENANT_READ',
  write: 'TENANT_WRITE',
} as const

/**
 * @param tenantId the tenant
 * @returns address of the module list of that tenant
 */
export function tenantModulesUrl(tenantId: number): string {
  return `/api/tenants/${tenantId}/modules`
}

/**
 * @param tenantId the tenant
 * @returns cache key of the module list of that tenant
 */
export function tenantModulesKey(tenantId: number): readonly unknown[] {
  return ['tenant-modules', tenantId]
}

/**
 * Whether the tenant this session works in runs one module.
 *
 * <p>Read off the session rather than fetched: the module list travels with
 * `/api/auth/me`, so hiding a module the tenant does not run costs no request. A session
 * without a chosen tenant — a superuser who has not picked one — runs nothing.
 *
 * @param tenants the tenants of the session
 * @param activeTenantId the tenant it works in, absent while none is chosen
 * @param module name of the backend `LicensedModule` value
 * @returns true where that tenant runs the module
 */
export function runsModule(
  tenants: TenantAccess[] | undefined,
  activeTenantId: number | null | undefined,
  module: string,
): boolean {
  if (activeTenantId === null || activeTenantId === undefined) return false
  const active = tenants?.find((tenant) => tenant.id === activeTenantId)
  return active?.modules.includes(module) ?? false
}
