import { api } from './api'
import type {
  DunningGrouping,
  DunningLevel,
  DunningPlaceholder,
  DunningSettings,
  DunningCandidate,
  DunningSkipReason,
  DunningState,
  DunningText,
  DunningTextPreview,
  FeeBooking,
  FeeVatMode,
  PartnerDunningGrouping,
} from './types'

/**
 * The dunning module: where its screens live, what rights they run on, and the calls behind
 * them.
 *
 * <p>Its own building block rather than addresses typed into the screens, the same way
 * `outbox.ts` does it: the settings are read by two masks and the sidebar, and a query key
 * written twice is a cache that goes stale in one of them.
 */

/** Name of the backend `LicensedModule` value. */
export const DUNNING_MODULE = 'DUNNING'

/** Path of the settings screen within the application. */
export const DUNNING_SETTINGS_PATH = '/mahnwesen-einstellungen'

/** Path of the levels screen within the application. */
export const DUNNING_LEVELS_PATH = '/mahnstufen'

/**
 * The four rights of the module.
 *
 * <p>`run` is not used by these screens — issuing a reminder arrives with issue 5/9. It stands
 * here so the whole set is in one place and nobody invents a fifth spelling later.
 */
export const DUNNING_RIGHTS = {
  read: 'DUNNING_READ',
  write: 'DUNNING_WRITE',
  configure: 'DUNNING_CONFIGURE',
  run: 'DUNNING_RUN',
} as const

/** What each grouping is called on screen. */
export const DUNNING_GROUPINGS: Record<DunningGrouping, string> = {
  PER_INVOICE: 'Je Rechnung',
  PER_PARTNER: 'Ein Brief je Kunde',
}

/** What each grouping means, spelled out where it is chosen. */
export const DUNNING_GROUPING_HINTS: Record<DunningGrouping, string> = {
  PER_INVOICE: 'Eine Mahnung je überfällige Rechnung, mit eigenem Zahlteil.',
  PER_PARTNER: 'Ein Brief über alle überfälligen Rechnungen desselben Kunden.',
}

/** How a fee reaches the books. */
export const FEE_BOOKINGS: Record<FeeBooking, string> = {
  SEPARATE_INVOICE: 'Eigene Gebührenrechnung',
  ON_DUNNING_ONLY: 'Nur auf der Mahnung gedruckt',
}

/** How a fee is treated for VAT. */
export const FEE_VAT_MODES: Record<FeeVatMode, string> = {
  FOLLOWS_INVOICE: 'Steuerbar, Satz der gemahnten Rechnung',
  FIXED_RATE: 'Steuerbar, fester Satz',
  NON_CONSIDERATION: 'Nicht-Entgelt (MWSTG Art. 18 Abs. 2)',
}

/** Where the settings of one tenant are cached. */
export function dunningSettingsKey(tenantId: number | null): readonly unknown[] {
  return ['dunning-settings', tenantId]
}

/** Where the levels of one tenant are cached. */
export function dunningLevelsKey(tenantId: number | null): readonly unknown[] {
  return ['dunning-levels', tenantId]
}

/** Where the dunning grouping of one customer is cached. */
export function partnerDunningKey(
  tenantId: number | null,
  partnerId: number,
): readonly unknown[] {
  return ['partner-dunning', tenantId, partnerId]
}

/** What the settings mask sends. */
export type DunningSettingsBody = {
  numberRangeCode: string
  minimumOpenAmount: number
  showPaymentPart: boolean
  grouping: DunningGrouping
  feeBooking: FeeBooking
  feeVatMode: FeeVatMode
  feeVatCategory?: string | null
  feeRevenueAccountId?: number | null
  feeDocumentTypeId?: number | null
}

/** What the level dialog sends. */
export type DunningLevelBody = {
  dunningTypeId: number
  daysAfterDue: number
  paymentDays: number
  minDaysSincePrevious: number
  feeAmount: number
}

export function fetchDunningSettings(tenantId: number): Promise<DunningSettings> {
  return api.get<DunningSettings>(`/api/tenants/${tenantId}/dunning/settings`)
}

