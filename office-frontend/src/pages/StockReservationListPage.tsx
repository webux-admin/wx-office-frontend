import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
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
import { formatCount, formatDate, formatQuantity } from '../lib/format'
import {
  INVENTORY_RIGHTS,
  reservationStatusLabel,
  reservationStatusTone,
  reservesStock,
  showsLocationChoice,
  STALE_RESERVATION_DAYS,
  stockLocationsKey,
  stockLocationsUrl,
  stockReservationListKey,
  stockReservationsUrl,
} from '../lib/inventory'
import { originState } from '../lib/origin'
import { emptyPage, listQuery, PAGE_SIZE } from '../lib/paging'
import { ORDER_KIND } from '../lib/salesDocument'
import type {
  DocumentType,
  Page,
  StockLocation,
  StockReservation,
  StockReservationStatus,
} from '../lib/types'
import { ReleaseReservationDialog } from './inventory/ReleaseReservationDialog'

/** What a mask opened from this list returns to. */
const ORIGIN = originState('/reservierungen', 'Reservierungen')

/** One filter chip: what it is called, and what it asks the server for. */
type ReservationFilterChip = {
  id: string
  label: string
  status?: StockReservationStatus
  olderThanDays?: number
}

/**
 * Three chips and no more.
 *
 * <p>«Älter als 30 Tage» stands in the open rather than hidden in a column setting: with a
 * reservation that never expires, the old ones are the whole reason this screen exists
 * (backend ADR-0066). It keeps the open state as well — a reservation that was delivered a
 * year ago is not something anybody has to tidy up.
 */
const FILTERS: ReservationFilterChip[] = [
  { id: 'offen', label: 'Offen', status: 'OPEN' },
  {
    id: 'alt',
    label: `Älter als ${STALE_RESERVATION_DAYS} Tage`,
    status: 'OPEN',
    olderThanDays: STALE_RESERVATION_DAYS,
  },
  { id: 'alle', label: 'Alle' },
]

/**
 * What an issued order has spoken for, and what became of it.
 *
 * <p>Without this screen the reservation is a black box that takes goods away from the user,
 * and the first reaction in daily work is to switch it off. It is also the only tidy-up tool
 * there is: a reservation has no expiry date, so an order nobody ever delivers holds its
 * quantity until somebody releases it here (backend ADR-0066).
 */
export function StockReservationListPage() {
  return (
    <RequireTenant permission={INVENTORY_RIGHTS.read}>
      {(tenantId) => <ReservationList tenantId={tenantId} />}
    </RequireTenant>
  )
}

