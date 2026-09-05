// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SplitButton } from './SplitButton'

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

const onPrimary = vi.fn()
const onTakeover = vi.fn()
const onCopy = vi.fn()

function render() {
  onPrimary.mockClear()
  onTakeover.mockClear()
  onCopy.mockClear()
  act(() =>
    root.render(
      <SplitButton
        onClick={onPrimary}
        menuLabel="Weitere Wege"
        actions={[
          { id: 'takeover', label: 'Übernehmen', onSelect: onTakeover },
          { id: 'copy', label: 'Kopieren', onSelect: onCopy },
        ]}
      >
        Auftrag erfassen
      </SplitButton>,
    ),
  )
}

/** The left half. */
function primary(): HTMLButtonElement {
  return [...container.querySelectorAll('button')].find(
    (button) => button.textContent?.includes('Auftrag erfassen'),
  ) as HTMLButtonElement
}

/** The arrow. */
function toggle(): HTMLButtonElement {
  return container.querySelector('button[aria-haspopup="menu"]') as HTMLButtonElement
}

function menuItems(): HTMLButtonElement[] {
  return [...container.querySelectorAll('[role="menuitem"]')] as HTMLButtonElement[]
}

/**
 * Whether the menu counts as open.
 *
 * <p>Read off aria-expanded rather than off the DOM: the exit animation keeps the box around
 * for a moment, and aria-expanded is what a screen reader goes by anyway.
 */
function isOpen(): boolean {
  return toggle().getAttribute('aria-expanded') === 'true'
}

