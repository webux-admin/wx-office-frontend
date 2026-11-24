import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Clock } from 'lucide-react'
import { Button } from '../components/Button'
import { Dialog } from '../components/Dialog'
import { DialogCancelButton } from '../components/DialogCancelButton'
import { useAuth } from '../auth/useAuth'
import { api } from '../lib/api'
import { toIsoDate } from '../lib/format'
import { useRunsModule } from '../lib/modules'
import {
  billingSubmitLabel,
  billingWorklistKey,
  billingWorklistUrl,
  mayWriteBilling,
  takeOverLabel,
  worklistOpenMinutes,
} from '../lib/timeBilling'
import { TIMETRACKING_MODULE, type TimesOf } from '../lib/timetracking'
import type { SalesDocument, TimeWorklistLine } from '../lib/types'
import { TimeBillingForm } from './TimeBillingForm'
import { useTimeBilling } from './useTimeBilling'

/**
 * «Zeiten übernehmen (12:30 Std.)» on an invoice draft: the open billable time of its customer,
 * taken onto this draft through the mask «Zeiten abrechnen».
 *
 * <p>Drawn only with the time tracking switched on, with `TIME_BILL` and `INVOICE_WRITE`, and only
 * while the worklist names open time for the customer up to today. The hours are the measured
 * minutes of the worklist rows of that customer (frontend ADR-0085). The caller shows it on a
 * draft that can be changed and on no other document.
 *
 * @param document the invoice draft
 * @param onTaken called after the lines were written, so the draft is read anew
 */
export function TimeTakeover({
  tenantId,
  document,
  onTaken,
}: {
  tenantId: number
  document: SalesDocument
  onTaken: () => void
}) {
  const { can } = useAuth()
  const runs = useRunsModule()
  const shown = runs(TIMETRACKING_MODULE) && mayWriteBilling(can)
  const [open, setOpen] = useState(false)
  const today = toIsoDate()

  const worklist = useQuery({
    queryKey: billingWorklistKey(tenantId, today, document.partnerId),
    queryFn: () =>
      api.get<TimeWorklistLine[]>(billingWorklistUrl(tenantId, today, document.partnerId)),
    enabled: shown,
  })
  const minutes = worklistOpenMinutes(worklist.data ?? [])

  if (!shown) return null
  return (
    <>
      {minutes > 0 && (
        <Button variant="secondary" onClick={() => setOpen(true)}>
          <Clock size={15} aria-hidden />
          {takeOverLabel(minutes)}
        </Button>
      )}
      <TimeTakeoverDialog
        tenantId={tenantId}
        document={document}
        open={open}
        onClose={() => setOpen(false)}
        onTaken={() => {
          setOpen(false)
          onTaken()
        }}
      />
    </>
  )
}

type TimeTakeoverDialogProps = {
  tenantId: number
  document: SalesDocument
  open: boolean
  onClose: () => void
  onTaken: () => void
}

/**
 * The mask «Zeiten abrechnen» in a dialog, with the draft fixed as target.
 *
 * <p>Mounted afresh on every opening, like the dialog of a Gutschrift: the ticks start from what
 * is open now, not from what was ticked and abandoned last time.
 */
function TimeTakeoverDialog(props: TimeTakeoverDialogProps) {
  if (!props.open) return null
  return <OpenTimeTakeoverDialog {...props} />
}

function OpenTimeTakeoverDialog({
  tenantId,
  document,
  onClose,
  onTaken,
}: TimeTakeoverDialogProps) {
  const of: TimesOf = { kind: 'CUSTOMER', partnerId: document.partnerId }
  const billing = useTimeBilling({
    tenantId,
    of,
    until: toIsoDate(),
    documentId: document.id,
    withoutProject: false,
    choosesTarget: false,
    onBilled: onTaken,
  })
  const draftName = document.documentNumber ?? `Entwurf ${document.id}`

  return (
    <Dialog
      open
      onClose={onClose}
      large
      title="Zeiten übernehmen"
      description={`Die gewählten Zeiten von ${document.recipient?.name ?? `Kunde ${document.partnerId}`} kommen als Positionen in ${draftName}. Ausgestellt wird am Beleg.`}
      onSubmit={billing.canSubmit ? billing.submit : undefined}
      footer={
        <>
          <DialogCancelButton />
          <Button
            onClick={billing.submit}
            busy={billing.bill.isPending}
            disabled={!billing.canSubmit}
            shortcut
          >
            {billingSubmitLabel(document.id)}
          </Button>
        </>
      }
    >
      <TimeBillingForm billing={billing} of={of} framed={false} choosesTarget={false} />
    </Dialog>
  )
}
