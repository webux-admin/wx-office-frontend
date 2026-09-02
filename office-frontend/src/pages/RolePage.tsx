import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { CheckboxField } from '../components/CheckboxField'
import { DataTable, type Column } from '../components/DataTable'
import { Dialog } from '../components/Dialog'
import { EmptyState, ErrorNotice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { TextField } from '../components/TextField'
import { useAuth } from '../auth/useAuth'
import { RequireTenant } from '../layout/RequireTenant'
import { api } from '../lib/api'
import { formatCount } from '../lib/format'
import { PERMISSION_MODULES, labelOf, permissionAction } from '../lib/labels'
import { rolesKey, rolesUrl } from '../lib/roles'
import type { PermissionCatalogue, Role } from '../lib/types'

/**
 * The roles of the tenant, each a bundle of permissions.
 *
 * <p>Roles the tenant was created with can be changed but not removed: taking away the
 * administrator role would leave a tenant nobody can administer.
 */
export function RolePage() {
  return (
    <RequireTenant permission="USER_READ">
      {(tenantId) => <Roles tenantId={tenantId} />}
    </RequireTenant>
  )
}

function Roles({ tenantId }: { tenantId: number }) {
  const { can } = useAuth()
  const queryClient = useQueryClient()
  const mayManage = can('ROLE_MANAGE')

  const [editing, setEditing] = useState<Role | null>(null)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [permissions, setPermissions] = useState<string[]>([])

  const roles = useQuery({
    queryKey: rolesKey(tenantId),
    queryFn: () => api.get<Role[]>(rolesUrl(tenantId)),
  })

  const catalogue = useQuery({
    queryKey: ['permission-catalogue', tenantId],
    queryFn: () => api.get<PermissionCatalogue>(`/api/tenants/${tenantId}/roles/permissions`),
  })

  const refresh = () => queryClient.invalidateQueries({ queryKey: rolesKey(tenantId) })

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
        permissions,
      }
      return editing
        ? api.put<Role>(`/api/tenants/${tenantId}/roles/${editing.id}`, payload)
        : api.post<Role>(`/api/tenants/${tenantId}/roles`, payload)
    },
    onSuccess: () => {
      void refresh()
      close()
    },
  })

  const remove = useMutation({
    mutationFn: (id: number) => api.delete<void>(`/api/tenants/${tenantId}/roles/${id}`),
    onSuccess: refresh,
  })

  const close = () => {
    setCreating(false)
    setEditing(null)
    setName('')
    setDescription('')
    setPermissions([])
    save.reset()
  }

  const openNew = () => {
    setName('')
    setDescription('')
    setPermissions([])
    setEditing(null)
    setCreating(true)
  }

  const openEdit = (role: Role) => {
    setName(role.name)
    setDescription(role.description ?? '')
    setPermissions(role.permissions)
    setEditing(role)
    setCreating(false)
  }

  const toggle = (code: string) =>
    setPermissions((current) =>
      current.includes(code) ? current.filter((entry) => entry !== code) : [...current, code],
    )

  const toggleModule = (codes: string[]) =>
    setPermissions((current) =>
      codes.every((code) => current.includes(code))
        ? current.filter((entry) => !codes.includes(entry))
        : [...new Set([...current, ...codes])],
    )

  const columns: Column<Role>[] = [
    {
      key: 'name',
      header: 'Rolle',
      width: 'w-[200px]',
      render: (role) =>
        mayManage ? (
          <button
            type="button"
            onClick={() => openEdit(role)}
            className="font-medium transition-colors hover:text-accent-text"
          >
            {role.name}
          </button>
        ) : (
          <span className="font-medium">{role.name}</span>
        ),
    },
    {
      key: 'description',
      header: 'Beschreibung',
      render: (role) => <span className="text-text-secondary">{role.description ?? '-'}</span>,
    },
    {
      key: 'count',
      header: 'Rechte',
      align: 'right',
      width: 'w-[90px]',
      render: (role) => formatCount(role.permissions.length),
    },
    {
      key: 'state',
      header: '',
      width: 'w-[170px]',
      render: (role) =>
        role.deletable ? (
          mayManage ? (
            <button
              type="button"
              onClick={() => remove.mutate(role.id)}
              className="text-[12px] text-text-tertiary transition-colors hover:text-danger"
            >
              Löschen
            </button>
          ) : null
        ) : (
          <Badge tone="muted">Systemrolle</Badge>
        ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Rollen"
        subtitle={`${formatCount(roles.data?.length ?? 0)} Rollen im aktiven Mandanten`}
      >
        {mayManage && (
          <Button onClick={openNew}>
            <Plus size={15} aria-hidden />
            Rolle
          </Button>
        )}
      </PageHeader>

      <div className="px-8 pb-12">
        {remove.error !== null && (
          <div className="mb-6">
            <ErrorNotice error={remove.error} />
          </div>
        )}

        <Panel padded={false}>
          <DataTable
            columns={columns}
            rows={roles.data ?? []}
            keyOf={(role) => role.id}
            onRowOpen={mayManage ? openEdit : undefined}
            loading={roles.isPending}
            error={roles.error}
            empty={
              <EmptyState
                title="Keine Rollen"
                description="Ohne Rolle muss jedes Recht einzeln vergeben werden."
              >
                {mayManage && (
                  <Button onClick={openNew}>
                    <Plus size={15} aria-hidden />
                    Erste Rolle
                  </Button>
                )}
              </EmptyState>
            }
          />
        </Panel>
      </div>

      <Dialog
        open={creating || editing !== null}
        onClose={close}
        title={editing ? `Rolle ${editing.name}` : 'Neue Rolle'}
        description="Die angekreuzten Rechte gelten für jeden, der diese Rolle hält."
        onSubmit={save.isPending || name.trim() === '' ? undefined : () => save.mutate()}
        wide
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              Abbrechen
            </Button>
            <Button
              onClick={() => save.mutate()}
              busy={save.isPending}
              disabled={name.trim() === ''}
              shortcut
            >
              Speichern
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <TextField
            label="Name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={60}
          />
          <TextField
            label="Beschreibung"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={255}
          />

          <fieldset>
            <legend className="text-[12px] font-medium text-text-secondary">
              Rechte ({permissions.length})
            </legend>
            <div className="mt-2 grid gap-4 sm:grid-cols-2">
              {Object.entries(catalogue.data ?? {}).map(([module, codes]) => (
                <div key={module} className="rounded-[var(--radius-md)] border border-line-subtle p-3">
                  <button
                    type="button"
                    onClick={() => toggleModule(codes)}
                    className="text-overline text-text-tertiary transition-colors hover:text-text-primary"
                  >
                    {labelOf(PERMISSION_MODULES, module)}
                  </button>
                  <div className="mt-2 grid gap-1.5">
                    {codes.map((code) => (
                      <CheckboxField
                        key={code}
                        label={permissionAction(code)}
                        checked={permissions.includes(code)}
                        onChange={() => toggle(code)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </fieldset>

          {save.error !== null && <ErrorNotice error={save.error} />}
        </div>
      </Dialog>
    </>
  )
}
