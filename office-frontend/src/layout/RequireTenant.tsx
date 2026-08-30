import type { ReactNode } from 'react'
import { useAuth } from '../auth/useAuth'
import { ForbiddenNotice, ModuleOffNotice } from '../components/Notice'
import { useRunsModule, type LicensedModuleCode } from '../lib/modules'
import { useTenantId } from './useTenantId'

/**
 * Guards the three conditions almost every mask shares: a tenant is chosen, that tenant runs
 * the module the mask belongs to, and the user holds the right to read what it shows.
 *
 * <p>Passing the tenant on as an argument keeps the screens free of a null check they would
 * otherwise all repeat, and free of the temptation to force it with `!`.
 *
 * <p><b>The module is asked before the right</b>, because it is the more precise answer. A
 * mask of a module the tenant does not run has no subject at all, and saying «das Recht
 * fehlt» about it sends an administrator looking for a right that was granted long ago
 * (backend ADR-0060, ADR-0032).
 *
 * <p>Both checks are convenience, never protection: the backend answers 403 or 409 to the
 * same request whether or not this component let it through. What they fix is the address
 * typed by hand — the sidebar hid the entry, the URL did not.
 */
export function RequireTenant({
  permission,
  module,
  children,
}: {
  /** Right the mask needs to show anything at all. */
  permission: string
  /**
   * Module the mask belongs to, where it belongs to one.
   *
   * <p>Left out for everything a tenant always has — and deliberately left out for the list
   * of issued reminders: that is business correspondence under OR Art. 958f, and a switch
   * must not hide it (backend ADR-0092).
   */
  module?: LicensedModuleCode
  children: (tenantId: number) => ReactNode
}) {
  const { can } = useAuth()
  const runs = useRunsModule()
  const tenantId = useTenantId()

  if (tenantId === null) return <NoTenantNotice />
  if (module !== undefined && !runs(module)) return <ModuleOffNotice module={module} />
  if (!can(permission)) return <ForbiddenNotice permission={permission} />
  return <>{children(tenantId)}</>
}

/**
 * Guards a screen that needs a right but no tenant, such as the user administration, whose
 * path does not start with `/api/tenants/{id}`.
 */
export function RequirePermission({
  permission,
  children,
}: {
  permission: string
  children: ReactNode
}) {
  const { can } = useAuth()
  if (!can(permission)) return <ForbiddenNotice permission={permission} />
  return <>{children}</>
}

/** A superuser starts without a tenant, because it belongs to none. */
export function NoTenantNotice() {
  return (
    <div className="px-8 pb-12">
      <div className="rounded-[var(--radius-lg)] border border-line-subtle bg-surface p-8 text-center">
        <h2 className="text-[15px] font-semibold">Kein Mandant gewählt</h2>
        <p className="mx-auto mt-2 max-w-[46ch] text-[13px] text-text-secondary">
          Superuser gehören zu keinem Mandanten. Wähle oben links einen aus, um seine Kunden,
          Lieferanten, Produkte und Belege zu sehen.
        </p>
      </div>
    </div>
  )
}
