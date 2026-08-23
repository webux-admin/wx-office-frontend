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

/**
 * A mask whose dialog has something to save, the way every maintenance dialog does.
 */
function Submittable({ onSubmit }: { onSubmit?: () => void }) {
  const [value, setValue] = useState('')
  return (
    <Dialog open onClose={() => undefined} title="Wert bearbeiten" onSubmit={onSubmit}>
      <input
        aria-label="Bezeichnung"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
    </Dialog>
  )
}

/**
 * A mask whose dialog is closed by a button inside it, the way a position dialog closes once
 * the backend has taken the line.
 */
function Closable({ onPressed }: { onPressed: () => void }) {
  const [open, setOpen] = useState(true)
  return (
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      title="Position hinzufügen"
      footer={
        <button
          onClick={() => {
            onPressed()
            setOpen(false)
          }}
        >
          Hinzufügen
        </button>
      }
    >
      <input aria-label="Bezeichnung" />
    </Dialog>
  )
}

function button(label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === label,
  )
  if (!found) throw new Error(`Kein Knopf mit der Aufschrift "${label}"`)
  return found
}

function click(element: HTMLElement) {
  act(() => {
    element.click()
  })
}

/** Waits out the fade, after which the box is taken out of the tree. */
async function fadeOut() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 400))
  })
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

  it('dialogTakesAPressWhileItIsOpenTest', () => {
    let presses = 0
    act(() => root.render(<Closable onPressed={() => (presses += 1)} />))

    // Nothing is locked while the box is up, or the dialog would be a picture of itself.
    expect(container.querySelector('[inert]')).toBeNull()

    click(button('Hinzufügen'))

    expect(presses).toBe(1)
  })

  it('dialogLocksTheBoxWhileItFadesOutTest', () => {
    // The bug this pins down: `open` falls, AnimatePresence keeps drawing the children it
    // remembered — with the props of the render before that — and for the length of the fade
    // the box is still on screen, still clickable and still holding the focus. The second
    // click of an ordinary double click lands in exactly that window.
    act(() => root.render(<Closable onPressed={() => undefined} />))

    click(button('Hinzufügen'))

    const box = container.querySelector('[role="dialog"]')
    expect(box).not.toBeNull()
    // `inert` takes clicks, focus and keystrokes off the whole subtree at once: in a browser
    // an inert box is no longer a hit target and no longer takes the focus. What a test
    // dispatches is `element.click()`, which goes straight to the handler and past all hit
    // testing, and jsdom does not act on the attribute at all — so what is pinned here is
    // that the browser is told. The guards in the position dialogs carry the behaviour.
    const locked = container.querySelector('[inert]')
    expect(locked).not.toBeNull()
    expect(locked?.contains(box ?? null)).toBe(true)
  })

  it('dialogShieldsThePageWhileItFadesOutTest', () => {
    // The bug this pins down: at the pointer `inert` is no stronger than
    // `pointer-events: none` — hit testing on an inert node acts as if it were set — so the
    // backdrop stops catching anything the moment the box starts fading, and the second click
    // of a double click falls through onto whatever control the page has under it.
    act(() => root.render(<Closable onPressed={() => undefined} />))
    // While the box is up the backdrop is that hit target; a second cover would be a bug.
    expect(container.querySelector('[data-dialog-shield]')).toBeNull()

    click(button('Hinzufügen'))

    const shield = container.querySelector('[data-dialog-shield]')
    // jsdom has no layout and does no hit testing, so where a click really lands cannot be
    // asked here — this is not proof that the shield catches anything. What it pins is what
    // would otherwise go wrong without a sound: the shield is there for the length of the
    // fade, it is outside the locked subtree (inside it, it would be inert and let the click
    // through exactly like the backdrop), it is the last element and so on top of the box
    // that carries the same layer, and it says nothing to a reader.
    expect(shield).not.toBeNull()
    expect(container.querySelector('[inert]')?.contains(shield)).toBe(false)
    expect(container.lastElementChild).toBe(shield)
    expect(shield?.getAttribute('aria-hidden')).toBe('true')
  })

  it('dialogTakesTheShieldAwayOnceItHasFadedOutTest', async () => {
    act(() => root.render(<Closable onPressed={() => undefined} />))

    click(button('Hinzufügen'))
    await fadeOut()

    // A shield that outlives the fade would swallow every click on the page behind it.
    expect(container.querySelector('[data-dialog-shield]')).toBeNull()
  })

  it('dialogSavesOnControlSTest', () => {
    let saved = 0
    act(() => root.render(<Submittable onSubmit={() => (saved += 1)} />))

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true }))
    })

    expect(saved).toBe(1)
  })

  it('dialogSavesOnControlEnterTest', () => {
    let saved = 0
    act(() => root.render(<Submittable onSubmit={() => (saved += 1)} />))

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true }))
    })

    expect(saved).toBe(1)
  })

  /** Enter on its own belongs to the field somebody is typing in. */
  it('dialogIgnoresBareEnterTest', () => {
    let saved = 0
    act(() => root.render(<Submittable onSubmit={() => (saved += 1)} />))

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    })

    expect(saved).toBe(0)
  })

  /** A box that only asks something has nothing to save, and the keys stay unbound. */
  it('dialogWithoutAPrimaryActionIgnoresTheShortcutTest', () => {
    act(() => root.render(<Submittable />))

    // Nothing to assert but that it does not throw: no handler, no action.
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true }))
    })
  })

  /** The shortcut has to survive typing, which re-renders the caller on every character. */
  it('dialogKeepsTheShortcutWhileTypingTest', () => {
    let saved = 0
    act(() => root.render(<Submittable onSubmit={() => (saved += 1)} />))

    const input = container.querySelector('input') as HTMLInputElement
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setValue?.call(input, 'Buchhaltung')
    act(() => {
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true }))
    })

    expect(saved).toBe(1)
  })

  it('dialogLeavesNothingBehindOnceItHasFadedOutTest', async () => {
    act(() => root.render(<Closable onPressed={() => undefined} />))

    click(button('Hinzufügen'))
    await fadeOut()

    // A closed dialog is not a locked element in the page: it is no element at all, so it
    // catches no click, takes no focus and stands in nobody's layout.
    expect(container.innerHTML).toBe('')
  })
})
