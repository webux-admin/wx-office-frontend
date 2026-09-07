import { useState, type ReactNode } from 'react'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { AlertTriangle, ShieldCheck } from 'lucide-react'
import { Button } from '../../components/Button'
import { CheckboxField } from '../../components/CheckboxField'
import { DataTable, type Column } from '../../components/DataTable'
import { EmptyState, ErrorNotice, LoadingBlock } from '../../components/Notice'
import { PageHeader } from '../../components/PageHeader'
import { Panel } from '../../components/Panel'
import { SelectField } from '../../components/SelectField'
import { RequireTenant } from '../../layout/RequireTenant'
import {
  ACCESS_LOG_ACTIONS,
  ACCESS_LOG_ACTION_PARAM,
  ACCESS_LOG_DEFAULT_SORT,
  ACCESS_LOG_FINDINGS_PARAM,
  ACCOUNTING_ARCHIVE_PATH,
  ACCOUNTING_RIGHTS,
  accessLogActionOf,
  accessLogKey,
  fetchAccessLog,
  fetchIntegrity,
  findingsOnlyOf,
  integrityKey,
  type AccessLogSortField,
} from '../../lib/accounting'
import { formatCount, formatDate, formatDateTime } from '../../lib/format'
import { emptyPage, listQuery, PAGE_SIZE } from '../../lib/paging'
import type { AccessLogRow, ChainIntegrity } from '../../lib/types'

