/**
 * Reading the selection values of a tenant.
 *
 * <p>Three endpoints, because the backend keeps three kinds apart: the lists a tenant
 * maintains itself (legal forms, units, languages …), the catalogues of the structural enums,
 * whose values are fixed in code and only presented the way the tenant wants, and the payment
 * terms, which carry discount stages and therefore a table of their own.
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { useCallback } from 'react'
import { api } from '../lib/api'
import { labelForCode } from '../lib/masterData'
import type {
  CatalogueEntry,
  CatalogueName,
  Catalogues,
  MasterDataEntry,
  MasterDataList,
  PaymentTerm,
} from '../lib/types'

/**
 * Selection values are read on almost every mask and change a few times a year. Holding
 * them for five minutes keeps the masks from asking again on every navigation.
 */
const STALE_TIME = 5 * 60_000

/**
 * One maintained selection list.
 *
 * <p>Reading only the values that may still be chosen needs no permission, which is what
 * every mask with a dropdown does. The full list, deactivated values included, is for the
 * maintenance screen and answers 403 without `MASTERDATA_READ`.
 *
 * @param tenantId the tenant whose list is meant, null while none is chosen
 * @param list the list, by the path segment it is served under
 * @param activeOnly whether values that may no longer be chosen are left out
 */
export function useMasterDataList(
  tenantId: number | null,
  list: MasterDataList,
  activeOnly = true,
): UseQueryResult<MasterDataEntry[]> {
  return useQuery({
    queryKey: ['master-data', tenantId, list, activeOnly],
    queryFn: () =>
      api.get<MasterDataEntry[]>(`/api/tenants/${tenantId}/${list}?activeOnly=${activeOnly}`),
    enabled: tenantId !== null,
    staleTime: STALE_TIME,
  })
}

/**
 * The values of one list for a dropdown, without the states around them.
 *
 * <p>A dropdown has nothing to show while its values are on the way and nothing to say when
 * they do not arrive: the mask around it already reports that. What the record carries stays
 * selectable either way, see {@link selectOptions}.
 *
 * @param tenantId the tenant whose list is meant, null while none is chosen
 * @param list the list, by the path segment it is served under
 * @returns the values that may be chosen, empty while loading and after an error
 */
export function useMasterDataEntries(
  tenantId: number | null,
  list: MasterDataList,
): MasterDataEntry[] {
  return useMasterDataList(tenantId, list).data ?? []
}

/**
 * Every catalogue at once, which is one request instead of nine.
 *
 * @param tenantId the tenant whose presentation is meant, null while none is chosen
 */
export function useCatalogues(tenantId: number | null): UseQueryResult<Catalogues> {
  return useQuery({
    queryKey: ['catalogues', tenantId],
    queryFn: () => api.get<Catalogues>(`/api/tenants/${tenantId}/catalogues`),
    enabled: tenantId !== null,
    staleTime: STALE_TIME,
  })
}

/**
 * The values of one catalogue.
 *
 * @param tenantId the tenant whose presentation is meant
 * @param name the catalogue, by the path segment it is served under
 * @returns the values in dropdown order, empty while loading and after an error
 */
export function useCatalogue(tenantId: number | null, name: CatalogueName): CatalogueEntry[] {
  return useCatalogues(tenantId).data?.[name] ?? []
}

/**
 * Labels one code of a catalogue, for tables and headings that only show a value.
 *
 * @param tenantId the tenant whose presentation is meant
 * @param name the catalogue, by the path segment it is served under
 * @returns a function turning a code into its label
 */
export function useCatalogueLabel(
  tenantId: number | null,
  name: CatalogueName,
): (code: string | undefined | null) => string {
  const entries = useCatalogue(tenantId, name)
  return useCallback((code: string | undefined | null) => labelForCode(entries, code), [entries])
}

/**
 * The payment conditions of the tenant.
 *
 * <p>Same rule as with the lists: reading only what may still be chosen needs no permission,
 * the full set is for the maintenance screen.
 *
 * @param tenantId the tenant whose terms are meant, null while none is chosen
 * @param activeOnly whether terms that may no longer be chosen are left out
 */
export function usePaymentTerms(
  tenantId: number | null,
  activeOnly = true,
): UseQueryResult<PaymentTerm[]> {
  return useQuery({
    queryKey: ['payment-terms', tenantId, activeOnly],
    queryFn: () =>
      api.get<PaymentTerm[]>(
        `/api/tenants/${tenantId}/payment-terms?activeOnly=${activeOnly}`,
      ),
    enabled: tenantId !== null,
    staleTime: STALE_TIME,
  })
}
