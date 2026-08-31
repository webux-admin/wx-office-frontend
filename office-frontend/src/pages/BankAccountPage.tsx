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
import {
  BANKING_MODULE,
  BANKING_RIGHTS,
  bankAccountsKey,
  fetchBankAccounts,
  saveBankAccount,
} from '../lib/banking'
import type { BankAccount, BankAccountRequest } from '../lib/types'

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
      </div>

      <AccountDialog
        tenantId={tenantId}
        account={editing}
        onClose={() => setEditing(null)}
      />
    </>
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
