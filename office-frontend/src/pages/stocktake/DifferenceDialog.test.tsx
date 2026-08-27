// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Stocktake, StocktakeDifference } from '../../lib/types'
import { DifferenceDialog } from './DifferenceDialog'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1

/** Every line counted, so nothing but the reason can hold the booking back. */
const STOCKTAKE: Stocktake = {
  id: 9,
  locationId: 7,
  status: 'COUNTING',
  scope: 'ALL',
  blindCount: false,
  countingDate: '2026-08-26',
  lineCount: 1,
  countedCount: 1,
}

/** One difference of 2 out of 20 — over the shipped threshold, so it has to be explained. */
const NEEDS_REASON: StocktakeDifference = {
  lineId: 4711,
  productId: 42,
  productNumber: 'P-100',
  productName: 'Schraube M4',
  unitShortName: 'Stk',
  expectedQuantity: 20,
  stockNow: 20,
  countedQuantity: 18,
  difference: -2,
  movedSinceCounting: false,
  needsReason: true,
}

/** One of two thousand: under the threshold, and the server asks for nothing. */
const NEEDS_NO_REASON: StocktakeDifference = {
  ...NEEDS_REASON,
  lineId: 4712,
  productId: 43,
  productNumber: 'P-200',
  productName: 'Winkel 40',
  expectedQuantity: 2000,
  stockNow: 2000,
  countedQuantity: 1999,
  difference: -1,
  needsReason: false,
}

/** A second difference that has to be explained — the row the counter tabs on to. */
const ALSO_NEEDS_REASON: StocktakeDifference = {
  ...NEEDS_REASON,
  lineId: 4713,
  productId: 44,
  productNumber: 'P-300',
  productName: 'Mutter M4',
}

/** What the backend answers when the reason cannot be written. */
const PUT_DETAIL = 'Diese Inventur wurde zwischenzeitlich gebucht'

let container: HTMLDivElement
let root: Root
/** The body of every reason PUT the dialog sent, in order. */
let reasons: Record<string, unknown>[]
/** How many times the posting endpoint was called. */
let posts: number
/** Set by a test that wants the reason PUT refused with this status. */
let reasonStatus: number
/** What the difference list answers with. */
let rows: StocktakeDifference[]
/** Set by a test that wants the reason PUTs to stay open until it lets them answer. */
let holdReasons: boolean
/** The answers that are being held back, in the order the dialog asked for them. */
let heldReasons: (() => void)[]

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function json(body: unknown, status = 200) {
  return Promise.resolve(response(body, status))
}

function stubFetch() {
  vi.stubGlobal('fetch', (url: string, options?: RequestInit) => {
    if (options?.method === 'PUT' && url.includes('/reason')) {
      reasons.push(JSON.parse(String(options.body)) as Record<string, unknown>)
      const answer = () =>
        reasonStatus === 200
          ? response({ id: STOCKTAKE.id })
          : response({ detail: PUT_DETAIL }, reasonStatus)
      if (!holdReasons) return Promise.resolve(answer())
      // Held open so that a second row can be left while this one is still on its way. That
      // overlap is the everyday case on a warehouse connection, and the only way to stage it.
      return new Promise<Response>((resolve) => heldReasons.push(() => resolve(answer())))
    }
    if (options?.method === 'POST' && url.includes('/post')) {
      posts += 1
      return json({ ...STOCKTAKE, status: 'POSTED', stocktakeNumber: 'INV-2026-0001' })
    }
    if (url.includes('/differences')) return json(rows)
    return json([])
  })
}

beforeEach(() => {
  reasons = []
  posts = 0
  reasonStatus = 200
  holdReasons = false
  heldReasons = []
  rows = [NEEDS_REASON]
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

async function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <DifferenceDialog
            tenantId={TENANT}
            stocktake={STOCKTAKE}
            open
            onClose={() => undefined}
            onPosted={() => undefined}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    )
  })
  await settle()
}

/** Lets the answer of the stubbed fetch and the render that follows it run out. */
async function settle(ms = 0) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms))
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

/** Lets every reason PUT that is still open answer, oldest first. */
async function answerHeldReasons() {
  const held = [...heldReasons]
  heldReasons = []
  held.forEach((answer) => answer())
  await settle()
}

function control(label: string): HTMLElement | null {
  const found = [...document.querySelectorAll('label')].find(
    (element) => element.textContent?.trim() === label,
  )
  return document.getElementById(found?.getAttribute('for') ?? '')
}

function button(text: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll('button')].find(
    (element) => element.textContent?.trim() === text,
  )
}

