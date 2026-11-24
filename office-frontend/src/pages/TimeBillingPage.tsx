import { useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Button } from '../components/Button'
import { ErrorNotice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { useSubmitShortcut } from '../components/useSubmitShortcut'
import { RequireTenant } from '../layout/RequireTenant'
import { toIsoDate } from '../lib/format'
import { INVOICE_KIND } from '../lib/salesDocument'
import { originOf, originState } from '../lib/origin'
import {
  TIME_BILLING_PATH,
  billingHandoverOf,
  billingSubjectText,
  billingSubmitLabel,
  invoicePathOf,
} from '../lib/timeBilling'
import { TIMETRACKING_MODULE, TIMETRACKING_RIGHTS, type TimesOf } from '../lib/timetracking'
import { TimeBillingForm } from '../timetracking/TimeBillingForm'
import { useTimeBilling } from '../timetracking/useTimeBilling'

/** The way back when the mask was opened without naming one: the worklist. */
const WORKLIST = { from: TIME_BILLING_PATH, label: 'Zeiten abrechnen' }

/**
 * «Zeiten abrechnen» for one project, or for one customer with and without projects.
 *
 * <p>Day, grouping and target above, the open entries with their ticks, the preview with the
 * origin of each rate, the skipped entries and the total. Every change asks the preview anew;
 * the mask works out no figure (backend ADR-0163, frontend ADR-0085). «Rechnungsentwurf
 * erstellen» writes the draft and leads to it — nothing is issued.
 *
 * <p>With `TIME_BILL` the preview opens; writing needs `INVOICE_WRITE` as well, which the backend
 * asks for too.
 *
 * @param target what the address names: `/zeiten-abrechnen/projekt/:projectId` or
 *   `/zeiten-abrechnen/kunde/:partnerId`
 */
export function TimeBillingPage({ target }: { target: TimesOf['kind'] }) {
  return (
    <RequireTenant permission={TIMETRACKING_RIGHTS.bill} module={TIMETRACKING_MODULE}>
      {(tenantId) => <BillingLoader tenantId={tenantId} target={target} />}
    </RequireTenant>
  )
}

function BillingLoader({ tenantId, target }: { tenantId: number; target: TimesOf['kind'] }) {
  const { projectId, partnerId } = useParams()
  const id = Number(target === 'PROJECT' ? projectId : partnerId)
  if (!Number.isInteger(id) || id <= 0) {
    return (
      <div className="px-8 py-8">
        <ErrorNotice error={new Error('Diese Adresse nennt kein Projekt und keinen Kunden.')} />
      </div>
    )
  }
  const of: TimesOf =
    target === 'PROJECT' ? { kind: 'PROJECT', projectId: id } : { kind: 'CUSTOMER', partnerId: id }
  // Keyed by what is billed: another project starts with a mask of its own.
  return <BillingScreen key={`${target}-${id}`} tenantId={tenantId} of={of} />
}

function BillingScreen({ tenantId, of }: { tenantId: number; of: TimesOf }) {
  const location = useLocation()
  const navigate = useNavigate()
  // Read once when the mask opens: a later click must not be undone by the hand-over.
  const [handover] = useState(() => billingHandoverOf(location.state))
  const origin = originOf(location.state, WORKLIST)

  const billing = useTimeBilling({
    tenantId,
    of,
    until: handover.until ?? toIsoDate(),
    documentId: null,
    withoutProject: handover.withoutProject,
    choosesTarget: true,
    // The draft is where the work goes on; its way back leads to where the billing started.
    onBilled: (result) =>
      void navigate(invoicePathOf(result.documentId), {
        state: originState(origin.from, origin.label),
      }),
  })
  useSubmitShortcut(billing.canSubmit ? billing.submit : undefined)

  const subject = billing.preview.data === undefined ? undefined : billingSubjectText(billing.preview.data)

  return (
    <>
      <PageHeader
        title="Zeiten abrechnen"
        subtitle={subject}
        back={{ to: origin.from, label: origin.label }}
      >
        {billing.mayWrite && (
          <Button
            onClick={billing.submit}
            busy={billing.bill.isPending}
            disabled={!billing.canSubmit}
            shortcut
          >
            {billingSubmitLabel(billing.form.documentId)}
          </Button>
        )}
      </PageHeader>

      <div className="grid gap-4 px-8 pb-12">
        {!billing.mayWrite && (
          <p className="rounded-[var(--radius-md)] border border-line-subtle bg-surface px-4 py-3 text-body text-text-secondary">
            Die Vorschau lässt sich lesen. Zum Erstellen des Rechnungsentwurfs fehlt das Recht{' '}
            <span className="font-mono text-small">{INVOICE_KIND.rights.write}</span>.
          </p>
        )}
        <TimeBillingForm billing={billing} of={of} framed choosesTarget />
      </div>
    </>
  )
}
