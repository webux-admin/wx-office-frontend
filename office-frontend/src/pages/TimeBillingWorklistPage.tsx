import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Button } from '../components/Button'
import { DataTable, type Column } from '../components/DataTable'
import { LinkButton } from '../components/LinkButton'
import { EmptyState } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { TextField } from '../components/TextField'
import { useAuth } from '../auth/useAuth'
import { RequireTenant } from '../layout/RequireTenant'
import { api } from '../lib/api'
import { formatDurationShort } from '../lib/duration'
import { formatAmount, formatCount, formatDate, isCompleteIsoDate, toIsoDate } from '../lib/format'
import { useRunsModule } from '../lib/modules'
import { PROJECT_MODULE, PROJECT_PATH, PROJECT_RIGHTS } from '../lib/project'
import {
  TIME_BILLING_PATH,
  billingHandoverState,
  billingRunRequestOf,
  billingWorklistKey,
  billingWorklistUrl,
  timeBillingPathOf,
  worklistCustomerText,
  worklistProjectText,
  worklistKeyOf,
  worklistTargetOf,
} from '../lib/timeBilling'
import { INVOICE_KIND } from '../lib/salesDocument'
import { TIMETRACKING_MODULE, TIMETRACKING_RIGHTS } from '../lib/timetracking'
import { BillingRunDialog } from '../timetracking/BillingRunDialog'
import type { TimeWorklistLine } from '../lib/types'

/** The way back from a billing mask opened here. */
const ORIGIN = { from: TIME_BILLING_PATH, label: 'Zeiten abrechnen' }

/**
 * «Abrechnen»: where open billable time lies up to a day, one row per customer without project
 * and one per project.
 *
 * <p>Each row leads into the mask of its project or customer. With `INVOICE_WRITE` beside
 * `TIME_BILL`, rows can be ticked and billed in one run, a new draft for each, after a preview
 * (#140, backend ADR-0169). The hours and the estimate are the backend's — the estimate takes
 * the rate of each service on the latest day of its entries, the mask then works it out exactly
 * (backend ADR-0163, frontend ADR-0085).
 */
export function TimeBillingWorklistPage() {
  return (
    <RequireTenant permission={TIMETRACKING_RIGHTS.bill} module={TIMETRACKING_MODULE}>
      {(tenantId) => <Worklist tenantId={tenantId} />}
    </RequireTenant>
  )
}

