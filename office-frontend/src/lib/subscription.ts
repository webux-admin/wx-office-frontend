import { api } from './api'
import { formatAmount } from './format'
import type {
  SubscriptionContractPlan,
  SubscriptionCurrencyTotal,
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
