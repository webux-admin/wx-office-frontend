import { describe, expect, it } from 'vitest'
import {
  OFFER_KIND,
  ORDER_KIND,
  SALES_DOCUMENT_CACHE_ROOTS,
  SALES_DOCUMENT_KINDS,
  dueOfferRemindersKey,
  indefiniteArticle,
  newDocumentTitle,
  offerRemindersKey,
  offerTrackingKey,
  salesDocumentFor,
  salesDocumentKey,
  salesDocumentListKey,
  salesDocumentTrailKey,
  stockCheckKey,
  type SalesDocumentKind,
  type SalesDocumentRights,
} from './salesDocument'
import type { DocumentCategory } from './types'

/** The order a sale runs through: an offer becomes an order, is delivered and is invoiced. */
const ORDER_OF_THE_SALE: DocumentCategory[] = ['OFFER', 'ORDER', 'DELIVERY_NOTE', 'INVOICE']

/**
 * The rights as `ch.webux.office.user.Permission` spells them, written out on purpose.
 *
 * <p>Deriving them here as well would only repeat the mistake it is meant to catch: a typo in
 * the template would produce the same wrong code on both sides and the test would pass.
 */
const RIGHTS_OF_THE_BACKEND: Record<string, SalesDocumentRights> = {
  OFFER: {
    read: 'OFFER_READ',
    write: 'OFFER_WRITE',
    finalise: 'OFFER_FINALISE',
    reopen: 'OFFER_REOPEN',
    cancel: 'OFFER_CANCEL',
  },
  ORDER: {
    read: 'ORDER_READ',
    write: 'ORDER_WRITE',
    finalise: 'ORDER_FINALISE',
    reopen: 'ORDER_REOPEN',
    cancel: 'ORDER_CANCEL',
  },
  DELIVERY_NOTE: {
    read: 'DELIVERY_NOTE_READ',
    write: 'DELIVERY_NOTE_WRITE',
    finalise: 'DELIVERY_NOTE_FINALISE',
    reopen: 'DELIVERY_NOTE_REOPEN',
    cancel: 'DELIVERY_NOTE_CANCEL',
  },
  INVOICE: {
    read: 'INVOICE_READ',
    write: 'INVOICE_WRITE',
    finalise: 'INVOICE_FINALISE',
    reopen: 'INVOICE_REOPEN',
    cancel: 'INVOICE_CANCEL',
  },
}

/** Reads a kind out of the table, so a test can name the one it means. */
function kindOf(category: DocumentCategory): SalesDocumentKind {
  const entry = salesDocumentFor(category)
  if (!entry) throw new Error(`no sales document kind for ${category}`)
  return entry
}

describe('SALES_DOCUMENT_KINDS', () => {
  it('salesDocumentKindsFollowTheSaleTest', () => {
    expect(SALES_DOCUMENT_KINDS.map((entry) => entry.category)).toEqual(ORDER_OF_THE_SALE)
  })

  /** The Gutschrift corrects an invoice instead of standing at a step of the sale. */
  it('salesDocumentKindsLeaveOutTheCreditNoteTest', () => {
    expect(SALES_DOCUMENT_KINDS.map((entry) => entry.category)).not.toContain('CREDIT_NOTE')
  })

  it('salesDocumentKindsAreUniqueTest', () => {
    const categories = SALES_DOCUMENT_KINDS.map((entry) => entry.category)
    const paths = SALES_DOCUMENT_KINDS.map((entry) => entry.path)
    const resources = SALES_DOCUMENT_KINDS.map((entry) => entry.resource)

    expect(new Set(categories).size).toBe(categories.length)
    expect(new Set(paths).size).toBe(paths.length)
    expect(new Set(resources).size).toBe(resources.length)
  })

  /** A second slash would leave the application, a missing one would append to the path. */
  it('salesDocumentKindsHaveOneLeadingSlashTest', () => {
    for (const entry of SALES_DOCUMENT_KINDS) {
      expect(entry.path).toMatch(/^\/[a-z-]+$/)
    }
  })

  it('salesDocumentKindsAreNamedTest', () => {
    for (const entry of SALES_DOCUMENT_KINDS) {
      expect(entry.singular.trim()).not.toBe('')
      expect(entry.plural.trim()).not.toBe('')
    }
  })

  it('salesDocumentKindsCarryTheRightsOfTheBackendTest', () => {
    for (const entry of SALES_DOCUMENT_KINDS) {
      expect(entry.rights).toEqual(RIGHTS_OF_THE_BACKEND[entry.category])
    }
  })

  /** Only an issued offer waits for an answer; the other three kinds are the answer. */
  it('salesDocumentKindsTrackOnlyTheOfferTest', () => {
    for (const entry of SALES_DOCUMENT_KINDS) {
      expect(entry.tracking).toBe(entry.category === 'OFFER')
    }
  })
})

