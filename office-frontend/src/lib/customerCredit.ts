import { api } from './api'
import { listQuery } from './paging'
import type {
  CreditUseReason,
  CustomerCredit,
  CustomerCreditBalance,
  ReceiptKind,
} from './types'

/**
 * What a tenant owes its customers: where the screen lives, what rights it runs on, and the
 * calls behind it.
 *
 * <p><b>A credit is not a document.</b> A payment receipt that is not, or not fully, used up
 * <em>is</em> the customer credit — there is no second record for the money (backend
 * ADR-0104).
 *
 * <p><b>Nothing is recomputed here.</b> The remainder and the balance are answers of the
 * server; repeating the arithmetic in the browser would be a second place to get it wrong.
 */

/** Path of the customer credits within the application. */
export const CUSTOMER_CREDIT_PATH = '/guthaben'

/**
 * The three rights this screen runs on.
 *
 * <p>`read` is `INVOICE_READ` and no right of its own: the credit balance is the other side
 * of the open items, and whoever may see the debtor list must see the liability side —
 * otherwise they read half the truth.
 *
 * <p>`record` and `refund` are deliberately not the same right: assigning money is daily work,
 * disposing of somebody else's money without a service in return is not.
 */
export const CUSTOMER_CREDIT_RIGHTS = {
  read: 'INVOICE_READ',
  record: 'CUSTOMER_CREDIT_RECORD',
  refund: 'CUSTOMER_CREDIT_REFUND',
} as const

/** What each kind of receipt is called on screen. */
export const RECEIPT_KINDS: Record<ReceiptKind, string> = {
  PAYMENT: 'Zahlung',
  ADVANCE: 'Vorauszahlung',
  OVERPAYMENT: 'Überzahlung',
  UNALLOCATED: 'ungeklärt',
}

/** What each reason for using a credit up is called on screen. */
export const CREDIT_USE_REASONS: Record<CreditUseReason, string> = {
  REFUND_ON_REQUEST: 'Auf Wunsch des Kunden',
  REFUND_NO_CONTRACT: 'Auftrag kam nicht zustande',
  REFUND_DUPLICATE_PAYMENT: 'Doppelt bezahlt',
  RELEASE_TIME_BARRED: 'Verjährt',
  RELEASE_UNCLAIMED: 'Nie beansprucht',
}

/** What each reason means, spelled out where it is chosen. */
export const CREDIT_USE_REASON_HINTS: Record<CreditUseReason, string> = {
  REFUND_ON_REQUEST: 'Der Kunde hat das Geld zurückverlangt.',
  REFUND_NO_CONTRACT: 'Es kam kein Auftrag zustande, der Vorschuss hat keinen Zweck mehr.',
  REFUND_DUPLICATE_PAYMENT: 'Dieselbe Rechnung wurde zweimal bezahlt.',
  RELEASE_TIME_BARRED:
    'Der Anspruch ist verjährt und wird nicht ausbezahlt. Eine Entscheidung des Mandanten, keine der Software — die Verjährung ist eine Einrede (OR Art. 142).',
  RELEASE_UNCLAIMED: 'Niemand hat das Geld je zurückverlangt.',
}

/** The refund reasons in the order the picker offers them. */
export const REFUND_REASON_ORDER: CreditUseReason[] = [
  'REFUND_ON_REQUEST',
  'REFUND_NO_CONTRACT',
  'REFUND_DUPLICATE_PAYMENT',
]

/** The release reasons in the order the picker offers them. */
export const RELEASE_REASON_ORDER: CreditUseReason[] = [
  'RELEASE_UNCLAIMED',
  'RELEASE_TIME_BARRED',
]

/**
 * The age bands the credit list groups by.
 *
 * <p>A credit must not grow old in silence. Which period applies depends on where the money
 * came from — a prepayment is a contractual claim (OR Art. 127, ten years), an overpayment is
 * unjust enrichment (OR Art. 67, three years from knowledge) — so the bands make the age
 * visible and name nothing as expired.
 */
export const CREDIT_AGE_BANDS: { label: string; upToDays: number | null }[] = [
  { label: 'bis 90 Tage', upToDays: 90 },
  { label: '91–365 Tage', upToDays: 365 },
  { label: '1–3 Jahre', upToDays: 1095 },
  { label: 'über 3 Jahre', upToDays: 3650 },
  { label: 'über 10 Jahre', upToDays: null },
]

/**
 * Which band a credit falls into.
 *
 * @param ageDays days since the value date
 */
export function creditAgeBand(ageDays: number): string {
  const band = CREDIT_AGE_BANDS.find(
    (candidate) => candidate.upToDays !== null && ageDays <= candidate.upToDays,
  )
  return (band ?? CREDIT_AGE_BANDS[CREDIT_AGE_BANDS.length - 1]!).label
}

/** What the list of customer credits was asked for. */
export type CustomerCreditFilter = {
  partnerId?: number
  kind?: ReceiptKind
  currency?: string
  asOf?: string
  minimumAgeDays?: number
  includeSettled?: boolean
}

/**
 * Where the credits are cached.
 *
 * @param tenantId the tenant, null while none is chosen
 * @param query    what was asked for; left out to reach every view at once
 */
