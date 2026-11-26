import type { BadgeTone } from '../components/Badge'
import { ApiError, api } from './api'
import { formatDuration, formatDurationShort, readDuration, type Duration } from './duration'
import { fieldErrorsOf, isToldByFields, type FieldErrors } from './fieldErrors'
import { formatCount, formatDateTime, isCompleteIsoDate, parseDecimal, toIsoDate } from './format'
import { PAGE_SIZE, listQuery } from './paging'
import { addDays, dayTitle, mondayOf } from './week'
import type {
  BillingMode,
  Project,
  ProjectStatus,
  ProjectTerms,
  ProjectTermsRequest,
  RunningTimer,
  TimeBillableDefault,
  TimeEntry,
  TimeEntryRequest,
  TimeEntryState,
  TimeRecentTarget,
  TimeServiceChoice,
  TimeSummary,
  TimeTargetChoice,
  TimeUserDefault,
  TimerChangeRequest,
  TimerRequest,
  TimerStart,
  TimerStopRequest,
} from './types'

/**
 * The time tracking module: its name, its addresses, its rights and the rules of the quick line.
 *
 * <p>Its own building block, like `project.ts`: the menu entry, the screens and the role mask
 * read the same codes, and a right spelled out twice is a right that drifts in one of them
 * (backend ADR-0159, ADR-0160, frontend ADR-0082).
 */

/** Name of the backend `LicensedModule` value. */
export const TIMETRACKING_MODULE = 'TIMETRACKING'

/** Path of «Meine Zeiten» within the application. */
export const TIMETRACKING_PATH = '/zeiten'

/** Path of the settings of the module: the default service of every user and the increment. */
export const TIMETRACKING_SETTINGS_PATH = '/zeiterfassung-einstellungen'

/**
 * The four rights of the module.
 *
 * <p>One's own times come with `track`, without any other right. `read` opens the times of
 * everybody and `write` those of others — personal data about how somebody works (OR Art.
 * 328b). `bill` writes an invoice draft and works only together with `INVOICE_WRITE`.
 */
export const TIMETRACKING_RIGHTS = {
  track: 'TIME_TRACK',
  read: 'TIME_READ',
  write: 'TIME_WRITE',
  bill: 'TIME_BILL',
} as const

/** What each state is called beside an entry. */
export const TIME_ENTRY_STATE_LABELS: Record<TimeEntryState, string> = {
  OPEN: 'offen',
  IN_DRAFT: 'im Entwurf',
  BILLED: 'verrechnet',
  NOT_BILLABLE: 'nicht verrechenbar',
}

/**
 * Work still to be billed stands out, billed work reads as done, what is on a draft waits
 * quietly in between, and what is never billed steps back.
 */
export const TIME_ENTRY_STATE_TONES: Record<TimeEntryState, BadgeTone> = {
  OPEN: 'accent',
  IN_DRAFT: 'neutral',
  BILLED: 'success',
  NOT_BILLABLE: 'muted',
}

/**
 * What the badge of an entry says: its state, and for a billed one the invoice it is on.
 *
 * @param entry the entry
 * @returns «verrechnet RE-2026-0042», «im Entwurf», «offen», «nicht verrechenbar»; a billed entry
 *          without a number reads «verrechnet»
 */
export function entryStateText(entry: TimeEntry): string {
  const label = TIME_ENTRY_STATE_LABELS[entry.state]
  if (entry.state !== 'BILLED' || !entry.documentNumber) return label
  return `${label} ${entry.documentNumber}`
}

/** Longest text the backend takes. */
export const TIME_ENTRY_DESCRIPTION_MAX_LENGTH = 1000

/** Whose times a screen shows: one's own, or those of a colleague by their user id. */
export type SheetOwner = 'mine' | number

// --- addresses ---------------------------------------------------------------------

/**
 * @param tenantId the tenant
 * @returns address every way of the module starts with
 */
export function timeEntriesUrl(tenantId: number): string {
  return `/api/tenants/${tenantId}/time-entries`
}

/**
 * The times of one week, or any range of days.
 *
 * <p>One's own come from `/mine`, where the server takes the user from the session; a
 * colleague's from `/sheet` with their id, which needs `TIME_READ` (backend ADR-0160).
 *
 * @param tenantId the tenant
 * @param owner whose times
 * @param from the first day, `yyyy-MM-dd`
 * @param to the last day, `yyyy-MM-dd`
 * @returns address of the sheet
 */
export function timeSheetUrl(tenantId: number, owner: SheetOwner, from: string, to: string): string {
  if (owner === 'mine') return `${timeEntriesUrl(tenantId)}/mine?${listQuery({ from, to })}`
  return `${timeEntriesUrl(tenantId)}/sheet?${listQuery({ userId: owner, from, to })}`
}

/**
 * @param tenantId the tenant
 * @param owner whose time is recorded; a colleague's needs `TIME_WRITE`
 * @returns address a new entry is posted to
 */
export function timeEntryWriteUrl(tenantId: number, owner: SheetOwner): string {
  if (owner === 'mine') return `${timeEntriesUrl(tenantId)}/mine`
  return `${timeEntriesUrl(tenantId)}?${listQuery({ userId: owner })}`
}

/**
 * @param tenantId the tenant
 * @param owner whose entry it is
 * @param entryId the entry
 * @returns address one entry is changed and deleted at
 */
export function timeEntryUrl(tenantId: number, owner: SheetOwner, entryId: number): string {
  if (owner === 'mine') return `${timeEntriesUrl(tenantId)}/mine/${entryId}`
  return `${timeEntriesUrl(tenantId)}/${entryId}?${listQuery({ userId: owner })}`
}

/**
 * «Kopieren»: the server writes the same work again on the day of the entry, directly under it,
 * without its range (backend ADR-0167).
 *
 * @param tenantId the tenant
 * @param owner whose entry it is
 * @param entryId the entry to copy
 * @returns address of the copy
 */
export function timeEntryCopyUrl(tenantId: number, owner: SheetOwner, entryId: number): string {
  if (owner === 'mine') return `${timeEntriesUrl(tenantId)}/mine/${entryId}/copy`
  return `${timeEntriesUrl(tenantId)}/${entryId}/copy?${listQuery({ userId: owner })}`
}

/**
 * @param tenantId the tenant
 * @returns address of the chips «Zuletzt»; they exist for one's own times only
 */
export function recentTargetsUrl(tenantId: number): string {
  return `${timeEntriesUrl(tenantId)}/mine/recent`
}

/**
 * The service the server suggests for a target: the one taken on it last, else the default
 * service of the user (backend ADR-0162).
 *
 * @param tenantId the tenant
 * @param target the project or customer; `null` for internal time
 * @returns address of the suggestion, which answers 204 where there is none
 */
export function defaultServiceUrl(tenantId: number, target: TimeTargetChoice | null): string {
  return `${timeEntriesUrl(tenantId)}/mine/default-service${targetQuery(target)}`
}

/**
 * Reads the service the server suggests for a target.
 *
 * @param tenantId the tenant
 * @param target the project or customer; `null` for internal time
 * @returns the suggestion, `null` where the server has none (204)
 * @throws ApiError when the server refuses to answer
 */
export async function fetchSuggestedService(
  tenantId: number,
  target: TimeTargetChoice | null,
): Promise<TimeServiceChoice | null> {
  return (await api.get<TimeServiceChoice | undefined>(defaultServiceUrl(tenantId, target))) ?? null
}

/**
 * What the box «verrechenbar» shows for a target, and whether it is locked. A lookup with
 * `TIME_TRACK`: it names no rate (backend ADR-0162).
 *
 * @param tenantId the tenant
 * @param target the project or customer; `null` for internal time
 * @returns address of the default
 */
export function billableDefaultUrl(tenantId: number, target: TimeTargetChoice | null): string {
  return `${timeEntriesUrl(tenantId)}/lookups/default-billable${targetQuery(target)}`
}

/** `?projectId=` for a project, `?partnerId=` for a customer, nothing for internal time. */
function targetQuery(target: TimeTargetChoice | null): string {
  if (target === null) return ''
  const query =
    target.kind === 'PROJECT'
      ? listQuery({ projectId: target.projectId })
      : listQuery({ partnerId: target.partnerId })
  return query === '' ? '' : `?${query}`
}

