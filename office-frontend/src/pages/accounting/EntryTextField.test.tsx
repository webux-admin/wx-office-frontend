// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EntrySuggestion } from '../../lib/types'
import { EntryTextField } from './EntryTextField'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1

/** What `useQuickSearch` holds the term back by — `useDebouncedValue(value.trim())`. */
const DEBOUNCE = 200

const MIETE: EntrySuggestion = {
  text: 'Miete September',
  useCount: 11,
  lastBookedOn: '2026-08-09',
  lines: [
    {
      accountId: 4,
      accountNumber: '6000',
      accountName: 'Raumaufwand',
      side: 'DEBIT',
      amount: 3200,
      taxCodeId: null,
      taxCode: null,
      text: null,
      postable: true,
    },
    {
      accountId: 1,
      accountNumber: '1020',
      accountName: 'Bankguthaben',
      side: 'CREDIT',
      amount: 3200,
      taxCodeId: null,
      taxCode: null,
      text: null,
      postable: true,
    },
  ],
}

const LAGER: EntrySuggestion = {
  text: 'Mietzins Lager',
  useCount: 4,
  lastBookedOn: '2026-07-01',
  lines: [MIETE.lines[0], MIETE.lines[1]],
}

let container: HTMLDivElement
let root: Root
let asked: string[]

const onChange = vi.fn()
const onPick = vi.fn()

function json(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

/** Answers every suggestion call with the two rows above, and records what was asked. */
function stubFetch(answer: EntrySuggestion[] = [MIETE, LAGER]) {
  vi.stubGlobal('fetch', (url: string) => {
    asked.push(url)
    return json(answer)
  })
}

beforeEach(() => {
  asked = []
  onChange.mockClear()
  onPick.mockClear()
  stubFetch()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

/**
 * Draws the field. The mask owns the value, so the test plays the mask: what `onChange`
 * reports is rendered back in, exactly the way `EntryPage` does it.
 */
async function paint(initial = '') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  let shown = initial
  const render = () =>
    act(() => {
      root.render(
        <QueryClientProvider client={client}>
          <EntryTextField
            tenantId={TENANT}
            value={shown}
            onChange={(next) => {
              shown = next
              onChange(next)
            }}
            onPick={onPick}
          />
        </QueryClientProvider>,
      )
    })
  await render()
  return render
}

function input(): HTMLInputElement {
  return container.querySelector('input') as HTMLInputElement
}

function options(): HTMLLIElement[] {
  return [...container.querySelectorAll('[role="option"]')] as HTMLLIElement[]
}

function listbox(): HTMLElement | null {
  return container.querySelector('[role="listbox"]')
}

/** One keystroke, the way React notices one. */
function type(value: string) {
  const field = input()
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )?.set
    setter?.call(field, value)
    field.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function press(key: string) {
  act(() => {
    input().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
  })
}

/**
 * Waits past the debounce and lets the query settle, painting between the rounds.
 *
 * <p>Two waits are needed and not one: the request only goes out once the debounce has let the
 * term through, so the answer cannot be there before a second turn of the loop.
 */
async function settle(render: () => Promise<void> | void) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, DEBOUNCE + 60))
  })
  for (let round = 0; round < 4; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
    await render()
  }
}

