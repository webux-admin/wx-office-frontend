import { api } from '../../lib/api'
import { listQuery } from '../../lib/paging'
import type { Page, Partner } from '../../lib/types'

/** What the customer type-ahead needs of a hit: whom it names, and how. */
export type CustomerHit = { id: number; partnerNumber?: string | null; name: string }

/**
 * Where the customer type-ahead gets its hits.
 *
 * @property key cache key the search term is appended to
 * @property load asks for the hits of one term, at most twenty
 */
export type CustomerSource<T extends CustomerHit> = {
  key: readonly unknown[]
  load: (term: string) => Promise<T[]>
}

/**
 * Hits shown at a time.
 *
 * <p>Twenty, not the whole list of customers: this list is read, not scrolled. Whoever needs
 * more is better served by another word in the field.
 */
export const CUSTOMER_HITS = 20

/**
 * The active customers of the partner module, by name, for the masks of documents.
 *
 * @param tenantId the tenant
 * @returns the source; its key starts with `['partners', tenantId]`, so a change to a partner
 *          refreshes it
 */
export function partnerCustomerSource(tenantId: number): CustomerSource<Partner> {
  return {
    key: ['partners', tenantId, 'customer-search'],
    load: async (term) => {
      const query = listQuery({
        role: 'customer',
        search: term,
        activeOnly: true,
        size: CUSTOMER_HITS,
        sort: 'name,asc',
      })
      const page = await api.get<Page<Partner>>(`/api/tenants/${tenantId}/partners?${query}`)
      return page.content
    },
  }
}

/**
 * How a customer is written in the search field once they were taken over.
 *
 * <p>Number first, because that is what somebody who knows the customer types. A customer
 * without one is named by name alone rather than by a leading separator.
 *
 * @param partner the customer, absent while none is chosen
 * @returns for example «K-1001 · Druckerei Meier AG», empty where none is chosen
 */
export function partnerLabel(partner: CustomerHit | undefined): string {
  if (partner === undefined) return ''
  return partner.partnerNumber ? `${partner.partnerNumber} · ${partner.name}` : partner.name
}

/**
 * What the live region of the open list says.
 *
 * <p>Silent while the answer is still on its way or was refused: the first would announce a
 * count that is about to change, and the second is announced by the alert next to it.
 *
 * @param pending true while the first answer is still on its way
 * @param failed true where the customers could not be read
 * @param count how many hits are on screen
 * @returns the sentence to announce, empty where there is nothing to say yet
 */
export function hitCountText(pending: boolean, failed: boolean, count: number): string {
  if (pending || failed) return ''
  return count === 0 ? 'Kein Treffer' : `${count} Treffer`
}
