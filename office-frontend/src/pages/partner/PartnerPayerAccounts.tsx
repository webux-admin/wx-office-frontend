import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { Button } from '../../components/Button'
import { ErrorNotice } from '../../components/Notice'
import { Panel } from '../../components/Panel'
import { useAuth } from '../../auth/useAuth'
import { formatDate } from '../../lib/format'
import { BANKING_MODULE } from '../../lib/banking'
import { useRunsModule } from '../../lib/modules'
import {
  MATCHING_RIGHTS,
  fetchPayerAccounts,
  forgetPayerAccount,
  payerAccountsKey,
} from '../../lib/matching'

/**
 * The bank accounts this customer has been seen to pay from.
 *
 * <p><b>Shown so it can be removed.</b> A learned IBAN is a new personal datum on the master
 * record: the right of access under revDSG Art. 25 needs a place that shows it, and the right
 * of erasure a button that removes it. A datum nobody can see is a right nobody can exercise
 * (backend ADR-0108).
 *
 * <p>The same IBAN in the archived bank statement stays for ten years (OR Art. 958f) — master
 * data can be erased, finalised documents cannot. That line is drawn in the backend; this
 * screen only makes the erasable half reachable.
 *
 * <p>Nothing at all is shown where the tenant does not run the banking module: without
 * statements nothing was ever learned.
 */
export function PartnerPayerAccounts({
  tenantId,
  partnerId,
}: {
  tenantId: number
  partnerId: number
}) {
  const { can } = useAuth()
  const runs = useRunsModule()
  const queryClient = useQueryClient()
  const mayForget = can(MATCHING_RIGHTS.forgetAccount)

  const accounts = useQuery({
    queryKey: payerAccountsKey(tenantId, partnerId),
    queryFn: () => fetchPayerAccounts(tenantId, partnerId),
    enabled: runs(BANKING_MODULE) && can(MATCHING_RIGHTS.read),
  })

  const forget = useMutation({
    mutationFn: (accountId: number) => forgetPayerAccount(tenantId, partnerId, accountId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: payerAccountsKey(tenantId, partnerId) })
    },
  })

  if (!runs(BANKING_MODULE) || !can(MATCHING_RIGHTS.read)) {
    return null
  }
  const rows = accounts.data ?? []
  if (rows.length === 0) {
    return null
  }

  return (
    <Panel title="Gelernte Zahlungskonten">
      <p className="mb-3 text-[13px] text-text-secondary">
        Von diesen Konten hat dieser Kunde bezahlt. Gelernt wird nur aus bestätigten
        Zuordnungen; die Angabe hilft, eine Zahlung ohne Referenz zuzuordnen.
      </p>
      <ul className="grid gap-2">
        {rows.map((account) => (
          <li
            key={account.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-line px-3 py-2"
          >
            <span className="grid">
              <span className="font-mono text-[13px]">{account.debtorIban}</span>
              <span className="text-[12px] text-text-tertiary">
                seit {formatDate(account.learnedAt)} · {account.hitCount}
                {account.hitCount === 1 ? ' Bestätigung' : ' Bestätigungen'} · {account.learnedBy}
              </span>
            </span>
            {mayForget && (
              <Button
                variant="secondary"
                onClick={() => forget.mutate(account.id)}
                busy={forget.isPending}
                title="Dieses Zahlungskonto vergessen"
              >
                <Trash2 size={15} aria-hidden />
                Vergessen
              </Button>
            )}
          </li>
        ))}
      </ul>
      {forget.error !== null && (
        <div className="mt-3">
          <ErrorNotice error={forget.error} />
        </div>
      )}
    </Panel>
  )
}