/**
 * Projects and customers in one list. Asks the time tracking and not the project or partner
 * module: recording time needs no right there (backend ADR-0160).
 *
 * @param tenantId the tenant
 * @param search part of a number or name, empty for the first ones
 * @returns address of the lookup
 */
export function targetLookupUrl(tenantId: number, search: string): string {
  return lookupUrl(tenantId, 'targets', search)
}

/**
 * The services time can be recorded with: those that can be billed later. Without a project
 * the server offers services in hours only; on a project with a rate of its own every active
 * service (backend ADR-0166).
 *
 * @param tenantId the tenant
 * @param search part of a name or number, empty for the first ones
 * @param projectId the project the time goes on, `null` for a customer, internal time or the
 *   default service of a user
 * @returns address of the services
 */
export function serviceLookupUrl(
  tenantId: number,
  search: string,
  projectId: number | null = null,
): string {
  const query = listQuery({ search, projectId })
  return `${timeEntriesUrl(tenantId)}/lookups/services${query === '' ? '' : `?${query}`}`
}

/**
 * @param target what the time goes on
 * @returns the project of it, `null` for a customer without project or for internal time
 */
export function projectIdOf(target: TimeTargetChoice | null): number | null {
  return target?.kind === 'PROJECT' ? (target.projectId ?? null) : null
}

/**
 * @param tenantId the tenant
 * @returns address of everybody whose times can be looked at, for «Zeiten von …»
 */
export function colleaguesUrl(tenantId: number): string {
  return `${timeEntriesUrl(tenantId)}/lookups/colleagues`
}

function lookupUrl(tenantId: number, list: string, search: string): string {
  const query = listQuery({ search })
  return `${timeEntriesUrl(tenantId)}/lookups/${list}${query === '' ? '' : `?${query}`}`
}

// --- cache keys --------------------------------------------------------------------

/**
 * @param tenantId the tenant
 * @returns key every query about entries starts with, so one write refreshes the sheet, the
 *          chips and the suggestions together
 */
export function timeEntriesKey(tenantId: number): readonly unknown[] {
  return ['time-entries', tenantId]
}

/**
 * @param tenantId the tenant
 * @param owner whose times
 * @param from the first day
 * @param to the last day
 * @returns key of one sheet
 */
export function timeSheetKey(
  tenantId: number,
  owner: SheetOwner,
  from: string,
  to: string,
): readonly unknown[] {
  return [...timeEntriesKey(tenantId), 'sheet', owner, from, to]
}

/**
 * @param tenantId the tenant
 * @returns key of the chips «Zuletzt»
 */
export function recentTargetsKey(tenantId: number): readonly unknown[] {
  return [...timeEntriesKey(tenantId), 'recent']
}

/**
 * @param tenantId the tenant
 * @param target the project or customer, `null` for internal time
 * @returns key of the suggested service for that target
 */
export function defaultServiceKey(
  tenantId: number,
  target: TimeTargetChoice | null,
): readonly unknown[] {
  return [...timeEntriesKey(tenantId), 'default-service', target === null ? 'internal' : targetKey(target)]
}

/**
 * @param tenantId the tenant
 * @returns key the lookups start with; a time entry changes none of them
 */
export function timeLookupsKey(tenantId: number): readonly unknown[] {
  return ['time-lookups', tenantId]
}

/**
 * One key for «Zeiten von …» and the filter «Mitarbeitende» of the evaluation, so both read the
 * same answer.
 *
 * @param tenantId the tenant
 * @returns key of everybody whose times can be looked at
 */
export function colleaguesKey(tenantId: number): readonly unknown[] {
  return [...timeLookupsKey(tenantId), 'colleagues']
}

/**
 * Key of what the terms of the projects decide.
 *
 * <p>Apart from {@link timeEntriesKey}: an entry changes no terms. A change of the terms
 * refreshes the terms and the default of «verrechenbar» together, because the default follows
 * the billing mode.
 *
 * @param tenantId the tenant
 * @returns key the terms and the defaults of «verrechenbar» start with
 */
export function timeTermsKey(tenantId: number): readonly unknown[] {
  return ['time-terms', tenantId]
}

/**
 * @param tenantId the tenant
 * @param target the project or customer, `null` for internal time
 * @returns key of the default of «verrechenbar» for that target
 */
export function billableDefaultKey(
  tenantId: number,
  target: TimeTargetChoice | null,
): readonly unknown[] {
  return [...timeTermsKey(tenantId), 'default-billable', target === null ? 'internal' : targetKey(target)]
}

// --- words -------------------------------------------------------------------------

const PROJECT_GONE = 'Projekt nicht mehr vorhanden'
const CUSTOMER_GONE = 'Kunde nicht mehr vorhanden'
const SERVICE_GONE = 'Leistung nicht mehr vorhanden'

/**
 * @param target a project or a customer
 * @returns a key that tells two targets apart, a project and a customer with the same id too
 */
export function targetKey(target: TimeTargetChoice): string {
  return target.kind === 'PROJECT' ? `project-${target.projectId}` : `customer-${target.partnerId}`
}

/**
 * @param first a target, `null` for internal time
 * @param second another one
 * @returns true when both name the same project, the same customer, or both are internal
 */
export function sameTarget(first: TimeTargetChoice | null, second: TimeTargetChoice | null): boolean {
  if (first === null || second === null) return first === second
  return targetKey(first) === targetKey(second)
}

/**
 * How a chosen target stands in the field «Projekt oder Kunde».
 *
 * <p>A customer carries «(ohne Projekt)» only while there are projects to tell it from.
 *
 * @param target the project or customer taken from the list
 * @param projectsOn whether the tenant runs the projects
 * @returns «P-00012 Website · Muster AG», «Muster AG (ohne Projekt)», or «Muster AG» with the
 *          projects off
 */
export function targetLabel(target: TimeTargetChoice, projectsOn: boolean): string {
  if (target.kind === 'PROJECT') {
    return projectText(target.projectNumber, target.projectName, target.customerName)
  }
  const name = target.customerName ?? CUSTOMER_GONE
  return projectsOn ? `${name} (ohne Projekt)` : name
}

/**
 * What an entry was worked on, for its row in the list.
 *
 * @param entry the entry
 * @returns «P-00012 Website · Muster AG», «Muster AG», or «intern» without project and customer;
 *          a project or customer that is gone is named as such
 */
export function entryTargetText(entry: TimeEntry): string {
  if (entry.projectId != null) {
    return projectText(entry.projectNumber, entry.projectName, entry.customerName ?? CUSTOMER_GONE)
  }
  if (entry.partnerId != null) return entry.customerName ?? CUSTOMER_GONE
  return 'intern'
}

/**
 * @param entry the entry
 * @returns the name of its service, «—» without one, or that it is gone
 */
export function entryServiceText(entry: TimeEntry): string {
  if (entry.productId == null) return '—'
  return entry.serviceName ?? SERVICE_GONE
}

/**
 * What a chip «Zuletzt» says, and the running stopwatch the same way.
 *
 * @param recent one combination recorded on lately, or the stopwatch
 * @returns «P-00012 Website · Konzeption», «Muster AG · Support», «intern» or
 *          «intern · Administration»
 */
export function recentTargetLabel(recent: TimeRecentTarget): string {
  const head =
    recent.projectId != null
      ? [recent.projectNumber, recent.projectName].filter(Boolean).join(' ') || PROJECT_GONE
      : recent.partnerId != null
        ? (recent.customerName ?? CUSTOMER_GONE)
        : 'intern'
  return recent.serviceName ? `${head} · ${recent.serviceName}` : head
}

/**
 * @param entry the entry
 * @returns «08:00–10:30», «22:00–24:00» for a range up to midnight, empty without a range
 */
export function timeRangeText(entry: TimeEntry): string {
  if (!entry.startTime || !entry.endTime) return ''
  return `${entry.startTime}–${endOfRange(entry.endTime)}`
}

/**
 * What stands in the duration field when an entry is opened: what was typed, as near as the
 * entry tells it.
 *
 * @param entry the entry
 * @returns «08:00-10:30» for a range, «1:30» for minutes alone
 */
export function durationFieldOf(entry: TimeEntry): string {
  if (entry.startTime && entry.endTime) return `${entry.startTime}-${endOfRange(entry.endTime)}`
  return formatDurationShort(entry.durationMinutes)
}

