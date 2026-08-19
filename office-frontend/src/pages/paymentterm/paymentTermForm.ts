import { formatPercent, parseDecimal } from '../../lib/format'
import type { DueDateBasis, PaymentTerm, PaymentTermDiscount } from '../../lib/types'

/** One discount stage while it is being entered: both values are still text. */
export type DiscountRow = { days: string; percent: string }

/**
 * The payment term mask while it is being filled in.
 *
 * <p>Every field is a string, because that is what an input holds. Turning them into the
 * numbers the API expects happens once, on the way out, rather than on every keystroke.
 *
 * <p>The translations are not part of it: they are held next to the mask and go out as the
 * `labels` map, which the endpoints replace wholesale.
 */
export type TermForm = {
  code: string
  name: string
  description: string
  netDays: string
  dueDateBasis: DueDateBasis
  discounts: DiscountRow[]
}

/**
 * An empty mask, for a term that is being added.
 *
 * <p>Starts at thirty days from the document date, which is what most terms are and what the
 * person entering one would otherwise type first. Nothing is computed from it: both values
 * stay editable and are decided by whoever fills the mask.
 */
export const EMPTY_TERM: TermForm = {
  code: '',
  name: '',
  description: '',
  netDays: '30',
  dueDateBasis: 'DOCUMENT_DATE',
  discounts: [],
}

/**
 * Fills the mask from a stored term.
 *
 * @param term the term as the API returned it
 * @returns the mask, with every missing field as an empty string and no stage invented
 */
export function toTermForm(term: PaymentTerm): TermForm {
  return {
    code: term.code,
    name: term.name,
    description: term.description ?? '',
    netDays: `${term.netDays}`,
    dueDateBasis: term.dueDateBasis ?? 'DOCUMENT_DATE',
    discounts: (term.discounts ?? []).map((stage) => ({
      days: `${stage.days}`,
      percent: `${stage.percent}`,
    })),
  }
}

/**
 * Turns the mask into the payload of `POST`/`PUT /api/tenants/{id}/payment-terms`.
 *
 * <p>Five fields always go out, even unchanged. The code because the update discards it but
 * still validates it, so leaving it out fails the whole request. The stages and the labels
 * because both endpoints replace them wholesale, and an absent one would wipe what is stored.
 *
 * <p>A stage missing either of its two values counts as not entered and is dropped rather than
 * sent as a zero: a half-filled row is an unfinished thought, not a discount of nothing.
 *
 * <p>An empty period never gets here, because {@link termComplaint} refuses it before the
 * request; the zero below only satisfies the type.
 *
 * @param form the filled in mask
 * @param labels the translations as `labelPayload` built them, `undefined` when there are none
 * @returns the term as the API wants it
 */
export function toTermPayload(
  form: TermForm,
  labels: Record<string, string> | undefined,
): Partial<PaymentTerm> & { code: string } {
  return {
    code: form.code.trim(),
    name: form.name.trim(),
    labels,
    description: form.description.trim() || undefined,
    netDays: parseDecimal(form.netDays) ?? 0,
    dueDateBasis: form.dueDateBasis,
    discounts: enteredStages(form.discounts),
  }
}

/** How many discount stages one term may carry; the backend enforces the same limit. */
export const MAX_DISCOUNTS = 3

/** The longest payment period the backend accepts, in days. */
const MAX_NET_DAYS = 365

/**
 * Checks the rules the backend would otherwise answer with, so the mask can name the field
 * before the request goes out.
 *
 * <p>Nothing here is a calculation: the due date, the discount amounts and the sentence on the
 * document all come from the backend. This only refuses input that cannot be meant.
 *
 * @param form the filled in mask
 * @returns the first German complaint, or `null` when the mask may be sent
 */
export function termComplaint(form: TermForm): string | null {
  if (form.code.trim() === '') return 'Eine Zahlungskondition braucht einen Code.'
  if (form.code.trim().length > 30) return 'Der Code darf höchstens 30 Zeichen lang sein.'
  if (form.name.trim() === '') return 'Eine Zahlungskondition braucht eine Bezeichnung.'
  if (form.name.trim().length > 60) return 'Die Bezeichnung darf höchstens 60 Zeichen lang sein.'
  if (form.description.trim().length > 200) {
    return 'Die Beschreibung darf höchstens 200 Zeichen lang sein.'
  }

  const netDays = parseDecimal(form.netDays)
  if (netDays === null) return 'Eine Zahlungskondition braucht eine Zahlungsfrist in Tagen.'
  if (!Number.isInteger(netDays)) return 'Die Zahlungsfrist ist eine ganze Zahl von Tagen.'
  if (netDays < 0 || netDays > MAX_NET_DAYS) {
    return `Die Zahlungsfrist liegt zwischen 0 und ${MAX_NET_DAYS} Tagen.`
  }

  return discountComplaint(form.discounts, netDays)
}

