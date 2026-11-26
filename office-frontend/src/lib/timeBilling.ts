import { ApiError } from './api'
import { formatDurationShort } from './duration'
import { formatAmount, formatDate, isCompleteIsoDate } from './format'
import type { Origin } from './origin'
import { PICKER_SIZE, listQuery } from './paging'
import { INVOICE_KIND, salesDocumentListKey } from './salesDocument'
import { TIMETRACKING_RIGHTS, hoursText, timeTrackingUrl, type TimesOf } from './timetracking'
import type {
  DocumentSummary,
  TimeBillingCandidate,
  TimeBillingGrouping,
  TimeBillingLine,
  TimeBillingPreview,
  TimeBillingRequest,
  TimeBillingRunPreviewLine,
  TimeBillingRunRequest,
  TimeBillingRunResult,
  TimeTrackingSettings,
  TimeEntry,
  TimeRateOrigin,
  TimeSkipReason,
  TimeWorklistLine,
} from './types'

/**
 * Billing time: the worklist, the mask with its preview, «Zeiten übernehmen» on a draft and the
 * billing increment (#127, backend ADR-0163, frontend ADR-0085).
 *
 * <p>Its own building block beside `timetracking.ts`, which is about recording. Every amount,
 * rate, quantity and minute shown here is the backend's: this file only names, links and words
 * them. Nothing is added up except whole minutes of the worklist, for the label of one button.
 */

/**
 * Path of the worklist «Abrechnen».
 *
 * <p>Beside «Meine Zeiten» and not under it: the menu marks an entry for every address below its
 * own, and `/zeiten/abrechnen` would mark «Meine Zeiten» as well.
 */
export const TIME_BILLING_PATH = '/zeiten-abrechnen'

/** Route of the billing mask of one project. */
export const TIME_BILLING_PROJECT_ROUTE = `${TIME_BILLING_PATH}/projekt/:projectId`

/** Route of the billing mask of one customer, with and without projects. */
export const TIME_BILLING_CUSTOMER_ROUTE = `${TIME_BILLING_PATH}/kunde/:partnerId`

/**
 * @param of the project or the customer to bill
 * @returns «/zeiten-abrechnen/projekt/12», «/zeiten-abrechnen/kunde/11»
 */
export function timeBillingPathOf(of: TimesOf): string {
  return of.kind === 'PROJECT'
    ? `${TIME_BILLING_PATH}/projekt/${of.projectId}`
    : `${TIME_BILLING_PATH}/kunde/${of.partnerId}`
}

/**
 * Whether this session may write the draft: `TIME_BILL` and `INVOICE_WRITE` together, as the
 * backend asks for `POST /billing`. The worklist and the preview need `TIME_BILL` alone.
 *
 * @param can answers whether the session holds a right
 * @returns true with both rights
 */
export function mayWriteBilling(can: (permission: string) => boolean): boolean {
  return can(TIMETRACKING_RIGHTS.bill) && can(INVOICE_KIND.rights.write)
}

// --- addresses and keys --------------------------------------------------------------

/**
 * @param tenantId the tenant
 * @param until the last day, `yyyy-mm-dd`
 * @param partnerId only this customer; left out for every one
 * @returns address of the worklist
 */
export function billingWorklistUrl(tenantId: number, until: string, partnerId?: number): string {
  return `${timeTrackingUrl(tenantId)}/billing/worklist?${listQuery({ until, partnerId })}`
}

/**
 * @param tenantId the tenant
 * @returns address of the preview, a `POST` that writes nothing
 */
export function billingPreviewUrl(tenantId: number): string {
  return `${timeTrackingUrl(tenantId)}/billing/preview`
}

/**
 * @param tenantId the tenant
 * @returns address that writes the draft
 */
export function billingUrl(tenantId: number): string {
  return `${timeTrackingUrl(tenantId)}/billing`
}

/**
 * @param tenantId the tenant
 * @returns address that takes entries off their draft
 */
export function billingReleaseUrl(tenantId: number): string {
  return `${timeTrackingUrl(tenantId)}/billing/release`
}

/**
 * @param tenantId the tenant
 * @returns address of the billing increment; read with `TIME_READ` or `TIME_WRITE`
 */
export function timeTrackingSettingsUrl(tenantId: number): string {
  return `${timeTrackingUrl(tenantId)}/settings`
}

/**
 * The invoice drafts of a customer, the newest first, for the choice «Ziel».
 *
 * @param partnerId the customer
 * @returns the query of the existing invoice list, which needs `INVOICE_READ`
 */
