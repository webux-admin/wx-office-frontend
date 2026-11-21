import type { BadgeTone } from '../components/Badge'
import type { FieldErrors } from './fieldErrors'
import { formatQuantity, parseDecimal } from './format'
import { listQuery } from './paging'
import type {
  BillingInterval,
  Contract,
  ContractEndReason,
  ContractPosition,
  ContractPositionRequest,
  ContractRequest,
  ContractSlaValue,
  ContractSlaValueRequest,
  ContractStatus,
  NoticePeriodUnit,
  SlaMetric,
  SlaUnit,
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

/** What each status is called on screen, in the order a contract runs through them. */
export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  DRAFT: 'Entwurf',
  ACTIVE: 'Aktiv',
  ENDED: 'Beendet',
}

/** How loudly each status shows in the list and in the mask. */
export const CONTRACT_STATUS_TONES: Record<ContractStatus, BadgeTone> = {
  DRAFT: 'muted',
  ACTIVE: 'success',
  ENDED: 'neutral',
}

/**
 * The catalogue of reasons a contract ends, in the order of the select. The same five codes as
 * `ContractEndReason` of the backend; no free text (backend ADR-0145).
 */
export const CONTRACT_END_REASON_LABELS: Record<ContractEndReason, string> = {
  TERMINATED_BY_CUSTOMER: 'Kündigung durch den Kunden',
  TERMINATED_BY_TENANT: 'Kündigung durch uns',
  MUTUAL_AGREEMENT: 'Aufhebung im gegenseitigen Einvernehmen',
  TERM_EXPIRED: 'Laufzeit abgelaufen',
  REPLACED: 'Durch einen neuen Vertrag ersetzt',
}

/**
 * @param value what a select holds
 * @returns true for one of the five reason codes
 */
export function isContractEndReason(value: string): value is ContractEndReason {
  return Object.hasOwn(CONTRACT_END_REASON_LABELS, value)
}

/**
 * Whether what was agreed may still be changed. An ended contract takes no new version; only
 * its note stays open.
 *
 * @param status where the contract stands
 * @returns false for an ended contract
 */
export function isAgreementEditable(status: ContractStatus): boolean {
  return status !== 'ENDED'
}

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

/**
 * The catalogue of service level metrics, in the order of the select. The same six codes as
 * `SlaMetric` of the backend; no free text (backend ADR-0146).
 */
export const SLA_METRIC_LABELS: Record<SlaMetric, string> = {
  AVAILABILITY: 'Verfügbarkeit',
  RESPONSE_TIME: 'Reaktionszeit',
  RESOLUTION_TIME: 'Lösungszeit',
  SERVICE_HOURS: 'Servicezeit',
  RECOVERY_POINT_OBJECTIVE: 'Maximaler Datenverlust (RPO)',
  RECOVERY_TIME_OBJECTIVE: 'Wiederherstellungszeit (RTO)',
}

/** The units each metric allows, the first one proposed; the same lists as the backend. */
export const SLA_METRIC_UNITS: Record<SlaMetric, readonly SlaUnit[]> = {
  AVAILABILITY: ['PERCENT'],
  RESPONSE_TIME: ['HOURS', 'MINUTES', 'DAYS', 'BUSINESS_DAYS'],
  RESOLUTION_TIME: ['HOURS', 'MINUTES', 'DAYS', 'BUSINESS_DAYS'],
  SERVICE_HOURS: ['HOURS_PER_WEEK'],
  RECOVERY_POINT_OBJECTIVE: ['HOURS', 'MINUTES', 'DAYS'],
  RECOVERY_TIME_OBJECTIVE: ['HOURS', 'MINUTES', 'DAYS'],
}

/** What each unit is called in a select. */
export const SLA_UNIT_LABELS: Record<SlaUnit, string> = {
  PERCENT: 'Prozent',
  MINUTES: 'Minuten',
  HOURS: 'Stunden',
  DAYS: 'Tage',
  BUSINESS_DAYS: 'Arbeitstage',
  HOURS_PER_WEEK: 'Stunden pro Woche',
}

