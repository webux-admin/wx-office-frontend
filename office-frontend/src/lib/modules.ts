import { useAuth } from '../auth/useAuth'
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
 * The switchable modules, by the code the backend spells them with.
 *
 * <p>Closed on purpose: a module without a name here cannot slip through, because every
 * place that names one reads {@link MODULE_NAMES} and TypeScript insists it is complete. The
 * sidebar's `NavModule` is this type (ADR-0018 wanted one list, not two).
 */
export type LicensedModuleCode = 'INVENTORY' | 'OUTBOX' | 'DUNNING'

/**
 * What each module is called on screen.
 *
 * <p>The one source of the word. The backend has two wordings for the same thing — «Das
 * Lager ist für diesen Mandanten nicht eingeschaltet. Es lässt sich unter
 * «Systemeinstellungen → Module» einschalten» against «Der Mandant betreibt das Mahnwesen
 * nicht» — and the second does not name the way to the switch. Copying either would make the
 * mask's sentence depend on which module it happens to be about.
 */
export const MODULE_NAMES: Record<LicensedModuleCode, string> = {
  INVENTORY: 'Lager',
  OUTBOX: 'Postausgang',
  DUNNING: 'Mahnwesen',
}

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

/**
 * Asks the session whether the tenant runs a module — the same shape as `can`.
 *
 * <p>A screen should not have to reach into `user?.tenants` to find out; that is four
 * arguments of ceremony around one question, and it is the reason the check was skipped in
 * eleven masks. Costs no request: the module list travels with the session (ADR-0018).
 *
 * @returns a predicate over the module code
 */
export function useRunsModule(): (module: LicensedModuleCode) => boolean {
  const { user } = useAuth()
  return (module) => runsModule(user?.tenants, user?.activeTenantId, module)
}
