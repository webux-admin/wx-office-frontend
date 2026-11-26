// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { enterSubmits } from './enterSubmits'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root
let sent: number

beforeEach(() => {
  sent = 0
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function render(busy = false) {
  act(() =>
    root.render(
      <form onKeyDown={enterSubmits(() => (sent += 1), busy)}>
        <input aria-label="Dauer" />
        <div aria-label="Text" role="textbox" contentEditable suppressContentEditableWarning />
        <button type="button">Abbrechen</button>
      </form>,
    ),
  )
}

/** Presses a key on an element; true when the form took it. */
function press(target: Element, init: KeyboardEventInit = {}): boolean {
  let taken = false
  act(() => {
    taken = !target.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...init }),
    )
  })
  return taken
}

const control = (label: string) => container.querySelector(`[aria-label="${label}"]`) as HTMLElement

describe('enterSubmits', () => {
  /** Enter in an input sends the form, and so does Enter in the box of the formatted text. */
  it('enterSubmitsTest', () => {
    render()

    expect(press(control('Dauer'))).toBe(true)
    expect(press(control('Text'))).toBe(true)

    expect(sent).toBe(2)
  })

  /** Not on a button, not with a modifier, not while composing, not where the press was taken. */
  it('enterSubmitsLeavesOtherPressesTest', () => {
    render()
    const button = container.querySelector('button') as HTMLButtonElement

    expect(press(button)).toBe(false)
    expect(press(control('Text'), { shiftKey: true })).toBe(false)
    expect(press(control('Dauer'), { ctrlKey: true })).toBe(false)
    expect(press(control('Dauer'), { key: 'a' })).toBe(false)
    act(() => {
      const taken = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
      taken.preventDefault()
      control('Dauer').dispatchEvent(taken)
    })

    expect(sent).toBe(0)
  })

  /** While the form is being sent, a second Enter is taken but sends nothing. */
  it('enterSubmitsWhileBusyTest', () => {
    render(true)

    expect(press(control('Dauer'))).toBe(true)

    expect(sent).toBe(0)
  })
})
