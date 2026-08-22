// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDebouncedValue } from './useDebouncedValue'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

beforeEach(() => {
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

/** Shows what the hook currently lets through, so a test can read it off the page. */
function Probe({ value, delay }: { value: string; delay?: number }) {
  return <p>{useDebouncedValue(value, delay)}</p>
}

function show(value: string, delay?: number) {
  act(() => root.render(<Probe value={value} delay={delay} />))
}

function wait(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

const text = () => container.textContent

describe('useDebouncedValue', () => {
  it('useDebouncedValueTest', () => {
    show('Wart')
    show('Wartung')

    expect(text()).toBe('Wart')

    wait(200)

    expect(text()).toBe('Wartung')
  })

  it('useDebouncedValuePassesTheFirstValueThroughTest', () => {
    show('Wartung')

    // A mask that opens with a term in its field must not start out empty.
    expect(text()).toBe('Wartung')
  })

  it('useDebouncedValueSkipsWhatWasTypedOverTest', () => {
    show('W')
    wait(100)
    show('Wa')
    wait(100)
    show('War')
    wait(100)

    // Nothing stood still for long enough yet, so the first value is still the one.
    expect(text()).toBe('W')

    wait(200)

    expect(text()).toBe('War')
  })

  it('useDebouncedValueWithItsOwnDelayTest', () => {
    show('eins', 500)
    show('zwei', 500)
    wait(200)

    expect(text()).toBe('eins')

    wait(300)

    expect(text()).toBe('zwei')
  })

  it('useDebouncedValueWithAnEmptyValueTest', () => {
    show('Wartung')
    show('')
    wait(200)

    expect(text()).toBe('')
  })
})
