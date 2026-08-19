// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Dialog } from './Dialog'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

/**
 * A mask built the way the maintenance screens are: the form state lives above the dialog, so
 * every keystroke re-renders the caller and hands the dialog a fresh `onClose`.
 */
function Mask({ onClosed }: { onClosed?: () => void }) {
  const [value, setValue] = useState('')
  return (
    <Dialog open onClose={() => onClosed?.()} title="Wert bearbeiten">
      <input aria-label="Bezeichnung" value={value} onChange={(event) => setValue(event.target.value)} />
    </Dialog>
  )
}

/** Types one character the way a browser does: set the value, then fire the native event. */
function type(input: HTMLInputElement, character: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setValue?.call(input, character)
  act(() => {
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('Dialog', () => {
  it('dialogKeepsFocusWhileTypingTest', () => {
    // The bug this pins down: with `onClose` as an effect dependency, one character moved the
    // focus to the close button and every further keystroke was swallowed.
    act(() => root.render(<Mask />))
    const input = container.querySelector('input') as HTMLInputElement
    input.focus()

    type(input, 'A')

    expect(document.activeElement).toBe(input)
    expect(input.value).toBe('A')
  })

  it('dialogClosesOnEscapeTest', () => {
    let closed = false
    act(() => root.render(<Mask onClosed={() => (closed = true)} />))

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })

    expect(closed).toBe(true)
  })

  it('dialogClosesOnEscapeAfterTypingTest', () => {
    // The handler is held in a ref, so it must still be the current one after a re-render.
    let closed = false
    act(() => root.render(<Mask onClosed={() => (closed = true)} />))
    const input = container.querySelector('input') as HTMLInputElement
    type(input, 'A')

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })

    expect(closed).toBe(true)
  })

  it('dialogMovesFocusIntoTheBoxWhenItOpensTest', () => {
    act(() => root.render(<Mask />))

    expect(container.contains(document.activeElement)).toBe(true)
  })
})
