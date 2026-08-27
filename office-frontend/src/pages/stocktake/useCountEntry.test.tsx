// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { StocktakeLine } from '../../lib/types'
import { focusCountField } from './useCountEntry'
import { StocktakeLineCards } from './StocktakeLineCards'
import { StocktakeLinesTable } from './StocktakeLinesTable'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * What both views of the counting mask are: the same lines, the same right to type into them,
 * and the same place a count goes.
 */
type LineView = (props: {
  lines: readonly StocktakeLine[]
  blind: boolean
  editable: boolean
  onCount: (line: StocktakeLine, quantity: number) => Promise<unknown>
}) => ReactNode

/**
 * The two layouts of the one route.
 *
 * <p>Every case below runs against both. They share one route because two would be two places
 * for the same mistake (issue #22) — and the same argument holds one layer down: the state
 * machine behind the field is one, so it is proven once, through both.
 */
const VIEWS: [string, LineView][] = [
  ['Tabelle', StocktakeLinesTable],
  ['Karten', StocktakeLineCards],
]

/** A line nobody has looked at yet. */
const OPEN: StocktakeLine = {
  id: 1,
  productId: 11,
  productNumber: 'P-100',
  productName: 'Schraube M6',
  unitShortName: 'Stk',
  expectedQuantity: 120,
  movedSinceCounting: false,
  addedDuringCounting: false,
  sortOrder: 1,
}

/** A second open line, so there is somewhere for the focus to go. */
const SECOND: StocktakeLine = {
  ...OPEN,
  id: 2,
  productId: 12,
  productNumber: 'P-200',
  productName: 'Mutter M6',
  expectedQuantity: 80,
  sortOrder: 2,
}

/** The same line after Anna counted it: a statement with a name and a time on it. */
const BY_ANNA: StocktakeLine = {
  ...OPEN,
  countedQuantity: 20,
  countedBy: 'Anna',
  countedAt: '2026-01-20T10:14:00Z',
}

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

