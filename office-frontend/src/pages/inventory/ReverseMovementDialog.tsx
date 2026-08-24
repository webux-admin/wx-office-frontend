import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { ErrorNotice } from '../../components/Notice'
import { TextAreaField } from '../../components/TextAreaField'
import { api } from '../../lib/api'
import { formatDate, formatQuantity } from '../../lib/format'
import { stockMovementsUrl } from '../../lib/inventory'
import type { StockBooking, StockMovement } from '../../lib/types'

/**
 * Takes one movement back with a counter booking.
 *
 * <p>The original row is not changed and not deleted — the database refuses both. What is
 * written is a new row with the negated quantity, and the reason for it is required: a
 * booking record that does not say why it exists explains nothing ten years later.
 */
export function ReverseMovementDialog({
  movement,
  onClose,
  tenantId,
  reasonLabel,
}: {
  /** The row to take back; absent while the dialog is shut. */
  movement: StockMovement | null
  onClose: () => void
  tenantId: number
  /** Turns a reason code into the wording of the catalogue. */
  reasonLabel: (code: string | undefined | null) => string
}) {
  const queryClient = useQueryClient()
  const noteField = useRef<HTMLTextAreaElement>(null)
  const sent = useRef(false)
  const [note, setNote] = useState('')
  const [complaint, setComplaint] = useState<string | null>(null)
  const [wasOpen, setWasOpen] = useState(movement !== null)

  const open = movement !== null
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setNote('')
      setComplaint(null)
    }
  }

  // The guard against a double click is released when the box opens, not while it renders.
  useEffect(() => {
    if (open) sent.current = false
  }, [open])

  const reverse = useMutation({
    mutationFn: () =>
      api.post<StockBooking>(`${stockMovementsUrl(tenantId)}/${movement?.id}/reverse`, {
        note: note.trim(),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['stock-movements', tenantId] })
      void queryClient.invalidateQueries({ queryKey: ['stock-movements-latest', tenantId] })
      void queryClient.invalidateQueries({ queryKey: ['stock-balances', tenantId] })
      sent.current = false
      onClose()
    },
    onError: () => {
      sent.current = false
    },
  })

  const submit = () => {
    if (sent.current || reverse.isPending) return
    if (note.trim() === '') {
      setComplaint('Ein Storno braucht eine Begründung.')
      return
    }
    setComplaint(null)
    sent.current = true
    reverse.mutate()
  }

  const message = complaint ?? (reverse.error instanceof Error ? reverse.error.message : null)

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Bewegung stornieren"
      description="Die Zeile bleibt stehen. Storniert wird mit einer Gegenbuchung."
      initialFocus={noteField}
      onSubmit={reverse.isPending ? undefined : submit}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={submit} busy={reverse.isPending} shortcut>
            Stornieren
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {message !== null && <ErrorNotice error={new Error(message)} />}

        {movement !== null && (
          <dl className="grid gap-1 rounded-[var(--radius-md)] border border-line-subtle bg-sunken px-4 py-3 text-[13px]">
            <Row label="Datum" value={formatDate(movement.bookedOn)} />
            <Row
              label="Produkt"
              value={`${movement.productNumber ?? '-'} · ${movement.productName}`}
            />
            <Row label="Grund" value={reasonLabel(movement.reason)} />
            <Row
              label="Menge"
              value={`${formatQuantity(movement.quantity)} ${movement.unitShortName ?? ''}`.trim()}
            />
          </dl>
        )}

        <TextAreaField
          ref={noteField}
          label="Begründung"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={200}
          rows={3}
          hint="Steht auf der Gegenbuchung und ist Pflicht."
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
