import type { QueryClient } from '@tanstack/react-query'
import { SALES_DOCUMENT_CACHE_ROOTS } from '../../lib/salesDocument'

/**
 * What goes stale when a partner changes: the partner itself, and the documents written for it.
 *
 * <p>The document roots come from `lib/salesDocument` rather than being written out here. All
 * four kinds follow the partner, and a hand-written list would go on working while quietly
 * missing whichever kind was added last — the mask would keep showing an address the customer
 * has moved away from.
 */
const STALE_AFTER_PARTNER_CHANGE = ['partner', 'partners', ...SALES_DOCUMENT_CACHE_ROOTS]

/**
 * Marks everything stale that a change to a partner reaches.
 *
 * <p>Beyond the partner record: a draft written for this partner follows their address, so a
 * cached document is out of date from here on (ADR-0040). The backend pulls the change
 * through asynchronously, which is why this only marks the documents stale instead of
 * writing anything — the next look at one reads it again.
 *
 * @param queryClient the cache to mark
 * @param tenantId    the tenant whose entries are affected
 */
export function invalidateAfterPartnerChange(queryClient: QueryClient, tenantId: number) {
  for (const key of STALE_AFTER_PARTNER_CHANGE) {
    // Caught, not merely discarded: a refused refetch is not the caller's problem — the mask
    // has already saved by then — but an unhandled rejection would still be reported as one.
    void queryClient.invalidateQueries({ queryKey: [key, tenantId] }).catch(() => undefined)
  }
}
