import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { DataTable, type Column } from '../../components/DataTable'
import { IconButton } from '../../components/IconButton'
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
import type { LearnedAccount } from '../../lib/types'

/**
 * The bank accounts this customer has been seen to pay from.
 *
 * <p><b>Shown so it can be removed.</b> A learned IBAN is a new personal datum on the master
 * record: the right of access under revDSG Art. 25 needs a place that shows it, and the duty
 * to erase under Art. 6 Abs. 4 — enforceable through Art. 32 Abs. 2 Bst. c — a button that
 * removes it. A datum nobody can see is a right nobody can exercise
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
  const [forgetting, setForgetting] = useState<LearnedAccount | null>(null)

  const accounts = useQuery({
    queryKey: payerAccountsKey(tenantId, partnerId),
    queryFn: () => fetchPayerAccounts(tenantId, partnerId),
    enabled: runs(BANKING_MODULE) && can(MATCHING_RIGHTS.read),
  })

  const forget = useMutation({
    mutationFn: (accountId: number) => forgetPayerAccount(tenantId, partnerId, accountId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: payerAccountsKey(tenantId, partnerId) })
      setForgetting(null)
    },
  })

  if (!runs(BANKING_MODULE) || !can(MATCHING_RIGHTS.read)) {
    return null
  }
  const rows = accounts.data ?? []
  if (rows.length === 0) {
    return null
  }

  const columns: Column<LearnedAccount>[] = [
    {
      key: 'iban',
      header: 'IBAN',
      render: (account) => <span className="font-mono">{account.debtorIban}</span>,
    },
    {
      key: 'learnedAt',
      header: 'Gelernt am',
      width: 'w-column-sm',
      render: (account) => formatDate(account.learnedAt),
    },
    {
      key: 'hits',
      header: 'Bestätigungen',
      align: 'right',
      width: 'w-column-sm',
      render: (account) => account.hitCount,
    },
    {
      key: 'learnedBy',
      header: 'Von',
      width: 'w-column-md',
      render: (account) => <span className="text-text-secondary">{account.learnedBy}</span>,
    },
    {
      key: 'actions',
      header: '',
      width: 'w-column-xs',
      render: (account) =>
        mayForget ? (
          <span className="flex justify-end">
            <IconButton
              label={`Zahlungskonto ${account.debtorIban} vergessen`}
              onClick={() => {
                forget.reset()
                setForgetting(account)
              }}
              tone="danger"
            >
              <Trash2 size={14} aria-hidden />
            </IconButton>
          </span>
        ) : null,
    },
  ]

  return (
    <>
      <Panel title="Gelernte Zahlungskonten" padded={false}>
        <DataTable
          columns={columns}
          rows={rows}
          keyOf={(account) => account.id}
          empty={null}
        />
      </Panel>

      <ConfirmDialog
        open={forgetting !== null}
        title="Zahlungskonto vergessen"
        confirmLabel="Vergessen"
        tone="danger"
        onConfirm={() => forgetting !== null && forget.mutate(forgetting.id)}
        onCancel={() => setForgetting(null)}
        busy={forget.isPending}
        error={forget.error}
      >
        {forgetting?.debtorIban} wird beim Kunden vergessen. Eine Zahlung von diesem Konto ohne
        Referenz wird danach nicht mehr diesem Kunden vorgeschlagen. Eingelesene Bankauszüge
        behalten die IBAN.
      </ConfirmDialog>
    </>
  )
}
