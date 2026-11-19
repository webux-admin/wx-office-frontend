/**
 * Which open dialog is on top.
 *
 * <p>Every open dialog listens on the document, because that is the only place Ctrl+S can be
 * taken from the browser. With a question over a dialog — «Änderungen verwerfen?» over the
 * address being typed — two of them would hear the same Escape. Only the one opened last
 * answers; the one underneath waits until it is on top again.
 */
const open: symbol[] = []

/**
 * Puts a dialog on top.
 *
 * @returns `isTop` to ask whether it is still the topmost one, and `release` to take it off
 *   the stack, wherever it stands by then
 */
export function enterDialog(): { isTop: () => boolean; release: () => void } {
  const entry = Symbol('dialog')
  open.push(entry)
  return {
    isTop: () => open[open.length - 1] === entry,
    release: () => {
      const index = open.indexOf(entry)
      if (index >= 0) open.splice(index, 1)
    },
  }
}
