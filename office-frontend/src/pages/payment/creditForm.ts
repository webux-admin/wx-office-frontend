import { formatAmount, isCompleteIsoDate, parseDecimal, toIsoDate } from '../../lib/format'
import type { CreditUseBody, RecordAdvanceBody } from '../../lib/customerCredit'
import type { CreditUseReason } from '../../lib/types'

/**
 * The customer credit dialogs as pieces of state, with the checks they can make themselves.
 *
 * <p>Nothing here decides what the backend decides. Whether a credit still carries the amount,
 * whether an invoice owes anything and what the tax consequence is are its answers — this file
 * only catches what somebody can see at a glance, so the screen says it in German instead of
 * echoing a sentence from the server.
 */

/** What the prepayment dialog edits. */
export type AdvanceForm = {
  /** As typed, so a half entered amount stays on screen. */
  amount: string
  currency: string
  /** The day the money was valued, `yyyy-MM-dd`. */
  valueDate: string
  payerName: string
  payerReference: string
  note: string
}

/** What the refund and release dialogs edit. */
export type CreditUseForm = {
  reason: CreditUseReason
  /** As typed. */
  amount: string
  /** The day it was decided, `yyyy-MM-dd`. */
  bookingDate: string
  refundIban: string
  note: string
}

/** Longest note the backend column holds. */
export const MAX_NOTE_LENGTH = 500

/** Longest IBAN there is, in its printed form. */
export const MAX_IBAN_LENGTH = 34

/**
 * What a prepayment starts as: nothing typed, valued today.
 *
 * @param currency the currency to offer
 * @param today    the day the money was valued, as `yyyy-MM-dd`
 */
export function emptyAdvance(currency = 'CHF', today = toIsoDate()): AdvanceForm {
  return {
    amount: '',
    currency,
    valueDate: today,
    payerName: '',
    payerReference: '',
    note: '',
  }
}

/**
 * What a refund or release starts as: the whole remainder, booked today.
 *
 * <p>Pre-filled with what is left, because that is what happens in almost every case, and a
 * wrong pre-fill is corrected in one keystroke while an empty field is typed out every time.
 *
 * @param reason    the reason to start on
 * @param remaining what is still owed on the credit
 * @param today     the day to book on, as `yyyy-MM-dd`
 */
export function proposedUse(reason: CreditUseReason, remaining: number | undefined,
                            today = toIsoDate()): CreditUseForm {
  return {
    reason,
    amount: remaining !== undefined && remaining > 0 ? remaining.toFixed(2) : '',
    bookingDate: today,
    refundIban: '',
    note: '',
  }
}

/**
 * Checks what can be checked before a prepayment is sent.
 *
 * @param form  what is typed
 * @param hasPartner whether a customer was chosen
 * @param today the day the mask runs on, as `yyyy-MM-dd`
 * @returns the German complaint, or `null` when nothing is obviously wrong
 */
export function advanceComplaint(form: AdvanceForm, hasPartner: boolean,
                                 today = toIsoDate()): string | null {
  if (!hasPartner) {
    // A prepayment is money the tenant owes somebody. A debt without a creditor is not a
    // fact anybody can act on (backend ADR-0104).
    return 'Eine Vorauszahlung braucht einen Kunden — sonst ist nicht bekannt, wem das Geld gehört.'
  }
  const amount = parseDecimal(form.amount)
  if (form.amount.trim() === '' || amount === null) {
    return 'Der Betrag ist keine Zahl, zum Beispiel 1250.00.'
  }
  if (amount <= 0) {
    return 'Eine Vorauszahlung über 0.00 sagt nichts aus.'
  }
  if (!isCompleteIsoDate(form.valueDate)) {
    return 'Das Valutadatum fehlt.'
  }
  if (form.valueDate > today) {
    return 'Das Valutadatum darf nicht in der Zukunft liegen.'
  }
  if (form.currency.trim().length !== 3) {
    return 'Die Währung ist ein Code aus drei Buchstaben, zum Beispiel CHF.'
  }
  if (form.note.length > MAX_NOTE_LENGTH) {
    return `Die Notiz fasst höchstens ${MAX_NOTE_LENGTH} Zeichen.`
  }
  return null
}