/**
 * A total of time in the week bar and over the day list: a day, or the whole week.
 *
 * <p>No minute reads «–», whatever the day — past, today or after today, weekday or weekend. A
 * row of «0:00» teaches the eye to read past it; that an empty working day stands out is the
 * day target's job, where a tenant switches it on (#142, frontend ADR-0092).
 *
 * @param minutes the total as the backend sent it
 * @returns «7:45», «42:30» for a week, or «–» for none
 */
export function totalText(minutes: number): string {
  return minutes === 0 ? '–' : formatDurationShort(minutes)
}

/**
 * The day a step of whole weeks lands on: the same weekday, but never after today.
 *
 * @param day the day chosen now
 * @param weeks how many weeks on, negative for back
 * @param today the day it is
 * @returns the day to choose next
 */
export function weekStep(day: string, weeks: number, today: string): string {
  const next = addDays(day, 7 * weeks)
  return next > today ? today : next
}

/**
 * @param day a day of the week on screen
 * @param today the day it is
 * @returns whether the next week has a day that is not in the future
 */
export function hasLaterWeek(day: string, today: string): boolean {
  return addDays(mondayOf(day), 7) <= today
}

function projectText(
  number: string | null | undefined,
  name: string | null | undefined,
  customerName: string | null | undefined,
): string {
  const project = [number, name].filter(Boolean).join(' ') || PROJECT_GONE
  return customerName ? `${project} · ${customerName}` : project
}

/** The backend writes midnight at the end of the day as 00:00; a list says 24:00. */
function endOfRange(endTime: string): string {
  return endTime === '00:00' ? '24:00' : endTime
}

// --- the quick line ----------------------------------------------------------------

/**
 * What the quick line and the stopwatch field both hold: on what and for whom the time is, as it
 * lives in the browser — what stands in each field, and what was taken over from a list.
 */
export type AssignmentForm = {
  /** What stands in the field «Projekt oder Kunde». */
  targetTerm: string
  /** The project or customer taken from the list; `null` for internal time or while typing. */
  target: TimeTargetChoice | null
  /** What stands in the field «Leistung». */
  serviceTerm: string
  service: TimeServiceChoice | null
  /** True once the service was chosen by hand, so a suggestion no longer replaces it. */
  servicePicked: boolean
  description: string
  /** `null` while the box follows the default: with a customer yes, without no. */
  billable: boolean | null
}

/** The quick line: what an entry is for, and how long it took. */
export type TimeEntryForm = AssignmentForm & {
  /** The duration as typed: «1:30», «90m», «9-10:30». */
  duration: string
}

/** The fields of the quick line a message can stand at. */
export type TimeEntryLineField = 'target' | 'service' | 'duration' | 'description'

/** Which field of the request each field of the line answers for (backend ADR-0132). */
const LINE_FIELDS: Record<TimeEntryLineField, readonly string[]> = {
  target: ['projectId', 'partnerId'],
  service: ['productId'],
  duration: ['durationMinutes', 'startTime', 'endTime'],
  description: ['description'],
}

/**
 * @returns the line for a new entry: nothing chosen, nothing typed
 */
export function emptyTimeEntryForm(): TimeEntryForm {
  return {
    targetTerm: '',
    target: null,
    serviceTerm: '',
    service: null,
    servicePicked: false,
    duration: '',
    description: '',
    billable: null,
  }
}

/**
 * The line filled in with a stored entry, to change it in the same form it was recorded in.
 *
 * @param entry the entry as the backend sent it
 * @param projectsOn whether the tenant runs the projects
 * @returns the line; «verrechenbar» stands as the entry has it
 */
export function toTimeEntryForm(entry: TimeEntry, projectsOn: boolean): TimeEntryForm {
  return { ...assignmentFormOf(entry, projectsOn), duration: durationFieldOf(entry) }
}

/**
 * Typing into the field «Projekt oder Kunde» gives the chosen target up, so the field never
 * shows one name while the line holds another. «verrechenbar» goes back to its default.
 *
 * @param form the line or the stopwatch field
 * @param term what stands in the field now
 * @returns the changed form
 */
export function withTargetTerm<F extends AssignmentForm>(form: F, term: string): F {
  if (form.target === null) return { ...form, targetTerm: term }
  return { ...form, targetTerm: term, target: null, billable: null }
}

/**
 * Takes a project or customer over from the list. «verrechenbar» follows the new target.
 *
 * @param form the line or the stopwatch field
 * @param target what was taken
 * @param projectsOn whether the tenant runs the projects
 * @returns the changed form
 */
export function withTarget<F extends AssignmentForm>(
  form: F,
  target: TimeTargetChoice,
  projectsOn: boolean,
): F {
  return { ...form, target, targetTerm: targetLabel(target, projectsOn), billable: null }
}

/**
 * Typing into the field «Leistung» gives the chosen service up and counts as a choice by hand.
 *
 * @param form the line or the stopwatch field
 * @param term what stands in the field now
 * @returns the changed form
 */
export function withServiceTerm<F extends AssignmentForm>(form: F, term: string): F {
  return { ...form, serviceTerm: term, service: null, servicePicked: true }
}

/**
 * Takes a service over from the list, by hand.
 *
 * @param form the line or the stopwatch field
 * @param service what was taken
 * @returns the changed form
 */
export function withService<F extends AssignmentForm>(form: F, service: TimeServiceChoice): F {
  return { ...form, service, serviceTerm: service.name, servicePicked: true }
}

/**
 * Puts the service the server suggests for a target into the line.
 *
 * <p>Only while the line still names that target, and only over a service that was not chosen
 * by hand: the answer arrives after the click, and a choice made in between wins.
 *
 * @param form the line or the stopwatch field as it stands when the answer arrives
 * @param target the target the suggestion was asked for
 * @param service the suggestion, `null` where there is none
 * @returns the form, with the suggestion where it applies
 */
export function withSuggestedService<F extends AssignmentForm>(
  form: F,
  target: TimeTargetChoice | null,
  service: TimeServiceChoice | null,
): F {
  if (service === null || form.servicePicked || !sameTarget(form.target, target)) return form
  return { ...form, service, serviceTerm: service.name }
}

/**
 * Fills the line from a chip «Zuletzt»: project or customer and service, as recorded lately.
 *
 * @param form the line or the stopwatch field
 * @param recent the chip
 * @param projectsOn whether the tenant runs the projects
 * @returns the form with target and service of the chip; duration, start and text stay
 */
export function withRecentTarget<F extends AssignmentForm>(
  form: F,
  recent: TimeRecentTarget,
  projectsOn: boolean,
): F {
  const target = targetOf(recent)
  const service = serviceOf(recent)
  return {
    ...form,
    target,
    targetTerm: target === null ? '' : targetLabel(target, projectsOn),
    service,
    serviceTerm: service?.name ?? '',
    servicePicked: service !== null,
    billable: null,
  }
}

/**
 * The line after an entry was saved: project or customer and service stay for the next entry,
 * duration and text are emptied, and «verrechenbar» goes back to its default.
 *
 * @param form the line that was saved
 * @returns the line for the next entry
 */
export function nextEntryForm(form: TimeEntryForm): TimeEntryForm {
  return { ...form, duration: '', description: '', billable: null, servicePicked: false }
}

/**
 * What the box «verrechenbar» shows.
 *
 * @param form the line or the stopwatch field
 * @param rule the default of the server for the target (`lookups/default-billable`); absent
 *   while it is on its way or could not be read
 * @returns false without project or customer — internal time is never billed —, otherwise what
 *          was ticked or the entry holds, else the default of the server: by the billing mode of
 *          the project, yes for a customer. Yes while that default is not known yet
 */
export function effectiveBillable(form: AssignmentForm, rule?: TimeBillableDefault): boolean {
  if (form.target === null) return false
  return form.billable ?? rule?.billable ?? true
}

/**
 * Whether the box «verrechenbar» is locked.
 *
 * <p>A lock means «cannot be switched on». A box that shows yes on a project that is no longer
 * billed — an entry billable before its project was set to «Nicht verrechenbar» — may still be
 * switched off, because the server lets that entry keep its yes (backend ADR-0162).
 *
 * @param form the line or the stopwatch field
 * @param rule the default of the server for the target, absent while unknown
 * @returns true for internal time, and where the server locks the target and the box shows no
 */
export function billableLocked(form: AssignmentForm, rule?: TimeBillableDefault): boolean {
  if (form.target === null) return true
  return rule?.locked === true && !effectiveBillable(form, rule)
}