export function draftInvoicesQuery(partnerId: number): string {
  return listQuery({ status: ['DRAFT'], partnerId, size: PICKER_SIZE, sort: 'documentDate,desc' })
}

/**
 * @param tenantId the tenant
 * @param partnerId the customer
 * @returns address of its invoice drafts
 */
export function draftInvoicesUrl(tenantId: number, partnerId: number): string {
  return `/api/tenants/${tenantId}/${INVOICE_KIND.resource}?${draftInvoicesQuery(partnerId)}`
}

/**
 * Under the key of the invoice lists, so every change to an invoice refreshes the choice.
 *
 * @param tenantId the tenant
 * @param partnerId the customer
 * @returns key of its invoice drafts
 */
export function draftInvoicesKey(tenantId: number, partnerId: number): unknown[] {
  return salesDocumentListKey(INVOICE_KIND, tenantId, draftInvoicesQuery(partnerId))
}

/**
 * Key every query of the billing starts with, so a billing, a release and a new increment
 * refresh the worklist and the previews together.
 *
 * @param tenantId the tenant
 * @returns key of the billing
 */
export function timeBillingKey(tenantId: number): readonly unknown[] {
  return ['time-billing', tenantId]
}

/**
 * @param tenantId the tenant
 * @param until the last day
 * @param partnerId only this customer; left out for every one
 * @returns key of one worklist
 */
export function billingWorklistKey(
  tenantId: number,
  until: string,
  partnerId?: number,
): readonly unknown[] {
  return [...timeBillingKey(tenantId), 'worklist', until, partnerId ?? null]
}

/**
 * @param tenantId the tenant
 * @param request what is asked; equal requests share one answer
 * @returns key of one preview
 */
export function billingPreviewKey(
  tenantId: number,
  request: TimeBillingRequest,
): readonly unknown[] {
  return [...timeBillingKey(tenantId), 'preview', request]
}

/**
 * Apart from {@link timeBillingKey}: a billing does not change the increment.
 *
 * @param tenantId the tenant
 * @returns key of the billing increment
 */
export function timeTrackingSettingsKey(tenantId: number): readonly unknown[] {
  return ['time-settings', tenantId]
}

/**
 * @param documentId the invoice, a draft or an issued one
 * @returns the address of its mask, «/rechnungen/42»
 */
export function invoicePathOf(documentId: number): string {
  return `${INVOICE_KIND.path}/${documentId}`
}

/**
 * @param entry the entry
 * @returns the address of the invoice it stands on; `null` while it stands on none
 */
export function entryInvoicePath(entry: TimeEntry): string | null {
  return entry.documentId == null ? null : invoicePathOf(entry.documentId)
}

// --- the mask ----------------------------------------------------------------------

/** What the mask holds in the browser: the day, the ticks, the grouping and the target. */
export type BillingForm = {
  /** As typed, `yyyy-mm-dd`; a preview is asked only for a complete day. */
  until: string
  /** The ticked entries; `null` for every open one up to the day. */
  selection: readonly number[] | null
  grouping: TimeBillingGrouping
  /** An invoice draft of the customer; `null` for a new one. */
  documentId: number | null
}

/**
 * @param until the day the mask opens on
 * @param documentId the draft it opens with as target; `null` for a new invoice
 * @returns the mask as it opens: every open entry ticked, by service
 */
export function emptyBillingForm(until: string, documentId: number | null = null): BillingForm {
  return { until, selection: null, grouping: 'BY_SERVICE', documentId }
}

/**
 * What the mask sends, for the preview and for writing alike.
 *
 * <p>A project goes without its customer, which the server takes from the project. The ticks go
 * sorted, so the same choice made in another order asks the same question; and not at all while
 * every entry is ticked, so an entry recorded meanwhile comes along. No amount goes out.
 *
 * @param of the project or the customer
 * @param form the mask
 * @returns the request body
 */
export function toBillingRequest(of: TimesOf, form: BillingForm): TimeBillingRequest {
  return {
    ...(of.kind === 'PROJECT' ? { projectId: of.projectId } : { partnerId: of.partnerId }),
    until: form.until,
    ...(form.selection === null ? {} : { entryIds: [...form.selection].sort((a, b) => a - b) }),
    grouping: form.grouping,
    ...(form.documentId === null ? {} : { documentId: form.documentId }),
  }
}

/**
 * @param form the mask
 * @returns true while the day can be asked about: a whole date
 */