function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
  act(() => {
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

/**
 * Leaves the field, which is what sends the reason.
 *
 * <p>React listens on `focusout`, not on `blur`: only the first of the two bubbles up to the
 * root React delegates from.
 */
function leave(input: HTMLInputElement) {
  act(() => {
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
  })
}

const text = () => document.body.textContent ?? ''

/** The reason field of the difference that needs one. */
const reasonField = () => control('Grund Schraube M4') as HTMLInputElement

/**
 * Types a reason into the named field and leaves it, without waiting for the answer.
 *
 * <p>Which is the whole point where the answers are held back: leaving the next field while
 * this one is still out is what a counter does on a slow line.
 */
async function explainWithoutWaiting(label: string, value: string) {
  const field = control(label) as HTMLInputElement
  type(field, value)
  leave(field)
  await settle()
}

/** Types a reason and leaves the field. */
async function explain(value: string) {
  const field = reasonField()
  type(field, value)
  leave(field)
  await settle()
}

describe('DifferenceDialog', () => {
  /**
   * A typed character is not an explanation. What counts is what the server took, so the
   * button stays shut until the reason is on the record — otherwise the list books without
   * the reason OR Art. 957a Abs. 2 asks for.
   */
  it('differenceDialogKeepsPostingShutWhileTheReasonSaveFailsTest', async () => {
    reasonStatus = 500
    await show()

    await explain('Bruch beim Umlagern')

    expect(reasons).toHaveLength(1)
    expect(button('Buchen')?.disabled).toBe(true)
  })

  /** A save that failed says so. Swallowing it leaves a mask claiming a reason nobody has. */
  it('differenceDialogShowsTheFailedReasonSaveTest', async () => {
    reasonStatus = 409
    await show()

    await explain('Bruch beim Umlagern')

    expect(text()).toContain(PUT_DETAIL)
    // And the typed word stays in the field: it is the only place it exists (ADR-0016).
    expect(reasonField().value).toBe('Bruch beim Umlagern')
  })

  /** «Erneut senden» sends the same reason again, and the button opens when it lands. */
  it('differenceDialogResendsAFailedReasonTest', async () => {
    reasonStatus = 500
    await show()
    await explain('Bruch beim Umlagern')
    expect(button('Erneut senden')).toBeDefined()

    reasonStatus = 200
    await act(async () => {
      button('Erneut senden')?.click()
    })
    await settle()

    expect(reasons).toHaveLength(2)
    expect(reasons[1].reason).toBe('Bruch beim Umlagern')
    expect(button('Buchen')?.disabled).toBe(false)
  })

  /** The everyday case: the reason lands, the button opens, and the list books. */
  it('differenceDialogPostsOnceTheReasonIsSavedTest', async () => {
    await show()
    expect(button('Buchen')?.disabled).toBe(true)

    await explain('Bruch beim Umlagern')
    await act(async () => {
      button('Buchen')?.click()
    })
    await settle()

    expect(reasons).toEqual([{ reason: 'Bruch beim Umlagern' }])
    expect(posts).toBe(1)
  })

  /**
   * Two rows explained one after the other, the second left before the first has answered.
   *
   * <p>Every row shares one mutation, so a callback handed to it belongs to whichever row
   * started last: the answer to the first row is dropped, it stays unexplained, «Buchen» stays
   * shut with a hint demanding a reason the server already holds — and neither a red row nor
   * «Erneut senden» says so. Five differences and a slow line are enough to hit that.
   */
  it('differenceDialogSavesTwoOverlappingReasonsTest', async () => {
    rows = [NEEDS_REASON, ALSO_NEEDS_REASON]
    holdReasons = true
    await show()

    await explainWithoutWaiting('Grund Schraube M4', 'Bruch beim Umlagern')
    await explainWithoutWaiting('Grund Mutter M4', 'Zählfehler')
    await answerHeldReasons()

    expect(reasons).toEqual([{ reason: 'Bruch beim Umlagern' }, { reason: 'Zählfehler' }])
    expect(text()).not.toContain('Diese Abweichung braucht einen Grund.')
    expect(button('Buchen')?.disabled).toBe(false)
  })

  /**
   * The same overlap with both saves refused: the failure has to reach the row it belongs to,
   * both times. A row that lost its answer would look saved and hold no reason at all.
   */
  it('differenceDialogShowsTheFailureOfEveryOverlappingRowTest', async () => {
    rows = [NEEDS_REASON, ALSO_NEEDS_REASON]
    reasonStatus = 409
    holdReasons = true
    await show()

    await explainWithoutWaiting('Grund Schraube M4', 'Bruch beim Umlagern')
    await explainWithoutWaiting('Grund Mutter M4', 'Zählfehler')
    await answerHeldReasons()

    // Once per row: the message stands under each of the two fields, so the text is cut in
    // three by it.
    expect(text().split(PUT_DETAIL)).toHaveLength(3)
    expect(button('Buchen')?.disabled).toBe(true)
  })

  /**
   * The other half of the rule: a difference under the threshold books without a word. A mask
   * that asked for one everywhere would collect explanations nobody reads (backend ADR-0070).
   */
  it('differenceDialogPostsWithoutAReasonBelowTheThresholdTest', async () => {
    rows = [NEEDS_NO_REASON]
    await show()

    await act(async () => {
      button('Buchen')?.click()
    })
    await settle()

    expect(reasons).toHaveLength(0)
    expect(posts).toBe(1)
  })
})
