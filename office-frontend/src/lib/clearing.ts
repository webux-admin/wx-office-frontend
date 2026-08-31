import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import { queryStringOf } from './banking'
import type {
  AssignedPayment,
  AssignmentBody,
  Confidence,
  DunningConflict,
  MatchRunProposal,
  MatchRunResult,
  WorklistCount,
  WorklistRow,
} from './types'

/**
 * The clearing basket: where its screen lives, what rights it runs on, and the calls behind it.
 *
 * <p>Its own building block beside `banking.ts` and `matching.ts`: the statements are one
 * thing, what the cascade proposes is another, and what somebody does about it is a third
 * (ADR-0043).
 */

/** Path of the clearing basket within the application. */
export const CLEARING_PATH = '/zahlungen/klaerung'

/**
 * The rights this screen runs on.
 *
 * <p>The collective action carries one of its own: a run moves many amounts at once, and
 * unlike a single assignment nobody looks at every figure. The same reading the write-off run
 * and the dunning run already follow (backend ADR-0109).
 */
export const CLEARING_RIGHTS = {
  read: 'BANK_STATEMENT_READ',
  assign: 'INVOICE_PAYMENT_RECORD',
  run: 'BANKING_MATCH_RUN',
} as const

/**
 * How old the oldest unassigned payment has to be before the dunning work list warns.
 *
 * <p>Five days: shorter than any dunning period, long enough that yesterday's import raises
 * nothing. Held against `ClearingManagement.DUNNING_WARNING_DAYS`.
 */
export const DUNNING_WARNING_DAYS = 5

/** What each outcome of a collective run is called on screen. */
export const OUTCOME_NAMES: Record<string, string> = {
  POSTED: 'Gebucht',
  SKIPPED: 'Übersprungen',
  FAILED: 'Fehlgeschlagen',
}

/**
 * Whether the dunning work list should warn about unassigned money.
 *
 * <p>Warning, never blocking — the same line the dunning work list itself follows: it is a
 * query, and issuing a reminder is a deliberate release (ADR-0096).
 *
 * @param count what the basket holds
 * @param today the day to measure against
 * @returns true where money has been lying unassigned longer than the limit
 */
export function shouldWarnDunning(
  count: WorklistCount | undefined,
  today: Date = new Date(),
): boolean {
  if (count === undefined || count.open === 0 || count.oldestValueDate === undefined) {
    return false
  }
  // Whole days, no time of day — the same comparison the server makes. With the clock in it,
  // a warning would appear or not depending on the hour somebody opened the screen.
  const oldest = Date.parse(count.oldestValueDate.slice(0, 10))
  const limit = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  return oldest + DUNNING_WARNING_DAYS * 86_400_000 < limit
}

/**
 * What is left of a payment once the set lines are taken off it.
 *
 * <p>Computed in the browser for the running display; the server works it out again when the
 * assignment is sent. Two numbers that could disagree must not both reach a line that is
 * afterwards immutable.
 *
 * @param amount what arrived
 * @param lines  what has been set against it
 * @returns what is left, negative where more was set than arrived
 */
export function remainderOf(amount: number, lines: { amount: number }[]): number {
  const set = lines.reduce(
    (sum, line) => sum + (Number.isFinite(line.amount) ? line.amount : 0),
    0,
  )
  const rest = Math.round((amount - set) * 100) / 100
  // Negative zero is still zero, and it reads as «-0.00» in every formatter.
  return rest === 0 ? 0 : rest
}

/**
 * Whether an assignment may be booked.
 *
 * <p><b>The single most important rule of this screen, taken from Xero:</b> the button frees
 * only when the difference is nil or somebody deliberately chose what happens to the rest.
 * «Erst gleich, dann buchbar» — not «buchen und der Rest wird schon irgendwie» (ADR-0043).
 *
 * @param remainder      what is left
 * @param restHandled    whether somebody chose a treatment for the rest
 * @returns whether the button is free
 */
export function mayBook(remainder: number, restHandled: boolean): boolean {
  return Math.abs(remainder) < 0.005 || restHandled
}

/**
 * @param tenantId the tenant
 * @returns cache key of the basket
 */
export function worklistKey(tenantId: number, query?: string): readonly unknown[] {
  return query === undefined ? ['banking-worklist', tenantId] : ['banking-worklist', tenantId, query]
}

/**
 * @param tenantId the tenant
 * @returns cache key of the figures behind the badge
 */
export function worklistCountKey(tenantId: number): readonly unknown[] {
  return ['banking-worklist-count', tenantId]
}

/**
 * @param tenantId      the tenant
 * @param transactionId the movement
 * @returns cache key of what a withdrawal would touch in the dunning
 */
