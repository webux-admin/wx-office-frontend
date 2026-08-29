import { api } from './api'
import { listQuery } from './paging'
import type {
  OpenItem,
  Page,
  WriteOff,
  WriteOffProposal,
  WriteOffReason,
  WriteOffRunResult,
} from './types'

/**
 * The open items of a tenant: where their screens live, what rights they run on, and the
 * calls behind them.
 *
 * <p>Its own building block rather than addresses typed into the screens, the same way
 * `dunning.ts` and `outbox.ts` do it: the list is read by two masks, the write-off dialog
 * sits in a third, and a query key written twice is a cache that goes stale in one of them.
 */

/** Path of the list of open items within the application. */
export const OPEN_ITEM_PATH = '/offene-posten'

/** Path of the collective write-off within the application. */
export const WRITE_OFF_RUN_PATH = '/kleindifferenzen'

/**
 * The three rights these screens run on.
 *
 * <p>`writeOff` and `run` are deliberately not the same right, and neither is carried by the
 * other: giving up one receivable somebody looked at, and giving up three hundred without
 * anybody seeing a single figure, are different responsibilities (backend ADR-0101,
 * ADR-0102).
 */
export const OPEN_ITEM_RIGHTS = {
  read: 'INVOICE_READ',
  writeOff: 'INVOICE_WRITE_OFF',
  run: 'INVOICE_WRITE_OFF_RUN',
} as const

/** What each reason for giving a receivable up is called on screen. */
export const WRITE_OFF_REASONS: Record<WriteOffReason, string> = {
  SKONTO: 'Skonto',
  SKONTO_UNBERECHTIGT: 'Skonto unberechtigt',
  KLEINDIFFERENZ: 'Kleindifferenz',
  DEBITORENVERLUST: 'Debitorenverlust',
  BANKSPESEN: 'Bankspesen',
  KURSDIFFERENZ: 'Kursdifferenz',
  UEBERZAHLUNG: 'Überzahlung einbehalten',
}

/**
 * What each reason means, spelled out where it is chosen.
 *
 * <p>The tax consequence is part of the sentence: which of these reduces the consideration is
 * the one thing somebody must not have to guess.
 */
export const WRITE_OFF_REASON_HINTS: Record<WriteOffReason, string> = {
  SKONTO: 'Vereinbarter Abzug bei früher Zahlung. Mindert das Entgelt.',
  SKONTO_UNBERECHTIGT:
    'Abgezogen, obwohl nichts vereinbart war. Steuerlich gleich wie Skonto — der Wert gibt es, damit die Auswertung zählen kann.',
  KLEINDIFFERENZ: 'Ein paar Rappen, damit der Posten schliesst. Mindert das Entgelt.',
  DEBITORENVERLUST: 'Der Rest kommt nicht mehr. Mindert das Entgelt.',
  BANKSPESEN: 'Unterwegs abgezogene Gebühren. Mindert das Entgelt nicht — keine MWST-Folge.',
  KURSDIFFERENZ: 'Der Kurs hat sich bewegt. Mindert das Entgelt nicht — keine MWST-Folge.',
  UEBERZAHLUNG: 'Der Kunde hat zu viel bezahlt und der Mehrbetrag bleibt. Zusätzliches Entgelt.',
}

/** The reasons in the order the picker offers them: the everyday one first. */
export const WRITE_OFF_REASON_ORDER: WriteOffReason[] = [
  'KLEINDIFFERENZ',
  'SKONTO',
  'SKONTO_UNBERECHTIGT',
  'DEBITORENVERLUST',
  'BANKSPESEN',
  'KURSDIFFERENZ',
  'UEBERZAHLUNG',
]

/** What the list of open items was asked for. */
export type OpenItemFilter = {
  partnerId?: number
  overdueOnly?: boolean
  includeSettled?: boolean
  dueFrom?: string
  dueTo?: string
  documentNumber?: string
  page?: number
  size?: number
  sort?: string
}

/**
 * Where a page of open items is cached.
 *
 * @param tenantId the tenant, null while none is chosen
 * @param query    what was asked for; left out to reach every page at once
 */
export function openItemsKey(tenantId: number | null, query?: string): readonly unknown[] {
  return query === undefined ? ['open-items', tenantId] : ['open-items', tenantId, query]
}

/**
 * The query string of a list request.
 *
 * <p>Leaves out what was not asked for: a false checkbox must not become `overdueOnly=false`
 * and a blank search must not become `documentNumber=`, which the server would read as «match
 * the empty string».
 *
 * @param filter what the mask asked for
 */
export function openItemQuery(filter: OpenItemFilter): string {
  return listQuery({
    partnerId: filter.partnerId,
    overdueOnly: filter.overdueOnly === true ? true : undefined,
    includeSettled: filter.includeSettled === true ? true : undefined,
    dueFrom: filter.dueFrom,
    dueTo: filter.dueTo,
    documentNumber: filter.documentNumber,
    page: filter.page,
    size: filter.size,
    sort: filter.sort,
  })
}

/**
 * Lists what is still owed, oldest due date first.
 *
 * @param tenantId the tenant
 * @param query    the query string from {@link openItemQuery}
 */
export function fetchOpenItems(tenantId: number, query: string): Promise<Page<OpenItem>> {
  return api.get<Page<OpenItem>>(`/api/tenants/${tenantId}/open-items?${query}`)
}

/** What the write-off dialog sends. */
export type WriteOffBody = {
  reason: WriteOffReason
  amount: number
  /** The period of the tax correction. Left out means today; a future day is refused. */
  bookingDate?: string
  valueDate?: string
  evidence?: string
  note?: string
}

/**
 * Gives up part or all of a receivable.
 *
 * @param tenantId   the tenant
 * @param documentId the Rechnung
 * @param body       reason, amount, booking date, evidence
 */
export function recordWriteOff(
  tenantId: number,
  documentId: number,
  body: WriteOffBody,
): Promise<WriteOff> {
  return api.post<WriteOff>(`/api/tenants/${tenantId}/invoices/${documentId}/write-offs`, body)
}

/** What the collective run sends, for the proposal and for the booking alike. */
export type WriteOffRunBody = {
  /** Set for the amount form; then `tolerancePercent` stays out. */
  toleranceAmount?: number
  /** Set for the percentage form; then `toleranceAmount` stays out. */
  tolerancePercent?: number
  currency: string
  bookingDate?: string
  reason: WriteOffReason
  minimumAgeDays?: number
  partnerId?: number
  /** The ticked items. They narrow what is booked; they never decide it. */
  documentIds?: number[]
}

/**
 * Works out which small remainders a run would give up. Writes nothing.
 *
 * <p>`POST` and not `GET`, because tolerance, reason, date and filters are one object and
 * would become a query string nobody reads any more.
 *
 * @param tenantId the tenant
 * @param body     the settings
 */
export function fetchWriteOffProposal(
  tenantId: number,
  body: WriteOffRunBody,
): Promise<WriteOffProposal> {
  return api.post<WriteOffProposal>(`/api/tenants/${tenantId}/write-off-runs/proposal`, body)
}

/**
 * Books the ticked items, each in its own transaction.
 *
 * <p>The proposal is worked out again on the server. An item that was paid in between is not
 * given up — it comes back in `skipped` with the reason.
 *
 * @param tenantId the tenant
 * @param body     the same settings, plus the ticked invoices
 */
export function runWriteOff(
  tenantId: number,
  body: WriteOffRunBody,
): Promise<WriteOffRunResult> {
  return api.post<WriteOffRunResult>(`/api/tenants/${tenantId}/write-off-runs`, body)
}

