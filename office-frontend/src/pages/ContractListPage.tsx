import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
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
import {
  CONTRACT_MODULE,
  CONTRACT_PATH,
  CONTRACT_RIGHTS,
  contractTerm,
  contractsKey,
  contractsUrl,
} from '../lib/contract'
import { formatCount, formatDate } from '../lib/format'
import { originState } from '../lib/origin'
import { emptyPage, listQuery, PAGE_SIZE } from '../lib/paging'
import type { Contract, Page } from '../lib/types'

/** Where the mask returns to, and what its back link says. */
const ORIGIN = originState(CONTRACT_PATH, 'Verträge')

/**
 * The contracts of the tenant, newest number first.
 *
 * <p>The search looks into number, title and the name of the customer as the contract copied
 * it; the backend answers it, so this screen never sifts rows.
 */
export function ContractListPage() {
  return (
    <RequireTenant permission={CONTRACT_RIGHTS.read} module={CONTRACT_MODULE}>
      {(tenantId) => <ContractList tenantId={tenantId} />}
    </RequireTenant>
  )
}

function ContractList({ tenantId }: { tenantId: number }) {
  const { can } = useAuth()
  const search = useQuickSearch()
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState('contractNumber,desc')
  const mayWrite = can(CONTRACT_RIGHTS.write)

  const query = listQuery({ search: search.term, page, size: PAGE_SIZE, sort })
  const contracts = useQuery({
    queryKey: [...contractsKey(tenantId), 'list', query],
    queryFn: () => api.get<Page<Contract>>(`${contractsUrl(tenantId)}?${query}`),
    placeholderData: keepPreviousData,
  })

  const result = contracts.data ?? emptyPage<Contract>()
  const filtered = search.term !== ''

  const columns: Column<Contract>[] = [
    {
      key: 'number',
      header: 'Nummer',
      width: 'w-column-sm',
      sortKey: 'contractNumber',
      render: (contract) => (
        <span className="font-mono text-small text-text-tertiary">{contract.contractNumber}</span>
      ),
    },
    {
      key: 'title',
      header: 'Vertrag',
      sortKey: 'title',
      render: (contract) => (
        <Link
          to={`${CONTRACT_PATH}/${contract.id}`}
          state={ORIGIN}
          className="font-medium transition-colors hover:text-accent-text"
        >
          {contract.title}
        </Link>
      ),
    },
    {
      key: 'customer',
      header: 'Kunde',
      sortKey: 'customerName',
      render: (contract) => (
        <span className="text-text-secondary">
          {contract.customerName}
          {contract.customerTown ? `, ${contract.customerTown}` : ''}
        </span>
      ),
    },
    {
      key: 'term',
      header: 'Laufzeit',
      sortKey: 'startDate',
      hideBelow: 'sm',
      render: (contract) => (
        <span className="text-text-secondary tabular-nums">
          {contractTerm(contract.startDate, contract.endDate, formatDate)}
        </span>
      ),
    },
    {
      key: 'positions',
      header: 'Positionen',
      align: 'right',
      width: 'w-column-xs',
      hideBelow: 'sm',
      render: (contract) => (
        <span className="tabular-nums text-text-secondary">
          {formatCount(contract.positions.length)}
        </span>
      ),
    },
  ]

  return (
    <>
      <PageHeader title="Verträge" subtitle={`${formatCount(result.totalElements)} Verträge`}>
        {mayWrite && (
          <LinkButton to={`${CONTRACT_PATH}/neu`} state={ORIGIN}>
            <Plus size={15} aria-hidden />
            Vertrag
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
              placeholder="Nummer, Vertrag oder Kunde"
              maxLength={120}
            />
          </div>

          <DataTable
            columns={columns}
            rows={result.content}
            keyOf={(contract) => contract.id}
            rowTo={(contract) => `${CONTRACT_PATH}/${contract.id}`}
            rowState={ORIGIN}
            page={result}
            onPageChange={setPage}
            sort={sort}
            onSortChange={(next) => {
              setSort(next)
              setPage(0)
            }}
            loading={contracts.isPending}
            error={contracts.error}
            empty={
              <EmptyState
                title={filtered ? 'Nichts gefunden' : 'Noch keine Verträge'}
                description={
                  filtered
                    ? 'Für diese Suche gibt es keinen Vertrag. Ein anderer Begriff hilft vielleicht.'
                    : 'Ein Vertrag hält fest, was mit einem Kunden vereinbart ist und wie oft es verrechnet wird.'
                }
              >
                {!filtered && mayWrite && (
                  <LinkButton to={`${CONTRACT_PATH}/neu`} state={ORIGIN}>
                    <Plus size={15} aria-hidden />
                    Ersten Vertrag anlegen
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