export function conflictsKey(tenantId: number, transactionId: number): readonly unknown[] {
  return ['banking-dunning-conflicts', tenantId, transactionId]
}

/** What the basket can be narrowed by. */
export type WorklistQuery = {
  importId?: number
  state?: string
  confidence?: Confidence
  toCheck?: boolean
  minAmount?: number
  page?: number
  size?: number
}

/**
 * @param tenantId the tenant
 * @param query    what to keep
 * @returns the basket, largest amount first
 */
export function fetchWorklist(
  tenantId: number,
  query: WorklistQuery = {},
): Promise<WorklistRow[]> {
  return api.get<WorklistRow[]>(
    `/api/tenants/${tenantId}/banking/worklist${queryStringOf(query)}`,
  )
}

/**
 * @param tenantId the tenant
 * @returns how much is still open
 */
export function fetchWorklistCount(tenantId: number): Promise<WorklistCount> {
  return api.get<WorklistCount>(`/api/tenants/${tenantId}/banking/worklist/count`)
}

/**
 * The figures behind the badge in the navigation.
 *
 * <p><b>This is the first request the sidebar ever makes.</b> Until now it asked nothing —
 * the module switch travels with the session, and that costs no request. The break is
 * deliberate and it is paid for: one call a minute, only for somebody who may read bank
 * statements and whose tenant runs the module, with four numbers in the answer (ADR-0043).
 *
 * <p><b>A failure shows nothing.</b> No badge and no error box — a navigation that shows a
 * red box is more broken than one without a number.
 *
 * @param tenantId the tenant, {@code null} while none is chosen
 * @param enabled  whether the entry is visible at all; the request is not made otherwise
 * @returns how much is still open, {@code undefined} while unknown
 */
export function useNavCounters(
  tenantId: number | null | undefined,
  enabled: boolean,
): WorklistCount | undefined {
  const answer = useQuery({
    queryKey: worklistCountKey(tenantId ?? 0),
    queryFn: () => fetchWorklistCount(tenantId ?? 0),
    enabled: enabled && tenantId !== null && tenantId !== undefined,
    // A number that changes once or twice a day needs no faster poll; coming back to the
    // tab is the moment it matters.
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    retry: false,
  })
  return answer.data
}

/** Assigns one bank movement to one or several invoices. */
export function assignTransaction(
  tenantId: number,
  transactionId: number,
  body: AssignmentBody,
): Promise<AssignedPayment[]> {
  return api.post<AssignedPayment[]>(
    `/api/tenants/${tenantId}/banking/transactions/${transactionId}/assignment`,
    body,
  )
}

/**
 * Takes an assignment back.
 *
 * <p>A counter entry, never a deletion — in the journal a correction always stands as a pair.
 */
export function withdrawAssignment(
  tenantId: number,
  transactionId: number,
  reason: string,
): Promise<AssignedPayment[]> {
  return api.post<AssignedPayment[]>(
    `/api/tenants/${tenantId}/banking/transactions/${transactionId}/assignment/withdraw`,
    { reason },
  )
}

/**
 * @param tenantId      the tenant
 * @param transactionId the movement
 * @returns what a withdrawal would touch in the dunning
 */
export function fetchDunningConflicts(
  tenantId: number,
  transactionId: number,
): Promise<DunningConflict[]> {
  return api.get<DunningConflict[]>(
    `/api/tenants/${tenantId}/banking/transactions/${transactionId}/dunning-conflicts`,
  )
}

/** Sets or clears «clarify later». */
export function markToCheck(
  tenantId: number,
  transactionId: number,
  toCheck: boolean,
  note?: string,
): Promise<void> {
  return api.put<void>(
    `/api/tenants/${tenantId}/banking/transactions/${transactionId}/to-check`,
    { toCheck, note },
  )
}

/**
 * What a collective run would book. Writes nothing.
 */
export function fetchMatchRunProposal(
  tenantId: number,
  importId: number,
  minConfidence: Confidence = 'HOCH',
): Promise<MatchRunProposal> {
  return api.get<MatchRunProposal>(
    `/api/tenants/${tenantId}/banking/match-runs/proposal?importId=${importId}` +
      `&minConfidence=${minConfidence}`,
  )
}

/**
 * Books what is safe, one transaction per movement.
 *
 * <p>The ids narrow, they do not decide: the run recomputes the proposal, because minutes can
 * pass between the screen and the click.
 */
export function runMatch(
  tenantId: number,
  importId: number,
  minConfidence: Confidence,
  transactionIds?: number[],
): Promise<MatchRunResult> {
  return api.post<MatchRunResult>(`/api/tenants/${tenantId}/banking/match-runs`, {
    importId,
    minConfidence,
    transactionIds,
  })
}
