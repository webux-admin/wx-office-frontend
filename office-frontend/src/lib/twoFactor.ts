/**
 * Addresses, rights and wording of the second factor.
 *
 * <p>Its own building block rather than paths typed into the screens: the login, the own
 * account and the user administration all touch the same endpoints, and a query key written
 * twice is a cache that goes stale in one of them.
 */

/** How a second factor is delivered, as the backend spells it. */
export type SecondFactorMethod = 'TOTP' | 'EMAIL'

/**
 * The right to take the second factor of <b>another</b> account away.
 *
 * <p>Its own right and not part of `USER_WRITE`: together with setting a password it is an
 * account takeover (backend ADR-0087).
 */
export const TWO_FACTOR_RESET = 'USER_TWO_FACTOR_RESET'

/** Path of the own account within the application. */
export const PROFILE_PATH = '/profil'

/**
 * The query parameter naming the open register of the own account.
 *
 * <p>In the address, unlike every other register in this application: this one is meant to be
 * linked to — «set up your second factor» has to be able to land on it
 * (ADR-0022).
 */
export const PROFILE_TAB_PARAM = 'register'

/** The registers of the own account. */
export const PROFILE_TABS = ['passwort', 'zwei-faktor', 'rechte'] as const

/** One register of the own account. */
export type ProfileTab = (typeof PROFILE_TABS)[number]

/**
 * @param value what stood in the address, may be anything
 * @returns that register, or the first one for anything unknown
 */
export function profileTabOf(value: string | null): ProfileTab {
  return PROFILE_TABS.includes(value as ProfileTab) ? (value as ProfileTab) : 'passwort'
}

/** Address of the own second factor: starting, confirming, switching off. */
export const TWO_FACTOR_URL = '/api/auth/two-factor'

/**
 * @param userId the user
 * @returns address of the second factor state of that account
 */
export function secondFactorStateUrl(userId: number): string {
  return `/api/users/${userId}/two-factor`
}

/**
 * @param userId the user
 * @returns cache key of that state
 */
export function secondFactorStateKey(userId: number): readonly unknown[] {
  return ['second-factor', userId]
}

/**
 * @param userId the user
 * @returns address that takes the second factor of that account away
 */
export function resetSecondFactorUrl(userId: number): string {
  return `${secondFactorStateUrl(userId)}/reset`
}

/** What each method is called on screen. */
const METHOD_LABELS: Record<SecondFactorMethod, string> = {
  TOTP: 'Authenticator-App',
  EMAIL: 'Code per E-Mail',
}

/**
 * @param method the method as the backend spells it, may be absent
 * @returns the German name, or the code itself for a method this version does not know
 */
export function methodLabel(method: string | null | undefined): string {
  if (!method) return '—'
  return METHOD_LABELS[method as SecondFactorMethod] ?? method
}

/**
 * How many digits a code out of the app or the mail has.
 *
 * <p>Both are six, which is why one field serves both.
 */
export const CODE_LENGTH = 6

/**
 * How many characters a recovery code has.
 *
 * <p>Ten, and from an alphabet without the confusable letters (backend ADR-0087).
 */
export const RECOVERY_CODE_LENGTH = 10

/**
 * How long the mask waits before offering another code by mail.
 *
 * <p>The backend refuses a faster one silently and always answers 204 — showing the count
 * down is the only way somebody learns why nothing arrives (backend ADR-0089).
 */
export const RESEND_SECONDS = 60

/** What a downloaded list of recovery codes is called. */
export const RECOVERY_CODE_FILE = 'webux-wiederherstellungscodes.txt'

/**
 * Puts the recovery codes into a file somebody can keep.
 *
 * <p>With a line saying what they are for. A bare list of ten strings in a downloads folder
 * is a puzzle six months later, and these are the codes that matter exactly then.
 *
 * @param codes the ten codes
 * @returns the file content
 */
export function recoveryCodeFileContent(codes: string[]): string {
  return [
    'webux ERP — Wiederherstellungscodes für die Anmeldung',
    '',
    'Jeder Code funktioniert genau einmal. Bewahren Sie diese Liste getrennt',
    'von Ihrem Telefon auf. Wer sie hat, kommt ohne zweiten Faktor in Ihr Konto.',
    '',
    ...codes,
    '',
  ].join('\n')
}
