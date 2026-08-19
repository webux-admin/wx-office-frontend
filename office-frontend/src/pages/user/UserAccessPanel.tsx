import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge } from '../../components/Badge'
import { Button } from '../../components/Button'
import { CheckboxField } from '../../components/CheckboxField'
import { ErrorNotice } from '../../components/Notice'
import { Panel } from '../../components/Panel'
import { SelectField } from '../../components/SelectField'
import { useAuth } from '../../auth/useAuth'
import { api } from '../../lib/api'
import { PERMISSION_MODULES, labelOf, permissionAction } from '../../lib/labels'
import type {
  PermissionCatalogue,
  Role,
  TenantAccess,
  User,
  UserAccess,
} from '../../lib/types'

/**
 * What one user may do in one tenant.
 *
 * <p>Access is granted per tenant, and inside it through roles plus anything granted directly
 * on top. Both are set as a whole rather than added one at a time: the endpoints replace the
 * set, so sending a subset would silently take rights away.
 */
export function UserAccessPanel({
  user,
  tenants,
}: {
  user: User
  tenants: TenantAccess[]
}) {
  const { can } = useAuth()
  const queryClient = useQueryClient()
  const mayWrite = can('USER_WRITE')

  const [tenantId, setTenantId] = useState<number | null>(tenants[0]?.id ?? null)

  const access = useQuery({
    queryKey: ['user-access', user.id, tenantId],
    queryFn: () => api.get<UserAccess>(`/api/users/${user.id}/tenants/${tenantId}`),
    enabled: tenantId !== null,
  })

  // The access endpoint answers with empty lists whether the user has no access or access
  // without roles. This list is what tells the two apart.
  const withAccess = useQuery({
    queryKey: ['users', tenantId],
    queryFn: () => api.get<User[]>(`/api/users?tenantId=${tenantId}`),
    enabled: tenantId !== null,
  })

  const roles = useQuery({
    queryKey: ['roles', tenantId],
    queryFn: () => api.get<Role[]>(`/api/tenants/${tenantId}/roles`),
    enabled: tenantId !== null,
  })

  const catalogue = useQuery({
    queryKey: ['permission-catalogue', tenantId],
    queryFn: () => api.get<PermissionCatalogue>(`/api/tenants/${tenantId}/roles/permissions`),
    enabled: tenantId !== null && mayWrite,
  })

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['user-access', user.id] })
    void queryClient.invalidateQueries({ queryKey: ['users'] })
  }

  const grant = useMutation({
    mutationFn: () => api.post<UserAccess>(`/api/users/${user.id}/tenants/${tenantId}`),
    onSuccess: refresh,
  })

  const revoke = useMutation({
    mutationFn: () => api.delete<void>(`/api/users/${user.id}/tenants/${tenantId}`),
    onSuccess: refresh,
  })

  const setRoles = useMutation({
    mutationFn: (roleIds: number[]) =>
      api.put<UserAccess>(`/api/users/${user.id}/tenants/${tenantId}/roles`, roleIds),
    onSuccess: refresh,
  })

  const setPermissions = useMutation({
    mutationFn: (permissions: string[]) =>
      api.put<UserAccess>(`/api/users/${user.id}/tenants/${tenantId}/permissions`, permissions),
    onSuccess: refresh,
  })

  const hasAccess = (withAccess.data ?? []).some((entry) => entry.id === user.id)
  const roleIds = access.data?.roleIds ?? []
  const direct = access.data?.directPermissions ?? []
  const effective = access.data?.effectivePermissions ?? []

  const toggleRole = (id: number) =>
    setRoles.mutate(roleIds.includes(id) ? roleIds.filter((entry) => entry !== id) : [...roleIds, id])

  const togglePermission = (code: string) =>
    setPermissions.mutate(
      direct.includes(code) ? direct.filter((entry) => entry !== code) : [...direct, code],
    )

  const error =
    access.error ?? grant.error ?? revoke.error ?? setRoles.error ?? setPermissions.error

  return (
    <Panel
      title="Zugriff je Mandant"
      description="Rollen und Zusatzrechte gelten immer nur im gewählten Mandanten."
    >
      <div className="grid gap-5">
        <div className="flex flex-wrap items-end gap-3">
          <SelectField
            label="Mandant"
            value={tenantId ?? ''}
            onChange={(event) => setTenantId(Number(event.target.value))}
            className="min-w-[240px] flex-1"
          >
            {tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.code} · {tenant.name}
              </option>
            ))}
          </SelectField>

          {mayWrite &&
            tenantId !== null &&
            (hasAccess ? (
              <Button variant="secondary" onClick={() => revoke.mutate()} busy={revoke.isPending}>
                Zugriff entziehen
              </Button>
            ) : (
              <Button onClick={() => grant.mutate()} busy={grant.isPending}>
                Zugriff erteilen
              </Button>
            ))}
        </div>

        {user.superuser && (
          <p className="text-[13px] text-text-secondary">
            Dieses Konto ist Superuser und kommt in jeden Mandanten, unabhängig von dem, was
            hier steht.
          </p>
        )}

        {error !== null && error !== undefined && <ErrorNotice error={error} />}

        {tenantId !== null && !hasAccess && !user.superuser ? (
          <p className="text-[13px] text-text-secondary">
            Dieser Benutzer hat in diesem Mandanten keinen Zugriff. Rollen lassen sich erst
            vergeben, wenn der Zugriff erteilt ist.
          </p>
        ) : (
          <>
            <fieldset>
              <legend className="text-[12px] font-medium text-text-secondary">Rollen</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {(roles.data ?? []).map((role) => (
                  <CheckboxField
                    key={role.id}
                    label={role.name}
                    hint={role.description}
                    checked={roleIds.includes(role.id)}
                    onChange={() => toggleRole(role.id)}
                    disabled={!mayWrite || setRoles.isPending}
                  />
                ))}
                {roles.data?.length === 0 && (
                  <p className="text-[13px] text-text-secondary">
                    Dieser Mandant hat noch keine Rollen.
                  </p>
                )}
              </div>
            </fieldset>

            {mayWrite && catalogue.data && (
              <fieldset>
                <legend className="text-[12px] font-medium text-text-secondary">
                  Zusatzrechte
                </legend>
                <p className="mt-1 text-[12px] text-text-tertiary">
                  Kommen zu dem dazu, was die Rollen bereits erlauben.
                </p>
                <div className="mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {Object.entries(catalogue.data).map(([module, codes]) => (
                    <div key={module}>
                      <p className="text-overline text-text-tertiary">
                        {labelOf(PERMISSION_MODULES, module)}
                      </p>
                      <div className="mt-1.5 grid gap-1.5">
                        {codes.map((code) => (
                          <CheckboxField
                            key={code}
                            label={permissionAction(code)}
                            checked={direct.includes(code)}
                            onChange={() => togglePermission(code)}
                            disabled={setPermissions.isPending}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </fieldset>
            )}

            <div>
              <p className="text-[12px] font-medium text-text-secondary">
                Wirksame Rechte ({effective.length})
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                {effective.map((code) => (
                  <Badge key={code} tone={direct.includes(code) ? 'accent' : 'neutral'}>
                    {code}
                  </Badge>
                ))}
                {effective.length === 0 && (
                  <span className="text-[13px] text-text-secondary">Keine.</span>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </Panel>
  )
}
