import type { BadgeTone } from '../components/Badge'
import { listQuery } from './paging'
import type { Project, ProjectRequest, ProjectStatus } from './types'

/**
 * The project module: its addresses, its rights and the rules of its form.
 *
 * <p>Its own building block, the way `dunning.ts` is one: the list, the mask and the sidebar
 * read the same addresses, and a query key written twice is a cache that goes stale in one of
 * them.
 */

/** Name of the backend `LicensedModule` value. */
export const PROJECT_MODULE = 'PROJECT'

/** Path of the project list within the application. */
export const PROJECT_PATH = '/projekte'

/**
 * The two rights of the module.
 *
 * <p>Starting, completing and archiving a project come with `write`: none of these steps acts
 * towards the customer, so no third right separates them (backend ADR-0129).
 */
export const PROJECT_RIGHTS = {
  read: 'PROJECT_READ',
  write: 'PROJECT_WRITE',
} as const

/** What each status is called on screen, in the order a project runs through them. */
export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  OPEN: 'Offen',
  ACTIVE: 'Aktiv',
  COMPLETED: 'Abgeschlossen',
  ARCHIVED: 'Archiviert',
}

/** Work under way stands out, work put away steps back. */
export const PROJECT_STATUS_TONES: Record<ProjectStatus, BadgeTone> = {
  OPEN: 'neutral',
  ACTIVE: 'accent',
  COMPLETED: 'success',
  ARCHIVED: 'muted',
}

/**
 * Whether a value from a select is one of the four status codes.
 *
 * @param value what the select holds
 * @returns true for `OPEN`, `ACTIVE`, `COMPLETED` and `ARCHIVED`, false for anything else,
 *          the empty «Ohne Archiv» included
 */
export function isProjectStatus(value: string): value is ProjectStatus {
  return Object.hasOwn(PROJECT_STATUS_LABELS, value)
}

/** A step from one status to the next, as the backend `ProjectStatusStep` names it. */
export type ProjectStep = 'start' | 'complete' | 'reopen' | 'archive' | 'restore'

/** What the button of a step says. */
export const PROJECT_STEP_LABELS: Record<ProjectStep, string> = {
  start: 'Starten',
  complete: 'Abschliessen',
  reopen: 'Wieder öffnen',
  archive: 'Archivieren',
  restore: 'Aus dem Archiv holen',
}

/**
 * The steps the backend allows from each status, forward step first.
 *
 * <p>The same table as `ProjectStatusStep` of the backend, which keeps it anyway: a button for
 * a step it refuses would only end in a 409.
 */
const STEPS_FROM: Record<ProjectStatus, ProjectStep[]> = {
  OPEN: ['start'],
  ACTIVE: ['complete'],
  COMPLETED: ['archive', 'reopen'],
  ARCHIVED: ['restore'],
}

/**
 * @param status where the project stands
 * @returns the steps a project in that status can take, forward step first
 */
export function projectStepsFrom(status: ProjectStatus): ProjectStep[] {
  return STEPS_FROM[status]
}

/**
 * @param status where the project stands
 * @returns whether its details can be changed; an archived project is read only
 */
export function isProjectEditable(status: ProjectStatus): boolean {
  return status !== 'ARCHIVED'
}

/**
 * @param status where the project stands
 * @returns whether it can be deleted; only a project that never started can
 */
export function isProjectDeletable(status: ProjectStatus): boolean {
  return status === 'OPEN'
}

/** Longest name the backend takes. */
export const PROJECT_NAME_MAX_LENGTH = 120

/** Longest description the backend takes. */
export const PROJECT_DESCRIPTION_MAX_LENGTH = 4000

/**
 * @param tenantId the tenant
 * @returns address of the project list and of creating a project
 */
export function projectsUrl(tenantId: number): string {
  return `/api/tenants/${tenantId}/projects`
}

/**
 * @param tenantId the tenant
 * @param projectId the project
 * @returns address of one project
 */
export function projectUrl(tenantId: number, projectId: number | string): string {
  return `${projectsUrl(tenantId)}/${projectId}`
}

/**
 * @param tenantId the tenant
 * @param projectId the project
 * @param step the step to take
 * @returns address that moves the project one step on
 */
export function projectStepUrl(
  tenantId: number,
  projectId: number,
  step: ProjectStep,
): string {
  return `${projectUrl(tenantId, projectId)}/${step}`
}

/**
 * Every project of one customer, archived ones included: on the customer they are its history.
 *
 * @param tenantId the tenant
 * @param partnerId the customer
 * @param page zero based page
 * @param sort field and direction
 * @returns address of that page
 */
export function partnerProjectsUrl(
  tenantId: number,
  partnerId: number,
  page: number,
  sort: string,
): string {
  const query = listQuery({ partnerId, includeArchived: true, page, size: 10, sort })
  return `${projectsUrl(tenantId)}?${query}`
}

/**
 * The customers a project can be written for, narrowed by what was typed.
 *
 * <p>Asks the project module and not the partner module: whoever maintains projects needs no
 * partner right to fill in the form (backend ADR-0129).
 *
 * @param tenantId the tenant
 * @param search part of a name or number, empty for the first ones by name
 * @returns address of the customer lookup
 */
