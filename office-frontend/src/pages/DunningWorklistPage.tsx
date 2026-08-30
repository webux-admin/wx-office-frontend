import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { CheckboxField } from '../components/CheckboxField'
import { Dialog } from '../components/Dialog'
import { SelectField } from '../components/SelectField'
import { EmptyState, ErrorNotice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { TextField } from '../components/TextField'
import { RequireTenant } from '../layout/RequireTenant'
import { Link } from 'react-router-dom'
import {
  DUNNING_BLOCKS_PATH,
  DUNNING_CHANNELS,
  DUNNING_CHANNEL_HINTS,
  DUNNING_NOTICES_PATH,
  DUNNING_MODULE, DUNNING_RIGHTS,
  DUNNING_SETTINGS_PATH,
  DUNNING_SKIP_REASONS,
  candidateKey,
  configurationProblems,
  dunningWorklistKey,
  fetchDunningRunPdf,
  fetchDunningWorklist,
  availableChannels,
  channelSummary,
  dunningSettingsKey,
  fetchDunningSettings,
  narrowedDocumentIds,
  runDunning,
  runSummary,
} from '../lib/dunning'
import { showFile } from '../lib/files'
import { useAuth } from '../auth/useAuth'
import { formatAmount, formatDate, toIsoDate } from '../lib/format'
import type {
  DunningCandidate,
  DunningChannelChoice,
  DunningRunResult,
} from '../lib/types'

/**
 * Which reminders would go out today, and why the rest would not.
 *
 * <p><b>Nothing goes out on its own.</b> The proposal is a query; issuing is a deliberate
 * release with a right of its own. With payments entered by hand the data is only as fresh as
 * the last entry, and an automatic run would chase customers who paid yesterday (backend
 * ADR-0096).
 *
 * <p>One row is <b>one letter</b>, never one invoice: in collective mode a row opens to the
 * invoices it covers. Selecting invoices and getting letters would mean two different numbers
 * in the same confirmation.
 */
export function DunningWorklistPage() {
  return (
    <RequireTenant permission={DUNNING_RIGHTS.read} module={DUNNING_MODULE}>
      {(tenantId) => <Worklist tenantId={tenantId} />}
    </RequireTenant>
  )
}

function Worklist({ tenantId }: { tenantId: number }) {
  // The reference day is also the way to look ahead: there is no second, unselectable section
  // for what falls due later, because that would only make the list longer.
  const [asOf, setAsOf] = useState(() => toIsoDate())
  const [open, setOpen] = useState<Record<string, boolean>>({})
  // Ticked letters, by the key that identifies one. Whole letters only — «zwei der drei
  // Rechnungen desselben Briefs» has no meaning (backend ADR-0096).
  const [picked, setPicked] = useState<Record<string, boolean>>({})
  const [confirming, setConfirming] = useState(false)
  const [channel, setChannel] = useState<DunningChannelChoice>('AUTO')
  const [result, setResult] = useState<DunningRunResult | null>(null)
  const queryClient = useQueryClient()
  const { can } = useAuth()

  // Only for the channel choice: whether this tenant could mail at all, and why not.
  const settings = useQuery({
    queryKey: dunningSettingsKey(tenantId),
    queryFn: () => fetchDunningSettings(tenantId),
  })
  const mailReady = settings.data?.mailReady === true

  const worklist = useQuery({
    queryKey: dunningWorklistKey(tenantId, asOf),
    queryFn: () => fetchDunningWorklist(tenantId, asOf),
  })

  const candidates = worklist.data ?? []
  const sending = candidates.filter((candidate) => candidate.skipReason === undefined)
  // The stopped rows get a section of their own rather than sitting among «noch nicht
  // fällig»: somebody decided this, and that is a different kind of answer from «warte ab».
  const blocked = candidates.filter((candidate) => candidate.skipReason === 'BLOCKED')
  const skipped = candidates.filter(
    (candidate) => candidate.skipReason !== undefined && candidate.skipReason !== 'BLOCKED',
  )
  const problems = configurationProblems(candidates)

  const toggle = (key: string) => setOpen({ ...open, [key]: open[key] !== true })
  const pick = (key: string) => setPicked({ ...picked, [key]: picked[key] !== true })

  // Nothing ticked means «alles, was die Regel zulässt» — the ordinary case, and one click
  // less than ticking every row first.
  const chosen = sending.filter((candidate) => picked[candidateKey(candidate)] === true)
  const wanted = chosen.length === 0 ? sending : chosen
  const mayRun = can(DUNNING_RIGHTS.run)

  const issue = useMutation({
    mutationFn: () =>
      runDunning(tenantId, {
        referenceDate: asOf,
        // Only when a choice was made: an empty list means «everything», and sending the
        // ids of every row would freeze a decision the server is about to take again.
        documentIds: chosen.length === 0 ? undefined : narrowedDocumentIds(chosen),
        channel: mailReady ? channel : 'PRINT',
      }),
    onSuccess: (answer) => {
      setConfirming(false)
      setPicked({})
      setResult(answer)
      void queryClient.invalidateQueries({ queryKey: ['dunning-worklist'] })
      void queryClient.invalidateQueries({ queryKey: ['dunning-notices'] })
      void queryClient.invalidateQueries({ queryKey: ['dunning-states'] })
    },
  })

  const openRunPdf = useMutation({
    mutationFn: (runId: number) => fetchDunningRunPdf(tenantId, runId),
    onSuccess: showFile,
  })

  return (
    <>
      <PageHeader
        title="Mahnvorschlag"
        subtitle={
          worklist.isSuccess
            ? `${sending.length} Briefe zu mahnen, ${blocked.length} gesperrt, `
              + `${skipped.length} übersprungen`
            : undefined
        }
      >
        <TextField
          label="Stichtag"
          type="date"
          value={asOf}
          onChange={(event) => setAsOf(event.target.value)}
        />
        {mayRun && (
          <Button onClick={() => setConfirming(true)} disabled={sending.length === 0}>
            {chosen.length === 0
              ? 'Alle mahnen'
              : `${chosen.length === 1 ? '1 Brief' : `${chosen.length} Briefe`} mahnen`}
          </Button>
        )}
      </PageHeader>

      <div className="grid gap-6 px-8 pb-12">
        {worklist.error !== null && <ErrorNotice error={worklist.error} />}
        {openRunPdf.error !== null && <ErrorNotice error={openRunPdf.error} />}

        {result !== null && (
          <RunResult
            result={result}
            onPrint={(runId) => openRunPdf.mutate(runId)}
            printing={openRunPdf.isPending}
            onDismiss={() => setResult(null)}
          />
        )}

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
              picked={mayRun ? picked : undefined}
              onPick={mayRun ? pick : undefined}
            />
          )}
        </Panel>

        {blocked.length > 0 && (
          <Panel
            title="Mahnstopp gesetzt"
            description="Hier hat ein Mensch entschieden, nicht die Regel. Die Zeilen bleiben sichtbar — wer nicht gemahnt wird, soll nicht verschwinden."
            padded={false}
            action={
              <Link className="text-[13px] text-accent-text" to={DUNNING_BLOCKS_PATH}>
                Alle Mahnstopps
              </Link>
            }
          >
            <CandidateTable candidates={blocked} open={open} onToggle={toggle} skipped />
          </Panel>
        )}

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

      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onSubmit={() => issue.mutate()}
        title="Mahnungen ausstellen"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Abbrechen
            </Button>
            <Button onClick={() => issue.mutate()} disabled={issue.isPending}>
              {issue.isPending ? 'Wird ausgestellt ...' : 'Ausstellen'}
            </Button>
          </>
        }
      >
        <div className="grid gap-3 text-[13px]">
          <p>
            Es gehen <strong>{runSummary(wanted)}</strong> hinaus. Jede bekommt eine
            lückenlose Nummer und wird archiviert — zurückholen lässt sie sich nicht.
          </p>
          {/* The channel is resolved per letter, so the numbers are two: what costs postage
              and what does not (backend ADR-0095). */}
          <SelectField
            label="Weg"
            value={mailReady ? channel : 'PRINT'}
            onChange={(event) => setChannel(event.target.value as DunningChannelChoice)}
            disabled={!mailReady}
            hint={
              mailReady
                ? DUNNING_CHANNEL_HINTS[channel]
                : settings.data?.mailBlockedReason
            }
          >
            {availableChannels(mailReady).map((code) => (
              <option key={code} value={code}>
                {DUNNING_CHANNELS[code]}
              </option>
            ))}
          </SelectField>
          <p className="text-text-secondary">
            Davon <strong>{channelSummary(wanted)}</strong>.
          </p>
          <p className="text-text-secondary">
            Stichtag {formatDate(asOf)}. Das Ausstellungsdatum ist der heutige Tag: ein
            nummerierter Beleg darf nicht rückdatiert werden.
          </p>
          <p className="text-text-secondary">
            Was tatsächlich hinausgeht, entscheidet der Server im Moment des Ausstellens
            neu. Eine Rechnung, die inzwischen bezahlt wurde, wird nicht gemahnt.
          </p>
          {issue.error !== null && <ErrorNotice error={issue.error} />}
        </div>
      </Dialog>
    </>
  )
}