describe('EntryTextField', () => {
  /**
   * The everyday case: three characters, one debounce, and the list stands with what was
   * booked under such a text before — most used first, with its count and its last date.
   */
  it('entryTextFieldTest', async () => {
    const render = await paint()

    type('Mie')
    await settle(render)

    expect(options().map((option) => option.textContent)).toEqual([
      'Miete September11× · 09.08.2026',
      'Mietzins Lager4× · 01.07.2026',
    ])
    expect(asked).toHaveLength(1)
    expect(asked[0]).toContain('q=Mie')
    expect(asked[0]).toContain('limit=8')
  })

  /**
   * The lower edge of the range. One character finds no usable choice among a thousand
   * entries and costs a round trip on every keystroke all the same — so the field asks
   * nothing at all, and the list stays away.
   */
  it('entryTextFieldWithOneCharacterTest', async () => {
    const render = await paint()

    type('M')
    await settle(render)

    expect(asked).toEqual([])
    expect(listbox()).toBeNull()
  })

  /**
   * The other edge: an empty field. Deleting the last character has to take the list with
   * it, or a list from before hangs over a field that says nothing.
   */
  it('entryTextFieldClearedTest', async () => {
    const render = await paint()
    type('Mie')
    await settle(render)
    expect(options()).toHaveLength(2)

    type('')
    await settle(render)

    expect(listbox()).toBeNull()
  })

  /**
   * The list only ever stands over the **settled** term. While the debounce is catching up,
   * the answer belongs to the term before it — and a list read as the answer to what was just
   * typed is the one thing Enter must not take.
   */
  it('entryTextFieldWhileTheDebounceLagsTest', async () => {
    const render = await paint()
    type('Mie')
    await settle(render)
    expect(options()).toHaveLength(2)

    // One more keystroke, and no waiting: the term still says «Mie», the field says «Miet».
    type('Miet')
    await render()

    expect(listbox()).toBeNull()
  })

  /**
   * Arrow keys walk the list and Enter picks — the keyboard model of the account search of
   * the grid, so this mask has one and not two. Picking reports the text **and** the entry it
   * came from, because the accounts travel with it.
   */
  it('entryTextFieldPicksWithEnterTest', async () => {
    const render = await paint()
    type('Mie')
    await settle(render)

    press('ArrowDown')
    await render()
    expect(options()[1].getAttribute('aria-selected')).toBe('true')

    press('Enter')
    await render()

    expect(onChange).toHaveBeenLastCalledWith('Mietzins Lager')
    expect(onPick).toHaveBeenCalledTimes(1)
    expect(onPick.mock.calls[0][0]).toEqual(LAGER)
    expect(listbox()).toBeNull()
  })

  /** The highlight cannot walk off either end; it stops at the last row and at the first. */
  it('entryTextFieldArrowKeysStopAtTheEndsTest', async () => {
    const render = await paint()
    type('Mie')
    await settle(render)

    press('ArrowDown')
    press('ArrowDown')
    press('ArrowDown')
    await render()
    expect(options()[1].getAttribute('aria-selected')).toBe('true')

    press('ArrowUp')
    press('ArrowUp')
    press('ArrowUp')
    await render()
    expect(options()[0].getAttribute('aria-selected')).toBe('true')
  })

  /**
   * Escape closes the list and leaves what was typed standing. It must not reach the grid
   * around it either — the same key cancels a cell there.
   */
  it('entryTextFieldClosesOnEscapeTest', async () => {
    const render = await paint()
    type('Mie')
    await settle(render)

    // Above the React root, so what the field stops really has stopped.
    let reachedTheMask = false
    const listener = () => {
      reachedTheMask = true
    }
    document.body.addEventListener('keydown', listener)

    press('Escape')
    await render()
    document.body.removeEventListener('keydown', listener)

    expect(listbox()).toBeNull()
    expect(reachedTheMask).toBe(false)
    expect(input().value).toBe('Mie')
    expect(onPick).not.toHaveBeenCalled()
  })

  /**
   * A click on a row picks it. The row swallows the mousedown so the field keeps the focus —
   * otherwise the blur closes the list before the click ever lands.
   */
  it('entryTextFieldPicksWithTheMouseTest', async () => {
    const render = await paint()
    type('Mie')
    await settle(render)

    act(() => {
      options()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await render()

    expect(onChange).toHaveBeenLastCalledWith('Miete September')
    expect(onPick).toHaveBeenCalledTimes(1)
    expect(onPick.mock.calls[0][0]).toEqual(MIETE)
  })

  /**
   * **Typing a text by hand is not picking it**, even when it matches a suggestion word for
   * word. The accounts of a suggestion are only ever proposed for a text somebody chose from
   * the list; on a merely similar text they would be guessed.
   */
  it('entryTextFieldTypedByHandDoesNotPickTest', async () => {
    const render = await paint()

    type('Miete September')
    await settle(render)

    expect(onChange).toHaveBeenLastCalledWith('Miete September')
    expect(onPick).not.toHaveBeenCalled()
  })

  /** Nothing was ever booked under such a text: no list, and Enter stays the mask's own key. */
  it('entryTextFieldWithoutMatchesTest', async () => {
    stubFetch([])
    const render = await paint()

    type('Xyz')
    await settle(render)

    expect(asked).toHaveLength(1)
    expect(listbox()).toBeNull()

    press('Enter')
    await render()
    expect(onPick).not.toHaveBeenCalled()
  })

  /**
   * A refused call must not take the mask with it. The field goes on holding what was typed,
   * and simply has nothing to suggest.
   */
  it('entryTextFieldWhenTheCallFailsTest', async () => {
    vi.stubGlobal('fetch', (url: string) => {
      asked.push(url)
      return Promise.reject(new Error('Netz weg'))
    })
    const render = await paint()

    type('Mie')
    await settle(render)

    expect(listbox()).toBeNull()
    expect(input().value).toBe('Mie')
  })

  /**
   * The combobox says what is actually drawn, never what was wished for: no list, no
   * `aria-expanded`, no `aria-activedescendant` — and with a list, the highlighted row is
   * named, because the focus stays in the field somebody is typing in.
   */
  it('entryTextFieldAnnouncesTheListTest', async () => {
    const render = await paint()

    expect(input().getAttribute('role')).toBe('combobox')
    expect(input().getAttribute('aria-expanded')).toBe('false')
    expect(input().getAttribute('aria-activedescendant')).toBeNull()

    type('Mie')
    await settle(render)

    expect(input().getAttribute('aria-expanded')).toBe('true')
    expect(input().getAttribute('aria-controls')).toBe(listbox()?.id)
    expect(input().getAttribute('aria-activedescendant')).toBe(options()[0].id)
    expect(listbox()?.getAttribute('aria-label')).toBe('Textvorschläge')
  })

  /**
   * `accounting_entry.description` is `VARCHAR(200)`; a field that lets somebody type 300
   * characters hands them a refusal at the end of an entry instead of at the keystroke.
   */
  it('entryTextFieldLimitsTheLengthTest', async () => {
    await paint()

    expect(input().maxLength).toBe(200)
  })
})
