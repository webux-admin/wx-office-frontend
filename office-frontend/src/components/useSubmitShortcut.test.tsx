// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Dialog } from './Dialog'
import { useSubmitShortcut } from './useSubmitShortcut'

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

/** A full screen mask, built the way the maintenance screens are. */
function Mask({ onSubmit }: { onSubmit?: () => void }) {
  const [value, setValue] = useState('')
  useSubmitShortcut(onSubmit)
  return (
    <input
      aria-label="Bezeichnung"
      value={value}
      onChange={(event) => setValue(event.target.value)}
    />
  )
}

/** The same mask with a dialog over it, each with a primary action of its own. */
function MaskWithDialog({
  onMaskSubmit,
  onDialogSubmit,
}: {
  onMaskSubmit: () => void
  onDialogSubmit: () => void
}) {
  useSubmitShortcut(onMaskSubmit)
  return (
    <Dialog open onClose={() => undefined} title="Adresse bearbeiten" onSubmit={onDialogSubmit}>
      <input aria-label="Ort" readOnly value="" />
    </Dialog>
  )
}

function pressSave(key = 's') {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: true }))
  })
}

describe('useSubmitShortcut', () => {
  it('useSubmitShortcutTest', () => {
    let saved = 0
    act(() => root.render(<Mask onSubmit={() => (saved += 1)} />))

    pressSave()

    expect(saved).toBe(1)
  })

  it('useSubmitShortcutWithControlEnterTest', () => {
    let saved = 0
    act(() => root.render(<Mask onSubmit={() => (saved += 1)} />))

    pressSave('Enter')

    expect(saved).toBe(1)
  })

  /** Passing nothing is how a mask says «no write permission» or «already saving». */
  it('useSubmitShortcutWithoutAnActionTest', () => {
    act(() => root.render(<Mask />))

    // Nothing to assert but that it does not throw: no handler, no action.
    pressSave()
  })

  /** Typing re-renders the mask on every character; the shortcut has to survive that. */
  it('useSubmitShortcutSurvivesTypingTest', () => {
    let saved = 0
    act(() => root.render(<Mask onSubmit={() => (saved += 1)} />))

    const input = container.querySelector('input') as HTMLInputElement
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setValue?.call(input, 'Buchhaltung')
    act(() => {
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })

    pressSave()

    expect(saved).toBe(1)
  })

  /** The one that matters: a dialog over the mask owns the keyboard, mask included. */
  it('useSubmitShortcutStandsDownWhileADialogIsOpenTest', () => {
    let mask = 0
    let dialog = 0
    act(() =>
      root.render(
        <MaskWithDialog onMaskSubmit={() => (mask += 1)} onDialogSubmit={() => (dialog += 1)} />,
      ),
    )

    pressSave()

    expect(dialog).toBe(1)
    expect(mask).toBe(0)
  })

  it('useSubmitShortcutUnbindsWhenTheMaskGoesTest', () => {
    let saved = 0
    act(() => root.render(<Mask onSubmit={() => (saved += 1)} />))
    act(() => root.render(<></>))

    pressSave()

    expect(saved).toBe(0)
  })
})
