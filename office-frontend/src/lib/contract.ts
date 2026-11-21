import type { FieldErrors } from './fieldErrors'
import { parseDecimal } from './format'
import { listQuery } from './paging'
import type {
  BillingInterval,
  Contract,
  ContractPosition,
  ContractPositionRequest,
  ContractRequest,
  NoticePeriodUnit,
} from './types'

/**
 * The contract module: its addresses, its rights and the rules of its form.
 *
 * <p>Its own building block, like `project.ts`: the list, the mask and the sidebar read the
 * same addresses, and a query key written twice is a cache that goes stale in one of them.
 */

/** Name of the backend `LicensedModule` value. */
export const CONTRACT_MODULE = 'CONTRACT'

/** Path of the contract list within the application. */
export const CONTRACT_PATH = '/vertraege'

/** The two rights of the module (backend ADR-0143). */
export const CONTRACT_RIGHTS = {
  read: 'CONTRACT_READ',
  write: 'CONTRACT_WRITE',
} as const

/** What each interval is called in a select. */
export const BILLING_INTERVAL_LABELS: Record<BillingInterval, string> = {
  MONTHLY: 'Monatlich',
  QUARTERLY: 'Quartalsweise',
  YEARLY: 'Jährlich',
}

/** What an amount of an interval is followed by: «1’000.00 CHF pro Monat». */
export const BILLING_INTERVAL_PER: Record<BillingInterval, string> = {
  MONTHLY: 'pro Monat',
  QUARTERLY: 'pro Quartal',
  YEARLY: 'pro Jahr',
}

/** The unit of a notice period, singular and plural. */
const NOTICE_UNIT_WORDS: Record<NoticePeriodUnit, [string, string]> = {
  DAYS: ['Tag', 'Tage'],
  WEEKS: ['Woche', 'Wochen'],
  MONTHS: ['Monat', 'Monate'],
}

/** What each unit is called in a select. */
export const NOTICE_UNIT_LABELS: Record<NoticePeriodUnit, string> = {
  DAYS: 'Tage',
  WEEKS: 'Wochen',
  MONTHS: 'Monate',
}

/** Longest title of a contract the backend takes. */
export const CONTRACT_TITLE_MAX_LENGTH = 120

/** Longest note the backend takes. */
export const CONTRACT_NOTE_MAX_LENGTH = 4000

/** Longest title of a position the backend takes. */
export const POSITION_TITLE_MAX_LENGTH = 140

/** Longest product number the backend takes, the same as in the catalogue. */
export const POSITION_PRODUCT_NUMBER_MAX_LENGTH = 20

/** Longest text of a position the backend takes. */
export const POSITION_DESCRIPTION_MAX_LENGTH = 4000

/** Most positions one contract takes. */
export const CONTRACT_MAX_POSITIONS = 200

/** Decimals a quantity or a price may carry. */
const MAX_DECIMALS = 4

/**
 * @param value what a select holds
 * @returns true for one of the three interval codes
 */
export function isBillingInterval(value: string): value is BillingInterval {
  return Object.hasOwn(BILLING_INTERVAL_LABELS, value)
}

/**
 * @param value what a select holds
 * @returns true for one of the three unit codes
 */
export function isNoticePeriodUnit(value: string): value is NoticePeriodUnit {
  return Object.hasOwn(NOTICE_UNIT_LABELS, value)
}

/**
 * @param tenantId the tenant
 * @returns address of the contract list and of creating a contract
 */
export function contractsUrl(tenantId: number): string {
  return `/api/tenants/${tenantId}/contracts`
}

/**
 * @param tenantId the tenant
 * @param contractId the contract
 * @returns address of one contract
 */
export function contractUrl(tenantId: number, contractId: number | string): string {
  return `${contractsUrl(tenantId)}/${contractId}`
}

/**
 * The customers a contract can be made with, narrowed by what was typed.
 *
 * <p>Asks the contract module and not the partner module: whoever maintains contracts needs no
 * partner right to fill in the form.
 *
 * @param tenantId the tenant
 * @param search part of a name or number, empty for the first ones by name
 * @returns address of the customer lookup
 */
export function contractCustomersUrl(tenantId: number, search: string): string {
  const query = listQuery({ search })
  return `${contractsUrl(tenantId)}/customers${query === '' ? '' : `?${query}`}`
}

