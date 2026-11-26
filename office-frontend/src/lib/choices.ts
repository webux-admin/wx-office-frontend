/**
 * Choices a field searches in the browser, because the list is loaded already: the people of a
 * tenant, the projects with time in a range. Its own building block so `ChoiceField` stays free of
 * any domain and the matching can be tested without a renderer (#138).
 */

/** One entry of such a list. */
export type Choice = {
  /** What is handed over when it is taken; unique within the list. */
  value: string
  /** What the list and the field show. */
  label: string
  /** A second, quieter text after the label, searched as well, for example a number. */
  detail?: string
  /**
   * Shown in a quieter tone: an entry that stands for none or for all, such as «ohne Projekt»,
   * or a person who was deactivated.
   */
  quiet?: boolean
}

/**
 * The choices a term finds: those whose label or detail holds it, ignoring case and the blanks
 * around the term. The order of the list stays.
 *
 * <p>Plain text, never a pattern: a project number carries hyphens and a name may carry dots.
 *
 * @param choices the whole list
 * @param term what was typed
 * @returns the matching choices; all of them for an empty term
 */
export function choicesMatching(choices: readonly Choice[], term: string): readonly Choice[] {
  const needle = term.trim().toLowerCase()
  if (needle === '') return choices
  return choices.filter(
    (choice) =>
      choice.label.toLowerCase().includes(needle)
      || (choice.detail?.toLowerCase().includes(needle) ?? false),
  )
}
