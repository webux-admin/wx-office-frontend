// @vitest-environment jsdom
import { act, useState, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Choice } from '../lib/choices'
import { ChoiceField } from './ChoiceField'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const PROJECTS: Choice[] = [
  { value: '', label: 'Alle Projekte', quiet: true },
  { value: '12', label: 'P-00012 Website' },
  { value: '13', label: 'P-00013 Wartung' },
  { value: 'ohne', label: 'ohne Projekt', quiet: true },
]

let container: HTMLDivElement
let root: Root
/** Every value the field handed over, in order. */
let chosen: string[]

beforeEach(() => {
  chosen = []
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

/** A field that keeps its value, the way a filter in the address does. */
function Single({ choices = PROJECTS, initial = '' }: { choices?: Choice[]; initial?: string }) {
  const [value, setValue] = useState(initial)
  return (
    <ChoiceField
      label="Projekt"
      choices={choices}
      value={value}
      onChoose={(next) => {
        chosen.push(next)
        setValue(next)
      }}
      placeholder="Alle Projekte"
    />
  )
}

function render(element: ReactElement) {
  act(() => root.render(element))
}

const input = () => container.querySelector('input') as HTMLInputElement
const options = () => [...document.querySelectorAll('[role="option"]')]
const labels = () => options().map((option) => option.textContent)

function focus() {
  act(() => input().focus())
}

function type(value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input(), value)
    input().dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function press(key: string) {
  act(() => {
    input().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
  })
}

describe('ChoiceField', () => {
  /** Focused, the whole list opens with the chosen choice marked. */
  it('choiceFieldOpensTheListTest', () => {
    render(<Single initial="13" />)

    focus()

    expect(input().getAttribute('aria-expanded')).toBe('true')
    expect(labels()).toEqual(['Alle Projekte', 'P-00012 Website', 'P-00013 Wartung', 'ohne Projekt'])
    expect(options()[2].getAttribute('aria-selected')).toBe('true')
    expect(input().value).toBe('P-00013 Wartung')
  })

  /** Typing narrows the list and marks what matched; Enter takes the first hit. */
  it('choiceFieldSearchesAndTakesWithEnterTest', () => {
    render(<Single />)
    focus()

    type('wart')
    expect(labels()).toEqual(['P-00013 Wartung'])
    expect([...document.querySelectorAll('mark')].map((mark) => mark.textContent)).toEqual(['Wart'])
    press('Enter')

    expect(chosen).toEqual(['13'])
    expect(input().value).toBe('P-00013 Wartung')
    expect(options()).toHaveLength(0)
  })

  /** The arrow keys move the mark without the focus leaving the field. */
  it('choiceFieldWithTheArrowKeysTest', () => {
    render(<Single />)
    focus()

    press('ArrowDown')
    press('ArrowDown')
    press('ArrowDown')
    press('Enter')

    expect(chosen).toEqual(['ohne'])
    expect(document.activeElement).toBe(input())
  })

  /** «ohne Projekt» is a choice like any other, and so is «Alle». */
  it('choiceFieldTakesTheChoicesForNoneAndAllTest', () => {
    render(<Single initial="12" />)
    focus()

    type('ohne')
    press('Enter')
    focus()
    type('alle')
    press('Enter')

    expect(chosen).toEqual(['ohne', ''])
  })

  /** Escape shuts the list without a change and is not handed on to the mask around. */
  it('choiceFieldShutsWithEscapeTest', () => {
    render(<Single initial="12" />)
    focus()
    type('war')
    let reachedTheMask = false
    document.addEventListener('keydown', () => (reachedTheMask = true), { once: true })

    press('Escape')

    expect(options()).toHaveLength(0)
    expect(chosen).toEqual([])
    expect(input().value).toBe('P-00012 Website')
    expect(reachedTheMask).toBe(false)
  })

  /** Without a value the field adds: it stays empty after every choice. */
  it('choiceFieldThatAddsTest', () => {
    render(
      <ChoiceField
        label="Mitarbeitende"
        choices={[
          { value: '3', label: 'Anna Muster' },
          { value: '7', label: 'Beat Keller', detail: 'deaktiviert', quiet: true },
        ]}
        onChoose={(value) => chosen.push(value)}
        placeholder="Alle"
      />,
    )
    focus()

    type('kel')
    const option = options()[0] as HTMLElement
    act(() => option.click())

    expect(chosen).toEqual(['7'])
    expect(input().value).toBe('')
  })

  /** A term without a match says so, and Enter takes nothing. */
  it('choiceFieldWithoutAMatchTest', () => {
    render(<Single />)
    focus()

    type('xyz')
    press('Enter')

    expect(document.body.textContent).toContain('Für «xyz» gibt es keinen Treffer.')
    expect(chosen).toEqual([])
  })

  /** An empty list says what the field was given to say. */
  it('choiceFieldWithAnEmptyListTest', () => {
    render(
      <ChoiceField label="Mitarbeitende" choices={[]} onChoose={() => undefined} emptyText="Alle Personen sind gewählt." />,
    )
    focus()

    expect(document.body.textContent).toContain('Alle Personen sind gewählt.')
  })

  /** Five hundred choices: typing finds them at once. */
  it('choiceFieldWithFiveHundredChoicesTest', () => {
    const many = Array.from({ length: 500 }, (_, index) => ({
      value: String(index),
      label: `Projekt ${String(index).padStart(3, '0')}`,
    }))
    render(<Single choices={many} />)
    focus()
    expect(options()).toHaveLength(500)

    const started = performance.now()
    type('Projekt 42')
    const took = performance.now() - started

    expect(labels()).toEqual(['Projekt 420', 'Projekt 421', 'Projekt 422', 'Projekt 423', 'Projekt 424', 'Projekt 425', 'Projekt 426', 'Projekt 427', 'Projekt 428', 'Projekt 429'])
    expect(took).toBeLessThan(500)
  })
})