describe('salesDocumentFor', () => {
  it('salesDocumentForTest', () => {
    expect(salesDocumentFor('ORDER')).toMatchObject({
      path: '/auftraege',
      resource: 'orders',
      singular: 'Auftrag',
      plural: 'Aufträge',
      gender: 'masculine',
    })
  })

  it('salesDocumentForEveryKindTest', () => {
    for (const entry of SALES_DOCUMENT_KINDS) {
      expect(salesDocumentFor(entry.category)).toBe(entry)
    }
  })

  /** The Gutschrift is a category of the backend, but it has no mask of its own. */
  it('salesDocumentForWithoutMaskTest', () => {
    expect(salesDocumentFor('CREDIT_NOTE')).toBeUndefined()
  })
})

describe('indefiniteArticle', () => {
  it('indefiniteArticleTest', () => {
    expect(indefiniteArticle(kindOf('ORDER'), 'nominative')).toBe('ein')
  })

  it('indefiniteArticleForFeminineTest', () => {
    expect(indefiniteArticle(kindOf('OFFER'), 'nominative')).toBe('eine')
  })

  it('indefiniteArticleInDativeTest', () => {
    expect(indefiniteArticle(kindOf('DELIVERY_NOTE'), 'dative')).toBe('einem')
  })

  it('indefiniteArticleForFeminineInDativeTest', () => {
    expect(indefiniteArticle(kindOf('INVOICE'), 'dative')).toBe('einer')
  })
})

describe('newDocumentTitle', () => {
  it('newDocumentTitleTest', () => {
    expect(newDocumentTitle(kindOf('ORDER'))).toBe('Neuer Auftrag')
  })

  it('newDocumentTitleForFeminineTest', () => {
    expect(newDocumentTitle(kindOf('OFFER'))).toBe('Neue Offerte')
  })
})

/**
 * Whether one key reaches another, the way react-query decides it: element by element from
 * the front, so a shorter key marks everything filed under it.
 */
function reaches(marked: unknown[], cached: unknown[]): boolean {
  return marked.length <= cached.length && marked.every((part, index) => part === cached[index])
}

