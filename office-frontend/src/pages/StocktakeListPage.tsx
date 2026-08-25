import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { DataTable, type Column } from '../components/DataTable'
import { EmptyState } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { QuickSearchField } from '../components/QuickSearch'
import { useQuickSearch } from '../components/useQuickSearch'
import { useAuth } from '../auth/useAuth'
import { RequireTenant } from '../layout/RequireTenant'
import { api } from '../lib/api'
import { formatDate, formatQuantity } from '../lib/format'
import {
  countProgress,
  INVENTORY_RIGHTS,
  STOCKTAKE_PATH,
  stocktakeListKey,
  stocktakesUrl,
} from '../lib/inventory'
import { originState } from '../lib/origin'
import { emptyPage, listQuery, PAGE_SIZE } from '../lib/paging'
import type { Page, Stocktake } from '../lib/types'
import { useCatalogueLabel } from '../masterdata/useMasterData'
import { NewStocktakeDialog } from './stocktake/NewStocktakeDialog'

/** What a mask opened from this list returns to. */
const ORIGIN = originState(STOCKTAKE_PATH, 'Inventuren')

/**
 * The count lists of a tenant.
 *
 * <p>An inventory is the proof of the physical count that backs a balance sheet position
 * (OR Art. 958c Abs. 2), so it is a list of records rather than a button that straightens the
 * stock. What a booked one did is readable ten years later; what an open one still needs is
 * readable at a glance (backend ADR-0070).
 */
export function StocktakeListPage() {
  return (
    <RequireTenant permission={INVENTORY_RIGHTS.read}>
      {(tenantId) => <StocktakeList tenantId={tenantId} />}
    </RequireTenant>
  )
}

function StocktakeList({ tenantId }: { tenantId: number }) {
  const { can } = useAuth()
  const mayCount = can(INVENTORY_RIGHTS.count)
  const navigate = useNavigate()
  const search = useQuickSearch('')
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState('countingDate,desc')
  const [creating, setCreating] = useState(false)
  const statusLabel = useCatalogueLabel(tenantId, 'stocktake-status')

  const query = listQuery({ search: search.term, page, size: PAGE_SIZE, sort })
  const stocktakes = useQuery({
    queryKey: stocktakeListKey(tenantId, query),
    queryFn: () => api.get<Page<Stocktake>>(`${stocktakesUrl(tenantId)}?${query}`),
    // The rows found last stay on screen while the next answer is on its way.
    placeholderData: keepPreviousData,
  })

  const result = stocktakes.data ?? emptyPage<Stocktake>()

  const columns: Column<Stocktake>[] = [
    {
      key: 'stocktakeNumber',
      header: 'Nummer',
      sortKey: 'stocktakeNumber',
      width: 'w-[140px]',
      // A draft has none, and «—» says that better than an empty cell: the number is drawn
      // when the count is booked, so its absence is a state and not a gap.
      render: (row) => (
        <span className="font-mono text-[12px] text-text-tertiary">
          {row.stocktakeNumber ?? '—'}
        </span>
      ),
    },
    {
      key: 'locationName',
      header: 'Lagerort',
      sortKey: 'locationName',
      render: (row) => <span className="font-medium">{row.locationName}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      sortKey: 'status',
      width: 'w-[130px]',
      render: (row) => (
        <Badge tone={row.status === 'POSTED' ? 'success' : 'neutral'}>
          {statusLabel(row.status)}
        </Badge>
      ),
    },
    {
      key: 'countingDate',
      header: 'Zähldatum',
      sortKey: 'countingDate',
      width: 'w-[120px]',
      render: (row) => <span>{formatDate(row.countingDate)}</span>,
    },
    {
      key: 'progress',
      header: 'Fortschritt',
      align: 'right',
      width: 'w-[110px]',
      render: (row) => (
        <span className="font-mono tabular-nums text-[12px]">
          {countProgress(row.countedCount, row.lineCount)}
        </span>
      ),
    },
    {
      key: 'differenceSum',
      header: 'Differenz',
      align: 'right',
      width: 'w-[110px]',
      // Only on a booked list: before booking the figure would change with every count, and
      // a number that moves under the reader is worse than none.
      render: (row) => (
        <span className="font-mono tabular-nums text-[12px]">
          {row.postedAt === undefined ? '—' : formatQuantity(row.differenceSum ?? 0)}
        </span>
      ),
    },
    {
      key: 'changedBy',
      header: 'Gebucht von',
      width: 'w-[140px]',
      render: (row) => (
        <span className="text-text-secondary">
          {row.postedAt === undefined ? '—' : (row.changedBy ?? '')}
        </span>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Inventuren"
        subtitle="Zählen, Differenzen prüfen, buchen — ohne das Lager anzuhalten."
      >
        {mayCount && <Button onClick={() => setCreating(true)}>Neue Inventur</Button>}
      </PageHeader>

      <Panel
        title="Zähllisten"
        action={
          <QuickSearchField
            value={search.value}
            onChange={search.setValue}
            placeholder="Nummer, Lagerort oder Bemerkung"
          />
        }
      >
        <DataTable
          columns={columns}
          rows={result.content}
          keyOf={(row) => row.id}
          page={result}
          onPageChange={setPage}
          sort={sort}
          onSortChange={setSort}
          loading={stocktakes.isLoading}
          error={stocktakes.error}
          rowTo={(row) => `${STOCKTAKE_PATH}/${row.id}`}
          rowState={ORIGIN}
          empty={
            <EmptyState
              title="Noch keine Inventur erfasst"
              description="Eine Zählliste hält fest, wer wann welche Zeile gezählt hat."
            />
          }
        />
      </Panel>

      {creating && (
        <NewStocktakeDialog
          tenantId={tenantId}
          open={creating}
          onClose={() => setCreating(false)}
          onCreated={(stocktake) => {
            setCreating(false)
            navigate(`${STOCKTAKE_PATH}/${stocktake.id}`, { state: ORIGIN })
          }}
        />
      )}
    </>
  )
}
