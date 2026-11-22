import { api } from './api'
import { formatAmount, formatDate } from './format'
import type {
  SubscriptionAcknowledgementBody,
  SubscriptionAcknowledgementReason,
  SubscriptionBilledChangeNotice,
  SubscriptionContractPlan,
  SubscriptionCurrencyTotal,
  SubscriptionMissingRunMonths,
  SubscriptionPlannedLine,
  SubscriptionPreview,
  SubscriptionRunResult,
  SubscriptionSkipReason,
} from './types'

/**
 * The subscription run: its addresses, its rights and the words of its screen.
 *
 * <p>Its own building block, like `contract.ts`: the screen and the sidebar read the same
 * addresses (backend ADR-0136, ADR-0147).
 */

/** Name of the backend `LicensedModule` value. */
export const SUBSCRIPTION_MODULE = 'SUBSCRIPTION'

/** Path of the run within the application. */
export const SUBSCRIPTION_PATH = '/abo-lauf'

/**
 * The two rights of the run: the preview reads, the run writes drafts (backend ADR-0143).
 */
export const SUBSCRIPTION_RIGHTS = {
  read: 'SUBSCRIPTION_READ',
  run: 'SUBSCRIPTION_RUN',
} as const

/**
 * What each reason is called in a list, short. The sentence from the backend says the rest,
 * with the days.
 */
export const SKIP_REASON_LABELS: Record<SubscriptionSkipReason, string> = {
  CONTRACT_DRAFT: 'Vertrag im Entwurf',
  CONTRACT_ENDED: 'Vertrag beendet',
  PARTIAL_PERIOD: 'Teilperiode',
  ALREADY_BILLED: 'Bereits verrechnet',
  OVERLAPS_BILLED: 'Überschneidet Verrechnetes',
  TAX_LIABILITY_STARTS: 'MWST-Pflicht beginnt',
  NO_VAT_RATE: 'Kein MwSt-Satz',
  SPLIT_NOT_POSSIBLE: 'Teilung nicht möglich',
}

/**
 * @param line a position due for one period
 * @returns true when a rate change cuts it into several lines of the draft (backend ADR-0150)
 */
export function isSplitLine(line: SubscriptionPlannedLine): boolean {
  return line.parts.length > 1
}

/**
 * @param plan one contract of the preview
 * @returns how many lines its draft carries: a split period counts once per rate
 */
export function draftLineCount(plan: SubscriptionContractPlan): number {
  return plan.lines.reduce((count, line) => count + line.parts.length, 0)
}

/**
 * @param tenantId the tenant
 * @returns address of the run, and below it of the preview
 */
export function subscriptionRunsUrl(tenantId: number): string {
  return `/api/tenants/${tenantId}/subscription-runs`
}

/**
 * @param tenantId the tenant
 * @returns cache key of every preview of the tenant, so a run refreshes them all
 */
export function subscriptionPreviewKey(tenantId: number): readonly unknown[] {
  return ['subscription-preview', tenantId]
}

/**
 * Asks what a run for a month would do. Writes nothing.
 *
 * @param tenantId the tenant
 * @param month the billing month, `yyyy-MM`
 * @returns the preview
 */
export function fetchSubscriptionPreview(
  tenantId: number,
  month: string,
): Promise<SubscriptionPreview> {
  return api.get<SubscriptionPreview>(
    `${subscriptionRunsUrl(tenantId)}/preview?month=${encodeURIComponent(month)}`,
  )
}

/**
 * @param tenantId the tenant
 * @returns cache key of the months without a run, so a run refreshes them
 */
export function subscriptionMissingMonthsKey(tenantId: number): readonly unknown[] {
  return ['subscription-missing-months', tenantId]
}

/**
 * Asks which billing months since the first run no run covers. Writes nothing.
 *
 * @param tenantId the tenant
 * @returns the months, `yyyy-MM`, oldest first
 */
export function fetchMissingRunMonths(tenantId: number): Promise<SubscriptionMissingRunMonths> {
  return api.get<SubscriptionMissingRunMonths>(`${subscriptionRunsUrl(tenantId)}/missing-months`)
}

/**
 * @param month a month, `yyyy-MM`
 * @returns the hint for a month without a run, «Für Oktober 2026 lief noch kein Abo-Lauf.»
 */
export function missingRunText(month: string): string {
  return `Für ${monthLabel(month)} lief noch kein Abo-Lauf.`
}

/**
 * Writes one invoice draft per contract with a period starting in the month.
 *
 * <p>The server works out again what is due; nothing from the preview goes along but the month.
 *
 * @param tenantId the tenant
 * @param month the billing month, `yyyy-MM`
 * @returns the three lists and the notices
 */
export function runSubscription(tenantId: number, month: string): Promise<SubscriptionRunResult> {
  return api.post<SubscriptionRunResult>(subscriptionRunsUrl(tenantId), { month })
}

/**
 * @param today the day to start from
 * @returns its month as `yyyy-MM`, the month the screen opens with
 */
export function currentMonth(today: Date = new Date()): string {
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
}

/**
 * @param value what the month field holds
 * @returns true for a complete `yyyy-MM` with a month from 1 to 12
 */
export function isCompleteMonth(value: string): boolean {
  const match = /^(\d{4})-(\d{2})$/.exec(value)
  if (match === null) return false
  const month = Number(match[2])
  return month >= 1 && month <= 12
}

