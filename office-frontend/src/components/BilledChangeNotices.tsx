import { useQuery } from '@tanstack/react-query'
import { Panel } from './Panel'
import { useAuth } from '../auth/useAuth'
import {
  billedChangeNoticeText,
  billedChangeNoticesKey,
  fetchOpenBilledChangeNotices,
  SUBSCRIPTION_RIGHTS,
} from '../lib/subscription'
import type { SubscriptionBilledChangeNotice } from '../lib/types'

/**
 * The open notices of one contract, on the contract screen (issue #120, backend ADR-0154).
 *
 * <p>Shown only where there is something open: a contract without notices gets no empty panel.
 * Acknowledging happens on the subscription run screen, where the reason and the note are
 * taken. A failed read shows nothing, as the run screen does for its own counter.
 *
 * @param tenantId the tenant
 * @param contractId the contract on the screen
 */
export function ContractBilledChangeNotices({
  tenantId,
  contractId,
}: {
  tenantId: number
  contractId: number
}) {
  const { can } = useAuth()
  const notices = useQuery({
    queryKey: [...billedChangeNoticesKey(tenantId), contractId],
    queryFn: () => fetchOpenBilledChangeNotices(tenantId, contractId),
    enabled: can(SUBSCRIPTION_RIGHTS.read),
    retry: false,
  })

  const open = notices.data ?? []
  if (open.length === 0) return null

  return (
    <Panel
      title="Offene Hinweise zu verrechneten Perioden"
      description="Eine Änderung greift in eine Periode, die der Abo-Lauf schon verrechnet hat. Der Hinweis bleibt, bis er auf dem Abo-Lauf quittiert ist."
    >
      <BilledChangeNoticeList notices={open} />
    </Panel>
  )
}

/**
 * A plain list of notices, one sentence each.
 *
 * @param notices the open notices to show
 */
export function BilledChangeNoticeList({
  notices,
}: {
  notices: SubscriptionBilledChangeNotice[]
}) {
  return (
    <ul className="grid gap-3">
      {notices.map((notice) => (
        <li key={notice.id} className="text-body text-text-primary">
          <span className="font-medium">{notice.contractNumber}</span>
          {': '}
          {billedChangeNoticeText(notice)}
        </li>
      ))}
    </ul>
  )
}