export function projectCustomersUrl(tenantId: number, search: string): string {
  const query = listQuery({ search })
  return `${projectsUrl(tenantId)}/customers${query === '' ? '' : `?${query}`}`
}

/**
 * @param tenantId the tenant
 * @param partnerId the customer
 * @returns address of one customer, for showing the one already chosen
 */
export function projectCustomerUrl(tenantId: number, partnerId: number): string {
  return `${projectsUrl(tenantId)}/customers/${partnerId}`
}

/**
 * @param tenantId the tenant
 * @param partnerId the customer
 * @returns address of the contact persons of that customer
 */
export function projectContactsUrl(tenantId: number, partnerId: number): string {
  return `${projectCustomerUrl(tenantId, partnerId)}/contacts`
}

/**
 * @param tenantId the tenant
 * @returns address of the users who can be made responsible
 */
export function projectResponsiblesUrl(tenantId: number): string {
  return `${projectsUrl(tenantId)}/responsibles`
}

/**
 * @param tenantId the tenant
 * @returns cache key every project query starts with, so one invalidation refreshes them all
 */
export function projectsKey(tenantId: number): readonly unknown[] {
  return ['projects', tenantId]
}

/**
 * The period of a project in one line.
 *
 * @param startDate first day, ISO, absent if not known
 * @param endDate last day, ISO, absent if open
 * @param format how one date is written
 * @returns «02.03.2026 – 30.06.2026», «ab 02.03.2026», «bis 30.06.2026» or «-»
 */
export function projectPeriod(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  format: (value: string) => string,
): string {
  const start = startDate ? format(startDate) : null
  const end = endDate ? format(endDate) : null
  if (start && end) return start === end ? start : `${start} – ${end}`
  if (start) return `ab ${start}`
  if (end) return `bis ${end}`
  return '-'
}

/** The project form as it lives in the browser: every field a string, as inputs hold them. */
export type ProjectForm = {
  name: string
  partnerId: string
  contactPersonId: string
  responsibleUserId: string
  startDate: string
  endDate: string
  description: string
}

/**
 * @returns the form of a new project: nothing chosen yet
 */
export function emptyProjectForm(): ProjectForm {
  return {
    name: '',
    partnerId: '',
    contactPersonId: '',
    responsibleUserId: '',
    startDate: '',
    endDate: '',
    description: '',
  }
}

/**
 * The form of a stored project.
 *
 * <p>A contact person the customer no longer has is left out, because the select could not
 * show it; saving then clears it on the project, which is what the backend expects.
 *
 * @param project the project as the backend sent it
 * @returns the form filled in with it
 */
export function toProjectForm(project: Project): ProjectForm {
  const contactKnown = project.contactPersonId != null && project.contactPersonName != null
  return {
    name: project.name,
    partnerId: String(project.partnerId),
    contactPersonId: contactKnown ? String(project.contactPersonId) : '',
    responsibleUserId: project.responsibleUserId == null ? '' : String(project.responsibleUserId),
    startDate: project.startDate ?? '',
    endDate: project.endDate ?? '',
    description: project.description ?? '',
  }
}

/**
 * The first thing wrong with the form, in the words the user reads.
 *
 * <p>The same rules the backend keeps, so the common mistakes are named before a request
 * leaves. The backend keeps them anyway — this is convenience, not protection.
 *
 * @param form the form as filled in
 * @returns the complaint, or `null` when the form can be sent
 */
export function projectComplaint(form: ProjectForm): string | null {
  const name = form.name.trim()
  if (name === '') return 'Ein Projekt braucht einen Namen.'
  if (name.length > PROJECT_NAME_MAX_LENGTH) {
    return `Der Projektname darf höchstens ${PROJECT_NAME_MAX_LENGTH} Zeichen lang sein.`
  }
  if (form.partnerId === '') return 'Ein Projekt braucht einen Kunden.'
  // ISO dates compare as text, so no Date object and no time zone gets a say.
  if (form.startDate !== '' && form.endDate !== '' && form.endDate < form.startDate) {
    return 'Das Enddatum liegt vor dem Startdatum.'
  }
  if (form.description.trim().length > PROJECT_DESCRIPTION_MAX_LENGTH) {
    return `Die Beschreibung darf höchstens ${PROJECT_DESCRIPTION_MAX_LENGTH} Zeichen lang sein.`
  }
  return null
}

/**
 * What the form sends.
 *
 * @param form the form as filled in, already free of complaints
 * @returns the request body, empty fields as `null`
 */
export function toProjectRequest(form: ProjectForm): ProjectRequest {
  const description = form.description.trim()
  return {
    name: form.name.trim(),
    partnerId: Number(form.partnerId),
    contactPersonId: idOrNull(form.contactPersonId),
    responsibleUserId: idOrNull(form.responsibleUserId),
    startDate: form.startDate === '' ? null : form.startDate,
    endDate: form.endDate === '' ? null : form.endDate,
    description: description === '' ? null : description,
  }
}

function idOrNull(value: string): number | null {
  return value === '' ? null : Number(value)
}
