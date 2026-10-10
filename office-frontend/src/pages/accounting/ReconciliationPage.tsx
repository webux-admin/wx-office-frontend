import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { Badge } from '../../components/Badge'
import { DataTable, type Column } from '../../components/DataTable'
import { EmptyState, ErrorNotice, WarningNotice } from '../../components/Notice'
import { PageHeader } from '../../components/PageHeader'
import { Panel } from '../../components/Panel'
import { SelectField } from '../../components/SelectField'
import { Tabs } from '../../components/Tabs'
import { TextField } from '../../components/TextField'
import { RequireTenant } from '../../layout/RequireTenant'
import { formatAmount, formatDate } from '../../lib/format'
import { listQuery } from '../../lib/paging'
import {
  ACCOUNTING_RIGHTS,
  ACCOUNTING_SETTINGS_PATH,
  UNPOSTED_REGISTER,
  attentionKey,
  fetchAttention,
  fetchFiscalYears,
  fetchManualEntriesOn,
  fetchReconciliation,
  fetchEntriesWithoutSource,
  fetchSourcesWithoutEntry,
  fiscalYearsKey,
  reconciliationDetailKey,
  reconciliationKey,
  switchedOffSentence,
  type ReconciliationRow,
  type UnpostedSource,
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
 * address (`?ansicht=nicht-gebucht`). Choosing rows and booking them afterwards is the catch-up
 * run, which comes later; until then the register lists and explains.
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
 * «Nicht gebucht»: the issued invoices that never reached the ledger.
 *
 * <p><b>Without a confirmed changeover day there is no list but a sentence.</b> Then nothing
 * books itself and every issued invoice counts; a list of all of them would answer the wrong
 * question — the right one is from which day on the documents book themselves.
 *
 * <p>Only a list for now. Choosing rows and booking them afterwards is the catch-up run, which
 * comes with its own step and its own checks; a button here that no endpoint serves would be a
 * promise the screen cannot keep.
 */
function UnpostedRegister({
  tenantId,
  startConfirmed,
}: {
  tenantId: number
  startConfirmed: boolean | undefined
}) {
  const waiting = useQuery({
    queryKey: reconciliationDetailKey(tenantId, 'DEBITOR_SAMMEL', 'unposted-register', ''),
    queryFn: () => fetchSourcesWithoutEntry(tenantId, 'DEBITOR_SAMMEL', listQuery({ limit: 200 })),
    enabled: startConfirmed === true,
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

  const columns: Column<UnpostedSource>[] = [
    {
      key: 'reference',
      header: 'Beleg',
      render: (source) => <span className="font-mono">{source.reference}</span>,
    },
    { key: 'day', header: 'Datum', render: (source) => formatDate(source.day) },
    {
      key: 'amount',
      header: 'Betrag',
      align: 'right',
      render: (source) => formatAmount(source.amount),
    },
  ]

  return (
    <>
      <Panel padded={false} title="Ausgestellte Rechnungen ohne Buchung">
        <DataTable
          columns={columns}
          rows={waiting.data ?? []}
          keyOf={(source) => `${source.sourceKind}-${source.sourceId}`}
          loading={startConfirmed === undefined || waiting.isLoading}
          error={waiting.error}
          empty={
            <EmptyState
              title="Alles gebucht"
              description="Seit dem Stichtag hat jede ausgestellte Rechnung ihre Buchung."
            />
          }
        />
      </Panel>
      <p className="text-[12px] text-text-secondary">
        Rechnungen vor dem Stichtag stehen hier nicht: diese Zeit wurde von Hand gebucht, dort wird
        nichts nachgetragen.
      </p>
    </>
  )
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