/** The months as the screen writes them. */
const MONTH_NAMES = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
]

/**
 * @param value a month as `yyyy-MM`
 * @returns «Januar 2028», or the value itself when it is no complete month
 */
export function monthLabel(value: string): string {
  if (!isCompleteMonth(value)) return value
  const [year, month] = value.split('-')
  return `${MONTH_NAMES[Number(month) - 1]} ${year}`
}

/**
 * The sums of a preview in one line, one per currency.
 *
 * @param totals the sums per currency
 * @returns «1'330.00 CHF · 80.00 EUR», or «–» when nothing is due
 */
export function totalsText(totals: SubscriptionCurrencyTotal[]): string {
  if (totals.length === 0) return '–'
  return totals.map((total) => `${formatAmount(total.amount)} ${total.currency}`).join(' · ')
}

/**
 * @param count how many drafts
 * @returns «1 Rechnungsentwurf» or «3 Rechnungsentwürfe»
 */
export function draftCountText(count: number): string {
  return count === 1 ? '1 Rechnungsentwurf' : `${count} Rechnungsentwürfe`
}

/**
 * What a run did, in one sentence for the head of the result.
 *
 * @param result the answer of the run
 * @returns for example «2 Rechnungsentwürfe erstellt, 1 Periode übersprungen, 1 Vertrag fehlgeschlagen.»
 */
export function runResultText(result: SubscriptionRunResult): string {
  const parts = [`${draftCountText(result.created.length)} erstellt`]
  if (result.skipped.length > 0) {
    parts.push(
      result.skipped.length === 1
        ? '1 Periode übersprungen'
        : `${result.skipped.length} Perioden übersprungen`,
    )
  }
  if (result.failed.length > 0) {
    parts.push(
      result.failed.length === 1
        ? '1 Vertrag fehlgeschlagen'
        : `${result.failed.length} Verträge fehlgeschlagen`,
    )
  }
  return `${parts.join(', ')}.`
}

/** What each acknowledgement reason is called on a button and in a list. */
export const BILLED_CHANGE_REASON_LABELS: Record<SubscriptionAcknowledgementReason, string> = {
  CORRECTION_ISSUED: 'Korrektur ausgestellt',
  NO_CORRECTION_NEEDED: 'Keine Korrektur nötig',
  OTHER: 'Anderes',
}

/** The longest note an acknowledgement takes, as the backend counts it. */
export const BILLED_CHANGE_NOTE_MAX_LENGTH = 200

/**
 * @param tenantId the tenant
 * @returns address of the open notices, and below it of the acknowledgements
 */
export function billedChangeNoticesUrl(tenantId: number): string {
  return `/api/tenants/${tenantId}/subscription-notices`
}

/**
 * @param tenantId the tenant
 * @returns cache key prefix of the notices of the tenant; a run and an acknowledgement refresh
 *   every list under it
 */
export function billedChangeNoticesKey(tenantId: number): readonly unknown[] {
  return ['subscription-notices', tenantId]
}

/**
 * @param tenantId the tenant
 * @returns cache key of the number of open notices, for the counter at the menu entry
 */
export function billedChangeNoticeCountKey(tenantId: number): readonly unknown[] {
  return ['subscription-notice-count', tenantId]
}

/**
 * Asks for the open notices of the tenant, or of one contract. Writes nothing.
 *
 * @param tenantId the tenant
 * @param contractId the contract, `undefined` for all of the tenant
 * @returns the open notices, oldest first
 */
export function fetchOpenBilledChangeNotices(
  tenantId: number,
  contractId?: number,
): Promise<SubscriptionBilledChangeNotice[]> {
  const query = contractId === undefined ? '' : `?contractId=${contractId}`
  return api.get<SubscriptionBilledChangeNotice[]>(`${billedChangeNoticesUrl(tenantId)}${query}`)
}

/**
 * Asks how many notices are open. Writes nothing.
 *
 * @param tenantId the tenant
 * @returns the number of open notices
 */
export function fetchOpenBilledChangeNoticeCount(tenantId: number): Promise<{ open: number }> {
  return api.get<{ open: number }>(`${billedChangeNoticesUrl(tenantId)}/open-count`)
}

/**
 * Acknowledges one open notice. The server takes the user and the moment.
 *
 * @param tenantId the tenant
 * @param noticeId the notice
 * @param body the reason and the optional note
 */
export function acknowledgeBilledChangeNotice(
  tenantId: number,
  noticeId: number,
  body: SubscriptionAcknowledgementBody,
): Promise<void> {
  return api.post<void>(`${billedChangeNoticesUrl(tenantId)}/${noticeId}/acknowledgement`, body)
}

/**
 * @param notice an open notice
 * @returns the sentence that says what changed and which period it reaches into, for example
 *   «Version 2 gilt ab 15.01.2028 und betrifft die verrechnete Periode 01.01.2028 – 31.01.2028
 *   (Hosting, Version 1).»
 */
export function billedChangeNoticeText(notice: SubscriptionBilledChangeNotice): string {
  return (
    `Version ${notice.versionNo} gilt ab ${formatDate(notice.validFrom)} und betrifft die ` +
    `verrechnete Periode ${formatDate(notice.periodStart)} – ${formatDate(notice.periodEnd)} ` +
    `(${notice.positionTitle}, Version ${notice.billedVersionNo}).`
  )
}
