import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { CheckboxField } from '../components/CheckboxField'
import { DataTable, type Column } from '../components/DataTable'
import { EmptyState } from '../components/Notice'
import { LinkButton } from '../components/LinkButton'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { QuickSearchField } from '../components/QuickSearch'
import { SelectField } from '../components/SelectField'
import { useQuickSearch } from '../components/useQuickSearch'
import { useAuth } from '../auth/useAuth'
import { RequireTenant } from '../layout/RequireTenant'
import { api } from '../lib/api'
import { formatCount, formatQuantity } from '../lib/format'
import {
  INVENTORY_MODULE, INVENTORY_RIGHTS,
  shortageCauseLabel,
  shortageCauseTone,
  showsLocationChoice,
  STOCK_MOVEMENT_PATH,
  STOCK_RESERVATION_PATH,
  stockListKey,
  stockLocationsKey,
  stockLocationsUrl,
  stockUrl,
} from '../lib/inventory'
import { originState } from '../lib/origin'
import { emptyPage, listQuery, PAGE_SIZE } from '../lib/paging'
import type { Page, StockLocation, StockRow } from '../lib/types'
import { BookStockDialog } from './inventory/BookStockDialog'

/** What a mask opened from this list returns to. */
const ORIGIN = originState('/bestand', 'Bestand')

/**
 * The stock: how much lies where, one row per product and location.
 *
 * <p>Every quantity is a link into the movements that explain it. The projection behind this
 * screen is a cache; the journal is the truth, and one click leads there (backend ADR-0061,
 * ADR-0063). That is also the audit path for a trustee.
 */
export function StockListPage() {
  return (
    <RequireTenant permission={INVENTORY_RIGHTS.read} module={INVENTORY_MODULE}>
      {(tenantId) => <StockList tenantId={tenantId} />}
    </RequireTenant>
  )
}

