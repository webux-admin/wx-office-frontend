import { useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { PrintLayout } from '../lib/types'
import { normalizeCatalogue } from './catalogue'

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
 * What a form may show and what the sample document says: every value it can place, every
 * column the positions can have, the paper formats and the made up document.
 *
 * <p>Read from the server rather than kept here, so a field added in the backend appears in
 * the designer without a release of this application. The answer is completed before anyone
 * draws from it: the sheet reads it on every pointer move and must never find a hole.
 *
 * @param tenantId the tenant, null while none is chosen
 */
export function usePrintoutFields(tenantId: number | null) {
  return useQuery({
    queryKey: ['print-layout-fields', tenantId],
    queryFn: async () =>
      normalizeCatalogue(await api.get<unknown>(`/api/tenants/${tenantId}/print-layouts/fields`)),
    enabled: tenantId !== null,
    // The catalogue changes with a release of the backend, not while someone is working.
    staleTime: Infinity,
  })
}

/**
 * The QR payment part of the sample document, as an address an `img` can show.
 *
 * <p>Fetched through the API client like every other file, so an expired session ends at the
 * login screen and not in a broken picture. The address is released when the screen closes.
 *
 * @param tenantId the tenant
 * @param enabled false while the sheet does not show the payment part
 * @returns the object URL of the SVG, `undefined` while loading, and whether the request failed
 */
export function useSamplePaymentPart(
  tenantId: number,
  enabled: boolean,
): { url: string | undefined; failed: boolean } {
  const picture = useQuery({
    queryKey: ['print-layout-sample-payment-part', tenantId],
    queryFn: () => api.file(`/api/tenants/${tenantId}/print-layouts/sample-payment-part`),
    enabled,
    staleTime: Infinity,
    retry: false,
  })
  const blob = picture.data?.blob
  const url = useMemo(
    () => (blob === undefined || typeof URL.createObjectURL !== 'function' ? undefined : URL.createObjectURL(blob)),
    [blob],
  )
  useEffect(() => {
    if (url === undefined) return
    return () => URL.revokeObjectURL(url)
  }, [url])
  return { url, failed: picture.isError }
}
