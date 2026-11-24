import { ReceiptText } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { LinkButton } from '../../components/LinkButton'
import { EmptyState } from '../../components/Notice'
import { Panel } from '../../components/Panel'
import { originState } from '../../lib/origin'
import { billingHandoverState, timeBillingPathOf } from '../../lib/timeBilling'
import { TIMETRACKING_RIGHTS, type TimesOf } from '../../lib/timetracking'
import { TimeEntryTable } from '../../timetracking/TimeEntryTable'
import { TimeSummaryFacts } from '../../timetracking/TimeSummaryFacts'

/**
 * The register «Zeiten» of a customer: the hours of every user by state and the entries, with
 * and without a project — the column «Projekt» tells them apart (backend ADR-0162).
 *
 * <p>Only for a customer, and only with the time tracking switched on and `TIME_READ`, which
 * the mask decides. Only to read: the terms of a project stand on the project. With `TIME_BILL`
 * «Abrechnen» opens the billing of this customer, with and without projects (backend ADR-0163,
 * frontend ADR-0085).
 */
export function PartnerTimes({ tenantId, partnerId }: { tenantId: number; partnerId: number }) {
  const { can } = useAuth()
  const of: TimesOf = { kind: 'CUSTOMER', partnerId }
  // The billing mask and an invoice opened from a badge lead back to this customer.
  const back = originState(useLocation().pathname, 'Kunde')

  return (
    <div className="grid gap-6">
      <TimeSummaryFacts tenantId={tenantId} of={of} />
      <Panel
        title="Einträge"
        description="Die Zeiten aller Personen für diesen Kunden, der späteste Tag zuerst."
        padded={false}
        action={
          can(TIMETRACKING_RIGHTS.bill) ? (
            <LinkButton
              to={timeBillingPathOf(of)}
              state={billingHandoverState({}, back.origin)}
              variant="secondary"
            >
              <ReceiptText size={15} aria-hidden />
              Abrechnen
            </LinkButton>
          ) : undefined
        }
      >
        <TimeEntryTable
          tenantId={tenantId}
          of={of}
          showsProject
          origin={back}
          empty={
            <EmptyState
              title="Noch keine Zeiten"
              description="Für diesen Kunden ist noch keine Zeit erfasst, weder auf einem Projekt noch ohne."
            />
          }
        />
      </Panel>
    </div>
  )
}