/**
 * The two ways the backend counts a due date, in German.
 *
 * <p>Written out here rather than read from the API: unlike PartnerType, VatMethod and the
 * other structural enums, no catalogue endpoint serves DueDateBasis, so there is no label the
 * tenant could rename and nothing to ask the backend for.
 */
export const DUE_DATE_BASES: Record<DueDateBasis, string> = {
  DOCUMENT_DATE: 'Belegdatum',
  END_OF_MONTH: 'Monatsende',
}

/**
 * Says in words when a document with this term is due, for a table cell.
 *
 * @param term the term as the API returned it
 * @returns for example "sofort", "30 Tage" or "30 Tage ab Monatsende"
 */
export function describePeriod(term: PaymentTerm): string {
  if (term.netDays === 0) return 'sofort'
  const period = `${term.netDays} ${term.netDays === 1 ? 'Tag' : 'Tage'}`
  return term.dueDateBasis === 'END_OF_MONTH' ? `${period} ab Monatsende` : period
}

/**
 * Says in words what may be deducted, one entry per discount stage, in the order the API
 * delivered them.
 *
 * @param term the term as the API returned it
 * @returns for example ["2 % / 10 Tage"], empty for a term without discount
 */
export function describeDiscounts(term: PaymentTerm): string[] {
  return (term.discounts ?? []).map(
    (stage) =>
      `${formatPercent(stage.percent)} / ${stage.days} ${stage.days === 1 ? 'Tag' : 'Tage'}`,
  )
}

/**
 * The stages the mask actually holds, sorted the way the API keeps them: earliest deadline
 * first.
 */
function enteredStages(rows: readonly DiscountRow[]): PaymentTermDiscount[] {
  const stages: PaymentTermDiscount[] = []
  for (const row of rows) {
    const days = parseDecimal(row.days)
    const percent = parseDecimal(row.percent)
    if (days === null || percent === null) continue
    stages.push({ days, percent })
  }
  return stages.sort((one, other) => one.days - other.days)
}

/** The rules a set of discount stages has to keep, measured against the net period. */
function discountComplaint(rows: readonly DiscountRow[], netDays: number): string | null {
  // A row carrying only one of the two values is dropped on the way out. Saying so here is the
  // difference between a stage the operator decided against and one that quietly disappeared.
  const halfFilled = rows.some(
    (row) => (parseDecimal(row.days) === null) !== (parseDecimal(row.percent) === null),
  )
  if (halfFilled) return 'Eine Skontostaffel braucht Frist und Satz. Sonst die Zeile entfernen.'

  const stages = enteredStages(rows)
  if (stages.length === 0) return null
  if (netDays === 0) return 'Bei Zahlung sofort netto ist kein Skonto möglich.'
  if (stages.length > MAX_DISCOUNTS) {
    return `Eine Zahlungskondition trägt höchstens ${MAX_DISCOUNTS} Skontostaffeln.`
  }

  for (const [index, stage] of stages.entries()) {
    if (!Number.isInteger(stage.days) || stage.days < 0) {
      return 'Eine Skontofrist ist eine ganze Zahl von Tagen und nicht negativ.'
    }
    if (stage.days >= netDays) {
      return `Eine Skontofrist muss kürzer sein als die Zahlungsfrist von ${netDays} Tagen.`
    }
    if (stage.percent <= 0 || stage.percent > 100) {
      return 'Ein Skontosatz liegt über 0 und höchstens bei 100 Prozent.'
    }
    if (decimalsOf(rows, stage.percent) > 2) {
      return 'Ein Skontosatz hat höchstens zwei Dezimalstellen.'
    }
    const earlier = stages[index - 1]
    if (earlier === undefined) continue
    if (earlier.days === stage.days) {
      return 'Zwei Skontostaffeln mit derselben Frist sind nicht möglich.'
    }
    if (earlier.percent <= stage.percent) {
      return 'Der Skontosatz muss mit längerer Frist sinken: früher zahlen darf nicht weniger Abzug bringen.'
    }
  }
  return null
}

/**
 * How many decimals were typed for one rate.
 *
 * <p>Counted on the text rather than on the number, because 2.05 times 100 is not 205 in binary
 * floating point and a rounding test would refuse a rate the backend accepts.
 */
function decimalsOf(rows: readonly DiscountRow[], percent: number): number {
  const typed = rows.find((row) => parseDecimal(row.percent) === percent)
  const fraction = /[.,](\d*)/.exec(typed?.percent.trim() ?? '')
  return fraction === null ? 0 : fraction[1].length
}