export function isAskable(form: BillingForm): boolean {
  return isCompleteIsoDate(form.until)
}

/**
 * @param selection the ticks of the mask, `null` for all
 * @param candidates the open entries the preview lists
 * @returns the ids that show a tick
 */
export function selectedEntryIds(
  selection: readonly number[] | null,
  candidates: readonly TimeBillingCandidate[],
): Set<number> {
  if (selection === null) return new Set(candidates.map((candidate) => candidate.entryId))
  return new Set(selection)
}

/**
 * The ticks after a click in the list.
 *
 * @param ticked what the list shows ticked now
 * @param candidates the open entries the preview lists
 * @returns `null` when every one is ticked, so later entries come along; otherwise the ticked
 *          entries of the list, in their order
 */
export function selectionAfter(
  ticked: ReadonlySet<string | number>,
  candidates: readonly TimeBillingCandidate[],
): number[] | null {
  const ids = candidates.map((candidate) => candidate.entryId).filter((id) => ticked.has(id))
  return ids.length === candidates.length && candidates.length > 0 ? null : ids
}

/**
 * @param selection the ticks of the mask, `null` for all
 * @param entryIds entries that are no longer open
 * @returns the ticks without them; all stays all
 */
export function withoutEntries(
  selection: readonly number[] | null,
  entryIds: readonly number[],
): readonly number[] | null {
  if (selection === null) return null
  return selection.filter((id) => !entryIds.includes(id))
}

/**
 * The ticks for a row «ohne Projekt» of the worklist: the customer is billed as a whole, the
 * entries on projects are listed but left unticked.
 *
 * @param candidates the open entries of the customer
 * @returns the entries without a project
 */
export function withoutProjectSelection(candidates: readonly TimeBillingCandidate[]): number[] {
  return candidates
    .filter((candidate) => candidate.projectId == null)
    .map((candidate) => candidate.entryId)
}

// --- words -------------------------------------------------------------------------

/** The two groupings, in the order the choice shows them; by service is the default. */
export const BILLING_GROUPINGS: readonly { value: TimeBillingGrouping; label: string }[] = [
  { value: 'BY_SERVICE', label: 'je Leistung' },
  { value: 'BY_ENTRY', label: 'je Eintrag' },
]

/** What each grouping means, for the tooltip of the choice. */
export const BILLING_GROUPING_HINTS: Record<TimeBillingGrouping, string> = {
  BY_SERVICE:
    'Eine Position je Leistung und Satz, vom ersten bis zum letzten Tag; die Bemerkung führt die Einträge auf. Namen stehen keine auf der Rechnung.',
  BY_ENTRY: 'Eine Position je Eintrag, mit Datum und Text.',
}

const RATE_ORIGIN_LABELS: Record<TimeRateOrigin, string> = {
  PROJECT_RATE: 'Projektsatz',
  CUSTOMER_PRICE: 'Kundenpreis',
  PRICE_GROUP: 'Preisgruppe',
  DEFAULT_PRICE_GROUP: 'Preisgruppe',
  BASE_PRICE: 'Grundpreis',
}

/**
 * Where the rate of a line came from, for its badge.
 *
 * @param line the line of the preview
 * @returns «Projektsatz», «Kundenpreis», «Preisgruppe Wiederverkäufer», «Grundpreis»; a price
 *          group without a name reads «Preisgruppe»
 */
export function rateOriginText(line: Pick<TimeBillingLine, 'rateOrigin' | 'priceGroupName'>): string {
  const label = RATE_ORIGIN_LABELS[line.rateOrigin]
  const grouped = line.rateOrigin === 'PRICE_GROUP' || line.rateOrigin === 'DEFAULT_PRICE_GROUP'
  return grouped && line.priceGroupName ? `${label} ${line.priceGroupName}` : label
}

/** The reason of a skipped entry in two or three words, for its badge; the sentence follows. */
export const SKIP_REASON_LABELS: Record<TimeSkipReason, string> = {
  NOT_OPEN: 'nicht mehr offen',
  PROJECT_NOT_BILLED: 'Projekt nicht verrechenbar',
  RATE_CURRENCY: 'Satz in anderer Währung',
  UNIT_NOT_HOURS: 'Leistung nicht in Stunden',
  NO_VAT_RATE: 'kein MWST-Satz',
  TAX_LIABILITY_STARTS: 'vor der Steuerpflicht',
}

