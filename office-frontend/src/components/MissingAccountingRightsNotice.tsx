import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { api } from '../lib/api'
import { someRoleHoldsAccounting } from '../lib/accounting'
import { rolesKey, rolesUrl } from '../lib/roles'
import type { Role } from '../lib/types'
import { WarningNotice } from './Notice'

/**
 * Says that nobody in this tenant may keep books yet.
 *
 * <p>The migration that brought the module deliberately granted its five rights to no role, not
 * even to the administrator: their rights are rows in `role_permission` and are written only
 * when a tenant is created. Whoever switches the module on therefore holds nothing, and that is
 * repairable only by somebody who knows it (backend ADR-0119).
 *
 * <p><b>A statement about the roles of the tenant, not about the session.</b> A foreign role may
 * well hold the rights, and the question this answers is whether anybody in this tenant may
 * book at all.
 *
 * <p>Shown only to a session holding `USER_READ`: only it may read the roles, and only whoever
 * sees them can change them. Showing a lock to somebody without the key produces a question,
 * not a remedy.
 *
 * @param tenantId the tenant whose roles are asked about
 */
export function MissingAccountingRightsNotice({ tenantId }: { tenantId: number }) {
  const { can } = useAuth()
  const mayReadRoles = can('USER_READ')

  const roles = useQuery({
    queryKey: rolesKey(tenantId),
    queryFn: () => api.get<Role[]>(rolesUrl(tenantId)),
    enabled: mayReadRoles,
  })

  if (!mayReadRoles) return null
  // Nothing while the answer is still on its way: a hint that appears and vanishes again reads
  // as a defect, and a wrong hint is worse than a late one.
  if (roles.data === undefined) return null
  if (someRoleHoldsAccounting(roles.data)) return null

  return (
    <WarningNotice>
      Keine Rolle dieses Mandanten trägt die Buchhaltungsrechte. Zuteilen lassen sie sich
      unter{' '}
      {/* The address is written out here as it is in `navigation.ts` and in `App.tsx`; the
          role screen has no path constant of its own yet. */}
      <Link to="/rollen" className="text-accent-text underline-offset-2 hover:underline">
        Benutzer → Rollen
      </Link>
      .
    </WarningNotice>
  )
}
