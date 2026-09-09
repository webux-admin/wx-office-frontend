import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ErrorNotice, WarningNotice } from '../../components/Notice'
import { PageHeader } from '../../components/PageHeader'
import { Panel } from '../../components/Panel'
import { SelectField } from '../../components/SelectField'
import { useAuth } from '../../auth/useAuth'
import { RequireTenant } from '../../layout/RequireTenant'
import {
  ACCOUNTING_MODULE,
  ACCOUNTING_RIGHTS,
  fetchTaxCodes,
  fetchWriteOffAccounts,
  saveWriteOffAccount,
  taxCodesKey,
  writeOffAccountsKey,
} from '../../lib/accounting'
import type { WriteOffAccount } from '../../lib/types'
import { AccountSelect } from './AccountSelect'

/**
 * The seven reasons a receivable is given up for, and where each is booked.
 *
 * <p>Fixed order and no more rows: the catalogue of reasons is closed, and a screen that let
 * somebody add one would promise something the backend cannot do with it.
 *
 * <p>The label of each is the one the write-off dialog uses, so a bookkeeper recognises what
 * they are configuring.
 */
const REASONS: { reason: string; label: string; hint?: string }[] = [
  { reason: 'SKONTO', label: 'Skonto' },
  { reason: 'SKONTO_UNBERECHTIGT', label: 'Skonto unberechtigt' },
  { reason: 'KLEINDIFFERENZ', label: 'Kleindifferenz' },
  { reason: 'DEBITORENVERLUST', label: 'Debitorenverlust' },
  { reason: 'BANKSPESEN', label: 'Bankspesen', hint: 'Ändert kein Entgelt.' },
  {
    reason: 'KURSDIFFERENZ',
    label: 'Kursdifferenz',
    hint: 'Verlust und Gewinn liegen auf zwei Konten.',
  },
  { reason: 'UEBERZAHLUNG', label: 'Überzahlung einbehalten' },
]

/** What the tax field offers besides the codes of the tenant. */
const NO_TAX = ''

/**
 * On which accounts this tenant books each of its write-off reasons.
 *
 * <p><b>A step of the setup and not a nicety.</b> Nothing is shipped: the minimal chart carries
 * six of the seven accounts not at all. Until this screen is filled in, a discount is recorded
 * and not booked — silently, the way it was before there were books at all (backend ADR-0128).
 */
export function WriteOffAccountPage() {
  return (
    <RequireTenant permission={ACCOUNTING_RIGHTS.read} module={ACCOUNTING_MODULE}>
      {(tenantId) => <WriteOffAccounts tenantId={tenantId} />}
    </RequireTenant>
  )
}

function WriteOffAccounts({ tenantId }: { tenantId: number }) {
  const { can } = useAuth()
  const queryClient = useQueryClient()
  const mayWrite = can(ACCOUNTING_RIGHTS.configure)

  const mappings = useQuery({
    queryKey: writeOffAccountsKey(tenantId),
    queryFn: () => fetchWriteOffAccounts(tenantId),
  })

  const taxCodes = useQuery({
    queryKey: taxCodesKey(tenantId),
    queryFn: () => fetchTaxCodes(tenantId),
  })

  const save = useMutation({
    mutationFn: (body: {
      reason: string
      debitAccount: string
      creditAccount: string
      taxCode?: string
    }) => saveWriteOffAccount(tenantId, body),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: writeOffAccountsKey(tenantId) }),
  })

  const rows = mappings.data ?? []
  const mappingOf = (reason: string): WriteOffAccount | undefined =>
    rows.find((one) => one.reason === reason)

  /**
   * Sends one row, filling in what the caller did not change.
   *
   * <p>Both accounts travel every time. The endpoint replaces the row as a whole, and sending
   * one of the two would clear the other — the same trap the dunning settings fell into.
   */
  const put = (reason: string, changed: Partial<WriteOffAccount>) => {
    const current = mappingOf(reason)
    const debit = changed.debitAccountNumber ?? current?.debitAccountNumber ?? ''
    const credit = changed.creditAccountNumber ?? current?.creditAccountNumber ?? debit
    const taxCode =
      changed.taxCode !== undefined ? changed.taxCode : (current?.taxCode ?? NO_TAX)
    if (debit === '' || credit === '') return
    save.mutate({
      reason,
      debitAccount: debit,
      creditAccount: credit,
      taxCode: taxCode === NO_TAX ? undefined : taxCode,
    })
  }

  const missing = REASONS.filter((row) => mappingOf(row.reason) === undefined)

  return (
    <>
      <PageHeader
        title="Ausbuchungskonten"
        subtitle="Wohin eine Ausbuchung gebucht wird. Der Steuersatz kommt immer vom Beleg; hier steht nur, welcher Art die Korrektur ist."
      />

      <div className="grid gap-4 px-8 pb-12">
        {mappings.error !== null && mappings.error !== undefined && (
          <ErrorNotice error={mappings.error} />
        )}
        {save.error !== null && save.error !== undefined && <ErrorNotice error={save.error} />}

        {missing.length > 0 && (
          <WarningNotice>
            Solange ein Grund kein Konto hat, wird eine Ausbuchung dafür erfasst und nicht
            gebucht. Ohne Konto sind: {missing.map((row) => row.label).join(', ')}. Fehlt Ihnen
            eines davon im Kontenplan, legen Sie es dort an.
          </WarningNotice>
        )}

        <Panel title="Gründe">
          <div className="grid gap-5">
            {REASONS.map((row) => (
              <div key={row.reason} className="grid gap-3 sm:grid-cols-[200px_1fr_1fr_1fr]">
                <div className="self-center">
                  <span className="font-medium">{row.label}</span>
                  {row.hint && (
                    <span className="block text-[12px] text-text-secondary">{row.hint}</span>
                  )}
                </div>
                <AccountSelect
                  label="Minderung"
                  tenantId={tenantId}
                  accountType={undefined}
                  value={mappingOf(row.reason)?.debitAccountNumber ?? ''}
                  onChange={(number) => put(row.reason, { debitAccountNumber: number })}
                  emptyLabel="– kein Konto –"
                  disabled={!mayWrite || save.isPending}
                />
                <AccountSelect
                  label="Gegenrichtung"
                  tenantId={tenantId}
                  accountType={undefined}
                  value={mappingOf(row.reason)?.creditAccountNumber ?? ''}
                  onChange={(number) => put(row.reason, { creditAccountNumber: number })}
                  emptyLabel="– kein Konto –"
                  disabled={!mayWrite || save.isPending}
                />
                <SelectField
                  label="Art der Korrektur"
                  value={mappingOf(row.reason)?.taxCode ?? NO_TAX}
                  onChange={(event) => put(row.reason, { taxCode: event.target.value })}
                  disabled={!mayWrite || save.isPending}
                >
                  <option value={NO_TAX}>— ohne —</option>
                  {(taxCodes.data?.codes ?? []).map((code) => (
                    <option key={code.id} value={code.code}>
                      {code.code} · {code.name}
                    </option>
                  ))}
                </SelectField>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </>
  )
}