function Worklist({ tenantId }: { tenantId: number }) {
  const { can } = useAuth()
  const runs = useRunsModule()
  const projectsOn = runs(PROJECT_MODULE)
  const [until, setUntil] = useState(() => toIsoDate())
  const complete = isCompleteIsoDate(until)
  const mayRun = can(TIMETRACKING_RIGHTS.bill) && can(INVOICE_KIND.rights.write)
  const [ticked, setTicked] = useState<ReadonlySet<string | number>>(new Set())
  // The rows the open run is about, held while it runs: the worklist reads anew afterwards.
  const [running, setRunning] = useState<TimeWorklistLine[] | null>(null)

  const worklist = useQuery({
    queryKey: billingWorklistKey(tenantId, until),
    queryFn: () => api.get<TimeWorklistLine[]>(billingWorklistUrl(tenantId, until)),
    enabled: complete,
    placeholderData: keepPreviousData,
  })

  const chosen = chosenLines(worklist.data ?? [], ticked)

  const columns: Column<TimeWorklistLine>[] = [
    {
      key: 'customer',
      header: 'Kunde',
      render: (line) => (
        <span className={line.customerName == null ? 'text-text-tertiary' : 'font-medium'}>
          {worklistCustomerText(line)}
        </span>
      ),
    },
    ...(projectsOn
      ? [
          {
            key: 'project',
            header: 'Projekt',
            render: (line: TimeWorklistLine) =>
              line.projectId != null && can(PROJECT_RIGHTS.read) ? (
                <Link
                  to={`${PROJECT_PATH}/${line.projectId}`}
                  state={{ origin: ORIGIN }}
                  className="hover:text-accent-text"
                >
                  {worklistProjectText(line)}
                </Link>
              ) : (
                <span className={line.projectId == null ? 'text-text-tertiary' : ''}>
                  {worklistProjectText(line)}
                </span>
              ),
          } satisfies Column<TimeWorklistLine>,
        ]
      : []),
    {
      key: 'entries',
      header: 'Einträge',
      align: 'right',
      width: 'w-column-xs',
      hideBelow: 'sm',
      render: (line) => formatCount(line.openEntries),
    },
    {
      key: 'hours',
      header: 'Offen',
      align: 'right',
      width: 'w-column-sm',
      render: (line) => (
        <span className="grid justify-items-end">
          <span>{formatDurationShort(line.openMinutes)}</span>
          {line.billedMinutes !== line.openMinutes && (
            <span className="text-small text-text-tertiary" title="Nach Abrechnungstakt aufgerundet">
              → {formatDurationShort(line.billedMinutes)}
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'estimate',
      header: 'Geschätzt',
      align: 'right',
      width: 'w-column-md',
      render: (line) => `${formatAmount(line.estimatedAmount)} ${line.currency}`,
    },
    {
      key: 'oldest',
      header: 'Ältester Eintrag',
      width: 'w-column-md',
      hideBelow: 'sm',
      render: (line) => <span className="tabular-nums">{formatDate(line.oldestWorkDate)}</span>,
    },
    {
      key: 'action',
      header: '',
      align: 'right',
      width: 'w-column-md',
      render: (line) => (
        <LinkButton
          to={timeBillingPathOf(worklistTargetOf(line))}
          state={billingHandoverState(
            { until, withoutProject: line.projectId == null },
            ORIGIN,
          )}
          variant="secondary"
        >
          Abrechnen
          <span className="sr-only">
            {' '}
            {worklistCustomerText(line)} {worklistProjectText(line)}
          </span>
        </LinkButton>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Zeiten abrechnen"
        subtitle="Offene verrechenbare Zeit je Kunde und Projekt. Abrechnen schreibt einen Rechnungsentwurf; ausgestellt wird am Beleg."
      />

      <div className="grid gap-4 px-8 pb-12">
        <Panel>
          <TextField
            label="Stichtag"
            type="date"
            value={until}
            onChange={(event) => setUntil(event.target.value)}
            error={complete ? undefined : 'Einen Tag wählen.'}
            tooltip="Gezählt wird offene verrechenbare Zeit bis und mit diesem Tag. Ein Projekt «Nicht verrechenbar» erscheint nie, ein pauschales nur mit seinem Zusatzaufwand."
            className="sm:w-column-lg"
          />
        </Panel>

        <Panel
          title="Arbeitsvorrat"
          description="Der geschätzte Betrag nimmt den Satz jeder Leistung am letzten Tag ihrer Einträge. Genau rechnet die Vorschau."
          padded={false}
          action={
            mayRun ? (
              <Button onClick={() => setRunning(chosen)} disabled={!complete || chosen.length === 0}>
                {chosen.length === 0 ? 'Gewählte abrechnen' : `Gewählte abrechnen (${chosen.length})`}
              </Button>
            ) : undefined
          }
        >
          <DataTable
            columns={columns}
            rows={worklist.data ?? []}
            keyOf={worklistKeyOf}
            selected={mayRun ? ticked : undefined}
            onSelectedChange={mayRun ? setTicked : undefined}
            selectionLabel={(line) =>
              `${worklistCustomerText(line)} ${worklistProjectText(line)} zum Abrechnen wählen`
            }
            loading={worklist.isPending && complete}
            error={worklist.error}
            empty={
              <EmptyState
                title="Nichts abzurechnen"
                description={
                  complete
                    ? `Bis ${formatDate(until)} liegt keine offene verrechenbare Zeit.`
                    : 'Einen Stichtag wählen.'
                }
              />
            }
          />
        </Panel>
      </div>

      {running !== null && (
        <BillingRunDialog
          tenantId={tenantId}
          open
          request={billingRunRequestOf(running, new Set(running.map(worklistKeyOf)), until)}
          rows={running}
          origin={{ origin: ORIGIN }}
          onClose={() => {
            setRunning(null)
            setTicked(new Set())
          }}
        />
      )}
    </>
  )
}

/** The ticked rows of the worklist, in its order; a tick of a row gone since counts for nothing. */
function chosenLines(
  lines: readonly TimeWorklistLine[],
  ticked: ReadonlySet<string | number>,
): TimeWorklistLine[] {
  return lines.filter((line) => ticked.has(worklistKeyOf(line)))
}
