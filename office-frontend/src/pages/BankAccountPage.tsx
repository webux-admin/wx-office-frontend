import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { CheckboxField } from '../components/CheckboxField'
import { DataTable, type Column } from '../components/DataTable'
import { Dialog } from '../components/Dialog'
import { EmptyState, ErrorNotice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { TextField } from '../components/TextField'
import { useAuth } from '../auth/useAuth'
import { RequireTenant } from '../layout/RequireTenant'
import { useRunsModule } from '../lib/modules'
import {
  ACCOUNTING_MODULE,
  ACCOUNTING_RIGHTS,
  bankLedgerAccountsKey,
  fetchBankLedgerAccounts,
  saveBankLedgerAccount,
} from '../lib/accounting'
import { AccountSelect } from './accounting/AccountSelect'
import {
  BANKING_MODULE,
  BANKING_RIGHTS,
  bankAccountsKey,
  fetchBankAccounts,
  saveBankAccount,
} from '../lib/banking'
import type { BankAccount, BankAccountRequest, BankLedgerAccount } from '../lib/types'

/**
 * The accounts this tenant receives statements for.
 *
 * <p><b>The receiving side, kept apart from the payment part of a document.</b> The IBAN
 * printed on an invoice is one per tenant and lives in the tenant settings; a company holding
 * a CHF and a EUR account receives two statements and needs both here (backend ADR-0107).
 *
 * <p>Without an entry here a statement is refused — that is the point. Otherwise another
 * company's statement lands unnoticed in these books, and a settlement line is immutable.
 */
export function BankAccountPage() {
  return (
    <RequireTenant permission={BANKING_RIGHTS.read} module={BANKING_MODULE}>
      {(tenantId) => <BankAccounts tenantId={tenantId} />}
    </RequireTenant>
  )
}

function BankAccounts({ tenantId }: { tenantId: number }) {
  const { can } = useAuth()
  const mayWrite = can(BANKING_RIGHTS.importFile)
  const [editing, setEditing] = useState<BankAccount | 'new' | null>(null)

  const accounts = useQuery({
    queryKey: bankAccountsKey(tenantId),
    queryFn: () => fetchBankAccounts(tenantId),
  })

  const columns: Column<BankAccount>[] = [
    {
      key: 'label',
      header: 'Bezeichnung',
      render: (account) => (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{account.label}</span>
          {!account.active && <Badge tone="muted">Stillgelegt</Badge>}
          {account.qrAccount && <Badge tone="accent">QR-Referenz</Badge>}
        </div>
      ),
    },
    { key: 'iban', header: 'IBAN', render: (account) => account.iban },
    { key: 'currency', header: 'Währung', render: (account) => account.currency },
  ]

  return (
    <>
      <PageHeader
        title="Bankkonten"
        subtitle="Für welche Konten dieser Mandant Auszüge bekommt. Ein Auszug auf eine hier unbekannte IBAN wird abgewiesen."
      >
        {mayWrite && <Button onClick={() => setEditing('new')}>Bankkonto erfassen</Button>}
      </PageHeader>

      <div className="grid gap-4 px-8 pb-12">
        <Panel padded={false} title="Konten">
          <DataTable
            columns={columns}
            rows={accounts.data ?? []}
            keyOf={(account) => account.id}
            loading={accounts.isLoading}
            error={accounts.error}
            onRowOpen={mayWrite ? (account) => setEditing(account) : undefined}
            empty={
              <EmptyState
                title="Noch kein Bankkonto"
                description="Erfassen Sie die IBAN, für die die Auszüge kommen. Ohne sie wird kein Auszug angenommen."
              />
            }
          />
        </Panel>

        <LedgerAccountPanel tenantId={tenantId} accounts={accounts.data ?? []} />
      </div>

      <AccountDialog
        tenantId={tenantId}
        account={editing}
        onClose={() => setEditing(null)}
      />
    </>
  )
}

/**
 * Which account of the chart carries which of these bank accounts.
 *
 * <p>Its own panel and not a column of the table above: the two live in different modules and
 * are written by two endpoints with two rights. A clerk who may import statements is not
 * thereby somebody who decides where the money is booked.
 *
 * <p>Shown only where this tenant keeps books here and the session may read the chart —
 * without a chart the picker would stand empty, and a row of dashes answers a question nobody
 * asked.
 */
function LedgerAccountPanel({
  tenantId,
  accounts,
}: {
  tenantId: number
  /** The bank accounts this tenant receives statements for. */
  accounts: readonly BankAccount[]
}) {
  const { can } = useAuth()
  const runs = useRunsModule()
  const queryClient = useQueryClient()
  const shows = runs(ACCOUNTING_MODULE) && can(ACCOUNTING_RIGHTS.read)
  const mayWrite = can(ACCOUNTING_RIGHTS.configure)

  const mappings = useQuery({
    queryKey: bankLedgerAccountsKey(tenantId),
    queryFn: () => fetchBankLedgerAccounts(tenantId),
    enabled: shows,
  })

  const save = useMutation({
    mutationFn: (body: { accountIban: string; accountNumber: string }) =>
      saveBankLedgerAccount(tenantId, body),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: bankLedgerAccountsKey(tenantId) }),
  })

  if (!shows) return null

  /** The mapping of one IBAN, compared the way the backend stores it. */
  const mappingOf = (iban: string): BankLedgerAccount | undefined =>
    (mappings.data ?? []).find(
      (one) => one.accountIban === iban.replace(/\s/g, '').toUpperCase(),
    )

  return (
    <Panel
      title="Fibu-Konten"
      description="Auf welches Konto des Kontenplans eine Zahlung auf dieses Bankkonto gebucht wird. Ohne Zuordnung wird nichts gebucht."
    >
      {accounts.length === 0 ? (
        <EmptyState
          title="Noch kein Bankkonto"
          description="Erfassen Sie zuerst ein Bankkonto; danach lässt sich sagen, welches Konto es führt."
        />
      ) : (
        <div className="grid gap-4">
          {save.error !== null && save.error !== undefined && (
            <ErrorNotice error={save.error} />
          )}
          {accounts.map((account) => (
            <AccountSelect
              key={account.id}
              label={`${account.label} · ${account.iban}`}
              tenantId={tenantId}
              accountType="ASSET"
              value={mappingOf(account.iban)?.accountNumber ?? ''}
              onChange={(number) => {
                if (number === '') return
                save.mutate({ accountIban: account.iban, accountNumber: number })
              }}
              emptyLabel="– kein Konto –"
              disabled={!mayWrite || save.isPending}
            />
          ))}
        </div>
      )}
    </Panel>
  )
}

