import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Badge } from '../components/Badge'
import { CheckboxField } from '../components/CheckboxField'
import { DataTable, type Column } from '../components/DataTable'
import { EmptyState } from '../components/Notice'
import { LinkButton } from '../components/LinkButton'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { useAuth } from '../auth/useAuth'
import { RequirePermission } from '../layout/RequireTenant'
import { useTenantId } from '../layout/useTenantId'
import { api } from '../lib/api'
import { formatCount, formatDateTime, formatRelativeTime } from '../lib/format'
import { originState } from '../lib/origin'
import type { User } from '../lib/types'

/** What a user mask returns to when it is saved here. */
const ORIGIN = originState('/benutzer', 'Benutzer')

/** Everyone who can sign in. */
export function UserListPage() {
  return (
    <RequirePermission permission="USER_READ">
      <UserList />
    </RequirePermission>
  )
}

function UserList() {
  const { can } = useAuth()
  const tenantId = useTenantId()
  const [thisTenantOnly, setThisTenantOnly] = useState(tenantId !== null)

  const scope = thisTenantOnly && tenantId !== null ? tenantId : null

  const users = useQuery({
    queryKey: ['users', scope],
    queryFn: () => api.get<User[]>(`/api/users${scope === null ? '' : `?tenantId=${scope}`}`),
  })

  const columns: Column<User>[] = [
    {
      key: 'username',
      header: 'Benutzername',
      width: 'w-[170px]',
      render: (user) => (
        <Link
          to={`/benutzer/${user.id}`}
          state={ORIGIN}
          className="font-mono text-[12px] font-medium transition-colors hover:text-accent-text"
        >
          {user.username}
        </Link>
      ),
    },
    { key: 'name', header: 'Name', render: (user) => user.displayName },
    {
      key: 'email',
      header: 'E-Mail',
      render: (user) => <span className="text-text-secondary">{user.email}</span>,
    },
    {
      key: 'lastLogin',
      header: 'Zuletzt angemeldet',
      width: 'w-[180px]',
      // Deliberately not called "online": the backend keeps no register of open sessions, so
      // nobody here knows who is signed in right now. What is known is when somebody last
      // signed in, and that is what this says. The exact moment sits in the tooltip.
      render: (user) => (
        <span
          className="text-text-secondary"
          title={user.lastLoginAt ? formatDateTime(user.lastLoginAt) : undefined}
        >
          {user.lastLoginAt ? formatRelativeTime(user.lastLoginAt) : 'Nie'}
        </span>
      ),
    },
    {
      key: 'state',
      header: 'Status',
      width: 'w-[210px]',
      render: (user) => (
        <span className="flex flex-wrap gap-1">
          {user.superuser && <Badge tone="accent">Superuser</Badge>}
          {user.locked && <Badge tone="danger">Gesperrt</Badge>}
          {!user.active && <Badge tone="muted">Deaktiviert</Badge>}
        </span>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Benutzer"
        subtitle={`${formatCount(users.data?.length ?? 0)} Konten`}
      >
        {can('USER_WRITE') && (
          <LinkButton to="/benutzer/neu" state={ORIGIN}>
            <Plus size={15} aria-hidden />
            Benutzer anlegen
          </LinkButton>
        )}
      </PageHeader>

      <div className="px-8 pb-12">
        <Panel padded={false}>
          {tenantId !== null && (
            <div className="border-b border-line-subtle px-5 py-4">
              <CheckboxField
                label="Nur Benutzer mit Zugriff auf den aktiven Mandanten"
                checked={thisTenantOnly}
                onChange={(event) => setThisTenantOnly(event.target.checked)}
              />
            </div>
          )}

          <DataTable
            columns={columns}
            rows={users.data ?? []}
            keyOf={(user) => user.id}
            rowTo={(user) => `/benutzer/${user.id}`}
            rowState={ORIGIN}
            loading={users.isPending}
            error={users.error}
            empty={
              <EmptyState
                title="Keine Benutzer"
                description="Mindestens ein Konto muss es geben, sonst kommt niemand mehr herein."
              />
            }
          />
        </Panel>
      </div>
    </>
  )
}
