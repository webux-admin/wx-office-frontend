// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../../auth/authContext'
import type { Stocktake, StocktakeLine } from '../../lib/types'
import { StocktakePage } from '../StocktakePage'
import { StocktakeLineCards } from './StocktakeLineCards'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1

/** An open line: 120 pieces expected, nobody has looked yet. */
const SCHRAUBE: StocktakeLine = {
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

/** A line somebody else already counted — the one the mask asks about before overwriting. */
const MUTTER: StocktakeLine = {
  id: 2,
  productId: 12,
  productNumber: 'P-200',
  productName: 'Mutter M6',
  unitShortName: 'Stk',
  expectedQuantity: 80,
  countedQuantity: 80,
  countedBy: 'Anna',
  countedAt: '2026-01-20T10:14:00Z',
  movedSinceCounting: false,
  addedDuringCounting: false,
  sortOrder: 2,
}

/** A second open line, behind the counted one: what «weiter» has to skip to. */
const SCHEIBE: StocktakeLine = {
  id: 3,
  productId: 13,
  productNumber: 'P-300',
  productName: 'Scheibe M6',
  unitShortName: 'Stk',
  expectedQuantity: 40,
  movedSinceCounting: false,
  addedDuringCounting: false,
  sortOrder: 3,
}

/** A line standing for one single piece: a count above 1 is not a quantity but a mistake. */
const SERIE: StocktakeLine = {
  id: 4,
  productId: 14,
  productNumber: 'P-400',
  productName: 'Bohrmaschine',
  unitShortName: 'Stk',
  lotId: 91,
  lotNumber: 'SN-4711',
  expectedQuantity: 1,
  movedSinceCounting: false,
  addedDuringCounting: false,
  sortOrder: 4,
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
  delete (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector
  // Put on the navigator with a property of its own, which `vi.unstubAllGlobals` does not
  // reach — without this the camera outlives the test that asked for it.
  delete (navigator as unknown as { mediaDevices?: unknown }).mediaDevices
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

/** What the cards sent, so a test can check what went out and what did not. */
type Calls = { sent: { line: StocktakeLine; quantity: number }[] }

async function settle() {
  for (let round = 0; round < 5; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

/**
 * Draws the cards over the given lines.
 *
 * @param lines what is being counted
 * @param options `blind` hides the expected quantity, `fail` lets every save fail, `editable`
 *        is off once the list is booked
 */
async function render(
  lines: readonly StocktakeLine[],
  options: { blind?: boolean; editable?: boolean; fail?: boolean } = {},
): Promise<Calls> {
  const calls: Calls = { sent: [] }
  await act(async () => {
    root.render(
      <StocktakeLineCards
        lines={lines}
        blind={options.blind ?? false}
        editable={options.editable ?? true}
        onCount={(line, quantity) => {
          calls.sent.push({ line, quantity })
          return options.fail === true
            ? Promise.reject(new Error('Netz weg'))
            : Promise.resolve()
        }}
      />,
    )
  })
  await settle()
  return calls
}

const text = () => container.textContent ?? ''

/** The quantity field of one card, found the way a screen reader finds it. */
function field(product: string): HTMLInputElement {
  const found = container.querySelector<HTMLInputElement>(`[aria-label="Gezählt ${product}"]`)
  if (!found) throw new Error(`Kein Mengenfeld für "${product}"`)
  return found
}

function buttons(label: string): HTMLButtonElement[] {
  return [...container.querySelectorAll('button')].filter(
    (candidate) => candidate.textContent?.trim() === label,
  )
}

function button(label: string): HTMLButtonElement {
  const found = buttons(label)[0]
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
 * root the cards are drawn in.
 */
function leave(control: HTMLElement) {
  act(() => {
    control.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
  })
}

/** A camera that hands out a stream nobody has to close for real. */
function stubCamera() {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: () => Promise.resolve({ getTracks: () => [{ stop: () => undefined }] }),
    },
  })
}

/** A browser that can read bar codes and always sees the same picture. */
function stubDetector(codes: { rawValue: string }[]) {
  ;(window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector = class {
    detect() {
      return Promise.resolve(codes)
    }
  }
}

/** The camera button, or nothing where the browser reads no bar code. */
const cameraButton = () =>
  [...container.querySelectorAll('button')].find(
    (element) => element.getAttribute('aria-label') === 'Artikel mit der Kamera scannen',
  )

/** Presses a key on an element the way a browser does, so React sees it bubble up. */
function press(element: HTMLElement, key: string) {
  act(() => {
    element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

describe('StocktakeLineCards', () => {
  /** One product per card, its name big, and one field to type the quantity into. */
  it('stocktakeLineCardsShowOneCardPerLineTest', async () => {
    await render([SCHRAUBE, MUTTER, SCHEIBE])

    expect(container.querySelectorAll('[data-count-card]')).toHaveLength(3)
    expect(text()).toContain('Schraube M6')
    expect(text()).toContain('P-100')
    // Below `sm` there is no table left to roll sideways — that is the whole point.
    expect(container.querySelector('table')).toBeNull()
    // A decimal keypad, not the full keyboard: counted quantities are numbers.
    expect(field('Schraube M6').inputMode).toBe('decimal')
  })

  /** The normal case: type a quantity, leave the field, the line is saved on its own. */
  it('stocktakeLineCardsSaveOnLeavingTheFieldTest', async () => {
    const calls = await render([SCHRAUBE, MUTTER, SCHEIBE])

    type(field('Schraube M6'), '118')
    leave(field('Schraube M6'))
    await settle()

    expect(calls.sent).toEqual([{ line: SCHRAUBE, quantity: 118 }])
  })

  /**
   * A dropped connection must not lose a counted value: the card is the only place it exists
   * (Frontend-ADR-0016).
   */
  it('stocktakeLineCardsKeepTheTypedValueWhenSavingFailsTest', async () => {
    const calls = await render([SCHRAUBE], { fail: true })

    type(field('Schraube M6'), '118')
    leave(field('Schraube M6'))
    await settle()

    expect(field('Schraube M6').value).toBe('118')
    expect(field('Schraube M6').getAttribute('aria-invalid')).toBe('true')

    click(button('Erneut senden'))
    await settle()

    expect(calls.sent).toHaveLength(2)
    expect(calls.sent[1].quantity).toBe(118)
  })

  /**
   * Two people count one list. What the other person entered is a statement with a name and a
   * time on it and is not quietly replaced.
   */
  it('stocktakeLineCardsAskBeforeOverwritingACountedLineTest', async () => {
    const calls = await render([SCHRAUBE, MUTTER, SCHEIBE])

    type(field('Mutter M6'), '75')
    leave(field('Mutter M6'))
    await settle()

    expect(calls.sent).toHaveLength(0)
    const question = container.querySelector('[role="alertdialog"] p')
    expect(question?.textContent).toMatch(/^Gezählt von Anna um \d{2}:\d{2} — überschreiben\?$/)
    expect(buttons('Behalten')).toHaveLength(1)

    click(button('Überschreiben'))
    await settle()

    expect(calls.sent).toEqual([{ line: MUTTER, quantity: 75 }])
  })

  /** «Weiter» means the next line nobody has counted, not the next line on screen. */
  it('stocktakeLineCardsJumpToTheNextOpenLineTest', async () => {
    await render([SCHRAUBE, MUTTER, SCHEIBE])

    click(buttons('Weiter zur nächsten offenen Zeile')[0])

    expect(document.activeElement).toBe(field('Scheibe M6'))
  })

  /** Quantity, `Enter`, next open line — the whole flow through an aisle, without a mouse. */
  it('stocktakeLineCardsMoveTheFocusOnEnterTest', async () => {
    const calls = await render([SCHRAUBE, MUTTER, SCHEIBE])

    const start = field('Schraube M6')
    start.focus()
    type(start, '118')
    press(start, 'Enter')
    await settle()

    expect(calls.sent).toEqual([{ line: SCHRAUBE, quantity: 118 }])
    expect(document.activeElement).toBe(field('Scheibe M6'))
  })

  /** On a blind count the expected quantity is nowhere on the card, and no difference either. */
  it('stocktakeLineCardsHideTheExpectedQuantityWhenBlindTest', async () => {
    await render([SCHRAUBE], { blind: true })

    expect(text()).toContain('Schraube M6')
    expect(text()).not.toContain('Soll')
    expect(text()).not.toContain('120')
  })

  /** A serial line is either there or it is not; 2 is not a quantity but a mistake. */
  it('stocktakeLineCardsRefuseATwoOnASerialLineTest', async () => {
    const calls = await render([SERIE])

    type(field('Bohrmaschine'), '2')
    leave(field('Bohrmaschine'))
    await settle()

    expect(calls.sent).toHaveLength(0)
    expect(field('Bohrmaschine').getAttribute('aria-invalid')).toBe('true')
    expect(text()).toContain('Eine Seriennummer ist entweder da oder nicht: 0 oder 1.')
  })

  /** Nothing open left: the way on leads nowhere and says so instead of jumping in a circle. */
  it('stocktakeLineCardsWithoutAnOpenLineTest', async () => {
    await render([MUTTER, { ...SCHEIBE, countedQuantity: 40, countedBy: 'Beat' }])

    expect(buttons('Weiter zur nächsten offenen Zeile')).toHaveLength(2)
    expect(buttons('Weiter zur nächsten offenen Zeile').every((entry) => entry.disabled)).toBe(
      true,
    )
  })

  /**
   * The counting mask is the main case of the camera, and the phone is where it is held. The
   * button belongs in the card view too, and a read number jumps to its card — the same block
   * the table hangs in, not a second one.
   */
  it('stocktakeLineCardsScanJumpsToTheLineTest', async () => {
    stubCamera()
    stubDetector([{ rawValue: 'P-300' }])
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await render([SCHRAUBE, MUTTER, SCHEIBE])

    expect(cameraButton()).not.toBeUndefined()

    await act(async () => {
      cameraButton()?.click()
    })
    // The camera is asked for on the click, so the stream has to settle before the first look.
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      vi.advanceTimersByTime(300)
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(document.activeElement).toBe(field('Scheibe M6'))
  })

  /** The edge case of an empty list: the same empty state the table shows. */
  it('stocktakeLineCardsWithoutLinesTest', async () => {
    await render([])

    expect(text()).toContain('Keine Zeile')
    expect(container.querySelectorAll('[data-count-card]')).toHaveLength(0)
  })
})

/**
 * The switch between the two views of the same route.
 *
 * <p>Tested here and not in `StocktakePage.test.tsx` because it is what this file's component
 * is for: below `sm` the mask draws cards, from `sm` up the table — one route, and never both
 * at once.
 */
describe('StocktakePage line views', () => {
  const PERMISSIONS = ['INVENTORY_READ', 'INVENTORY_COUNT', 'INVENTORY_COUNT_POST']

  const SESSION: AuthState = {
    user: {
      userId: 1,
      username: 'muster',
      activeTenantId: TENANT,
      superuser: false,
      tenants: [
        { id: TENANT, code: 'WX', name: 'Webux', isDefault: true, modules: ['INVENTORY'] },
      ],
      permissions: PERMISSIONS,
    },
    loading: false,
    signIn: () => Promise.reject(new Error('nicht gebraucht')),
    completeSecondFactor: () => Promise.reject(new Error('nicht gebraucht')),
    sendSecondFactorCode: () => Promise.resolve(),
    adoptSession: () => {},
    signOut: () => Promise.resolve(),
    switchTenant: () => Promise.resolve(),
    refresh: () => Promise.resolve(),
    can: (permission: string) => PERMISSIONS.includes(permission),
  }

  const HEAD: Stocktake = {
    id: 42,
    locationId: 7,
    locationName: 'Hauptlager',
    status: 'COUNTING',
    scope: 'ALL',
    blindCount: false,
    countingDate: '2026-01-20',
    lineCount: 3,
    countedCount: 1,
    openedAt: '2026-01-20T08:00:00Z',
  }

  /**
   * Stands in for the media query the mask asks.
   *
   * <p>jsdom has no `matchMedia` at all, so every test that renders the mask says which width
   * it is standing at.
   */
  function stubViewport(wide: boolean) {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('min-width') ? wide : !wide,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }))
  }

  function stubFetch() {
    vi.stubGlobal('fetch', (url: string) => {
      const body = url.includes('/lines')
        ? {
            content: [SCHRAUBE, MUTTER, SCHEIBE],
            page: 0,
            size: 100,
            totalElements: 3,
            totalPages: 1,
            sort: '',
          }
        : url.includes('/status-trail')
          ? []
          : url.includes('/catalogues')
            ? { 'stocktake-status': [{ code: 'COUNTING', name: 'Zählung läuft' }] }
            : HEAD
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    })
  }

  async function renderPage(wide: boolean) {
    stubViewport(wide)
    stubFetch()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/inventuren/42']}>
          <AuthContext.Provider value={SESSION}>
            <QueryClientProvider client={client}>
              <Routes>
                <Route path="/inventuren/:id" element={<StocktakePage />} />
              </Routes>
            </QueryClientProvider>
          </AuthContext.Provider>
        </MemoryRouter>,
      )
    })
    await settle()
  }

  /** Below `sm` the same route counts on cards — no zoom, no sideways rolling. */
  it('stocktakePageShowsTheCardsBelowSmTest', async () => {
    await renderPage(false)

    expect(text()).toContain('Kopfdaten')
    expect(container.querySelectorAll('[data-count-card]')).toHaveLength(3)
    expect(container.querySelector('table')).toBeNull()
  })

  /** From `sm` up the table, and only it: two mounted views are two fields per line. */
  it('stocktakePageShowsTheTableFromSmUpTest', async () => {
    await renderPage(true)

    expect(text()).toContain('Kopfdaten')
    expect(container.querySelector('table')).not.toBeNull()
    expect(container.querySelectorAll('[data-count-card]')).toHaveLength(0)
  })

  /** The progress belongs to neither view: it is announced above both, on either width. */
  it('stocktakePageAnnouncesTheProgressOnBothWidthsTest', async () => {
    await renderPage(false)

    expect(container.querySelector('[aria-live="polite"]')?.textContent).toBe('1 von 3 gezählt')
  })
})
