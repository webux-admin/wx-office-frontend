import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Badge } from '../components/Badge'
import { CheckboxField } from '../components/CheckboxField'
import { DataTable, type Column } from '../components/DataTable'
import { EmptyState } from '../components/Notice'
import { LinkButton } from '../components/LinkButton'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { QuickSearchField } from '../components/QuickSearch'
import { useQuickSearch } from '../components/useQuickSearch'
import { useAuth } from '../auth/useAuth'
import { RequireTenant } from '../layout/RequireTenant'
import { api } from '../lib/api'
import { formatCount } from '../lib/format'
import { originState } from '../lib/origin'
import { emptyPage, listQuery, PAGE_SIZE } from '../lib/paging'
import type { Page, Partner } from '../lib/types'
import { useCatalogueLabel } from '../masterdata/useMasterData'
import { holdsRole, wordingFor, type PartnerRole } from './partner/role'

/**
 * Customers or suppliers, depending on which mask was opened.
 *
 * <p>One screen serves both, because the records are the same and only their name on screen
 * differs. A record holding both roles appears in both lists.
 */
export function PartnerListPage({ role }: { role: PartnerRole }) {
  return (
    <RequireTenant permission="PARTNER_READ">
      {(tenantId) => <PartnerList key={role} tenantId={tenantId} role={role} />}
    </RequireTenant>
  )
}

function PartnerList({ tenantId, role }: { tenantId: number; role: PartnerRole }) {
  const { can } = useAuth()
  const typeLabel = useCatalogueLabel(tenantId, 'partner-type')
  const wording = wordingFor(role)
  const search = useQuickSearch()
  const [activeOnly, setActiveOnly] = useState(true)
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState('name,asc')
  // Which of the two lists the mask returns to, so a supplier saved here does not land
  // among the customers.
  const origin = originState(wording.path, wording.listTitle)

  const query = listQuery({ role, search: search.term, activeOnly, page, size: PAGE_SIZE, sort })
  const partners = useQuery({
    queryKey: ['partners', tenantId, query],
    queryFn: () => api.get<Page<Partner>>(`/api/tenants/${tenantId}/partners?${query}`),
    // The rows found last stay on screen while the next answer is on its way, instead of the
    // table being replaced by its loading state on every term.
    placeholderData: keepPreviousData,
  })

  // Filtering, sorting and counting all happen in the database now. This screen holds one
  // page and cannot know what is on the others, so it must not sift through the rows itself.
  const result = partners.data ?? emptyPage<Partner>()
  const rows = result.content

  const columns: Column<Partner>[] = [
    {
      key: 'number',
      header: 'Nummer',
      width: 'w-[110px]',
      sortKey: 'partnerNumber',
      render: (partner) => (
        <span className="font-mono text-[12px] text-text-tertiary">
          {partner.partnerNumber ?? '-'}
        </span>
      ),
    },
    {
      key: 'name',
      header: 'Name',
      sortKey: 'name',
      render: (partner) => (
        <Link
          to={`${wording.path}/${partner.id}`}
          state={origin}
          className="font-medium transition-colors hover:text-accent-text"
        >
          {partner.name}
        </Link>
      ),
    },
    {
      key: 'type',
      header: 'Art',
      width: 'w-[130px]',
      render: (partner) => (
        <span className="text-text-secondary">{typeLabel(partner.partnerType)}</span>
      ),
    },
    {
      key: 'place',
      header: 'Ort',
      width: 'w-[170px]',
      render: (partner) => {
        const address = partner.addresses?.find((entry) => entry.useAsDefault) ?? partner.addresses?.[0]
        return (
          <span className="text-text-secondary">
            {address ? `${address.postalCode} ${address.town}` : '-'}
          </span>
        )
      },
    },
    {
      key: 'contact',
      header: 'Kontakt',
      render: (partner) => (
        <span className="text-text-secondary">{partner.email ?? partner.phone ?? '-'}</span>
      ),
    },
    {
      key: 'state',
      header: '',
      width: 'w-[160px]',
      render: (partner) => (
        <span className="flex flex-wrap justify-end gap-1">
          {holdsRole(partner, wording.other) && <Badge tone="neutral">{wording.alsoBadge}</Badge>}
          {partner.active === false && <Badge tone="muted">Deaktiviert</Badge>}
        </span>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title={wording.listTitle}
        subtitle={`${formatCount(result.totalElements)} ${wording.countedNoun}`}
      >
        {can('PARTNER_WRITE') && (
          <LinkButton to={`${wording.path}/neu`} state={origin}>
            <Plus size={15} aria-hidden />
            {wording.createAction}
          </LinkButton>
        )}
      </PageHeader>

      <div className="px-8 pb-12">
        <Panel padded={false}>
          <div className="flex flex-wrap items-end gap-4 border-b border-line-subtle px-5 py-4">
            <QuickSearchField
              value={search.value}
              onChange={(next) => {
                search.setValue(next)
                setPage(0)
              }}
              placeholder={wording.searchPlaceholder}
              maxLength={70}
            />
            <CheckboxField
              label="Nur aktive"
              checked={activeOnly}
              onChange={(event) => {
                setActiveOnly(event.target.checked)
                setPage(0)
              }}
              className="h-10 items-center"
            />
          </div>

          <DataTable
            columns={columns}
            rows={rows}
            keyOf={(partner) => partner.id}
            rowTo={(partner) => `${wording.path}/${partner.id}`}
            rowState={origin}
            page={result}
            onPageChange={setPage}
            sort={sort}
            onSortChange={(next) => {
              setSort(next)
              setPage(0)
            }}
            loading={partners.isPending}
            error={partners.error}
            empty={
              <EmptyState
                title={search.term ? 'Nichts gefunden' : wording.emptyTitle}
                description={
                  search.term
                    ? `Für «${search.term}» gibt es keinen Treffer. Ein anderer Begriff hilft vielleicht.`
                    : wording.emptyBody
                }
              >
                {!search.term && can('PARTNER_WRITE') && (
                  <LinkButton to={`${wording.path}/neu`} state={origin}>
                    <Plus size={15} aria-hidden />
                    {wording.firstAction}
                  </LinkButton>
                )}
              </EmptyState>
            }
          />
        </Panel>
      </div>
    </>
  )
}
