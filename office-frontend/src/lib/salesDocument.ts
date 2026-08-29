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
  /**
   * Whether the fate of an issued document is followed up: accepted or declined, with a win
   * probability and reminders.
   *
   * <p>Only the Offerte carries it — an issued offer waits for an answer, while the other
   * three kinds are the answer. The screens ask this flag, never the category, so a second
   * kind that gains a follow-up names it here and nowhere else.
   */
  tracking: boolean
  /**
   * Whether an issued document of this kind can owe money, and therefore carries the
   * «Zahlungen» register and an open amount in the list.
   *
   * <p>Only the Rechnung does. The screens ask this flag, never the category, so a second
   * kind that gains a receivable names it here and nowhere else (backend ADR-0091).
   */
  receivable: boolean
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
 * @param tracking  whether the fate of an issued document is followed up
 * @param receivable whether an issued document of this kind can owe money
 */
function kind(
  category: DocumentCategory,
  path: string,
  resource: string,
  singular: string,
  plural: string,
  gender: Gender,
  tracking = false,
  receivable = false,
): SalesDocumentKind {
  return {
    category,
    path,
    resource,
    singular,
    plural,
    gender,
    tracking,
    receivable,
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
 * The Offerte, named on its own for the screens of the follow-up work: the overview list of
 * due reminders, and the offer mask handing an accepted offer over to the Auftrag.
 *
 * <p>Same reasoning as {@link ORDER_KIND}: those screens mean this kind and no other, and a
 * lookup by category would hand them a value that may be missing, for a kind that cannot be.
 */
export const OFFER_KIND = kind('OFFER', '/offerten', 'offers', 'Offerte', 'Offerten',
  'feminine', true)

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
  OFFER_KIND,
  ORDER_KIND,
  kind('DELIVERY_NOTE', '/lieferscheine', 'delivery-notes', 'Lieferschein', 'Lieferscheine',
    'masculine'),
  kind('INVOICE', '/rechnungen', 'invoices', 'Rechnung', 'Rechnungen', 'feminine', false,
    true),
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

/** The follow-up state of one offer: outcome and win probability. */
const OFFER_TRACKING = 'offer-tracking'

/** The follow-up reminders of one offer. */
const OFFER_REMINDERS = 'offer-reminders'

/** The due reminders of the signed-in user, shown on the overview. */
const DUE_OFFER_REMINDERS = 'due-offer-reminders'

/** What one draft would be short of if it were issued now. */
const STOCK_CHECK = 'sales-document-stock-check'

/** The settlement lines and the open item of one Rechnung. */
const RECEIVABLE = 'sales-document-receivable'

/**
 * Where everything about sales documents is cached, whatever kind and whatever tenant.
 *
 * <p>For a screen that changes something all four kinds depend on and does not know which of
 * them is on the other end — a partner, whose address a draft follows (ADR-0040). The
 * follow-up keys stand here for the same reason: the due list names the partner of every
 * offer it shows.
 *
 * <p>`RECEIVABLE` is deliberately **not** here. A partner change cannot reach it: an issued
 * Rechnung carries a frozen snapshot of the recipient, and a draft — which does follow the
 * partner — owes nothing at all (backend ADR-0091).
 */
export const SALES_DOCUMENT_CACHE_ROOTS: readonly string[] = [
  DOCUMENT,
  DOCUMENT_LIST,
  DOCUMENT_TRAIL,
  OFFER_TRACKING,
  OFFER_REMINDERS,
  DUE_OFFER_REMINDERS,
  STOCK_CHECK,
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
 * Where the stock check of one draft is cached.
 *
 * <p>Its own root rather than a tail on {@link salesDocumentKey}, so that every change to the
 * positions can throw it away without emptying the document next to it — the figures behind it
 * are only true for the positions that were on screen when they were read.
 *
 * @param entry      the kind of document
 * @param tenantId   the tenant, null while none is chosen
 * @param documentId the document; left out to reach every check of that kind
 */
export function stockCheckKey(
  entry: SalesDocumentKind,
  tenantId: number | null,
  documentId?: string | number,
): unknown[] {
  return cacheKey(STOCK_CHECK, entry, tenantId, documentId)
}

/**
 * Where the follow-up state of one offer is cached.
 *
 * <p>No kind in the key: only the Offerte is followed up, so the tenant and the document
 * name the entry completely.
 *
 * @param tenantId   the tenant, null while none is chosen
 * @param documentId the offer; left out to reach the follow-up state of every offer
 */
export function offerTrackingKey(
  tenantId: number | null,
  documentId?: string | number,
): unknown[] {
  return documentId === undefined
    ? [OFFER_TRACKING, tenantId]
    : [OFFER_TRACKING, tenantId, documentId]
}

/**
 * Where the reminders of one offer are cached.
 *
 * @param tenantId   the tenant, null while none is chosen
 * @param documentId the offer; left out to reach the reminders of every offer
 */
export function offerRemindersKey(
  tenantId: number | null,
  documentId?: string | number,
): unknown[] {
  return documentId === undefined
    ? [OFFER_REMINDERS, tenantId]
    : [OFFER_REMINDERS, tenantId, documentId]
}

/**
 * Where the due reminders of the signed-in user are cached.
 *
 * <p>The user is not part of the key: the backend answers for whoever asks, and a change of
 * user empties the whole cache with the session.
 *
 * @param tenantId the tenant, null while none is chosen
 */
export function dueOfferRemindersKey(tenantId: number | null): unknown[] {
  return [DUE_OFFER_REMINDERS, tenantId]
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

/**
 * Where the settlements and the open item of one Rechnung are cached.
 *
 * @param entry      the kind of document
 * @param tenantId   the tenant, null while none is chosen
 * @param documentId the Rechnung; left out to reach every Rechnung of that kind
 */
export function receivableKey(
  entry: SalesDocumentKind,
  tenantId: number | null,
  documentId?: string | number,
): unknown[] {
  return cacheKey(RECEIVABLE, entry, tenantId, documentId)
}
