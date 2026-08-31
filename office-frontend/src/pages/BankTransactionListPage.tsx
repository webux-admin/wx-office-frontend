import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Badge } from '../components/Badge'
import { DataTable, type Column } from '../components/DataTable'
import { CheckboxField } from '../components/CheckboxField'
import { EmptyState } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { SelectField } from '../components/SelectField'
import { TextField } from '../components/TextField'
import { RequireTenant } from '../layout/RequireTenant'
import { formatAmount, formatDate } from '../lib/format'
import {
  BANKING_RIGHTS,
  TRANSACTION_STATES,
  TRANSACTION_STATE_ORDER,
  bankAccountsKey,
  bankTransactionsKey,
  fetchBankAccounts,
  fetchBankTransactions,
  queryStringOf,
  referenceIsBroken,
  referenceLabel,
} from '../lib/banking'
import type { BankTransaction, TransactionState } from '../lib/types'

/**
 * The single payments read out of the statements.
 *
 * <p>Read only, and on purpose: which invoice a payment settles is decided elsewhere. This
 * screen answers «was ist hereingekommen» and shows what a later matching step will have to
 * work with — above all whether the reference holds (backend ADR-0107).
 *
 * <p><b>A broken reference is marked, a missing one is not.</b> An unstructured payment is
 * ordinary. A reference that looks like a QR reference and fails its check digit is a
 * transposed digit somebody can find (ADR-0041).
 */
export function BankTransactionListPage() {
  return (
    <RequireTenant permission={BANKING_RIGHTS.read}>
      {(tenantId) => <BankTransactions tenantId={tenantId} />}
    </RequireTenant>
  )
}

function BankTransactions({ tenantId }: { tenantId: number }) {
  const [params] = useSearchParams()
  const importId = params.get('importId')

  const [accountIban, setAccountIban] = useState('')
  const [state, setState] = useState<'' | TransactionState>('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [creditsOnly, setCreditsOnly] = useState(false)

  const query = {
    importId: importId === null ? undefined : Number(importId),
    accountIban: accountIban === '' ? undefined : accountIban,
    state: state === '' ? undefined : state,
    from: from === '' ? undefined : from,
    to: to === '' ? undefined : to,
    creditsOnly: creditsOnly ? true : undefined,
  }

  const accounts = useQuery({
    queryKey: bankAccountsKey(tenantId),
    queryFn: () => fetchBankAccounts(tenantId),
  })

  const transactions = useQuery({
    queryKey: bankTransactionsKey(tenantId, queryStringOf(query)),
    queryFn: () => fetchBankTransactions(tenantId, query),
  })

  const rows = transactions.data ?? []

  const columns: Column<BankTransaction>[] = [
    {
      key: 'value',
      header: 'Valuta',
      render: (item) => (
        <div>
          <div>{formatDate(item.valueDate)}</div>
          <div className="text-[12px] text-text-tertiary">{item.accountIban}</div>
        </div>
      ),
    },
    {
      key: 'payer',
      header: 'Zahler',
      render: (item) => (
        <div>
          <div>{item.debtorName ?? '-'}</div>
          {item.ultimateDebtorName && (
            <div className="text-[12px] text-text-tertiary">
              für {item.ultimateDebtorName}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'reference',
      header: 'Referenz',
      render: (item) => (
        <div className="grid gap-0.5">
          <span className="font-mono text-[12px]">
            {item.reference ?? item.remittanceUnstructured ?? '-'}
          </span>
          {referenceIsBroken(item) ? (
            <Badge tone="danger">{referenceLabel(item)}</Badge>
          ) : (
            <span className="text-[12px] text-text-tertiary">{referenceLabel(item)}</span>
          )}
        </div>
      ),
    },
    {
      key: 'note',
      header: 'Mitteilung',
      hideBelow: 'sm',
      render: (item) => (
        <span className="text-[13px] text-text-secondary">
          {item.remittanceStructured ?? item.remittanceUnstructured ?? '-'}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Betrag',
      align: 'right',
      render: (item) => (
        <div>
          <div className={item.creditDebit === 'DBIT' ? 'text-danger' : undefined}>
            {item.creditDebit === 'DBIT' ? '-' : ''}
            {formatAmount(item.amount)} {item.currency}
          </div>
          {!item.inAccountCurrency && item.instructedAmount !== undefined && (
            <div className="text-[12px] text-text-tertiary">
              aufgegeben {formatAmount(item.instructedAmount)} {item.instructedCurrency}
            </div>
          )}
          {item.returnReasonCode && (
            <div className="text-[12px] text-danger">
              Rückbelastung {item.returnReasonCode}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'state',
      header: 'Zustand',
      render: (item) => (
        <Badge tone={item.state === 'NEW' ? 'accent' : 'neutral'}>
          {TRANSACTION_STATES[item.state]}
        </Badge>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Bankposten"
        subtitle="Was auf den eingelesenen Auszügen an einzelnen Zahlungen steht. Die Zuordnung zu einer Rechnung folgt."
      />

      <div className="grid gap-4 px-8 pb-12">
        <Panel padded={false} title="Einzelposten">
          <div className="flex flex-wrap items-end gap-4 px-5 pb-4">
            <span className="w-full max-w-[260px]">
              <SelectField
                label="Konto"
                value={accountIban}
                onChange={(event) => setAccountIban(event.target.value)}
              >
                <option value="">Alle Konten</option>
                {(accounts.data ?? []).map((account) => (
                  <option key={account.id} value={account.iban}>
                    {account.label}
                  </option>
                ))}
              </SelectField>
            </span>
            <span className="w-full max-w-[200px]">
              <SelectField
                label="Zustand"
                value={state}
                onChange={(event) => setState(event.target.value as '' | TransactionState)}
              >
                <option value="">Alle</option>
                {TRANSACTION_STATE_ORDER.map((code) => (
                  <option key={code} value={code}>
                    {TRANSACTION_STATES[code]}
                  </option>
                ))}
              </SelectField>
            </span>
            <span className="w-full max-w-[170px]">
              <TextField
                label="Valuta ab"
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </span>
            <span className="w-full max-w-[170px]">
              <TextField
                label="Valuta bis"
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            </span>
            <CheckboxField
              label="Nur Gutschriften"
              checked={creditsOnly}
              onChange={(event) => setCreditsOnly(event.target.checked)}
              hint="Eine Belastung ist eine Rücklastschrift oder eine Gebühr — beides gleicht keine Rechnung aus."
            />
          </div>

          <DataTable
            columns={columns}
            rows={rows}
            keyOf={(item) => item.id}
            loading={transactions.isLoading}
            error={transactions.error}
            empty={
              <EmptyState
                title="Keine Posten"
                description="Es wurde noch kein Bankauszug eingelesen, oder die Filter lassen nichts übrig."
              />
            }
          />
        </Panel>
      </div>
    </>
  )
}
