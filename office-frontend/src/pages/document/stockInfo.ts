/**
 * What the document mask asks the inventory: how much of this can we still sell.
 *
 * <p>None of it is worked out here. Free is stock less what issued orders have spoken for, and
 * that subtraction lives in the backend, at one place (its ADR-0066). This file only decides
 * when to ask and when to keep quiet.
 */
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useAuth } from '../../auth/useAuth'
import { api } from '../../lib/api'
import { INVENTORY_RIGHTS, availabilityKey, availabilityUrl } from '../../lib/inventory'
import { stockCheckKey, type SalesDocumentKind } from '../../lib/salesDocument'
import type { ProductAvailability, StockCheck } from '../../lib/types'

/**
 * What is free of the chosen product, for the fact box of the position dialog.
 *
 * <p>Asked only with the right to read the inventory. Without it every keystroke in the
 * product field would fire a request that comes back 403 — a permission check working exactly
 * as designed, and a stream of red in the network tab that hides real failures.
 *
 * @param tenantId the tenant
 * @param productId the chosen product, undefined while none is
 * @returns the query; without data while it is on its way, and after a refusal
 */
export function useAvailability(tenantId: number, productId: number | undefined) {
  const { can } = useAuth()
  return useQuery({
    queryKey: availabilityKey(tenantId, productId ?? 0),
    queryFn: () =>
      api.get<ProductAvailability>(availabilityUrl(tenantId, productId as number)),
    enabled: can(INVENTORY_RIGHTS.read) && productId !== undefined,
    // The figure is an aside next to the price, not what the dialog is here for. A product the
    // inventory has nothing for is left without a figure rather than asked about three times.
    retry: false,
  })
}

/**
 * What is free of every hit on screen, in one request.
 *
 * <p>One request per answer of the hit list, not one per row: the search fires every 200 ms and
 * shows twenty products, so a request per row would be twenty round trips per keystroke. The
 * backend reads them in a single statement with an `IN` list.
 *
 * <p>The figures of the previous answer stay on screen while the next one is on its way — a
 * number that blinks out on every keystroke is worse than one that is a moment old.
 *
 * @param tenantId the tenant
 * @param productIds the products of the hit list, may be empty
 * @returns the query; without data while it is on its way, and after a refusal
 */
export function useAvailabilities(tenantId: number, productIds: readonly number[]) {
  const { can } = useAuth()
  return useQuery({
    queryKey: availabilityKey(tenantId, productIds),
    queryFn: () => api.get<ProductAvailability[]>(availabilityUrl(tenantId, productIds)),
    enabled: can(INVENTORY_RIGHTS.read) && productIds.length > 0,
    placeholderData: keepPreviousData,
    retry: false,
  })
}

/**
 * What the document would be short of if it were issued now.
 *
 * <p>A reading: it books nothing, holds nothing and changes nothing, which is why it is a
 * `GET`. Only for a draft with at least one position — an issued document has already moved
 * what it moves, and an empty draft asks for nothing.
 *
 * @param tenantId the tenant
 * @param kind which of the four kinds of document this is
 * @param documentId the document
 * @param enabled false keeps the query from running at all
 * @returns the query; without data while it is on its way, and after a refusal
 */
export function useStockCheck(
  tenantId: number,
  kind: SalesDocumentKind,
  documentId: number,
  enabled: boolean,
) {
  const { can } = useAuth()
  return useQuery({
    queryKey: stockCheckKey(kind, tenantId, documentId),
    queryFn: () =>
      api.get<StockCheck>(
        `/api/tenants/${tenantId}/${kind.resource}/${documentId}/stock-check`,
      ),
    enabled: enabled && can(INVENTORY_RIGHTS.read),
    // A pre-check that fails must not hold anybody up, so it is not retried either: the
    // binding check runs when the document is issued.
    retry: false,
  })
}