function ReservationList({ tenantId }: { tenantId: number }) {
  const { can } = useAuth()
  const mayRelease = can(INVENTORY_RIGHTS.move)
  const maySeeDocumentTypes = can('DOCUMENT_TYPE_READ')
  // A link may arrive already narrowed to one product — that is what the panel in the product
  // mask points at. Kept out of the reset, because it is the subject of the screen and not a
  // filter somebody set.
  const [params] = useSearchParams()
  const search = useQuickSearch('')
  const [productId] = useState(params.get('produkt') ?? '')
  const [filterId, setFilterId] = useState(productId === '' ? 'offen' : 'alle')
  const [locationId, setLocationId] = useState('')
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState('reservedOn,asc')
  const [releasing, setReleasing] = useState<StockReservation | null>(null)
  const [announcement, setAnnouncement] = useState('')

  const filter = FILTERS.find((entry) => entry.id === filterId) ?? FILTERS[0]

  const locations = useQuery({
    queryKey: stockLocationsKey(tenantId),
    queryFn: () => api.get<StockLocation[]>(`${stockLocationsUrl(tenantId)}?activeOnly=true`),
  })

  // Only to word the empty state: «nothing is reserved» reads very differently when no kind
  // of document reserves at all. Not asked for where the right to see them is missing.
  const documentTypes = useQuery({
    queryKey: ['document-types', tenantId],
    queryFn: () => api.get<DocumentType[]>(`/api/tenants/${tenantId}/document-types`),
    enabled: maySeeDocumentTypes,
  })

  const query = listQuery({
    search: search.term,
    status: filter.status,
    olderThanDays: filter.olderThanDays,
    productId: productId === '' ? undefined : productId,
    locationId: locationId === '' ? undefined : locationId,
    page,
    size: PAGE_SIZE,
    sort,
  })
  const reservations = useQuery({
    queryKey: stockReservationListKey(tenantId, query),
    queryFn: () => api.get<Page<StockReservation>>(`${stockReservationsUrl(tenantId)}?${query}`),
    // The rows found last stay on screen while the next answer is on its way.
    placeholderData: keepPreviousData,
  })

  const result = reservations.data ?? emptyPage<StockReservation>()
  const active = locations.data ?? []
  const showsLocations = showsLocationChoice(locations.data)
  // What the reset button can undo, and what narrows the list altogether. A product arriving
  // through the address is the subject of the screen, so no button pretends to clear it.
  const narrowed = search.term !== '' || locationId !== '' || filterId !== 'alle'
  const filtered = narrowed || productId !== ''
  // Undefined while the answer is on its way or the right is missing: only a definite «no»
  // earns the sentence about the kinds of document.
  const anyKindReserves = documentTypes.data?.some((type) => reservesStock(type.stockEffect))

  const resetFilters = () => {
    search.setValue('')
    setLocationId('')
    setFilterId('alle')
    setPage(0)
  }

  const columns: Column<StockReservation>[] = [
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
            render: (row: StockReservation) => (
              <span className="text-text-secondary">{row.locationName}</span>
            ),
          },
        ]
      : []),
    {
      key: 'sourceNumber',
      header: 'Beleg',
      width: 'w-[130px]',
      // Only an order reserves, so the link always leads to the order mask.
      render: (row) =>
        row.sourceId === undefined ? (
          <span className="text-text-tertiary">-</span>
        ) : (
          <Link
            to={`${ORDER_KIND.path}/${row.sourceId}`}
            state={ORIGIN}
            className="font-mono text-[12px] text-accent-text underline-offset-2 hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            {row.sourceNumber ?? `#${row.sourceId}`}
          </Link>
        ),
    },
    {
      key: 'reservedOn',
      header: 'Reserviert',
      sortKey: 'reservedOn',
      width: 'w-[110px]',
      render: (row) => (
        <span className="text-text-secondary">{formatDate(row.reservedOn)}</span>
      ),
    },
    {
      key: 'quantity',
      header: 'Menge',
      align: 'right',
      sortKey: 'quantity',
      width: 'w-[100px]',
      render: (row) => <span className="font-mono">{formatQuantity(row.quantity)}</span>,
    },
    {
      key: 'quantityReleased',
      header: 'Verbraucht',
      align: 'right',
      sortKey: 'quantityReleased',
      width: 'w-[110px]',
      render: (row) => (
        <span className="font-mono text-text-secondary">
          {formatQuantity(row.quantityReleased)}
        </span>
      ),
    },
    {
      key: 'openQuantity',
      header: 'Offen',
      align: 'right',
      sortKey: 'openQuantity',
      width: 'w-[110px]',
      render: (row) => (
        <span className="font-mono font-medium">
          {formatQuantity(row.openQuantity)}
          {row.unitShortName ? ` ${row.unitShortName}` : ''}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortKey: 'status',
      width: 'w-[130px]',
      render: (row) => (
        <Badge tone={reservationStatusTone(row.status)}>
          {reservationStatusLabel(row.status)}
        </Badge>
      ),
    },
    ...(mayRelease
      ? [
          {
            key: 'release',
            header: '',
            width: 'w-[120px]',
            render: (row: StockReservation) =>
              row.status !== 'OPEN' ? null : (
                <Button
                  variant="secondary"
                  onClick={(event) => {
                    event.stopPropagation()
                    setReleasing(row)
                  }}
                >
                  Freigeben
                </Button>
              ),
          },
        ]
      : []),
  ]

  return (
    <>
      <PageHeader
        title="Reservierungen"
        subtitle={`${formatCount(result.totalElements)} Positionen`}
      />

      <div className="px-8 pb-12">
        {/* The result of a release is a number changing somewhere else on the screen, which a
            screen reader would never mention. */}
        <p aria-live="polite" className="sr-only">
          {announcement}
        </p>

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
              placeholder="Nummer, Bezeichnung oder Beleg"
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
          </div>

          <DataTable
            columns={columns}
            rows={result.content}
            keyOf={(row) => row.id}
            rowTo={(row) => `/produkte/${row.productId}`}
            rowState={ORIGIN}
            page={result}
            onPageChange={setPage}
            sort={sort}
            onSortChange={(next) => {
              setSort(next)
              setPage(0)
            }}
            loading={reservations.isPending}
            error={reservations.error}
            empty={
              filtered ? (
                <EmptyState
                  title="Keine Treffer."
                  description="Für diese Auswahl ist nichts reserviert."
                >
                  {narrowed && (
                    <Button variant="secondary" onClick={resetFilters}>
                      Filter zurücksetzen
                    </Button>
                  )}
                </EmptyState>
              ) : anyKindReserves === false ? (
                <EmptyState
                  title="Keine Belegart reserviert Bestand."
                  description="Eine Reservierung entsteht, wenn ein Auftrag mit lagergeführten Positionen ausgestellt wird. Dafür muss die Lagerwirkung der Belegart auf «Reservieren» stehen."
                >
                  <LinkButton to="/belegarten" state={ORIGIN} variant="secondary">
                    Belegarten öffnen
                  </LinkButton>
                </EmptyState>
              ) : (
                <EmptyState
                  title="Zurzeit ist nichts reserviert."
                  description="Eine Reservierung entsteht, wenn ein Auftrag mit lagergeführten Positionen ausgestellt wird."
                />
              )
            }
          />
        </Panel>
      </div>

      <ReleaseReservationDialog
        reservation={releasing}
        onClose={() => setReleasing(null)}
        tenantId={tenantId}
        onReleased={(released) =>
          setAnnouncement(
            `Reservierung über ${formatQuantity(released.quantity)} ${
              released.productName
            } freigegeben.`,
          )
        }
      />
    </>
  )
}