export function customerCreditsKey(
  tenantId: number | null,
  query?: string,
): readonly unknown[] {
  return query === undefined
    ? ['customer-credits', tenantId]
    : ['customer-credits', tenantId, query]
}

/**
 * The query string of a list request.
 *
 * <p>Leaves out what was not asked for: a false checkbox must not become
 * `includeSettled=false`.
 */
export function customerCreditQuery(filter: CustomerCreditFilter): string {
  return listQuery({
    partnerId: filter.partnerId,
    kind: filter.kind,
    currency: filter.currency,
    asOf: filter.asOf,
    minimumAgeDays: filter.minimumAgeDays,
    includeSettled: filter.includeSettled === true ? true : undefined,
  })
}

/**
 * Lists what is still owed, oldest first.
 *
 * @param tenantId the tenant
 * @param query    the query string from {@link customerCreditQuery}
 */
export function fetchCustomerCredits(
  tenantId: number,
  query: string,
): Promise<CustomerCredit[]> {
  return api.get<CustomerCredit[]>(`/api/tenants/${tenantId}/customer-credits?${query}`)
}

/**
 * What each customer is owed, one row per customer <b>and</b> currency.
 *
 * <p>The figure a Treuhänder puts on account 2030 «Erhaltene Anzahlungen». It is never netted
 * against the open items — OR Art. 958c Abs. 1 Ziff. 7 forbids offsetting assets against
 * liabilities.
 */
export function fetchCustomerCreditBalances(
  tenantId: number,
  query: string,
): Promise<CustomerCreditBalance[]> {
  return api.get<CustomerCreditBalance[]>(
    `/api/tenants/${tenantId}/customer-credits/balances?${query}`,
  )
}

/**
 * The prepayments taken in between two days.
 *
 * <p>What of this period is taxable under MWSTG Art. 40 Abs. 1 Bst. c: the tax on a prepayment
 * arises with the receipt of the money, not with the service.
 */
export function fetchReceivedCredits(
  tenantId: number,
  from: string,
  to: string,
): Promise<CustomerCredit[]> {
  return api.get<CustomerCredit[]>(
    `/api/tenants/${tenantId}/customer-credits/received?${listQuery({ from, to })}`,
  )
}

/** One credit with the refunds and releases it produced. */
export function fetchCustomerCredit(
  tenantId: number,
  receiptId: number,
): Promise<CustomerCredit> {
  return api.get<CustomerCredit>(`/api/tenants/${tenantId}/customer-credits/${receiptId}`)
}

/** What the dialog sends to record money that arrived before any invoice. */
export type RecordAdvanceBody = {
  /** Required: a prepayment is money the tenant owes somebody. */
  partnerId: number
  payerName?: string
  amount: number
  currency: string
  /** The day the tax arose under MWSTG Art. 40 Abs. 1 Bst. c. Left out means today. */
  valueDate?: string
  payerReference?: string
  note?: string
}

/**
 * Records money that arrived before any invoice exists.
 *
 * <p>Nothing is owed less because of it — the open item moves only when the credit is set
 * against an invoice.
 */
export function recordAdvance(
  tenantId: number,
  body: RecordAdvanceBody,
): Promise<CustomerCredit> {
  return api.post<CustomerCredit>(`/api/tenants/${tenantId}/customer-credits`, body)
}

/**
 * Sets a credit against one invoice.
 *
 * <p>Never by itself: a Verrechnung requires a declaration under OR Art. 120 ff., and this
 * call is that declaration.
 */
export function applyCredit(
  tenantId: number,
  receiptId: number,
  body: { documentId: number; amount: number },
): Promise<CustomerCredit> {
  return api.post<CustomerCredit>(
    `/api/tenants/${tenantId}/customer-credits/${receiptId}/applications`,
    body,
  )
}

/** What the refund and release dialogs send. */
export type CreditUseBody = {
  reason: CreditUseReason
  amount: number
  /** The day it was decided, separate from the value date of the money. */
  bookingDate?: string
  /** Only on a refund; the server refuses it on a release. */
  refundIban?: string
  note?: string
}

/** Pays a credit back. */
export function refundCredit(
  tenantId: number,
  receiptId: number,
  body: CreditUseBody,
): Promise<CustomerCredit> {
  return api.post<CustomerCredit>(
    `/api/tenants/${tenantId}/customer-credits/${receiptId}/refunds`,
    body,
  )
}

/**
 * Releases an unclaimed credit to income.
 *
 * <p>Always by hand: limitation is a defence (OR Art. 142), and software that released credits
 * on a timer would be deciding for the tenant that it no longer pays them out.
 */
export function releaseCredit(
  tenantId: number,
  receiptId: number,
  body: CreditUseBody,
): Promise<CustomerCredit> {
  return api.post<CustomerCredit>(
    `/api/tenants/${tenantId}/customer-credits/${receiptId}/releases`,
    body,
  )
}

/** Takes a refund or a release back by writing a counter entry. */
export function reverseCreditUse(
  tenantId: number,
  useId: number,
  reason?: string,
): Promise<CustomerCredit> {
  return api.post<CustomerCredit>(
    `/api/tenants/${tenantId}/customer-credits/uses/${useId}/reverse`,
    { reason },
  )
}
