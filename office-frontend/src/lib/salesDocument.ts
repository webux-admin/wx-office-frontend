import type { DocumentCategory } from './types'

/**
 * Grammatical gender of the German name of a kind of document.
 *
 * <p>Two of the four are masculine and two are feminine, and the interface cannot ignore
 * that: an article has to agree with the name in front of it, and «ein Offerte» reads as a
 * defect rather than as a slip.
 */
export type Gender = 'masculine' | 'feminine'

/**
 * The rights that guard one kind of document.
 *
 * <p>The codes are those of {@code ch.webux.office.user.Permission}. They are derived from
 * the category rather than typed out, because the backend names them that way for every
 * category and a hand-written list would be one rename away from being wrong.
 */
export type SalesDocumentRights = {
  read: string
  write: string
  finalise: string
  reopen: string
  cancel: string
}

/**
 * One kind of sales document, with everything that differs between the four.
 *
 * <p>Offerte, Auftrag, Lieferschein and Rechnung use the same mask: same positions, same
 * header data, same way from draft to issued and back. What differs is the address of the
 * list, the resource behind it, the wording and the rights — and that is what stands here,
 * once, instead of in four copies of the mask.
 */
export type SalesDocumentKind = {
  category: DocumentCategory
  /** Path of the list within the application, for example `/offerten`. */
  path: string
  /** Segment of the REST resource, for example `offers`. */
  resource: string
  /** What one of them is called, for example «Offerte». */
  singular: string
  /** What several of them are called, for example «Offerten». */
  plural: string
  gender: Gender
  rights: SalesDocumentRights
}

/**
 * Builds one entry of the table, with the rights derived from the category.
 *
 * @param category  the category, which is also the prefix of every right
 * @param path      path of the list, for example `/offerten`
 * @param resource  segment of the REST resource, for example `offers`
 * @param singular  what one of them is called
 * @param plural    what several of them are called
 * @param gender    gender of the German name
 */
function kind(
  category: DocumentCategory,
  path: string,
  resource: string,
  singular: string,
  plural: string,
  gender: Gender,
): SalesDocumentKind {
  return {
    category,
    path,
    resource,
    singular,
    plural,
    gender,
    rights: {
      read: `${category}_READ`,
      write: `${category}_WRITE`,
      finalise: `${category}_FINALISE`,
      reopen: `${category}_REOPEN`,
      cancel: `${category}_CANCEL`,
    },
  }
}

/**
 * The Auftrag, named on its own because two screens mean this one and no other.
 *
 * <p>Picking it out of the table by index would tie them to the order of a list, and looking
 * it up by category would hand them a value that may be missing, for a kind that cannot be.
 */
export const ORDER_KIND = kind('ORDER', '/auftraege', 'orders', 'Auftrag', 'Aufträge',
  'masculine')

/**
 * The kinds of document with a mask of their own, in the order a sale runs through them.
 *
 * <p>The Gutschrift is missing on purpose: it corrects an invoice instead of standing at a
 * step of the sale, and it is written from the invoice it reverses rather than from a list of
 * its own. It gets a mask when that way exists.
 */
export const SALES_DOCUMENT_KINDS: SalesDocumentKind[] = [
  kind('OFFER', '/offerten', 'offers', 'Offerte', 'Offerten', 'feminine'),
  ORDER_KIND,
  kind('DELIVERY_NOTE', '/lieferscheine', 'delivery-notes', 'Lieferschein', 'Lieferscheine',
    'masculine'),
  kind('INVOICE', '/rechnungen', 'invoices', 'Rechnung', 'Rechnungen', 'feminine'),
]

/**
 * Looks a kind up by its category.
 *
 * @param category the category, as the backend spells it
 * @returns the kind, or `undefined` for a category without a mask
 */
export function salesDocumentFor(category: DocumentCategory): SalesDocumentKind | undefined {
  return SALES_DOCUMENT_KINDS.find((entry) => entry.category === category)
}

