import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { CheckboxField } from '../../components/CheckboxField'
import { DataTable, type Column } from '../../components/DataTable'
import { EmptyState } from '../../components/Notice'
import { PageHeader } from '../../components/PageHeader'
import { QuickSearchField } from '../../components/QuickSearch'
import { SelectField } from '../../components/SelectField'
import { TextField } from '../../components/TextField'
import { useQuickSearch } from '../../components/useQuickSearch'
import { RequireTenant } from '../../layout/RequireTenant'
import {
  ACCOUNTING_MODULE,
  ACCOUNTING_RIGHTS,
  ACCOUNT_BALANCE_PATH,
  accountSheetPath,
  fetchFiscalYears,
  fetchTrialBalance,
  fiscalYearsKey,
  trialBalanceKey,
} from '../../lib/accounting'
import { formatAmount, toIsoDate } from '../../lib/format'
import { originState } from '../../lib/origin'
import { listQuery, PAGE_SIZE } from '../../lib/paging'
import type { FiscalYear, TrialBalanceRow } from '../../lib/types'
import { AccountingNotices } from './AccountingNotices'

/**
 * «Konten»: every account of the chart with its two sums, and the proof underneath.
 *
 * <p>The journal is the chronological view of the books (GeBüV Art. 1 Abs. 2 Bst. b); this is the
 * one by subject, and the two together are what the law calls the general ledger.
 *
 * <p>Reads while the module is off — what is posted stays readable for ten years (OR Art. 958f).
 *
 * <p><b>Every account, including the ones nobody booked on.</b> A fiduciary who misses an account
 * wants to see it standing there and empty. The switch takes them away; the proof underneath does
 * not change when it does, because it always counts every account.
 */
export function AccountBalanceListPage() {
  return (
    <RequireTenant permission={ACCOUNTING_RIGHTS.read} module={ACCOUNTING_MODULE}>
      {(tenantId) => <Balances tenantId={tenantId} />}
    </RequireTenant>
  )
}

