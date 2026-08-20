// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Tabs } from './Tabs'

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

type Register = 'hauptdaten' | 'preise' | 'buchhaltung'

const REGISTERS = [
  { id: 'hauptdaten' as Register, label: 'Hauptdaten' },
  { id: 'preise' as Register, label: 'Preise' },
  { id: 'buchhaltung' as Register, label: 'Buchhaltung' },
]

function Mask() {
  const [tab, setTab] = useState<Register>('hauptdaten')
  return (
    <>
      <Tabs tabs={REGISTERS} active={tab} onChange={setTab} label="Register" />
      <p>{tab}</p>
    </>
  )
}

const buttons = () => Array.from(container.querySelectorAll('button'))

describe('Tabs', () => {
  it('tabsShowsOneButtonPerRegisterTest', () => {
    act(() => root.render(<Mask />))

    expect(buttons().map((button) => button.textContent)).toEqual([
      'Hauptdaten',
      'Preise',
      'Buchhaltung',
    ])
  })

  it('tabsMarksTheOpenRegisterTest', () => {
    act(() => root.render(<Mask />))

    expect(buttons().map((button) => button.getAttribute('aria-selected'))).toEqual([
      'true',
      'false',
      'false',
    ])
  })

  it('tabsSwitchesOnClickTest', () => {
    act(() => root.render(<Mask />))

    act(() => buttons()[1].click())

    expect(container.querySelector('p')?.textContent).toBe('preise')
    expect(buttons()[1].getAttribute('aria-selected')).toBe('true')
  })

  it('tabsWithASingleRegisterTest', () => {
    act(() =>
      root.render(
        <Tabs tabs={[{ id: 'nur', label: 'Nur eines' }]} active="nur" onChange={() => {}} label="Register" />,
      ),
    )

    expect(buttons()).toHaveLength(1)
    expect(buttons()[0].getAttribute('aria-selected')).toBe('true')
  })

  it('tabsWithoutRegistersTest', () => {
    act(() => root.render(<Tabs tabs={[]} active="" onChange={() => {}} label="Register" />))

    expect(buttons()).toHaveLength(0)
    expect(container.querySelector('[role="tablist"]')).not.toBeNull()
  })
})
