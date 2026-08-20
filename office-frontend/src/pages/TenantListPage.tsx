import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Badge } from '../components/Badge'
import { DataTable, type Column } from '../components/DataTable'
import { EmptyState } from '../components/Notice'
import { LinkButton } from '../components/LinkButton'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { useAuth } from '../auth/useAuth'
import { RequirePermission } from '../layout/RequireTenant'
import { api } from '../lib/api'
import { formatCount } from '../lib/format'
import { originState } from '../lib/origin'
import type { Tenant } from '../lib/types'

/** What a tenant mask returns to when it is saved here. */
const ORIGIN = originState('/mandanten', 'Mandanten')

/**
 * The tenants of the installation.
 *
 * <p>Not under a tenant path itself: this is the list a superuser picks from, and everyone
 * else sees only the tenants they were granted.
 */
export function TenantListPage() {
  return (
    <RequirePermission permission="TENANT_READ">
      <TenantList />
    </RequirePermission>
  )
}

function TenantList() {
  const { can, user } = useAuth()

  const tenants = useQuery({
    queryKey: ['tenants', 'all'],
    queryFn: () => api.get<Tenant[]>('/api/tenants'),
  })

  const columns: Column<Tenant>[] = [
    {
      key: 'code',
      header: 'Code',
      width: 'w-[120px]',
      render: (tenant) => <span className="font-mono text-[12px]">{tenant.code}</span>,
    },
    {
      key: 'name',
      header: 'Name',
      render: (tenant) => (
        <Link
          to={`/mandanten/${tenant.id}`}
          state={ORIGIN}
          className="font-medium transition-colors hover:text-accent-text"
        >
          {tenant.name}
        </Link>
      ),
    },
    {
      key: 'legalForm',
      header: 'Rechtsform',
      width: 'w-[170px]',
      render: (tenant) => (
        <span className="text-text-secondary">{tenant.legalFormLabel ?? '-'}</span>
      ),
    },
    {
      key: 'town',
      header: 'Ort',
      render: (tenant) => (
        <span className="text-text-secondary">
          {[tenant.address?.postalCode, tenant.address?.town].filter(Boolean).join(' ')}
        </span>
      ),
    },
    {
      key: 'currency',
      header: 'Währung',
      width: 'w-[100px]',
      render: (tenant) => (
        <span className="font-mono text-[12px]">{tenant.baseCurrency ?? '-'}</span>
      ),
    },
    {
      key: 'state',
      header: 'Status',
      width: 'w-[140px]',
      render: (tenant) => (
        <span className="flex gap-1">
          {tenant.id === user?.activeTenantId && <Badge tone="accent">Aktiv</Badge>}
          {tenant.active === false && <Badge tone="muted">Deaktiviert</Badge>}
        </span>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Mandanten"
        subtitle={`${formatCount(tenants.data?.length ?? 0)} Mandanten`}
      >
        {can('TENANT_WRITE') && (
          <LinkButton to="/mandanten/neu" state={ORIGIN}>
            <Plus size={15} aria-hidden />
            Mandant erfassen
          </LinkButton>
        )}
      </PageHeader>

      <div className="px-8 pb-12">
        <Panel padded={false}>
          <DataTable
            columns={columns}
            rows={tenants.data ?? []}
            keyOf={(tenant) => tenant.id}
            rowTo={(tenant) => `/mandanten/${tenant.id}`}
            rowState={ORIGIN}
            loading={tenants.isPending}
            error={tenants.error}
            empty={
              <EmptyState
                title="Keine Mandanten"
                description="Ohne Mandant gibt es keine Kunden, keine Produkte und keine Belege."
              />
            }
          />
        </Panel>
      </div>
    </>
  )
}