/**
 * What the customer pays for a product, as the product module resolves it: customer price,
 * price group, base price.
 *
 * @param tenantId the tenant
 * @param partnerId the customer of the contract
 * @param productId the product taken from the catalogue
 * @param quantity how many, because a price can start at a quantity
 * @param dateOfSupply the day that decides which price period applies, empty for today
 * @returns address of the resolved price
 */
export function resolvedPriceUrl(
  tenantId: number,
  partnerId: number,
  productId: number,
  quantity: number,
  dateOfSupply: string,
): string {
  const query = listQuery({ quantity, dateOfSupply: dateOfSupply === '' ? undefined : dateOfSupply })
  return `/api/tenants/${tenantId}/partners/${partnerId}/products/${productId}/price?${query}`
}

/**
 * @param tenantId the tenant
 * @returns cache key every contract query starts with, so one invalidation refreshes them all
 */
export function contractsKey(tenantId: number): readonly unknown[] {
  return ['contracts', tenantId]
}

/**
 * The term of a contract in one line.
 *
 * @param startDate first day, ISO
 * @param endDate last day, ISO, absent for open ended
 * @param format how one date is written
 * @returns «01.01.2027 – 31.12.2029» or «ab 01.01.2027, unbefristet»
 */
export function contractTerm(
  startDate: string,
  endDate: string | null | undefined,
  format: (value: string) => string,
): string {
  if (!endDate) return `ab ${format(startDate)}, unbefristet`
  return startDate === endDate ? format(startDate) : `${format(startDate)} – ${format(endDate)}`
}

/**
 * @param amount units of notice, absent when none was agreed
 * @param unit the unit, absent when none was agreed
 * @returns «3 Monate», «1 Woche», or «keine» when no notice period was agreed
 */
export function noticePeriodText(
  amount: number | null | undefined,
  unit: NoticePeriodUnit | null | undefined,
): string {
  if (amount == null || unit == null) return 'keine'
  const [one, many] = NOTICE_UNIT_WORDS[unit]
  return `${amount} ${amount === 1 ? one : many}`
}

/** One position as it lives in the form: every input a string, as inputs hold them. */
export type PositionForm = {
  /** The stored position, empty for a new one. */
  positionKey: string
  title: string
  productNumber: string
  description: string
  quantity: string
  unitPrice: string
  currency: string
  priceIncludesVat: boolean
  vatCategory: string
  interval: BillingInterval | ''
  /**
   * What the backend worked out for the stored position; dropped as soon as the position is
   * changed, because the mask does not work it out again.
   */
  amount: number | null
}

/** The contract form as it lives in the browser. */
export type ContractForm = {
  title: string
  partnerId: string
  startDate: string
  endDate: string
  noticePeriodAmount: string
  noticePeriodUnit: NoticePeriodUnit | ''
  note: string
  positions: PositionForm[]
}

/** @returns the form of a new contract: nothing chosen yet, no positions */
export function emptyContractForm(): ContractForm {
  return {
    title: '',
    partnerId: '',
    startDate: '',
    endDate: '',
    noticePeriodAmount: '',
    noticePeriodUnit: '',
    note: '',
    positions: [],
  }
}

/**
 * @param currency the currency to start with, empty to let the select pick the tenant default
 * @returns a new position: one per month, normal rate, nothing priced yet
 */
export function emptyPositionForm(currency = ''): PositionForm {
  return {
    positionKey: '',
    title: '',
    productNumber: '',
    description: '',
    quantity: '1',
    unitPrice: '',
    currency,
    priceIncludesVat: false,
    vatCategory: 'STANDARD',
    interval: 'MONTHLY',
    amount: null,
  }
}

/**
 * @param contract the contract as the backend sent it
 * @returns the form filled in with it
 */
export function toContractForm(contract: Contract): ContractForm {
  return {
    title: contract.title,
    partnerId: String(contract.partnerId),
    startDate: contract.startDate,
    endDate: contract.endDate ?? '',
    noticePeriodAmount:
      contract.noticePeriodAmount == null ? '' : String(contract.noticePeriodAmount),
    noticePeriodUnit: contract.noticePeriodUnit ?? '',
    note: contract.note ?? '',
    positions: contract.positions.map(toPositionForm),
  }
}

/**
 * @param position a stored position
 * @returns the position as the form holds it, its amount included
 */
