import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { DataTable, type Column } from '../components/DataTable'
import { EmptyState } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { QuickSearchField } from '../components/QuickSearch'
import { SelectField } from '../components/SelectField'
import { TextField } from '../components/TextField'
import { useQuickSearch } from '../components/useQuickSearch'
import { useAuth } from '../auth/useAuth'
import { RequireTenant } from '../layout/RequireTenant'
import { api } from '../lib/api'
import { formatCount, formatDate, formatQuantity } from '../lib/format'
import {
  INVENTORY_MODULE, INVENTORY_RIGHTS,
  isReversible,
  stockLocationsKey,
  stockLocationsUrl,
  stockMovementListKey,
  stockMovementsUrl,
} from '../lib/inventory'
import { emptyPage, listQuery, PAGE_SIZE } from '../lib/paging'
import type { Page, StockLocation, StockMovement } from '../lib/types'
import { useCatalogueLabel } from '../masterdata/useMasterData'
import { BookStockDialog } from './inventory/BookStockDialog'
import { ReverseMovementDialog } from './inventory/ReverseMovementDialog'

/**
 * The movement journal: everything that ever moved, newest first.
 *
 * <p>Read only. There is no cell that can be edited and no row that can be deleted — a wrong
 * booking is corrected with a counter booking, which is what «Stornieren» writes. The screen
 * says so by having no other way out (backend ADR-0061).
 */
export function StockMovementListPage() {
  return (
    <RequireTenant permission={INVENTORY_RIGHTS.read} module={INVENTORY_MODULE}>
      {(tenantId) => <StockMovements tenantId={tenantId} />}
    </RequireTenant>
  )
}

