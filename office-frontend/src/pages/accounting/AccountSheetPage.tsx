import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useLocation, useParams } from 'react-router-dom'
import { Button } from '../../components/Button'
import { DataTable, type Column } from '../../components/DataTable'
import { LoadingBlock } from '../../components/Notice'
import { PageHeader } from '../../components/PageHeader'
import { RequireTenant } from '../../layout/RequireTenant'
import { api } from '../../lib/api'
import {
  ACCOUNTING_MODULE,
  ACCOUNTING_RIGHTS,
  ACCOUNT_BALANCE_PATH,
  JOURNAL_PATH,
  accountSheetKey,
  accountSheetPath,
  accountingPrintUrl,
  fetchAccountSheet,
} from '../../lib/accounting'
import { printFile } from '../../lib/print'
import { formatAmount, formatDate } from '../../lib/format'
import { originOf, originState } from '../../lib/origin'
import { listQuery, PAGE_SIZE } from '../../lib/paging'
import type { AccountSheetLine } from '../../lib/types'
import { AccountingNotices } from './AccountingNotices'

/**
 * One account read the other way round from the journal: everything that happened on it, with a
 * running balance.
 *
 * <p>A drill-down target with no menu entry of its own — it is reached from «Konten» and leads on
 * into the journal, with the entry of the row opened there.
 *
 * <p><b>It is not sortable, and that is not an omission.</b> The order is booking date, journal
 * number, line number, and the running balance is a number only in it; in any other it is a
 * figure that still looks plausible, which is the worst kind of wrong one. The trial balance
 * beside it sorts freely, because no row there carries a result of the row above it.
 */
export function AccountSheetPage() {
  const { accountId } = useParams()
  return (
    <RequireTenant permission={ACCOUNTING_RIGHTS.read} module={ACCOUNTING_MODULE}>
      {(tenantId) => <Sheet tenantId={tenantId} accountId={Number(accountId)} />}
    </RequireTenant>
  )
}

