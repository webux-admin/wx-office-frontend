// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { RegisterNav, type RegisterItem } from './RegisterNav'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const REGISTERS: RegisterItem[] = [
  { href: '/zahlungskonditionen', label: 'Zahlungskonditionen' },
  { href: '/preisgruppen', label: 'Preisgruppen' },
  { href: '/preise-erfassen', label: 'Schnellerfassung' },
]

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

async function render(registers: RegisterItem[], at: string) {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[at]}>
        <RegisterNav registers={registers} label="Verkaufskonditionen" />
      </MemoryRouter>,
    )
  })
}

function links(): HTMLAnchorElement[] {
  return [...container.querySelectorAll('a')] as HTMLAnchorElement[]
}

describe('RegisterNav', () => {
  /** Links and not buttons: a register is a screen, with a bookmark and a middle click. */
  it('registerNavShowsOneLinkPerRegisterTest', async () => {
    await render(REGISTERS, '/zahlungskonditionen')

    expect(links().map((link) => link.textContent)).toEqual([
      'Zahlungskonditionen',
      'Preisgruppen',
      'Schnellerfassung',
    ])
    expect(links().map((link) => link.getAttribute('href'))).toEqual([
      '/zahlungskonditionen',
      '/preisgruppen',
      '/preise-erfassen',
    ])
  })

  it('registerNavMarksTheOpenRegisterTest', async () => {
    await render(REGISTERS, '/preisgruppen')

    const current = links().filter((link) => link.getAttribute('aria-current') === 'page')
    expect(current.map((link) => link.textContent)).toEqual(['Preisgruppen'])
  })

  /**
   * One register is still a strip.
   *
   * <p>The case of a tenant whose rights or switched-off modules took the siblings away —
   * the strip then says «this is all there is here» rather than disappearing.
   */
  it('registerNavWithASingleRegisterTest', async () => {
    await render([REGISTERS[0]], '/zahlungskonditionen')

    expect(links()).toHaveLength(1)
    expect(links()[0].getAttribute('aria-current')).toBe('page')
  })

  /** The strip names itself, for a screen reader that lands on it out of context. */
  it('registerNavIsLabelledTest', async () => {
    await render(REGISTERS, '/zahlungskonditionen')

    expect(container.querySelector('nav')?.getAttribute('aria-label')).toBe(
      'Verkaufskonditionen',
    )
    // No tablist: that would promise arrow keys between panels of one page.
    expect(container.querySelector('[role=tablist]')).toBeNull()
  })
})
