import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Badge } from '../../components/Badge'
import { Button } from '../../components/Button'
import { DataTable, type Column } from '../../components/DataTable'
import { EmptyState } from '../../components/Notice'
import { Panel } from '../../components/Panel'
import { QuickSearchField } from '../../components/QuickSearch'
import { useQuickSearch } from '../../components/useQuickSearch'
import { useAuth } from '../../auth/useAuth'
import { api } from '../../lib/api'
import { formatQuantity } from '../../lib/format'
import {
  INVENTORY_RIGHTS,
  expiryLabel,
  lotKindLabelPlural,
  lotKindOf,
  productLotsKey,
  productLotsUrl,
  STOCK_MOVEMENT_PATH,
} from '../../lib/inventory'
import { emptyPage, listQuery, PAGE_SIZE } from '../../lib/paging'
import type { Lot, Page, Product } from '../../lib/types'
import { LotDialog } from '../inventory/LotDialog'

/**
 * The lots or serial numbers of one product, and what lies where under each.
 *
 * <p>Every quantity is a link into the journal, narrowed to that lot: that is the whole of the
 * traceability. Where a batch came from is deliberately not a field here — supplier and
 * receipt date are not kept on the lot, and the movements answer the question instead
 * (backend ADR-0067).
 *
 * <p>Blocked lots are asked for on purpose. The list endpoint hides them by default, which is
 * right for a picker and wrong here: a frozen batch that no screen shows could never be
 * thawed again.
 */
export function ProductLots({
  tenantId,
  product,
  onBook,
}: {
  tenantId: number
  product: Product
  /** Opens the booking dialog, the only way a lot ever comes into being. */
  onBook: () => void
}) {
  const { can } = useAuth()
  const kind = lotKindOf(product.tracking)
  const search = useQuickSearch('')
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState('lotNumber,asc')
  const [editing, setEditing] = useState<Lot | null>(null)

  const query = listQuery({
    search: search.term,
    includeBlocked: true,
    page,
    size: PAGE_SIZE,
    sort,
  })
  const lots = useQuery({
    queryKey: productLotsKey(tenantId, product.id, query),
    queryFn: () => api.get<Page<Lot>>(`${productLotsUrl(tenantId, product.id)}?${query}`),
    enabled: kind !== undefined,
    placeholderData: keepPreviousData,
  })

  if (kind === undefined) return null

  const result = lots.data ?? emptyPage<Lot>()
  const mayMove = can(INVENTORY_RIGHTS.move)

  const journalLink = (lot: Lot, locationId?: number) => ({
    pathname: STOCK_MOVEMENT_PATH,
    search: `?${listQuery({ produkt: product.id, charge: lot.id, lagerort: locationId })}`,
  })

  const columns: Column<Lot>[] = [
    {
      key: 'lotNumber',
      header: 'Nummer',
      sortKey: 'lotNumber',
      render: (lot) => (
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="truncate font-mono text-[13px]">{lot.lotNumber}</span>
          {lot.blocked && <Badge tone="danger">gesperrt</Badge>}
        </span>
      ),
    },
    {
      key: 'expiryDate',
      header: 'Haltbarkeit',
      sortKey: 'expiryDate',
      width: 'w-[200px]',
      render: (lot) =>
        expiryLabel(lot) === '' ? (
          <span className="text-text-tertiary">-</span>
        ) : (
          <span className={lot.expired ? 'text-danger' : 'text-text-secondary'}>
            {expiryLabel(lot)}
          </span>
        ),
    },
    {
      key: 'locations',
      header: 'Bestand je Lagerort',
      render: (lot) =>
        lot.locations.length === 0 ? (
          <span className="text-text-tertiary">kein Bestand</span>
        ) : (
          <span className="flex flex-wrap gap-x-3 gap-y-0.5">
            {lot.locations.map((place) => (
              <Link
                key={place.locationId}
                to={journalLink(lot, place.locationId)}
                className="text-text-secondary underline-offset-2 hover:text-accent-text hover:underline"
              >
                {place.locationName}{' '}
                <span className="font-mono tabular-nums">{formatQuantity(place.quantity)}</span>
              </Link>
            ))}
          </span>
        ),
    },
    {
      key: 'quantity',
      header: 'Total',
      align: 'right',
      sortKey: 'quantity',
      width: 'w-[120px]',
      render: (lot) => (
        <Link
          to={journalLink(lot)}
          className="font-mono tabular-nums text-text-primary underline-offset-2 hover:text-accent-text hover:underline"
        >
          {formatQuantity(lot.quantity)}
        </Link>
      ),
    },
  ]

  return (
    <>
      <Panel
        title={lotKindLabelPlural(kind)}
        description="Jede Zahl führt in das Journal dieser Nummer. Woher die Ware kam, steht dort."
        padded={false}
      >
        <div className="flex flex-wrap items-end gap-4 border-b border-line-subtle px-5 py-4">
          <QuickSearchField
            value={search.value}
            onChange={(next) => {
              search.setValue(next)
              setPage(0)
            }}
            placeholder="Nummer"
            maxLength={60}
          />
        </div>

        <DataTable
          columns={columns}
          rows={result.content}
          keyOf={(lot) => lot.id}
          page={result}
          onPageChange={setPage}
          sort={sort}
          onSortChange={(next) => {
            setSort(next)
            setPage(0)
          }}
          loading={lots.isPending}
          error={lots.error}
          onRowOpen={mayMove ? setEditing : undefined}
          empty={
            <EmptyState
              title={
                search.term === ''
                  ? `Noch keine ${lotKindLabelPlural(kind)} erfasst.`
                  : 'Keine Treffer'
              }
              description={
                search.term === ''
                  ? `${lotKindLabelPlural(kind)} entstehen beim Zugang.`
                  : 'Für diese Suche gibt es keine Nummer.'
              }
            >
              {search.term === '' && mayMove && (
                <Button onClick={onBook}>
                  <Plus size={15} aria-hidden />
                  Bestand buchen
                </Button>
              )}
            </EmptyState>
          }
        />
      </Panel>

      <LotDialog lot={editing} onClose={() => setEditing(null)} tenantId={tenantId} />
    </>
  )
}