/**
 * What the total of the preview is called.
 *
 * <p>With a draft as target the preview counts only the lines this billing adds, before a
 * discount on the whole draft; the totals of the draft stand on the draft (backend ADR-0163).
 * Without VAT liability there is no VAT to be net of, so «netto» goes.
 *
 * @param documentId the target, `null` for a new invoice
 * @param vatLiable whether the tenant is registered for VAT, as the preview says
 * @returns «Total netto» or «Neue Positionen netto» for a draft; «Total» or «Neue Positionen»
 *          for a tenant not registered
 */
export function totalLabel(documentId: number | null | undefined, vatLiable: boolean): string {
  const head = documentId == null ? 'Total' : 'Neue Positionen'
  return vatLiable ? `${head} netto` : head
}

/** The increments the backend takes, in minutes; 1 is none. */
export const BILLING_INCREMENTS: readonly number[] = [1, 5, 6, 10, 15, 30]

/**
 * @param minutes the increment
 * @returns «kein Takt» for 1, otherwise «15 Minuten»
 */
export function billingIncrementLabel(minutes: number): string {
  return minutes <= 1 ? 'kein Takt' : `${minutes} Minuten`
}

/**
 * What the preview says about the increment, with an example from the entries where one is
 * rounded up.
 *
 * @param preview the preview
 * @returns «Ohne Abrechnungstakt: verrechnet wird die erfasste Zeit.», or «Abrechnungstakt 15
 *          Min.: jeder Eintrag wird aufgerundet, 1:10 wird 1:15.»
 */
export function incrementText(
  preview: Pick<TimeBillingPreview, 'billingIncrementMinutes' | 'candidates'>,
): string {
  const increment = preview.billingIncrementMinutes
  if (increment <= 1) return 'Ohne Abrechnungstakt: verrechnet wird die erfasste Zeit.'
  const head = `Abrechnungstakt ${increment} Min.: jeder Eintrag wird aufgerundet`
  const example = preview.candidates.find(
    (candidate) => candidate.billedMinutes !== candidate.durationMinutes,
  )
  if (example === undefined) return `${head}.`
  return `${head}, ${formatDurationShort(example.durationMinutes)} wird ${formatDurationShort(example.billedMinutes)}.`
}

const HOURS = new Intl.NumberFormat('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * The quantity of a line, as the invoice will carry it: hours with two decimals.
 *
 * @param quantity the quantity the backend worked out
 * @returns «3.75 Std.», «1’250.00 Std.»
 */
export function billingQuantityText(quantity: number): string {
  return `${HOURS.format(quantity)} Std.`
}

/**
 * @param line the line of the preview
 * @returns «03.11.2026 – 05.11.2026», or the one day
 */
export function serviceDatesText(
  line: Pick<TimeBillingLine, 'serviceDateFrom' | 'serviceDateTo'>,
): string {
  const to = line.serviceDateTo
  if (!to || to === line.serviceDateFrom) return formatDate(line.serviceDateFrom)
  return `${formatDate(line.serviceDateFrom)} – ${formatDate(to)}`
}

/**
 * One entry in one line, for a sentence that names it.
 *
 * @param candidate the entry of the preview
 * @returns «03.11.2026 · Anna Muster · Konzeption · 2:30»; a missing name or service is left out
 */
export function candidateText(candidate: TimeBillingCandidate): string {
  return [
    formatDate(candidate.workDate),
    candidate.userName,
    candidate.serviceName,
    formatDurationShort(candidate.durationMinutes),
  ]
    .filter(Boolean)
    .join(' · ')
}

/**
 * @param entryId an entry the backend named
 * @param candidates the open entries the screen knew of
 * @returns the entry in words where the screen knew it, else «Eintrag 17»
 */
export function entryText(entryId: number, candidates: readonly TimeBillingCandidate[]): string {
  const known = candidates.find((candidate) => candidate.entryId === entryId)
  return known === undefined ? `Eintrag ${entryId}` : candidateText(known)
}

/**
 * The entries another billing took in the meantime, out of a refusal of `POST /billing`.
 *
 * @param error what the request threw
 * @returns the entries for a 409 that names them under `entryIds`, empty for a 409 that names
 *          none — the draft was issued or saved at the same moment —, `null` for any other error
 */
export function billedMeanwhileIdsOf(error: unknown): number[] | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null
  const details = error.details
  if (typeof details !== 'object' || details === null || !('entryIds' in details)) return null
  const ids: unknown = details.entryIds
  if (!Array.isArray(ids)) return null
  return ids.filter((id): id is number => Number.isInteger(id))
}

