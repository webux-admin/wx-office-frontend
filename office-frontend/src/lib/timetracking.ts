import type { BadgeTone } from '../components/Badge'
import { ApiError } from './api'
import { formatDuration, formatDurationShort, readDuration, type Duration } from './duration'
import { fieldErrorsOf, isToldByFields, type FieldErrors } from './fieldErrors'
import { formatDateTime, isCompleteIsoDate, toIsoDate } from './format'
import { listQuery } from './paging'
import { addDays, dayTitle, isWeekend, mondayOf } from './week'
import type {
  RunningTimer,
  TimeEntry,
  TimeEntryRequest,
  TimeEntryState,
  TimeRecentTarget,
  TimeServiceChoice,
  TimeTargetChoice,
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
  NOT_BILLABLE: 'nicht verrechenbar',
}

/** Work still to be billed stands out; what is never billed steps back. */
export const TIME_ENTRY_STATE_TONES: Record<TimeEntryState, BadgeTone> = {
  OPEN: 'accent',
  NOT_BILLABLE: 'muted',
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
 * @param tenantId the tenant
 * @returns address of the chips «Zuletzt»; they exist for one's own times only
 */
export function recentTargetsUrl(tenantId: number): string {
  return `${timeEntriesUrl(tenantId)}/mine/recent`
}

/**
 * The service the server suggests for a target: the one taken on it last.
 *
 * @param tenantId the tenant
 * @param target the project or customer; `null` for internal time
 * @returns address of the suggestion, which answers 204 where there is none
 */
export function defaultServiceUrl(tenantId: number, target: TimeTargetChoice | null): string {
  const query =
    target === null
      ? ''
      : target.kind === 'PROJECT'
        ? listQuery({ projectId: target.projectId })
        : listQuery({ partnerId: target.partnerId })
  return `${timeEntriesUrl(tenantId)}/mine/default-service${query === '' ? '' : `?${query}`}`
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
 * @param tenantId the tenant
 * @param search part of a name or number, empty for the first ones
 * @returns address of the active services
 */
export function serviceLookupUrl(tenantId: number, search: string): string {
  return lookupUrl(tenantId, 'services', search)
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
 * The total of a day in the week bar.
 *
 * <p>An empty weekday reads «0:00» and stands out, an empty Saturday or Sunday reads «–»: a day
 * without a single hour is worth noticing on a Tuesday, not on a Sunday.
 *
 * @param day the day, `yyyy-MM-dd`
 * @param minutes its total as the backend sent it
 * @returns «7:45», «0:00», or «–» for an empty weekend day
 */
export function dayTotalText(day: string, minutes: number): string {
  if (minutes === 0 && isWeekend(day)) return '–'
  return formatDurationShort(minutes)
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
 * @returns false without project or customer — internal time is never billed —, otherwise what
 *          was ticked, or yes while nothing was
 */
export function effectiveBillable(form: AssignmentForm): boolean {
  if (form.target === null) return false
  return form.billable ?? true
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
 * @returns the complaints, empty when the line can be sent
 */
export function timeEntryComplaints(form: TimeEntryForm): FieldErrors {
  const complaints: Record<string, string> = {}
  const reading = readDuration(form.duration)
  if (reading.state === 'empty') complaints.durationMinutes = 'Eine Dauer eingeben, zum Beispiel 1:30.'
  if (reading.state === 'refused') complaints.durationMinutes = reading.message
  return { ...complaints, ...assignmentComplaints(form, true) }
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
 * box; a change always says it, because the entry has a value already.
 *
 * @param form the line, already free of complaints
 * @param duration what the duration field was read as
 * @param workDate the day, `yyyy-MM-dd`
 * @param lockVersion the state of the entry a change was made to; absent for a new entry
 * @returns the request body
 */
export function toTimeEntryRequest(
  form: TimeEntryForm,
  duration: Duration,
  workDate: string,
  lockVersion?: number,
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
  return { ...request, billable: effectiveBillable(form), lockVersion }
}

/**
 * A copy of an entry on another day, for «Auf heute kopieren».
 *
 * <p>The minutes go along, the range does not: the copy would claim a time of day nobody typed.
 *
 * @param entry the entry to copy
 * @param workDate the day of the copy, `yyyy-MM-dd`
 * @returns the request body of the new entry
 */
export function copyRequestOf(entry: TimeEntry, workDate: string): TimeEntryRequest {
  return {
    workDate,
    durationMinutes: entry.durationMinutes,
    startTime: null,
    endTime: null,
    projectId: entry.projectId ?? null,
    partnerId: entry.projectId != null ? null : (entry.partnerId ?? null),
    productId: entry.productId ?? null,
    description: entry.description ?? null,
    billable: entry.billable,
  }
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
 * <p>Everything it runs on goes out, because a field left out is cleared; «verrechenbar» always
 * says its value. The start goes out only where it was changed, and then on the minute: left
 * out, the server keeps it to the second.
 *
 * @param form the field, already free of complaints
 * @param initial the field as the stopwatch was read
 * @param lockVersion the state of the stopwatch the change was made to
 * @returns the request body
 */
export function toTimerChangeRequest(
  form: TimerForm,
  initial: TimerForm,
  lockVersion: number,
): TimerChangeRequest {
  const startedAt = startChanged(form, initial) ? instantOf(form.startDate, form.startTime) : null
  return {
    ...toTimerRequest(form),
    billable: effectiveBillable(form),
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
 * @returns the complaints, empty when the step can be sent
 */
export function timerComplaints(
  form: TimerForm,
  intent: TimerIntent,
  endRequired: boolean,
): FieldErrors {
  const complaints = assignmentComplaints(form, intent === 'stop')
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
function assignmentComplaints(form: AssignmentForm, askService: boolean): Record<string, string> {
  const complaints: Record<string, string> = {}
  if (form.target === null && form.targetTerm.trim() !== '') {
    complaints.projectId = 'Einen Treffer aus der Liste wählen oder das Feld leeren.'
  }
  if (form.service === null && form.serviceTerm.trim() !== '') {
    complaints.productId = 'Eine Leistung aus der Liste wählen oder das Feld leeren.'
  } else if (askService && form.service === null && effectiveBillable(form)) {
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