function StockMovements({ tenantId }: { tenantId: number }) {
  const { can } = useAuth()
  const mayMove = can(INVENTORY_RIGHTS.move)
  const reasonLabel = useCatalogueLabel(tenantId, 'movement-reason')
  const sourceLabel = useCatalogueLabel(tenantId, 'movement-source-kind')

  // A link may arrive with the journal already narrowed to one product and location — that is
  // what every number in the product mask points at. The stock-as-of report adds «bis» to
  // that: its links carry the cut-off day, so the journal opens on the same period the
  // report was calculated from instead of showing what was booked after it.
  const [params] = useSearchParams()
  // «suche» is a document number, and the quick search of the journal looks into the source
  // number of a row: that is how the «Buchungen» panel of a booked count list points at
  // exactly the movements that list wrote. Read once, like the four parameters below — the
  // field takes over from there, so the term can be widened again.
  const search = useQuickSearch(params.get('suche') ?? '')
  const [productId] = useState(params.get('produkt') ?? '')
  // Narrowed to one lot by the product mask: that link is the whole of the traceability, so
  // it arrives filtered rather than expecting somebody to type the number in.
  const [lotId] = useState(params.get('charge') ?? '')
  const [locationId, setLocationId] = useState(params.get('lagerort') ?? '')
  const [reason, setReason] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState(params.get('bis') ?? '')
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState('bookedOn,desc')
  const [booking, setBooking] = useState(false)
  const [reversing, setReversing] = useState<StockMovement | null>(null)

  const locations = useQuery({
    queryKey: stockLocationsKey(tenantId),
    queryFn: () => api.get<StockLocation[]>(`${stockLocationsUrl(tenantId)}?activeOnly=true`),
  })

  const query = listQuery({
    productId: productId === '' ? undefined : productId,
    lotId: lotId === '' ? undefined : lotId,
    locationId: locationId === '' ? undefined : locationId,
    reason: reason === '' ? undefined : reason,
    from: from === '' ? undefined : from,
    to: to === '' ? undefined : to,
    search: search.term,
    page,
    size: PAGE_SIZE,
    sort,
  })
  const movements = useQuery({
    queryKey: stockMovementListKey(tenantId, query),
    queryFn: () => api.get<Page<StockMovement>>(`${stockMovementsUrl(tenantId)}?${query}`),
    placeholderData: keepPreviousData,
  })

  const result = movements.data ?? emptyPage<StockMovement>()
  const active = locations.data ?? []
  const filtered =
    search.term !== '' || locationId !== '' || reason !== '' || from !== '' || to !== ''

  const resetFilters = () => {
    search.setValue('')
    setLocationId('')
    setReason('')
    setFrom('')
    setTo('')
    setPage(0)
  }

  const columns: Column<StockMovement>[] = [
    {
      key: 'bookedOn',
      header: 'Datum',
      sortKey: 'bookedOn',
      width: 'w-[110px]',
      render: (movement) => formatDate(movement.bookedOn),
    },
    {
      key: 'product',
      header: 'Produkt',
      sortKey: 'productName',
      render: (movement) => (
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="w-[86px] shrink-0 truncate font-mono text-[12px] text-text-tertiary">
            {movement.productNumber ?? '-'}
          </span>
          <span className="truncate font-medium">{movement.productName}</span>
        </span>
      ),
    },
    {
      key: 'location',
      header: 'Lagerort',
      width: 'w-[150px]',
      render: (movement) => (
        <span className="text-text-secondary">{nameOf(active, movement.locationId)}</span>
      ),
    },
    {
      key: 'lot',
      header: 'Charge/Serie',
      width: 'w-[150px]',
      render: (movement) =>
        movement.lotNumber === undefined || movement.lotNumber === '' ? (
          <span className="text-text-tertiary">-</span>
        ) : (
          <span className="truncate font-mono text-[12px] text-text-secondary">
            {movement.lotNumber}
          </span>
        ),
    },
    {
      key: 'quantity',
      header: 'Menge',
      align: 'right',
      sortKey: 'quantity',
      width: 'w-[130px]',
      render: (movement) => (
        <span
          className={`font-mono ${movement.quantity < 0 ? 'text-danger' : 'text-accent-text'}`}
        >
          {movement.quantity > 0 ? '+' : ''}
          {formatQuantity(movement.quantity)}
          {movement.unitShortName ? ` ${movement.unitShortName}` : ''}
        </span>
      ),
    },
    {
      key: 'reason',
      header: 'Grund',
      sortKey: 'reason',
      width: 'w-[160px]',
      render: (movement) => <Badge>{reasonLabel(movement.reason)}</Badge>,
    },
    {
      key: 'source',
      header: 'Herkunft',
      width: 'w-[150px]',
      render: (movement) => (
        <span className="text-text-secondary">
          {movement.sourceNumber ?? sourceLabel(movement.sourceKind)}
        </span>
      ),
    },
    {
      key: 'user',
      header: 'Benutzer',
      sortKey: 'createdBy',
      width: 'w-[120px]',
      render: (movement) => (
        <span className="text-text-tertiary">{movement.createdBy ?? '-'}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: 'w-[110px]',
      render: (movement) =>
        mayMove && isReversible(movement) ? (
          <button
            type="button"
            onClick={() => setReversing(movement)}
            className="text-[12px] text-text-tertiary transition-colors hover:text-danger"
          >
            Stornieren
          </button>
        ) : null,
    },
  ]

  return (
    <>
      <PageHeader
        title="Bewegungen"
        subtitle={`${formatCount(result.totalElements)} Buchungen`}
      >
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
              placeholder="Produkt, Belegnummer oder Charge"
              maxLength={140}
            />
            {active.length >= 2 && (
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
            <SelectField
              label="Grund"
              value={reason}
              onChange={(event) => {
                setReason(event.target.value)
                setPage(0)
              }}
              className="w-[190px]"
            >
              <option value="">Alle</option>
              {REASONS.map((code) => (
                <option key={code} value={code}>
                  {reasonLabel(code)}
                </option>
              ))}
            </SelectField>
            <TextField
              label="Von"
              type="date"
              value={from}
              onChange={(event) => {
                setFrom(event.target.value)
                setPage(0)
              }}
              className="w-[160px]"
            />
            <TextField
              label="Bis"
              type="date"
              value={to}
              onChange={(event) => {
                setTo(event.target.value)
                setPage(0)
              }}
              className="w-[160px]"
            />
          </div>

          <DataTable
            columns={columns}
            rows={result.content}
            keyOf={(movement) => movement.id}
            page={result}
            onPageChange={setPage}
            sort={sort}
            onSortChange={(next) => {
              setSort(next)
              setPage(0)
            }}
            loading={movements.isPending}
            error={movements.error}
            empty={
              <EmptyState
                title={filtered ? 'Keine Treffer' : 'Noch nichts gebucht'}
                description={
                  filtered
                    ? 'Für diese Auswahl gibt es keine Bewegung.'
                    : 'Bestand entsteht nur aus Bewegungen. Erfassen Sie den Anfangsbestand.'
                }
              >
                {filtered ? (
                  <Button variant="secondary" onClick={resetFilters}>
                    Filter zurücksetzen
                  </Button>
                ) : (
                  mayMove && (
                    <Button onClick={() => setBooking(true)}>
                      <Plus size={15} aria-hidden />
                      Bestand buchen
                    </Button>
                  )
                )}
              </EmptyState>
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

      <ReverseMovementDialog
        movement={reversing}
        onClose={() => setReversing(null)}
        tenantId={tenantId}
        reasonLabel={reasonLabel}
      />
    </>
  )
}

/**
 * The reasons the filter offers.
 *
 * <p>All eleven, unlike the booking dialog: the journal has to be able to narrow to rows that
 * an operation of its own wrote — a transfer or a reversal is exactly what one looks for.
 */
const REASONS = [
  'OPENING',
  'RECEIPT',
  'CUSTOMER_RETURN',
  'ISSUE',
  'SCRAP',
  'OWN_USE',
  'LOSS',
  'TRANSFER_OUT',
  'TRANSFER_IN',
  'REVERSAL',
  'COUNT_ADJUSTMENT',
]

/**
 * What a location is called, for a row that only carries its id.
 *
 * @param locations the active locations
 * @param id the location of the row
 * @returns the name, or the id where the location was switched off since
 */
function nameOf(locations: StockLocation[], id: number): string {
  return locations.find((location) => location.id === id)?.name ?? `#${id}`
}
