import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { DataTable, type Column } from '../components/DataTable'
import { Dialog } from '../components/Dialog'
import { FileDropField } from '../components/FileDropField'
import { EmptyState, ErrorNotice, WarningNotice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { SelectField } from '../components/SelectField'
import { TextField } from '../components/TextField'
import { useAuth } from '../auth/useAuth'
import { RequireTenant } from '../layout/RequireTenant'
import { formatByteCount, formatDateTime } from '../lib/format'
import { useRunsModule } from '../lib/modules'
import {
  BANKING_MODULE,
  BANKING_RIGHTS,
  BANK_ACCOUNT_PATH,
  BANK_STATEMENT_PATH,
  IMPORT_STATES,
  MAX_STATEMENT_BYTES,
  bankAccountsKey,
  bankStatementsKey,
  fetchBankAccounts,
  fetchBankStatements,
  importSummary,
  isBeingRead,
  queryStringOf,
  uploadBankStatement,
} from '../lib/banking'
import type { BankStatementImport, ImportState } from '../lib/types'

/**
 * The bank statements that were fed in.
 *
 * <p><b>The list is the receipt of the import.</b> The upload answers before the file is read,
 * so the counters are what tells somebody whether it worked — and the duplicates are named,
 * never hidden: whoever imports the camt.053 after the camt.054 sees «0 neu» and has to be
 * able to tell that this is the right answer and not a lost file (backend ADR-0107).
 *
 * <p><b>The list is not behind the module switch.</b> An imported statement is a booking
 * voucher with a ten-year retention; only the upload asks whether the tenant runs the module
 * (ADR-0041).
 */
export function BankStatementListPage() {
  return (
    <RequireTenant permission={BANKING_RIGHTS.read}>
      {(tenantId) => <BankStatements tenantId={tenantId} />}
    </RequireTenant>
  )
}

function BankStatements({ tenantId }: { tenantId: number }) {
  const { can } = useAuth()
  const runs = useRunsModule()
  const mayImport = can(BANKING_RIGHTS.importFile) && runs(BANKING_MODULE)

  const [accountId, setAccountId] = useState('')
  const [state, setState] = useState<'' | ImportState>('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [uploading, setUploading] = useState(false)

  const query = {
    accountId: accountId === '' ? undefined : Number(accountId),
    state: state === '' ? undefined : state,
    from: from === '' ? undefined : from,
    to: to === '' ? undefined : to,
  }

  const accounts = useQuery({
    queryKey: bankAccountsKey(tenantId),
    queryFn: () => fetchBankAccounts(tenantId),
  })

  const imports = useQuery({
    queryKey: bankStatementsKey(tenantId, queryStringOf(query)),
    queryFn: () => fetchBankStatements(tenantId, query),
    // Only while a file is still being read. An idle list must not keep asking for nothing;
    // a list with an unread file in it is stale within seconds.
    refetchInterval: (result) => ((result.state.data ?? []).some(isBeingRead) ? 1500 : false),
  })

  const rows = imports.data ?? []
  const noAccounts = !accounts.isLoading && (accounts.data ?? []).length === 0

  const columns: Column<BankStatementImport>[] = [
    {
      key: 'file',
      header: 'Datei',
      render: (row) => (
        <div>
          <div className="font-medium">{row.fileName}</div>
          <div className="text-[12px] text-text-tertiary">
            {row.messageType.replace('_', '.').toLowerCase()} · {formatByteCount(row.byteCount)}
          </div>
        </div>
      ),
    },
    {
      key: 'account',
      header: 'Konto',
      hideBelow: 'sm',
      render: (row) => (
        <div>
          <div>{row.accountLabel ?? '-'}</div>
          {row.accountIban && (
            <div className="text-[12px] text-text-tertiary">{row.accountIban}</div>
          )}
        </div>
      ),
    },
    {
      key: 'sequence',
      header: 'Auszug',
      align: 'right',
      hideBelow: 'sm',
      render: (row) => row.electronicSequenceNumber ?? '-',
    },
    {
      key: 'when',
      header: 'Eingelesen',
      render: (row) => (
        <div>
          <div>{formatDateTime(row.createdAt)}</div>
          <div className="text-[12px] text-text-tertiary">{row.createdBy}</div>
        </div>
      ),
    },
    {
      key: 'result',
      header: 'Ergebnis',
      render: (row) => (
        <div className="grid gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={toneOf(row.state)}>{IMPORT_STATES[row.state]}</Badge>
            <span className="text-[13px]">{importSummary(row)}</span>
          </div>
          {row.sequenceGap && (
            <div className="text-[12px] text-danger">{row.sequenceGap}</div>
          )}
          {row.copyDuplicateIndicator && (
            <div className="text-[12px] text-text-tertiary">
              Von der Bank als Kopie gekennzeichnet ({row.copyDuplicateIndicator})
            </div>
          )}
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Bankauszüge"
        subtitle="Eingelesene camt.053- und camt.054-Dateien. Ein Posten daraus gleicht noch keine Rechnung aus."
      >
        {mayImport && (
          <Button onClick={() => setUploading(true)} disabled={noAccounts}>
            Auszug einlesen
          </Button>
        )}
      </PageHeader>

      <div className="grid gap-4 px-8 pb-12">
        {mayImport && noAccounts && (
          <WarningNotice>
            Es ist noch kein Bankkonto erfasst. Ein Auszug wird nur angenommen, wenn seine IBAN
            hier steht — sonst landete der Auszug eines fremden Mandanten unbemerkt in diesen
            Büchern.{' '}
            <Link className="underline" to={BANK_ACCOUNT_PATH}>
              Bankkonten erfassen
            </Link>
          </WarningNotice>
        )}

        <Panel padded={false} title="Eingelesene Dateien">
          <div className="flex flex-wrap items-end gap-4 px-5 pb-4">
            <span className="w-full max-w-[220px]">
              <SelectField
                label="Konto"
                value={accountId}
                onChange={(event) => setAccountId(event.target.value)}
              >
                <option value="">Alle Konten</option>
                {(accounts.data ?? []).map((account) => (
                  <option key={account.id} value={String(account.id)}>
                    {account.label}
                  </option>
                ))}
              </SelectField>
            </span>
            <span className="w-full max-w-[200px]">
              <SelectField
                label="Zustand"
                value={state}
                onChange={(event) => setState(event.target.value as '' | ImportState)}
              >
                <option value="">Alle</option>
                {(Object.keys(IMPORT_STATES) as ImportState[]).map((code) => (
                  <option key={code} value={code}>
                    {IMPORT_STATES[code]}
                  </option>
                ))}
              </SelectField>
            </span>
            <span className="w-full max-w-[170px]">
              <TextField
                label="Eingelesen ab"
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </span>
            <span className="w-full max-w-[170px]">
              <TextField
                label="Eingelesen bis"
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            </span>
          </div>

          <DataTable
            columns={columns}
            rows={rows}
            keyOf={(row) => row.id}
            loading={imports.isLoading}
            error={imports.error}
            rowTo={(row) => `${BANK_STATEMENT_PATH}/${row.id}`}
            empty={
              <EmptyState
                title="Noch kein Auszug eingelesen"
                description="Laden Sie eine camt.053- oder camt.054-Datei aus dem E-Banking herunter und lesen Sie sie hier ein."
              />
            }
          />
        </Panel>
      </div>

      <UploadDialog
        tenantId={tenantId}
        open={uploading}
        onClose={() => setUploading(false)}
      />
    </>
  )
}

function UploadDialog({
  tenantId,
  open,
  onClose,
}: {
  tenantId: number
  open: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [file, setFile] = useState<File | null>(null)

  const send = useMutation({
    mutationFn: (chosen: File) => uploadBankStatement(tenantId, chosen),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: bankStatementsKey(tenantId) })
      setFile(null)
      onClose()
    },
  })

  function submit() {
    if (file !== null) send.mutate(file)
  }

  return (
    <Dialog
      open={open}
      title="Bankauszug einlesen"
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={submit} disabled={file === null} busy={send.isPending}>
            Einlesen
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <FileDropField
          label="camt-Datei hierher ziehen oder auswählen"
          accept=".xml,application/xml,text/xml"
          maxBytes={MAX_STATEMENT_BYTES}
          hint="camt.053 (Kontoauszug) oder camt.054 (Avisierung), höchstens 20 MB"
          onSelect={setFile}
        />
        <p className="text-[13px] text-text-secondary">
          Dieselbe Datei ein zweites Mal einzulesen ist erlaubt und ändert nichts: bereits
          erfasste Posten werden als «doppelt» gezählt statt erneut gutgeschrieben.
        </p>
        {send.error !== null && <ErrorNotice error={send.error} />}
      </div>
    </Dialog>
  )
}

function toneOf(state: ImportState) {
  if (state === 'FAILED') return 'danger' as const
  if (state === 'RECEIVED') return 'neutral' as const
  return 'success' as const
}