describe('salesDocumentKey', () => {
  it('salesDocumentKeyTest', () => {
    expect(salesDocumentKey(kindOf('INVOICE'), 7, 42)).toEqual([
      'sales-document',
      7,
      'invoices',
      42,
    ])
  })

  it('salesDocumentKeyWithoutDocumentTest', () => {
    expect(salesDocumentKey(kindOf('INVOICE'), 7)).toEqual(['sales-document', 7, 'invoices'])
  })

  /** The mask is opened before the tenant is known, and a key has to exist by then. */
  it('salesDocumentKeyWithoutTenantTest', () => {
    expect(salesDocumentKey(kindOf('INVOICE'), null, 42)).toEqual([
      'sales-document',
      null,
      'invoices',
      42,
    ])
  })

  /** What the mask invalidates has to reach what it cached, or nothing is ever refetched. */
  it('salesDocumentKeyReachesOneDocumentTest', () => {
    const kind = kindOf('INVOICE')

    expect(reaches(salesDocumentKey(kind, 7), salesDocumentKey(kind, 7, 42))).toBe(true)
  })

  /** And it must not reach past its own kind, or a save would throw away three other lists. */
  it('salesDocumentKeyStopsAtItsOwnKindTest', () => {
    expect(reaches(salesDocumentKey(kindOf('INVOICE'), 7), salesDocumentKey(ORDER_KIND, 7, 42)))
      .toBe(false)
  })

  it('salesDocumentKeyStopsAtItsOwnTenantTest', () => {
    const kind = kindOf('INVOICE')

    expect(reaches(salesDocumentKey(kind, 7), salesDocumentKey(kind, 8, 42))).toBe(false)
  })
})

describe('salesDocumentListKey', () => {
  it('salesDocumentListKeyTest', () => {
    expect(salesDocumentListKey(ORDER_KIND, 7, 'page=0')).toEqual([
      'sales-documents',
      7,
      'orders',
      'page=0',
    ])
  })

  it('salesDocumentListKeyWithoutQueryTest', () => {
    expect(salesDocumentListKey(ORDER_KIND, 7)).toEqual(['sales-documents', 7, 'orders'])
  })

  /** Two lists of the same kind differ only in what was asked for. */
  it('salesDocumentListKeyReachesEveryPageTest', () => {
    expect(reaches(salesDocumentListKey(ORDER_KIND, 7), salesDocumentListKey(ORDER_KIND, 7, 'page=3')))
      .toBe(true)
  })
})

describe('salesDocumentTrailKey', () => {
  it('salesDocumentTrailKeyTest', () => {
    expect(salesDocumentTrailKey(kindOf('OFFER'), 7, 42)).toEqual([
      'sales-document-trail',
      7,
      'offers',
      42,
    ])
  })

  it('salesDocumentTrailKeyWithoutDocumentTest', () => {
    expect(salesDocumentTrailKey(kindOf('OFFER'), 7)).toEqual([
      'sales-document-trail',
      7,
      'offers',
    ])
  })
})

describe('offerTrackingKey', () => {
  it('offerTrackingKeyTest', () => {
    expect(offerTrackingKey(7, 42)).toEqual(['offer-tracking', 7, 42])
  })

  it('offerTrackingKeyWithoutDocumentTest', () => {
    expect(offerTrackingKey(7)).toEqual(['offer-tracking', 7])
  })

  /** What the mask invalidates has to reach what it cached, or nothing is ever refetched. */
  it('offerTrackingKeyReachesOneDocumentTest', () => {
    expect(reaches(offerTrackingKey(7), offerTrackingKey(7, 42))).toBe(true)
  })

  it('offerTrackingKeyStopsAtItsOwnTenantTest', () => {
    expect(reaches(offerTrackingKey(7), offerTrackingKey(8, 42))).toBe(false)
  })
})

describe('offerRemindersKey', () => {
  it('offerRemindersKeyTest', () => {
    expect(offerRemindersKey(7, 42)).toEqual(['offer-reminders', 7, 42])
  })

  it('offerRemindersKeyWithoutDocumentTest', () => {
    expect(offerRemindersKey(7)).toEqual(['offer-reminders', 7])
  })

  it('offerRemindersKeyReachesOneDocumentTest', () => {
    expect(reaches(offerRemindersKey(7), offerRemindersKey(7, 42))).toBe(true)
  })
})

describe('dueOfferRemindersKey', () => {
  it('dueOfferRemindersKeyTest', () => {
    expect(dueOfferRemindersKey(7)).toEqual(['due-offer-reminders', 7])
  })

  /** The overview is opened before the tenant is known, and a key has to exist by then. */
  it('dueOfferRemindersKeyWithoutTenantTest', () => {
    expect(dueOfferRemindersKey(null)).toEqual(['due-offer-reminders', null])
  })
})