export function toPositionForm(position: ContractPosition): PositionForm {
  return {
    positionKey: position.positionKey,
    title: position.title,
    productNumber: position.productNumber ?? '',
    description: position.description ?? '',
    quantity: String(position.quantity),
    unitPrice: String(position.unitPrice),
    currency: position.currency,
    priceIncludesVat: position.priceIncludesVat,
    vatCategory: position.vatCategory,
    interval: position.interval,
    amount: position.amount,
  }
}

/**
 * Takes a changed position into the list, without the amount it no longer has.
 *
 * @param positions the positions of the form
 * @param index where the changed one stands, or `null` to add it at the end
 * @param position the position as the dialog left it
 * @returns the new list
 */
export function withPosition(
  positions: readonly PositionForm[],
  index: number | null,
  position: PositionForm,
): PositionForm[] {
  const stored = index === null ? undefined : positions[index]
  // Unchanged, the amount the backend sent still holds; changed, nobody knows it yet.
  const unchanged = stored !== undefined && samePosition(stored, position)
  const entry = { ...position, amount: unchanged ? stored.amount : null }
  if (index === null) return [...positions, entry]
  return positions.map((current, at) => (at === index ? entry : current))
}

/**
 * @param positions the positions of the form
 * @param index the one to move
 * @param step -1 to move it up, 1 to move it down
 * @returns the list with the position moved, unchanged at either end
 */
export function movePosition(
  positions: readonly PositionForm[],
  index: number,
  step: -1 | 1,
): PositionForm[] {
  const target = index + step
  if (target < 0 || target >= positions.length) return [...positions]
  const moved = [...positions]
  ;[moved[index], moved[target]] = [moved[target], moved[index]]
  return moved
}

/** Whether two positions agree in everything the user can change. */
function samePosition(left: PositionForm, right: PositionForm): boolean {
  return (
    left.title === right.title &&
    left.productNumber === right.productNumber &&
    left.description === right.description &&
    parseDecimal(left.quantity) === parseDecimal(right.quantity) &&
    parseDecimal(left.unitPrice) === parseDecimal(right.unitPrice) &&
    left.currency === right.currency &&
    left.priceIncludesVat === right.priceIncludesVat &&
    left.vatCategory === right.vatCategory &&
    left.interval === right.interval
  )
}

/**
 * The messages under the fields of the contract head, the same rules the backend keeps.
 *
 * <p>Convenience, not protection: the backend keeps them anyway.
 *
 * @param form the form as filled in
 * @returns message per field, empty when the head can be sent
 */
export function contractComplaints(form: ContractForm): FieldErrors {
  const errors: Record<string, string> = {}
  const title = form.title.trim()
  if (title === '') errors.title = 'Ein Vertrag braucht eine Bezeichnung.'
  else if (title.length > CONTRACT_TITLE_MAX_LENGTH) {
    errors.title = `Höchstens ${CONTRACT_TITLE_MAX_LENGTH} Zeichen.`
  }
  if (form.partnerId === '') errors.partnerId = 'Ein Vertrag braucht einen Kunden.'
  if (form.startDate === '') errors.startDate = 'Ein Vertrag braucht einen Beginn.'
  // ISO dates compare as text, so no Date object and no time zone gets a say.
  else if (form.endDate !== '' && form.endDate < form.startDate) {
    errors.endDate = 'Das Ende liegt vor dem Beginn.'
  }
  Object.assign(errors, noticeComplaints(form))
  if (form.note.trim().length > CONTRACT_NOTE_MAX_LENGTH) {
    errors.note = `Höchstens ${CONTRACT_NOTE_MAX_LENGTH} Zeichen.`
  }
  const positions = positionsComplaint(form.positions)
  if (positions !== null) errors.positions = positions
  return errors
}

function noticeComplaints(form: ContractForm): FieldErrors {
  const amountGiven = form.noticePeriodAmount.trim() !== ''
  if (!amountGiven && form.noticePeriodUnit === '') return {}
  if (!amountGiven) return { noticePeriodAmount: 'Zur Einheit fehlt die Dauer.' }
  const amount = Number(form.noticePeriodAmount.trim())
  if (!Number.isInteger(amount) || amount < 1 || amount > 999) {
    return { noticePeriodAmount: 'Eine ganze Zahl von 1 bis 999.' }
  }
  if (form.noticePeriodUnit === '') return { noticePeriodUnit: 'Zur Dauer fehlt die Einheit.' }
  return {}
}