/**
 * What the mask says after another billing took some of its entries.
 *
 * @param entryIds the entries the refusal named, at least one
 * @param candidates the open entries the screen showed before
 * @returns «Inzwischen abgerechnet: 03.11.2026 · Anna Muster · Konzeption · 2:30. Die Vorschau
 *          ist neu geladen; die übrigen lassen sich abrechnen.»
 */
export function billedMeanwhileText(
  entryIds: readonly number[],
  candidates: readonly TimeBillingCandidate[],
): string {
  const named = entryIds.map((id) => entryText(id, candidates)).join('; ')
  return `Inzwischen abgerechnet: ${named}. Die Vorschau ist neu geladen; die übrigen lassen sich abrechnen.`
}

/**
 * @param preview the preview
 * @returns «Muster AG · P-00012 Website», or the customer alone
 */
export function billingSubjectText(
  preview: Pick<TimeBillingPreview, 'customerName' | 'projectNumber' | 'projectName'>,
): string {
  const project = [preview.projectNumber, preview.projectName].filter(Boolean).join(' ')
  return project === '' ? preview.customerName : `${preview.customerName} · ${project}`
}

/**
 * @param documentId the target of the mask, `null` for a new invoice
 * @returns the words of the button that writes
 */
export function billingSubmitLabel(documentId: number | null): string {
  return documentId === null ? 'Rechnungsentwurf erstellen' : 'In den Entwurf übernehmen'
}

/**
 * One draft in the choice «Ziel».
 *
 * @param draft the draft as the invoice list answers it
 * @returns «Entwurf vom 20.11.2026 · 1’081.00 CHF»; a draft issued once and taken back names its
 *          number instead of «Entwurf»
 */
export function draftOptionLabel(draft: DocumentSummary): string {
  const name = draft.documentNumber ?? 'Entwurf'
  return `${name} vom ${formatDate(draft.documentDate)} · ${formatAmount(draft.totalGross)} ${draft.currency}`
}

// --- the worklist ------------------------------------------------------------------

/**
 * @param line a row of the worklist
 * @returns «P-00012 Website», or «ohne Projekt» for the time of the customer alone
 */
export function worklistProjectText(line: TimeWorklistLine): string {
  if (line.projectId == null) return 'ohne Projekt'
  return [line.projectNumber, line.projectName].filter(Boolean).join(' ') || 'Projekt nicht mehr vorhanden'
}

/**
 * @param line a row of the worklist
 * @returns the customer, or that it is gone
 */
export function worklistCustomerText(line: TimeWorklistLine): string {
  return line.customerName ?? 'Kunde nicht mehr vorhanden'
}

/**
 * @param line a row of the worklist
 * @returns what its «Abrechnen» opens: its project, or its customer
 */
export function worklistTargetOf(line: TimeWorklistLine): TimesOf {
  return line.projectId == null
    ? { kind: 'CUSTOMER', partnerId: line.partnerId }
    : { kind: 'PROJECT', projectId: line.projectId }
}

/**
 * The open time of a customer, for the button on its draft.
 *
 * <p>Whole minutes of the rows the backend sent, one per project and one without: the answer
 * is not paged, so the sum is the customer's. No amount is added up.
 *
 * @param lines the worklist of one customer
 * @returns the measured minutes, 0 for none
 */
export function worklistOpenMinutes(lines: readonly TimeWorklistLine[]): number {
  return lines.reduce((sum, line) => sum + line.openMinutes, 0)
}

/**
 * @param minutes the open time of the customer
 * @returns «Zeiten übernehmen (12:30 Std.)»
 */
export function takeOverLabel(minutes: number): string {
  return `Zeiten übernehmen (${hoursText(minutes)})`
}

// --- handing over ------------------------------------------------------------------

/** What a link into the billing mask hands over beside the way back. */
export type BillingHandover = {
  /** The day of the worklist, `yyyy-mm-dd`; `null` for today. */
  until: string | null
  /** True for a row «ohne Projekt»: only the entries without a project start ticked. */
  withoutProject: boolean
}

/**
 * @param handover the day and whether only the entries without a project are meant
 * @param origin the screen the link leads away from, so the mask returns there
 * @returns the router state of the link
 */
export function billingHandoverState(
  handover: Partial<BillingHandover>,
  origin?: Origin,
): object {
  return {
    ...(origin === undefined ? {} : { origin }),
    billing: { until: handover.until ?? null, withoutProject: handover.withoutProject ?? false },
  }
}

