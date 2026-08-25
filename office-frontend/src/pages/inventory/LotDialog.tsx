import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { ErrorNotice } from '../../components/Notice'
import { TextAreaField } from '../../components/TextAreaField'
import { TextField } from '../../components/TextField'
import { api } from '../../lib/api'
import {
  blockLotUrl,
  lotKindLabel,
  lotUrl,
  unblockLotUrl,
} from '../../lib/inventory'
import type { Lot } from '../../lib/types'
import { LOT_NUMBER_MAX } from './lotAllocation'

/** What the reason column holds, and therefore what the field lets somebody type. */
const MAX_REASON = 200

/** What the note column holds. */
const MAX_NOTE = 500

/**
 * Changes one lot: its expiry date, its note, and whether it may be given out.
 *
 * <p>Freezing is the answer to «this batch is not to leave the house» — a recall, a complaint,
 * quarantine. It refuses the way out and leaves the way in open, because taking the goods back
 * into quarantine is exactly what the block is for (backend ADR-0068).
 *
 * <p>The number itself can only be corrected while no movement points at the lot. The server
 * decides that and says so; this dialog does not guess.
 */
export function LotDialog({
  lot,
  onClose,
  tenantId,
}: {
  /** The lot to change; absent while the dialog is shut. */
  lot: Lot | null
  onClose: () => void
  tenantId: number
}) {
  const queryClient = useQueryClient()
  const numberField = useRef<HTMLInputElement>(null)
  const sent = useRef(false)

  const [lotNumber, setLotNumber] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [note, setNote] = useState('')
  const [reason, setReason] = useState('')
  const [blocking, setBlocking] = useState(false)
  const [wasOpen, setWasOpen] = useState(lot !== null)

  const open = lot !== null
  // Filled in while rendering rather than in an effect, so the fields never show the values of
  // the lot that was open before for a frame.
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open && lot !== null) {
      setLotNumber(lot.lotNumber)
      setExpiryDate(lot.expiryDate ?? '')
      setNote(lot.note ?? '')
      setReason('')
      setBlocking(false)
    }
  }

  useEffect(() => {
    if (open) sent.current = false
  }, [open])

  /** Everything that shows a lot, a quantity or a movement is stale after a change. */
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['product-lots', tenantId] })
    void queryClient.invalidateQueries({ queryKey: ['lot-proposal', tenantId] })
    void queryClient.invalidateQueries({ queryKey: ['stock-movements', tenantId] })
  }

  const save = useMutation({
    mutationFn: () =>
      api.put<Lot>(lotUrl(tenantId, lot?.id ?? 0), {
        lotNumber: lotNumber.trim(),
        expiryDate: expiryDate === '' ? undefined : expiryDate,
        note: note.trim() === '' ? undefined : note.trim(),
      }),
    onSuccess: () => {
      refresh()
      sent.current = false
      onClose()
    },
    onError: () => {
      sent.current = false
    },
  })

  const block = useMutation({
    mutationFn: () =>
      lot?.blocked === true
        ? api.post<Lot>(unblockLotUrl(tenantId, lot.id), {})
        : api.post<Lot>(blockLotUrl(tenantId, lot?.id ?? 0), { reason: reason.trim() }),
    onSuccess: () => {
      refresh()
      onClose()
    },
  })

  const submit = () => {
    if (sent.current || save.isPending) return
    if (lotNumber.trim() === '') return
    sent.current = true
    save.mutate()
  }

  const kindLabel = lotKindLabel(lot?.kind)
  const failure = save.error ?? block.error

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={kindLabel === '' ? 'Nummer bearbeiten' : `${kindLabel} bearbeiten`}
      description="Verfalldatum und Bemerkung lassen sich jederzeit ändern. Die Nummer nur, solange keine Bewegung darauf zeigt."
      initialFocus={numberField}
      onSubmit={save.isPending ? undefined : submit}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            onClick={submit}
            busy={save.isPending}
            disabled={lotNumber.trim() === ''}
            shortcut
          >
            Speichern
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {failure !== null && failure !== undefined && <ErrorNotice error={failure} />}

        <TextField
          ref={numberField}
          label="Nummer"
          value={lotNumber}
          onChange={(event) => setLotNumber(event.target.value)}
          maxLength={LOT_NUMBER_MAX}
          hint="Sobald eine Bewegung darauf zeigt, lässt sie sich nicht mehr ändern."
        />

        <TextField
          label="Haltbar bis"
          type="date"
          value={expiryDate}
          onChange={(event) => setExpiryDate(event.target.value)}
          hint="Warnt und sortiert die Vorschläge. Es sperrt nichts."
        />

        <TextAreaField
          label="Bemerkung"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={MAX_NOTE}
          rows={2}
        />

        <div className="rounded-[var(--radius-md)] border border-line-subtle bg-sunken px-4 py-3">
          {lot?.blocked === true ? (
            <div className="grid gap-2">
              <p className="text-[13px] text-text-primary">
                Gesperrt{lot.blockedReason ? `: ${lot.blockedReason}` : ''}. Diese Nummer wird
                nicht mehr vorgeschlagen und nicht mehr abgebucht.
              </p>
              <div>
                <Button variant="secondary" onClick={() => block.mutate()} busy={block.isPending}>
                  Sperre aufheben
                </Button>
              </div>
            </div>
          ) : blocking ? (
            <div className="grid gap-2">
              <TextField
                label="Grund der Sperre"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={MAX_REASON}
                hint="Steht überall, wo die Nummer danach abgewiesen wird."
              />
              <div className="flex gap-2">
                <Button
                  onClick={() => block.mutate()}
                  busy={block.isPending}
                  disabled={reason.trim() === ''}
                >
                  Sperren
                </Button>
                <Button variant="secondary" onClick={() => setBlocking(false)}>
                  Abbrechen
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-2">
              <p className="text-[13px] text-text-secondary">
                Eine gesperrte Nummer geht nicht mehr aus dem Lager. Zurücknehmen lässt sie sich
                weiterhin — dafür ist die Sperre da.
              </p>
              <div>
                <Button variant="secondary" onClick={() => setBlocking(true)}>
                  Sperren
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  )
}
