import { describe, expect, it } from 'vitest'
import {
  OPEN_ITEM_RIGHTS,
  WRITE_OFF_REASONS,
  WRITE_OFF_REASON_HINTS,
  WRITE_OFF_REASON_ORDER,
  openItemQuery,
  openItemsKey,
} from './openItem'

/** The addresses, keys and query strings behind the open items. */
describe('openItem', () => {
  it('openItemQueryTest', () => {
    const query = openItemQuery({
      partnerId: 42,
      overdueOnly: true,
      dueFrom: '2026-01-01',
      dueTo: '2026-12-31',
      documentNumber: 'RE-2026',
      page: 2,
      size: 50,
      sort: 'dueDate,asc',
    })

    expect(query).toBe(
      'partnerId=42&overdueOnly=true&dueFrom=2026-01-01&dueTo=2026-12-31' +
        '&documentNumber=RE-2026&page=2&size=50&sort=dueDate%2Casc',
    )
  })

  /**
   * A checkbox that is off is no filter at all.
   *
   * <p>`overdueOnly=false` would look like a filter in the log and in the query key, and an
   * empty `documentNumber=` is read by the server as «match the empty string».
   */
  it('openItemQueryWithoutAnyFilterTest', () => {
    expect(openItemQuery({ overdueOnly: false, includeSettled: false, documentNumber: '' }))
      .toBe('')
  })

  it('openItemQueryKeepsIncludeSettledWhenItIsOnTest', () => {
    expect(openItemQuery({ includeSettled: true })).toBe('includeSettled=true')
  })

  it('openItemsKeyTest', () => {
    expect(openItemsKey(7, 'page=0')).toEqual(['open-items', 7, 'page=0'])
    // Without a query it reaches every page at once, which is what an invalidation wants.
    expect(openItemsKey(7)).toEqual(['open-items', 7])
  })

  /** The rights are typed here once, so no mask spells a permission code itself. */
  it('openItemRightsTest', () => {
    expect(OPEN_ITEM_RIGHTS.read).toBe('INVOICE_READ')
    expect(OPEN_ITEM_RIGHTS.writeOff).toBe('INVOICE_WRITE_OFF')
    expect(OPEN_ITEM_RIGHTS.run).toBe('INVOICE_WRITE_OFF_RUN')
  })

  /** Every reason is offered, named and explained — an unlabelled option cannot be chosen. */
  it('writeOffReasonsAreCompleteTest', () => {
    const named = Object.keys(WRITE_OFF_REASONS)

    expect([...WRITE_OFF_REASON_ORDER].sort()).toEqual([...named].sort())
    for (const reason of WRITE_OFF_REASON_ORDER) {
      expect(WRITE_OFF_REASON_HINTS[reason].length).toBeGreaterThan(0)
    }
  })

  /**
   * The two that close the item without touching the price say so where they are chosen.
   *
   * <p>Pulling bank charges or an exchange difference into the correction would declare too
   * little turnover (backend ADR-0101).
   */
  it('writeOffReasonHintsNameTheOnesWithoutATaxConsequenceTest', () => {
    expect(WRITE_OFF_REASON_HINTS.BANKSPESEN).toContain('nicht')
    expect(WRITE_OFF_REASON_HINTS.KURSDIFFERENZ).toContain('nicht')
  })
})
