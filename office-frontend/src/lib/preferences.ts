/**
 * Small settings the browser remembers between visits: how the shell is arranged, nothing
 * more.
 *
 * <p>Only display preferences belong here. Never a session, a token or personal data: this
 * store is readable by any script on the page and survives sign-out.
 */

/** Prefix so the keys of this application cannot collide with anything else on the origin. */
const PREFIX = 'webux.'

/**
 * Reads a stored flag.
 *
 * <p>Storage can be unavailable: private browsing, a blocked origin, a full quota. That is
 * not worth an error message for a preference, so the fallback is returned instead.
 *
 * @param key      name of the preference, without the prefix
 * @param fallback value to use when nothing is stored or storage cannot be read
 * @returns the stored value, or `fallback`
 */
export function readFlag(key: string, fallback: boolean): boolean {
  try {
    const stored = window.localStorage.getItem(PREFIX + key)
    if (stored === null) return fallback
    return stored === 'true'
  } catch {
    return fallback
  }
}

/**
 * Stores a flag, and does nothing if storage refuses.
 *
 * @param key   name of the preference, without the prefix
 * @param value the value to remember
 */
export function writeFlag(key: string, value: boolean): void {
  try {
    window.localStorage.setItem(PREFIX + key, String(value))
  } catch {
    // A preference that cannot be remembered is not worth interrupting anybody over.
  }
}

/**
 * Reads a stored text preference.
 *
 * @param key name of the preference, without the prefix
 * @returns the stored text, or `null` when nothing is stored or storage cannot be read
 */
export function readText(key: string): string | null {
  try {
    return window.localStorage.getItem(PREFIX + key)
  } catch {
    return null
  }
}

/**
 * Stores a text preference, and does nothing if storage refuses.
 *
 * @param key   name of the preference, without the prefix
 * @param value the value to remember
 */
export function writeText(key: string, value: string): void {
  try {
    window.localStorage.setItem(PREFIX + key, value)
  } catch {
    // A preference that cannot be remembered is not worth interrupting anybody over.
  }
}