/** What a target is followed by in a text, for one and for many. */
const SLA_UNIT_WORDS: Record<SlaUnit, [string, string]> = {
  PERCENT: ['%', '%'],
  MINUTES: ['Minute', 'Minuten'],
  HOURS: ['Stunde', 'Stunden'],
  DAYS: ['Tag', 'Tage'],
  BUSINESS_DAYS: ['Arbeitstag', 'Arbeitstage'],
  HOURS_PER_WEEK: ['Stunde pro Woche', 'Stunden pro Woche'],
}

/**
 * The range a target may take in each unit, both bounds included; the same as the backend. A
 * duration is at most one year, and zero is a real target: no data lost at all.
 */
export const SLA_UNIT_RANGES: Record<SlaUnit, { min: number; max: number }> = {
  PERCENT: { min: 0, max: 100 },
  MINUTES: { min: 0, max: 525600 },
  HOURS: { min: 0, max: 8760 },
  DAYS: { min: 0, max: 365 },
  BUSINESS_DAYS: { min: 0, max: 260 },
  HOURS_PER_WEEK: { min: 1, max: 168 },
}

/** Decimals a service level target may carry. */
const SLA_MAX_DECIMALS = 3

/** Longest text of a service level value the backend takes. */
export const SLA_DESCRIPTION_MAX_LENGTH = 1000

/** Most service level values one contract takes. */
export const CONTRACT_MAX_SLA_VALUES = 50

/**
 * @param value what a select holds
 * @returns true for one of the six metric codes
 */
export function isSlaMetric(value: string): value is SlaMetric {
  return Object.hasOwn(SLA_METRIC_LABELS, value)
}

/**
 * @param value what a select holds
 * @returns true for one of the six unit codes
 */
export function isSlaUnit(value: string): value is SlaUnit {
  return Object.hasOwn(SLA_UNIT_LABELS, value)
}

/**
 * One service level value as text, the only way it is shown: no traffic light, because the
 * application measures nothing (backend ADR-0136, decision 6).
 *
 * @param value the value as stored
 * @returns «Verfügbarkeit 99.5 %» or «Reaktionszeit 4 Stunden (Priorität 1)»
 */
export function slaValueText(value: ContractSlaValue): string {
  const [one, many] = SLA_UNIT_WORDS[value.unit]
  const target = `${formatQuantity(value.targetValue)} ${value.targetValue === 1 ? one : many}`
  const text = `${SLA_METRIC_LABELS[value.metric]} ${target}`
  return value.description ? `${text} (${value.description})` : text
}

/**
 * The service level values of a contract in one line, for the list.
 *
 * @param values the values as stored
 * @param shown how many are written out before the rest is counted
 * @returns «Verfügbarkeit 99.5 % · Reaktionszeit 4 Stunden · 2 weitere», or an empty string
 */
