import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Badge } from '../components/Badge'
import { DataTable, type Column } from '../components/DataTable'
import { EmptyState } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { QuickSearchField } from '../components/QuickSearch'
import { useQuickSearch } from '../components/useQuickSearch'
import { RequireTenant } from '../layout/RequireTenant'
import { api } from '../lib/api'
import { formatCount, formatQuantity } from '../lib/format'
import {
  INVENTORY_MODULE, INVENTORY_RIGHTS,
  shortageCauseLabel,
  shortageCauseTone,
  showsLocationChoice,
  STOCK_MOVEMENT_PATH,
  stockLocationsKey,
  stockLocationsUrl,
  stockShortageListKey,
  stockShortagesUrl,
} from '../lib/inventory'
import { originState } from '../lib/origin'
import { emptyPage, listQuery, PAGE_SIZE } from '../lib/paging'
import type { Page, ShortageCause, ShortageRow, StockLocation } from '../lib/types'

/** What a mask opened from this list returns to. */
const ORIGIN = originState('/unterdeckung', 'Unterdeckung')

/** What a row without a location says, because an empty cell reads as a missing value. */
const EVERY_LOCATION = 'Alle Lagerorte'

/** One filter chip: what it is called, and which cause it asks the server for. */
type CauseFilter = { id: string; label: string; cause?: ShortageCause }

const FILTERS: CauseFilter[] = [
  { id: 'alle', label: 'Alle' },
  { id: 'NEGATIVE', label: 'Negativ', cause: 'NEGATIVE' },
  { id: 'BELOW_MINIMUM', label: 'Unter Mindestbestand', cause: 'BELOW_MINIMUM' },
]

/**
 * What has to be bought, and what has to be corrected.
 *
 * <p>A list of its own and not a filter of the stock: that one answers «what lies there»,
 * this one «what has to be procured». Other sorting, other columns, other reader.
 *
 * <p>Two causes, kept apart. A negative stock is a booking mistake at one location; a stock
 * below the minimum is a buying job of the whole product (backend ADR-0063). This screen is
 * the counterpart to the decision to warn rather than to block — it only works while somebody
 * looks at it.
 */
export function StockShortageListPage() {
  return (
    <RequireTenant permission={INVENTORY_RIGHTS.read} module={INVENTORY_MODULE}>
      {(tenantId) => <ShortageList tenantId={tenantId} />}
    </RequireTenant>
  )
}

