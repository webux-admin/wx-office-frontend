/**
 * The keys that finish a mask.
 *
 * <p>Its own file because the rule is the same everywhere: a full screen mask, a dialog and
 * later the quick entry of prices all mean the same thing by «done», and it is worth testing
 * without a renderer.
 */

/** What a key press has to say for these rules to read it. */
export type KeyPress = {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  altKey: boolean
}

/**
 * Whether a key press means «finish this window», the same as clicking the primary button.
 *
 * <p>Two combinations, both of them expected by somebody:
 *
 * <ul>
 *   <li><b>Ctrl+S</b> (⌘S on a Mac) — what everyone reaches for to save. The browser would
 *       offer to save the page, so a caller has to call `preventDefault`.</li>
 *   <li><b>Ctrl+Enter</b> (⌘Enter) — «send this form». It is the one that still works inside
 *       a multi-line field, where Enter alone belongs to the text.</li>
 * </ul>
 *
 * <p>Enter on its own is deliberately not one of them: a mask has many fields, and a stray
 * Enter while typing an address would save a half-filled record.
 *
 * <p>Shift and Alt disqualify a press. They carry other meanings in browsers and editors, and
 * a shortcut that fires on a near miss is worse than one that does not fire.
 *
 * @param press the key press
 * @returns true when the primary action should run
 */
export function isSubmitShortcut(press: KeyPress): boolean {
  if (!press.ctrlKey && !press.metaKey) return false
  if (press.shiftKey || press.altKey) return false
  if (press.key.toLowerCase() === 's') return true
  return press.key === 'Enter' || press.key === 'NumpadEnter'
}

/**
 * How the shortcut is written for the person reading the button.
 *
 * @param mac whether the keyboard is a Mac one, which names the modifier differently
 * @returns for example `Strg+S`, to be shown on the primary button
 */
export function submitShortcutLabel(mac: boolean): string {
  return mac ? '⌘S' : 'Strg+S'
}

/**
 * The whole tooltip of a primary button, naming both ways.
 *
 * @param action what the button does, for example `Speichern`
 * @param mac whether the keyboard is a Mac one
 * @returns for example `Speichern (Strg+S oder Strg+Enter)`
 */
export function submitShortcutTitle(action: string, mac: boolean): string {
  const modifier = mac ? '⌘' : 'Strg+'
  return `${action} (${modifier}S oder ${modifier}Enter)`
}

/**
 * Whether this browser runs on a Mac, for the wording of the hint.
 *
 * <p>Reads `navigator` defensively: the mask is rendered in tests and, one day, on a server,
 * and neither has one.
 *
 * @returns true on a Mac keyboard, false everywhere else and where it cannot be told
 */
export function onMac(): boolean {
  const agent = globalThis.navigator?.userAgent ?? ''
  return /Mac|iPhone|iPad/i.test(agent)
}