export function saveDunningSettings(
  tenantId: number,
  body: DunningSettingsBody,
): Promise<DunningSettings> {
  return api.put<DunningSettings>(`/api/tenants/${tenantId}/dunning/settings`, body)
}

export function fetchDunningLevels(tenantId: number): Promise<DunningLevel[]> {
  return api.get<DunningLevel[]>(`/api/tenants/${tenantId}/dunning/levels`)
}

export function addDunningLevel(
  tenantId: number,
  body: DunningLevelBody,
): Promise<DunningLevel> {
  return api.post<DunningLevel>(`/api/tenants/${tenantId}/dunning/levels`, body)
}

export function updateDunningLevel(
  tenantId: number,
  levelId: number,
  body: DunningLevelBody,
): Promise<DunningLevel> {
  return api.put<DunningLevel>(`/api/tenants/${tenantId}/dunning/levels/${levelId}`, body)
}

export function setDunningLevelActive(
  tenantId: number,
  levelId: number,
  active: boolean,
): Promise<DunningLevel> {
  const step = active ? 'activate' : 'deactivate'
  return api.post<DunningLevel>(`/api/tenants/${tenantId}/dunning/levels/${levelId}/${step}`)
}

export function deleteDunningLevel(tenantId: number, levelId: number): Promise<void> {
  return api.delete<void>(`/api/tenants/${tenantId}/dunning/levels/${levelId}`)
}

export function fetchPartnerDunning(
  tenantId: number,
  partnerId: number,
): Promise<PartnerDunningGrouping> {
  return api.get<PartnerDunningGrouping>(
    `/api/tenants/${tenantId}/dunning/partners/${partnerId}/grouping`,
  )
}

/**
 * Sets or removes the deviation of one customer.
 *
 * @param grouping how to chase them, `null` to follow the tenant again — which is **not** the
 *                 same as setting the default, because a later change to the default reaches a
 *                 customer without a deviation (backend ADR-0093)
 */
export function setPartnerDunning(
  tenantId: number,
  partnerId: number,
  grouping: DunningGrouping | null,
): Promise<PartnerDunningGrouping> {
  return api.put<PartnerDunningGrouping>(
    `/api/tenants/${tenantId}/dunning/partners/${partnerId}/grouping`,
    { grouping },
  )
}

/**
 * Whether a level may be switched off or removed.
 *
 * <p>Only the topmost, and the backend refuses anything else. Working it out here as well is
 * not a second rule but the same one: a button that is only disabled after the server said no
 * teaches the user nothing.
 *
 * @param levels every level of the tenant
 * @param level  the one in question
 */
export function isHighestLevel(levels: DunningLevel[], level: DunningLevel): boolean {
  return levels.every((other) => other.levelNo <= level.levelNo)
}

/**
 * Whether a sequence still reads as an escalation.
 *
 * <p>The same three statements the backend insists on: the wait does not get shorter, the fee
 * does not get smaller, the granted period does not get longer. Judged over the **active**
 * levels only, because a switched off one in the middle is not part of the escalation.
 *
 * @param levels every level of the tenant
 * @returns the first sentence that is wrong, or `null` when the sequence is sound
 */
export function escalationProblem(levels: DunningLevel[]): string | null {
  const active = levels
    .filter((level) => level.active)
    .slice()
    .sort((one, other) => one.levelNo - other.levelNo)
  for (let index = 1; index < active.length; index += 1) {
    const previous = active[index - 1]
    const current = active[index]
    if (current.daysAfterDue < previous.daysAfterDue) {
      return `Stufe ${current.levelNo} wird früher fällig als Stufe ${previous.levelNo}.`
    }
    if (current.feeAmount < previous.feeAmount) {
      return `Die Gebühr der Stufe ${current.levelNo} ist kleiner als die der Stufe ${previous.levelNo}.`
    }
    if (current.paymentDays > previous.paymentDays) {
      return `Die Zahlfrist der Stufe ${current.levelNo} ist länger als die der Stufe ${previous.levelNo}.`
    }
  }
  return null
}

