import { api } from './api'
import { listQuery } from './paging'
import type { OpenItem, Page, PaymentKind, PaymentReceipt, ReceiptState } from './types'

/**
 * The payment receipts of a tenant: where their screen lives, what rights it runs on, and the
 * calls behind them.
 *
 * <p>Its own building block rather than addresses typed into the screens, the same way
 * `openItem.ts` does it: the list and the dialog read the same page, and a query key written
 * twice is a cache that goes stale in one of them.
 *
 * <p><b>The receipt is the money, the settlement line is the assignment.</b> Recording a
 * receipt owes nobody a rappen less — the open item moves only when it is assigned (backend
 * ADR-0103).
 */

/** Path of the list of payment receipts within the application. */
export const PAYMENT_RECEIPT_PATH = '/zahlungen'

/**
 * The two rights these screens run on.
 *
 * <p>No right of its own: recording money and assigning it are the responsibility
 * `INVOICE_PAYMENT_RECORD` was created for — both change what the books say is still owed.
 * Whoever may record a payment at the Rechnung does the same thing here by another route
 * (backend ADR-0103).
 */
export const PAYMENT_RECEIPT_RIGHTS = {
  read: 'INVOICE_READ',
  record: 'INVOICE_PAYMENT_RECORD',
} as const

/** What each state of a receipt is called on screen. */
export const RECEIPT_STATES: Record<ReceiptState, string> = {
  OPEN: 'offen',
  PARTIAL: 'teilweise',
  ASSIGNED: 'zugewiesen',
  REVERSED: 'storniert',
}

/** The states in the order the filter offers them: the one that needs work first. */
export const RECEIPT_STATE_ORDER: ReceiptState[] = ['OPEN', 'PARTIAL', 'ASSIGNED', 'REVERSED']

/** What the list of payment receipts was asked for. */
export type PaymentReceiptFilter = {
  partnerId?: number
  valueFrom?: string
  valueTo?: string
  state?: ReceiptState
  currency?: string
  search?: string
  page?: number
  size?: number
}

/**
 * Where a page of payment receipts is cached.
 *
 * @param tenantId the tenant, null while none is chosen
 * @param query    what was asked for; left out to reach every page at once
 */
export function paymentReceiptsKey(
  tenantId: number | null,
  query?: string,
): readonly unknown[] {
  return query === undefined
    ? ['payment-receipts', tenantId]
    : ['payment-receipts', tenantId, query]
}

/**
 * The query string of a list request.
 *
 * <p>Leaves out what was not asked for: a blank search must not become `search=`, which the
 * server would read as «match the empty string».
 *
 * @param filter what the mask asked for
 */
export function paymentReceiptQuery(filter: PaymentReceiptFilter): string {
  return listQuery({
    partnerId: filter.partnerId,
    valueFrom: filter.valueFrom,
    valueTo: filter.valueTo,
    state: filter.state,
    currency: filter.currency,
    search: filter.search,
    page: filter.page,
    size: filter.size,
  })
}

/**
 * Lists what came in, newest value date first.
 *
 * @param tenantId the tenant
 * @param query    the query string from {@link paymentReceiptQuery}
 */
export function fetchPaymentReceipts(
  tenantId: number,
  query: string,
): Promise<Page<PaymentReceipt>> {
  return api.get<Page<PaymentReceipt>>(`/api/tenants/${tenantId}/payment-receipts?${query}`)
}

/**
 * One receipt with the settlement lines it produced.
 *
 * @param tenantId  the tenant
 * @param receiptId the receipt
 */
export function fetchPaymentReceipt(
  tenantId: number,
  receiptId: number,
): Promise<PaymentReceipt> {
  return api.get<PaymentReceipt>(`/api/tenants/${tenantId}/payment-receipts/${receiptId}`)
}

/** What the dialog sends to record money that arrived. */
export type RecordReceiptBody = {
  partnerId?: number
  payerName?: string
  amount: number
  currency: string
  /** The day the money was valued, not the day somebody typed it. Left out means today. */
  valueDate?: string
  /** Exactly as it arrived — spacing and casing are taken out where it is read, not here. */
  payerReference?: string
  referenceType?: string
  note?: string
}

/**
 * Records money that arrived. Nothing is owed less because of it.
 *
 * @param tenantId the tenant
 * @param body     what arrived
 */
export function recordPaymentReceipt(
  tenantId: number,
  body: RecordReceiptBody,
): Promise<PaymentReceipt> {
  return api.post<PaymentReceipt>(`/api/tenants/${tenantId}/payment-receipts`, body)
}

/** One Rechnung out of a receipt. */
export type AssignmentBody = {
  documentId: number
  kind?: PaymentKind
  amount: number
  note?: string
}

/**
 * Spreads a receipt over Rechnungen — one credit, any number of settlement lines.
 *
 * <p>One call and not one per line: three lines of which two were written is a state nobody
 * can read back (OR Art. 957a Abs. 2). The server writes them in one transaction or none.
 *
 * @param tenantId    the tenant
 * @param receiptId   the receipt to spread
 * @param assignments where the money goes, and how much goes there
 */
export function assignPaymentReceipt(
  tenantId: number,
  receiptId: number,
  assignments: AssignmentBody[],
): Promise<PaymentReceipt> {
  return api.post<PaymentReceipt>(
    `/api/tenants/${tenantId}/payment-receipts/${receiptId}/assignments`,
    { assignments },
  )
}

/**
 * Takes a receipt back by booking a counter receipt.
 *
 * <p>Only while nothing hangs on it: the assignments are reversed first, each on its own
 * Rechnung.
 *
 * @param tenantId  the tenant
 * @param receiptId the receipt
 * @param reason    why
 */
export function reversePaymentReceipt(
  tenantId: number,
  receiptId: number,
  reason?: string,
): Promise<PaymentReceipt> {
  return api.post<PaymentReceipt>(
    `/api/tenants/${tenantId}/payment-receipts/${receiptId}/reverse`,
    { reason },
  )
}

/**
 * The one Rechnung a payment reference or a document number names.
 *
 * <p><b>Exactly one or none.</b> A list of candidates is not an answer somebody can book
 * money on. A reference whose check digit does not match answers 400 — «keine gültige
 * Referenz» is a different answer from «nicht gefunden».
 *
 * @param tenantId the tenant
 * @param what     the reference or the document number, as typed
 */
export function lookupOpenItem(
  tenantId: number,
  what: { reference?: string; documentNumber?: string },
): Promise<OpenItem> {
  const query = listQuery({
    reference: what.reference,
    documentNumber: what.documentNumber,
  })
  return api.get<OpenItem>(`/api/tenants/${tenantId}/open-items/lookup?${query}`)
}