export function slaValuesLine(values: readonly ContractSlaValue[], shown = 2): string {
  const texts = values.slice(0, shown).map((value) =>
    slaValueText({ ...value, description: null }),
  )
  const rest = values.length - shown
  return rest > 0 ? [...texts, `${rest} weitere`].join(' · ') : texts.join(' · ')
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
 * @param tenantId the tenant
 * @param contractId the contract
 * @param step `activate` for a draft, `end` for an active contract
 * @returns address of the step
 */
export function contractStepUrl(
  tenantId: number,
  contractId: number,
  step: 'activate' | 'end',
): string {
  return `${contractUrl(tenantId, contractId)}/${step}`
}

/**
 * @param tenantId the tenant
 * @param contractId the contract
 * @returns address of its versions, newest first
 */
export function contractVersionsUrl(tenantId: number, contractId: number): string {
  return `${contractUrl(tenantId, contractId)}/versions`
}

/**
 * @param tenantId the tenant
 * @param contractId the contract
 * @returns address of its status steps, oldest first
 */
export function contractStatusChangesUrl(tenantId: number, contractId: number): string {
  return `${contractUrl(tenantId, contractId)}/status-changes`
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

/** One service level value as it lives in the form: the target as typed. */
export type SlaValueForm = {
  metric: SlaMetric | ''
  targetValue: string
  unit: SlaUnit | ''
  description: string
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
  slaValues: SlaValueForm[]
  /**
   * The day a change to what an active contract agreed holds from; asked for only then, and
   * empty until the user names it.
   */
  validFrom: string
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
    slaValues: [],
    validFrom: '',
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
    slaValues: contract.slaValues.map(toSlaValueForm),
    validFrom: '',
  }
}

/**
 * Whether the form changes what the contract agreed: everything but the note, the service
 * level values included. The same line the backend draws when it decides whether a change
 * takes a new version; a target is compared by value, so 99.5 and 99.50 agree.
 *
 * @param stored the form as the contract was loaded
 * @param form the form as it is now
 * @returns true when saving an active contract takes a new version
 */
export function agreementChanged(stored: ContractForm, form: ContractForm): boolean {
  const agreed = (value: ContractForm) =>
    JSON.stringify({
      ...value,
      note: '',
      validFrom: '',
      positions: value.positions.map(agreedPart),
      slaValues: value.slaValues.map((entry) => ({
        ...entry,
        targetValue: parseDecimal(entry.targetValue),
        description: entry.description.trim(),
      })),
    })
  return agreed(stored) !== agreed(form)
}

/** A position without what the backend worked out for it, so only what was typed counts. */
function agreedPart(position: PositionForm): PositionForm {
  return { ...position, amount: null }
}

/**
 * The message under «Gültig ab» when an active contract takes a new version.
 *
 * <p>The backend also checks that the day is not before the version it follows.
 *
 * @param form the form as filled in
 * @returns the message, or `null` when the day fits the term
 */
export function validFromComplaint(form: ContractForm): string | null {
  if (form.validFrom === '') return 'Ab welchem Tag gilt die Änderung?'
  if (form.startDate !== '' && form.validFrom < form.startDate) {
    return 'Die Änderung kann nicht vor dem Vertragsbeginn gelten.'
  }
  if (form.endDate !== '' && form.validFrom > form.endDate) {
    return 'Die Änderung kann nicht nach dem Vertragsende gelten.'
  }
  return null
}

/** The end dialog as it lives in the browser. */
export type EndingForm = {
  endedOn: string
  reason: ContractEndReason | ''
}

/**
 * @param contract the contract to end
 * @returns the end dialog, the agreed end proposed as the last day when there is one
 */
export function emptyEndingForm(contract: Contract): EndingForm {
  return { endedOn: contract.endDate ?? '', reason: '' }
}

/**
 * The messages in the end dialog, the same rules the backend keeps.
 *
 * @param contract the contract to end
 * @param form the dialog as filled in
 * @returns message per field, empty when the contract can be ended
 */
export function endingComplaints(contract: Contract, form: EndingForm): FieldErrors {
  const errors: Record<string, string> = {}
  if (form.reason === '') errors.reason = 'Einen Grund aus der Liste wählen.'
  if (form.endedOn === '') {
    errors.endedOn = 'Der letzte Tag, an dem der Vertrag läuft.'
    return errors
  }
  if (form.endedOn < contract.startDate) {
    errors.endedOn = 'Der Vertrag kann nicht vor seinem Beginn enden.'
  } else if (contract.endDate && form.endedOn > contract.endDate) {
    errors.endedOn = 'Später als das vereinbarte Ende kann der Vertrag nicht enden.'
  } else if (form.reason === 'TERM_EXPIRED' && form.endedOn !== contract.endDate) {
    errors.endedOn = contract.endDate
      ? 'Läuft die Laufzeit ab, endet der Vertrag am vereinbarten Ende.'
      : 'Ein unbefristeter Vertrag läuft nicht ab. Einen anderen Grund wählen.'
  }
  return errors
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
 * @param positions the positions of the form, or its service level values
 * @param index the one to move
 * @param step -1 to move it up, 1 to move it down
 * @returns the list with the entry moved, unchanged at either end
 */
export function movePosition<T>(positions: readonly T[], index: number, step: -1 | 1): T[] {
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
  if (form.slaValues.length > CONTRACT_MAX_SLA_VALUES) {
    errors.slaValues = `Ein Vertrag hat höchstens ${CONTRACT_MAX_SLA_VALUES} Service-Level-Werte.`
  }
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

/** Whether a typed number can be read and fits the decimals given. */
function decimalComplaint(input: string, label: string, maxDecimals = MAX_DECIMALS): string | null {
  const value = parseDecimal(input)
  if (value === null) return `${label} fehlt oder ist keine Zahl.`
  const decimals = input.trim().replace(/[’']/g, '').replace(',', '.').split('.')[1] ?? ''
  if (decimals.replace(/0+$/, '').length > maxDecimals) {
    return `${label} hat höchstens ${maxDecimals} Nachkommastellen.`
  }
  return null
}

/** @returns a new service level value: availability in percent, no target yet */
export function emptySlaValueForm(): SlaValueForm {
  return { metric: 'AVAILABILITY', targetValue: '', unit: 'PERCENT', description: '' }
}

/**
 * @param value a stored service level value
 * @returns the value as the form holds it
 */
export function toSlaValueForm(value: ContractSlaValue): SlaValueForm {
  return {
    metric: value.metric,
    targetValue: String(value.targetValue),
    unit: value.unit,
    description: value.description ?? '',
  }
}

/**
 * A metric chosen anew keeps its unit when it allows it, and takes its first one otherwise.
 *
 * @param form the value as filled in
 * @param metric the metric chosen
 * @returns the value with the metric and a unit that fits it
 */
export function withSlaMetric(form: SlaValueForm, metric: SlaMetric): SlaValueForm {
  const units = SLA_METRIC_UNITS[metric]
  const unit = form.unit !== '' && units.includes(form.unit) ? form.unit : units[0]
  return { ...form, metric, unit }
}

/**
 * Takes a service level value into the list.
 *
 * @param values the values of the form
 * @param index where the changed one stands, or `null` to add it at the end
 * @param value the value as the dialog left it
 * @returns the new list
 */
export function withSlaValue(
  values: readonly SlaValueForm[],
  index: number | null,
  value: SlaValueForm,
): SlaValueForm[] {
  if (index === null) return [...values, value]
  return values.map((current, at) => (at === index ? value : current))
}

/**
 * The messages under the fields of one service level value, the same rules the backend keeps.
 *
 * @param form the value as filled in
 * @returns message per field, empty when the value can be taken
 */
export function slaValueComplaints(form: SlaValueForm): FieldErrors {
  const errors: Record<string, string> = {}
  if (form.metric === '') errors.metric = 'Eine Kennzahl wählen.'
  if (form.unit === '') errors.unit = 'Eine Einheit wählen.'
  else if (form.metric !== '' && !SLA_METRIC_UNITS[form.metric].includes(form.unit)) {
    errors.unit = `${SLA_METRIC_LABELS[form.metric]} wird nicht in ${SLA_UNIT_LABELS[form.unit]} angegeben.`
  }
  const target = decimalComplaint(form.targetValue, 'Der Zielwert', SLA_MAX_DECIMALS)
  if (target !== null) errors.targetValue = target
  else if (form.unit !== '') {
    const value = parseDecimal(form.targetValue) ?? 0
    const { min, max } = SLA_UNIT_RANGES[form.unit]
    if (value < 0) errors.targetValue = 'Der Zielwert darf nicht negativ sein.'
    else if (value < min || value > max) {
      errors.targetValue = `In ${SLA_UNIT_LABELS[form.unit]} liegt ein Zielwert zwischen ${formatQuantity(min)} und ${formatQuantity(max)}.`
    }
  }
  if (form.description.trim().length > SLA_DESCRIPTION_MAX_LENGTH) {
    errors.description = `Höchstens ${SLA_DESCRIPTION_MAX_LENGTH} Zeichen.`
  }
  return errors
}

/**
 * What the form sends.
 *
 * @param form the form as filled in, already free of complaints
 * @param lockVersion on a change, the state of the contract it was made to; `null` on creating
 * @returns the request body, empty fields as `null`
 */
export function toContractRequest(
  form: ContractForm,
  lockVersion: number | null = null,
): ContractRequest {
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
    slaValues: form.slaValues.map(toSlaValueRequest),
    lockVersion,
    validFrom: form.validFrom === '' ? null : form.validFrom,
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

function toSlaValueRequest(value: SlaValueForm): ContractSlaValueRequest {
  const description = value.description.trim()
  return {
    // Already free of complaints, so metric and unit are codes of the catalogue.
    metric: value.metric === '' ? 'AVAILABILITY' : value.metric,
    targetValue: parseDecimal(value.targetValue) ?? 0,
    unit: value.unit === '' ? 'PERCENT' : value.unit,
    description: description === '' ? null : description,
  }
}