/**
 * Checks what can be checked before a refund or a release is sent.
 *
 * <p>The one rule worth spelling out on screen is that more than is left cannot go out.
 *
 * @param form      what is typed
 * @param remaining what is still owed on the credit
 * @param today     the day the mask runs on, as `yyyy-MM-dd`
 * @returns the German complaint, or `null` when nothing is obviously wrong
 */
export function creditUseComplaint(form: CreditUseForm, remaining: number | undefined,
                                   today = toIsoDate()): string | null {
  const amount = parseDecimal(form.amount)
  if (form.amount.trim() === '' || amount === null) {
    return 'Der Betrag ist keine Zahl, zum Beispiel 400.00.'
  }
  if (amount <= 0) {
    return 'Ein Betrag über 0.00 sagt nichts aus.'
  }
  if (!isCompleteIsoDate(form.bookingDate)) {
    return 'Das Buchungsdatum fehlt.'
  }
  if (form.bookingDate > today) {
    return 'Das Buchungsdatum darf nicht in der Zukunft liegen.'
  }
  if (remaining !== undefined && amount > remaining) {
    return `Es sind nur noch ${formatAmount(remaining)} übrig; mehr lässt sich nicht verwenden.`
  }
  if (form.refundIban.length > MAX_IBAN_LENGTH) {
    return `Die IBAN fasst höchstens ${MAX_IBAN_LENGTH} Zeichen.`
  }
  if (form.note.length > MAX_NOTE_LENGTH) {
    return `Die Notiz fasst höchstens ${MAX_NOTE_LENGTH} Zeichen.`
  }
  return null
}

/**
 * What the prepayment dialog sends.
 *
 * <p>Empty text fields are left out rather than sent as `""`.
 *
 * @param form      what is typed
 * @param partnerId the customer that was chosen
 */
export function toAdvancePayload(form: AdvanceForm, partnerId: number): RecordAdvanceBody {
  const payerName = form.payerName.trim()
  const payerReference = form.payerReference.trim()
  const note = form.note.trim()
  return {
    partnerId,
    payerName: payerName === '' ? undefined : payerName,
    amount: parseDecimal(form.amount) ?? 0,
    currency: form.currency.trim().toUpperCase(),
    valueDate: form.valueDate,
    payerReference: payerReference === '' ? undefined : payerReference,
    note: note === '' ? undefined : note,
  }
}

/**
 * What the refund and release dialogs send.
 *
 * <p>The IBAN travels only on a refund: a release pays nothing out, and an account it went to
 * would be a receipt for a payment that never happened. The server refuses it either way; this
 * saves the round trip.
 *
 * @param form what is typed
 */
export function toCreditUsePayload(form: CreditUseForm): CreditUseBody {
  const refundIban = form.refundIban.trim()
  const note = form.note.trim()
  const isRefund = form.reason.startsWith('REFUND_')
  return {
    reason: form.reason,
    amount: parseDecimal(form.amount) ?? 0,
    bookingDate: form.bookingDate,
    refundIban: isRefund && refundIban !== '' ? refundIban : undefined,
    note: note === '' ? undefined : note,
  }
}

/**
 * What one invoice would take out of a credit.
 *
 * <p><b>`min(Rest des Guthabens, offener Posten)`.</b> Whichever runs out first is what can
 * actually be assigned, and only that pre-fill is never refused by the server.
 *
 * @param openAmount what is still open on the invoice
 * @param remaining  what is left of the credit
 */
export function proposedApplication(openAmount: number, remaining: number): string {
  const amount = Math.min(openAmount, remaining)
  return amount > 0 ? amount.toFixed(2) : ''
}
