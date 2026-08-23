// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OfferTracking } from '../../lib/types'
import { OfferTrackingPanel } from './OfferTrackingPanel'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1
const BASE = `/api/tenants/${TENANT}/offers/42`

/** An open offer whose estimate is already stored — the value a typo must not erase. */
const ESTIMATED: OfferTracking = {
  outcome: 'OPEN',
  expired: false,
  winProbability: 60,
  weightedGross: 600,
}

let container: HTMLDivElement
let root: Root
let sent: { url: string; method: string; body: unknown }[]

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

function stubFetch() {
  sent = []
  vi.stubGlobal('fetch', (url: string, options?: RequestInit) => {
    const method = options?.method ?? 'GET'
    const body = options?.body === undefined ? undefined : JSON.parse(String(options.body))
    sent.push({ url, method, body })
    if (method === 'PUT') {
      const asked = body as { winProbability: number | null }
      return json({ outcome: 'OPEN', winProbability: asked.winProbability ?? undefined })
    }
    return json([])
  })
}

beforeEach(() => {
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

async function settle() {
  for (let round = 0; round < 5; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

async function render(tracking: OfferTracking = ESTIMATED): Promise<void> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <OfferTrackingPanel
          tenantId={TENANT}
          base={BASE}
          tracking={tracking}
          currency="CHF"
          editable
          onChanged={() => {}}
        />
      </QueryClientProvider>,
    )
  })
  await settle()
}

function buttonNamed(label: string): HTMLButtonElement {
  const found = [...document.querySelectorAll('button')].find(
    (button) => button.textContent?.trim() === label,
  )
  if (found === undefined) throw new Error(`no button named ${label}`)
  return found as HTMLButtonElement
}

async function press(label: string) {
  await act(async () => {
    buttonNamed(label).dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await settle()
}

function byLabel<T extends HTMLElement>(label: string): T {
  const found = [...document.querySelectorAll('label')].find(
    (candidate) => candidate.textContent?.trim() === label,
  )
  const control = found?.htmlFor ? document.getElementById(found.htmlFor) : null
  if (!control) throw new Error(`Kein Feld mit der Beschriftung "${label}"`)
  return control as T
}

/** Writes into a controlled input the way a user would, so React sees the change. */
function type(control: HTMLInputElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setValue?.call(control, value)
  act(() => {
    control.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function sentPuts() {
  return sent.filter((request) => request.method === 'PUT')
}

describe('OfferTrackingPanel', () => {
  it('submitProbabilityTest', async () => {
    await render()

    type(byLabel<HTMLInputElement>('Gewinnwahrscheinlichkeit in %'), '70')
    await press('Übernehmen')

    expect(sentPuts()).toEqual([
      { url: `${BASE}/tracking/probability`, method: 'PUT', body: { winProbability: 70 } },
    ])
  })

  it('submitProbabilityWithUnreadableInputTest', async () => {
    // Arrange: an estimate of 60 is stored; the user mistypes 70 as «7o».
    await render()

    // Act
    type(byLabel<HTMLInputElement>('Gewinnwahrscheinlichkeit in %'), '7o')
    await press('Übernehmen')

    // Assert: nothing is sent — a typo must not read as taking the estimate away.
    expect(sentPuts()).toEqual([])
    expect(document.body.textContent).toContain('Ganze Zahl zwischen 0 und 100')
  })

  it('submitProbabilityWithDecimalInputTest', async () => {
    await render()

    type(byLabel<HTMLInputElement>('Gewinnwahrscheinlichkeit in %'), '62.5')
    await press('Übernehmen')

    expect(sentPuts()).toEqual([])
    expect(document.body.textContent).toContain('Ganze Zahl zwischen 0 und 100')
  })

  it('submitProbabilityWithOutOfRangeInputTest', async () => {
    await render()

    type(byLabel<HTMLInputElement>('Gewinnwahrscheinlichkeit in %'), '150')
    await press('Übernehmen')

    expect(sentPuts()).toEqual([])
    expect(document.body.textContent).toContain('Ganze Zahl zwischen 0 und 100')
  })

  it('submitProbabilityWithEmptyFieldRemovesTheEstimateTest', async () => {
    await render()

    type(byLabel<HTMLInputElement>('Gewinnwahrscheinlichkeit in %'), '')
    await press('Übernehmen')

    expect(sentPuts()).toEqual([
      { url: `${BASE}/tracking/probability`, method: 'PUT', body: { winProbability: null } },
    ])
  })

  it('submitProbabilityErrorClearsWhileTypingTest', async () => {
    await render()

    type(byLabel<HTMLInputElement>('Gewinnwahrscheinlichkeit in %'), '7o')
    await press('Übernehmen')
    type(byLabel<HTMLInputElement>('Gewinnwahrscheinlichkeit in %'), '70')

    expect(document.body.textContent).not.toContain('Ganze Zahl zwischen 0 und 100')
  })
})
