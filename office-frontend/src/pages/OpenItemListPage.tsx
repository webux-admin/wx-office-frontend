import { useState } from 'react'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { CheckboxField } from '../components/CheckboxField'
import { DataTable, type Column } from '../components/DataTable'
import { EmptyState } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { QuickSearchField } from '../components/QuickSearch'
import { TextField } from '../components/TextField'
import { useQuickSearch } from '../components/useQuickSearch'
import { useAuth } from '../auth/useAuth'
import { RequireTenant } from '../layout/RequireTenant'
import { formatAmount, formatDate } from '../lib/format'
import {
  OPEN_ITEM_RIGHTS,
  fetchOpenItems,
  openItemQuery,
  openItemsKey,
} from '../lib/openItem'
import { emptyPage, PAGE_SIZE } from '../lib/paging'
import { openState } from '../lib/receivable'
import { receivableKey, salesDocumentListKey, salesDocumentFor } from '../lib/salesDocument'
import type { OpenItem, Partner } from '../lib/types'
import { PartnerQuickSearch } from './document/PartnerQuickSearch'
import { WriteOffDialog } from './openitem/WriteOffDialog'

/**
 * What every customer of the tenant still owes, in one list.
 *
 * <p>Its own screen and not a filter on the invoice list, for the reason the endpoint gives
 * itself: the invoice list answers «was haben wir geschrieben», this one «was ist noch offen»
 * — and it shows amounts the invoice list has no column for.
 *
 * <p><b>A negative open amount is a credit, not a defect.</b> An overpayment is allowed on
 * purpose, and «-0.20 offen» would read as a debt of minus twenty rappen (backend ADR-0091).
 */
export function OpenItemListPage() {
  return (
    <RequireTenant permission={OPEN_ITEM_RIGHTS.read}>
      {(tenantId) => <OpenItems tenantId={tenantId} />}
    </RequireTenant>
  )
}