/**
 * The tooltip of the box «verrechenbar»: why it is locked, or what its default follows.
 *
 * <p>Internal time says it in its own words: the rule is fixed (backend ADR-0160), the screen
 * asks no server for it, and without projects there is no project to name.
 *
 * @param form the line or the stopwatch field
 * @param rule the default of the server for the target, absent while unknown
 * @param projectsOn whether the tenant runs the projects
 * @returns the reason of the server for a locked target, otherwise a sentence about the billing
 *          mode of the project, about the customer, or about internal time
 */
export function billableTooltip(
  form: AssignmentForm,
  rule: TimeBillableDefault | undefined,
  projectsOn: boolean,
): string {
  if (form.target === null) {
    return projectsOn
      ? 'Ohne Projekt oder Kunde ist eine Zeit intern und nie verrechenbar.'
      : 'Ohne Kunde ist eine Zeit intern und nie verrechenbar.'
  }
  if (rule?.locked && rule.lockedReason) return rule.lockedReason
  if (rule?.billingMode === 'FIXED_PRICE') {
    return `Pauschal abgerechnet: verrechenbar nur für Zusatzaufwand ausserhalb der Pauschale. ${NEEDS_SERVICE}`
  }
  if (rule?.billingMode === 'BY_EFFORT') {
    return `Nach Aufwand abgerechnet: jede Stunde ist verrechenbar. ${NEEDS_SERVICE}`
  }
  return `Mit Kunde ist eine Zeit verrechenbar, ohne Kunde nie. ${NEEDS_SERVICE}`
}

const NEEDS_SERVICE = 'Verrechenbar braucht eine Leistung.'

/**
 * What a change says about «verrechenbar»: what the box shows where that is known.
 *
 * <p>`null` only where the box follows a default the screen does not know yet — the target was
 * chosen anew and its default is on its way. The server then takes the same default the box is
 * about to show, instead of the browser guessing yes (backend ADR-0162).
 */
function changedBillable(form: AssignmentForm, rule?: TimeBillableDefault): boolean | null {
  if (form.target === null) return false
  return form.billable ?? rule?.billable ?? null
}

/**
 * @param form the line for a new entry
 * @returns true once a duration or a text is typed, which an Escape would throw away; project
 *          and service alone are quickly chosen again
 */
export function hasLineInput(form: TimeEntryForm): boolean {
  return form.duration.trim() !== '' || form.description.trim() !== ''
}

/**
 * @param form the line as it stands
 * @param initial the line as the entry was opened
 * @returns true when saving would change something
 */
export function formChanged(form: TimeEntryForm, initial: TimeEntryForm): boolean {
  return snapshotOf(form) !== snapshotOf(initial)
}

/**
 * What is wrong with the line, in the words the user reads, by the field of the request it is
 * about (`durationMinutes`, `projectId`, `productId`).
 *
 * <p>The same rules the backend keeps where it can say them sooner, and one it cannot see: a
 * name typed into a list field and never taken over. Sent anyway, the hour would become internal
 * time without anybody deciding so.
 *
 * @param form the line as filled in
 * @param rule the default of «verrechenbar» for the target, absent while unknown: a fixed price
 *   project asks no service while the box follows its no
 * @returns the complaints, empty when the line can be sent
 */
export function timeEntryComplaints(form: TimeEntryForm, rule?: TimeBillableDefault): FieldErrors {
  const complaints: Record<string, string> = {}
  const reading = readDuration(form.duration)
  if (reading.state === 'empty') complaints.durationMinutes = 'Eine Dauer eingeben, zum Beispiel 1:30.'
  if (reading.state === 'refused') complaints.durationMinutes = reading.message
  return { ...complaints, ...assignmentComplaints(form, true, rule) }
}

/**
 * The messages of the line, by its fields: those of the line itself and those the backend
 * named a field of the request for.
 *
 * @param errors the messages by field of the request
 * @returns the first message for each field of the line
 */
export function lineErrors(errors: FieldErrors): Partial<Record<TimeEntryLineField, string>> {
  return errorsByField(errors, LINE_FIELDS)
}

/**
 * @param error what a request of the line threw
 * @returns true when every message of it stands at a field of the line, so a notice above the
 *          line would only repeat it
 */
export function isToldByLine(error: unknown): boolean {
  return isToldByFields(error, Object.values(LINE_FIELDS).flat())
}

/**
 * What the line sends.
 *
 * <p>A range goes as `startTime` and `endTime`, a duration as `durationMinutes`; never both, so
 * they cannot disagree. A new entry leaves «verrechenbar» to the server while nobody touched the
 * box; a change says what the box shows, because the entry has a value already — except where
 * the target was chosen anew and its default is not known yet: then the server takes it.
 *
 * @param form the line, already free of complaints
 * @param duration what the duration field was read as
 * @param workDate the day, `yyyy-MM-dd`
 * @param lockVersion the state of the entry a change was made to; absent for a new entry
 * @param rule the default of «verrechenbar» for the target of a change, absent while unknown
 * @returns the request body
 */
export function toTimeEntryRequest(
  form: TimeEntryForm,
  duration: Duration,
  workDate: string,
  lockVersion?: number,
  rule?: TimeBillableDefault,
): TimeEntryRequest {
  const description = form.description.trim()
  const request: TimeEntryRequest = {
    workDate,
    durationMinutes: duration.startTime === undefined ? duration.minutes : null,
    startTime: duration.startTime ?? null,
    endTime: duration.endTime ?? null,
    projectId: form.target?.kind === 'PROJECT' ? (form.target.projectId ?? null) : null,
    partnerId: form.target?.kind === 'CUSTOMER' ? form.target.partnerId : null,
    productId: form.service?.productId ?? null,
    description: description === '' ? null : description,
    billable: form.target === null ? null : form.billable,
  }
  if (lockVersion === undefined) return request
  return { ...request, billable: changedBillable(form, rule), lockVersion }
}

// --- the stopwatch -----------------------------------------------------------------

/**
 * @param tenantId the tenant
 * @returns address of one's own stopwatch: read, start, change and discard. There is no address
 *          for somebody else's — what a colleague does right now is nobody's business
 *          (backend ADR-0161)
 */
export function timerUrl(tenantId: number): string {
  return `${timeEntriesUrl(tenantId)}/mine/timer`
}

/**
 * @param tenantId the tenant
 * @returns address that stops one's own stopwatch and writes its entries
 */
export function timerStopUrl(tenantId: number): string {
  return `${timerUrl(tenantId)}/stop`
}

/**
 * «Fortsetzen»: the stopwatch starts on what an own entry was worked on.
 *
 * @param tenantId the tenant
 * @param entryId an own entry
 * @returns address of that start
 */
export function continueEntryUrl(tenantId: number, entryId: number): string {
  return `${timeEntriesUrl(tenantId)}/mine/${entryId}/continue`
}

/**
 * Key of the running stopwatch.
 *
 * <p>Apart from {@link timeEntriesKey} on purpose: changing an entry leaves the stopwatch alone,
 * while every start, stop and discard refreshes the entries as well.
 *
 * @param tenantId the tenant
 * @returns key of one's own stopwatch
 */
export function timerKey(tenantId: number): readonly unknown[] {
  return ['time-timer', tenantId]
}

const MINUTE_MILLISECONDS = 60_000

/**
 * How long the stopwatch runs, as its button shows it.
 *
 * <p>Counted in the browser from `startedAt`, so the button needs no request to go on counting
 * (backend ADR-0161). Real seconds, like the stop: on the day the clocks change, 01:30 to 03:30
 * reads one hour, as it is written.
 *
 * @param startedAt the start, an ISO instant to the second
 * @param now the moment, in milliseconds since the epoch
 * @returns the whole minutes since the start, rounded down; 0 before the start — a browser clock
 *          behind the server's — and for a start that cannot be read
 */
export function minutesSince(startedAt: string, now: number): number {
  const start = Date.parse(startedAt)
  if (Number.isNaN(start) || now <= start) return 0
  return Math.floor((now - start) / MINUTE_MILLISECONDS)
}

/**
 * When the count of a stopwatch goes up next. The start is to the second, so the minutes turn
 * over at the second of the start and not at the full minute of the clock.
 *
 * @param startedAt the start, an ISO instant
 * @param now the moment, in milliseconds since the epoch
 * @returns milliseconds until the next whole minute since the start, 1 to 60’000; before the
 *          start, until the first one; a full minute for a start that cannot be read
 */