function StockList({ tenantId }: { tenantId: number }) {
  const { can } = useAuth()
  const mayMove = can(INVENTORY_RIGHTS.move)
  const search = useQuickSearch('')
  const [locationId, setLocationId] = useState('')
  const [withStockOnly, setWithStockOnly] = useState(false)
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState('productName,asc')
  const [booking, setBooking] = useState(false)

  const locations = useQuery({
    queryKey: stockLocationsKey(tenantId),
    queryFn: () => api.get<StockLocation[]>(`${stockLocationsUrl(tenantId)}?activeOnly=true`),
  })

  const query = listQuery({
    search: search.term,
    locationId: locationId === '' ? undefined : locationId,
    withStockOnly: withStockOnly ? true : undefined,
    page,
    size: PAGE_SIZE,
    sort,
  })
  const stock = useQuery({
    queryKey: stockListKey(tenantId, query),
    queryFn: () => api.get<Page<StockRow>>(`${stockUrl(tenantId)}?${query}`),
    // The rows found last stay on screen while the next answer is on its way.
    placeholderData: keepPreviousData,
  })

  const result = stock.data ?? emptyPage<StockRow>()
  const active = locations.data ?? []
  // One location means nothing to choose from and nothing to show (ADR-0014).
  const showsLocations = showsLocationChoice(locations.data)
  const filtered = search.term !== '' || locationId !== '' || withStockOnly

  const resetFilters = () => {
    search.setValue('')
    setLocationId('')
    setWithStockOnly(false)
    setPage(0)
  }

  /**
   * The movements behind one number, filtered the way the row is.
   *
   * <p>A computed figure without a way to check it is not believed, so every quantity cell
   * carries this link.
   */
  const journalOf = (row: StockRow) =>
    `${STOCK_MOVEMENT_PATH}?produkt=${row.productId}&lagerort=${row.locationId}`

  const columns: Column<StockRow>[] = [
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
            render: (row: StockRow) => (
              <span className="text-text-secondary">{row.locationName}</span>
            ),
          },
        ]
      : []),
    // Available first, stock beside it: what somebody may promise a customer is the number
    // that decides, and the stock is the explanation behind it (backend ADR-0066).
    {
      key: 'availableQuantity',
      header: 'Verfügbar',
      align: 'right',
      sortKey: 'availableQuantity',
      width: 'w-[120px]',
      render: (row) => (
        <Link
          to={journalOf(row)}
          state={ORIGIN}
          className={`font-medium transition-colors hover:text-accent-text ${
            row.availableQuantity < 0 ? 'text-danger' : ''
          }`}
          title="Bewegungen dieser Zeile"
        >
          {formatQuantity(row.availableQuantity)}
        </Link>
      ),
    },
    {
      key: 'quantity',
      header: 'Bestand',
      align: 'right',
      sortKey: 'quantity',
      width: 'w-[120px]',
      render: (row) => (
        <Link
          to={journalOf(row)}
          state={ORIGIN}
          className={`text-text-secondary transition-colors hover:text-accent-text ${
            row.quantity < 0 ? 'text-danger' : ''
          }`}
          title="Bewegungen dieser Zeile"
        >
          {formatQuantity(row.quantity)}
        </Link>
      ),
    },
    {
      key: 'reservedQuantity',
      header: 'Reserviert',
      align: 'right',
      sortKey: 'reservedQuantity',
      width: 'w-[120px]',
      // A link into the reservations, for the same reason every other number links: a figure
      // nobody can check is a figure nobody believes.
      render: (row) =>
        row.reservedQuantity === 0 ? (
          <span className="text-text-tertiary">-</span>
        ) : (
          <Link
            to={`${STOCK_RESERVATION_PATH}?produkt=${row.productId}`}
            state={ORIGIN}
            className="text-text-secondary transition-colors hover:text-accent-text"
            title="Reservierungen dieser Zeile"
          >
            {formatQuantity(row.reservedQuantity)}
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
      key: 'unitShortName',
      header: 'Einheit',
      width: 'w-[90px]',
      render: (row) => <span className="text-text-secondary">{row.unitShortName ?? '-'}</span>,
    },
    {
      key: 'shortage',
      header: 'Zustand',
      width: 'w-[170px]',
      render: (row) =>
        row.shortage === undefined ? null : (
          <Badge tone={shortageCauseTone(row.shortage)}>{shortageCauseLabel(row.shortage)}</Badge>
        ),
    },
  ]

  return (
    <>
      <PageHeader title="Bestand" subtitle={`${formatCount(result.totalElements)} Positionen`}>
        {mayMove && (
          <Button onClick={() => setBooking(true)}>
            <Plus size={15} aria-hidden />
            Bestand buchen
          </Button>
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
              placeholder="Nummer, Bezeichnung oder EAN"
              maxLength={140}
            />
            {showsLocations && (
              <SelectField
                label="Lagerort"
                value={locationId}
                onChange={(event) => {
                  setLocationId(event.target.value)
                  setPage(0)
                }}
                className="w-[190px]"
              >
                <option value="">Alle</option>
                {active.map((location) => (
                  <option key={location.id} value={`${location.id}`}>
                    {location.code} · {location.name}
                  </option>
                ))}
              </SelectField>
            )}
            <CheckboxField
              label="Nur mit Bestand"
              checked={withStockOnly}
              onChange={(event) => {
                setWithStockOnly(event.target.checked)
                setPage(0)
              }}
              className="h-10 items-center"
            />
          </div>

          <DataTable
            columns={columns}
            rows={result.content}
            keyOf={(row) => `${row.productId}-${row.locationId}`}
            rowTo={(row) => `/produkte/${row.productId}`}
            rowState={ORIGIN}
            page={result}
            onPageChange={setPage}
            sort={sort}
            onSortChange={(next) => {
              setSort(next)
              setPage(0)
            }}
            loading={stock.isPending}
            error={stock.error}
            empty={
              filtered ? (
                <EmptyState
                  title="Keine Treffer."
                  description="Für diese Auswahl liegt nichts im Lager."
                >
                  <Button variant="secondary" onClick={resetFilters}>
                    Filter zurücksetzen
                  </Button>
                </EmptyState>
              ) : (
                <EmptyState
                  title="Noch kein Produkt wird im Lager geführt."
                  description="Ein Produkt erscheint hier, sobald es in der Produktmaske als lagergeführt gekennzeichnet und einmal gebucht wurde."
                >
                  <LinkButton to="/produkte" state={ORIGIN} variant="secondary">
                    Produkte öffnen
                  </LinkButton>
                </EmptyState>
              )
            }
          />
        </Panel>
      </div>

      <BookStockDialog
        open={booking}
        onClose={() => setBooking(false)}
        tenantId={tenantId}
        locations={active}
      />
    </>
  )
}
