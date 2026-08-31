import { api } from './api'
import type {
  AmountMatch,
  Confidence,
  LearnedAccount,
  MatchProposal,
  MatchRule,
  MatchRuleBody,
  MatchSettings,
  PartyMatch,
  ReferenceMatch,
} from './types'

/**
 * The assignment proposals of a tenant: where their screens live, what rights they run on, and
 * the calls behind them.
 *
 * <p>Its own building block beside `banking.ts`, not inside it: the statements are one thing
 * and what somebody makes of them is another, and the two are read by different screens
 * (ADR-0042).
 */

/** Path of the rule catalogue within the application. */
export const MATCH_RULE_PATH = '/zuordnungsregeln'

/**
 * The right the rule catalogue runs on.
 *
 * <p>Its own right, apart from feeding statements in: whoever imports a file works with the
 * rules as they stand, while changing them silently revalues every proposal from then on.
 */
export const MATCHING_RIGHTS = {
  read: 'BANK_STATEMENT_READ',
  manageRules: 'BANKING_MATCH_RULE_MANAGE',
  forgetAccount: 'BANKING_ACCOUNT_FORGET',
} as const

/**
 * What each confidence step is called on screen.
 *
 * <p><b>Words, never a percentage.</b> A score suggests a calibration a rule-based system does
 * not have, and it cannot be explained to an audit — «die QR-Referenz zeigt auf diesen Beleg»
 * can (backend ADR-0108).
 */
export const CONFIDENCE_NAMES: Record<Confidence, string> = {
  HOCH: 'Hoch',
  MITTEL: 'Mittel',
  TIEF: 'Tief',
}

/** What each confidence step means, spelled out where it is shown. */
export const CONFIDENCE_HINTS: Record<Confidence, string> = {
  HOCH: 'Der Beleg steht durch eine unabhängige, nachprüfbare Tatsache fest.',
  MITTEL: 'Plausibel — ein Mensch entscheidet.',
  TIEF: 'Ein Hinweis. Angezeigt, damit nichts verloren geht, nie eine Buchungsgrundlage.',
}

/** How loudly a confidence step speaks. */
export const CONFIDENCE_TONES: Record<Confidence, 'success' | 'accent' | 'muted'> = {
  HOCH: 'success',
  MITTEL: 'accent',
  TIEF: 'muted',
}

/** What each party finding is called. */
export const PARTY_NAMES: Record<PartyMatch, string> = {
  VOLL: 'Partei sicher',
  TEILWEISE: 'Partei wahrscheinlich',
  NEIN: 'Partei unbekannt',
  EGAL: 'egal',
}

/** What each reference finding is called. */
export const REFERENCE_NAMES: Record<ReferenceMatch, string> = {
  EINDEUTIG: 'Beleg eindeutig',
  MEHRDEUTIG: 'Beleg mehrdeutig',
  NEIN: 'kein Beleg',
  EGAL: 'egal',
}

/** What each amount finding is called. */
export const AMOUNT_NAMES: Record<AmountMatch, string> = {
  KEINER: 'kein Betragstreffer',
  EINER: 'ein Betragstreffer',
  MEHRERE: 'mehrere Betragstreffer',
  NICHT_BETRACHTET: 'Betrag nicht betrachtet',
  EGAL: 'egal',
}

/** What each step of the cascade is called, by its stored number. */
export const STAGE_NAMES: Record<number, string> = {
  1: 'QR- oder Creditor-Referenz',
  2: 'Belegnummer im Verwendungszweck',
  3: 'bekanntes Zahlungskonto',
  4: 'Zahlername',
  5: 'Betrag exakt',
  6: 'Betrag nach Skonto',
  7: 'Betrag in Toleranz',
  8: 'Summe mehrerer Posten',
}

/** The values a rule may carry, in the order the picker offers them. */
export const PARTY_ORDER: PartyMatch[] = ['EGAL', 'VOLL', 'TEILWEISE', 'NEIN']

/** The reference findings a rule may carry. */
export const REFERENCE_ORDER: ReferenceMatch[] = ['EGAL', 'EINDEUTIG', 'MEHRDEUTIG', 'NEIN']

/** The amount findings a rule may carry. */
export const AMOUNT_ORDER: AmountMatch[] = [
  'EGAL',
  'EINER',
  'MEHRERE',
  'KEINER',
  'NICHT_BETRACHTET',
]

/** The confidence steps, strongest first. */
export const CONFIDENCE_ORDER: Confidence[] = ['HOCH', 'MITTEL', 'TIEF']

/**
 * The short labels shown beside a proposal.
 *
 * <p>One chip per fact the cascade actually used — that is what makes a proposal readable
 * without the full sentence, and the full sentence is what makes it defensible.
 *
 * @param proposal one proposal
 * @returns the chips, in the order they carry weight
 */
export function reasonChips(proposal: MatchProposal): string[] {
  const chips: string[] = []
  const stage = STAGE_NAMES[proposal.stage]
  if (stage) chips.push(stage)
  if (proposal.partyMatch !== 'NEIN') chips.push(PARTY_NAMES[proposal.partyMatch])
  if (proposal.nameScore !== undefined) {
    chips.push(`Name ${proposal.nameScore.toFixed(2).replace('.', ',')}`)
  }
  if (proposal.referenceMatch === 'MEHRDEUTIG') chips.push('mehrdeutig')
  if (proposal.remainder !== 0) {
    chips.push(proposal.remainder > 0 ? 'Restbetrag offen' : 'Überzahlung')
  }
  if (proposal.reviewRequired) chips.push('Prüfung nötig')
  return chips
}

