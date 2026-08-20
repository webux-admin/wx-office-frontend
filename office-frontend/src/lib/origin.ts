/**
 * The screen a mask was opened from.
 *
 * <p>A record is reached in more than one way — from its list, from the overview, from a hint
 * on another screen — so the way out of its mask cannot be a fixed route. The screen that
 * opens the mask names itself, and the mask returns there when it closes.
 */
export type Origin = {
  /** Path within the application, always starting with a single slash. */
  from: string
  /** What that screen is called, for the link back. */
  label: string
}

/** The router state a link into a mask carries. */
export type OriginState = { origin: Origin }

/**
 * Names the screen a link leads away from, so the mask behind the link can return to it.
 *
 * @param from the path of the screen holding the link
 * @param label the name of that screen, as it stands in its own header
 */
export function originState(from: string, label: string): OriginState {
  return { origin: { from, label } }
}

/**
 * Reads back where a mask was opened from.
 *
 * <p>Falls back to the record's own list whenever the router carries no usable origin: on a
 * link opened in a new tab, and when the address was typed, bookmarked or passed on. A reload
 * is not one of those cases — the browser keeps the state with the history entry. A history
 * entry from an older version of the application does end up here, which is why every field
 * is checked rather than trusted.
 *
 * @param state the router state of the mask, `location.state`
 * @param fallback where to go when the state names no origin
 * @returns the origin to return to, never `undefined`
 */
export function originOf(state: unknown, fallback: Origin): Origin {
  if (typeof state !== 'object' || state === null || !('origin' in state)) return fallback

  const origin = state.origin
  if (typeof origin !== 'object' || origin === null) return fallback
  if (!('from' in origin) || !('label' in origin)) return fallback

  const { from, label } = origin
  if (typeof from !== 'string' || typeof label !== 'string') return fallback
  if (!isInApp(from) || label.trim() === '') return fallback

  return { from, label }
}

/**
 * Whether a path leads back into this application rather than off it.
 *
 * <p>Router state survives a reload and is not ours alone to write. Anything a browser reads
 * as another host — `//example.test` and its backslash twin, which some browsers accept the
 * same way — would turn the way back into an open redirect, so only a plain path passes.
 */
function isInApp(path: string): boolean {
  if (!path.startsWith('/')) return false
  return path[1] !== '/' && path[1] !== '\\'
}
