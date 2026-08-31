import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { CheckboxField } from '../components/CheckboxField'
import { DataTable, type Column } from '../components/DataTable'
import { EmptyState } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { SelectField } from '../components/SelectField'
import { Tabs } from '../components/Tabs'
import { useAuth } from '../auth/useAuth'
import { RequireTenant } from '../layout/RequireTenant'
import { formatAmount, formatDate } from '../lib/format'
import {
  CREDIT_AGE_BANDS,
  CUSTOMER_CREDIT_RIGHTS,
  RECEIPT_KINDS,
  creditAgeBand,
  customerCreditQuery,
  customerCreditsKey,
  fetchCustomerCreditBalances,
  fetchCustomerCredits,
} from '../lib/customerCredit'
import { openItemsKey } from '../lib/openItem'
import { receivableKey, salesDocumentListKey, salesDocumentFor } from '../lib/salesDocument'
import type { CustomerCredit, CustomerCreditBalance, Partner, ReceiptKind } from '../lib/types'
import { PartnerQuickSearch } from './document/PartnerQuickSearch'
import { AdvanceDialog } from './payment/AdvanceDialog'
import { ApplyCreditDialog } from './payment/ApplyCreditDialog'
import { CreditUseDialog } from './payment/CreditUseDialog'

/**
 * What the tenant owes its customers.
 *
 * <p><b>Its own screen with its own totals, and never a column in the open items.</b> A
 * customer credit is a liability — in the KMU chart of accounts 2030 «Erhaltene Anzahlungen» —
 * and OR Art. 958c Abs. 1 Ziff. 7 forbids offsetting assets against liabilities. Shown only as
 * a negative open item it would leave a Treuhänder with a debtor list whose sum is smaller than
 * the invoices in it, and no way to see why (backend ADR-0104).
 *
 * <p>Two views: the <b>balance</b>, one row per customer <b>and</b> currency, which is the
 * figure that goes on account 2030; and the <b>receipts</b>, each with what is left of it and
 * how old it is.
 */
export function CustomerCreditPage() {
  return (
    <RequireTenant permission={CUSTOMER_CREDIT_RIGHTS.read}>
      {(tenantId) => <CustomerCredits tenantId={tenantId} />}
    </RequireTenant>
  )
}