export function msUntilNextMinute(startedAt: string, now: number): number {
  const start = Date.parse(startedAt)
  if (Number.isNaN(start)) return MINUTE_MILLISECONDS
  if (now < start) return start - now + MINUTE_MILLISECONDS
  return MINUTE_MILLISECONDS - ((now - start) % MINUTE_MILLISECONDS)
}

/**
 * Where the line around the running stopwatch button stands, as the delay of its animation.
 *
 * <p>The line takes a minute for one round and is full exactly when the minute on the button
 * turns over — at the second of the start, like {@link msUntilNextMinute}. A negative delay
 * starts the animation that far into its round; the browser then runs it on its own, with no
 * rendering per second (#133).
 *
 * @param startedAt the start, an ISO instant
 * @param now the moment, in milliseconds since the epoch
 * @returns a CSS time such as «-25s» or «-25.4s»; «0s» on a whole minute since the start, before
 *          the start — a browser clock behind the server's — and for a start that cannot be read
 */
export function timerSweepDelay(startedAt: string, now: number): string {
  const start = Date.parse(startedAt)
  if (Number.isNaN(start) || now <= start) return '0s'
  const intoMinute = (now - start) % MINUTE_MILLISECONDS
  return intoMinute === 0 ? '0s' : `-${intoMinute / 1000}s`
}

/**
 * What the running stopwatch says on its button: the time and what it runs on, the way a chip
 * «Zuletzt» names it.
 *
 * @param timer the running stopwatch
 * @param minutes how long it runs
 * @returns «0:42 · P-00012 Website · Konzeption», «1:05 · intern»
 */
export function timerText(timer: RunningTimer, minutes: number): string {
  return `${formatDurationShort(minutes)} · ${recentTargetLabel(timer)}`
}

/**
 * The title of the browser tab while the stopwatch runs, so the time can be read from any tab.
 *
 * @param minutes how long it runs
 * @param title the title the tab had before, which comes back with the stop
 * @returns «▶ 0:42 · webux ERP»
 */
export function timerTabTitle(minutes: number, title: string): string {
  return `▶ ${formatDurationShort(minutes)} · ${title}`
}

/**
 * Since when the stopwatch runs, for the head of its field.
 *
 * @param startedAt the start, an ISO instant
 * @param today the day it is, `yyyy-MM-dd`
 * @returns «Läuft seit 09:15», on an earlier day «Läuft seit 24.11.2026, 09:15»
 */
export function timerSinceText(startedAt: string, today: string): string {
  if (localDateOf(startedAt) === today) return `Läuft seit ${localTimeOf(startedAt)}`
  return `Läuft seit ${formatDateTime(startedAt)}`
}

/**
 * @param instant an ISO instant
 * @returns its day as the clock of this browser reads it, `yyyy-MM-dd`
 */
export function localDateOf(instant: string): string {
  return toIsoDate(new Date(instant))
}

/**
 * @param instant an ISO instant
 * @returns its time of day as the clock of this browser reads it, `HH:mm`; the seconds go
 */
export function localTimeOf(instant: string): string {
  const moment = new Date(instant)
  return `${twoDigits(moment.getHours())}:${twoDigits(moment.getMinutes())}`
}

/**
 * A day and a time of day as somebody typed them, as the instant the backend takes.
 *
 * <p>Read on the clock of this browser: the time people type is the one they see. On the minute,
 * because that is what a field of hours and minutes says.
 *
 * @param date the day, `yyyy-MM-dd`
 * @param time the time of day, `HH:mm` or `H:mm`
 * @returns the ISO instant; `null` while day or time is incomplete, or for a day or time that
 *          does not exist, such as 31 February or 24:00
 */
export function instantOf(date: string, time: string): string | null {
  if (!isCompleteIsoDate(date)) return null
  const clock = /^(\d{1,2}):(\d{2})$/.exec(time.trim())
  if (clock === null) return null
  const [year, month, day] = date.split('-').map(Number)
  const hours = Number(clock[1])
  const minutes = Number(clock[2])
  if (hours > 23 || minutes > 59) return null
  const moment = new Date(year, month - 1, day, hours, minutes)
  if (moment.getMonth() !== month - 1 || moment.getDate() !== day) return null
  return moment.toISOString()
}

/**
 * The stopwatch field: what the stopwatch runs on, its start, and the real end of one that ran
 * long.
 */
export type TimerForm = AssignmentForm & {
  /** Day of the start, `yyyy-MM-dd`; empty while nothing runs. */
  startDate: string
  /** Time of the start, `HH:mm`; empty while nothing runs. */
  startTime: string
  /** Day of the real end, set to the day of the start. */
  endDate: string
  /** Time of the real end; empty stops now. */
  endTime: string
}

/** What the stopwatch field is asked to do: start one, change the running one, or stop it. */
export type TimerIntent = 'start' | 'change' | 'stop'

/** The fields of the stopwatch field a message can stand at. */
export type TimerField = 'target' | 'service' | 'description' | 'start' | 'end'

/** Which field of the request each field of the stopwatch answers for (backend ADR-0132). */
const TIMER_FIELDS: Record<TimerField, readonly string[]> = {
  target: ['projectId', 'partnerId'],
  service: ['productId'],
  description: ['description'],
  start: ['startedAt'],
  end: ['correctedEnd'],
}

/**
 * @returns the field for a new start: nothing chosen, nothing typed
 */
export function emptyTimerForm(): TimerForm {
  return {
    targetTerm: '',
    target: null,
    serviceTerm: '',
    service: null,
    servicePicked: false,
    description: '',
    billable: null,
    startDate: '',
    startTime: '',
    endDate: '',
    endTime: '',
  }
}

/**
 * The field filled in with the running stopwatch, to change or stop it.
 *
 * @param timer the stopwatch as the backend sent it
 * @param projectsOn whether the tenant runs the projects
 * @returns the field; the start on the minute as this browser's clock reads it, the real end
 *          empty on the day of the start
 */
export function toTimerForm(timer: RunningTimer, projectsOn: boolean): TimerForm {
  const startDate = localDateOf(timer.startedAt)
  return {
    ...assignmentFormOf(timer, projectsOn),
    startDate,
    startTime: localTimeOf(timer.startedAt),
    endDate: startDate,
    endTime: '',
  }
}

/**
 * What starts the stopwatch.
 *
 * <p>Only what was chosen goes out, so `{}` starts it on internal time. «verrechenbar» goes out
 * only where somebody ticked the box: otherwise the server keeps its default, which from #126 on
 * follows the project.
 *
 * @param form the field, already free of complaints
 * @returns the request body; never a field the backend does not know
 */
export function toTimerRequest(form: AssignmentForm): TimerRequest {
  const description = form.description.trim()
  const projectId = form.target?.kind === 'PROJECT' ? form.target.projectId : null
  return {
    ...(projectId != null ? { projectId } : {}),
    ...(form.target?.kind === 'CUSTOMER' ? { partnerId: form.target.partnerId } : {}),
    ...(form.service !== null ? { productId: form.service.productId } : {}),
    ...(description !== '' ? { description } : {}),
    ...(form.target !== null && form.billable !== null ? { billable: form.billable } : {}),
  }
}

/**
 * What changes the running stopwatch.
 *
 * <p>Everything it runs on goes out, because a field left out is cleared; «verrechenbar» says
 * what the box shows. Only on a target chosen anew whose default is not known yet it stays out,
 * and the server takes that default. The start goes out only where it was changed, and then on
 * the minute: left out, the server keeps it to the second.
 *
 * @param form the field, already free of complaints
 * @param initial the field as the stopwatch was read
 * @param lockVersion the state of the stopwatch the change was made to
 * @param rule the default of «verrechenbar» for the target, absent while unknown
 * @returns the request body
 */
export function toTimerChangeRequest(
  form: TimerForm,
  initial: TimerForm,
  lockVersion: number,
  rule?: TimeBillableDefault,
): TimerChangeRequest {
  const startedAt = startChanged(form, initial) ? instantOf(form.startDate, form.startTime) : null
  const billable = changedBillable(form, rule)
  return {
    ...toTimerRequest(form),
    ...(billable !== null ? { billable } : {}),
    ...(startedAt !== null ? { startedAt } : {}),
    lockVersion,
  }
}