describe('stockCheckKey', () => {
  it('stockCheckKeyTest', () => {
    expect(stockCheckKey(OFFER_KIND, 7, 42)).toEqual([
      'sales-document-stock-check',
      7,
      'offers',
      42,
    ])
  })

  it('stockCheckKeyWithoutDocumentTest', () => {
    expect(stockCheckKey(OFFER_KIND, 7)).toEqual(['sales-document-stock-check', 7, 'offers'])
  })

  /** Every change to the positions throws the check away, so the shorter key has to reach it. */
  it('stockCheckKeyReachesOneDocumentTest', () => {
    expect(reaches(stockCheckKey(OFFER_KIND, 7), stockCheckKey(OFFER_KIND, 7, 42))).toBe(true)
  })

  /** The invoice mask and the order mask both ask under the same number. */
  it('stockCheckKeyKeepsTheKindsApartTest', () => {
    expect(stockCheckKey(OFFER_KIND, 7, 42)).not.toEqual(stockCheckKey(ORDER_KIND, 7, 42))
  })

  it('stockCheckKeyStopsAtItsOwnTenantTest', () => {
    expect(reaches(stockCheckKey(OFFER_KIND, 7), stockCheckKey(OFFER_KIND, 8, 42))).toBe(false)
  })
})

describe('SALES_DOCUMENT_CACHE_ROOTS', () => {
  /**
   * The roots are what a screen without a kind of its own invalidates — the partner mask,
   * whose address every draft follows (ADR-0040). Miss one and a saved address never reaches
   * the document that shows it.
   */
  it('salesDocumentCacheRootsReachEveryKeyTest', () => {
    for (const kind of SALES_DOCUMENT_KINDS) {
      const cached = [
        salesDocumentKey(kind, 7, 42),
        salesDocumentListKey(kind, 7, 'page=0'),
        salesDocumentTrailKey(kind, 7, 42),
      ]
      for (const entry of cached) {
        expect(SALES_DOCUMENT_CACHE_ROOTS.some((root) => reaches([root, 7], entry))).toBe(true)
      }
    }
  })

  /** The follow-up caches show the partner as well, so a partner change reaches them too. */
  it('salesDocumentCacheRootsReachTheFollowUpKeysTest', () => {
    const cached = [offerTrackingKey(7, 42), offerRemindersKey(7, 42), dueOfferRemindersKey(7)]

    for (const entry of cached) {
      expect(SALES_DOCUMENT_CACHE_ROOTS.some((root) => reaches([root, 7], entry))).toBe(true)
    }
  })

  /** The stock check hangs on the document as well, so a partner change reaches it too. */
  it('salesDocumentCacheRootsReachTheStockCheckTest', () => {
    for (const kind of SALES_DOCUMENT_KINDS) {
      const entry = stockCheckKey(kind, 7, 42)
      expect(SALES_DOCUMENT_CACHE_ROOTS.some((root) => reaches([root, 7], entry))).toBe(true)
    }
  })

  it('salesDocumentCacheRootsAreUniqueTest', () => {
    expect(new Set(SALES_DOCUMENT_CACHE_ROOTS).size).toBe(SALES_DOCUMENT_CACHE_ROOTS.length)
  })
})

describe('ORDER_KIND', () => {
  /** It is the entry of the table, not a second copy that could drift from it. */
  it('orderKindIsTheOneFromTheTableTest', () => {
    expect(ORDER_KIND).toBe(salesDocumentFor('ORDER'))
  })
})

describe('OFFER_KIND', () => {
  /** It is the entry of the table, not a second copy that could drift from it. */
  it('offerKindIsTheOneFromTheTableTest', () => {
    expect(OFFER_KIND).toBe(salesDocumentFor('OFFER'))
  })
})
