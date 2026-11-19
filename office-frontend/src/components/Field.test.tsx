// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Dialog } from './Dialog'
import { TextField } from './TextField'

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

function input(): HTMLInputElement {
  return container.querySelector('input') as HTMLInputElement
}

/** The drawn tooltip bubble, which lives in `body` rather than next to its icon. */
function bubble(): Element | null {
  return document.body.querySelector('.max-w-tooltip')
}

/** The text a screen reader reads with the field, from its `aria-describedby`. */
function description(): string {
  return (input().getAttribute('aria-describedby') ?? '')
    .split(' ')
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ')
}

describe('Field', () => {
  it('fieldMarksARequiredFieldTest', () => {
    act(() => root.render(<TextField label="Firmenname" required />))

    expect(input().getAttribute('aria-required')).toBe('true')
    expect(container.textContent).toContain('*')
    // The star stands beside the label, so the name of the field stays the plain word.
    expect(container.querySelector('label')?.textContent).toBe('Firmenname')
  })

  it('fieldShowsAnErrorAtTheFieldTest', () => {
    act(() => root.render(<TextField label="UID" error="Keine gültige Schweizer UID" />))

    expect(input().getAttribute('aria-invalid')).toBe('true')
    expect(description()).toContain('Keine gültige Schweizer UID')
  })

  /** When something is wrong, the error is the one line worth reading under the field. */
  it('fieldShowsTheErrorInsteadOfTheHintTest', () => {
    act(() => root.render(<TextField label="Passwort" hint="Feststelltaste ist an" error="Falsch" />))

    expect(container.textContent).toContain('Falsch')
    expect(container.textContent).not.toContain('Feststelltaste')
  })

  it('fieldWithoutExtrasDescribesNothingTest', () => {
    act(() => root.render(<TextField label="Ort" />))

    expect(input().hasAttribute('aria-describedby')).toBe(false)
    expect(input().hasAttribute('aria-invalid')).toBe(false)
  })

  it('fieldReadsItsTooltipWithTheFieldTest', () => {
    act(() =>
      root.render(<TextField label="Kreditlimite" tooltip="In der Buchführungswährung." />),
    )

    expect(description()).toContain('In der Buchführungswährung.')
  })

  it('fieldShowsTheTooltipOnFocusTest', () => {
    act(() => root.render(<TextField label="Kreditlimite" tooltip="In der Buchführungswährung." />))
    const icon = container.querySelector('button[aria-label="Hinweis zu Kreditlimite"]') as HTMLButtonElement

    act(() => icon.focus())

    expect(bubble()?.textContent).toBe('In der Buchführungswährung.')
  })

  /** Escape closes the bubble and nothing else, the dialog around it stays open. */
  it('fieldClosesTheTooltipOnEscapeOnlyTest', () => {
    let closed = false
    act(() =>
      root.render(
        <Dialog open onClose={() => (closed = true)} title="Konditionen">
          <TextField label="Kreditlimite" tooltip="In der Buchführungswährung." />
        </Dialog>,
      ),
    )
    const icon = document.querySelector('button[aria-label="Hinweis zu Kreditlimite"]') as HTMLButtonElement
    act(() => icon.focus())

    act(() => {
      icon.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    })

    expect(closed).toBe(false)
    expect(bubble()).toBeNull()
  })

  it('fieldShowsALockForAFixedValueTest', () => {
    act(() => root.render(<TextField label="Firmenname" disabled locked="Steht fest." />))

    expect(container.querySelector('button[aria-label="Firmenname: nicht änderbar"]')).not.toBeNull()
  })
})
