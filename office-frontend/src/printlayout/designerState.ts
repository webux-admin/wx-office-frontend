import type { PrintLayoutDefinition } from '../lib/types'
import {
  copySelection,
  pasteClipboard,
  pruneSelection,
  type ClipboardEntry,
  type Snapshot,
} from './commands'
import type { ObjectKey } from './definition'
import {
  canRedo,
  canUndo,
  commit,
  createHistory,
  redo,
  replacePresent,
  undo,
  type History,
} from './history'

/**
 * Everything the designer remembers about a form being edited: the form with its selection
 * and the way back, what was copied, and the last thing worth saying aloud.
 */
export type DesignerState = {
  history: History<Snapshot>
  clipboard: ClipboardEntry[]
  /** The last announcement, for the status line and `aria-live`. */
  message: string
  /** Counts the announcements, so the same sentence twice is still announced twice. */
  messageId: number
}

/** What can happen to a form in the designer. */
export type DesignerAction =
  /** A finished change: one step of undo, unless it merges with the one before. */
  | { type: 'commit'; outcome: Snapshot & { announcement?: string }; mergeKey?: string; at: number }
  /**
   * A change computed from the state at the moment it is applied. `null` from the command
   * means there was nothing to do.
   */
  | {
      type: 'run'
      command: (snapshot: Snapshot) => (Snapshot & { announcement?: string }) | null
      mergeKey?: string
      at: number
    }
  | { type: 'select'; selection: ObjectKey[] }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'copy' }
  | { type: 'paste'; at: number }
  | { type: 'announce'; message: string }

/**
 * Starts the designer on a form.
 *
 * @param definition the form as it was loaded
 * @returns the state with nothing selected and nothing to undo
 */
export function initialDesignerState(definition: PrintLayoutDefinition): DesignerState {
  return {
    history: createHistory<Snapshot>({ definition, selection: [] }),
    clipboard: [],
    message: '',
    messageId: 0,
  }
}

/**
 * Applies one action to the designer.
 *
 * <p>Pure: the time a change happened travels in the action, so the same actions always give
 * the same state — which is what lets undo, redo and the merging of quick changes be tested
 * without a clock.
 *
 * @param state the state before
 * @param action what happened
 * @returns the state after; the same object when nothing changed
 */
export function designerReducer(state: DesignerState, action: DesignerAction): DesignerState {
  switch (action.type) {
    case 'commit':
      return applied(state, action.outcome, action.mergeKey, action.at)
    case 'run': {
      const outcome = action.command(state.history.present)
      return outcome === null ? state : applied(state, outcome, action.mergeKey, action.at)
    }
    case 'select': {
      const current = state.history.present
      const selection = pruneSelection(current.definition, action.selection)
      if (sameKeys(selection, current.selection)) return state
      return { ...state, history: replacePresent(state.history, { ...current, selection }) }
    }
    case 'undo':
      if (!canUndo(state.history)) return said(state, 'Es gibt nichts rückgängig zu machen.')
      return said({ ...state, history: undo(state.history) }, 'Rückgängig gemacht.')
    case 'redo':
      if (!canRedo(state.history)) return said(state, 'Es gibt nichts zu wiederholen.')
      return said({ ...state, history: redo(state.history) }, 'Wiederholt.')
    case 'copy': {
      const clipboard = copySelection(state.history.present)
      if (clipboard.length === 0) return state
      return said({ ...state, clipboard }, 'Kopiert. Einfügen mit Strg+V.')
    }
    case 'paste': {
      const outcome = pasteClipboard(state.history.present, state.clipboard)
      if (outcome === null) return state
      // The clipboard moves on with the paste, so the next one lands beside this one.
      return applied({ ...state, clipboard: outcome.clipboard }, outcome, undefined, action.at)
    }
    case 'announce':
      return said(state, action.message)
  }
}

function applied(
  state: DesignerState,
  outcome: Snapshot & { announcement?: string },
  mergeKey: string | undefined,
  at: number,
): DesignerState {
  const current = state.history.present
  const selection = pruneSelection(outcome.definition, outcome.selection)
  // Nothing about the form changed: at most the selection moved, which is no step to undo.
  const history =
    outcome.definition === current.definition
      ? replacePresent(state.history, { ...current, selection })
      : commit(state.history, { definition: outcome.definition, selection }, { mergeKey, at })
  const next = { ...state, history }
  return outcome.announcement === undefined ? next : said(next, outcome.announcement)
}

function said(state: DesignerState, message: string): DesignerState {
  return { ...state, message, messageId: state.messageId + 1 }
}

function sameKeys(first: readonly ObjectKey[], second: readonly ObjectKey[]): boolean {
  return first.length === second.length && first.every((key, index) => key === second[index])
}
