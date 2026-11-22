import { createContext } from 'react'

/**
 * Asks a field to hand in what is being typed into it.
 *
 * @param target what the pointer went down on, or `null` when everything is to be handed in;
 *   a field leaves its draft alone while the pointer is inside the field itself
 * @returns false when the field holds something it cannot hand in — not a number, or out of
 *   range — and now says so
 */
export type DraftFlush = (target: EventTarget | null) => boolean

/**
 * The fields of the designer that hold a typed value back until they are left.
 *
 * <p>A length is committed when its field loses the focus, not on every keystroke — nobody
 * wants the sheet to jump to «1» on the way to «120». That leaves a moment in which the form
 * and the field disagree, and two things must not happen in it: the value must not end up on
 * whatever is selected next, and a save must not go out without it. So whoever is about to
 * change the selection, save or preview first asks every field here to hand in its draft.
 */
export type DraftRegistry = {
  /** Adds a field; the returned function takes it out again. */
  register: (flush: DraftFlush) => () => void
  /**
   * Hands in every pending draft.
   *
   * @returns true when nothing is left pending, false when a field refused its own draft
   */
  flush: (target?: EventTarget | null) => boolean
}

/**
 * Creates the registry of one designer.
 *
 * @returns a registry without fields
 */
export function createDraftRegistry(): DraftRegistry {
  const fields = new Set<DraftFlush>()
  return {
    register: (flush) => {
      fields.add(flush)
      return () => {
        fields.delete(flush)
      }
    },
    // Every field is asked, also after one has refused: each shows its own complaint.
    flush: (target = null) => [...fields].map((flush) => flush(target)).every(Boolean),
  }
}

/** The registry of the designer around a field; `null` where a field is used on its own. */
export const DraftContext = createContext<DraftRegistry | null>(null)
