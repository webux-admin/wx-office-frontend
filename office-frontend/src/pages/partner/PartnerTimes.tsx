import { EmptyState } from '../../components/Notice'
import { Panel } from '../../components/Panel'
import type { TimesOf } from '../../lib/timetracking'
import { TimeEntryTable } from '../../timetracking/TimeEntryTable'
import { TimeSummaryFacts } from '../../timetracking/TimeSummaryFacts'

/**
 * The register «Zeiten» of a customer: the hours of every user by state and the entries, with
 * and without a project — the column «Projekt» tells them apart (backend ADR-0162).
 *
 * <p>Only for a customer, and only with the time tracking switched on and `TIME_READ`, which
 * the mask decides. Only to read: the terms of a project stand on the project.
 */
export function PartnerTimes({ tenantId, partnerId }: { tenantId: number; partnerId: number }) {
  const of: TimesOf = { kind: 'CUSTOMER', partnerId }

  return (
    <div className="grid gap-6">
      <TimeSummaryFacts tenantId={tenantId} of={of} />
      <Panel
        title="Einträge"
        description="Die Zeiten aller Personen für diesen Kunden, der späteste Tag zuerst."
        padded={false}
      >
        <TimeEntryTable
          tenantId={tenantId}
          of={of}
          showsProject
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
