import { useQuery } from '@tanstack/react-query'
import {
  customerCreditQuery,
  customerCreditsKey,
  fetchCustomerCreditBalances,
} from '../../lib/customerCredit'
import type { CustomerCreditBalance } from '../../lib/types'

/**
 * The money a customer has lying with us, one balance per currency.
 *
 * <p>Read for the summary above the registers: whoever writes an invoice for somebody who has
 * already paid should see it without going looking (backend ADR-0104).
 *
 * @param tenantId the tenant
 * @param partnerId the customer
 * @param enabled false where the reader lacks the right or the record is a supplier
 * @returns the balances of this customer, empty while loading and when there are none
 */
export function usePartnerCredit(
  tenantId: number,
  partnerId: number,
  enabled: boolean,
): CustomerCreditBalance[] {
  const query = customerCreditQuery({ partnerId })
  const balances = useQuery({
    queryKey: [...customerCreditsKey(tenantId), 'balances', query],
    queryFn: () => fetchCustomerCreditBalances(tenantId, query),
    enabled,
  })
  return (balances.data ?? []).filter((row) => row.partnerId === partnerId)
}
