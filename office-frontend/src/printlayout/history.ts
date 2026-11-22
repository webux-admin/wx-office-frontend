/**
 * Undo and redo over whole states.
 *
 * <p>A form is small and every change makes a new one, so the history simply keeps the states
 * themselves: no inverse operations to get wrong, and a drag that touched five elements is one
 * step because it was committed once.
 */

/** How many steps back the history remembers. */
export const HISTORY_LIMIT = 100

/** Changes of the same kind closer together than this count as one step, in milliseconds. */
export const MERGE_WINDOW_MS = 1000

/** A present state with what came before and what was undone. */
export type History<T> = {
  /** Older states, the most recent last. */
  past: T[]
  present: T
  /** States that were undone, the next one to redo first. */
  future: T[]
  /** What kind of change made the present state, where it may absorb the next one. */
  mergeKey: string | null
  /** When that change happened, in milliseconds. */
  mergedAt: number
}

/**
 * Starts a history.
 *
 * @param present the state to start from
 * @returns a history with nothing to undo or redo
 */
export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [], mergeKey: null, mergedAt: 0 }
}

/**
 * Records a change as one step.
 *
 * <p>Whatever was undone before is gone afterwards: a new change starts a new future. With a
 * `mergeKey`, a change that follows another of the same key within a second replaces it
 * instead of adding a step — holding an arrow key is one move, typing a word is one edit.
 *
 * @param history the history
 * @param next the new state
 * @param options `mergeKey` names the kind of change; `at` is the time in milliseconds
 * @returns the new history; the same one when the state is the present one already
 */
export function commit<T>(
  history: History<T>,
  next: T,
  options: { mergeKey?: string; at?: number } = {},
): History<T> {
  if (next === history.present) return history
  const at = options.at ?? Date.now()
  const mergeKey = options.mergeKey ?? null
  const merges =
    mergeKey !== null &&
    mergeKey === history.mergeKey &&
    history.past.length > 0 &&
    at - history.mergedAt <= MERGE_WINDOW_MS
  if (merges) {
    return { ...history, present: next, future: [], mergedAt: at }
  }
  return {
    past: [...history.past, history.present].slice(-HISTORY_LIMIT),
    present: next,
    future: [],
    mergeKey,
    mergedAt: at,
  }
}

/**
 * Replaces the present state without adding a step.
 *
 * <p>For what belongs to the state but is not worth undoing on its own — which element is
 * selected. It also ends a run of merging changes: the next edit is a step of its own.
 *
 * @param history the history
 * @param present the state to show now
 * @returns the new history
 */
export function replacePresent<T>(history: History<T>, present: T): History<T> {
  return { ...history, present, mergeKey: null }
}

/**
 * @param history the history
 * @returns true when there is a step to take back
 */
export function canUndo<T>(history: History<T>): boolean {
  return history.past.length > 0
}

/**
 * @param history the history
 * @returns true when there is an undone step to bring back
 */
export function canRedo<T>(history: History<T>): boolean {
  return history.future.length > 0
}

/**
 * Takes the last step back.
 *
 * @param history the history
 * @returns the history one step earlier; the same one when there is nothing to undo
 */
export function undo<T>(history: History<T>): History<T> {
  if (!canUndo(history)) return history
  return {
    past: history.past.slice(0, -1),
    present: history.past[history.past.length - 1],
    future: [history.present, ...history.future],
    mergeKey: null,
    mergedAt: 0,
  }
}

/**
 * Brings the last undone step back.
 *
 * @param history the history
 * @returns the history one step later; the same one when there is nothing to redo
 */
export function redo<T>(history: History<T>): History<T> {
  if (!canRedo(history)) return history
  return {
    past: [...history.past, history.present],
    present: history.future[0],
    future: history.future.slice(1),
    mergeKey: null,
    mergedAt: 0,
  }
}
