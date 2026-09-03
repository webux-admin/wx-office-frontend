import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { ErrorNotice, LoadingBlock } from '../../components/Notice'
import { QuickSearchField } from '../../components/QuickSearch'
import { useQuickSearch } from '../../components/useQuickSearch'
import { useAuth } from '../../auth/useAuth'
import {
  ACCOUNTING_RIGHTS,
  accountTypeLabel,
  accountsKey,
  assignSystemKey,
  fetchAccounts,
  fetchSystemKeys,
  systemKeysKey,
} from '../../lib/accounting'
import { listQuery, PICKER_SIZE } from '../../lib/paging'
import type { Account, SystemKey } from '../../lib/types'
import { useCatalogue } from '../../masterdata/useMasterData'

/**
 * Which account answers which question the software asks itself.
 *
 * <p>**The questions come from `GET /accounts/system-keys`**, and the key itself appears
 * nowhere: `JAHRESERGEBNIS_ER` means nothing to anybody, while «Welches Konto führt Ihren
 * Jahresgewinn in der Erfolgsrechnung?» can be answered without a manual. Reading the list needs
 * `ACCOUNTING_READ`, moving a key needs `ACCOUNTING_CONFIGURE` (backend ADR-0112).
 *
 * <p>Reachable from the chart of accounts rather than only from the error message of whatever
 * needed a key, so that a chart can be finished before the first posting runs into a gap.
 */
export function SystemAccountDialog({
  tenantId,
  onClose,
}: {
  tenantId: number
  onClose: () => void
}) {
  const { can } = useAuth()
  const mayConfigure = can(ACCOUNTING_RIGHTS.configure)
  const [asking, setAsking] = useState<SystemKey | null>(null)

  const keys = useQuery({
    queryKey: systemKeysKey(tenantId),
    queryFn: () => fetchSystemKeys(tenantId),
  })

  if (asking !== null) {
    return (
      <OneKey
        tenantId={tenantId}
        systemKey={asking}
        mayConfigure={mayConfigure}
        onBack={() => setAsking(null)}
      />
    )
  }

  return (
    <Dialog
      open
      wide
      onClose={onClose}
      title="Systemkonten prüfen"
      description="Wofür die Buchhaltung von sich aus ein Konto braucht."
      footer={
        <Button variant="secondary" onClick={onClose}>
          Schliessen
        </Button>
      }
    >
      {keys.error !== null && <ErrorNotice error={keys.error} />}
      {keys.error === null && keys.data === undefined && <LoadingBlock />}
      {keys.data !== undefined && (
        <ul className="grid gap-1">
          {keys.data.map((entry) => (
            <li key={entry.key}>
              <button
                type="button"
                onClick={() => setAsking(entry)}
                className="w-full rounded-[var(--radius-md)] px-3 py-2 text-left transition-colors hover:bg-sunken"
              >
                <span className="block text-[13px]">{entry.question}</span>
                <span className="block text-[12px] text-text-secondary">
                  {entry.account === undefined ? (
                    '— nicht gesetzt —'
                  ) : (
                    <>
                      <span className="font-mono">{entry.account.accountNumber}</span>{' '}
                      {entry.account.name}
                    </>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  )
}

/**
 * One question, and the accounts that may answer it.
 *
 * <p>The picker shows only what `allowedTypes` permits and only accounts that are switched on —
 * the endpoint refuses both cases with 400, and running into a refusal teaches nobody anything.
 * **Account 9200 is among them** for the closing key: it is barred from being posted to by hand,
 * not from carrying a key.
 */
function OneKey({
  tenantId,
  systemKey,
  mayConfigure,
  onBack,
}: {
  tenantId: number
  systemKey: SystemKey
  mayConfigure: boolean
  onBack: () => void
}) {
  const queryClient = useQueryClient()
  const types = useCatalogue(tenantId, 'account-type')
  const search = useQuickSearch()
  const [chosen, setChosen] = useState<Account | null>(null)

  // Searched over the whole chart and narrowed here rather than through the `accountType`
  // parameter: a key may accept two types, and the endpoint takes one.
  const query = listQuery({
    q: search.term,
    activeOnly: true,
    size: PICKER_SIZE,
    sort: 'accountNumber,asc',
  })
  const accounts = useQuery({
    queryKey: accountsKey(tenantId, query),
    queryFn: () => fetchAccounts(tenantId, query),
    placeholderData: keepPreviousData,
  })
  const offered = (accounts.data?.content ?? []).filter((account) =>
    systemKey.allowedTypes.includes(account.accountType),
  )

  const assign = useMutation({
    mutationFn: (accountId: number) => assignSystemKey(tenantId, systemKey.key, accountId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: systemKeysKey(tenantId) })
      void queryClient.invalidateQueries({ queryKey: ['accounts', tenantId] })
      onBack()
    },
  })

  const submit = () => {
    if (chosen !== null && mayConfigure) assign.mutate(chosen.id)
  }

  return (
    <Dialog
      open
      wide
      onClose={onBack}
      onSubmit={submit}
      title={systemKey.question}
      footer={
        <>
          <Button variant="secondary" onClick={onBack}>
            Abbrechen
          </Button>
          {mayConfigure && (
            <Button onClick={submit} disabled={chosen === null} busy={assign.isPending}>
              Übernehmen
            </Button>
          )}
        </>
      }
    >
      <div className="grid gap-3">
        <p className="text-[13px] text-text-secondary">{systemKey.hint}</p>

        <QuickSearchField
          label="Konto suchen"
          value={search.value}
          onChange={search.setValue}
          placeholder="Nummer oder Bezeichnung"
          maxLength={120}
          className="w-full"
        />

        {accounts.error !== null && <ErrorNotice error={accounts.error} />}
        <ul className="grid max-h-[280px] gap-1 overflow-y-auto">
          {offered.map((account) => (
            <li key={account.id}>
              <button
                type="button"
                onClick={() => setChosen(account)}
                className={`w-full rounded-[var(--radius-md)] px-3 py-2 text-left transition-colors ${
                  chosen?.id === account.id ? 'bg-sunken' : 'hover:bg-sunken'
                }`}
              >
                <span className="text-[13px]">
                  <span className="font-mono text-text-tertiary">{account.accountNumber}</span>{' '}
                  {account.name}
                </span>
                <span className="block text-[12px] text-text-secondary">
                  {accountTypeLabel(types, account.accountType)}
                </span>
              </button>
            </li>
          ))}
          {offered.length === 0 && accounts.data !== undefined && (
            <li className="px-3 py-2 text-[13px] text-text-secondary">
              Kein Konto passt zu dieser Frage. Legen Sie eines an, dessen Kontoart hier zugelassen
              ist.
            </li>
          )}
        </ul>

        {assign.error !== null && <ErrorNotice error={assign.error} />}
      </div>
    </Dialog>
  )
}