function ShortageList({ tenantId }: { tenantId: number }) {
  const search = useQuickSearch('')
  const [filterId, setFilterId] = useState('alle')
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState('missingQuantity,desc')

  const filter = FILTERS.find((entry) => entry.id === filterId) ?? FILTERS[0]

  // Only to decide whether the location column is shown; there is no location filter here.
  const locations = useQuery({
    queryKey: stockLocationsKey(tenantId),
    queryFn: () => api.get<StockLocation[]>(`${stockLocationsUrl(tenantId)}?activeOnly=true`),
  })

  const query = listQuery({
    cause: filter.cause,
    search: search.term,
    page,
    size: PAGE_SIZE,
    sort,
  })
  const shortages = useQuery({
    queryKey: stockShortageListKey(tenantId, query),
    queryFn: () => api.get<Page<ShortageRow>>(`${stockShortagesUrl(tenantId)}?${query}`),
    placeholderData: keepPreviousData,
  })

  const result = shortages.data ?? emptyPage<ShortageRow>()
  const showsLocations = showsLocationChoice(locations.data)

  /**
   * The movements behind one number.
   *
   * <p>A `BELOW_MINIMUM` row counts over every location and therefore links without one.
   */
  const journalOf = (row: ShortageRow) =>
    row.locationId === undefined
      ? `${STOCK_MOVEMENT_PATH}?produkt=${row.productId}`
      : `${STOCK_MOVEMENT_PATH}?produkt=${row.productId}&lagerort=${row.locationId}`

  const columns: Column<ShortageRow>[] = [
    {
      key: 'productNumber',
      header: 'Nummer',
      sortKey: 'productNumber',
      width: 'w-[110px]',
      render: (row) => (
        <span className="font-mono text-[12px] text-text-tertiary">
          {row.productNumber ?? '-'}
        </span>
      ),
    },
    {
      key: 'productName',
      header: 'Bezeichnung',
      sortKey: 'productName',
      render: (row) => <span className="font-medium">{row.productName}</span>,
    },
    ...(showsLocations
      ? [
          {
            key: 'locationName',
            header: 'Lagerort',
            sortKey: 'locationName',
            width: 'w-[150px]',
            render: (row: ShortageRow) => (
              <span className="text-text-secondary">{row.locationName ?? EVERY_LOCATION}</span>
            ),
          },
        ]
      : []),
    {
      key: 'availableQuantity',
      header: 'Bestand',
      align: 'right',
      sortKey: 'availableQuantity',
      width: 'w-[110px]',
      render: (row) => (
        <Link
          to={journalOf(row)}
          state={ORIGIN}
          className={`transition-colors hover:text-accent-text ${
            row.availableQuantity < 0 ? 'text-danger' : ''
          }`}
          title="Bewegungen dieser Zeile"
        >
          {formatQuantity(row.availableQuantity)}
        </Link>
      ),
    },
    {
      key: 'minimumQuantity',
      header: 'Mindestbestand',
      align: 'right',
      width: 'w-[130px]',
      render: (row) => (
        <span className="text-text-secondary">
          {row.minimumQuantity === undefined ? '-' : formatQuantity(row.minimumQuantity)}
        </span>
      ),
    },
    {
      key: 'missingQuantity',
      header: 'Fehlmenge',
      align: 'right',
      sortKey: 'missingQuantity',
      width: 'w-[120px]',
      render: (row) => (
        <span className="font-medium">
          {formatQuantity(row.missingQuantity)}
          {row.unitShortName ? ` ${row.unitShortName}` : ''}
        </span>
      ),
    },
    {
      key: 'cause',
      header: 'Ursache',
      width: 'w-[170px]',
      render: (row) => (
        <Badge tone={shortageCauseTone(row.cause)}>{shortageCauseLabel(row.cause)}</Badge>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Unterdeckung"
        subtitle={`${formatCount(result.totalElements)} offene Positionen`}
      />

      <div className="px-8 pb-12">
        <Panel padded={false}>
          <div className="flex flex-wrap items-center gap-1 border-b border-line-subtle px-5 py-3">
            {FILTERS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                aria-pressed={filter.id === entry.id}
                onClick={() => {
                  setFilterId(entry.id)
                  setPage(0)
                }}
                className={`h-8 rounded-[var(--radius-sm)] px-3 text-[13px] transition-colors ${
                  filter.id === entry.id
                    ? 'bg-sunken text-text-primary'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {entry.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-end gap-4 border-b border-line-subtle px-5 py-4">
            <QuickSearchField
              value={search.value}
              onChange={(next) => {
                search.setValue(next)
                setPage(0)
              }}
              placeholder="Nummer, Bezeichnung oder EAN"
              maxLength={140}
            />
          </div>

          <DataTable
            columns={columns}
            rows={result.content}
            keyOf={(row) => `${row.cause}-${row.productId}-${row.locationId ?? 'alle'}`}
            rowTo={(row) => `/produkte/${row.productId}`}
            rowState={ORIGIN}
            page={result}
            onPageChange={setPage}
            sort={sort}
            onSortChange={(next) => {
              setSort(next)
              setPage(0)
            }}
            loading={shortages.isPending}
            error={shortages.error}
            empty={
              <EmptyState
                title="Kein Bestand ist unterdeckt."
                description="Kein lagergeführtes Produkt liegt unter seinem Mindestbestand, und nirgends steht ein Bestand im Minus."
              />
            }
          />
        </Panel>
      </div>
    </>
  )
}
