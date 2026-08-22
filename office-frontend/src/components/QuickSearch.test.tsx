// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QuickSearchField } from './QuickSearch'
import { useQuickSearch } from './useQuickSearch'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  // The term is debounced, so the clock has to be ours: without it every test would have to
  // wait out the real delay.
  vi.useFakeTimers()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.useRealTimers()
})

/** Lets the debounce run out, so what was typed reaches the term the request is built from. */
function settle() {
  act(() => {
    vi.advanceTimersByTime(250)
  })
}

/**
 * A list built the way the list screens are: the field reports what was typed, and the term
 * the request would carry is written out beside it so a test can read it.
 */
function List({ label, placeholder }: { label?: string; placeholder?: string }) {
  const search = useQuickSearch()
  return (
    <>
      <QuickSearchField
        value={search.value}
        onChange={search.setValue}
        label={label}
        placeholder={placeholder}
      />
      <p id="term">{search.term}</p>
    </>
  )
}

/** Types the whole value the way a browser does: set the value, then fire the native event. */
function type(input: HTMLInputElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setValue?.call(input, value)
  act(() => {
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function field(): HTMLInputElement {
  return container.querySelector('input') as HTMLInputElement
}

function term(): string {
  return container.querySelector('#term')?.textContent ?? ''
}

describe('useQuickSearch', () => {
  it('useQuickSearchTest', () => {
    act(() => root.render(<List />))

    type(field(), 'meier')
    settle()

    expect(field().value).toBe('meier')
    expect(term()).toBe('meier')
  })

  /**
   * The field answers at once, the request does not: a term that reached the query on every
   * keystroke would send one call per letter.
   */
  it('useQuickSearchWaitsForTheTypingToStopTest', () => {
    act(() => root.render(<List />))

    type(field(), 'mei')

    expect(field().value).toBe('mei')
    expect(term()).toBe('')

    settle()

    expect(term()).toBe('mei')
  })

  /** Nothing typed must not become a filter; the list shows everything. */
  it('useQuickSearchWithEmptyValueTest', () => {
    act(() => root.render(<List />))

    expect(field().value).toBe('')
    expect(term()).toBe('')
  })

  /** A field holding only spaces is an empty search, not a search for a space. */
  it('useQuickSearchWithBlankValueTest', () => {
    act(() => root.render(<List />))

    type(field(), '   ')
    settle()

    expect(field().value).toBe('   ')
    expect(term()).toBe('')
  })

  /** Only the ends are trimmed: two words stay two words. */
  it('useQuickSearchWithSurroundingSpaceTest', () => {
    act(() => root.render(<List />))

    type(field(), '  meier ag  ')
    settle()

    expect(field().value).toBe('  meier ag  ')
    expect(term()).toBe('meier ag')
  })

  /** Clearing the field takes the filter away again. */
  it('useQuickSearchClearedTest', () => {
    act(() => root.render(<List />))
    type(field(), 'meier')
    settle()

    type(field(), '')
    settle()

    expect(term()).toBe('')
  })
})

describe('QuickSearchField', () => {
  it('quickSearchFieldTest', () => {
    act(() => root.render(<List placeholder="Name oder Kundennummer" />))

    expect(container.textContent).toContain('Suchen')
    expect(field().placeholder).toBe('Name oder Kundennummer')
  })

  /** The label is what the field is announced as, so it must reach the input. */
  it('quickSearchFieldWithOwnLabelTest', () => {
    act(() => root.render(<List label="Beleg suchen" />))

    const label = container.querySelector('label') as HTMLLabelElement
    expect(label.textContent).toContain('Beleg suchen')
    expect(label.htmlFor).toBe(field().id)
  })

  /** Without a placeholder the field stays empty rather than showing "undefined". */
  it('quickSearchFieldWithoutPlaceholderTest', () => {
    act(() => root.render(<List />))

    expect(field().placeholder).toBe('')
  })
})
