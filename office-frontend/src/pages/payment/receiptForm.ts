import { formatAmount, isCompleteIsoDate, parseDecimal, toIsoDate } from '../../lib/format'
import type { AssignmentBody, RecordReceiptBody } from '../../lib/paymentReceipt'
import type { OpenItem } from '../../lib/types'

/**
 * The receipt dialog as a piece of state, with the checks it can make itself.
 *
 * <p>Nothing here decides what the backend decides. Whether a Rechnung owes anything, whether
 * a reference is valid and whether the money is still there when two people spread it at once
 * are its answers — this file only catches what somebody can see at a glance, so the screen
 * says it in German instead of echoing a sentence from the server.
 */

/** One Rechnung the money is being spread over, as the dialog holds it. */
export type AssignmentRow = {
  documentId: number
  documentNumber?: string
  partnerName?: string
  currency: string
  /** What is still owed on it, for the pre-fill and for the hint. */
  open: number
  /** As typed, so a half entered amount stays on screen. */
  amount: string
}

/** What the dialog edits. */
export type ReceiptForm = {
  /** As typed, so a half entered amount stays on screen. */
  amount: string
  currency: string
  /** The day the money was valued, `yyyy-MM-dd`. */
  valueDate: string
  payerName: string
  payerReference: string
  note: string
  rows: AssignmentRow[]
}

/** Longest note the backend column holds. */
export const MAX_NOTE_LENGTH = 500

/** Longest payer name the column holds, as the QR bill carries the name field. */
export const MAX_NAME_LENGTH = 70

/** Longest reference the column holds; a QR reference has 27, a SCOR up to 25. */
export const MAX_REFERENCE_LENGTH = 40

/**
 * What a receipt starts as: nothing typed, valued today, in the tenant's currency.
 *
 * <p>No pre-filled amount. Unlike the write-off there is no figure that is right in almost
 * every case — what arrived is read off a bank statement, and a guess would have to be
 * cleared before it can be typed over.
 *
 * @param currency the currency to offer
 * @param today    the day the money was valued, as `yyyy-MM-dd`
 */
export function emptyReceipt(currency = 'CHF', today = toIsoDate()): ReceiptForm {
  return {
    amount: '',
    currency,
    valueDate: today,
    payerName: '',
    payerReference: '',
    note: '',
    rows: [],
  }
}

/**
 * What of a receipt is not spread over Rechnungen yet.
 *
 * <p>Rounded to the rappen, because that is what the two sides of the subtraction are: an
 * amount typed into a field and an amount typed into another. Without it 1250 − 800 − 450
 * comes to a residue of 1e-13 and the footer says «noch nicht zugewiesen: 0.00» while the
 * save button stays locked.
 *
 * @param form what is typed
 * @returns what is left; negative while more was handed out than came in
 */
export function unassignedOf(form: ReceiptForm): number {
  const arrived = parseDecimal(form.amount) ?? 0
  const handedOut = form.rows.reduce((sum, row) => sum + (parseDecimal(row.amount) ?? 0), 0)
  return Math.round((arrived - handedOut) * 100) / 100
}

/**
 * The amount a newly found Rechnung is pre-filled with.
 *
 * <p><b>`min(Rest des Eingangs, offener Posten)`.</b> Whichever runs out first is the amount
 * that can actually be assigned, and both wrong guesses cost the same keystroke to fix — but
 * only this one is never refused by the server.
 *
 * @param item what the lookup found
 * @param left what is left of the receipt
 */
export function proposedAmount(item: OpenItem, left: number): string {
  const amount = Math.min(item.open, left)
  return amount > 0 ? amount.toFixed(2) : ''
}

/**
 * Reads one typed line as either a payment reference or a document number.
 *
 * <p><b>The shape decides, not the first character.</b> A QR reference is 27 digits, a
 * creditor reference starts with `RF` — everything else is a document number, and some
 * tenants number their Rechnungen without a prefix. Sending a plain number as a reference
 * would earn a 400 («keine gültige Referenz») for something that is not one.
 *
 * <p>The check digit is not verified here: that is the backend's answer, and repeating it
 * in the browser would be a second place to get it wrong.
 *
 * @param typed what somebody entered, with any spacing
 * @returns the one query parameter to send
 */