function press(element: HTMLElement, key: string) {
  act(() => {
    element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

describe('SplitButton', () => {
  it('splitButtonTest', () => {
    render()

    expect(primary()).toBeTruthy()
    expect(isOpen()).toBe(false)
    expect(menuItems()).toHaveLength(0)
  })

  it('splitButtonRunsThePrimaryActionTest', () => {
    render()

    act(() => primary().click())

    expect(onPrimary).toHaveBeenCalledTimes(1)
    // The common way stays one click: no menu is involved.
    expect(isOpen()).toBe(false)
  })

  it('splitButtonOpensTheMenuTest', () => {
    render()

    act(() => toggle().click())

    expect(isOpen()).toBe(true)
    expect(menuItems().map((item) => item.textContent)).toEqual(['Übernehmen', 'Kopieren'])
  })

  it('splitButtonPicksAnActionTest', () => {
    render()
    act(() => toggle().click())

    act(() => menuItems()[1].click())

    expect(onCopy).toHaveBeenCalledTimes(1)
    expect(onPrimary).not.toHaveBeenCalled()
    // Picking closes the menu.
    expect(isOpen()).toBe(false)
  })

  it('splitButtonWalksTheMenuWithArrowKeysTest', () => {
    render()
    act(() => toggle().click())

    expect(document.activeElement).toBe(menuItems()[0])
    press(menuItems()[0], 'ArrowDown')
    expect(document.activeElement).toBe(menuItems()[1])
    press(menuItems()[1], 'ArrowDown')
    // Walks round rather than stopping at the end.
    expect(document.activeElement).toBe(menuItems()[0])
  })

  it('splitButtonWalksBackwardsTest', () => {
    render()
    act(() => toggle().click())

    press(menuItems()[0], 'ArrowUp')

    expect(document.activeElement).toBe(menuItems()[1])
  })

  it('splitButtonOpensAtTheLastEntryOnArrowUpTest', () => {
    render()

    press(toggle(), 'ArrowUp')

    expect(menuItems()).toHaveLength(2)
    expect(document.activeElement).toBe(menuItems()[1])
  })

  it('splitButtonClosesOnEscapeTest', () => {
    render()
    act(() => toggle().click())

    press(menuItems()[0], 'Escape')

    expect(isOpen()).toBe(false)
    // Focus goes back to the arrow, or the next Tab would start at the top of the page.
    expect(document.activeElement).toBe(toggle())
  })

  it('splitButtonClosesOnAClickElsewhereTest', () => {
    render()
    act(() => toggle().click())

    act(() => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })

    expect(isOpen()).toBe(false)
  })

  it('splitButtonWithoutTheRightTest', () => {
    act(() =>
      root.render(
        <SplitButton onClick={onPrimary} menuLabel="Weitere Wege" actions={[]} disabled>
          Auftrag erfassen
        </SplitButton>,
      ),
    )

    expect(primary().disabled).toBe(true)
    expect(toggle().disabled).toBe(true)
  })

  it('splitButtonNamesTheArrowForScreenReadersTest', () => {
    render()

    expect(toggle().getAttribute('aria-label')).toBe('Weitere Wege')
    expect(toggle().getAttribute('aria-haspopup')).toBe('menu')
  })

  /**
   * The rule sits **on** the entry it stands above, so it changes no count and no index: the
   * menu holds as many entries as `actions` has, and the arrow keys walk all of them.
   */
  it('splitButtonDrawsASeparatorTest', () => {
    act(() =>
      root.render(
        <SplitButton
          onClick={onPrimary}
          menuLabel="Weitere Wege"
          actions={[
            { id: 'takeover', label: 'Übernehmen', onSelect: onTakeover },
            { id: 'copy', label: 'Kopieren', onSelect: onCopy, separatorBefore: true },
          ]}
        >
          Auftrag erfassen
        </SplitButton>,
      ),
    )
    act(() => toggle().click())

    expect(menuItems()).toHaveLength(2)
    expect(menuItems()[0].getAttribute('data-separator')).toBeNull()
    expect(menuItems()[1].getAttribute('data-separator')).toBe('true')

    // The walk is untouched: the second entry is still one step away from the first.
    press(menuItems()[0], 'ArrowDown')
    expect(document.activeElement).toBe(menuItems()[1])
  })

  /**
   * Half off: the usual way has nothing to work on, but the way to give it something sits
   * behind the arrow. Switching the whole button off would take that away.
   */
  it('splitButtonWithADisabledPrimaryTest', () => {
    act(() =>
      root.render(
        <SplitButton
          onClick={onPrimary}
          menuLabel="Weitere Wege"
          primaryDisabled
          actions={[{ id: 'takeover', label: 'Übernehmen', onSelect: onTakeover }]}
        >
          Auftrag erfassen
        </SplitButton>,
      ),
    )

    expect(primary().disabled).toBe(true)
    expect(toggle().disabled).toBe(false)

    act(() => toggle().click())

    expect(isOpen()).toBe(true)
    act(() => menuItems()[0].click())
    expect(onTakeover).toHaveBeenCalledTimes(1)
  })

  /**
   * The note is read, not operated: it is no `menuitem`, it takes no focus, and the arrow keys
   * walk from the first entry to the last without ever landing on it.
   */
  it('splitButtonShowsANoteTest', () => {
    act(() =>
      root.render(
        <SplitButton
          onClick={onPrimary}
          menuLabel="Weitere Wege"
          note="Noch keine Vorlage."
          actions={[
            { id: 'takeover', label: 'Übernehmen', onSelect: onTakeover },
            { id: 'copy', label: 'Kopieren', onSelect: onCopy },
          ]}
        >
          Auftrag erfassen
        </SplitButton>,
      ),
    )
    act(() => toggle().click())

    const note = container.querySelector('[role="presentation"]')
    expect(note?.textContent).toBe('Noch keine Vorlage.')
    expect(note?.tagName).toBe('P')
    expect(menuItems()).toHaveLength(2)

    // The walk starts at the first entry and wraps back to it, never onto the note.
    expect(document.activeElement).toBe(menuItems()[0])
    press(menuItems()[0], 'ArrowUp')
    expect(document.activeElement).toBe(menuItems()[1])
    press(menuItems()[1], 'ArrowDown')
    expect(document.activeElement).toBe(menuItems()[0])
  })
})