/** How many levels are switched on — the figure that answers «wie viele Stufen hat es». */
export function activeLevelCount(levels: DunningLevel[]): number {
  return levels.filter((level) => level.active).length
}

/** Path of the dunning text screen within the application. */
export const DUNNING_TEXTS_PATH = '/mahntexte'

/** Where the texts of one level are cached. */
export function dunningTextsKey(
  tenantId: number | null,
  levelId: number,
): readonly unknown[] {
  return ['dunning-texts', tenantId, levelId]
}

/** Where the placeholder catalogue is cached. It is the same for every tenant. */
export function dunningPlaceholdersKey(tenantId: number | null): readonly unknown[] {
  return ['dunning-placeholders', tenantId]
}

/** What the text mask sends. */
export type DunningTextBody = {
  title: string
  introText?: string
  closingText?: string
  mailSubject?: string
  mailBody?: string
}

export function fetchDunningPlaceholders(tenantId: number): Promise<DunningPlaceholder[]> {
  return api.get<DunningPlaceholder[]>(`/api/tenants/${tenantId}/dunning/placeholders`)
}

export function fetchDunningTexts(tenantId: number, levelId: number): Promise<DunningText[]> {
  return api.get<DunningText[]>(`/api/tenants/${tenantId}/dunning/levels/${levelId}/texts`)
}

export function saveDunningText(
  tenantId: number,
  levelId: number,
  language: string,
  body: DunningTextBody,
): Promise<DunningText> {
  return api.put<DunningText>(
    `/api/tenants/${tenantId}/dunning/levels/${levelId}/texts/${language}`,
    body,
  )
}

export function resetDunningText(
  tenantId: number,
  levelId: number,
  language: string,
): Promise<DunningText> {
  return api.post<DunningText>(
    `/api/tenants/${tenantId}/dunning/levels/${levelId}/texts/${language}/reset`,
  )
}

export function fetchDunningTextPreview(
  tenantId: number,
  levelId: number,
  language: string,
): Promise<DunningTextPreview> {
  return api.get<DunningTextPreview>(
    `/api/tenants/${tenantId}/dunning/levels/${levelId}/texts/${language}/preview`,
  )
}

/**
 * Inserts a placeholder at the cursor of a text field.
 *
 * <p>At the cursor and not at the end, because a placeholder belongs in the middle of the
 * sentence somebody is writing. Returns the new text and where the cursor should land after
 * it, so the caller can put it back.
 *
 * @param text  what stands in the field
 * @param token the placeholder name, without the braces
 * @param start where the selection begins
 * @param end   where it ends; equal to `start` when nothing is selected
 */
export function insertPlaceholder(
  text: string,
  token: string,
  start: number,
  end: number,
): { text: string; cursor: number } {
  const inserted = `{{${token}}}`
  const safeStart = Math.max(0, Math.min(start, text.length))
  const safeEnd = Math.max(safeStart, Math.min(end, text.length))
  return {
    text: text.slice(0, safeStart) + inserted + text.slice(safeEnd),
    cursor: safeStart + inserted.length,
  }
}

/**
 * Which placeholders of a text a collective reminder would leave empty.
 *
 * <p>Worked out in the browser as well so the mask can warn **while** somebody types, not only
 * after saving. The server answers the same question on every read; this is the same rule, not
 * a second one.
 *
 * @param texts        the fields of the mask
 * @param placeholders the catalogue as the server sent it
 */
export function singleInvoiceTokensIn(
  texts: (string | undefined)[],
  placeholders: DunningPlaceholder[],
): string[] {
  const risky = new Set(
    placeholders.filter((entry) => !entry.availableWhenCollective).map((entry) => entry.token),
  )
  const used = new Set<string>()
  for (const text of texts) {
    if (text === undefined) continue
    for (const match of text.matchAll(/\{\{\s*([a-z]+)\s*}}/g)) {
      if (risky.has(match[1])) used.add(match[1])
    }
  }
  return [...used]
}

