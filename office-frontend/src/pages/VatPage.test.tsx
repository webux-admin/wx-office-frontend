// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import type { VatRatePeriod } from '../lib/types'
import { VatPage } from './VatPage'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1

/** A timeline with history, the running period and one announced change per category. */
const PERIODS: VatRatePeriod[] = [
  { id: 1, category: 'STANDARD', validFrom: '2018-01-01', validTo: '2023-12-31', rate: 7.7 },
  { id: 2, category: 'STANDARD', validFrom: '2024-01-01', validTo: '2089-12-31', rate: 8.1 },
  { id: 3, category: 'STANDARD', validFrom: '2090-01-01', rate: 8.5 },
  { id: 4, category: 'REDUCED', validFrom: '2024-01-01', rate: 2.6 },
]

/** A session that may read products and maintain the rates. */
const SESSION: AuthState = {
  user: {
    userId: 1,
    username: 'muster',
    activeTenantId: TENANT,
    superuser: false,
    tenants: [],
    permissions: ['PRODUCT_READ', 'VAT_RATE_WRITE'],
  },
  loading: false,
  signIn: () => Promise.reject(new Error('nicht gebraucht')),
  signOut: () => Promise.resolve(),
  switchTenant: () => Promise.resolve(),
  can: (permission: string) => ['PRODUCT_READ', 'VAT_RATE_WRITE'].includes(permission),
}

let container: HTMLDivElement
let root: Root
/** Every write the page sent: method and body per request. */
let written: { url: string; method: string; body: unknown }[]

function stubFetch() {
  written = []
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (method !== 'GET') {
      written.push({
        url,
        method,
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      })
    }
    const body = url.includes('/vat-rates/periods')
      ? PERIODS
      : url.includes('/vat-rates')
        ? { STANDARD: 8.1, REDUCED: 2.6, ACCOMMODATION: 3.8 }
        : url.includes('/catalogues')
          ? {}
          : {}
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
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

async function render() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <MemoryRouter>
        <AuthContext.Provider value={SESSION}>
          <QueryClientProvider client={client}>
            <VatPage />
          </QueryClientProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
  })
  await settle()
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

const buttons = () => [...container.querySelectorAll('button')]
const buttonByText = (text: string) =>
  buttons().find((button) => button.textContent?.includes(text))

function click(button: HTMLButtonElement | undefined) {
  expect(button).toBeDefined()
  act(() => {
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

function fill(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
  act(() => {
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('VatPage', () => {
  it('vatPageListsTheRateTimelineTest', async () => {
    await render()

    expect(container.textContent).toContain('Satzänderungen')
    expect(container.textContent).toContain('01.01.2018')
    expect(container.textContent).toContain('31.12.2023')
    expect(container.textContent).toContain('7.7 %')
    expect(container.textContent).toContain('8.5 %')
  })

  it('vatPageOffersCorrectionOnlyForFutureChangesTest', async () => {
    await render()

    // Three STANDARD periods and one REDUCED are on screen, but only the announced 2090
    // change may still be corrected: everything else has started and is history.
    expect(buttons().filter((button) => button.textContent === 'Bearbeiten')).toHaveLength(1)
    expect(buttons().filter((button) => button.textContent === 'Zurücknehmen')).toHaveLength(1)
  })

  it('vatPageRecordsANewRateChangeTest', async () => {
    await render()

    click(buttonByText('Satzänderung') as HTMLButtonElement)
    const dialog = container.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog).not.toBeNull()

    const [validFrom, rate] = [...dialog.querySelectorAll('input')]
    fill(validFrom, '2090-01-01')
    fill(rate, '8.5')
    click(buttonByText('Speichern') as HTMLButtonElement)
    await settle()

    expect(written).toHaveLength(1)
    expect(written[0].method).toBe('POST')
    expect(written[0].url).toContain('/vat-rates/periods')
    expect(written[0].body).toEqual({ category: 'STANDARD', validFrom: '2090-01-01', rate: 8.5 })
  })

  it('vatPageTakesAnAnnouncedChangeBackTest', async () => {
    await render()

    click(buttonByText('Zurücknehmen') as HTMLButtonElement)
    await settle()

    expect(written).toHaveLength(1)
    expect(written[0].method).toBe('DELETE')
    expect(written[0].url).toContain('/vat-rates/periods/3')
  })
})