function CustomerCredits({ tenantId }: { tenantId: number }) {
  const { can } = useAuth()
  const queryClient = useQueryClient()
  const mayRecord = can(CUSTOMER_CREDIT_RIGHTS.record)
  const mayRefund = can(CUSTOMER_CREDIT_RIGHTS.refund)
  const invoiceKind = salesDocumentFor('INVOICE')

  const [tab, setTab] = useState<'balances' | 'credits'>('balances')
  const [partner, setPartner] = useState<Partner | undefined>(undefined)
  const [partnerTerm, setPartnerTerm] = useState('')
  const [kind, setKind] = useState<'' | ReceiptKind>('')
  const [minimumAgeDays, setMinimumAgeDays] = useState('')
  const [includeSettled, setIncludeSettled] = useState(false)
  const [recording, setRecording] = useState(false)
  const [applying, setApplying] = useState<CustomerCredit | null>(null)
  const [using, setUsing] = useState<{ credit: CustomerCredit; mode: 'refund' | 'release' }
    | null>(null)

  const creditQuery = customerCreditQuery({
    partnerId: partner?.id,
    kind: kind === '' ? undefined : kind,
    minimumAgeDays: minimumAgeDays === '' ? undefined : Number(minimumAgeDays),
    includeSettled,
  })
  const balanceQuery = customerCreditQuery({})

  const credits = useQuery({
    queryKey: customerCreditsKey(tenantId, creditQuery),
    queryFn: () => fetchCustomerCredits(tenantId, creditQuery),
  })

  const balances = useQuery({
    queryKey: [...customerCreditsKey(tenantId), 'balances', balanceQuery],
    queryFn: () => fetchCustomerCreditBalances(tenantId, balanceQuery),
  })

  /**
   * After a credit moved, three lists are stale: this one, the open items and the invoice
   * list with its «Offen» column.
   */
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: customerCreditsKey(tenantId) })
    void queryClient.invalidateQueries({ queryKey: openItemsKey(tenantId) })
    if (invoiceKind) {
      void queryClient.invalidateQueries({
        queryKey: salesDocumentListKey(invoiceKind, tenantId),
      })
      void queryClient.invalidateQueries({ queryKey: receivableKey(invoiceKind, tenantId) })
    }
  }

  const balanceColumns: Column<CustomerCreditBalance>[] = [
    {
      key: 'partner',
      header: 'Kunde',
      render: (row) => (
        <span className="grid">
          <span>{row.partnerName ?? 'nicht zugeordnet'}</span>
          {row.partnerNumber !== undefined && (
            <span className="text-[12px] text-text-tertiary">{row.partnerNumber}</span>
          )}
        </span>
      ),
    },
    { key: 'currency', header: 'Währung', render: (row) => row.currency },
    {
      key: 'balance',
      header: 'Guthaben',
      align: 'right',
      render: (row) => (
        <span className="font-medium">
          {formatAmount(row.balance)} {row.currency}
        </span>
      ),
    },
    {
      key: 'oldest',
      header: 'Ältester Eingang',
      hideBelow: 'sm',
      render: (row) => formatDate(row.oldestValueDate),
    },
    {
      key: 'count',
      header: 'Eingänge',
      align: 'right',
      hideBelow: 'sm',
      render: (row) => row.receiptCount,
    },
  ]

  const creditColumns: Column<CustomerCredit>[] = [
    {
      key: 'valueDate',
      header: 'Valuta',
      render: (row) => formatDate(row.valueDate),
    },
    {
      key: 'partner',
      header: 'Kunde',
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
      key: 'kind',
      header: 'Art',
      render: (row) => <Badge tone="neutral">{RECEIPT_KINDS[row.kind]}</Badge>,
    },
    {
      key: 'amount',
      header: 'Eingegangen',
      align: 'right',
      hideBelow: 'sm',
      render: (row) => formatAmount(row.amount),
    },
    {
      key: 'remaining',
      header: 'Guthaben',
      align: 'right',
      render: (row) => (
        <span className="font-medium">
          {formatAmount(row.remaining)} {row.currency}
        </span>
      ),
    },
    {
      key: 'age',
      header: 'Alter',
      render: (row) => (
        <span className="grid">
          <span>{row.ageDays} Tage</span>
          <span className="text-[12px] text-text-tertiary">{creditAgeBand(row.ageDays)}</span>
        </span>
      ),
    },
  ]

  if (mayRecord || mayRefund) {
    creditColumns.push({
      key: 'actions',
      header: '',
      align: 'right',
      width: 'w-[260px]',
      render: (row) =>
        row.remaining > 0 ? (
          <span className="flex justify-end gap-1">
            {mayRecord && row.partnerId !== undefined && (
              <Button variant="ghost" onClick={() => setApplying(row)}>
                Verrechnen
              </Button>
            )}
            {mayRefund && (
              <>
                <Button variant="ghost" onClick={() => setUsing({ credit: row, mode: 'refund' })}>
                  Zurückzahlen
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setUsing({ credit: row, mode: 'release' })}
                >
                  Auflösen
                </Button>
              </>
            )}
          </span>
        ) : null,
    })
  }

  return (
    <>
      <PageHeader
        title="Guthaben"
        subtitle="Was wir unseren Kunden schulden. Nie gegen offene Posten verrechnet — Aktiven und Passiven werden nicht saldiert (OR Art. 958c Abs. 1 Ziff. 7)."
      >
        {mayRecord && (
          <Button onClick={() => setRecording(true)}>Vorauszahlung erfassen</Button>
        )}
      </PageHeader>

      <div className="grid gap-4 px-8 pb-12">
        <Tabs
          label="Sicht"
          tabs={[
            { id: 'balances', label: 'Bestand' },
            { id: 'credits', label: 'Eingänge' },
          ]}
          active={tab}
          onChange={setTab}
        />

        {tab === 'balances' ? (
          <Panel padded={false} title="Bestand je Kunde und Währung">
            <DataTable
              columns={balanceColumns}
              rows={balances.data ?? []}
              keyOf={(row) => `${row.partnerId ?? 0}|${row.currency}`}
              loading={balances.isPending}
              error={balances.error}
              empty={
                <EmptyState
                  title="Kein Guthaben"
                  description="Kein Kunde hat Geld bei uns liegen, für das es keine Rechnung gibt."
                />
              }
            />
            <BalanceTotals balances={balances.data ?? []} />
          </Panel>
        ) : (
          <Panel padded={false} title="Zahlungseingänge mit Rest">
            <div className="flex flex-wrap items-end gap-4 px-5 pb-4">
              <span className="w-full max-w-[260px]">
                <PartnerQuickSearch
                  tenantId={tenantId}
                  term={partnerTerm}
                  onTerm={(next) => {
                    setPartnerTerm(next)
                    if (next === '') setPartner(undefined)
                  }}
                  chosen={partner !== undefined}
                  onChoose={setPartner}
                />
              </span>
              <SelectField
                label="Art"
                value={kind}
                onChange={(event) => setKind(event.target.value as '' | ReceiptKind)}
              >
                <option value="">Alle</option>
                {(Object.keys(RECEIPT_KINDS) as ReceiptKind[]).map((code) => (
                  <option key={code} value={code}>
                    {RECEIPT_KINDS[code]}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="Mindestens so alt"
                value={minimumAgeDays}
                onChange={(event) => setMinimumAgeDays(event.target.value)}
              >
                <option value="">Jedes Alter</option>
                {CREDIT_AGE_BANDS.slice(0, -1).map((band) => (
                  <option key={band.upToDays} value={String(band.upToDays)}>
                    älter als {band.label.replace('bis ', '').replace('91–', '')}
                  </option>
                ))}
              </SelectField>
              <CheckboxField
                label="Verbrauchte mitzeigen"
                checked={includeSettled}
                onChange={(event) => setIncludeSettled(event.target.checked)}
              />
            </div>

            <DataTable
              columns={creditColumns}
              rows={credits.data ?? []}
              keyOf={(row) => row.receiptId}
              loading={credits.isPending}
              error={credits.error}
              empty={
                <EmptyState
                  title="Kein Guthaben"
                  description="Kein Zahlungseingang trägt noch einen Rest — oder die Filter sind zu eng."
                />
              }
            />
          </Panel>
        )}

        <p className="text-[13px] text-text-secondary">
          Ein Guthaben verfällt nicht von selbst. Die Verjährung ist eine Einrede, die ein
          Richter nicht von Amtes wegen berücksichtigt (OR Art. 142) — diese Liste macht das
          Alter sichtbar, aufgelöst wird von Hand.
        </p>

        {!mayRecord && (
          <p className="text-[13px] text-text-secondary">
            Zum Erfassen und Verrechnen fehlt das Recht «Vorauszahlung erfassen».
          </p>
        )}
        {!mayRefund && (
          <p className="text-[13px] text-text-secondary">
            Zum Zurückzahlen und Auflösen fehlt das Recht «Guthaben zurückzahlen».
          </p>
        )}
      </div>

      {recording && (
        <AdvanceDialog
          open
          tenantId={tenantId}
          currency="CHF"
          onClose={() => setRecording(false)}
          onSaved={refresh}
        />
      )}

      {applying !== null && (
        <ApplyCreditDialog
          open
          tenantId={tenantId}
          credit={applying}
          onClose={() => setApplying(null)}
          onSaved={refresh}
        />
      )}

      {using !== null && (
        <CreditUseDialog
          open
          tenantId={tenantId}
          credit={using.credit}
          mode={using.mode}
          onClose={() => setUsing(null)}
          onSaved={refresh}
        />
      )}
    </>
  )
}

/**
 * A total per currency, never across.
 *
 * <p>CHF and EUR do not add up, and one number over both would be a figure nobody can act on.
 * That is also why the currency is part of the group key of every row rather than a column
 * beside a shared sum.
 */
function BalanceTotals({ balances }: { balances: CustomerCreditBalance[] }) {
  if (balances.length === 0) return null
  const totals = new Map<string, number>()
  for (const row of balances) {
    totals.set(row.currency, (totals.get(row.currency) ?? 0) + row.balance)
  }
  return (
    <div className="flex flex-wrap justify-end gap-6 border-t border-line-subtle px-5 py-3 text-[13px]">
      {[...totals.entries()].map(([currency, total]) => (
        <span key={currency}>
          <span className="text-text-tertiary">Total {currency}</span>{' '}
          <span className="font-medium tabular-nums">{formatAmount(total)}</span>
        </span>
      ))}
    </div>
  )
}
