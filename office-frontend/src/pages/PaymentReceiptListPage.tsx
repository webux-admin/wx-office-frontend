import { useState } from 'react'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { DataTable, type Column } from '../components/DataTable'
import { EmptyState } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { QuickSearchField } from '../components/QuickSearch'
import { SelectField } from '../components/SelectField'
import { TextField } from '../components/TextField'
import { useQuickSearch } from '../components/useQuickSearch'
import { useAuth } from '../auth/useAuth'
import { RequireTenant } from '../layout/RequireTenant'
import { formatAmount, formatDate } from '../lib/format'
import { openItemsKey } from '../lib/openItem'
import { emptyPage, PAGE_SIZE } from '../lib/paging'
import {
  PAYMENT_RECEIPT_RIGHTS,
  RECEIPT_STATES,
  RECEIPT_STATE_ORDER,
  fetchPaymentReceipt,
  fetchPaymentReceipts,
  paymentReceiptQuery,
  paymentReceiptsKey,
} from '../lib/paymentReceipt'
import { receivableKey, salesDocumentListKey, salesDocumentFor } from '../lib/salesDocument'
import type { Partner, PaymentReceipt, ReceiptState } from '../lib/types'
import { PartnerQuickSearch } from './document/PartnerQuickSearch'
import { PaymentReceiptDialog } from './payment/PaymentReceiptDialog'

/**
 * What came in, before it belongs to any Rechnung.
 *
 * <p>Its own screen and not a register of the Rechnung, because the money arrives before the
 * Rechnung is known: a bank credit whose reference nobody could read has to be visible
 * somewhere without quietly reducing anybody's debt (backend ADR-0103).
 *
 * <p><b>The register «Zahlungen» at the Rechnung stays.</b> It is the way for the single case
 * — one Rechnung is open and a payment comes in for it. This screen is the way for the bank
 * statement — money arrives, and what it belongs to turns out afterwards. Both call the same
 * endpoints (ADR-0037).
 */
export function PaymentReceiptListPage() {
  return (
    <RequireTenant permission={PAYMENT_RECEIPT_RIGHTS.read}>
      {(tenantId) => <PaymentReceipts tenantId={tenantId} />}
    </RequireTenant>
  )
}

