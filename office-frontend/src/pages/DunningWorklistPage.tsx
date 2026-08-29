import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Badge } from '../components/Badge'
import { EmptyState, ErrorNotice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { TextField } from '../components/TextField'
import { RequireTenant } from '../layout/RequireTenant'
import {
  DUNNING_RIGHTS,
  DUNNING_SETTINGS_PATH,
  DUNNING_SKIP_REASONS,
  candidateKey,
  configurationProblems,
  dunningWorklistKey,
  fetchDunningWorklist,
} from '../lib/dunning'
import { formatAmount, formatDate, toIsoDate } from '../lib/format'
import type { DunningCandidate } from '../lib/types'

/**
 * Which reminders would go out today, and why the rest would not.
 *
 * <p><b>Nothing is issued here.</b> The proposal is a query; sending is a deliberate release
 * with a right of its own, and it arrives with the next issue. With payments entered by hand
 * the data is only as fresh as the last entry, and an automatic run would chase customers who
 * paid yesterday (backend ADR-0096).
 *
 * <p>One row is <b>one letter</b>, never one invoice: in collective mode a row opens to the
 * invoices it covers. Selecting invoices and getting letters would mean two different numbers
 * in the same confirmation.
 */
export function DunningWorklistPage() {
  return (
    <RequireTenant permission={DUNNING_RIGHTS.read}>
      {(tenantId) => <Worklist tenantId={tenantId} />}
    </RequireTenant>
  )
}

function Worklist({ tenantId }: { tenantId: number }) {
  // The reference day is also the way to look ahead: there is no second, unselectable section
  // for what falls due later, because that would only make the list longer.
  const [asOf, setAsOf] = useState(() => toIsoDate())
  const [open, setOpen] = useState<Record<string, boolean>>({})

  const worklist = useQuery({
    queryKey: dunningWorklistKey(tenantId, asOf),
    queryFn: () => fetchDunningWorklist(tenantId, asOf),
  })

  const candidates = worklist.data ?? []
  const sending = candidates.filter((candidate) => candidate.skipReason === undefined)
  const skipped = candidates.filter((candidate) => candidate.skipReason !== undefined)
  const problems = configurationProblems(candidates)

  const toggle = (key: string) => setOpen({ ...open, [key]: open[key] !== true })

  return (
    <>
      <PageHeader
        title="Mahnvorschlag"
        subtitle={
          worklist.isSuccess
            ? `${sending.length} Briefe zu mahnen, ${skipped.length} übersprungen`
            : undefined
        }
      >
        <TextField
          label="Stichtag"
          type="date"
          value={asOf}
          onChange={(event) => setAsOf(event.target.value)}
        />
      </PageHeader>

      <div className="grid gap-6 px-8 pb-12">
        {worklist.error !== null && <ErrorNotice error={worklist.error} />}

        {problems.length > 0 && (
          <Panel title="Die Einstellungen sind unvollständig">
            <div className="grid gap-2">
              <p className="text-[13px]">
                {problems.map((reason) => DUNNING_SKIP_REASONS[reason]).join(' · ')}. Solange
                das so bleibt, verwirft der Lauf diese Zeilen — eine Liste, die Mahnungen
                verspricht, die nie hinausgehen, ist schlimmer als eine leere.
              </p>
              <p className="text-[12px] text-text-secondary">
                Zu ändern unter{' '}
                <a className="text-accent-text" href={DUNNING_SETTINGS_PATH}>
                  Mahnwesen → Einstellungen
                </a>
                .
              </p>
            </div>
          </Panel>
        )}

        <Panel
          title="Zu mahnen"
          description="Eine Zeile ist ein Brief. Bei Sammelmahnung lässt sie sich zu den Rechnungen aufklappen."
          padded={false}
        >
          {worklist.isPending && (
            <p className="px-4 py-3 text-[13px] text-text-secondary">Wird geladen ...</p>
          )}
          {worklist.isSuccess && sending.length === 0 && (
            <EmptyState
              title="Nichts zu mahnen"
              description={
                skipped.length === 0
                  ? 'Keine überfällige Rechnung — oder alle sind bezahlt.'
                  : 'Jede offene Rechnung hat einen Grund, warum sie nicht gemahnt wird. Siehe unten.'
              }
            />
          )}
          {sending.length > 0 && (
            <CandidateTable
              candidates={sending}
              open={open}
              onToggle={toggle}
            />
          )}
        </Panel>

        {skipped.length > 0 && (
          <Panel
            title="Übersprungen"
            description="Jede offene Rechnung, die nicht gemahnt wird, mit ihrem Grund. Eine Liste, die stillschweigend Zeilen weglässt, lässt sich nicht prüfen."
            padded={false}
          >
            <CandidateTable candidates={skipped} open={open} onToggle={toggle} skipped />
          </Panel>
        )}
      </div>
    </>
  )
}

function CandidateTable({
  candidates,
  open,
  onToggle,
  skipped = false,
}: {
  candidates: DunningCandidate[]
  open: Record<string, boolean>
  onToggle: (key: string) => void
  skipped?: boolean
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-[12px] text-text-tertiary">
            <th className="w-[36px] py-2 pl-4" />
            <th className="py-2 pr-4 font-medium">Kunde</th>
            <th className="py-2 pr-4 font-medium">{skipped ? 'Grund' : 'Stufe'}</th>
            <th className="py-2 pr-4 text-right font-medium">Rg.</th>
            <th className="py-2 pr-4 text-right font-medium">Offen</th>
            <th className="py-2 pr-4 text-right font-medium">Überfällig</th>
            <th className="py-2 pr-4 font-medium">Älteste Fälligkeit</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line-subtle">
          {candidates.map((candidate) => {
            const key = candidateKey(candidate)
            const expandable = candidate.invoices.length > 1
            const expanded = open[key] === true
            return (
              <>
                <tr key={key}>
                  <td className="py-2 pl-4">
                    {expandable && (
                      <button
                        type="button"
                        onClick={() => onToggle(key)}
                        aria-label={expanded ? 'Rechnungen ausblenden' : 'Rechnungen anzeigen'}
                        className="text-text-tertiary transition-colors hover:text-accent-text"
                      >
                        {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                      </button>
                    )}
                  </td>
                  <td className="py-2 pr-4">{candidate.partnerName ?? `Kunde ${candidate.partnerId}`}</td>
                  <td className="py-2 pr-4">
                    {candidate.skipReason === undefined ? (
                      <Badge tone="accent">
                        {candidate.levelName ?? `Stufe ${candidate.levelNo}`}
                      </Badge>
                    ) : (
                      <div className="grid gap-0.5">
                        <Badge tone="muted">
                          {DUNNING_SKIP_REASONS[candidate.skipReason]}
                        </Badge>
                        {candidate.note !== undefined && (
                          <span className="text-[12px] text-text-tertiary">
                            {candidate.note}
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {candidate.invoices.length}
                  </td>
                  <td className="py-2 pr-4 text-right font-medium tabular-nums">
                    {formatAmount(candidate.openAmount)}{' '}
                    <span className="text-text-tertiary">{candidate.currency}</span>
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {candidate.maxDaysOverdue === 0 ? (
                      <span className="text-text-tertiary">–</span>
                    ) : (
                      `${candidate.maxDaysOverdue} T.`
                    )}
                  </td>
                  <td className="py-2 pr-4">{formatDate(candidate.oldestDueDate)}</td>
                </tr>
                {expanded
                  && candidate.invoices.map((invoice) => (
                    <tr key={`${key}-${invoice.documentId}`} className="text-text-secondary">
                      <td />
                      <td className="py-1.5 pr-4 pl-4 font-mono text-[12px]">
                        {invoice.documentNumber}
                      </td>
                      <td className="py-1.5 pr-4">{formatDate(invoice.documentDate)}</td>
                      <td />
                      <td className="py-1.5 pr-4 text-right tabular-nums">
                        {formatAmount(invoice.openAmount)}{' '}
                        <span className="text-text-tertiary">{invoice.currency}</span>
                      </td>
                      <td className="py-1.5 pr-4 text-right tabular-nums">
                        {invoice.daysOverdue === 0 ? '–' : `${invoice.daysOverdue} T.`}
                      </td>
                      <td className="py-1.5 pr-4">{formatDate(invoice.dueDate)}</td>
                    </tr>
                  ))}
              </>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
