// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SegmentedControl } from './SegmentedControl'

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

const KINDS = [
  { value: 'ORGANISATION', label: 'Firma' },
  { value: 'PERSON', label: 'Person' },
] as const

function Kind() {
  const [kind, setKind] = useState<'ORGANISATION' | 'PERSON'>('ORGANISATION')
  return (
    <>
      <SegmentedControl label="Art" options={KINDS} value={kind} onChange={setKind} />
      <output>{kind}</output>
    </>
  )
}

function radio(label: string): HTMLInputElement {
  const found = [...container.querySelectorAll('label')].find((entry) => entry.textContent === label)
  return found?.querySelector('input') as HTMLInputElement
}

describe('SegmentedControl', () => {
  it('segmentedControlTest', () => {
    act(() => root.render(<Kind />))

    act(() => radio('Person').click())

    expect(container.querySelector('output')?.textContent).toBe('PERSON')
    expect(radio('Person').checked).toBe(true)
    expect(radio('Firma').checked).toBe(false)
  })

  /** A group a screen reader announces, with its name. */
  it('segmentedControlNamesTheGroupTest', () => {
    act(() => root.render(<Kind />))

    expect(container.querySelector('fieldset legend')?.textContent).toBe('Art')
  })

  it('segmentedControlDisabledTest', () => {
    act(() =>
      root.render(
        <SegmentedControl label="Art" options={KINDS} value="PERSON" onChange={() => {}} disabled />,
      ),
    )

    expect(container.querySelector('fieldset')?.disabled).toBe(true)
  })
})
