import { parseDecimal } from '../../lib/format'
import type { SalesDocument } from '../../lib/types'

/** The two ways a discount on the whole document can be given. */
export type DiscountMode = 'NONE' | 'PERCENT' | 'AMOUNT'

/** The discount panel while it is being filled in. */
export type DiscountForm = {
  mode: DiscountMode
  /** The percentage as typed; only read in mode `PERCENT`. */
  percent: string
  /** The amount without VAT as typed; only read in mode `AMOUNT`. */
  amount: string
}

/** How many per cent a discount may be at most; the backend agrees. */
export const MAX_PERCENT = 100

/**
 * Fills the panel from a stored document.
 *
 * <p>The mode follows what is stored, not what was typed last: a document carries at most one
 * of the two, and that is the one to show.
 *
 * @param document the document as the API returned it
 * @returns the panel, with the field of the other mode left empty
 */
export function toDiscountForm(document: SalesDocument): DiscountForm {
  if (document.discountPercent !== undefined) {
    return { mode: 'PERCENT', percent: `${document.discountPercent}`, amount: '' }
  }
  if (document.discountAmount !== undefined) {
    return { mode: 'AMOUNT', percent: '', amount: `${document.discountAmount}` }
  }
  return { mode: 'NONE', percent: '', amount: '' }
}

/** The payload of `PUT /{documents}/{id}/discount`. */
export type DiscountPayload = { percent?: number; amount?: number }

/**
 * Turns the panel into the payload.
 *
 * <p>Only the field of the chosen mode travels. Both absent takes the discount away, which is
 * what mode `NONE` means — the endpoint reads that as «no discount», not as «unchanged».
 *
 * @param form the filled in panel
 * @returns the discount as the API wants it
 */
export function toDiscountPayload(form: DiscountForm): DiscountPayload {
  if (form.mode === 'PERCENT') {
    return { percent: parseDecimal(form.percent) ?? undefined }
  }
  if (form.mode === 'AMOUNT') {
    return { amount: parseDecimal(form.amount) ?? undefined }
  }
  return {}
}

/**
 * Checks the rules the backend would otherwise answer with.
 *
 * @param form the filled in panel
 * @param discountableBase what a discount could reduce at all, absent while it is unknown
 * @returns the first German complaint, or `null` when the panel may be sent
 */
export function discountComplaint(
  form: DiscountForm,
  discountableBase: number | undefined,
): string | null {
  if (form.mode === 'NONE') return null
  if (form.mode === 'PERCENT') {
    const percent = parseDecimal(form.percent)
    if (percent === null) return 'Der Rabatt ist keine Zahl.'
    if (percent <= 0 || percent > MAX_PERCENT) {
      return `Ein Belegrabatt liegt zwischen 0 und ${MAX_PERCENT} Prozent.`
    }
    return null
  }
  const amount = parseDecimal(form.amount)
  if (amount === null) return 'Der Rabatt ist keine Zahl.'
  if (amount <= 0) return 'Der Rabatt ist grösser als null.'
  if (discountableBase !== undefined && amount > Math.abs(discountableBase)) {
    return 'Der Rabatt ist grösser als der rabattfähige Betrag.'
  }
  return null
}

/**
 * What the discount would come to, before it is saved.
 *
 * <p>Only for the percentage: an amount is what it says. Shown so nobody has to save to find
 * out what «5 %» means on this document — and worked out on the base the backend named, so
 * the browser is not making up a second opinion about which positions may be reduced.
 *
 * @param form the filled in panel
 * @param discountableBase what a discount could reduce at all, absent while it is unknown
 * @returns the reduction without VAT, or `null` where there is nothing to preview
 */
export function previewNet(
  form: DiscountForm,
  discountableBase: number | undefined,
): number | null {
  if (form.mode !== 'PERCENT' || discountableBase === undefined) return null
  const percent = parseDecimal(form.percent)
  if (percent === null || percent <= 0 || percent > MAX_PERCENT) return null
  // Rounded to the rappen, like the backend. A preview that shows more places than the
  // saved figure would look like a different number.
  return Math.round(discountableBase * percent) / 100
}
