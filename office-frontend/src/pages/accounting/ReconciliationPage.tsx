import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { Badge } from '../../components/Badge'
import { Button } from '../../components/Button'
import { DataTable, type Column } from '../../components/DataTable'
import { Dialog } from '../../components/Dialog'
import { EmptyState, ErrorNotice, WarningNotice } from '../../components/Notice'
import { PageHeader } from '../../components/PageHeader'
import { Panel } from '../../components/Panel'
import { SelectField } from '../../components/SelectField'
import { Tabs } from '../../components/Tabs'
import { TextField } from '../../components/TextField'
import { RequireTenant } from '../../layout/RequireTenant'
import { formatAmount, formatDate } from '../../lib/format'
import { useRunsModule } from '../../lib/modules'
import { listQuery } from '../../lib/paging'
import {
  ACCOUNTING_MODULE,
  ACCOUNTING_RIGHTS,
  ACCOUNTING_SETTINGS_PATH,
  JOURNAL_PATH,
  PENDING_SOURCES_LIMIT,
  UNPOSTED_REGISTER,
  attentionKey,
  catchUpResultText,
  chosenSources,
  chosenTotal,
  fetchAttention,
  fetchFiscalYears,
  fetchManualEntriesOn,
  fetchPendingSources,
  fetchReconciliation,
  fetchEntriesWithoutSource,
  fetchSourcesWithoutEntry,
  fiscalYearsKey,
  invoiceCountText,
  pendingSourceKey,
  pendingSourcesKey,
  reconciliationDetailKey,
  reconciliationKey,
  runCatchUp,
  switchedOffSentence,
  type CatchUpOutcome,
  type CatchUpRunResult,
  type PendingSource,
  type ReconciliationRow,
} from '../../lib/accounting'
import { defaultYearOf } from './fiscalYears'

/**
 * «Abstimmung»: the collective accounts held against the subsidiary ledgers behind them.
 *
 * <p><b>The report the whole module cut is argued from.</b> GeBüV Art. 1 Abs. 1 and Abs. 3 make
 * the ledger the book the auxiliary books are held against; without a report anybody can call
 * every month, that reasoning would stay a claim (backend ADR-0110).
 *
 * <p><b>A dash, never a zero.</b> Where a system key is unassigned or no subsidiary ledger
 * stands behind an account, the row carries no figures and the reason instead — a difference of
 * nothing where nothing was compared reads as «geprüft und in Ordnung», which is the worse
 * answer.
 *
 * <p><b>It reads with the module switched off</b>, like the archive: switching off closes the
 * writing ways and must not hide what stands open. It is exactly then that somebody asks (OR
 * Art. 958f, backend ADR-0119).
 *
 * <p><b>Two registers.</b> «Abstimmung» holds the accounts against the subsidiary ledgers;
 * «Nicht gebucht» lists the issued invoices that never reached the ledger. The second one is
 * reached from the counter above every evaluation, so the register it opens on stands in the
 * address (`?ansicht=nicht-gebucht`). Ticking rows there and booking them is the catch-up run.
 */
export function ReconciliationPage() {
  return (
    <RequireTenant permission={ACCOUNTING_RIGHTS.read}>
      {(tenantId) => <Reconciliation tenantId={tenantId} />}
    </RequireTenant>
  )
}

type Register = 'reconciliation' | 'unposted'

function Reconciliation({ tenantId }: { tenantId: number }) {
  const [params] = useSearchParams()
  const [register, setRegister] = useState<Register>(
    params.get('ansicht') === UNPOSTED_REGISTER ? 'unposted' : 'reconciliation',
  )

  // The counter on the register and whether a changeover day stands. One answer for both, the
  // same the draft list reads, so the register cannot name a different figure than the counter
  // above the evaluations.
  const attention = useQuery({
    queryKey: attentionKey(tenantId),
    queryFn: () => fetchAttention(tenantId),
  })
  const unpostedCount = attention.data?.unpostedDocuments
  // Undefined until the answer is there: nothing is claimed about the day before it is known — a
  // notice that flashes up and vanishes again would read as a fault, and a list asked for too
  // early would be one nobody should see.
  const startConfirmed =
    attention.data === undefined ? undefined : Boolean(attention.data.postingStartsOn)

  return (
    <>
      <PageHeader
        title="Abstimmung"
        subtitle="Was das Hauptbuch auf den Sammelkonten führt, gehalten gegen die Nebenbücher dahinter — offene Posten und Kundenguthaben."
      />

      <div className="grid gap-4 px-8 pb-12">
        <Tabs<Register>
          label="Abstimmung"
          active={register}
          onChange={setRegister}
          tabs={[
            { id: 'reconciliation', label: 'Abstimmung' },
            {
              id: 'unposted',
              label:
                unpostedCount === undefined ? 'Nicht gebucht' : `Nicht gebucht (${unpostedCount})`,
            },
          ]}
        />

        {register === 'unposted' ? (
          <UnpostedRegister tenantId={tenantId} startConfirmed={startConfirmed} />
        ) : (
          <ReconciliationRegister tenantId={tenantId} startConfirmed={startConfirmed} />
        )}
      </div>
    </>
  )
}

