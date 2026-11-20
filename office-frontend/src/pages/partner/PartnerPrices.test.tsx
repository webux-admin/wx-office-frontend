// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PartnerPrice } from '../../lib/types'
import { PartnerPrices } from './PartnerPrices'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ can: () => true }) }))

const BASE = '/api/tenants/1/partners/3/prices'

/** One agreed price: 1'250.00 for product 7 from ten pieces on. */
const PRICE: PartnerPrice = { id: 21, productId: 7, minQuantity: 10, price: 1250 }

let container: HTMLDivElement
let root: Root
let sent: { url: string; method: string; body: unknown }[]

beforeEach(() => {
  sent = []
  vi.stubGlobal('fetch', (url: string, options?: RequestInit) => {
    const method = options?.method ?? 'GET'
    sent.push({
      url,
      method,
      body: options?.body === undefined ? undefined : JSON.parse(String(options.body)),
    })
    const body = url.includes('/products?')
      ? { content: [{ id: 7, name: 'Wartung' }], number: 0, size: 1, totalElements: 1, totalPages: 1 }
      : url.endsWith('/price-groups')
        ? []
        : method === 'GET'
          ? [PRICE]
          : PRICE
    return Promise.resolve(
      method === 'DELETE'
        ? new Response(null, { status: 204 })
        : new Response(JSON.stringify(body), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
    )
  })
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

async function render() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <PartnerPrices tenantId={1} partnerId={3} />
        </MemoryRouter>
      </QueryClientProvider>,
    )
  })
  await settle()
}

async function press(label: string) {
  const found = [...document.querySelectorAll('button')].find(
    (candidate) =>
      candidate.textContent?.trim() === label || candidate.getAttribute('aria-label') === label,
  )
  if (!found) throw new Error(`Kein Knopf "${label}"`)
  await act(async () => found.click())
  await settle()
}

const writes = () => sent.filter((request) => request.method !== 'GET')

describe('PartnerPrices', () => {
  /** Editing keeps the id, so the backend rewrites the row instead of adding one. */
  it('partnerPricesEditTest', async () => {
    await render()

    await press('Preis für Wartung bearbeiten')
    await press('Speichern')

    expect(writes()).toEqual([
      {
        url: BASE,
        method: 'PUT',
        body: { id: 21, productId: 7, minQuantity: 10, price: 1250 },
      },
    ])
  })

  it('partnerPricesRemoveAsksFirstTest', async () => {
    await render()

    await press('Preis für Wartung entfernen')
    expect(writes()).toEqual([])

    await press('Entfernen')
    expect(writes()).toEqual([{ url: `${BASE}/21`, method: 'DELETE', body: undefined }])
  })

  /** Nothing chosen yet: the dialog cannot send a price without a product. */
  it('partnerPricesNewWithoutProductTest', async () => {
    await render()

    await press('Preis')

    const add = [...document.querySelectorAll('button')].find(
      (candidate) => candidate.textContent?.trim() === 'Hinzufügen',
    )
    expect(add?.disabled).toBe(true)
  })
})