/**
 * Reads back what a link into the mask handed over.
 *
 * <p>Router state survives a reload and may stem from an older version, so every field is
 * checked rather than trusted, like the origin of a mask.
 *
 * @param state the router state, `location.state`
 * @returns the day where a whole date stands there, else `null`; «ohne Projekt» only where it
 *          says so; the way back is read with `originOf`
 */
export function billingHandoverOf(state: unknown): BillingHandover {
  const none: BillingHandover = { until: null, withoutProject: false }
  if (typeof state !== 'object' || state === null || !('billing' in state)) return none
  const billing: unknown = state.billing
  if (typeof billing !== 'object' || billing === null) return none
  const until: unknown = Reflect.get(billing, 'until')
  const withoutProject: unknown = Reflect.get(billing, 'withoutProject')
  return {
    until: typeof until === 'string' && isCompleteIsoDate(until) ? until : null,
    withoutProject: withoutProject === true,
  }
}

// --- the increment -----------------------------------------------------------------

/**
 * @param settings the increment as the backend stored it
 * @returns «Abrechnungstakt gespeichert: 15 Minuten.», «Abrechnungstakt gespeichert: kein Takt.»
 */
export function incrementSavedText(settings: TimeTrackingSettings): string {
  return `Abrechnungstakt gespeichert: ${billingIncrementLabel(settings.billingIncrementMinutes)}.`
}

// --- taking entries off a draft ------------------------------------------------------

/**
 * What «Vom Entwurf lösen» did, in one sentence.
 *
 * @param entries the entries as the backend answers them, open again
 * @returns «Vom Entwurf gelöst: 1 Eintrag, wieder offen.», «… 3 Einträge, wieder offen.»
 */
export function releasedText(entries: readonly TimeEntry[]): string {
  const count = entries.length === 1 ? '1 Eintrag' : `${entries.length} Einträge`
  return `Vom Entwurf gelöst: ${count}, wieder offen.`
}

// --- the billing run (#140) --------------------------------------------------------

/**
 * @param tenantId the tenant
 * @returns address of the preview of a billing run, a `POST` that writes nothing
 */
export function billingRunPreviewUrl(tenantId: number): string {
  return `${timeTrackingUrl(tenantId)}/billing/batch/preview`
}

/**
 * @param tenantId the tenant
 * @returns address of the billing run, a new invoice draft per row (backend ADR-0169)
 */
export function billingRunUrl(tenantId: number): string {
  return `${timeTrackingUrl(tenantId)}/billing/batch`
}

/**
 * The key a row of the worklist is ticked by: its customer and its project, `ohne` for the time
 * without one. A result of the run names its row the same way.
 *
 * @param row a row of the worklist, of the preview or of the result
 * @returns for example `11-12` or `11-ohne`
 */
export function worklistKeyOf(row: { partnerId: number; projectId?: number | null }): string {
  return `${row.partnerId}-${row.projectId ?? 'ohne'}`
}

/**
 * What a billing run sends for the ticked rows of the worklist, in the order of the list.
 *
 * @param lines the rows of the worklist
 * @param ticked the keys of the ticked rows
 * @param until the day, `yyyy-mm-dd`
 * @returns the request of the preview and of the run
 */
export function billingRunRequestOf(
  lines: readonly TimeWorklistLine[],
  ticked: ReadonlySet<string | number>,
  until: string,
): TimeBillingRunRequest {
  return {
    until,
    targets: lines
      .filter((line) => ticked.has(worklistKeyOf(line)))
      .map((line) => ({ partnerId: line.partnerId, projectId: line.projectId ?? null })),
  }
}

/**
 * What the button under the preview says: how many drafts the run would write.
 *
 * @param lines the preview
 * @returns «3 Rechnungsentwürfe erstellen», «1 Rechnungsentwurf erstellen»
 */
export function billingRunActionText(lines: readonly TimeBillingRunPreviewLine[]): string {
  const count = lines.filter((line) => line.refusal == null).length
  return count === 1 ? '1 Rechnungsentwurf erstellen' : `${count} Rechnungsentwürfe erstellen`
}

/**
 * The sentence over the result of a run.
 *
 * @param result what the run did
 * @returns for example «2 Entwürfe erstellt, 1 übersprungen, 0 fehlgeschlagen.»
 */
export function billingRunResultText(result: TimeBillingRunResult): string {
  const drafts = result.created.length === 1 ? '1 Entwurf' : `${result.created.length} Entwürfe`
  return `${drafts} erstellt, ${result.skipped.length} übersprungen, ${result.failed.length} fehlgeschlagen.`
}
