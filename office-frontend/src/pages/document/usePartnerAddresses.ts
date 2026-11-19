import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import type { Partner, PartnerAddress } from '../../lib/types'

/**
 * The stored addresses of a customer, for picking the one a document goes to.
 *
 * @param tenantId  the tenant
 * @param partnerId the customer, `null` while none is chosen
 * @returns the addresses, the default one first; empty while loading or without a customer
 */
export function usePartnerAddresses(tenantId: number, partnerId: number | null): PartnerAddress[] {
  const partner = useQuery({
    queryKey: ['partner', tenantId, String(partnerId)],
    queryFn: () => api.get<Partner>(`/api/tenants/${tenantId}/partners/${partnerId}`),
    enabled: partnerId !== null,
  })
  const addresses = partner.data?.addresses ?? []
  return [...addresses].sort((a, b) => Number(b.useAsDefault) - Number(a.useAsDefault))
}
