// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FormMask } from './FormMask'
import { useChangeTracker } from './useChangeTracker'

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

/** A mask with one field, tracked the way the partner mask tracks its form. */
function Mask({ onSaved }: { onSaved?: () => void }) {
  const [value, setValue] = useState('')
  const { changed, track } = useChangeTracker()
  return (
    <FormMask
      title="Neuer Kunde"
      back={{ to: '/kunden', label: 'Kunden' }}
      dirty={changed}
      onSubmit={onSaved}
    >
      <div {...track}>
        <input aria-label="Firmenname" value={value} onChange={(event) => setValue(event.target.value)} />
      </div>
    </FormMask>
  )
}

async function render(mask = <Mask />) {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/kunden/neu']}>
        <Routes>
          <Route path="/kunden" element={<p>Kundenliste</p>} />
          <Route path="/kunden/neu" element={mask} />
        </Routes>
      </MemoryRouter>,
    )
  })
}

function type(input: HTMLInputElement, text: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setValue?.call(input, text)
  act(() => {
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function press(key: string, modifiers: KeyboardEventInit = {}) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true, ...modifiers }))
  })
}

function button(label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === label,
  )
  if (!found) throw new Error(`Kein Knopf mit der Aufschrift "${label}"`)
  return found
}

describe('FormMask', () => {
  it('formMaskLeavesOnEscapeWithoutChangesTest', async () => {
    await render()

    press('Escape')

    expect(container.textContent).toContain('Kundenliste')
  })

  it('formMaskAsksOnEscapeAfterChangesTest', async () => {
    await render()
    type(container.querySelector('input') as HTMLInputElement, 'Muster AG')

    press('Escape')

    expect(container.textContent).toContain('Änderungen verwerfen?')
    expect(container.textContent).not.toContain('Kundenliste')
  })

  it('formMaskLeavesOnceTheChangesAreDiscardedTest', async () => {
    await render()
    type(container.querySelector('input') as HTMLInputElement, 'Muster AG')
    press('Escape')

    act(() => button('Verwerfen').click())

    expect(container.textContent).toContain('Kundenliste')
  })

  it('formMaskStaysWhenTheUserKeepsEditingTest', async () => {
    await render()
    const input = container.querySelector('input') as HTMLInputElement
    type(input, 'Muster AG')
    press('Escape')

    act(() => button('Weiter bearbeiten').click())

    expect(container.textContent).not.toContain('Kundenliste')
    expect(input.value).toBe('Muster AG')
  })

  it('formMaskAsksOnTheBackLinkAfterChangesTest', async () => {
    await render()
    type(container.querySelector('input') as HTMLInputElement, 'Muster AG')

    act(() => {
      container.querySelector('a')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
      )
    })

    expect(container.textContent).toContain('Änderungen verwerfen?')
  })

  it('formMaskFollowsTheBackLinkWithoutChangesTest', async () => {
    await render()

    act(() => {
      container.querySelector('a')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
      )
    })

    expect(container.textContent).toContain('Kundenliste')
  })

  it('formMaskSavesOnBothShortcutsTest', async () => {
    let saved = 0
    await render(<Mask onSaved={() => (saved += 1)} />)

    press('s', { ctrlKey: true })
    press('Enter', { ctrlKey: true })

    expect(saved).toBe(2)
  })

  /** Escape with a modifier is another combination and must not throw work away. */
  it('formMaskIgnoresEscapeWithAModifierTest', async () => {
    await render()

    press('Escape', { shiftKey: true })

    expect(container.textContent).not.toContain('Kundenliste')
  })
})
