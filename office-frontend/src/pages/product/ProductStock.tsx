import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Badge } from '../../components/Badge'
import { Button } from '../../components/Button'
import { EmptyState, ErrorNotice, LoadingBlock } from '../../components/Notice'
import { Panel } from '../../components/Panel'
import { useAuth } from '../../auth/useAuth'
import { api } from '../../lib/api'
import { formatDate, formatQuantity } from '../../lib/format'
import {
  INVENTORY_RIGHTS,
  STOCK_MOVEMENT_PATH,
  stockBalanceKey,
  stockBalancesUrl,
  stockLocationsKey,
  stockLocationsUrl,
  stockMovementLatestKey,
  stockMovementsUrl,
} from '../../lib/inventory'
import { listQuery } from '../../lib/paging'
import type { Product, StockBalance, StockLocation, StockMovement } from '../../lib/types'
import { useCatalogueLabel } from '../../masterdata/useMasterData'
import { BookStockDialog } from '../inventory/BookStockDialog'

/**
 * The stock of one product: how much lies where, and what happened last.
 *
 * <p>Every number is a link into the journal, narrowed to this product and that location.
 * That is the answer to «why is it 17» — and there is deliberately no field here that could
 * make it something else.
 */
export function ProductStock({ tenantId, product }: { tenantId: number; product: Product }) {
  const { can } = useAuth()
  const reasonLabel = useCatalogueLabel(tenantId, 'movement-reason')
  const [booking, setBooking] = useState(false)

  const locations = useQuery({
    queryKey: stockLocationsKey(tenantId),
    queryFn: () => api.get<StockLocation[]>(`${stockLocationsUrl(tenantId)}?activeOnly=true`),
  })

  const balances = useQuery({
    queryKey: stockBalanceKey(tenantId, product.id),
    queryFn: () =>
      api.get<StockBalance[]>(
        `${stockBalancesUrl(tenantId)}?${listQuery({ productId: product.id })}`,
      ),
  })

  const latest = useQuery({
    queryKey: stockMovementLatestKey(tenantId, product.id),
    queryFn: () =>
      api.get<StockMovement[]>(
        `${stockMovementsUrl(tenantId)}/latest?${listQuery({ productId: product.id })}`,
      ),
  })

  const rows = balances.data ?? []
  const total = rows.reduce((sum, row) => sum + row.quantity, 0)
  const reservedTotal = rows.reduce((sum, row) => sum + row.reservedQuantity, 0)
  // Taken from the projection rather than from the product: the rows carry the short label
  // that was in force when they were last booked, which is what the numbers are counted in.
  const unit = rows[0]?.unitShortName ?? ''

  const journalLink = (locationId?: number) => ({
    pathname: STOCK_MOVEMENT_PATH,
    search: `?${listQuery({ produkt: product.id, lagerort: locationId })}`,
  })

  return (
    <div className="grid gap-6">
      <Panel
        title="Bestand je Lagerort"
        description="Aus den Bewegungen gerechnet. Es gibt kein Feld, das ihn setzt."
      >
        {balances.isPending ? (
          <LoadingBlock label="Bestand wird gelesen" />
        ) : balances.error ? (
          <ErrorNotice error={balances.error} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="Für dieses Produkt wurde noch nichts gebucht."
            description="Der Bestand ist null, solange keine Bewegung dafür existiert."
          >
            {can(INVENTORY_RIGHTS.move) && (
              <Button onClick={() => setBooking(true)}>
                <Plus size={15} aria-hidden />
                Bestand buchen
              </Button>
            )}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line-subtle text-left text-[11px] uppercase tracking-[0.06em] text-text-tertiary">
                  <th className="py-2 font-medium">Lagerort</th>
                  <th className="py-2 text-right font-medium">Bestand</th>
                  <th className="py-2 text-right font-medium">Reserviert</th>
                  <th className="py-2 text-right font-medium">Verfügbar</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.locationId} className="border-b border-line-subtle">
                    <td className="py-2">{nameOf(locations.data ?? [], row.locationId)}</td>
                    <Number to={journalLink(row.locationId)} value={row.quantity} unit={unit} />
                    <Number
                      to={journalLink(row.locationId)}
                      value={row.reservedQuantity}
                      unit={unit}
                    />
                    <Number
                      to={journalLink(row.locationId)}
                      value={row.availableQuantity}
                      unit={unit}
                    />
                  </tr>
                ))}
                <tr className="font-medium">
                  <td className="py-2">Total</td>
                  <Number to={journalLink()} value={total} unit={unit} />
                  <Number to={journalLink()} value={reservedTotal} unit={unit} />
                  <Number to={journalLink()} value={total - reservedTotal} unit={unit} />
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {rows.length > 0 && can(INVENTORY_RIGHTS.move) && (
          <div className="mt-4">
            <Button onClick={() => setBooking(true)}>
              <Plus size={15} aria-hidden />
              Bestand buchen
            </Button>
          </div>
        )}
      </Panel>

      <Panel title="Letzte Bewegungen" description="Die zehn jüngsten Buchungen dieses Produkts.">
        {latest.isPending ? (
          <LoadingBlock label="Bewegungen werden gelesen" />
        ) : latest.error ? (
          <ErrorNotice error={latest.error} />
        ) : (latest.data ?? []).length === 0 ? (
          <p className="text-[13px] text-text-secondary">
            Für dieses Produkt wurde noch nichts gebucht.
          </p>
        ) : (
          <ul className="grid gap-1">
            {(latest.data ?? []).map((movement) => (
              <li
                key={movement.id}
                className="flex items-baseline justify-between gap-3 border-b border-line-subtle py-1.5 text-[13px] last:border-b-0"
              >
                <span className="flex min-w-0 items-baseline gap-3">
                  <span className="w-[86px] shrink-0 text-text-tertiary">
                    {formatDate(movement.bookedOn)}
                  </span>
                  <Badge>{reasonLabel(movement.reason)}</Badge>
                  <span className="truncate text-text-secondary">
                    {nameOf(locations.data ?? [], movement.locationId)}
                  </span>
                </span>
                <span
                  className={`shrink-0 font-mono ${
                    movement.quantity < 0 ? 'text-danger' : 'text-accent-text'
                  }`}
                >
                  {movement.quantity > 0 ? '+' : ''}
                  {formatQuantity(movement.quantity)}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4">
          <Link
            to={journalLink()}
            className="text-[13px] text-accent-text underline-offset-2 hover:underline"
          >
            Alle Bewegungen
          </Link>
        </div>
      </Panel>

      <BookStockDialog
        open={booking}
        onClose={() => setBooking(false)}
        tenantId={tenantId}
        locations={locations.data ?? []}
        product={product}
      />
    </div>
  )
}

/** One quantity, as a link into the journal it comes from. */
function Number({
  to,
  value,
  unit,
}: {
  to: { pathname: string; search: string }
  value: number
  unit: string
}) {
  return (
    <td className="py-2 text-right">
      <Link
        to={to}
        className="font-mono text-text-primary underline-offset-2 hover:text-accent-text hover:underline"
      >
        {formatQuantity(value)}
        {unit ? ` ${unit}` : ''}
      </Link>
    </td>
  )
}

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