/** Lets the promises of a save reach the view. */
async function settle() {
  for (let round = 0; round < 5; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

/**
 * Draws one of the two views and reports what it hands to the server.
 *
 * @param View the layout under test
 * @returns `draw` to render a set of lines — call it again for what a refetch brings down —
 *          and `sent`, the counts that went out, in order
 */
function mount(View: LineView) {
  const sent: { id: number; quantity: number }[] = []
  const draw = async (lines: readonly StocktakeLine[]) => {
    await act(async () => {
      root.render(
        <View
          lines={lines}
          blind={false}
          editable
          onCount={(line, quantity) => {
            sent.push({ id: line.id, quantity })
            return Promise.resolve()
          }}
        />,
      )
    })
    await settle()
  }
  return { sent, draw }
}

/** The quantity field of one line, by its place in the list — the same in both views. */
function countField(index: number): HTMLInputElement {
  const found = container.querySelector<HTMLInputElement>(`[data-count-index="${index}"]`)
  if (!found) throw new Error(`Kein Mengenfeld an Position ${index}`)
  return found
}

const text = () => container.textContent ?? ''

function button(label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === label,
  )
  if (!found) throw new Error(`Kein Knopf mit der Aufschrift "${label}"`)
  return found
}

function click(element: HTMLElement) {
  act(() => {
    element.click()
  })
}

/** Types into a field the way a browser does: set the value, then fire the native event. */
function type(control: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(control, value)
  act(() => {
    control.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

/**
 * Leaves a field the way a browser does.
 *
 * <p>React listens on `focusout`, not on `blur`: only the first of the two bubbles up to the
 * root the views are drawn in.
 */
function leave(control: HTMLElement) {
  act(() => {
    control.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
  })
}

function press(control: HTMLElement, key: string) {
  act(() => {
    control.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

describe.each(VIEWS)('useCountEntry in der Ansicht %s', (_name, View) => {
  /**
   * A count typed the way the mask writes quantities back: `1’200`, with the apostrophe of
   * de-CH. Both views accept it, so both have to send the same figure — a view that reads it
   * as nothing sends `null`, the request answers 400, and «Erneut senden» resends the same
   * nothing for ever.
   */
  it('useCountEntryReadsATypedThousandsApostropheTest', async () => {
    const view = mount(View)
    await view.draw([OPEN])
    const field = countField(0)

    type(field, '1’200')
    leave(field)
    await settle()

    expect(view.sent).toEqual([{ id: 1, quantity: 1200 }])
    expect(countField(0).getAttribute('aria-invalid')).toBeNull()
  })

  /**
   * The scenario Frontend-ADR-0016 exists for. I count 18, Anna makes it 20, a refetch brings
   * her figure down, and I count 18 again. What must not happen is nothing: the mask either
   * asks or sends, because a counted value is never lost in silence.
   */
  it('useCountEntryAsksAgainForARecountedLineTest', async () => {
    const view = mount(View)
    await view.draw([OPEN])
    const first = countField(0)
    type(first, '18')
    leave(first)
    await settle()
    expect(view.sent).toEqual([{ id: 1, quantity: 18 }])

    // Anna counted the same line 20 in the meantime, and the refetch brings that down.
    await view.draw([BY_ANNA])
    const again = countField(0)
    type(again, '')
    type(again, '18')
    leave(again)
    await settle()

    expect(container.querySelector('[role="alertdialog"]')).not.toBeNull()

    click(button('Überschreiben'))
    await settle()

    expect(view.sent).toEqual([
      { id: 1, quantity: 18 },
      { id: 1, quantity: 18 },
    ])
  })

  /** A figure that cannot be sent says why, and does not leave a red field without a word. */
  it('useCountEntryExplainsAValueItCannotSendTest', async () => {
    const view = mount(View)
    await view.draw([OPEN])
    const field = countField(0)

    type(field, 'abc')
    leave(field)
    await settle()

    expect(view.sent).toEqual([])
    expect(countField(0).getAttribute('aria-invalid')).toBe('true')
    expect(text()).toContain('Das ist keine Menge.')
  })

  /**
   * One sentence, one wording — the one Frontend-ADR-0016 writes out: «Gezählt von Anna um
   * 10:14 — überschreiben?». The time and not the date: whoever is asked is standing in the
   * aisle on the day of the count.
   */
  it('useCountEntryAsksWithTheWordingOfTheAdrTest', async () => {
    const view = mount(View)
    await view.draw([BY_ANNA])
    const field = countField(0)

    type(field, '75')
    leave(field)
    await settle()

    const question = container.querySelector('[role="alertdialog"] p')
    expect(question?.textContent).toMatch(/^Gezählt von Anna um \d{2}:\d{2} — überschreiben\?$/)
    expect(view.sent).toEqual([])
  })

  /**
   * One count, one request. `Enter` sends and then moves the focus into the next open line, and
   * that move leaves the field — whose blur sends as well. Unguarded that is two PUTs for every
   * counted line.
   */
  it('useCountEntrySendsOneRequestPerCountTest', async () => {
    const view = mount(View)
    await view.draw([OPEN, SECOND])
    const field = countField(0)

    act(() => field.focus())
    type(field, '118')
    press(field, 'Enter')
    await settle()
    leave(field)
    await settle()

    expect(view.sent).toEqual([{ id: 1, quantity: 118 }])
  })
})

/**
 * The one way onto a quantity field, proven on its own.
 *
 * <p>It used to stand twice, once in the mask and once on the page above it — the page needs it
 * because the camera sits above both views and has to reach a line without knowing which of them
 * is drawn. Two copies of the same three lines is how the two views drifted apart in the first
 * place, so there is one now.
 */
describe('focusCountField', () => {
  /** A bare box with the quantity fields of `count` lines in it, in the document. */
  function fields(count: number): HTMLDivElement {
    const box = document.createElement('div')
    for (let index = 0; index < count; index += 1) {
      const field = document.createElement('input')
      field.setAttribute('data-count-index', String(index))
      field.value = '42'
      box.appendChild(field)
    }
    document.body.appendChild(box)
    return box
  }

  /** The everyday case: a scan lands on a line, and the figure there is ready to be typed over. */
  it('focusCountFieldTest', () => {
    const box = fields(5)

    focusCountField(box, 2)

    const field = box.children[2] as HTMLInputElement
    expect(document.activeElement).toBe(field)
    expect(field.selectionStart).toBe(0)
    expect(field.selectionEnd).toBe(2)
    box.remove()
  })

  /**
   * Where the browser can scroll, the line is brought into view. A field focused three screens
   * down leaves the counter reading the wrong shelf.
   */
  it('focusCountFieldScrollsTheLineIntoViewTest', () => {
    const box = fields(3)
    const field = box.children[1] as HTMLInputElement
    const asked: unknown[] = []
    field.scrollIntoView = (options?: unknown) => {
      asked.push(options)
    }

    focusCountField(box, 1)

    expect(asked).toEqual([{ block: 'nearest' }])
    box.remove()
  })

  /**
   * Nothing is drawn yet, so the ref is empty. A scan that arrives first must not die on it —
   * and neither must a browser without a scroller, which is every test environment and which
   * the two cases above already run through.
   */
  it('focusCountFieldWithoutAContainerTest', () => {
    expect(() => focusCountField(null, 0)).not.toThrow()
  })

  /** A line that is not on this page: nothing moves, and nothing breaks. */
  it('focusCountFieldWithAnUnknownIndexTest', () => {
    const box = fields(2)
    const before = document.activeElement

    focusCountField(box, 7)

    expect(document.activeElement).toBe(before)
    box.remove()
  })
})
