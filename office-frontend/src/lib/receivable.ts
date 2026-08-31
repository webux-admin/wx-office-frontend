import { api } from './api'
import type { OpenItem, Payment, PaymentKind } from './types'

/**
 * The calls behind the open item of a Rechnung: what was settled, and what is left.
 *
 * <p>There is no update and no delete, and that is not an omission. A settlement line is
 * append only; a wrong one is taken back with {@link reversePayment}, which books the
 * opposite amount and leaves both lines readable. The backend refuses the other way round
 * anyway, in the database (backend ADR-0091).
 */

/** What each kind of settlement is called on screen. */
export const PAYMENT_KINDS: Record<PaymentKind, string> = {
  PAYMENT: 'Zahlung',
  CREDIT: 'Gutschrift',
  DISCOUNT: 'Skonto',
  WRITE_OFF: 'Debitorenverlust',
  ROUNDING: 'Rundung',
  BANK_CHARGE: 'Bankspesen',
  EXCHANGE_DIFFERENCE: 'Kursdifferenz',
  OVERPAYMENT_KEPT: 'Überzahlung einbehalten',
  ADVANCE_APPLIED: 'Vorauszahlung verrechnet',
}

/**
 * The kinds in the order the picker offers them: the everyday one first, the one that gives
 * money up last.
 *
 * <p>`BANK_CHARGE` and `EXCHANGE_DIFFERENCE` are here since a payment may be converted: the
 * rest a conversion leaves has to be closable, and neither of the two reduces the agreed
 * consideration (MWSTV Art. 45 and Art. 46, backend ADR-0106).
 *
 * <p><b>`ADVANCE_APPLIED` is deliberately not here.</b> It comes into being only through the
 * credit screen, where a customer credit is set against an invoice — never by somebody
 * choosing it in the payment dialog. Offering it would let a settlement claim a prepayment
 * that does not exist (backend ADR-0104).
 */
export const PAYMENT_KIND_ORDER: PaymentKind[] = [
  'PAYMENT',
  'DISCOUNT',
  'CREDIT',
  'ROUNDING',
  'BANK_CHARGE',
  'EXCHANGE_DIFFERENCE',
  'WRITE_OFF',
]

/**
 * The kinds that reduce the agreed consideration rather than settling it.
 *
 * <p>They carry a VAT consequence under MWSTG Art. 41. Recorded as a plain settlement it is
 * not held anywhere — that is what the write-off does instead, with reason, period and the
 * consequence per rate. The dialog says so where such a kind is chosen, so nobody takes the
 * closed open item for a finished tax matter (backend ADR-0101).
 *
 * <p>`ROUNDING` counts among them, deliberately conservative: Swiss law knows no statutory
 * threshold in francs, and a later exemption removes rows while a correction caught up
 * afterwards has to invent them.
 */
export const REDUCES_CONSIDERATION: PaymentKind[] = [
  'CREDIT',
  'DISCOUNT',
  'WRITE_OFF',
  'ROUNDING',
  'OVERPAYMENT_KEPT',
]

/** What one settlement to record looks like on the wire. */
export type RecordPaymentBody = {
  kind: PaymentKind
  /** What arrived, in the currency below — not what the invoice settles. */
  amount: number
  currency: string
  valueDate: string
  /**
   * Converts the amount into the currency of the invoice.
   *
   * <p>Required where the two currencies differ, refused where they are the same. The
   * settled amount is worked out by the server: two figures sent together could contradict
   * each other, and the row is unchangeable once written (backend ADR-0106).
   */
  exchangeRate?: number
  /** How many units the rate refers to: 1 or 100. Left out counts as 1. */
  exchangeRateUnit?: number
  /** The day of the rate; required together with the rate. */
  exchangeRateDate?: string
  note?: string
}

/**
 * The settlement history of one Rechnung, oldest value date first.
 *
 * @param tenantId   the tenant
 * @param documentId the Rechnung
 */
export function fetchPayments(tenantId: number, documentId: number): Promise<Payment[]> {
  return api.get<Payment[]>(`/api/tenants/${tenantId}/invoices/${documentId}/payments`)
}