/**
 * What goes with a stop.
 *
 * @param form the field
 * @returns the real end where a time was typed; otherwise nothing, and the stopwatch stops now
 */
export function toTimerStopRequest(form: TimerForm): TimerStopRequest {
  if (form.endTime.trim() === '') return {}
  const correctedEnd = instantOf(form.endDate, form.endTime)
  return correctedEnd === null ? {} : { correctedEnd }
}

/**
 * @param form the field as it stands
 * @param initial the field as the stopwatch was read, or empty for a new start
 * @returns true when saving would change something; the real end is no change of the stopwatch
 */
export function timerChanged(form: TimerForm, initial: TimerForm): boolean {
  return assignmentSnapshot(form) !== assignmentSnapshot(initial) || startChanged(form, initial)
}

/**
 * What is wrong with the stopwatch field for what it is asked to do, by the field of the request.
 *
 * <p>A name typed and never taken over is refused for every step, as on the quick line. The
 * stopwatch may run billable without a service — whoever starts it because the phone rings knows
 * the service later (backend ADR-0161) —, so that is asked at the stop only, in the backend's
 * sentence. The start must be a whole moment; the real end only where a time was typed or the
 * backend requires one.
 *
 * @param form the field as filled in
 * @param intent the step asked for
 * @param endRequired true where the stopwatch ran more than 24 hours, as the backend said
 * @param rule the default of «verrechenbar» for the target, absent while unknown
 * @returns the complaints, empty when the step can be sent
 */
export function timerComplaints(
  form: TimerForm,
  intent: TimerIntent,
  endRequired: boolean,
  rule?: TimeBillableDefault,
): FieldErrors {
  const complaints = assignmentComplaints(form, intent === 'stop', rule)
  if (intent === 'start') return complaints
  if (instantOf(form.startDate, form.startTime) === null) {
    complaints.startedAt = 'Den Start mit Tag und Uhrzeit angeben.'
  }
  if (intent !== 'stop') return complaints
  const endTyped = form.endTime.trim() !== ''
  if (endTyped && instantOf(form.endDate, form.endTime) === null) {
    complaints.correctedEnd = 'Das Ende mit Tag und Uhrzeit angeben.'
  }
  if (!endTyped && endRequired) {
    complaints.correctedEnd = 'Die Stoppuhr läuft länger als 24 Stunden. Zum Anhalten das echte Ende angeben.'
  }
  return complaints
}

/**
 * The messages of the stopwatch field, by its fields: its own and those the backend named a
 * field of the request for.
 *
 * @param errors the messages by field of the request
 * @returns the first message for each field of the stopwatch
 */
export function timerErrors(errors: FieldErrors): Partial<Record<TimerField, string>> {
  return errorsByField(errors, TIMER_FIELDS)
}

/**
 * @param error what a request of the stopwatch threw
 * @param shown the fields on screen; start and end stand there only while a stopwatch runs
 * @returns true when every message of it stands at a shown field, so a notice above would only
 *          repeat it
 */
export function isToldByTimer(error: unknown, shown: readonly TimerField[]): boolean {
  return isToldByFields(error, shown.flatMap((field) => TIMER_FIELDS[field]))
}

/**
 * Whether a refusal says that the stopwatch ran more than 24 hours.
 *
 * <p>That 409 names the field of the real end (backend ADR-0161); the other ones — changed on
 * another device, the module switched off — name no field.
 *
 * @param error what a request threw
 * @returns true for that refusal only
 */
export function isTimerTooLong(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.status !== 409) return false
  return fieldErrorsOf(error).correctedEnd !== undefined
}

/**
 * What a stop wrote, in one sentence.
 *
 * @param entries the entries the backend wrote, the earliest first: one, or one per day
 * @param lead what the sentence starts with
 * @returns «Angehalten: 1 Std. 30 Min., P-00012 Website · Muster AG.»; over midnight «Angehalten
 *          und auf 2 Tage verteilt: 10 Min. am Montag, 23. November; 20 Min. am Dienstag, 24.
 *          November.»; «Angehalten.» without entries
 */
export function stoppedText(entries: readonly TimeEntry[], lead = 'Angehalten'): string {
  if (entries.length === 0) return `${lead}.`
  if (entries.length === 1) {
    return `${lead}: ${formatDuration(entries[0].durationMinutes)}, ${entryTargetText(entries[0])}.`
  }
  const days = entries.map(
    (entry) => `${formatDuration(entry.durationMinutes)} am ${dayTitle(entry.workDate)}`,
  )
  return `${lead} und auf ${entries.length} Tage verteilt: ${days.join('; ')}.`
}

/**
 * What a start or «Fortsetzen» did, in one or two sentences.
 *
 * @param start the answer of the backend
 * @returns «Stoppuhr läuft: P-00012 Website · Konzeption.», with what the stopwatch before was
 *          turned into; or that another device started one at the same moment
 */
export function startedText(start: TimerStart): string {
  const subject = recentTargetLabel(start.timer)
  if (!start.started) {
    return `Auf einem anderen Gerät wurde gleichzeitig eine Stoppuhr gestartet. Sie läuft: ${subject}.`
  }
  const running = `Stoppuhr läuft: ${subject}.`
  if (start.stoppedEntries.length === 0) return running
  return `${running} ${stoppedText(start.stoppedEntries, 'Vorige Stoppuhr angehalten')}`
}

/** What an entry and a chip «Zuletzt» both say about what the time was worked on. */
type Assignment = Pick<
  TimeRecentTarget,
  | 'projectId'
  | 'projectNumber'
  | 'projectName'
  | 'partnerId'
  | 'customerName'
  | 'productId'
  | 'productNumber'
  | 'serviceName'
>

/** Without a customer the time is internal; with a project the customer is the project's. */
function targetOf(source: Assignment): TimeTargetChoice | null {
  if (source.partnerId == null) return null
  if (source.projectId != null) {
    return {
      kind: 'PROJECT',
      projectId: source.projectId,
      projectNumber: source.projectNumber,
      projectName: source.projectName,
      partnerId: source.partnerId,
      customerName: source.customerName,
    }
  }
  return { kind: 'CUSTOMER', partnerId: source.partnerId, customerName: source.customerName }
}

function serviceOf(source: Assignment): TimeServiceChoice | null {
  if (source.productId == null) return null
  return {
    productId: source.productId,
    productNumber: source.productNumber,
    name: source.serviceName ?? SERVICE_GONE,
  }
}

/** The fields both forms share, filled in from an entry or from the running stopwatch. */
function assignmentFormOf(
  source: Assignment & { description?: string | null; billable: boolean },
  projectsOn: boolean,
): AssignmentForm {
  const target = targetOf(source)
  const service = serviceOf(source)
  return {
    targetTerm: target === null ? '' : targetLabel(target, projectsOn),
    target,
    serviceTerm: service?.name ?? '',
    service,
    servicePicked: service !== null,
    description: source.description ?? '',
    billable: source.billable,
  }
}

/**
 * A name typed into a list field and never taken over; and, where asked, billable without a
 * service — the backend's sentence word for word, so the same rule never says two things.
 */
function assignmentComplaints(
  form: AssignmentForm,
  askService: boolean,
  rule?: TimeBillableDefault,
): Record<string, string> {
  const complaints: Record<string, string> = {}
  if (form.target === null && form.targetTerm.trim() !== '') {
    complaints.projectId = 'Einen Treffer aus der Liste wählen oder das Feld leeren.'
  }
  if (form.service === null && form.serviceTerm.trim() !== '') {
    complaints.productId = 'Eine Leistung aus der Liste wählen oder das Feld leeren.'
  } else if (askService && form.service === null && effectiveBillable(form, rule)) {
    complaints.productId =
      'Verrechenbar braucht eine Leistung, sonst entsteht kein Preis. Leistung wählen oder «verrechenbar» ausschalten.'
  }
  return complaints
}

/** The first message for each field of a form, by the fields of the request it answers for. */
function errorsByField<K extends string>(
  errors: FieldErrors,
  fields: Record<K, readonly string[]>,
): Partial<Record<K, string>> {
  const result: Partial<Record<K, string>> = {}
  for (const [field, names] of Object.entries(fields) as [K, readonly string[]][]) {
    const message = names.map((name) => errors[name]).find((entry) => entry !== undefined)
    if (message !== undefined) result[field] = message
  }
  return result
}

