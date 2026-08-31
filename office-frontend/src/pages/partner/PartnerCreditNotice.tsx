import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { formatAmount } from '../../lib/format'
import {
  CUSTOMER_CREDIT_PATH,
  customerCreditQuery,
  customerCreditsKey,
  fetchCustomerCreditBalances,
} from '../../lib/customerCredit'

/**
 * What this one customer has lying here, shown only while something does.
 *
 * <p><b>A hint, not a register.</b> As long as it is one number per currency it belongs beside
 * the customer, not behind a tab nobody opens: whoever writes an invoice for somebody who has
 * already paid 800 CHF should see it without going looking (backend ADR-0104).
 *
 * <p>One line per currency, never a total across them — CHF and EUR do not add up. And never
 * netted against what the customer owes: OR Art. 958c Abs. 1 Ziff. 7 forbids offsetting assets
 * against liabilities.
 *
 * @param partnerId the customer
 */
export function PartnerCreditNotice({
  tenantId,
  partnerId,
}: {
  tenantId: number
  partnerId: number
}) {
  const query = customerCreditQuery({ partnerId })
  const balances = useQuery({
    queryKey: [...customerCreditsKey(tenantId), 'balances', query],
    queryFn: () => fetchCustomerCreditBalances(tenantId, query),
  })

  const rows = (balances.data ?? []).filter((row) => row.partnerId === partnerId)
  if (rows.length === 0) return null

  return (
    <div className="mt-6 rounded-[var(--radius-lg)] border border-line-subtle bg-surface px-5 py-4">
      <p className="text-[13px]">
        Dieser Kunde hat Geld bei uns liegen:{' '}
        {rows.map((row, index) => (
          <span key={row.currency}>
            {index > 0 && ', '}
            <span className="font-medium tabular-nums">
              {formatAmount(row.balance)} {row.currency}
            </span>
          </span>
        ))}
        .
      </p>
      <p className="mt-1 text-[12px] text-text-secondary">
        Es wird nicht gegen offene Rechnungen verrechnet — dazu braucht es eine Erklärung
        (OR Art. 120 ff.).{' '}
        <Link className="underline" to={`${CUSTOMER_CREDIT_PATH}`}>
          Zum Guthaben
        </Link>
      </p>
    </div>
  )
}