/**
 * The three zones a payment that is too large falls into.
 *
 * <p>Worked out on the server, not here: the same rule has to hold when a statement import
 * asks it, and two implementations of one limit drift apart (backend ADR-0105).
 */
export type OverpaymentZone = 'ROUNDING' | 'KEEP_PROPOSED' | 'CREDIT_ONLY'

/**
 * What would happen if this amount were recorded.
 *
 * <p>It writes nothing. The mask <b>warns and does not block</b> — a customer who transfers
 * twenty rappen too much must not become an error dialog.
 */
export type OverpaymentAdvice = {
  zone: OverpaymentZone
  /** How much too much; zero or negative means it is not an overpayment. */
  difference: number
  currency: string
  openAmount: number
  /** Whether a keep of this size may be chosen at all. */
  keepAllowed: boolean
  /** Whether a keep of this size has to say why. */
  noteRequired: boolean
  /** Above this a keep needs a note — «aufgerundet» is then a claim. */
  keepLimit: number
  keepMaximum: number
}

/**
 * Asks what would happen if this amount were recorded on this Rechnung.
 *
 * @param tenantId   the tenant
 * @param documentId the Rechnung
 * @param amount     what would be recorded
 */
export function fetchOverpaymentAdvice(
  tenantId: number,
  documentId: number,
  amount: number,
): Promise<OverpaymentAdvice> {
  return api.get<OverpaymentAdvice>(
    `/api/tenants/${tenantId}/invoices/${documentId}/overpayment-advice?amount=${amount}`,
  )
}
/**
 * What one Rechnung still owes.
 *
 * <p>Answers 400 for a document that carries no receivable at all — a draft, a reversed
 * Rechnung, the counter document of a reversal. Callers ask only where the mask already knows
 * the Rechnung is issued.
 *
 * @param tenantId   the tenant
 * @param documentId the Rechnung
 */
export function fetchOpenItem(tenantId: number, documentId: number): Promise<OpenItem> {
  return api.get<OpenItem>(`/api/tenants/${tenantId}/invoices/${documentId}/open-item`)
}

/**
 * Records a settlement.
 *
 * @param tenantId   the tenant
 * @param documentId the Rechnung
 * @param body       what to record
 */
export function recordPayment(
  tenantId: number,
  documentId: number,
  body: RecordPaymentBody,
): Promise<Payment> {
  return api.post<Payment>(`/api/tenants/${tenantId}/invoices/${documentId}/payments`, body)
}

/**
 * Takes a settlement back by booking the opposite amount.
 *
 * @param tenantId   the tenant
 * @param documentId the Rechnung
 * @param paymentId  the line to take back
 * @param reason     why, may be left out
 */
export function reversePayment(
  tenantId: number,
  documentId: number,
  paymentId: number,
  reason?: string,
): Promise<Payment> {
  return api.post<Payment>(
    `/api/tenants/${tenantId}/invoices/${documentId}/payments/${paymentId}/reverse`,
    { reason: reason ?? null },
  )
}

/**
 * How an open amount should read: as a debt, as settled, or as a credit we owe back.
 *
 * <p>Three states and not two, because a negative open amount is a real answer. The backend
 * allows an overpayment on purpose — twenty rappen too much must not be an error dialog — and
 * a mask that showed it as «offen: -0.20» would read as a debt of minus twenty rappen.
 *
 * @param open what the backend worked out
 * @returns which of the three states it is
 */
export function openState(open: number | undefined): 'open' | 'settled' | 'credit' {
  if (open === undefined || open === null) return 'settled'
  if (open > 0) return 'open'
  if (open < 0) return 'credit'
  return 'settled'
}

/**
 * Whether a line still counts towards the open item.
 *
 * <p>A line that was taken back stays in the list — the history has to stay readable — but it
 * is struck through rather than silently dropped, and so is the counter line that did it.
 *
 * @param payment the line
 */
export function stillCounts(payment: Payment): boolean {
  return payment.reversedByPaymentId === undefined && payment.reversesPaymentId === undefined
}