/** What saving would send of the shared fields, without what only steers the form. */
function assignmentSnapshot(form: AssignmentForm): string {
  return JSON.stringify([
    form.targetTerm,
    form.target === null ? null : targetKey(form.target),
    form.serviceTerm,
    form.service?.productId ?? null,
    form.description.trim(),
    effectiveBillable(form),
  ])
}

/** What saving the line would send. */
function snapshotOf(form: TimeEntryForm): string {
  return JSON.stringify([assignmentSnapshot(form), form.duration.trim()])
}

function startChanged(form: TimerForm, initial: TimerForm): boolean {
  return form.startDate !== initial.startDate || form.startTime.trim() !== initial.startTime
}

function twoDigits(value: number): string {
  return String(value).padStart(2, '0')
}

// --- recording on a project ----------------------------------------------------------

/** The router state that opens «Meine Zeiten» with a target already in the quick line. */
export type RecordOnState = { recordOn: TimeTargetChoice }

/**
 * @param target the project or customer the quick line opens on
 * @returns the router state of the link to «Meine Zeiten»
 */
export function recordOnState(target: TimeTargetChoice): RecordOnState {
  return { recordOn: target }
}

/**
 * Reads back what «Meine Zeiten» was opened on — «Zeit erfassen» on a project.
 *
 * <p>Router state survives a reload and may stem from an older version of the application, so
 * every field is checked rather than trusted, the way the origin of a mask is.
 *
 * @param state the router state, `location.state`
 * @returns the target; `null` where the state names none, or one that cannot be read
 */
export function recordOnTargetOf(state: unknown): TimeTargetChoice | null {
  if (typeof state !== 'object' || state === null || !('recordOn' in state)) return null
  const target: unknown = state.recordOn
  if (typeof target !== 'object' || target === null) return null
  const kind: unknown = Reflect.get(target, 'kind')
  const projectId: unknown = Reflect.get(target, 'projectId')
  const partnerId: unknown = Reflect.get(target, 'partnerId')
  if (typeof partnerId !== 'number') return null
  const customerName = textOf(target, 'customerName')
  if (kind === 'PROJECT' && typeof projectId === 'number') {
    const projectNumber = textOf(target, 'projectNumber')
    const projectName = textOf(target, 'projectName')
    return { kind, projectId, projectNumber, projectName, partnerId, customerName }
  }
  if (kind === 'CUSTOMER') {
    return { kind, partnerId, partnerNumber: textOf(target, 'partnerNumber'), customerName }
  }
  return null
}

function textOf(source: object, key: string): string | null {
  const value: unknown = Reflect.get(source, key)
  return typeof value === 'string' ? value : null
}

/**
 * @param project a stored project
 * @returns the project as the quick line names it, with its customer
 */
export function projectTargetOf(project: Project): TimeTargetChoice {
  return {
    kind: 'PROJECT',
    projectId: project.id,
    projectNumber: project.projectNumber,
    projectName: project.name,
    partnerId: project.partnerId,
    customerName: project.customerName ?? null,
  }
}

/**
 * @param status where the project stands
 * @returns true while it takes new time: active only. An open one has not begun, a completed one
 *          keeps its open times billable; neither takes new ones (backend ADR-0160, ADR-0165)
 */
export function takesNewTime(status: ProjectStatus): boolean {
  return status === 'ACTIVE'
}

// --- the registers «Zeiten» ----------------------------------------------------------

/** Whose times a register shows: those of one project, or all of a customer's, with and without one. */
export type TimesOf = { kind: 'PROJECT'; projectId: number } | { kind: 'CUSTOMER'; partnerId: number }

/**
 * @param tenantId the tenant
 * @returns address the terms, the summaries and the defaults of the users start with
 */
export function timeTrackingUrl(tenantId: number): string {
  return `/api/tenants/${tenantId}/time-tracking`
}

/**
 * @param tenantId the tenant
 * @param of the project or the customer
 * @returns address of the minutes by state, over every user; needs `TIME_READ`
 */
export function timeSummaryUrl(tenantId: number, of: TimesOf): string {
  return of.kind === 'PROJECT'
    ? `${timeTrackingUrl(tenantId)}/projects/${of.projectId}/summary`
    : `${timeTrackingUrl(tenantId)}/customers/${of.partnerId}/summary`
}

/**
 * The entries of a project or a customer, of every user, one page at a time; the latest day
 * first, in the order the server keeps.
 *
 * @param tenantId the tenant
 * @param of the project or the customer
 * @param page zero based
 * @returns address of the page; needs `TIME_READ`
 */
export function timeEntryListUrl(tenantId: number, of: TimesOf, page: number): string {
  const filter = of.kind === 'PROJECT' ? { projectId: of.projectId } : { partnerId: of.partnerId }
  return `${timeEntriesUrl(tenantId)}?${listQuery({ ...filter, page, size: PAGE_SIZE })}`
}

/**
 * Under {@link timeEntriesKey}, so a recorded, changed or stopped entry refreshes the tiles.
 *
 * @param tenantId the tenant
 * @param of the project or the customer
 * @returns key of the summary
 */
export function timeSummaryKey(tenantId: number, of: TimesOf): readonly unknown[] {
  return [...timeEntriesKey(tenantId), 'summary', timesOfKey(of)]
}

/**
 * @param tenantId the tenant
 * @param of the project or the customer
 * @param page zero based
 * @returns key of one page of the list, under {@link timeEntriesKey} like the summary
 */
export function timeEntryListKey(tenantId: number, of: TimesOf, page: number): readonly unknown[] {
  return [...timeEntriesKey(tenantId), 'list', timesOfKey(of), page]
}

function timesOfKey(of: TimesOf): string {
  return of.kind === 'PROJECT' ? `project-${of.projectId}` : `customer-${of.partnerId}`
}

/** One tile of a register «Zeiten»: what it counts, its minutes and, where it says something, how many entries. */
export type TimeSummaryFigure = {
  label: string
  minutes: number
  entries?: number
}

/**
 * The five tiles, in the order the work runs through: everything, still to bill, on a draft,
 * billed, never billed. The last four add up to the first; the backend counts them.
 *
 * @param summary the summary as the backend sent it
 * @returns the tiles; the count of entries goes with «Total» and «Offen verrechenbar»
 */
export function timeSummaryFigures(summary: TimeSummary): TimeSummaryFigure[] {
  return [
    { label: 'Total', minutes: summary.totalMinutes, entries: summary.entries },
    { label: 'Offen verrechenbar', minutes: summary.openMinutes, entries: summary.openEntries },
    { label: 'Im Entwurf', minutes: summary.inDraftMinutes },
    { label: 'Verrechnet', minutes: summary.billedMinutes },
    { label: 'Nicht verrechenbar', minutes: summary.notBillableMinutes },
  ]
}

/**
 * @param minutes how long, not negative
 * @returns «42:30 Std.», «0:00 Std.»
 */
export function hoursText(minutes: number): string {
  return `${formatDurationShort(minutes)} Std.`
}

/**
 * @param count how many entries
 * @returns «1 Eintrag», «1’204 Einträge», «0 Einträge»
 */
export function entryCountText(count: number): string {
  return count === 1 ? '1 Eintrag' : `${formatCount(count)} Einträge`
}

/**
 * @param entry the entry
 * @returns the name of the person whose time it is, or that the tenant does not know them any more
 */
export function entryUserText(entry: TimeEntry): string {
  return entry.userName ?? 'Benutzer nicht mehr vorhanden'
}

/**
 * The project of an entry, for the column «Projekt» on the customer.
 *
 * @param entry the entry
 * @returns «P-00012 Website», «ohne Projekt», or that the project is gone
 */
export function entryProjectText(entry: TimeEntry): string {
  if (entry.projectId == null) return 'ohne Projekt'
  return [entry.projectNumber, entry.projectName].filter(Boolean).join(' ') || PROJECT_GONE
}

/**
 * The customer of an entry, for the column «Kunde» of the evaluation.
 *
 * @param entry the entry
 * @returns «Muster AG», «intern» without a customer, or that the customer is gone
 */
export function entryCustomerText(entry: TimeEntry): string {
  if (entry.partnerId == null) return 'intern'
  return entry.customerName ?? CUSTOMER_GONE
}

// --- the terms of a project ----------------------------------------------------------

