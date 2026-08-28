/**
 * The login rules of the installation, and the addresses behind them.
 *
 * <p>Its own building block rather than paths typed into the screens: the settings screen, the
 * login and the own account all ask the same question — «does this installation demand a second
 * factor?» — and a query key written twice is a cache that goes stale in one of them.
 */

/** Path of the security screen within the application. */
export const SECURITY_PATH = '/sicherheit'

/** Address of the login rules. */
export const LOGIN_POLICY_URL = '/api/login-policy'

/** Cache key of the login rules. */
export const LOGIN_POLICY_KEY = ['login-policy'] as const

/**
 * The login rules as they come from the backend.
 */
export type LoginPolicy = {
  /** Whether every account of this installation needs a second factor. */
  twoFactorRequired: boolean
}

/** Address that starts the forced enrolment inside a login. */
export const ENROL_URL = '/api/auth/second-factor/enrol'

/** Address that finishes it — and the login with it. */
export const ENROL_CONFIRM_URL = `${ENROL_URL}/confirm`
