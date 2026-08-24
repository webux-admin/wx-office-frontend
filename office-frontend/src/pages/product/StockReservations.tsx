import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Badge } from '../../components/Badge'
import { EmptyState, ErrorNotice, LoadingBlock } from '../../components/Notice'
import { Panel } from '../../components/Panel'
import { api } from '../../lib/api'
import { formatDate, formatQuantity } from '../../lib/format'
import {
  reservationStatusLabel,
  reservationStatusTone,
  STOCK_RESERVATION_PATH,
  stockReservationListKey,
  stockReservationsUrl,
} from '../../lib/inventory'
import { originState } from '../../lib/origin'
import { listQuery } from '../../lib/paging'
import { ORDER_KIND } from '../../lib/salesDocument'
import type { Page, Product, StockReservation } from '../../lib/types'

/** How many rows the panel shows before it sends the reader to the full list. */
const SHOWN = 10

/**
 * Who has spoken for this product, and on which document.
 *
 * <p>Without this the reservation is a black box that takes goods away from the user: the
 * stock says 40, the free quantity says 12, and nothing on the screen says why. Open ones
 * only — a reservation that was delivered or released explains nothing about today's free
 * quantity (backend ADR-0066).
 */
export function StockReservations({
  tenantId,
  product,
}: {
  tenantId: number
  product: Product
}) {
  const origin = originState(`/produkte/${product.id}`, product.name)

  const query = listQuery({ productId: product.id, status: 'OPEN', page: 0, size: SHOWN })
  const reservations = useQuery({
    queryKey: stockReservationListKey(tenantId, query),
    queryFn: () => api.get<Page<StockReservation>>(`${stockReservationsUrl(tenantId)}?${query}`),
  })

  const result = reservations.data
  const rows = result?.content ?? []

  return (
    <Panel
      title="Reserviert für"
      description="Was ausgestellte Aufträge vorgemerkt haben. Der Bestand liegt noch da, verfügbar ist er nicht."
    >
      {reservations.isPending ? (
        <LoadingBlock label="Reservierungen werden gelesen" />
      ) : reservations.error ? (
        <ErrorNotice error={reservations.error} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Für dieses Produkt ist nichts reserviert."
          description="Eine Reservierung entsteht, wenn ein Auftrag mit diesem Produkt ausgestellt wird."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-line-subtle text-left text-[11px] uppercase tracking-[0.06em] text-text-tertiary">
                <th className="py-2 font-medium">Beleg</th>
                <th className="py-2 font-medium">Datum</th>
                <th className="py-2 font-medium">Lagerort</th>
                <th className="py-2 text-right font-medium">Offen</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-line-subtle last:border-b-0">
                  <td className="py-2">
                    {row.sourceId === undefined ? (
                      <span className="text-text-tertiary">-</span>
                    ) : (
                      <Link
                        to={`${ORDER_KIND.path}/${row.sourceId}`}
                        state={origin}
                        className="font-mono text-[12px] text-accent-text underline-offset-2 hover:underline"
                      >
                        {row.sourceNumber ?? `#${row.sourceId}`}
                      </Link>
                    )}
                  </td>
                  <td className="py-2 text-text-secondary">{formatDate(row.reservedOn)}</td>
                  <td className="py-2 text-text-secondary">{row.locationName}</td>
                  <td className="py-2 text-right font-mono">
                    {formatQuantity(row.openQuantity)}
                    {row.unitShortName ? ` ${row.unitShortName}` : ''}
                  </td>
                  <td className="py-2">
                    <Badge tone={reservationStatusTone(row.status)}>
                      {reservationStatusLabel(row.status)}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > 0 && (
        <div className="mt-4">
          <Link
            to={`${STOCK_RESERVATION_PATH}?produkt=${product.id}`}
            state={origin}
            className="text-[13px] text-accent-text underline-offset-2 hover:underline"
          >
            {result !== undefined && result.totalElements > rows.length
              ? `Alle ${result.totalElements} Reservierungen`
              : 'Alle Reservierungen'}
          </Link>
        </div>
      )}
    </Panel>
  )
}
