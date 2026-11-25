// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LookupField, MarkedText } from './LookupField'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type Fruit = { id: number; name: string }

const FRUITS: Fruit[] = [
  { id: 1, name: 'Apfel' },
  { id: 2, name: 'Aprikose' },
  { id: 3, name: 'Birne' },
]

let container: HTMLDivElement
let root: Root
/** What was taken over, in order. */
let taken: Fruit[]
/** Every Enter that reached the form around the field. */
let enterReachedTheForm: number
/** Whether each Escape arrived at the document already handled. */
let escapes: boolean[]
/** What the next search answers: the fruits matching it, or a failure. */
let answer: 'fruits' | 'failure'

function load(term: string): Promise<Fruit[]> {
  if (answer === 'failure') return Promise.reject(new Error('kaputt'))
  return Promise.resolve(FRUITS.filter((fruit) => fruit.name.toLowerCase().includes(term.toLowerCase())))
}

/** A form with one lookup, built the way the quick line uses it. */
function Form() {
  const [term, setTerm] = useState('')
  const [chosen, setChosen] = useState<Fruit | null>(null)
  return (
    <div
      onKeyDown={(event) => {
        if (event.key === 'Enter') enterReachedTheForm += 1
      }}
    >
      <LookupField<Fruit>
        label="Obst"
        term={term}
        onTerm={(next) => {
          setTerm(next)
          setChosen(null)
        }}
        chosen={chosen !== null}
        onChoose={(fruit) => {
          taken.push(fruit)
          setChosen(fruit)
          setTerm(fruit.name)
        }}
        queryKey={['fruit']}
        load={load}
        keyOf={(fruit) => fruit.id}
        renderHit={(fruit, search) => <MarkedText text={fruit.name} term={search} />}
        listLabel="Obstsorten"
        emptyText="Es gibt kein Obst."
        failureText="Das Obst konnte nicht gelesen werden."
      />
    </div>
  )
}

const onDocumentKey = (event: KeyboardEvent) => {
  if (event.key === 'Escape') escapes.push(event.defaultPrevented)
}

beforeEach(() => {
  taken = []
  enterReachedTheForm = 0
  escapes = []
  answer = 'fruits'
  container = document.createElement('div')
  document.body.appendChild(container)
  document.addEventListener('keydown', onDocumentKey)
  root = createRoot(container)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  act(() =>
    root.render(
      <QueryClientProvider client={client}>
        <Form />
      </QueryClientProvider>,
    ),
  )
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  document.removeEventListener('keydown', onDocumentKey)
})

/** Lets the debounce run out and the answer arrive. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 260))
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

function field(): HTMLInputElement {
  return container.querySelector('input') as HTMLInputElement
}

async function type(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(field(), value)
    field().dispatchEvent(new Event('input', { bubbles: true }))
  })
  await settle()
}

async function press(key: string) {
  await act(async () => {
    field().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
  })
}

const hits = () =>
  [...document.querySelectorAll('[role="option"]')].map((option) => option.textContent)

describe('LookupField', () => {
  /** A word and Enter take its first hit, and the form does not hear that Enter. */
  it('lookupFieldTest', async () => {
    await type('ap')

    expect(hits()).toEqual(['Apfel', 'Aprikose'])
    await press('Enter')

    expect(taken.map((fruit) => fruit.name)).toEqual(['Apfel'])
    expect(field().value).toBe('Apfel')
    expect(hits()).toEqual([])
    expect(enterReachedTheForm).toBe(0)
  })

  it('lookupFieldWithArrowKeysTest', async () => {
    await type('ap')

    await press('ArrowDown')
    await press('Enter')

    expect(taken.map((fruit) => fruit.name)).toEqual(['Aprikose'])
  })

  /**
   * The list floats in the body, under the field, so a dialog that scrolls its body cannot cut it
   * off after a few rows (#134).
   */
  it('lookupFieldFloatsAboveThePageTest', async () => {
    await type('ap')

    const list = document.querySelector('[data-lookup-list]') as HTMLElement

    expect(list.parentElement).toBe(document.body)
    expect(container.contains(list)).toBe(false)
    expect(list.className).toContain('fixed')
    // jsdom measures every box as zero: the list starts half a rem under a field at the top.
    expect(list.style.top).toBe('8px')
    expect(list.style.bottom).toBe('')
  })

  it('lookupFieldWithAClickTest', async () => {
    await type('bi')
    const option = document.querySelector('[role="option"]') as HTMLElement

    await act(async () => {
      option.click()
    })

    expect(taken.map((fruit) => fruit.name)).toEqual(['Birne'])
  })

  /**
   * An empty field opens the first hits for browsing but marks none: Enter there goes on to the
   * form, so a field that may stay empty is not filled by accident.
   */
  it('lookupFieldWithAnEmptyTermTest', async () => {
    await act(async () => {
      field().focus()
    })
    await settle()

    expect(hits()).toEqual(['Apfel', 'Aprikose', 'Birne'])
    await press('Enter')

    expect(taken).toEqual([])
    expect(enterReachedTheForm).toBe(1)
  })

  /** Escape shuts an open list and says so; on a shut list it is left to the mask. */
  it('lookupFieldWithEscapeTest', async () => {
    await type('ap')

    await press('Escape')

    expect(hits()).toEqual([])
    expect(field().value).toBe('ap')
    await press('Escape')
    expect(escapes).toEqual([true, false])
  })

  it('lookupFieldWithoutHitTest', async () => {
    await type('kiwi')

    expect(document.body.textContent).toContain('Für «kiwi» gibt es keinen Treffer.')
    await press('Enter')
    expect(taken).toEqual([])
    expect(enterReachedTheForm).toBe(1)
  })

  it('lookupFieldWhenTheHitsCannotBeReadTest', async () => {
    answer = 'failure'

    await type('ap')

    expect(document.querySelector('[role="alert"]')?.textContent).toBe(
      'Das Obst konnte nicht gelesen werden.',
    )
    expect(hits()).toEqual([])
  })

  /** The part of a hit the term matched is marked, the rest is not. */
  it('lookupFieldMarksWhatMatchedTest', async () => {
    await type('rik')

    expect([...document.querySelectorAll('mark')].map((mark) => mark.textContent)).toEqual(['rik'])
  })
})
