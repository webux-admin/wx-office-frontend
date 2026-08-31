import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { DataTable, type Column } from '../components/DataTable'
import { EmptyState, LoadingBlock, WarningNotice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { RequireTenant } from '../layout/RequireTenant'
import { api } from '../lib/api'
import { formatAmount, formatByteCount, formatDate, formatDateTime } from '../lib/format'
import {
  BANKING_RIGHTS,
  BANK_STATEMENT_PATH,
  BANK_TRANSACTION_PATH,
  IMPORT_STATES,
  bankEntriesKey,
  bankStatementFileUrl,
  bankStatementsKey,
  bankTransactionsKey,
  entryHasGap,
  fetchBankEntries,
  fetchBankStatement,
  fetchBankTransactions,
  isBeingRead,
  referenceLabel,
} from '../lib/banking'
import type { BankEntry, BankTransaction } from '../lib/types'

/**
 * One imported statement: what the bank booked, and what was read out of it.
 *
 * <p>Every entry is listed, including those that hold no items. A bank charge and an interest
 * posting are entries too, and leaving them out would give a statement whose rows do not add
 * up to its balance — with nobody able to say whether the reader lost something or the bank
 * never sent it (backend ADR-0107).
 */
export function BankStatementDetailPage() {
  const { importId } = useParams()
  return (
    <RequireTenant permission={BANKING_RIGHTS.read}>
      {(tenantId) => <Statement tenantId={tenantId} importId={Number(importId)} />}
    </RequireTenant>
  )
}

function Statement({ tenantId, importId }: { tenantId: number; importId: number }) {
  const head = useQuery({
    queryKey: [...bankStatementsKey(tenantId), 'one', importId],
    queryFn: () => fetchBankStatement(tenantId, importId),
    refetchInterval: (result) =>
      result.state.data !== undefined && isBeingRead(result.state.data) ? 1500 : false,
  })

  const reading = head.data !== undefined && isBeingRead(head.data)

  const entries = useQuery({
    queryKey: bankEntriesKey(tenantId, importId),
    queryFn: () => fetchBankEntries(tenantId, importId),
    enabled: head.data !== undefined && !reading,
  })

  const transactions = useQuery({
    queryKey: bankTransactionsKey(tenantId, `import=${importId}`),
    queryFn: () => fetchBankTransactions(tenantId, { importId, limit: 1000 }),
    enabled: head.data !== undefined && !reading,
  })

  if (head.isLoading) return <LoadingBlock />
  if (head.data === undefined) return <LoadingBlock />

  const file = head.data
  const items = transactions.data ?? []

  const entryColumns: Column<BankEntry>[] = [
    {
      key: 'booking',
      header: 'Buchung',
      render: (entry) => (
        <div>
          <div>{formatDate(entry.bookingDate)}</div>
          <div className="text-[12px] text-text-tertiary">
            Valuta {formatDate(entry.valueDate)}
          </div>
        </div>
      ),
    },
    {
      key: 'what',
      header: 'Was',
      render: (entry) => (
        <div className="grid gap-1">
          <div>{entry.additionalEntryInformation ?? entry.entryReference ?? '-'}</div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={entry.status === 'BOOK' ? 'success' : 'neutral'}>
              {statusName(entry.status)}
            </Badge>
            {entry.reversalIndicator && <Badge tone="danger">Rückbelastung</Badge>}
            {entry.bankTransactionCode && (
              <span className="text-[12px] text-text-tertiary">
                {entry.bankTransactionCode}
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Betrag',
      align: 'right',
      render: (entry) => (
        <div>
          <div className={entry.creditDebit === 'DBIT' ? 'text-danger' : undefined}>
            {entry.creditDebit === 'DBIT' ? '-' : ''}
            {formatAmount(entry.amount)} {entry.currency}
          </div>
          {entry.chargesTotal !== undefined && (
            <div className="text-[12px] text-text-tertiary">
              Gebühr {formatAmount(entry.chargesTotal)}
              {entry.chargesIncluded ? ' (im Betrag enthalten)' : ' (zusätzlich)'}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'items',
      header: 'Posten',
      align: 'right',
      render: (entry) => (
        <div>
          <div>{entry.transactionCount}</div>
          {entryHasGap(entry) && (
            <div className="text-[12px] text-danger">
              Summe {formatAmount(entry.transactionSum)}
            </div>
          )}
        </div>
      ),
    },
  ]

  const itemColumns: Column<BankTransaction>[] = [
    {
      key: 'value',
      header: 'Valuta',
      render: (item) => formatDate(item.valueDate),
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
        <div>
          <div className="font-mono text-[12px]">
            {item.reference ?? item.remittanceUnstructured ?? '-'}
          </div>
          <div className="text-[12px] text-text-tertiary">{referenceLabel(item)}</div>
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Betrag',
      align: 'right',
      render: (item) => (
        <div>
          <div>
            {formatAmount(item.amount)} {item.currency}
          </div>
          {!item.inAccountCurrency && item.instructedAmount !== undefined && (
            <div className="text-[12px] text-text-tertiary">
              aufgegeben {formatAmount(item.instructedAmount)} {item.instructedCurrency}
            </div>
          )}
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title={file.fileName}
        subtitle={`${file.messageType.replace('_', '.').toLowerCase()} · ${formatByteCount(file.byteCount)} · eingelesen ${formatDateTime(file.createdAt)} von ${file.createdBy}`}
        back={{ to: BANK_STATEMENT_PATH, label: 'Bankauszüge' }}
      >
        <Button
          variant="secondary"
          onClick={() => void download(tenantId, importId, file.fileName)}
        >
          Originaldatei
        </Button>
      </PageHeader>

      <div className="grid gap-4 px-8 pb-12">
        {file.state === 'FAILED' && (
          <WarningNotice>
            Diese Datei konnte nicht gelesen werden: {file.failureReason}. Sie bleibt
            gespeichert und abrufbar; ein erneuter Versuch führt zum selben Ergebnis.
          </WarningNotice>
        )}

        {file.sequenceGap && (
          <WarningNotice>
            {file.sequenceGap}. Der Auszug wurde trotzdem eingelesen — laden Sie die fehlenden
            Auszüge nach, doppelte Posten fallen dabei von selbst weg.
          </WarningNotice>
        )}

        {file.copyDuplicateIndicator && (
          <WarningNotice>
            Die Bank kennzeichnet diesen Auszug als Kopie ({file.copyDuplicateIndicator}).
            Bereits erfasste Posten wurden nicht erneut geschrieben.
          </WarningNotice>
        )}

        <Panel title="Was eingelesen wurde">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
            <Figure label="Zustand">
              <Badge tone={file.state === 'FAILED' ? 'danger' : 'success'}>
                {IMPORT_STATES[file.state]}
              </Badge>
            </Figure>
            <Figure label="Konto">{file.accountLabel ?? '-'}</Figure>
            <Figure label="Auszug">{file.electronicSequenceNumber ?? '-'}</Figure>
            <Figure label="Buchungen">{file.entryCount}</Figure>
            <Figure label="Posten gelesen">{file.transactionCount}</Figure>
            <Figure label="davon neu">{file.storedCount}</Figure>
            <Figure label="davon doppelt">{file.duplicateCount}</Figure>
          </dl>
          {file.duplicateCount > 0 && (
            <p className="mt-3 text-[13px] text-text-secondary">
              Doppelte Posten sind der Normalfall: dieselbe Zahlung kommt einmal als
              camt.054-Avisierung und ein zweites Mal in der camt.053-Sammelauflösung.
            </p>
          )}
          {file.skippedCount > 0 && (
            <p className="mt-1 text-[13px] text-text-secondary">
              {file.skippedCount} Posten wurden übersprungen: sie stehen unter einer noch
              schwebenden Buchung oder tragen keine Bankreferenz, an der sie beim nächsten Mal
              wiedererkennbar wären.
            </p>
          )}
        </Panel>

        <Panel padded={false} title="Buchungen der Bank">
          <DataTable
            columns={entryColumns}
            rows={entries.data ?? []}
            keyOf={(entry) => entry.id}
            loading={entries.isLoading || reading}
            error={entries.error}
            empty={<EmptyState title="Keine Buchungen" />}
          />
        </Panel>

        <Panel padded={false} title={`Einzelposten (${items.length})`}>
          <DataTable
            columns={itemColumns}
            rows={items}
            keyOf={(item) => item.id}
            loading={transactions.isLoading || reading}
            error={transactions.error}
            rowTo={() => `${BANK_TRANSACTION_PATH}?importId=${importId}`}
            empty={
              <EmptyState
                title="Keine Einzelposten"
                description="Diese Datei enthält nur Buchungen ohne aufgelöste Posten — etwa Gebühren oder Zinsen."
              />
            }
          />
        </Panel>
      </div>
    </>
  )
}

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[12px] text-text-tertiary">{label}</dt>
      <dd className="mt-0.5 text-[14px] font-medium">{children}</dd>
    </div>
  )
}

function statusName(status: BankEntry['status']): string {
  if (status === 'BOOK') return 'Gebucht'
  if (status === 'PDNG') return 'Schwebend'
  return 'Information'
}

/**
 * Fetches the stored file and hands it to the browser.
 *
 * <p>Through the API client rather than a plain link: a link would open a new tab showing a
 * bare 401 instead of sending somebody to the login screen.
 */
async function download(tenantId: number, importId: number, fileName: string) {
  const file = await api.file(bankStatementFileUrl(tenantId, importId))
  const url = URL.createObjectURL(file.blob)
  const link = document.createElement('a')
  link.href = url
  link.download = file.fileName || fileName
  link.click()
  URL.revokeObjectURL(url)
}