/** The register «Abstimmung»: the collective accounts, their expansions, and the stretches. */
function ReconciliationRegister({
  tenantId,
  startConfirmed,
}: {
  tenantId: number
  startConfirmed: boolean | undefined
}) {
  const [fiscalYearId, setFiscalYearId] = useState<number | null>(null)
  const [asOf, setAsOf] = useState('')
  const [opened, setOpened] = useState<string | null>(null)

  const years = useQuery({
    queryKey: fiscalYearsKey(tenantId),
    queryFn: () => fetchFiscalYears(tenantId),
  })
  const available = years.data?.years ?? []
  // The year is compulsory at the endpoint — it answers 400 without one — so the screen picks
  // before it may ask: the year today falls into, and the latest one otherwise.
  const chosen = fiscalYearId ?? defaultYearOf(available)?.id ?? null
  const query = listQuery({ fiscalYearId: chosen ?? undefined, asOf: asOf === '' ? undefined : asOf })

  const report = useQuery({
    queryKey: reconciliationKey(tenantId, query),
    queryFn: () => fetchReconciliation(tenantId, query),
    enabled: chosen !== null,
    placeholderData: keepPreviousData,
  })

  const rows = report.data?.rows ?? []
  const offPeriods = report.data?.moduleOffPeriods ?? []

  const columns: Column<ReconciliationRow>[] = [
    {
      key: 'account',
      header: 'Konto',
      render: (row) => (
        <div>
          <div>
            {row.accountNumber ?? '—'} {row.accountName ?? ''}
          </div>
          <div className="text-[12px] text-text-tertiary">{row.systemKey}</div>
        </div>
      ),
    },
    {
      key: 'ledger',
      header: 'Hauptbuch',
      align: 'right',
      render: (row) => amountOrDash(row.ledgerAmount),
    },
    {
      key: 'subsidiary',
      header: 'Nebenbuch',
      align: 'right',
      render: (row) => amountOrDash(row.subsidiaryAmount),
    },
    {
      key: 'difference',
      header: 'Differenz',
      align: 'right',
      render: (row) => amountOrDash(row.difference),
    },
    {
      key: 'verdict',
      header: '',
      render: (row) => {
        if (row.reason !== undefined) {
          return <span className="text-[12px] text-text-tertiary">{row.reason}</span>
        }
        return row.balanced ? (
          <Badge tone="success">stimmt überein</Badge>
        ) : (
          <Badge tone="danger">Differenz</Badge>
        )
      },
    },
  ]

  return (
    <>
      <div className="flex flex-wrap items-end gap-4">
        <SelectField
          label="Geschäftsjahr"
          value={chosen === null ? '' : String(chosen)}
          onChange={(event) =>
            setFiscalYearId(event.target.value === '' ? null : Number(event.target.value))
          }
          className="w-[170px]"
        >
          {available.map((year) => (
            <option key={year.id} value={year.id}>
              {year.label}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Stichtag"
          type="date"
          value={asOf}
          onChange={(event) => setAsOf(event.target.value)}
          hint="Beide Seiten werden auf diesen Tag gelesen. Leer heisst: das ganze Jahr."
        />
      </div>

      <Panel padded={false} title="Sammelkonten">
        <DataTable
          columns={columns}
          rows={rows}
          keyOf={(row) => row.systemKey}
          loading={report.isLoading}
          error={report.error}
          empty={
            <EmptyState
              title="Keine Sammelkonten"
              description="Für dieses Geschäftsjahr steht nichts zum Abstimmen."
            />
          }
        />
      </Panel>

      {rows
        .filter((row) => row.accountNumber !== undefined)
        .map((row) => (
          <Expansions
            key={row.systemKey}
            tenantId={tenantId}
            row={row}
            fiscalYearId={chosen}
            asOf={asOf}
            opened={opened}
            onOpen={setOpened}
            startConfirmed={startConfirmed}
          />
        ))}

      {/* The sentence the decision asked for under the report: when the books were not kept, and
          how many invoices that left without an entry. */}
      {offPeriods.map((period) => (
        <WarningNotice key={`${period.from}-${period.to}`}>{switchedOffSentence(period)}</WarningNotice>
      ))}

      <p className="text-[12px] text-text-secondary">
        Eine Differenz ist kein Fehler des Programms, sondern eine Frage an einen Menschen:
        Belege von vor dem Umstellungstag werden bewusst nicht gebucht, eine Handbuchung
        bewegt nur das Hauptbuch, und ein Kundenguthaben ohne genanntes Geldkonto erreicht das
        Hauptbuch gar nicht.
      </p>
    </>
  )
}

/**
 * The way to the confirmation dialog, wherever a missing changeover day explains what is shown.
 *
 * <p>One of the three ways the decision names — the counter above the evaluations, the register
 * «Nicht gebucht» and the expansion «Belege ohne Buchung» — and all three lead to the same block
 * of the settings.
 */
function ConfirmStartLink() {
  return (
    <Link to={ACCOUNTING_SETTINGS_PATH} className="underline">
      Stichtag bestätigen
    </Link>
  )
}

/**
 * «Nicht gebucht»: the issued invoices that never reached the ledger, and the catch-up run that
 * books them.
 *
 * <p><b>Without a confirmed changeover day there is no list but a sentence.</b> Then nothing
 * books itself and nothing is caught up; a list of all issued invoices would answer the wrong
 * question — the right one is from which day on the documents book themselves.
 *
 * <p><b>The catch-up run follows the write-off run and the clearing basket</b> (backend ADR-0102,
 * ADR-0109): ticks in a `DataTable`, a check before anything is written, one transaction per
 * invoice, and afterwards three lists — booked, skipped with the reason, failed. A row the
 * backend says cannot be booked — «Nicht nachbuchbar: Geschäftsjahr 2025 abgeschlossen» — shows
 * the reason and takes no tick; the tenant books a supplementary entry in the open year instead.
 *
 * <p><b>With the module off the register still lists</b>, from the reading way of the
 * reconciliation report, but offers no run: the proposal and the run both answer 409 then, and
 * a button that cannot work is a promise the screen cannot keep.
 */
function UnpostedRegister({
  tenantId,
  startConfirmed,
}: {
  tenantId: number
  startConfirmed: boolean | undefined
}) {
  const { can } = useAuth()
  const runs = useRunsModule()
  const queryClient = useQueryClient()
  const running = runs(ACCOUNTING_MODULE)
  const mayRun = running && can(ACCOUNTING_RIGHTS.post)

  const [selected, setSelected] = useState<Set<string | number>>(() => new Set())
  const [confirming, setConfirming] = useState(false)
  const [result, setResult] = useState<CatchUpRunResult | null>(null)

  const proposal = useQuery({
    queryKey: pendingSourcesKey(tenantId),
    queryFn: () => fetchPendingSources(tenantId),
    enabled: startConfirmed === true && running,
  })
  // Switched off, the proposal answers 409; what was left behind is still worth seeing, so the
  // register reads the expansion of the report instead and offers no ticks.
  const waiting = useQuery({
    queryKey: reconciliationDetailKey(tenantId, 'DEBITOR_SAMMEL', 'unposted-register', ''),
    queryFn: () =>
      fetchSourcesWithoutEntry(
        tenantId,
        'DEBITOR_SAMMEL',
        listQuery({ limit: PENDING_SOURCES_LIMIT }),
      ),
    enabled: startConfirmed === true && !running,
  })

  const rows: PendingSource[] = running
    ? (proposal.data?.rows ?? [])
    : (waiting.data ?? []).map((source) => ({ ...source, bookable: false }))
  const total = running ? (proposal.data?.total ?? 0) : rows.length
  const chosen = chosenSources(rows, selected)
  const listing = running ? proposal : waiting

  const run = useMutation({
    mutationFn: () => runCatchUp(tenantId, chosen),
    onSuccess: (answer) => {
      setResult(answer)
      setSelected(new Set())
      setConfirming(false)
      void queryClient.invalidateQueries({ queryKey: pendingSourcesKey(tenantId) })
      void queryClient.invalidateQueries({ queryKey: attentionKey(tenantId) })
      void queryClient.invalidateQueries({ queryKey: ['accounting-reconciliation', tenantId] })
      void queryClient.invalidateQueries({ queryKey: ['accounting-journal', tenantId] })
    },
  })

  if (startConfirmed === false) {
    return (
      <WarningNotice>
        <span className="flex flex-wrap items-baseline gap-2">
          <span>
            Solange kein Stichtag bestätigt ist, wird nichts gebucht und nichts nachgetragen.
          </span>
          <ConfirmStartLink />
        </span>
      </WarningNotice>
    )
  }

  const columns: Column<PendingSource>[] = [
    {
      key: 'reference',
      header: 'Beleg',
      render: (source) => <span className="font-mono">{source.reference}</span>,
    },
    { key: 'day', header: 'Datum', render: (source) => formatDate(source.day) },
    {
      key: 'partner',
      header: 'Kunde',
      hideBelow: 'sm',
      render: (source) => source.partner ?? '–',
    },
    {
      key: 'amount',
      header: 'Betrag',
      align: 'right',
      render: (source) => formatAmount(source.amount),
    },
    {
      key: 'reason',
      header: '',
      render: (source) =>
        source.reason ? (
          <span className="text-[12px] text-text-tertiary">{source.reason}</span>
        ) : null,
    },
  ]

  return (
    <>
      {!running && (
        <WarningNotice>
          Die Buchhaltung ist abgeschaltet. Die Liste bleibt lesbar; nachgebucht wird erst wieder,
          wenn sie eingeschaltet ist.
        </WarningNotice>
      )}

      {result !== null && <CatchUpResult result={result} onClose={() => setResult(null)} />}

      <Panel
        padded={false}
        title="Ausgestellte Rechnungen ohne Buchung"
        action={
          mayRun ? (
            <Button onClick={() => setConfirming(true)} disabled={chosen.length === 0}>
              Nachbuchen ({chosen.length})
            </Button>
          ) : undefined
        }
      >
        {total > rows.length && (
          <p className="px-5 pb-3 text-[12px] text-text-secondary">
            Angezeigt werden die neuesten {rows.length} von {total} Rechnungen. Nach dem Lauf rücken
            die übrigen nach.
          </p>
        )}
        <DataTable
          columns={columns}
          rows={rows}
          keyOf={pendingSourceKey}
          loading={startConfirmed === undefined || listing.isLoading}
          error={listing.error}
          empty={
            <EmptyState
              title="Alles gebucht"
              description="Seit dem Stichtag hat jede ausgestellte Rechnung ihre Buchung."
            />
          }
          selected={mayRun ? selected : undefined}
          onSelectedChange={mayRun ? setSelected : undefined}
          selectableRow={(source) => source.bookable}
          selectionLabel={(source) => `Rechnung ${source.reference} markieren`}
        />
      </Panel>
      <p className="text-[12px] text-text-secondary">
        Rechnungen vor dem Stichtag stehen hier nicht: diese Zeit wurde von Hand gebucht, dort wird
        nichts nachgetragen. Gebucht wird jede Rechnung auf ihr Belegdatum; liegt es in einem
        abgeschlossenen Jahr, steht der Grund in der Zeile, und die Buchung gehört als
        Nachtragsbuchung ins laufende Jahr.
      </p>

      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Nachbuchen"
        description="Je Rechnung entsteht eine eigene Buchung in einer eigenen Transaktion."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Abbrechen
            </Button>
            <Button
              onClick={() => run.mutate()}
              busy={run.isPending}
              disabled={chosen.length === 0}
            >
              Jetzt nachbuchen
            </Button>
          </>
        }
      >
        <div className="grid gap-2 text-[13px] text-text-secondary">
          <p>
            <strong className="text-text-primary">{invoiceCountText(chosen.length)}</strong>,
            zusammen {formatAmount(chosenTotal(chosen))}.
          </p>
          <p>
            Buchungsdatum ist jeweils das Belegdatum. Eine Rechnung, die inzwischen gebucht wurde
            oder deren Periode gesperrt ist, wird übersprungen und mit dem Grund aufgeführt — die
            übrigen laufen trotzdem durch.
          </p>
          <p className="text-[12px] text-text-tertiary">
            Eine gebuchte Rechnung lässt sich danach nicht mehr zurückstellen; korrigiert wird über
            Storno oder Gutschrift.
          </p>
          {run.error !== null && <ErrorNotice error={run.error} />}
        </div>
      </Dialog>
    </>
  )
}

/**
 * The three result lists of a catch-up run, after the pattern of the write-off run and the
 * clearing basket.
 */
function CatchUpResult({ result, onClose }: { result: CatchUpRunResult; onClose: () => void }) {
  const rest = [...result.skipped, ...result.failed]
  return (
    <Panel title="Ergebnis des Laufs">
      <p aria-live="polite" className="text-[13px]">
        {catchUpResultText(result)}
      </p>
      {result.posted.length > 0 && (
        <ul className="mt-3 grid gap-1 text-[13px]">
          {result.posted.map((line) => (
            <li key={pendingSourceKey(line)}>
              {line.reference ?? `Beleg ${line.sourceId}`} gebucht als{' '}
              <strong>{line.entryNumber}</strong>.
            </li>
          ))}
        </ul>
      )}
      {rest.length > 0 && (
        <ul className="mt-3 grid gap-1 text-[13px] text-text-secondary">
          {rest.map((line) => (
            <li key={`${line.outcome}-${pendingSourceKey(line)}`}>
              <strong>
                {CATCH_UP_OUTCOMES[line.outcome]} · {line.reference ?? `Beleg ${line.sourceId}`}:
              </strong>{' '}
              {line.message}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex gap-2">
        <Link to={JOURNAL_PATH}>
          <Button variant="secondary">Im Journal ansehen</Button>
        </Link>
        <Button variant="ghost" onClick={onClose}>
          Schliessen
        </Button>
      </div>
    </Panel>
  )
}

/** What each of the three outcomes is called in front of its sentence. */
const CATCH_UP_OUTCOMES: Record<CatchUpOutcome['outcome'], string> = {
  POSTED: 'Gebucht',
  SKIPPED: 'Übersprungen',
  FAILED: 'Fehlgeschlagen',
}

/**
 * The three expansions under one collective account.
 *
 * <p>They answer «warum», because a difference without an explanation only moves the question.
 * Loaded when opened and not before: a screen that asks four questions for every row pays for
 * three nobody reads.
 */
function Expansions({
  tenantId,
  row,
  fiscalYearId,
  asOf,
  opened,
  onOpen,
  startConfirmed,
}: {
  tenantId: number
  row: ReconciliationRow
  fiscalYearId: number | null
  asOf: string
  opened: string | null
  onOpen: (key: string | null) => void
  /**
   * Whether a changeover day stands, `undefined` until known; without one the expansion says
   * why it lists everything.
   */
  startConfirmed: boolean | undefined
}) {
  const manualKey = `${row.systemKey}:manual`
  const waitingKey = `${row.systemKey}:waiting`
  const orphanKey = `${row.systemKey}:orphans`
  const cutOff = asOf === '' ? undefined : asOf

  const manual = useQuery({
    queryKey: reconciliationDetailKey(tenantId, row.systemKey, 'manual', asOf),
    queryFn: () =>
      fetchManualEntriesOn(
        tenantId,
        row.systemKey,
        listQuery({ fiscalYearId: fiscalYearId ?? undefined, asOf: cutOff, size: 50 }),
      ),
    enabled: opened === manualKey && fiscalYearId !== null,
  })

  const waiting = useQuery({
    queryKey: reconciliationDetailKey(tenantId, row.systemKey, 'waiting', asOf),
    queryFn: () =>
      fetchSourcesWithoutEntry(tenantId, row.systemKey, listQuery({ asOf: cutOff, limit: 50 })),
    enabled: opened === waitingKey,
  })

  const orphans = useQuery({
    queryKey: reconciliationDetailKey(tenantId, row.systemKey, 'orphans', asOf),
    queryFn: () =>
      fetchEntriesWithoutSource(
        tenantId,
        row.systemKey,
        listQuery({ fiscalYearId: fiscalYearId ?? undefined, asOf: cutOff, limit: 50 }),
      ),
    enabled: opened === orphanKey && fiscalYearId !== null,
  })

  return (
    <Panel title={`${row.accountNumber} ${row.accountName ?? ''}`}>
      <div className="grid gap-3">
        <details
          open={opened === manualKey}
          onToggle={(event) =>
            onOpen(event.currentTarget.open ? manualKey : opened === manualKey ? null : opened)
          }
        >
          <summary className="cursor-pointer text-[13px]">
            Handbuchungen auf dem Sammelkonto
          </summary>
          <div className="pt-2 text-[13px]">
            {manual.error !== null && <ErrorNotice error={manual.error} />}
            {(manual.data?.content ?? []).length === 0 && !manual.isLoading && (
              <p className="text-text-tertiary">Keine Handbuchungen auf diesem Konto.</p>
            )}
            {(manual.data?.content ?? []).map((entry) => (
              <div key={entry.id} className="flex flex-wrap gap-x-4">
                <span className="font-mono">{entry.entryNumber}</span>
                <span>{formatDate(entry.bookingDate)}</span>
                <span>{entry.description}</span>
              </div>
            ))}
          </div>
        </details>

        <details
          open={opened === waitingKey}
          onToggle={(event) =>
            onOpen(event.currentTarget.open ? waitingKey : opened === waitingKey ? null : opened)
          }
        >
          <summary className="cursor-pointer text-[13px]">Belege ohne Buchung</summary>
          <div className="pt-2 text-[13px]">
            {/* Only the receivables list documents; the customer credits never do, so the
                sentence would claim something about them that is not so. */}
            {startConfirmed === false && row.systemKey === 'DEBITOR_SAMMEL' && (
              <p className="flex flex-wrap items-baseline gap-2 pb-2 text-text-secondary">
                <span>
                  Es ist noch kein Stichtag bestätigt — deshalb wird nichts gebucht, und jeder
                  ausgestellte Beleg steht hier.
                </span>
                <ConfirmStartLink />
              </p>
            )}
            {waiting.error !== null && <ErrorNotice error={waiting.error} />}
            {(waiting.data ?? []).length === 0 && !waiting.isLoading && (
              <p className="text-text-tertiary">
                Zu diesem Konto wartet kein Beleg auf eine Buchung.
              </p>
            )}
            {(waiting.data ?? []).map((source) => (
              <div key={`${source.sourceKind}-${source.sourceId}`} className="flex flex-wrap gap-x-4">
                <span className="font-mono">{source.reference}</span>
                <span>{formatDate(source.day)}</span>
                <span>{formatAmount(source.amount)}</span>
              </div>
            ))}
          </div>
        </details>

        <details
          open={opened === orphanKey}
          onToggle={(event) =>
            onOpen(event.currentTarget.open ? orphanKey : opened === orphanKey ? null : opened)
          }
        >
          <summary className="cursor-pointer text-[13px]">Buchungen ohne Beleg</summary>
          <div className="pt-2 text-[13px]">
            {orphans.error !== null && <ErrorNotice error={orphans.error} />}
            {(orphans.data ?? []).length === 0 && !orphans.isLoading && (
              <p className="text-text-tertiary">
                Zu jeder Buchung auf diesem Konto steht ihr Beleg.
              </p>
            )}
            {(orphans.data ?? []).map((entry) => (
              <div key={entry.id} className="flex flex-wrap gap-x-4">
                <span className="font-mono">{entry.entryNumber}</span>
                <span>{formatDate(entry.bookingDate)}</span>
                <span>{entry.description}</span>
              </div>
            ))}
          </div>
        </details>
      </div>
    </Panel>
  )
}

/**
 * <p><b>A dash, never a zero.</b> A figure that was not compared is absent, and showing 0.00
 * for it would read as «geprüft und in Ordnung».
 */
function amountOrDash(amount: number | undefined) {
  return amount === undefined || amount === null ? (
    <span className="text-text-tertiary">—</span>
  ) : (
    <span>{formatAmount(amount)}</span>
  )
}