/** Seconds with one decimal, de-CH — «0.4», never «0,4». */
const SECONDS = new Intl.NumberFormat('de-CH', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

/**
 * A column of the access log, tied to the fields the endpoint sorts by.
 *
 * <p>Every column here is sortable and none may offer a key of its own: the server answers 400
 * for a field outside its whitelist, so an invented sort key is caught while building rather
 * than by a reader whose click does nothing.
 */
type LogColumn = Column<AccessLogRow> & { sortKey: AccessLogSortField }

/**
 * «Integrität»: the proof that the books are unchanged, and the log of who took them out.
 *
 * <p><b>No `module` on the guard, and that is the law rather than an oversight.</b> Switching
 * the accounting module off closes the writing ways; it must not hide the books or the proof
 * about them. OR Art. 958f keeps them readable for ten years and GeBüV Art. 6 Abs. 1 wants a
 * person holding the read right to be able to look within a reasonable time — a fiduciary hired
 * after the switch went off would otherwise never get at either. So this screen never shows a
 * `ModuleOffNotice`, and neither endpoint behind it refuses while the switch is off (backend
 * ADR-0119, ADR-0126).
 *
 * <p><b>Opening the screen does not run the check.</b> The normal state is a statement of fact
 * read out of the log — «Alle 1’842 verbuchten Buchungen sind unverändert. Zuletzt geprüft am
 * 02.09.2026, 14:12 durch m.keller.» — and a run happens only when somebody presses the button.
 * A run appends a line to `accounting_access_log`, and that table has no way back out: a
 * database trigger refuses UPDATE and DELETE because the log is kept ten years (GeBüV Art. 9
 * Abs. 1 Bst. b Ziff. 4). Opening a screen must not grow a table nobody can ever tidy up.
 *
 * <p><b>A break and a gap are two sentences and never one word.</b> A break means a stored entry
 * no longer matches its hash; a gap means a chain number is missing. Rolled into one «ungültig»
 * they would send the reader to the wrong question (backend ADR-0115).
 *
 * <p><b>What the screen says in the bad case is what the reader must not do.</b> The sentence is
 * written here and not in the payload: «Ändern Sie nichts» is advice, and advice belongs where
 * the person stands (backend ADR-0126).
 */
export function AccountingIntegrityPage() {
  return (
    <RequireTenant permission={ACCOUNTING_RIGHTS.read}>
      {(tenantId) => <Integrity tenantId={tenantId} />}
    </RequireTenant>
  )
}

function Integrity({ tenantId }: { tenantId: number }) {
  const queryClient = useQueryClient()
  // Both filters stand in the address, so «schau dir die Befunde an» can be sent as a link and
  // a reload keeps what somebody narrowed to. The page number does not: it belongs to the
  // reading, not to the question (frontend ADR-0005).
  const [params, setParams] = useSearchParams()
  const action = accessLogActionOf(params.get(ACCESS_LOG_ACTION_PARAM))
  const findingsOnly = findingsOnlyOf(params.get(ACCESS_LOG_FINDINGS_PARAM))
  const filtered = action !== '' || findingsOnly
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState(ACCESS_LOG_DEFAULT_SORT)

  // Asked for by hand and never on mount: a run writes a line into a log that has no delete
  // path, so opening the screen would grow an unerasable table by one row every time.
  const report = useQuery({
    queryKey: integrityKey(tenantId),
    queryFn: () => fetchIntegrity(tenantId),
    enabled: false,
  })

  // What the screen says before anybody presses the button: the newest run the log holds. The
  // line carries the count, the moment, the user and the finding — enough for the sentence, and
  // reading it costs no new line.
  const lastRunQuery = listQuery({
    action: 'INTEGRITY_CHECK',
    size: 1,
    sort: ACCESS_LOG_DEFAULT_SORT,
  })
  const lastRun = useQuery({
    queryKey: accessLogKey(tenantId, lastRunQuery),
    queryFn: () => fetchAccessLog(tenantId, lastRunQuery),
  })

  const query = listQuery({
    action,
    findingsOnly: findingsOnly ? 'true' : '',
    page,
    size: PAGE_SIZE,
    sort,
  })
  const log = useQuery({
    queryKey: accessLogKey(tenantId, query),
    queryFn: () => fetchAccessLog(tenantId, query),
    placeholderData: keepPreviousData,
  })

  /**
   * Writes one filter into the address and starts the reading over.
   *
   * <p>Replace and not push: the back button belongs to the screen somebody came from, not to
   * the filter they last tried.
   */
  function narrow(name: string, value: string) {
    const next = new URLSearchParams(params)
    if (value === '') next.delete(name)
    else next.set(name, value)
    setPage(0)
    setParams(next, { replace: true })
  }

  /** Drops both filters at once, for the reader whose narrowing left nothing on the page. */
  function resetFilters() {
    const next = new URLSearchParams(params)
    next.delete(ACCESS_LOG_ACTION_PARAM)
    next.delete(ACCESS_LOG_FINDINGS_PARAM)
    setPage(0)
    setParams(next, { replace: true })
  }

  /** Runs the chain. The run writes a log line, so both readings of the log follow it. */
  async function check() {
    await report.refetch()
    // Every page of the log at once, the last-run line among them: the key of the page being
    // read is not known here, and a stale page is a log that hides the run just made.
    await queryClient.invalidateQueries({ queryKey: ['accounting-access-log', tenantId] })
  }

  const columns: LogColumn[] = [
    {
      key: 'accessedAt',
      header: 'Zeitpunkt',
      sortKey: 'accessedAt',
      width: 'w-[160px]',
      render: (row) => <span className="tabular-nums">{formatDateTime(row.accessedAt)}</span>,
    },
    {
      key: 'accessedBy',
      header: 'Benutzer',
      sortKey: 'accessedBy',
      width: 'w-[150px]',
      render: (row) => <span>{row.accessedBy}</span>,
    },
    {
      key: 'action',
      header: 'Vorgang',
      sortKey: 'action',
      // The wording comes with the row and is never built here: a second table would be the
      // second place it drifts (backend ADR-0126).
      render: (row) => (
        <span className="block">
          <span className="font-medium">{row.actionLabel}</span>
          {row.reportLabel && (
            <span className="text-text-secondary"> · {row.reportLabel}</span>
          )}
        </span>
      ),
    },
    {
      key: 'fiscalYearLabel',
      header: 'Jahr',
      sortKey: 'fiscalYearLabel',
      width: 'w-[90px]',
      hideBelow: 'sm',
      render: (row) => <span className="tabular-nums">{row.fiscalYearLabel ?? '—'}</span>,
    },
    {
      key: 'outcome',
      header: 'Ergebnis',
      sortKey: 'outcome',
      render: (row) => (
        <span className="block">
          <span className={row.outcome === 'FINDING' ? 'font-medium text-danger' : ''}>
            {row.outcomeLabel}
          </span>
          {row.detail && (
            <span className="mt-0.5 block text-[12px] text-text-secondary">{row.detail}</span>
          )}
        </span>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Integrität"
        subtitle="Ob die verbuchten Buchungen unverändert sind — und wer die Bücher aus dieser Anwendung geholt hat."
        back={{ to: ACCOUNTING_ARCHIVE_PATH, label: 'Archiv' }}
      />

      <div className="grid gap-4 px-8 pb-12">
        <Panel>
          {/* Announced, because the answer changes under a button that stays where it is. */}
          <div className="grid gap-3" aria-live="polite">
            {/* A failed run stands above the statement and does not replace it: the button has
                to stay reachable, otherwise a single hiccup ends the screen. */}
            {report.error !== null && <ErrorNotice error={report.error} />}
            <ChainState
              loading={lastRun.isLoading}
              error={lastRun.error}
              found={report.data}
              lastLine={lastRun.data?.content[0]}
              busy={report.isFetching}
              onCheck={() => void check()}
            />
          </div>
        </Panel>

        <Panel
          title="Zugriffsprotokoll"
          description="Vier Dinge stehen darin: der Export, der Ausdruck, der Griff ins Archiv und die Prüfung der Kette."
          padded={false}
        >
          <div className="flex flex-wrap items-end gap-4 px-5 py-4">
            <SelectField
              label="Vorgang"
              value={action}
              onChange={(event) => narrow(ACCESS_LOG_ACTION_PARAM, event.target.value)}
              className="w-[220px]"
            >
              <option value="">Alle Vorgänge</option>
              {ACCESS_LOG_ACTIONS.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </SelectField>
            <CheckboxField
              label="Nur Befunde"
              checked={findingsOnly}
              onChange={(event) =>
                narrow(ACCESS_LOG_FINDINGS_PARAM, event.target.checked ? 'true' : '')
              }
              className="pb-3"
            />
          </div>

          <DataTable
            columns={columns}
            rows={(log.data ?? emptyPage<AccessLogRow>()).content}
            keyOf={(row) => row.id}
            loading={log.isLoading}
            error={log.error}
            page={log.data}
            onPageChange={setPage}
            sort={sort}
            onSortChange={(next) => {
              setSort(next)
              setPage(0)
            }}
            empty={
              // Two different reasons for an empty page, and only one of them is «nothing was
              // ever recorded». Under a filter the emptiness says the filter matched nothing,
              // and a screen that claims the other one is lying about an audit trail.
              filtered ? (
                <EmptyState
                  title="Keine Treffer"
                  description="Für diese Auswahl steht nichts im Protokoll. Ohne Filter sind alle erfassten Zugriffe zu sehen."
                >
                  <Button variant="secondary" onClick={resetFilters}>
                    Filter zurücksetzen
                  </Button>
                </EmptyState>
              ) : (
                <EmptyState
                  title="Noch nichts protokolliert"
                  description="Das Protokoll beginnt mit der ersten Zeile nach der Einführung dieser Funktion. Frühere Zugriffe sind nicht nachträglich erfasst."
                />
              )
            }
          />
        </Panel>
      </div>
    </>
  )
}

/**
 * The top block: what is known about the state of the chain, in words.
 *
 * <p>Two sources, and the fresher one wins. A run made on this screen is preferred because it
 * carries the journal number, the booking date and the fiscal year of the break — the three
 * things the reader is asked to pass on, and none of them fits in a log line. Without such a
 * run the newest `INTEGRITY_CHECK` line of the log carries the sentence.
 *
 * <p>Every state of it is drawn — the log on its way, a failed reading, a chain nobody has
 * checked here yet, a tenant that has never posted, the whole chain and the broken one. A screen
 * that only knows the successful case is not finished.
 */
function ChainState({
  loading,
  error,
  found,
  lastLine,
  busy,
  onCheck,
}: {
  loading: boolean
  error: unknown
  /** The run made on this screen, absent until somebody pressed the button. */
  found: ChainIntegrity | undefined
  /** The newest run the log knows, absent where it holds none. */
  lastLine: AccessLogRow | undefined
  busy: boolean
  onCheck: () => void
}) {
  if (loading) return <LoadingBlock label="Das Zugriffsprotokoll wird gelesen" />
  if (error !== null && error !== undefined) return <ErrorNotice error={error} />
  if (found !== undefined) return <FreshRun found={found} busy={busy} onCheck={onCheck} />
  if (lastLine !== undefined) return <LastRun line={lastLine} busy={busy} onCheck={onCheck} />

  return (
    <EmptyState
      title="Noch nicht geprüft"
      description="Im Zugriffsprotokoll steht kein Prüflauf über diese Bücher. Die Prüfung rechnet die Sicherungskette über das Journal nach und ändert nichts."
    >
      <Button variant="secondary" busy={busy} onClick={onCheck}>
        Jetzt prüfen
      </Button>
    </EmptyState>
  )
}

/** What the run just made on this screen found — the fullest answer there is. */
function FreshRun({
  found,
  busy,
  onCheck,
}: {
  found: ChainIntegrity
  busy: boolean
  onCheck: () => void
}) {
  if (found.postedEntries === 0) return <NothingPosted />

  return (
    <>
      {found.intact ? (
        <Intact
          count={found.postedEntries}
          checkedAt={found.checkedAt}
          checkedBy={found.checkedBy}
        />
      ) : (
        <BreakFromRun found={found} />
      )}
      <CheckButton
        label={found.intact ? 'Jetzt prüfen' : 'Erneut prüfen'}
        busy={busy}
        onCheck={onCheck}
      />
      <Explainer durationMillis={found.durationMillis} />
      <Reach />
    </>
  )
}

/**
 * What the log says about the last run, for the reader who has pressed nothing.
 *
 * <p>The line holds the count, the moment, the user, the outcome and the finding in plain
 * German. It does not hold the journal number of the break — that is what the button is for.
 */
function LastRun({
  line,
  busy,
  onCheck,
}: {
  line: AccessLogRow
  busy: boolean
  onCheck: () => void
}) {
  const finding = line.outcome === 'FINDING'

  // Nothing was posted when that run walked the chain. Unlike the fresh run this says nothing
  // about today, so the button stays — the first entry may have been posted since.
  if (!finding && line.checkedCount === 0) {
    return (
      <NothingPosted>
        <Button variant="secondary" busy={busy} onClick={onCheck}>
          Jetzt prüfen
        </Button>
      </NothingPosted>
    )
  }

  return (
    <>
      {finding ? (
        <BreakFromLog line={line} />
      ) : (
        <Intact
          count={line.checkedCount}
          checkedAt={line.accessedAt}
          checkedBy={line.accessedBy}
        />
      )}
      <CheckButton label={finding ? 'Erneut prüfen' : 'Jetzt prüfen'} busy={busy} onCheck={onCheck} />
      <Explainer durationMillis={line.durationMillis} />
      <Reach />
    </>
  )
}

/** A tenant with an empty journal. Not a finding and not a green tick over nothing. */
function NothingPosted({ children }: { children?: ReactNode }) {
  return (
    <EmptyState
      title="Noch nichts verbucht"
      description="Es ist noch nichts verbucht. Sobald die erste Buchung im Journal steht, prüft dieser Bildschirm die Sicherungskette darüber."
    >
      {children}
    </EmptyState>
  )
}

/**
 * The everyday answer: a statement of fact, not a green tick over nothing.
 *
 * @param count how many posted entries the run walked; unknown where the log line carries none
 */
function Intact({
  count,
  checkedAt,
  checkedBy,
}: {
  count: number | null | undefined
  checkedAt: string
  checkedBy: string
}) {
  return (
    <p className="flex items-start gap-2.5 text-[14px]">
      <ShieldCheck size={17} className="mt-px shrink-0 text-accent-text" aria-hidden />
      <span>
        {intactSentence(count)}{' '}
        Zuletzt geprüft am {formatDateTime(checkedAt)} durch {checkedBy}.
      </span>
    </p>
  )
}

/**
 * The good sentence, in the number the run walked.
 *
 * @param count the entries walked, `null` where the log line does not carry the figure
 * @returns the sentence, in the singular where a single entry would read wrong in the plural
 */
function intactSentence(count: number | null | undefined): string {
  if (count === 1) return 'Die einzige verbuchte Buchung ist unverändert.'
  if (count === null || count === undefined) return 'Die verbuchten Buchungen sind unverändert.'
  return `Alle ${formatCount(count)} verbuchten Buchungen sind unverändert.`
}

/** The one control of this block. Its label says whether a run is known already. */
function CheckButton({
  label,
  busy,
  onCheck,
}: {
  label: string
  busy: boolean
  onCheck: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="secondary" busy={busy} onClick={onCheck}>
        {label}
      </Button>
    </div>
  )
}

/** What the button does, and what it cost the last time it was pressed. */
function Explainer({ durationMillis }: { durationMillis: number | null | undefined }) {
  return (
    <p className="text-[13px] text-text-secondary">
      Die Prüfung rechnet die Sicherungskette über das Journal nach. Sie ändert nichts
      {durationMillis === null || durationMillis === undefined
        ? '.'
        : ` und dauerte beim letzten Mal ${SECONDS.format(durationMillis / 1000)} Sekunden.`}
    </p>
  )
}

/**
 * The honest limit, and it stays on the screen in the good case too: a proof whose reach is only
 * named when it fails is a proof somebody will overstate in the meantime.
 */
function Reach() {
  return (
    <p className="max-w-[80ch] text-[13px] text-text-secondary">
      Was die Prüfung nicht leisten kann: sie belegt, dass die gespeicherten Buchungen
      unverändert sind — nicht, wann sie gespeichert wurden. Für den Nachweis des
      Speicherzeitpunkts braucht es ein Verfahren ausserhalb dieses Programms. Siehe
      «Buchhaltung exportieren», Abschnitt «Was Sie selbst dokumentieren müssen».
    </p>
  )
}

/**
 * The bad answer, in the wording that was decided for it.
 *
 * <p>Deliberately not an {@link ErrorNotice}: the request succeeded. What failed is the books,
 * the text is four sentences rather than a message line, and half of it is advice about what not
 * to do. The danger tokens are the same ones that notice uses, because the weight is the same.
 *
 * @param headline what was found, in one sentence
 * @param detail the figures underneath it, gaps among them
 */
function BreakNotice({ headline, detail }: { headline: ReactNode; detail?: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-[var(--radius-md)] border border-danger/40 bg-danger/8 px-4 py-3">
      <AlertTriangle size={17} className="mt-px shrink-0 text-danger" aria-hidden />
      <div className="grid min-w-0 flex-1 gap-2">
        {headline}
        <p className="max-w-[80ch] text-[13px]">
          Ändern Sie nichts, buchen Sie normal weiter, und melden Sie Journalnummer und Datum
          Ihrem Treuhänder und Ihrer Systembetreuung. Die Prüfung sagt, dass Daten ausserhalb
          dieser Anwendung verändert wurden — nicht, dass Sie einen Fehler gemacht haben.
        </p>
        {detail}
      </div>
    </div>
  )
}

/**
 * The break as the run reports it: with the journal number, the day and the fiscal year.
 *
 * <p><b>A break and a gap stand as separate sentences.</b> The one asks which entry was changed,
 * the other asks where a number went — and «die Kette ist ungültig» would answer neither.
 */
function BreakFromRun({ found }: { found: ChainIntegrity }) {
  const first = found.firstBreak

  return (
    <BreakNotice
      headline={
        first && (
          <p className="text-[14px] font-medium">
            Ab Buchung {first.entryNumber} vom{' '}
            {formatDate(first.bookingDate)} stimmt die Sicherung nicht mehr.
          </p>
        )
      }
      detail={
        <>
          <p className="text-[13px] text-text-secondary">
            Geprüft: {formatCount(found.postedEntries)} Buchungen
            {first
              && ` · betroffen ab Kettennummer ${formatCount(first.chainNumber)}`
                + ` (${formatCount(found.affectedEntries)})`}
            {/* The year is missing where its row is gone; then the sentence simply omits it
                rather than showing a hyphen the reader has to interpret. */}
            {first?.fiscalYearLabel && ` · Geschäftsjahr ${first.fiscalYearLabel}`}
          </p>
          {found.gaps.map((gap) => (
            <p
              key={`${gap.afterChainNumber}-${gap.beforeChainNumber}`}
              className="text-[13px] text-text-secondary"
            >
              Zusätzlich: Lücke in der Kettennummer nach {formatCount(gap.afterChainNumber)} —{' '}
              {formatCount(gap.missingCount)} {gap.missingCount === 1 ? 'Nummer fehlt' : 'Nummern fehlen'}.
            </p>
          ))}
        </>
      }
    />
  )
}

/**
 * The break as the log kept it: the German sentence the run wrote, and nothing else.
 *
 * <p>The advice above asks for the journal number and the date, and the line carries neither.
 * So this one says outright where they come from instead of leaving the reader to guess.
 */
function BreakFromLog({ line }: { line: AccessLogRow }) {
  return (
    <BreakNotice
      headline={line.detail && <p className="text-[14px] font-medium">{line.detail}</p>}
      detail={
        <p className="text-[13px] text-text-secondary">
          {line.checkedCount === null || line.checkedCount === undefined
            ? ''
            : `Geprüft: ${formatCount(line.checkedCount)} Buchungen · `}
          Zuletzt geprüft am {formatDateTime(line.accessedAt)} durch {line.accessedBy}.
          Journalnummer und Datum der betroffenen Buchung nennt eine neue Prüfung.
        </p>
      }
    />
  )
}