/**
 * Whether a proposal may be taken over without anybody looking.
 *
 * <p>Read off the server answer rather than recomputed: the rule that decided it lives there,
 * and a second reading in the browser would be a second place to keep in step.
 */
export function isSafe(proposal: MatchProposal): boolean {
  return proposal.safe && proposal.status === 'OFFEN'
}

/**
 * @param tenantId the tenant
 * @returns cache key of the rule catalogue
 */
export function matchRulesKey(tenantId: number): readonly unknown[] {
  return ['bank-match-rules', tenantId]
}

/**
 * @param tenantId the tenant
 * @returns cache key of the matching settings
 */
export function matchSettingsKey(tenantId: number): readonly unknown[] {
  return ['bank-match-settings', tenantId]
}

/**
 * @param tenantId      the tenant
 * @param transactionId the movement
 * @returns cache key of its proposals
 */
export function matchesKey(tenantId: number, transactionId?: number): readonly unknown[] {
  return transactionId === undefined
    ? ['bank-matches', tenantId]
    : ['bank-matches', tenantId, transactionId]
}

/**
 * @param tenantId  the tenant
 * @param partnerId the party
 * @returns cache key of its learned payer accounts
 */
export function payerAccountsKey(tenantId: number, partnerId: number): readonly unknown[] {
  return ['payer-accounts', tenantId, partnerId]
}

/**
 * @param tenantId the tenant
 * @returns its rule catalogue, lowest priority first
 */
export function fetchMatchRules(tenantId: number): Promise<MatchRule[]> {
  return api.get<MatchRule[]>(`/api/tenants/${tenantId}/bank-match-rules`)
}

/**
 * Adds a rule or changes priority, confidence, review flag and switch on an existing one.
 */
export function saveMatchRule(tenantId: number, body: MatchRuleBody): Promise<MatchRule> {
  return api.put<MatchRule>(`/api/tenants/${tenantId}/bank-match-rules`, body)
}

/**
 * Switches a rule off. It is never deleted — stored proposals point at it.
 */
export function deactivateMatchRule(tenantId: number, ruleId: number): Promise<MatchRule> {
  return api.delete<MatchRule>(`/api/tenants/${tenantId}/bank-match-rules/${ruleId}`)
}

/**
 * @param tenantId the tenant
 * @returns how far an amount may be off, and whether payer accounts are learned
 */
export function fetchMatchSettings(tenantId: number): Promise<MatchSettings> {
  return api.get<MatchSettings>(`/api/tenants/${tenantId}/bank-matches/settings`)
}

/** Stores the matching settings. */
export function saveMatchSettings(
  tenantId: number,
  body: MatchSettings,
): Promise<MatchSettings> {
  return api.put<MatchSettings>(`/api/tenants/${tenantId}/bank-matches/settings`, body)
}

/**
 * @param tenantId      the tenant
 * @param transactionId the movement
 * @returns its proposals, best candidate first
 */
export function fetchMatches(
  tenantId: number,
  transactionId: number,
): Promise<MatchProposal[]> {
  return api.get<MatchProposal[]>(
    `/api/tenants/${tenantId}/bank-matches?transactionId=${transactionId}`,
  )
}

/**
 * Works the cascade out again for one movement.
 *
 * <p>Needed after a customer was renamed, an invoice was issued late, or a payer account was
 * learned: the proposal from yesterday was right for yesterday.
 */
export function proposeMatches(
  tenantId: number,
  transactionId: number,
): Promise<MatchProposal[]> {
  return api.post<MatchProposal[]>(
    `/api/tenants/${tenantId}/bank-matches/propose?transactionId=${transactionId}`,
  )
}

/** Takes a proposal back, with the reason kept in the log. */
export function withdrawMatch(
  tenantId: number,
  matchId: number,
  reason: string,
): Promise<MatchProposal> {
  return api.post<MatchProposal>(
    `/api/tenants/${tenantId}/bank-matches/${matchId}/withdraw`,
    { reason },
  )
}

/**
 * @param tenantId  the tenant
 * @param partnerId the party
 * @returns the accounts it has been seen to pay from, most often used first
 */
export function fetchPayerAccounts(
  tenantId: number,
  partnerId: number,
): Promise<LearnedAccount[]> {
  return api.get<LearnedAccount[]>(
    `/api/tenants/${tenantId}/partners/${partnerId}/payer-accounts`,
  )
}

/**
 * Deletes one learned payer account, really.
 *
 * <p>revDSG Art. 25: a learned IBAN is a personal datum on the master record. The same IBAN in
 * the archived statement stays for ten years.
 */
export function forgetPayerAccount(
  tenantId: number,
  partnerId: number,
  accountId: number,
): Promise<void> {
  return api.delete<void>(
    `/api/tenants/${tenantId}/partners/${partnerId}/payer-accounts/${accountId}`,
  )
}
