import type { KeyboardEvent } from 'react'

/**
 * Lets Enter in any field of a form of the module send it, the way the quick line works.
 *
 * <p>Not on a button: «Abbrechen» must not save. Not over an open list either — the list takes
 * Enter for its marked hit first and marks the press as handled.
 *
 * @param onSubmit what Enter sends
 * @param busy true while the form is being sent; a second Enter then does nothing
 * @returns the key handler for the form
 */
export function enterSubmits(
  onSubmit: () => void,
  busy: boolean,
): (event: KeyboardEvent<HTMLFormElement>) => void {
  return (event) => {
    if (event.key !== 'Enter' || event.defaultPrevented) return
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
    if (event.nativeEvent.isComposing || !(event.target instanceof HTMLInputElement)) return
    event.preventDefault()
    if (!busy) onSubmit()
  }
}
