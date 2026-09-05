import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { CheckboxField } from '../../components/CheckboxField'
import { DataTable, type Column } from '../../components/DataTable'
import { EmptyState, ErrorNotice, WarningNotice } from '../../components/Notice'
import { PageHeader } from '../../components/PageHeader'
import { SelectField } from '../../components/SelectField'
import { TextField } from '../../components/TextField'
import {
  accountingExportUrl,
  accountingPrintUrl,
  accountSheetPath,
  fetchFiscalYears,
  fiscalYearsKey,
  type AccountingReport,
} from '../../lib/accounting'
import { api } from '../../lib/api'
import { downloadFile } from '../../lib/files'
import { formatAmount, formatDate, toIsoDate } from '../../lib/format'
import { originState } from '../../lib/origin'
import { printFile } from '../../lib/print'
import type { FiscalYear, Statement, StatementRow } from '../../lib/types'
import {
  columnDateOf,
  indentOf,
  isStrongRow,
  labelOf,
  shownRows,
} from './statementRows'

/**
 * The shared body of the balance sheet and the income statement.
 *
 * <p>They are the same screen twice: one query, one table, one footer. What differs is the title,
 * the report they fetch and one line at the end — so a second component would be the same three
 * hundred lines with two words changed, and the day one grew a column the other would not have it.
 *
 * <p><b>One `DataTable` with an indent column, and no tree.</b> Two levels plus the account detail
 * are an indent, not a tree; a `TreeTable` would be a new building block for a table that never
 * folds.
 *
 * <p><b>Both switches are local.</b> The answer always carries every position and every account
 * line, so switching «Konten zeigen» costs nothing and recomputes no aggregation. They are not
 * remembered between visits either: two people printing from the same link would otherwise get
 * two different pages.
 *
 * <p>Reads while the module is off — what is posted stays readable for ten years (OR Art. 958f).
 */
export function StatementView({
  tenantId,
  report,
  title,
  subtitle,
  fetchStatement,
  keyOf,
}: {
  tenantId: number
  /** Which printable page «Drucken» asks for. */
  report: Extract<AccountingReport, 'balance-sheet' | 'income-statement'>
  title: string
  subtitle: string
  fetchStatement: (fiscalYearId: number, asOf?: string) => Promise<Statement>
  keyOf: (fiscalYearId: number, asOf?: string) => readonly unknown[]
}) {
  const [fiscalYearId, setFiscalYearId] = useState<number | null>(null)
  const [asOf, setAsOf] = useState('')
  // On by default: a report showing forty positions at nil is one nobody reads to the end.
  const [hideEmpty, setHideEmpty] = useState(true)
  const [withAccounts, setWithAccounts] = useState(false)

  const years = useQuery({
    queryKey: fiscalYearsKey(tenantId),
    queryFn: () => fetchFiscalYears(tenantId),
  })
  const available = years.data?.years ?? []
  // The year is compulsory at the endpoint — it answers 400 without one — so the screen picks
  // before it may ask: the year today falls into, and the latest one otherwise.
  const chosen = fiscalYearId ?? defaultYearOf(available)?.id ?? null
  const cutOff = asOf === '' ? undefined : asOf

  const statement = useQuery({
    queryKey: keyOf(chosen ?? 0, cutOff),
    queryFn: () => fetchStatement(chosen as number, cutOff),
    enabled: chosen !== null,
    placeholderData: keepPreviousData,
  })

  const data = statement.data
  const rows = shownRows(data?.rows ?? [], hideEmpty, withAccounts)
  const columns = statementColumns(data)

  return (
    <>
      <PageHeader title={title} subtitle={subtitle}>
        <Button
          variant="secondary"
          disabled={chosen === null}
          // The whole year's archive, and deliberately not a single bilanz.csv: a second way to
          // the same figures would be a second file name and a second header line that can drift
          // apart, and OR Art. 958f wants the year in one file rather than five loose sheets.
          title="Lädt das Archiv-ZIP dieses Geschäftsjahres mit allen fünf Dateien"
          onClick={() => void downloadArchive(tenantId, chosen as number)}
        >
          Als CSV
        </Button>
        <Button
          variant="secondary"
          disabled={chosen === null}
          onClick={() =>
            void printStatement(tenantId, report, chosen as number, {
              asOf: cutOff,
              hideEmpty,
              withAccounts,
            })
          }
        >
          Drucken
        </Button>
      </PageHeader>

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
            className="w-[160px]"
          />
          <CheckboxField
            label="Positionen ohne Werte ausblenden (auch im Vorjahr)"
            checked={hideEmpty}
            onChange={(event) => setHideEmpty(event.target.checked)}
          />
          <CheckboxField
            label="Konten zeigen"
            checked={withAccounts}
            onChange={(event) => setWithAccounts(event.target.checked)}
          />
        </div>

        {statement.error !== null && statement.error !== undefined && (
          <ErrorNotice error={statement.error} />
        )}

        {/* Worded in the backend, so the screen and the printout say the same sentence — a note
            only the browser knew would be missing from the paper (GeBüV Art. 6 Abs. 3). */}
        {data?.notes
          .filter((note) => note.kind === 'DRAFTS' || note.kind === 'MODULE_OFF_PERIOD')
          .map((note) => (
            <WarningNotice key={note.kind + note.text}>{note.text}</WarningNotice>
          ))}

        {available.length === 0 && !years.isLoading ? (
          <EmptyState title="Noch kein Geschäftsjahr">
            Ohne Geschäftsjahr gibt es nichts auszuwerten. Legen Sie eines unter
            Buchhaltung → Geschäftsjahre an.
          </EmptyState>
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            keyOf={(row) => rowKeyOf(row)}
            loading={statement.isLoading}
            // Into the account sheet, and the way back comes with it. Only an account line leads
            // anywhere: a position is no record and has no screen of its own.
            rowTo={(row) => accountPathOf(row)}
            rowState={originState(
              report === 'balance-sheet' ? '/buchhaltung/bilanz' : '/buchhaltung/erfolgsrechnung',
              title,
            )}
            error={years.error ?? undefined}
            empty="Für dieses Geschäftsjahr ist noch nichts verbucht."
          />
        )}

        {/* The two standing notes belong under the figures rather than over them: they are about
            what the reader is holding, not about what is missing from it. */}
        <div className="grid gap-1 text-[12px] text-text-secondary">
          <p>«Als CSV» lädt das Archiv-ZIP dieses Geschäftsjahres mit allen fünf Dateien.</p>
          {data?.notes
            .filter((note) => note.kind !== 'DRAFTS' && note.kind !== 'MODULE_OFF_PERIOD')
            .map((note) => (
              <p key={note.kind + note.text}>{note.text}</p>
            ))}
        </div>
      </div>
    </>
  )
}