function Balances({ tenantId }: { tenantId: number }) {
  const search = useQuickSearch()
  const [fiscalYearId, setFiscalYearId] = useState<number | null>(null)
  const [asOf, setAsOf] = useState('')
  const [withMovementOnly, setWithMovementOnly] = useState(false)
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState('accountNumber,asc')

  const years = useQuery({
    queryKey: fiscalYearsKey(tenantId),
    queryFn: () => fetchFiscalYears(tenantId),
  })
  const available = years.data?.years ?? []
  // The year is compulsory at the endpoint, so the screen has to choose one before it may ask at
  // all: the one today falls into, and the latest one otherwise.
  const chosen = fiscalYearId ?? defaultYearOf(available)?.id ?? null

  const query = listQuery({
    fiscalYearId: chosen,
    asOf,
    withMovementOnly: withMovementOnly ? 'true' : '',
    q: search.term,
    page,
    size: PAGE_SIZE,
    sort,
  })
  const balance = useQuery({
    queryKey: trialBalanceKey(tenantId, query),
    queryFn: () => fetchTrialBalance(tenantId, query),
    enabled: chosen !== null,
    placeholderData: keepPreviousData,
  })

  const columns: Column<TrialBalanceRow>[] = [
    {
      key: 'accountNumber',
      header: 'Konto',
      sortKey: 'accountNumber',
      width: 'w-[110px]',
      render: (row) => <span className="font-mono text-[12px]">{row.accountNumber}</span>,
    },
    {
      key: 'accountName',
      header: 'Bezeichnung',
      sortKey: 'accountName',
      render: (row) => row.accountName,
    },
    {
      key: 'debitTotal',
      header: 'Soll',
      sortKey: 'debitTotal',
      align: 'right',
      width: 'w-[140px]',
      render: (row) => <span className="tabular-nums">{formatAmount(row.debitTotal)}</span>,
    },
    {
      key: 'creditTotal',
      header: 'Haben',
      sortKey: 'creditTotal',
      align: 'right',
      width: 'w-[140px]',
      render: (row) => <span className="tabular-nums">{formatAmount(row.creditTotal)}</span>,
    },
    {
      key: 'balance',
      header: 'Saldo',
      sortKey: 'balance',
      align: 'right',
      width: 'w-[140px]',
      // Debit minus credit, never turned round by account type: a liability account stands
      // negative here, and the account sheet behind the row works out the same difference.
      render: (row) => <span className="tabular-nums">{formatAmount(row.balance)}</span>,
    },
  ]

  const control = balance.data?.control
  const difference = control?.difference ?? 0
  const notBalanced = difference !== 0

  return (
    <>
      <PageHeader
        title="Konten"
        subtitle="Was auf jedem Konto steht, und die Probe darunter: Soll gleich Haben."
      />

      <div className="grid gap-4 px-8 pb-12">
        <div className="flex flex-wrap items-end gap-4">
          <SelectField
            label="Geschäftsjahr"
            value={chosen === null ? '' : String(chosen)}
            onChange={(event) => {
              setFiscalYearId(event.target.value === '' ? null : Number(event.target.value))
              setPage(0)
            }}
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
            onChange={(event) => {
              setAsOf(event.target.value)
              setPage(0)
            }}
            className="w-[160px]"
          />
          <QuickSearchField
            label="Suchen"
            placeholder="Nummer oder Bezeichnung"
            value={search.value}
            onChange={(next) => {
              search.setValue(next)
              setPage(0)
            }}
          />
          <CheckboxField
            label="Nur Konten mit Bewegung"
            checked={withMovementOnly}
            onChange={(event) => {
              setWithMovementOnly(event.target.checked)
              setPage(0)
            }}
          />
        </div>

        {balance.data && <AccountingNotices notices={balance.data.notices} />}

        {available.length === 0 ? (
          <EmptyState title="Noch kein Geschäftsjahr">
            Ohne Geschäftsjahr gibt es nichts auszuwerten. Legen Sie eines unter
            Moduleinstellungen → Buchhaltung → Geschäftsjahre an.
          </EmptyState>
        ) : (
          <DataTable
            columns={columns}
            rows={balance.data?.accounts.content ?? []}
            keyOf={(row) => row.accountId}
            loading={balance.isLoading}
            page={balance.data?.accounts}
            onPageChange={setPage}
            sort={sort}
            onSortChange={(next) => {
              setSort(next)
              setPage(0)
            }}
            // Into the account sheet, and the way back comes with it: whoever saves or goes back
            // there lands here again and not on a default list (ADR-0003).
            rowTo={(row) => accountSheetPath(row.accountId)}
            rowState={originState(ACCOUNT_BALANCE_PATH, 'Konten')}
            empty="Kein Konto passt zu dieser Suche."
            footer={
              control && (
                <tr>
                  <td className="px-3 py-2 text-[13px] font-medium" colSpan={2}>
                    Total über {control.accountCount} Konten
                  </td>
                  <td className="px-3 py-2 text-right text-[13px] font-medium tabular-nums">
                    {formatAmount(control.debitTotal)}
                  </td>
                  <td className="px-3 py-2 text-right text-[13px] font-medium tabular-nums">
                    {formatAmount(control.creditTotal)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right text-[13px] font-medium tabular-nums${
                      notBalanced ? ' text-danger' : ''
                    }`}
                  >
                    {formatAmount(difference)}
                  </td>
                </tr>
              )
            }
          />
        )}

        {/* The balance is a deferred constraint trigger in the database, so a difference here
            cannot have been caused by a posting of this application. It means somebody wrote
            past it — which is a sentence about the installation and not about the bookkeeping. */}
        {notBalanced && (
          <p className="text-[13px] text-danger">
            Soll und Haben stimmen nicht überein. Das kann keine Buchung dieser Anwendung
            verursacht haben — melden Sie die Zahl Ihrer Systembetreuung und prüfen Sie unter
            Buchhaltung → Archiv die Integrität.
          </p>
        )}
      </div>
    </>
  )
}

/** The year today falls into, and the latest one where today falls into none. */
function defaultYearOf(years: readonly FiscalYear[]): FiscalYear | undefined {
  const today = toIsoDate()
  const running = years.find((year) => year.startDate <= today && today <= year.endDate)
  if (running !== undefined) return running
  return [...years].sort((one, other) => one.endDate.localeCompare(other.endDate)).at(-1)
}