/** One document. */
const DOCUMENT = 'sales-document'

/** A list of documents: the register, the overview tile, the copy picker. */
const DOCUMENT_LIST = 'sales-documents'

/** The status trail of one document. */
const DOCUMENT_TRAIL = 'sales-document-trail'

/**
 * Where everything about sales documents is cached, whatever kind and whatever tenant.
 *
 * <p>For a screen that changes something all four kinds depend on and does not know which of
 * them is on the other end — a partner, whose address a draft follows (ADR-0040).
 */
export const SALES_DOCUMENT_CACHE_ROOTS: readonly string[] = [
  DOCUMENT,
  DOCUMENT_LIST,
  DOCUMENT_TRAIL,
]

/**
 * Builds a cache key, tenant before kind.
 *
 * <p>That order is what makes a shorter key a prefix of a longer one: react-query matches
 * from the front, so `[root, tenantId]` reaches every kind of that tenant and
 * `[root, tenantId, resource]` only the one. A key that named the kind first could not be
 * narrowed by tenant, and one that named neither would throw away the wrong screens.
 */
function cacheKey(
  root: string,
  entry: SalesDocumentKind,
  tenantId: number | null,
  tail?: string | number,
): unknown[] {
  const key: unknown[] = [root, tenantId, entry.resource]
  return tail === undefined ? key : [...key, tail]
}

/**
 * Where one document is cached.
 *
 * @param entry      the kind of document
 * @param tenantId   the tenant, null while none is chosen
 * @param documentId the document; left out to reach every document of that kind
 */
export function salesDocumentKey(
  entry: SalesDocumentKind,
  tenantId: number | null,
  documentId?: string | number,
): unknown[] {
  return cacheKey(DOCUMENT, entry, tenantId, documentId)
}

/**
 * Where a list of documents is cached.
 *
 * @param entry    the kind of document
 * @param tenantId the tenant, null while none is chosen
 * @param query    what was asked for — filters, paging, sorting; left out to reach every list
 */
export function salesDocumentListKey(
  entry: SalesDocumentKind,
  tenantId: number | null,
  query?: string,
): unknown[] {
  return cacheKey(DOCUMENT_LIST, entry, tenantId, query)
}

/**
 * Where the status trail of one document is cached.
 *
 * @param entry      the kind of document
 * @param tenantId   the tenant, null while none is chosen
 * @param documentId the document; left out to reach every trail of that kind
 */
export function salesDocumentTrailKey(
  entry: SalesDocumentKind,
  tenantId: number | null,
  documentId?: string | number,
): unknown[] {
  return cacheKey(DOCUMENT_TRAIL, entry, tenantId, documentId)
}

/**
 * The indefinite article belonging to a kind, for a sentence that names it.
 *
 * <p>Two cases are needed and no more: «wurde bereits ein Auftrag erstellt» and «Weitere Wege
 * zu einem Auftrag». Everywhere else the wording avoids the article, by naming the Beleg or
 * by using the plural.
 *
 * @param entry           the kind
 * @param grammaticalCase nominative for the subject of a sentence, dative after `zu`
 * @returns the article, for example `eine` or `einem`
 */
export function indefiniteArticle(
  entry: SalesDocumentKind,
  grammaticalCase: 'nominative' | 'dative',
): string {
  if (entry.gender === 'feminine') return grammaticalCase === 'dative' ? 'einer' : 'eine'
  return grammaticalCase === 'dative' ? 'einem' : 'ein'
}

/**
 * The heading of the mask for a document that does not exist yet.
 *
 * @param entry the kind
 * @returns for example «Neuer Auftrag» or «Neue Offerte»
 */
export function newDocumentTitle(entry: SalesDocumentKind): string {
  return `${entry.gender === 'feminine' ? 'Neue' : 'Neuer'} ${entry.singular}`
}
