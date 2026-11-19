// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FactList } from './FactList'

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

describe('FactList', () => {
  it('factListTest', () => {
    act(() =>
      root.render(
        <FactList
          facts={[
            { label: 'Adresse', value: 'Bahnhofstrasse 12, 8001 Zürich' },
            { label: 'Telefon', value: '044 123 45 67' },
          ]}
        />,
      ),
    )

    expect([...container.querySelectorAll('dt')].map((term) => term.textContent)).toEqual([
      'Adresse',
      'Telefon',
    ])
  })

  /** A fact without a value is left out rather than drawn with a dash. */
  it('factListLeavesOutEmptyFactsTest', () => {
    act(() =>
      root.render(
        <FactList
          facts={[
            { label: 'Adresse', value: 'Bahnhofstrasse 12, 8001 Zürich' },
            { label: 'Telefon', value: undefined },
            { label: 'E-Mail', value: '' },
          ]}
        />,
      ),
    )

    expect(container.querySelectorAll('dt')).toHaveLength(1)
  })

  it('factListWithoutAnyValueTest', () => {
    act(() => root.render(<FactList facts={[{ label: 'Telefon', value: null }]} />))

    expect(container.innerHTML).toBe('')
  })
})
