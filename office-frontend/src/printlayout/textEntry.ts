/** The kinds of `input` that are switches and buttons rather than something to type into. */
const NOT_TYPED_INTO: readonly string[] = [
  'checkbox',
  'radio',
  'button',
  'submit',
  'reset',
  'file',
  'range',
  'color',
  'image',
]

/**
 * Whether the keyboard is in something a person types into.
 *
 * <p>There the keys belong to the text: Ctrl+Z takes back a letter, Backspace deletes one, the
 * arrow keys move the caret. Everywhere else — on a checkbox, a radio button, a button — the
 * same keys are free for the designer, and an undo pressed with the focus on «Fett» has to
 * undo the form, not vanish.
 *
 * @param target what has the focus, or what a key event was aimed at
 * @returns true for a text or number input, a text area, a dropdown and editable content
 */
export function isTextEntry(target: Element | null): boolean {
  const field = target?.closest('input, textarea, select, [contenteditable="true"]') ?? null
  if (field === null) return false
  if (field.tagName !== 'INPUT') return true
  return !NOT_TYPED_INTO.includes((field.getAttribute('type') ?? 'text').toLowerCase())
}
