import type { Partner } from '../../lib/types'

/**
 * How a customer is written in the search field once they were taken over.
 *
 * <p>Number first, because that is what somebody who knows the customer types. A customer
 * without one is named by name alone rather than by a leading separator.
 *
 * @param partner the customer, absent while none is chosen
 * @returns for example «K-1001 · Druckerei Meier AG», empty where none is chosen
 */
export function partnerLabel(partner: Partner | undefined): string {
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
