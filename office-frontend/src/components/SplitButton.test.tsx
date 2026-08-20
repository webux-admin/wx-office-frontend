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
})