/** The three columns: the indented label, this year, and the whole year before. */
function statementColumns(statement: Statement | undefined): Column<StatementRow>[] {
  const current = statement === undefined ? '' : formatDate(columnDateOf(statement))
  // The prior column is headed with the name of that year and never with a date: it always
  // shows the year <b>whole</b>, even where the current one is cut to a day, and a date beside
  // a cut-off date would read as the same kind of figure (OR Art. 958d Abs. 2).
  const prior = statement?.priorFiscalYearLabel ?? 'Vorjahr'
  return [
    {
      key: 'label',
      header: '',
      render: (row) => (
        <span
          className={isStrongRow(row) ? 'font-medium' : undefined}
          style={{ paddingLeft: `${indentOf(row)}px` }}
        >
          {/* The addition the law gives the position is already in its own wording, so it is
              not appended a second time; the flag is what a screen reader and a future column
              would key off. */}
          {labelOf(row)}
        </span>
      ),
    },
    {
      key: 'amount',
      header: current,
      align: 'right',
      width: 'w-[160px]',
      render: (row) => (
        <AmountCell row={row} amount={row.amount} balanced={statement?.control?.balanced} />
      ),
    },
    {
      key: 'priorAmount',
      header: prior,
      align: 'right',
      width: 'w-[160px]',
      render: (row) => <AmountCell row={row} amount={row.priorAmount} />,
    },
  ]
}

/**
 * One figure, or nothing at all on a heading and in a prior column that has no year behind it.
 *
 * <p>The proof is coloured where it does not come out at nil. It is a row of the table like any
 * other — the answer carries it once, and drawing it a second time in a footer would have the
 * screen show two proofs where the printout and the CSV show one.
 */
function AmountCell({
  row,
  amount,
  balanced,
}: {
  row: StatementRow
  amount?: number | null
  balanced?: boolean
}) {
  if (amount === null || amount === undefined) return null
  const wrong = row.kind === 'CONTROL' && balanced === false
  return (
    <span
      className={`tabular-nums${isStrongRow(row) ? ' font-medium' : ''}${wrong ? ' text-danger' : ''}`}
    >
      {formatAmount(amount)}
    </span>
  )
}

/**
 * A key that is stable across a redraw and unique within one report.
 *
 * <p>The position alone will not do: a gross position carries three lines under the same one,
 * and the two halves would collide.
 */
function rowKeyOf(row: StatementRow): string {
  return `${row.kind}-${row.level}-${row.position ?? ''}-${row.accountNumber ?? ''}-${row.label}`
}

/**
 * Only an account line leads anywhere; a position is no record and has no screen of its own.
 *
 * <p>The account sheet is opened by id, and the id rides on the row purely as the way to that
 * screen — the figures themselves are grouped over the frozen columns of the booking line and
 * never over the chart. The synthetic line «Saldo der Erfolgsrechnung» has no account and
 * therefore no way in.
 */
function accountPathOf(row: StatementRow): string | undefined {
  if (row.kind !== 'ACCOUNT' || row.accountId === null || row.accountId === undefined) {
    return undefined
  }
  return accountSheetPath(row.accountId)
}

/** The year today falls into, and the latest one where today falls into none. */
function defaultYearOf(years: readonly FiscalYear[]): FiscalYear | undefined {
  const today = toIsoDate()
  const running = years.find((year) => year.startDate <= today && today <= year.endDate)
  if (running !== undefined) return running
  return [...years].sort((one, other) => one.endDate.localeCompare(other.endDate)).at(-1)
}

/**
 * Fetches the archive of the year and hands it to the download folder.
 *
 * <p>Through the API client rather than a plain link, so an expired session leads to the login
 * screen instead of a bare 401 in a new tab.
 */
async function downloadArchive(tenantId: number, fiscalYearId: number) {
  downloadFile(await api.file(accountingExportUrl(tenantId, fiscalYearId)))
}

/**
 * Fetches the printable page and opens the print dialog on it.
 *
 * <p>The two switches travel with the link, so the paper shows what the screen showed.
 */
async function printStatement(
  tenantId: number,
  report: AccountingReport,
  fiscalYearId: number,
  options: { asOf?: string; hideEmpty: boolean; withAccounts: boolean },
) {
  printFile(await api.file(accountingPrintUrl(tenantId, report, fiscalYearId, options)))
}
