import { formatAmount, isCompleteIsoDate, parseDecimal, toIsoDate } from '../../lib/format'
import type { WriteOffRunBody } from '../../lib/openItem'
import type { WriteOffCandidate, WriteOffReason, WriteOffRunResult } from '../../lib/types'

/**
 * The collective write-off as a piece of state: the settings, the payload and the sentences.
 *
 * <p><b>Nothing here is a second rule.</b> Which items are inside the tolerance, what the
 * remainder is and what a run actually booked are answers of the backend, which works the
 * proposal out again at booking time. What this file checks is the same rule in the same
 * words, so a button is refused before the request rather than after it.
 *
 * <p>The ticking itself lives in `DataTable`, not here: a selection every mask built for
 * itself would define the same twenty lines twice (ADR-0030).
 */

/** Which form the tolerance is named in. Never both — the backend refuses that. */
export type ToleranceKind = 'AMOUNT' | 'PERCENT'

/** What the settings panel of the run edits. */
export type RunSettings = {
  toleranceKind: ToleranceKind
  /** As typed, so a half entered figure stays on screen. */
  amount: string
  percent: string
  currency: string
  bookingDate: string
  reason: WriteOffReason
  minimumAgeDays: string
  partnerId?: number
}

/** Days past the due date an item has to be, unless somebody says otherwise. */
export const DEFAULT_MINIMUM_AGE_DAYS = 30

/**
 * What a run starts as: twenty rappen, booked today, as a Kleindifferenz.
 *
 * @param currency the bookkeeping currency of the tenant
 * @param today    the day to book on
 */
export function defaultSettings(currency: string, today = toIsoDate()): RunSettings {
  return {
    toleranceKind: 'AMOUNT',
    amount: '0.20',
    percent: '1',
    currency,
    bookingDate: today,
    reason: 'KLEINDIFFERENZ',
    minimumAgeDays: String(DEFAULT_MINIMUM_AGE_DAYS),
  }
}

/**
 * The settings that decide what the proposal contains.
 *
 * <p>A change to one of them puts a different proposal on the screen, so what was ticked
 * before means something else afterwards. The page compares this string and asks before
 * throwing the selection away — the same way the price entry guards its typed prices.
 *
 * @param settings the settings panel
 * @returns a value that changes exactly when the proposal would
 */
export function proposalSignature(settings: RunSettings): string {
  const tolerance =
    settings.toleranceKind === 'AMOUNT' ? `A${settings.amount}` : `P${settings.percent}`
  return [
    tolerance,
    settings.currency,
    settings.bookingDate,
    settings.reason,
    settings.minimumAgeDays,
    settings.partnerId ?? '',
  ].join('|')
}

/**
 * Checks the tolerance before a proposal is asked for.
 *
 * @param settings the settings panel
 * @param today    the day the mask runs on
 * @returns the German complaint, or `null` when nothing is obviously wrong
 */
export function toleranceComplaint(settings: RunSettings, today = toIsoDate()): string | null {
  if (settings.toleranceKind === 'AMOUNT') {
    const amount = parseDecimal(settings.amount)
    if (amount === null) return 'Die Toleranz ist keine Zahl, zum Beispiel 0.20.'
    if (amount <= 0) return 'Eine Toleranz von 0.00 schlägt nichts vor.'
  } else {
    const percent = parseDecimal(settings.percent)
    if (percent === null) return 'Die Toleranz ist keine Zahl, zum Beispiel 1.'
    if (percent <= 0) return 'Eine Toleranz von 0 % schlägt nichts vor.'
    if (percent > 100) return 'Eine Toleranz liegt zwischen 0 und 100 Prozent.'
  }
  if (settings.currency.trim() === '') {
    return 'Ein Lauf läuft in genau einer Währung; wählen Sie eine.'
  }
  if (!isCompleteIsoDate(settings.bookingDate)) return 'Das Buchungsdatum fehlt.'
  if (settings.bookingDate > today) {
    return 'Das Buchungsdatum darf nicht in der Zukunft liegen.'
  }
  const age = parseDecimal(settings.minimumAgeDays)
  if (age === null || age < 0 || !Number.isInteger(age)) {
    return 'Das Mindestalter sind ganze Tage, zum Beispiel 30.'
  }
  return null
}

/**
 * What the proposal and the booking send.
 *
 * <p><b>Either an amount or a percentage, never both</b> — the invariant the backend holds,
 * mirrored here so the request cannot even carry the contradiction.
 *
 * @param settings    the settings panel
 * @param documentIds the ticked items; empty asks for the whole proposal
 * @returns the payload
 */
export function runPayload(settings: RunSettings, documentIds: number[] = []): WriteOffRunBody {
  const amount = parseDecimal(settings.amount)
  const percent = parseDecimal(settings.percent)
  const age = parseDecimal(settings.minimumAgeDays)
  return {
    toleranceAmount:
      settings.toleranceKind === 'AMOUNT' && amount !== null ? amount : undefined,
    tolerancePercent:
      settings.toleranceKind === 'PERCENT' && percent !== null ? percent : undefined,
    currency: settings.currency,
    bookingDate: settings.bookingDate,
    reason: settings.reason,
    minimumAgeDays: age === null ? undefined : age,
    partnerId: settings.partnerId,
    documentIds: documentIds.length === 0 ? undefined : documentIds,
  }
}

/**
 * What the ticked items come to altogether.
 *
 * @param candidates the proposal on screen
 * @param selected   the ticked ids
 * @returns the sum of what would be given up
 */
export function selectionTotal(
  candidates: WriteOffCandidate[],
  selected: ReadonlySet<string | number>,
): number {
  return candidates
    .filter((candidate) => selected.has(candidate.documentId))
    .reduce((sum, candidate) => sum + candidate.writeOffAmount, 0)
}

/**
 * What the counter next to the button says.
 *
 * @param count how many items are ticked
 * @returns for example «3 Posten markiert», empty while nothing is ticked
 */
export function selectionCountText(count: number): string {
  if (count === 0) return ''
  return count === 1 ? '1 Posten markiert' : `${count} Posten markiert`
}

/**
 * What the screen reports after a run.
 *
 * <p><b>Names the partial success.</b> A run of three hundred items is almost never wholly one
 * thing, and «gebucht» alone would hide the two that were passed over.
 *
 * @param result   what the run answered
 * @param currency the currency of the run
 * @returns the sentence to show
 */
export function runResultText(result: WriteOffRunResult, currency: string): string {
  const parts: string[] = []
  if (result.postedCount > 0) {
    parts.push(
      result.postedCount === 1
        ? `1 Posten ausgebucht, ${formatAmount(result.postedTotal)} ${currency}`
        : `${result.postedCount} Posten ausgebucht, ${formatAmount(result.postedTotal)} ${currency}`,
    )
  }
  if (result.skipped.length > 0) {
    parts.push(`${result.skipped.length} übersprungen`)
  }
  if (result.failed.length > 0) {
    parts.push(`${result.failed.length} fehlgeschlagen`)
  }
  return parts.length === 0 ? 'Nichts ausgebucht.' : `${parts.join(', ')}.`
}
