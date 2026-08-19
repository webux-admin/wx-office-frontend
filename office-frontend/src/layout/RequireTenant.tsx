import type { ReactNode } from 'react'
import { useAuth } from '../auth/useAuth'
import { ForbiddenNotice } from '../components/Notice'
import { useTenantId } from './useTenantId'

/**
 * Guards the two conditions almost every mask shares: a tenant is chosen, and the user holds
 * the right to read what the mask shows.
 *
 * <p>Passing the tenant on as an argument keeps the screens free of a null check they would
 * otherwise all repeat, and free of the temptation to force it with `!`.
 *
 * <p>The permission check is convenience, never protection: the backend answers 403 to the
 * same request whether or not this component let it through.
 */
export function RequireTenant({
  permission,
  children,
}: {
  /** Right the mask needs to show anything at all. */
  permission: string
  children: (tenantId: number) => ReactNode
}) {
  const { can } = useAuth()
  const tenantId = useTenantId()

  if (tenantId === null) return <NoTenantNotice />
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