function AccountDialog({
  tenantId,
  account,
  onClose,
}: {
  tenantId: number
  account: BankAccount | 'new' | null
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const existing = account !== null && account !== 'new' ? account : undefined

  const [iban, setIban] = useState('')
  const [currency, setCurrency] = useState('CHF')
  const [label, setLabel] = useState('')
  const [qrAccount, setQrAccount] = useState(true)
  const [active, setActive] = useState(true)
  // The dialog holds the values of the row it was opened on. Adjusted during render rather
  // than in an effect: an effect would draw the fields once with the previous row's values.
  const [openedOn, setOpenedOn] = useState<number | 'new' | null>(null)
  const key = existing?.id ?? (account === 'new' ? ('new' as const) : null)
  if (key !== openedOn) {
    setOpenedOn(key)
    setIban(existing?.iban ?? '')
    setCurrency(existing?.currency ?? 'CHF')
    setLabel(existing?.label ?? '')
    setQrAccount(existing?.qrAccount ?? true)
    setActive(existing?.active ?? true)
  }

  const save = useMutation({
    mutationFn: (request: BankAccountRequest) => saveBankAccount(tenantId, request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: bankAccountsKey(tenantId) })
      onClose()
    },
  })

  function submit() {
    save.mutate({
      id: existing?.id,
      iban: existing === undefined ? iban : undefined,
      currency: existing === undefined ? currency : undefined,
      label,
      qrAccount,
      active,
    })
  }

  return (
    <Dialog
      open={account !== null}
      title={existing === undefined ? 'Bankkonto erfassen' : existing.label}
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={submit} disabled={label.trim() === ''} busy={save.isPending}>
            Speichern
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <TextField
          label="IBAN"
          value={existing?.iban ?? iban}
          onChange={(event) => setIban(event.target.value)}
          disabled={existing !== undefined}
          hint={
            existing === undefined
              ? 'Mit oder ohne Leerzeichen.'
              : 'Steht fest — bereits erfasste Buchungen zeigen darauf.'
          }
        />
        <TextField
          label="Währung"
          value={existing?.currency ?? currency}
          onChange={(event) => setCurrency(event.target.value.toUpperCase())}
          disabled={existing !== undefined}
          hint={existing === undefined ? 'Drei Buchstaben, z.B. CHF.' : 'Steht fest.'}
        />
        <TextField
          label="Bezeichnung"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
        />
        <CheckboxField
          label="Auf dieses Konto wird mit QR-Referenz fakturiert"
          checked={qrAccount}
          onChange={(event) => setQrAccount(event.target.checked)}
          hint="Nur Auskunft. Was ein Beleg druckt, entscheiden weiterhin die Mandanteneinstellungen."
        />
        {existing !== undefined && (
          <CheckboxField
            label="Aktiv"
            checked={active}
            onChange={(event) => setActive(event.target.checked)}
            hint="Ein stillgelegtes Konto behält seine Auszüge und fällt aus der Auswahl."
          />
        )}
        {save.error !== null && <ErrorNotice error={save.error} />}
      </div>
    </Dialog>
  )
}
