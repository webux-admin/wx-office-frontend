/**
 * For tests: types into the box of a {@link RichTextField} the way a user does who selects all
 * and types. The box is no input and has no value; the browser writes into it and tells with
 * `input`, and this does the same — one line per line of the text, the caret at the end.
 *
 * <p>Call it inside `act`, like any other event a test sends.
 *
 * @param box the editable box, found by its label like any field
 * @param text the plain text to type; a line break starts a new line
 */
export function fillRichText(box: Element, text: string) {
  const element = box as HTMLElement
  const document = element.ownerDocument
  element.focus()
  const lines = text.split('\n').map((line) => {
    const block = document.createElement('div')
    block.append(document.createTextNode(line))
    return block
  })
  element.replaceChildren(...lines)
  const last = lines[lines.length - 1].firstChild as Text
  document.getSelection()?.collapse(last, last.data.length)
  element.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: text, bubbles: true }))
}

/**
 * Whether an element is the editable box of a formatted text.
 *
 * @param element any control a test found by its label
 */
export function isRichText(element: Element): boolean {
  return element.getAttribute('contenteditable') === 'true'
}
