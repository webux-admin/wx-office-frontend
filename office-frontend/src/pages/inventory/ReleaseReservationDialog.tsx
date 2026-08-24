import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { ErrorNotice } from '../../components/Notice'
import { TextField } from '../../components/TextField'
import { api } from '../../lib/api'
import { formatDate, formatQuantity } from '../../lib/format'
import { releaseReservationUrl } from '../../lib/inventory'
import type { StockReservation } from '../../lib/types'

/** What the reason column holds, and therefore what the field lets somebody type. */
const MAX_REASON = 60

/**
 * Ends one reservation by hand, with a reason.
 *
 * <p>The only tidy-up tool there is: a reservation has no expiry date and no nightly job
 * clears it out, so an order nobody ever delivers holds its quantity until somebody says why
 * it may go (backend ADR-0066). The goods return to the free quantity at the same moment —
 * that is why this hangs on the same right as booking stock, not on the reading right.
 *
 * <p>The reason is required, and the button stays shut until one stands there. A dialog that
 * accepts the click and then complains has wasted the click.
 */
export function ReleaseReservationDialog({
  reservation,
  onClose,
  tenantId,
  onReleased,
}: {
  /** The reservation to end; absent while the dialog is shut. */
  reservation: StockReservation | null
  onClose: () => void
  tenantId: number
  /** Told what was released, so the screen behind can announce it. */
  onReleased: (released: StockReservation) => void
}) {
  const queryClient = useQueryClient()
  const reasonField = useRef<HTMLInputElement>(null)
  const sent = useRef(false)
  const [reason, setReason] = useState('')
  const [wasOpen, setWasOpen] = useState(reservation !== null)

  const open = reservation !== null
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setReason('')
  }

  // The guard against a double click is released when the box opens, not while it renders.
  useEffect(() => {
    if (open) sent.current = false
  }, [open])

  const release = useMutation({
    mutationFn: () =>
      api.post<StockReservation>(releaseReservationUrl(tenantId, reservation?.id ?? 0), {
        reason: reason.trim(),
      }),
    onSuccess: (released) => {
      // The free quantity changed, so everything that shows one is stale: the reservations
      // themselves, the stock list, the shortfalls and the rows in the product mask.
      void queryClient.invalidateQueries({ queryKey: ['stock-reservations', tenantId] })
      void queryClient.invalidateQueries({ queryKey: ['stock-list', tenantId] })
      void queryClient.invalidateQueries({ queryKey: ['stock-shortages', tenantId] })
      void queryClient.invalidateQueries({ queryKey: ['stock-balances', tenantId] })
      sent.current = false
      onReleased(released)
      onClose()
    },
    onError: () => {
      sent.current = false
    },
  })

  const ready = reason.trim() !== ''

  const submit = () => {
    if (!ready || sent.current || release.isPending) return
    sent.current = true
    release.mutate()
  }

  /** Enter sends from the reason field, which is the only field in the box. */
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    submit()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Reservierung freigeben"
      description="Die vorgemerkte Menge geht zurück in den verfügbaren Bestand."
      initialFocus={reasonField}
      onSubmit={release.isPending ? undefined : submit}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={submit} busy={release.isPending} disabled={!ready} shortcut>
            Freigeben
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {release.error !== null && <ErrorNotice error={release.error} />}

        {reservation !== null && (
          <dl className="grid gap-1 rounded-[var(--radius-md)] border border-line-subtle bg-sunken px-4 py-3 text-[13px]">
            <Row
              label="Produkt"
              value={`${reservation.productNumber ?? '-'} · ${reservation.productName}`}
            />
            <Row label="Lagerort" value={reservation.locationName} />
            <Row label="Beleg" value={reservation.sourceNumber ?? '-'} />
            <Row label="Reserviert" value={formatDate(reservation.reservedOn)} />
            <Row
              label="Offen"
              value={`${formatQuantity(reservation.openQuantity)} ${
                reservation.unitShortName ?? ''
              }`.trim()}
            />
          </dl>
        )}

        <TextField
          ref={reasonField}
          label="Grund"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          onKeyDown={onKeyDown}
          maxLength={MAX_REASON}
          hint="Bleibt auf der Reservierung stehen und ist Pflicht."
        />
      </div>
    </Dialog>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-[80px] shrink-0 text-text-tertiary">{label}</dt>
      <dd className="min-w-0 flex-1 text-text-primary">{value}</dd>
    </div>
  )
}