function Sheet({ tenantId, accountId }: { tenantId: number; accountId: number }) {
  const location = useLocation()
  const [page, setPage] = useState(0)
  const [searchParams] = useState(() => new URLSearchParams(location.search))
  const fiscalYearId = searchParams.get('fiscalYearId')
  const asOf = searchParams.get('asOf') ?? ''

  const query = listQuery({ fiscalYearId, asOf, page, size: PAGE_SIZE })
  const sheet = useQuery({
    queryKey: accountSheetKey(tenantId, accountId, query),
    queryFn: () => fetchAccountSheet(tenantId, accountId, query),
    enabled: fiscalYearId !== null,
    placeholderData: keepPreviousData,
  })

  const columns: Column<AccountSheetLine>[] = [
    {
      key: 'bookingDate',
      header: 'Datum',
      width: 'w-[110px]',
      render: (line) => <span className="tabular-nums">{formatDate(line.bookingDate)}</span>,
    },
    {
      key: 'entryNumber',
      header: 'Journal-Nr.',
      width: 'w-[150px]',
      render: (line) => <span className="font-mono text-[12px]">{line.entryNumber}</span>,
    },
    {
      key: 'documentReference',
      header: 'Beleg',
      width: 'w-[120px]',
      hideBelow: 'sm',
      render: (line) => (
        <span className="font-mono text-[12px] text-text-tertiary">
          {line.documentReference ?? ''}
        </span>
      ),
    },
    { key: 'text', header: 'Text', render: (line) => line.text ?? '' },
    {
      key: 'contraAccount',
      header: 'Gegenkonto',
      width: 'w-[120px]',
      hideBelow: 'sm',
      // «(mehrere)» where the entry has more than two lines — a booking with a generated tax
      // line really has no single other side, and naming a «main» one would be a claim.
      render: (line) => <span className="font-mono text-[12px]">{line.contraAccount}</span>,
    },
    {
      key: 'debit',
      header: 'Soll',
      align: 'right',
      width: 'w-[130px]',
      render: (line) => (
        <span className="tabular-nums">
          {line.debit === 0 ? '' : formatAmount(line.debit)}
        </span>
      ),
    },
    {
      key: 'credit',
      header: 'Haben',
      align: 'right',
      width: 'w-[130px]',
      render: (line) => (
        <span className="tabular-nums">
          {line.credit === 0 ? '' : formatAmount(line.credit)}
        </span>
      ),
    },
    {
      key: 'runningBalance',
      header: 'Saldo',
      align: 'right',
      width: 'w-[140px]',
      render: (line) => (
        <span className="tabular-nums">{formatAmount(line.runningBalance)}</span>
      ),
    },
  ]

  if (sheet.isLoading || sheet.data === undefined) return <LoadingBlock />

  const head = sheet.data
  const year = fiscalYearId ?? ''

  return (
    <>
      <PageHeader
        title={`${head.accountNumber} ${head.accountName}`}
        subtitle={`${head.accountType} · ${head.orPosition} · Saldo ${formatAmount(head.closingBalance)}`}
        // Back to where it was opened from, and to «Konten» only where nothing said otherwise.
        back={backTo(originOf(location.state, { from: ACCOUNT_BALANCE_PATH, label: 'Konten' }))}
      >
        <Button
          variant="secondary"
          onClick={() =>
            void printSheet(tenantId, Number(year), accountId)
          }
        >
          Drucken
        </Button>
      </PageHeader>

      <div className="grid gap-4 px-8 pb-12">
        <AccountingNotices notices={head.notices} />

        <DataTable
          columns={columns}
          rows={head.lines.content}
          keyOf={(line) => `${line.entryId}-${line.entryNumber}-${line.runningBalance}`}
          page={head.lines}
          onPageChange={setPage}
          // Into the journal with this very entry opened. There is no screen of its own for one
          // booking: a second mask for the same entry would be a second truth about it.
          rowTo={(line) => `${JOURNAL_PATH}?fiscalYearId=${year}&entryId=${line.entryId}`}
          rowState={originState(
            `${accountSheetPath(accountId)}?fiscalYearId=${year}`,
            `Kontoblatt ${head.accountNumber}`,
          )}
          empty="Auf diesem Konto steht in diesem Geschäftsjahr nichts."
          footer={
            <tr>
              <td className="px-3 py-2 text-[13px] font-medium" colSpan={5}>
                Saldovortrag {formatAmount(head.openingBalance)}
              </td>
              <td className="px-3 py-2 text-right text-[13px] font-medium tabular-nums">
                {formatAmount(head.debitTotal)}
              </td>
              <td className="px-3 py-2 text-right text-[13px] font-medium tabular-nums">
                {formatAmount(head.creditTotal)}
              </td>
              <td className="px-3 py-2 text-right text-[13px] font-medium tabular-nums">
                {formatAmount(head.closingBalance)}
              </td>
            </tr>
          }
        />
      </div>
    </>
  )
}

/**
 * Prints this one account sheet.
 *
 * <p>Through the API client and a blob, never a frame pointed straight at the address: an
 * iframe on the endpoint would stay empty — Spring Security forbids framing by default — and the
 * handling of an expired session, which lives in one place in `api.ts`, would be lost with it.
 */
async function printSheet(tenantId: number, fiscalYearId: number, accountId: number) {
  const file = await api.file(
    accountingPrintUrl(tenantId, 'account-sheets', fiscalYearId, { accountId }),
  )
  printFile(file)
}

/**
 * The way back, in the shape the header takes.
 *
 * <p>`Origin` calls the address `from`, the header calls it `to`. One rename in one place rather
 * than a second shape for the same two strings.
 */
function backTo(origin: { from: string; label: string }): { to: string; label: string } {
  return { to: origin.from, label: origin.label }
}