function PaymentReceipts({ tenantId }: { tenantId: number }) {
  const { can } = useAuth()
  const queryClient = useQueryClient()
  const mayRecord = can(PAYMENT_RECEIPT_RIGHTS.record)
  const invoiceKind = salesDocumentFor('INVOICE')

  const search = useQuickSearch()
  const [partner, setPartner] = useState<Partner | undefined>(undefined)
  const [partnerTerm, setPartnerTerm] = useState('')
  const [state, setState] = useState<'' | ReceiptState>('')
  const [valueFrom, setValueFrom] = useState('')
  const [valueTo, setValueTo] = useState('')
  const [page, setPage] = useState(0)
  const [recording, setRecording] = useState(false)
  const [opened, setOpened] = useState<number | null>(null)

  const query = paymentReceiptQuery({
    partnerId: partner?.id,
    valueFrom: valueFrom === '' ? undefined : valueFrom,
    valueTo: valueTo === '' ? undefined : valueTo,
    state: state === '' ? undefined : state,
    search: search.term,
    page,
    size: PAGE_SIZE,
  })

  const receipts = useQuery({
    queryKey: paymentReceiptsKey(tenantId, query),
    queryFn: () => fetchPaymentReceipts(tenantId, query),
    // The page found last stays on screen while the next answer is on its way, so the table
    // does not flicker between two pages of the same list.
    placeholderData: keepPreviousData,
  })

  // Fetched on its own rather than taken out of the list: the list answers «was kam herein»
  // and carries no assignments, and those are exactly what the single receipt is opened for.
  const single = useQuery({
    queryKey: [...paymentReceiptsKey(tenantId), 'one', opened],
    queryFn: () => fetchPaymentReceipt(tenantId, opened ?? 0),
    enabled: opened !== null,
  })

  const shown = receipts.data ?? emptyPage<PaymentReceipt>()

  /**
   * After an assignment three lists are stale at once: this one, the open items, and the
   * invoice list with its «Offen» column.
   */
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: paymentReceiptsKey(tenantId) })
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

  const columns: Column<PaymentReceipt>[] = [
    {
      key: 'valueDate',
      header: 'Valuta',
      render: (row) => formatDate(row.valueDate),
    },
    {
      key: 'payer',
      header: 'Zahler',
      render: (row) => (
        <span className="grid">
          <span>{row.payerName ?? 'nicht zugeordnet'}</span>
          {row.partnerNumber !== undefined && (
            <span className="text-[12px] text-text-tertiary">{row.partnerNumber}</span>
          )}
        </span>
      ),
    },
    {
      key: 'reference',
      header: 'Referenz',
      hideBelow: 'sm',
      render: (row) => row.payerReference ?? '–',
    },
    {
      key: 'amount',
      header: 'Betrag',
      align: 'right',
      render: (row) => (
        <span className="font-medium">
          {formatAmount(row.amount)} {row.currency}
        </span>
      ),
    },
    {
      key: 'assigned',
      header: 'Zugewiesen',
      align: 'right',
      hideBelow: 'sm',
      render: (row) => formatAmount(row.assigned),
    },
    {
      key: 'unassigned',
      header: 'Noch offen',
      align: 'right',
      render: (row) => <UnassignedCell row={row} />,
    },
    {
      key: 'state',
      header: 'Zustand',
      render: (row) => <Badge tone={toneOf(row.state)}>{RECEIPT_STATES[row.state]}</Badge>,
    },
  ]

  return (
    <>
      <PageHeader
        title="Zahlungen"
        subtitle="Was hereingekommen ist. Ein Eingang mindert für sich noch keinen offenen Posten — erst die Zuweisung tut das."
      >
        {mayRecord && <Button onClick={() => setRecording(true)}>Zahlungseingang erfassen</Button>}
      </PageHeader>

      <div className="grid gap-4 px-8 pb-12">
        <Panel padded={false} title="Zahlungseingänge">
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
              placeholder="Referenz oder Zahler"
            />
            <TextField
              label="Valuta ab"
              type="date"
              value={valueFrom}
              onChange={(event) => narrow(() => setValueFrom(event.target.value))}
            />
            <TextField
              label="Valuta bis"
              type="date"
              value={valueTo}
              onChange={(event) => narrow(() => setValueTo(event.target.value))}
            />
            <SelectField
              label="Zustand"
              value={state}
              onChange={(event) =>
                narrow(() => setState(event.target.value as '' | ReceiptState))
              }
            >
              <option value="">Alle</option>
              {RECEIPT_STATE_ORDER.map((code) => (
                <option key={code} value={code}>
                  {RECEIPT_STATES[code]}
                </option>
              ))}
            </SelectField>
          </div>

          <DataTable
            columns={columns}
            rows={shown.content}
            keyOf={(row) => row.id}
            loading={receipts.isPending}
            error={receipts.error}
            empty={
              <EmptyState
                title="Nichts erfasst"
                description="Es liegt kein Zahlungseingang vor — oder die Filter sind zu eng. Die Liste beginnt am Tag der Einführung; früher erfasste Zahlungen stehen an ihrer Rechnung."
              />
            }
            onRowOpen={(row) => setOpened(row.id)}
            page={shown}
            onPageChange={setPage}
          />
        </Panel>

        {!mayRecord && (
          <p className="text-[13px] text-text-secondary">
            Zum Erfassen und Zuweisen fehlt das Recht «Zahlung erfassen».
          </p>
        )}
      </div>

      {recording && (
        <PaymentReceiptDialog
          open
          tenantId={tenantId}
          currency="CHF"
          mayRecord={mayRecord}
          onClose={() => setRecording(false)}
          onSaved={refresh}
        />
      )}

      {opened !== null && single.data !== undefined && (
        <PaymentReceiptDialog
          open
          tenantId={tenantId}
          currency={single.data.currency}
          receipt={single.data}
          mayRecord={mayRecord}
          onClose={() => setOpened(null)}
          onSaved={refresh}
        />
      )}
    </>
  )
}

/**
 * What of a receipt is still waiting.
 *
 * <p>A fully spread receipt shows nothing rather than a zero: the reader is looking for the
 * money that still needs work, and a column of zeroes hides it.
 */
function UnassignedCell({ row }: { row: PaymentReceipt }) {
  if (row.state === 'REVERSED') return <span className="text-text-tertiary">–</span>
  if (row.unassigned === 0) return <span className="text-text-tertiary">–</span>
  return <span className="font-medium">{formatAmount(row.unassigned)}</span>
}

/** How loudly a state speaks: what still needs work draws the eye, what is done does not. */
function toneOf(state: ReceiptState): 'accent' | 'success' | 'muted' | 'neutral' {
  if (state === 'OPEN') return 'accent'
  if (state === 'PARTIAL') return 'neutral'
  if (state === 'ASSIGNED') return 'success'
  return 'muted'
}
