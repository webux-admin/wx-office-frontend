import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { ErrorNotice } from '../../components/Notice'
import { TextField } from '../../components/TextField'
import { formatAmount, formatDate } from '../../lib/format'
import { withdrawAccountBooking } from '../../lib/clearing'
import type { BankTransaction } from '../../lib/types'

/** Longest reason the counter entry can hold. */
const MAX_REASON_LENGTH = 500

/**
 * Takes an account booking back.
 *
 * <p><b>A counter entry, never a deletion</b> — in the journal a correction always stands as a
 * pair (OR Art. 957a). The reason is required: it travels into the counter entry and explains
 * the pair ten years later.
 *
 * <p><b>The sentence about the dunning is there on purpose.</b> Withdrawing an *assignment*
 * warns, because an invoice becomes open again and a reminder can be triggered or voided. An
 * account booking touches no invoice — and a missing warning is easily taken for an oversight,
 * so this one says it out loud (backend ADR-0109, ADR-0128).
 *
 * @param movement the movement whose booking is taken back
 * @param onSaved  called after the counter entry stands
 */
export function WithdrawAccountBookingDialog({
  open,
  tenantId,
  movement,
  onClose,
  onSaved,
}: {
  open: boolean
  tenantId: number
  movement: BankTransaction | null
  onClose: () => void
  onSaved: (entryNumber: string) => void
}) {
  const [reason, setReason] = useState('')

  const shownFor = open && movement !== null ? movement.id : null
  const [shown, setShown] = useState<number | null>(shownFor)
  if (shownFor !== shown) {
    setShown(shownFor)
    setReason('')
  }

  const withdraw = useMutation({
    mutationFn: () => withdrawAccountBooking(tenantId, movement?.id ?? 0, reason.trim()),
    onSuccess: (written) => {
      onSaved(written.entryNumber)
      onClose()
    },
  })

  if (movement === null) {
    return null
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Kontobuchung zurücknehmen"
      description="Es entsteht eine Gegenbuchung; die erste bleibt stehen. Danach ist der Posten wieder neu und erscheint im Klärungskorb."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            onClick={() => withdraw.mutate()}
            busy={withdraw.isPending}
            disabled={reason.trim() === ''}
          >
            Zurücknehmen
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="rounded-md bg-surface-sunken px-4 py-3 text-[13px]">
          <div className="flex flex-wrap items-baseline gap-x-4">
            <span>{formatDate(movement.valueDate)}</span>
            <span className="font-medium">
              {formatAmount(movement.amount)} {movement.currency}
            </span>
            <span>{movement.creditDebit === 'DBIT' ? 'Belastung' : 'Gutschrift'}</span>
          </div>
          <div className="text-text-secondary">
            {movement.debtorName ?? movement.accountIban}
          </div>
        </div>

        <TextField
          label="Grund"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={MAX_REASON_LENGTH}
          hint="Pflicht: der Grund steht in der Gegenbuchung und erklärt sie später."
        />

        <p className="text-[12px] text-text-secondary">
          Es ist keine Rechnung betroffen; eine Mahnung ändert sich dadurch nicht.
        </p>

        {withdraw.error !== null && <ErrorNotice error={withdraw.error} />}
      </div>
    </Dialog>
  )
}
