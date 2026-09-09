import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Badge } from '../../components/Badge'
import { DataTable, type Column } from '../../components/DataTable'
import { EmptyState, ErrorNotice } from '../../components/Notice'
import { PageHeader } from '../../components/PageHeader'
import { Panel } from '../../components/Panel'
import { SelectField } from '../../components/SelectField'
import { TextField } from '../../components/TextField'
import { RequireTenant } from '../../layout/RequireTenant'
import { formatAmount, formatDate } from '../../lib/format'
import { listQuery } from '../../lib/paging'
import {
  ACCOUNTING_RIGHTS,
  fetchFiscalYears,
  fetchManualEntriesOn,
  fetchReconciliation,
  fetchSourcesWithoutEntry,
  fiscalYearsKey,
  reconciliationDetailKey,
  reconciliationKey,
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
 */
export function ReconciliationPage() {
  return (
    <RequireTenant permission={ACCOUNTING_RIGHTS.read}>
      {(tenantId) => <Reconciliation tenantId={tenantId} />}
    </RequireTenant>
  )
}

function Reconciliation({ tenantId }: { tenantId: number }) {
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
      <PageHeader
        title="Abstimmung"
        subtitle="Was das Hauptbuch auf den Sammelkonten führt, gehalten gegen die Nebenbücher dahinter — offene Posten und Kundenguthaben."
      />

      <div className="grid gap-4 px-8 pb-12">
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
            />
          ))}

        <p className="text-[12px] text-text-secondary">
          Eine Differenz ist kein Fehler des Programms, sondern eine Frage an einen Menschen:
          Belege von vor dem Umstellungstag werden bewusst nicht gebucht, eine Handbuchung
          bewegt nur das Hauptbuch, und ein Kundenguthaben ohne genanntes Geldkonto erreicht das
          Hauptbuch gar nicht.
        </p>
      </div>
    </>
  )
}

/**
 * The two expansions under one collective account.
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
}: {
  tenantId: number
  row: ReconciliationRow
  fiscalYearId: number | null
  asOf: string
  opened: string | null
  onOpen: (key: string | null) => void
}) {
  const manualKey = `${row.systemKey}:manual`
  const waitingKey = `${row.systemKey}:waiting`
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