/** The rules over the list as a whole: how many, and one currency for all. */
function positionsComplaint(positions: readonly PositionForm[]): string | null {
  if (positions.length > CONTRACT_MAX_POSITIONS) {
    return `Ein Vertrag hat höchstens ${CONTRACT_MAX_POSITIONS} Positionen.`
  }
  const currencies = new Set(positions.map((position) => position.currency))
  if (currencies.size > 1) {
    return 'Alle Positionen eines Vertrags lauten auf dieselbe Währung.'
  }
  return null
}

/**
 * The messages under the fields of one position, the same rules the backend keeps.
 *
 * @param position the position as filled in
 * @returns message per field, empty when the position can be taken
 */
export function positionComplaints(position: PositionForm): FieldErrors {
  const errors: Record<string, string> = {}
  const title = position.title.trim()
  if (title === '') errors.title = 'Eine Position braucht eine Bezeichnung.'
  else if (title.length > POSITION_TITLE_MAX_LENGTH) {
    errors.title = `Höchstens ${POSITION_TITLE_MAX_LENGTH} Zeichen.`
  }
  if (position.productNumber.trim().length > POSITION_PRODUCT_NUMBER_MAX_LENGTH) {
    errors.productNumber = `Höchstens ${POSITION_PRODUCT_NUMBER_MAX_LENGTH} Zeichen.`
  }
  if (position.description.trim().length > POSITION_DESCRIPTION_MAX_LENGTH) {
    errors.description = `Höchstens ${POSITION_DESCRIPTION_MAX_LENGTH} Zeichen.`
  }
  const quantity = decimalComplaint(position.quantity, 'Die Menge')
  if (quantity !== null) errors.quantity = quantity
  else if ((parseDecimal(position.quantity) ?? 0) <= 0) {
    errors.quantity = 'Die Menge muss grösser als null sein.'
  }
  const price = decimalComplaint(position.unitPrice, 'Der Einzelpreis')
  if (price !== null) errors.unitPrice = price
  else if ((parseDecimal(position.unitPrice) ?? 0) < 0) {
    errors.unitPrice = 'Ein Rabatt wird als tieferer Preis vereinbart, nicht negativ.'
  }
  if (!/^[A-Z]{3}$/.test(position.currency)) errors.currency = 'Eine Währung wählen.'
  if (position.vatCategory === '') errors.vatCategory = 'Eine MwSt-Kategorie wählen.'
  if (position.interval === '') errors.interval = 'Ein Intervall wählen.'
  return errors
}

/** Whether a typed number can be read and fits four decimals. */
function decimalComplaint(input: string, label: string): string | null {
  const value = parseDecimal(input)
  if (value === null) return `${label} fehlt oder ist keine Zahl.`
  const decimals = input.trim().replace(/[’']/g, '').replace(',', '.').split('.')[1] ?? ''
  if (decimals.replace(/0+$/, '').length > MAX_DECIMALS) {
    return `${label} hat höchstens ${MAX_DECIMALS} Nachkommastellen.`
  }
  return null
}

/**
 * What the form sends.
 *
 * @param form the form as filled in, already free of complaints
 * @returns the request body, empty fields as `null`
 */
export function toContractRequest(form: ContractForm): ContractRequest {
  const note = form.note.trim()
  const amount = form.noticePeriodAmount.trim()
  return {
    title: form.title.trim(),
    partnerId: Number(form.partnerId),
    startDate: form.startDate,
    endDate: form.endDate === '' ? null : form.endDate,
    noticePeriodAmount: amount === '' ? null : Number(amount),
    noticePeriodUnit: form.noticePeriodUnit === '' ? null : form.noticePeriodUnit,
    note: note === '' ? null : note,
    positions: form.positions.map(toPositionRequest),
  }
}

function toPositionRequest(position: PositionForm): ContractPositionRequest {
  const productNumber = position.productNumber.trim()
  const description = position.description.trim()
  return {
    positionKey: position.positionKey === '' ? null : position.positionKey,
    title: position.title.trim(),
    productNumber: productNumber === '' ? null : productNumber,
    description: description === '' ? null : description,
    quantity: parseDecimal(position.quantity) ?? 0,
    unitPrice: parseDecimal(position.unitPrice) ?? 0,
    currency: position.currency,
    priceIncludesVat: position.priceIncludesVat,
    vatCategory: position.vatCategory,
    // Already free of complaints, so the interval is one of the three.
    interval: position.interval === '' ? 'MONTHLY' : position.interval,
  }
}