function OpenItems({ tenantId }: { tenantId: number }) {
  const { can } = useAuth()
  const queryClient = useQueryClient()
  const mayWriteOff = can(OPEN_ITEM_RIGHTS.writeOff)
  const invoiceKind = salesDocumentFor('INVOICE')

  const search = useQuickSearch()
  const [partner, setPartner] = useState<Partner | undefined>(undefined)
  const [partnerTerm, setPartnerTerm] = useState('')
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [includeSettled, setIncludeSettled] = useState(false)
  const [dueFrom, setDueFrom] = useState('')
  const [dueTo, setDueTo] = useState('')
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState('dueDate,asc')
  const [writingOff, setWritingOff] = useState<OpenItem | null>(null)

  const query = openItemQuery({
    partnerId: partner?.id,
    overdueOnly,
    includeSettled,
    dueFrom: dueFrom === '' ? undefined : dueFrom,
    dueTo: dueTo === '' ? undefined : dueTo,
    documentNumber: search.term,
    page,
    size: PAGE_SIZE,
    sort,
  })

  const items = useQuery({
    queryKey: openItemsKey(tenantId, query),
    queryFn: () => fetchOpenItems(tenantId, query),
    // The page found last stays on screen while the next answer is on its way, so the table
    // does not flicker between two pages of the same list.
    placeholderData: keepPreviousData,
  })

  const shown = items.data ?? emptyPage<OpenItem>()

  /**
   * After a write-off three lists are stale at once: this one, the invoice list with its
   * «Offen» column, and the settlement register of the Rechnung itself.
   */
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: openItemsKey(tenantId) })
    if (invoiceKind) {
      void queryClient.invalidateQueries({
        queryKey: salesDocumentListKey(invoiceKind, tenantId),
      })
      void queryClient.invalidateQueries({ queryKey: receivableKey(invoiceKind, tenantId) })
    }
  }

  const narrow = (run: () => void) => {
    run()
    setPage(0)
  }

  const columns: Column<OpenItem>[] = [
    {
      key: 'partner',
      header: 'Kunde',
      sortKey: 'partnerName',
      render: (row) => (
        <span className="grid">
          <span>{row.partnerName ?? '–'}</span>
          {row.partnerNumber !== undefined && (
            <span className="text-[12px] text-text-tertiary">{row.partnerNumber}</span>
          )}
        </span>
      ),
    },
    {
      key: 'number',
      header: 'Nummer',
      sortKey: 'documentNumber',
      render: (row) => row.documentNumber ?? '–',
    },
    {
      key: 'documentDate',
      header: 'Belegdatum',
      sortKey: 'documentDate',
      hideBelow: 'sm',
      render: (row) => formatDate(row.documentDate),
    },
    {
      key: 'dueDate',
      header: 'Fällig',
      sortKey: 'dueDate',
      render: (row) => (
        <span className="flex items-center gap-2">
          {formatDate(row.dueDate)}
          {row.overdue && <Badge tone="danger">{row.daysOverdue} Tage</Badge>}
        </span>
      ),
    },
    {
      key: 'currency',
      header: 'Währung',
      hideBelow: 'sm',
      render: (row) => row.currency,
    },
    {
      key: 'totalGross',
      header: 'Brutto',
      align: 'right',
      hideBelow: 'sm',
      render: (row) => formatAmount(row.totalGross),
    },
    {
      key: 'settled',
      header: 'Ausgeglichen',
      align: 'right',
      hideBelow: 'sm',
      render: (row) => formatAmount(row.settled),
    },
    {
      key: 'open',
      header: 'Offen',
      align: 'right',
      sortKey: 'openAmount',
      render: (row) => <OpenCell row={row} />,
    },
  ]

  if (mayWriteOff) {
    columns.push({
      key: 'actions',
      header: '',
      align: 'right',
      width: 'w-[110px]',
      render: (row) =>
        openState(row.open) === 'open' ? (
          <Button variant="ghost" onClick={() => setWritingOff(row)}>
            Ausbuchen
          </Button>
        ) : null,
    })
  }

  return (
    <>
      <PageHeader
        title="Offene Posten"
        subtitle="Was Kunden noch schulden. Jede Zahl wird gerechnet, keine ist gespeichert."
      >
      </PageHeader>

      <div className="grid gap-4 px-8 pb-12">
        <Panel padded={false} title="Rechnungen">
          <div className="flex flex-wrap items-end gap-4 px-5 pb-4">
            <span className="w-full max-w-[260px]">
              <PartnerQuickSearch
                tenantId={tenantId}
                term={partnerTerm}
                onTerm={(next) => {
                  setPartnerTerm(next)
                  if (next === '') narrow(() => setPartner(undefined))
                }}
                chosen={partner !== undefined}
                onChoose={(chosen) => narrow(() => setPartner(chosen))}
              />
            </span>
            <QuickSearchField
              value={search.value}
              onChange={(next) => {
                search.setValue(next)
                setPage(0)
              }}
              placeholder="Rechnungsnummer"
            />
            <TextField
              label="Fällig ab"
              type="date"
              value={dueFrom}
              onChange={(event) => narrow(() => setDueFrom(event.target.value))}
            />
            <TextField
              label="Fällig bis"
              type="date"
              value={dueTo}
              onChange={(event) => narrow(() => setDueTo(event.target.value))}
            />
            <CheckboxField
              label="Nur überfällige"
              checked={overdueOnly}
              onChange={(event) => narrow(() => setOverdueOnly(event.target.checked))}
            />
            <CheckboxField
              label="Ausgeglichene mitzeigen"
              checked={includeSettled}
              onChange={(event) => narrow(() => setIncludeSettled(event.target.checked))}
            />
          </div>

          <DataTable
            columns={columns}
            rows={shown.content}
            keyOf={(row) => row.documentId}
            loading={items.isPending}
            error={items.error}
            empty={
              <EmptyState
                title="Nichts offen"
                description="Keine Rechnung des Mandanten schuldet noch etwas — oder die Filter sind zu eng."
              />
            }
            rowTo={
              invoiceKind ? (row) => `${invoiceKind.path}/${row.documentId}` : undefined
            }
            page={shown}
            onPageChange={setPage}
            sort={sort}
            onSortChange={(next) => {
              setSort(next)
              setPage(0)
            }}
          />
        </Panel>

        {!mayWriteOff && (
          <p className="text-[13px] text-text-secondary">
            Zum Ausbuchen fehlt das Recht «Forderung ausbuchen».
          </p>
        )}
      </div>

      {writingOff !== null && (
        <WriteOffDialog
          open
          tenantId={tenantId}
          documentId={writingOff.documentId}
          documentNumber={writingOff.documentNumber}
          currency={writingOff.currency}
          openAmount={writingOff.open}
          onClose={() => setWritingOff(null)}
          onWritten={refresh}
        />
      )}
    </>
  )
}

/**
 * What one Rechnung still owes.
 *
 * <p>Three answers and not one number, exactly as the invoice list gives them: an overdue
 * debt is what the reader is looking for, a settled Rechnung should stop drawing the eye, and
 * a negative amount is a credit the customer is owed.
 */
function OpenCell({ row }: { row: OpenItem }) {
  const state = openState(row.open)
  if (state === 'settled') return <Badge tone="success">bezahlt</Badge>
  if (state === 'credit') {
    return (
      <span className="text-text-secondary">
        {formatAmount(-row.open)} <span className="text-text-tertiary">Guthaben</span>
      </span>
    )
  }
  return (
    <span className={row.overdue ? 'font-medium text-danger' : 'font-medium'}>
      {formatAmount(row.open)}
    </span>
  )
}