/** Path of the work list within the application. */
export const DUNNING_WORKLIST_PATH = '/mahnvorschlag'

/** Where the work list of one tenant is cached. */
export function dunningWorklistKey(
  tenantId: number | null,
  asOf: string,
): readonly unknown[] {
  return ['dunning-worklist', tenantId, asOf]
}

/**
 * What each skip reason says on screen.
 *
 * <p>Every reason gets a sentence, not a code: the whole point of the work list is that a
 * reader can see why the software decided against a debt (backend ADR-0096).
 */
export const DUNNING_SKIP_REASONS: Record<DunningSkipReason, string> = {
  BLOCKED: 'Mahnstopp gesetzt',
  NO_DUE_DATE: 'Rechnung ohne Fälligkeitsdatum',
  LEVEL_REMOVED: 'Mahnstufe abgeschaltet',
  EXHAUSTED: 'Höchste Mahnstufe erreicht',
  BELOW_MINIMUM: 'Unter der Bagatellgrenze',
  NOT_DUE: 'Noch nicht fällig',
  COOLING_OFF: 'Sperrfrist läuft',
  NO_ADDRESS: 'Keine Adresse hinterlegt',
  FEE_ACCOUNT_MISSING: 'Ertragskonto der Gebühr fehlt',
  FEE_DOCUMENT_TYPE_MISSING: 'Belegart der Gebührenrechnung fehlt',
}

/**
 * The reasons a tenant fixes in its settings rather than by waiting.
 *
 * <p>The mask puts a banner above the list when one of these appears: a work list that promises
 * reminders the run would discard is worse than an empty one.
 */
export const DUNNING_CONFIGURATION_REASONS: DunningSkipReason[] = [
  'FEE_ACCOUNT_MISSING',
  'FEE_DOCUMENT_TYPE_MISSING',
  'LEVEL_REMOVED',
]

export function fetchDunningWorklist(
  tenantId: number,
  asOf: string,
): Promise<DunningCandidate[]> {
  return api.get<DunningCandidate[]>(
    `/api/tenants/${tenantId}/dunning/worklist?asOf=${asOf}`,
  )
}

/**
 * How far each of the named invoices has been chased.
 *
 * <p>For a list that wants to show the dunning level beside its rows. There is no way of
 * sorting or filtering by it on the server — that is the price of not letting one module read
 * another's tables (backend ADR-0096).
 */
export function fetchDunningStates(
  tenantId: number,
  documentIds: number[],
): Promise<DunningState[]> {
  if (documentIds.length === 0) return Promise.resolve([])
  const query = documentIds.map((id) => `documentId=${id}`).join('&')
  return api.get<DunningState[]>(`/api/tenants/${tenantId}/dunning/states?${query}`)
}

/**
 * Which of the skipped cases the tenant could fix by changing a setting.
 *
 * <p>Not the ones that simply need time to pass: telling somebody «this one is not due yet» in
 * a banner would train them to ignore the banner.
 *
 * @param candidates the work list as the server answered it
 * @returns the configuration reasons that actually occur, without duplicates
 */
export function configurationProblems(candidates: DunningCandidate[]): DunningSkipReason[] {
  const found = new Set<DunningSkipReason>()
  for (const candidate of candidates) {
    if (
      candidate.skipReason !== undefined
      && DUNNING_CONFIGURATION_REASONS.includes(candidate.skipReason)
    ) {
      found.add(candidate.skipReason)
    }
  }
  return [...found]
}

/**
 * A stable key for one letter of the work list.
 *
 * <p>Customer, level and language are exactly what groups a letter on the server, so the same
 * three identify it here. The document ids ride along, because in single mode one customer can
 * appear on several lines of the same level.
 *
 * @param candidate one letter
 */
export function candidateKey(candidate: DunningCandidate): string {
  const documents = candidate.invoices.map((invoice) => invoice.documentId).join('-')
  return `${candidate.partnerId}|${candidate.levelNo}|${candidate.languageCode}|${documents}`
}
