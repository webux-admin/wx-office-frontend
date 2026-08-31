import { formatAmount, isCompleteIsoDate, parseDecimal, toIsoDate } from '../../lib/format'
import type { WriteOffBody } from '../../lib/openItem'
import type { WriteOffReason } from '../../lib/types'

/**
 * The write-off dialog as a piece of state, with the checks it can make itself.
 *
 * <p>Nothing here recalculates what the backend decides. Whether a reason reduces the
 * consideration, what the tax consequence comes to and which period it lands in are its
 * answers — this file only catches what somebody can see at a glance, so the screen says it
 * in German instead of echoing a sentence from the server.
 */

/** What the dialog edits. */
export type WriteOffForm = {
  reason: WriteOffReason
  /** As typed, so a half entered amount stays on screen. */
  amount: string
  /** The period of the tax correction, `yyyy-MM-dd`. */
  bookingDate: string
  evidence: string
  note: string
}

/** Longest evidence or note the backend column holds. */
export const MAX_TEXT_LENGTH = 500

/**
 * What a write-off starts as: the small difference, booked today, for whatever is open.
 *
 * <p>Pre-filled with the open amount because that is what is given up in almost every case,
 * and a wrong pre-fill is corrected in one keystroke while an empty field is typed out every
 * time. <b>Never with a negative amount</b>: an overpayment is a credit the customer is owed,
 * and it is kept with its own reason rather than written off.
 *
 * @param open  what is still open, `undefined` while it is not known yet. Negative means
 *              the customer overpaid, and that is what a kept surplus is proposed with
 * @param today the day to book on, as `yyyy-MM-dd`
 * @param reason the reason to start on; the overpayment case pre-fills the other way
 */
export function proposedWriteOff(open: number | undefined, today = toIsoDate(),
                                 reason: WriteOffReason = 'KLEINDIFFERENZ'): WriteOffForm {
  // The one reason that moves the other way: an overpayment kept is proposed with the
  // surplus, which is what a negative open amount is (backend ADR-0105).
  const proposed = reason === 'UEBERZAHLUNG'
    ? (open !== undefined && open < 0 ? (-open).toFixed(2) : '')
    : (open !== undefined && open > 0 ? open.toFixed(2) : '')
  return {
    reason,
    amount: proposed,
    bookingDate: today,
    evidence: '',
    note: '',
  }
}

/**
 * Checks what can be checked here, before anything is sent.
 *
 * <p>Deliberately little. The one rule worth spelling out on screen is that more than open
 * cannot be given up — everything beyond that is the backend's, including whether the period
 * is still open and what the tax correction comes to.
 *
 * @param form  what is typed
 * @param open  what is still open on the Rechnung
 * @param today the day the mask runs on, as `yyyy-MM-dd`
 * @param keepLimit above which a kept overpayment needs a note
 * @param keepMaximum above which a kept overpayment is refused outright
 * @returns the German complaint, or `null` when nothing is obviously wrong
 */
export function writeOffComplaint(
  form: WriteOffForm,
  open: number | undefined,
  today = toIsoDate(),
  keepLimit?: number,
  keepMaximum?: number,
): string | null {
  const amount = parseDecimal(form.amount)
  if (form.amount.trim() === '' || amount === null) {
    return 'Der Betrag ist keine Zahl, zum Beispiel 0.20.'
  }
  if (amount <= 0) {
    return 'Eine Ausbuchung über 0.00 sagt nichts aus.'
  }
  if (!isCompleteIsoDate(form.bookingDate)) {
    return 'Das Buchungsdatum fehlt.'
  }
  if (form.bookingDate > today) {
    return 'Das Buchungsdatum darf nicht in der Zukunft liegen.'
  }
  // An overpayment kept moves the other way, so what limits it is not the open amount but
  // the tenant's ceiling: above it the surplus stays a credit of the customer, because a
  // mistyped transfer is a mistake under OR Art. 63 Abs. 1 that the recipient may not
  // decide about alone (backend ADR-0105).
  if (form.reason === 'UEBERZAHLUNG') {
    if (keepMaximum !== undefined && amount > keepMaximum) {
      return `Über ${formatAmount(keepMaximum)} lässt sich eine Überzahlung nicht einbehalten; sie bleibt ein Guthaben des Kunden.`
    }
    if (keepLimit !== undefined && amount > keepLimit && form.note.trim() === '') {
      return `Über ${formatAmount(keepLimit)} braucht ein Einbehalt eine Bemerkung; «aufgerundet» ist dann eine Behauptung.`
    }
  } else if (open !== undefined && amount > open) {
    return `Es sind nur ${formatAmount(open)} offen; mehr lässt sich nicht ausbuchen.`
  }
  if (form.evidence.length > MAX_TEXT_LENGTH || form.note.length > MAX_TEXT_LENGTH) {
    return `Nachweis und Bemerkung fassen höchstens ${MAX_TEXT_LENGTH} Zeichen.`
  }
  return null
}

/**
 * What the dialog sends.
 *
 * <p>Empty text fields are left out rather than sent as `""`: an empty evidence is «keiner»,
 * and a stored empty string would read as one that was entered.
 *
 * @param form what is typed
 * @returns the payload, with the amount as a number
 */
export function toWriteOffPayload(form: WriteOffForm): WriteOffBody {
  const evidence = form.evidence.trim()
  const note = form.note.trim()
  return {
    reason: form.reason,
    amount: parseDecimal(form.amount) ?? 0,
    bookingDate: form.bookingDate,
    evidence: evidence === '' ? undefined : evidence,
    note: note === '' ? undefined : note,
  }
}