/** The billing modes in the order the choice shows them. */
export const BILLING_MODES: readonly BillingMode[] = ['BY_EFFORT', 'FIXED_PRICE', 'NOT_BILLABLE']

/** What each billing mode is called (backend ADR-0162). */
export const BILLING_MODE_LABELS: Record<BillingMode, string> = {
  BY_EFFORT: 'Nach Aufwand',
  FIXED_PRICE: 'Pauschal',
  NOT_BILLABLE: 'Nicht verrechenbar',
}

/** What each billing mode means for new time, in the words of the choice. */
export const BILLING_MODE_HINTS: Record<BillingMode, string> = {
  BY_EFFORT: 'Jede Stunde wird verrechnet: neue Zeit ist verrechenbar.',
  FIXED_PRICE:
    'Der Preis ist pauschal vereinbart: neue Zeit ist nicht verrechenbar, ausser als Zusatzaufwand ausserhalb der Pauschale.',
  NOT_BILLABLE: 'Nichts auf diesem Projekt wird verrechnet: neue Zeit lässt sich nicht als verrechenbar erfassen.',
}

/**
 * Read with `TIME_READ` or `TIME_WRITE`, changed with `TIME_WRITE`.
 *
 * @param tenantId the tenant
 * @param projectId the project
 * @returns address of its billing mode and rate
 */
export function projectTermsUrl(tenantId: number, projectId: number): string {
  return `${timeTrackingUrl(tenantId)}/projects/${projectId}/terms`
}

/**
 * @param tenantId the tenant
 * @param projectId the project
 * @returns key of its terms, under {@link timeTermsKey}
 */
export function projectTermsKey(tenantId: number, projectId: number): readonly unknown[] {
  return [...timeTermsKey(tenantId), 'project', projectId]
}

/** The dialog «Abrechnung»: the mode, and the rate as typed. */
export type ProjectTermsForm = {
  billingMode: BillingMode
  /** As typed: «140», «140.00», «1’250.50»; empty for none. */
  hourlyRate: string
}

/**
 * @param terms the terms as the backend sent them
 * @returns the dialog filled in with them
 */
export function toProjectTermsForm(terms: ProjectTerms): ProjectTermsForm {
  return { billingMode: terms.billingMode, hourlyRate: rateFieldOf(terms.hourlyRate) }
}

/**
 * A rate as it stands in a field: two decimals, up to four where the rate has them.
 *
 * @param rate the rate, absent for none
 * @returns «140.00», «152.375», empty for none
 */
export function rateFieldOf(rate: number | null | undefined): string {
  if (rate === null || rate === undefined) return ''
  return rate.toFixed(4).replace(/(\.\d{2}\d*?)0+$/, '$1')
}

const RATE = new Intl.NumberFormat('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 4 })

/**
 * @param terms the terms as the backend sent them
 * @returns «140.00 CHF pro Stunde», «0.00 CHF pro Stunde», or «Preis der Leistung» without a rate
 */
export function hourlyRateText(terms: ProjectTerms): string {
  if (terms.hourlyRate === null || terms.hourlyRate === undefined) return 'Preis der Leistung'
  const currency = terms.currency ? ` ${terms.currency}` : ''
  return `${RATE.format(terms.hourlyRate)}${currency} pro Stunde`
}

/** The backend's sentence, word for word, so the same rule never says two things. */
const NEGATIVE_RATE = 'Der Projektsatz darf nicht negativ sein. Leer heisst: der Preis der Leistung gilt.'

/**
 * What is wrong with the dialog before it is sent, by the field of the request.
 *
 * <p>The rate is checked as far as the field can say: a number, and not below zero. Decimals and
 * size the backend checks, with its own sentence at the same field.
 *
 * @param form the dialog as filled in
 * @returns the complaints, empty when it can be sent
 */
export function projectTermsComplaints(form: ProjectTermsForm): FieldErrors {
  if (form.hourlyRate.trim() === '') return {}
  const rate = parseDecimal(form.hourlyRate)
  if (rate === null) {
    return { hourlyRate: 'Einen Betrag eingeben, zum Beispiel 140.00, oder leer lassen.' }
  }
  return rate < 0 ? { hourlyRate: NEGATIVE_RATE } : {}
}

/**
 * What the dialog sends.
 *
 * <p>`lockVersion` goes back exactly when the terms came with one: terms nobody saved have none,
 * and the server refuses one there (backend ADR-0162). No currency: the server sets it.
 *
 * @param form the dialog, already free of complaints
 * @param terms the terms the dialog was opened on
 * @returns the request body
 */
export function toProjectTermsRequest(form: ProjectTermsForm, terms: ProjectTerms): ProjectTermsRequest {
  const request: ProjectTermsRequest = {
    billingMode: form.billingMode,
    hourlyRate: parseDecimal(form.hourlyRate),
  }
  return terms.lockVersion === null || terms.lockVersion === undefined
    ? request
    : { ...request, lockVersion: terms.lockVersion }
}

/**
 * @param form the dialog as it stands
 * @param terms the terms it was opened on
 * @returns true when saving would change something; «140» for a rate of 140.00 changes nothing
 */
export function projectTermsChanged(form: ProjectTermsForm, terms: ProjectTerms): boolean {
  if (form.billingMode !== terms.billingMode) return true
  if (form.hourlyRate.trim() === '') return terms.hourlyRate != null
  const rate = parseDecimal(form.hourlyRate)
  // Something unreadable is typed: that is a change, and saving says what is wrong with it.
  return rate === null || rate !== (terms.hourlyRate ?? null)
}

/**
 * What saving the terms did, in one sentence.
 *
 * <p>A new billing mode applies to new time only. The entries already recorded keep their
 * «verrechenbar», and the sentence says how many open ones that concerns, so whoever wants them
 * otherwise changes them knowingly (backend ADR-0162).
 *
 * @param before the terms the dialog was opened on
 * @param after the terms as the backend stored them
 * @returns «Gespeichert.», after a new mode with the open billable entries that stay
 */
export function termsSavedText(before: ProjectTerms, after: ProjectTerms): string {
  if (before.billingMode === after.billingMode || after.openEntries === 0) return 'Gespeichert.'
  return `Gespeichert. Die Abrechnungsart gilt für neue Zeit: ${openEntriesStayText(after.openEntries)}`
}

/**
 * @param count how many open billable entries a new billing mode leaves as they are, at least one
 * @returns «1 offener verrechenbarer Eintrag bleibt, wie er ist.», «12 offene verrechenbare
 *          Einträge bleiben, wie sie sind.»
 */
export function openEntriesStayText(count: number): string {
  return count === 1
    ? '1 offener verrechenbarer Eintrag bleibt, wie er ist.'
    : `${formatCount(count)} offene verrechenbare Einträge bleiben, wie sie sind.`
}

// --- the default service of every user -----------------------------------------------

/**
 * @param tenantId the tenant
 * @returns address of every user with their default service; needs `TIME_WRITE`
 */
export function userDefaultsUrl(tenantId: number): string {
  return `${timeTrackingUrl(tenantId)}/user-defaults`
}

/**
 * @param tenantId the tenant
 * @param userId whose default
 * @returns address that sets it, or removes it with `productId: null`
 */
export function userDefaultUrl(tenantId: number, userId: number): string {
  return `${userDefaultsUrl(tenantId)}/${userId}`
}

/**
 * Apart from {@link timeEntriesKey}: an entry changes no default.
 *
 * @param tenantId the tenant
 * @returns key of the table «Standardleistung je Benutzer»
 */
export function userDefaultsKey(tenantId: number): readonly unknown[] {
  return ['time-user-defaults', tenantId]
}

/**
 * Where the default service of a user stands.
 *
 * - `NONE`: no default.
 * - `ACTIVE`: the quick line suggests it.
 * - `INACTIVE`: deactivated since; the quick line no longer suggests it.
 * - `GONE`: the product no longer exists.
 */
export type UserDefaultState = 'NONE' | 'ACTIVE' | 'INACTIVE' | 'GONE'

/**
 * @param row one row of the table as the backend sent it
 * @returns where its default stands
 */
export function userDefaultState(row: TimeUserDefault): UserDefaultState {
  if (row.productId == null) return 'NONE'
  if (row.serviceName == null) return 'GONE'
  return row.serviceActive ? 'ACTIVE' : 'INACTIVE'
}
