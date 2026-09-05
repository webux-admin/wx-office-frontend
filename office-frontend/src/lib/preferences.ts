/**
 * What the browser holds for this application, and the two lifetimes it holds it for.
 *
 * <p>{@link readFlag} and {@link readText} are **settings**: how the shell is arranged, which
 * theme is chosen. They survive the browser being closed, and only display preferences belong
 * in them. {@link readSessionText} and the three beside it are **rescued state** of the piece
 * of work somebody is in the middle of, and they last no longer than the tab.
 *
 * <p>Never a session, a token or personal data in either: both stores are readable by any
 * script on the page, and neither is emptied by signing out.
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

/**
 * The store the rescued values below live in, and the one reason there is a second store at
 * all: `sessionStorage` is emptied when the tab is closed, `localStorage` is not.
 *
 * <p>The four functions under it are the **only** place in this source tree that touches it.
 * What was ruled out is raw access to a second store, not a second store: the prefix `webux.`,
 * the `try`/`catch` around every access and the fallback stay in this one file, and no caller
 * ever sees a `Storage` object.
 */
const sessionStore = () => window.sessionStorage

/**
 * A value that belongs to the piece of work somebody is in the middle of, not to their
 * settings.
 *
 * <p>Three things separate it from {@link readText}. It is **rescued state**, so whoever wrote
 * it is expected to remove it again — after a successful save, and when the tenant changes. It
 * is stored **under a key that names the tenant**, because a half typed entry of one business
 * must never turn up in the mask of another. And it lives in **`sessionStorage`**: its life is
 * the tab it was typed in, not the machine it was typed on (frontend ADR-0045).
 *
 * <p>That last part is what a preference must not be. Half an entry carries account numbers and
 * amounts of a business, and on a workstation two people share it would otherwise survive the
 * browser being closed and the next person signing in — a preference is worth remembering that
 * long, this is not. What the caller may put in is the same as everywhere here: nothing about
 * the session, no token, no personal data.
 *
 * @param key name of the value, without the prefix
 * @returns the stored text, or `null` when nothing is stored or storage cannot be read
 */
export function readSessionText(key: string): string | null {
  try {
    return sessionStore().getItem(PREFIX + key)
  } catch {
    return null
  }
}

/**
 * Stores a rescued value, and does nothing if storage refuses.
 *
 * @param key   name of the value, without the prefix
 * @param value the text to keep
 */
export function writeSessionText(key: string, value: string): void {
  try {
    sessionStore().setItem(PREFIX + key, value)
  } catch {
    // A value that cannot be rescued is not worth interrupting anybody over.
  }
}

/**
 * Removes one rescued value.
 *
 * @param key name of the value, without the prefix
 */
export function clearSessionText(key: string): void {
  try {
    sessionStore().removeItem(PREFIX + key)
  } catch {
    // Nothing to remove where nothing could be stored.
  }
}

/**
 * Removes every rescued value whose key starts with `prefix` but is not `keep`.
 *
 * <p>What makes the tenant change visible: the entry mask keeps its state under
 * `accounting.draft.<tenantId>`, and on arriving for one tenant it throws away what was left
 * lying for every other one. Doing it the other way round — reading only the own key and
 * leaving the rest — would keep another business's account numbers and amounts in this
 * browser for as long as nobody goes back to that tenant (frontend ADR-0045).
 *
 * @param prefix the family of keys, without the `webux.` prefix
 * @param keep   the one key of that family to leave standing, without the `webux.` prefix
 */
export function clearSessionFamily(prefix: string, keep: string): void {
  try {
    const store = sessionStore()
    const doomed: string[] = []
    for (let index = 0; index < store.length; index += 1) {
      const stored = store.key(index)
      if (stored === null) continue
      if (!stored.startsWith(PREFIX + prefix)) continue
      if (stored === PREFIX + keep) continue
      doomed.push(stored)
    }
    doomed.forEach((stored) => store.removeItem(stored))
  } catch {
    // A store that cannot be read holds nothing that has to be cleared.
  }
}