/**
 * What a run produced, right where it was started.
 *
 * <p><b>One PDF, not nine downloads.</b> What comes out of a run is a stack of letters that
 * goes into envelopes; handing it over as one file per letter would leave the paper way
 * unfinished (backend ADR-0094).
 */
function RunResult({
  result,
  onPrint,
  printing,
  onDismiss,
}: {
  result: DunningRunResult
  onPrint: (runId: number) => void
  printing: boolean
  onDismiss: () => void
}) {
  const issued = result.issued.length
  return (
    <Panel
      title={issued === 0 ? 'Es ging nichts hinaus' : `${issued} Mahnungen ausgestellt`}
      description={
        issued === 0
          ? undefined
          : 'Alle Briefe dieses Laufs als ein PDF — zum Drucken und Kuvertieren.'
      }
      action={
        <div className="flex gap-2">
          {issued > 0 && result.runId !== undefined && (
            <Button onClick={() => onPrint(result.runId as number)} disabled={printing}>
              {printing ? 'Wird geholt ...' : 'Sammel-PDF'}
            </Button>
          )}
          <a
            className="self-center text-[13px] text-accent-text"
            href={DUNNING_NOTICES_PATH}
          >
            Alle Mahnungen
          </a>
          <Button variant="ghost" onClick={onDismiss}>
            Schliessen
          </Button>
        </div>
      }
    >
      <div className="grid gap-2 text-[13px]">
        {result.issued.map((notice) => (
          <div key={notice.id} className="flex gap-2">
            <span className="font-mono text-[12px]">{notice.noticeNumber}</span>
            <span>{notice.recipientName}</span>
            <span className="text-text-tertiary">
              {notice.levelName ?? `Stufe ${notice.levelNo}`}
              {notice.lines.length > 1 && ` · ${notice.lines.length} Rechnungen`}
            </span>
          </div>
        ))}
        {result.unsent.length > 0 && (
          <div className="grid gap-1">
            <p className="font-medium">Ausgestellt, aber nicht versandt</p>
            {result.unsent.map((failure) => (
              <p key={`unsent-${failure.partnerId}-${failure.levelNo}`} className="text-text-secondary">
                {failure.message}
              </p>
            ))}
            <p className="text-[12px] text-text-tertiary">
              Diese Briefe stehen mit Nummer und Archivkopie — sie müssen gedruckt werden.
            </p>
          </div>
        )}
        {result.failed.length > 0 && (
          <div className="grid gap-1">
            <p className="font-medium">Nicht ausgestellt</p>
            {result.failed.map((failure) => (
              <p key={`${failure.partnerId}-${failure.levelNo}`} className="text-text-secondary">
                {failure.message}
              </p>
            ))}
            <p className="text-[12px] text-text-tertiary">
              Jeder Fehler blieb bei seinem Brief — die davor sind ausgestellt und bleiben es.
            </p>
          </div>
        )}
      </div>
    </Panel>
  )
}

function CandidateTable({
  candidates,
  open,
  onToggle,
  picked,
  onPick,
  skipped = false,
}: {
  candidates: DunningCandidate[]
  open: Record<string, boolean>
  onToggle: (key: string) => void
  /** Ticked letters; absent where the user may not issue anything. */
  picked?: Record<string, boolean>
  onPick?: (key: string) => void
  skipped?: boolean
}) {
  const selectable = picked !== undefined && onPick !== undefined
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-[12px] text-text-tertiary">
            {selectable && <th className="w-[36px] py-2 pl-4" />}
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
                  {selectable && (
                    <td className="py-2 pl-4">
                      <CheckboxField
                        label=""
                        checked={picked[key] === true}
                        onChange={() => onPick(key)}
                        aria-label={`${candidate.partnerName ?? `Kunde ${candidate.partnerId}`} mahnen`}
                      />
                    </td>
                  )}
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
                      {selectable && <td />}
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
