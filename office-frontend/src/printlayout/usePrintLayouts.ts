import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { PrintLayout, PrintLayoutFields } from '../lib/types'

/**
 * The forms of a tenant.
 *
 * <p>Its own query key, so every dropdown and the designer share one request.
 *
 * @param tenantId the tenant, null while none is chosen
 */
export function usePrintLayouts(tenantId: number | null) {
  return useQuery({
    queryKey: ['print-layouts', tenantId],
    queryFn: () => api.get<PrintLayout[]>(`/api/tenants/${tenantId}/print-layouts`),
    enabled: tenantId !== null,
  })
}

/**
 * What a form may show: every value it can place, and every column the positions can have.
 *
 * <p>Read from the server rather than kept here, so a field added in the backend appears in
 * the designer without a release of this application.
 *
 * @param tenantId the tenant, null while none is chosen
 */
export function usePrintoutFields(tenantId: number | null) {
  return useQuery({
    queryKey: ['print-layout-fields', tenantId],
    queryFn: () =>
      api.get<PrintLayoutFields>(`/api/tenants/${tenantId}/print-layouts/fields`),
    enabled: tenantId !== null,
    // The catalogue changes with a release of the backend, not while someone is working.
    staleTime: Infinity,
  })
}
