import { useQuery } from '@tanstack/react-query'
import { attentionKey, fetchAttention } from '../lib/accounting'
import { fetchWorklistCount, worklistCountKey } from '../lib/clearing'
import type { NavCounterKey } from './navigation'

/**
 * The numbers the sidebar shows beside its entries.
 *
 * <p><b>It lives here and not in a `lib/` module, because the sidebar is its only caller.</b>
 * Until now it sat in `lib/clearing.ts` and answered a `WorklistCount` — the count of one
 * screen — which is why a second counter could not use it. What travels now is a map keyed by
 * the counter, so every entry reads its own number and none of them knows about the others.
 *
 * <p><b>Both queries are declared unconditionally and each is switched on by its key.</b> Hooks
 * may not be called in a condition, and a hook per counter would multiply with the list. React
 * Query folds the calls of the individual `NavItem`s together over the query key, so it stays
 * at one request per counter however many entries ask.
 *
 * <p><b>A failure shows nothing.</b> No badge, no red box — a navigation showing an error is
 * more broken than one showing no number (ADR-0043). Hence `retry: false` and an empty map.
 *
 * @param tenantId the tenant, `null` while none is chosen
 * @param counter  which counter this entry wants, `undefined` for an entry without one
 * @returns the numbers that could be read; a counter that failed or was not asked is missing
 */
export function useNavCounters(
  tenantId: number | null | undefined,
  counter: NavCounterKey | undefined,
): Partial<Record<NavCounterKey, number>> {
  const tenant = tenantId ?? 0
  const known = tenantId !== null && tenantId !== undefined

  const clearing = useQuery({
    queryKey: worklistCountKey(tenant),
    queryFn: () => fetchWorklistCount(tenant),
    enabled: known && counter === 'CLEARING',
    // A number that changes once or twice a day needs no faster poll; coming back to the tab
    // is the moment it matters.
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    retry: false,
  })

  const drafts = useQuery({
    queryKey: attentionKey(tenant),
    queryFn: () => fetchAttention(tenant),
    enabled: known && counter === 'ACCOUNTING_DRAFTS',
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    retry: false,
  })

  const counts: Partial<Record<NavCounterKey, number>> = {}
  if (clearing.data !== undefined) {
    counts.CLEARING = clearing.data.open
  }
  // Only where a period is actually about to be locked. In hand bookkeeping a draft is the
  // normal state of an entry somebody is in the middle of, and a permanent badge for the
  // normal case is the fastest way to teach people to stop looking at badges — on the very
  // channel real trouble is reported through. The deadline itself is worked out by the
  // backend, where the three bolts and the clock are; the screen only asks whether the field
  // is filled.
  if (drafts.data !== undefined && drafts.data.lockingOn !== null
      && drafts.data.lockingOn !== undefined) {
    counts.ACCOUNTING_DRAFTS = drafts.data.drafts
  }
  return counts
}