export function lookupBy(typed: string): { reference: string } | { documentNumber: string } {
  const bare = typed.replace(/[\s\u00a0]/g, '').toUpperCase()
  if (/^[0-9]{27}$/.test(bare) || /^RF[0-9A-Z]{3,23}$/.test(bare)) {
    return { reference: typed }
  }
  return { documentNumber: typed }
}

/**
 * Adds what the lookup found, or says why it cannot be added.
 *
 * <p>A Rechnung that is already in the list is not added twice: two lines on the same
 * Rechnung out of the same receipt are one line with a wrong amount, and the sum of the two
 * is what somebody meant.
 *
 * @param form what is typed
 * @param item what the lookup found
 * @returns the form with the row, or the German complaint
 */
export function withFoundItem(
  form: ReceiptForm,
  item: OpenItem,
): { form: ReceiptForm; complaint: null } | { form: null; complaint: string } {
  if (form.rows.some((row) => row.documentId === item.documentId)) {
    return {
      form: null,
      complaint: `${item.documentNumber ?? 'Diese Rechnung'} steht schon in der Liste.`,
    }
  }
  if (item.currency !== form.currency) {
    return {
      form: null,
      complaint: `${item.documentNumber ?? 'Diese Rechnung'} lautet auf ${item.currency}; der Eingang auf ${form.currency}.`,
    }
  }
  const row: AssignmentRow = {
    documentId: item.documentId,
    documentNumber: item.documentNumber,
    partnerName: item.partnerName,
    currency: item.currency,
    open: item.open,
    amount: proposedAmount(item, unassignedOf(form)),
  }
  return { form: { ...form, rows: [...form.rows, row] }, complaint: null }
}

/**
 * Checks what can be checked here, before anything is sent.
 *
 * <p>Deliberately little. The one rule worth spelling out on screen is that more than arrived
 * cannot be handed out — everything beyond that is the backend's, including whether a
 * Rechnung still owes anything at the moment of saving.
 *
 * @param form  what is typed
 * @param today the day the mask runs on, as `yyyy-MM-dd`
 * @returns the German complaint, or `null` when nothing is obviously wrong
 */
export function receiptComplaint(form: ReceiptForm, today = toIsoDate()): string | null {
  const amount = parseDecimal(form.amount)
  if (form.amount.trim() === '' || amount === null) {
    return 'Der Betrag ist keine Zahl, zum Beispiel 1250.00.'
  }
  if (amount <= 0) {
    return 'Ein Zahlungseingang über 0.00 sagt nichts aus.'
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
  if (form.payerName.length > MAX_NAME_LENGTH) {
    return `Der Name des Zahlers fasst höchstens ${MAX_NAME_LENGTH} Zeichen.`
  }
  if (form.payerReference.length > MAX_REFERENCE_LENGTH) {
    return `Die Referenz fasst höchstens ${MAX_REFERENCE_LENGTH} Zeichen.`
  }
  if (form.note.length > MAX_NOTE_LENGTH) {
    return `Die Notiz fasst höchstens ${MAX_NOTE_LENGTH} Zeichen.`
  }
  for (const row of form.rows) {
    const share = parseDecimal(row.amount)
    if (row.amount.trim() === '' || share === null) {
      return `Der Betrag für ${row.documentNumber ?? 'eine Rechnung'} ist keine Zahl.`
    }
    if (share <= 0) {
      return `Eine Zuweisung über 0.00 auf ${row.documentNumber ?? 'eine Rechnung'} sagt nichts aus.`
    }
  }
  const left = unassignedOf(form)
  if (left < 0) {
    return `Es sind nur ${formatAmount(amount)} eingegangen; ${formatAmount(-left)} zu viel lassen sich nicht zuweisen.`
  }
  return null
}

/**
 * What the dialog sends to record the money.
 *
 * <p>Empty text fields are left out rather than sent as `""`: an empty reference is «keine»,
 * and a stored empty string would read as one that was entered.
 *
 * @param form      what is typed
 * @param partnerId the customer that was picked, if any
 */
export function toReceiptPayload(form: ReceiptForm, partnerId?: number): RecordReceiptBody {
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
 * What the dialog sends to spread the money.
 *
 * @param form what is typed
 * @returns one entry per row, in the order they were added
 */
export function toAssignmentPayload(form: ReceiptForm): AssignmentBody[] {
  return form.rows.map((row) => ({
    documentId: row.documentId,
    amount: parseDecimal(row.amount) ?? 0,
  }))
}
