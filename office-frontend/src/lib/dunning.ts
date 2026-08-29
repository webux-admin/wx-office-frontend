import { api } from './api'
import type {
  DunningGrouping,
  DunningLevel,
  DunningSettings,
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
