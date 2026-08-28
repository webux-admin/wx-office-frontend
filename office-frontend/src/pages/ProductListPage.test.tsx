// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import type { Product } from '../lib/types'
import { ProductListPage } from './ProductListPage'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1

/** The bar code of the screw — what a scanner reads instead of the product number. */
const EAN = '7612345678901'

const PRODUCTS: Product[] = [
  {
    id: 7,
    productNumber: 'P-100',
    name: 'Wartung',
    productType: 'SERVICE',
    unit: 'HOUR',
    vatCategory: 'STANDARD',
  },
  {
    id: 9,
    productNumber: 'S-010',
    name: 'Schraube',
    productType: 'GOODS',
    unit: 'PIECE',
    vatCategory: 'STANDARD',
    eanCode: EAN,
  },
]

/** A session that may read products, which is all this screen asks of it. */
const SESSION: AuthState = {
  user: {
    userId: 1,
    username: 'muster',
    activeTenantId: TENANT,
    superuser: false,
    tenants: [],
    permissions: ['PRODUCT_READ'],
  },
  loading: false,
  signIn: () => Promise.reject(new Error('nicht gebraucht')),
  completeSecondFactor: () => Promise.reject(new Error('nicht gebraucht')),
  sendSecondFactorCode: () => Promise.resolve(),
  adoptSession: () => {},
  signOut: () => Promise.resolve(),
  switchTenant: () => Promise.resolve(),
  refresh: () => Promise.resolve(),
  can: (permission: string) => permission === 'PRODUCT_READ',
}

let container: HTMLDivElement
let root: Root
/** Every product request the list sent, in order. */
let asked: string[]
/** How long an answer takes, so a test can look at the table while one is on its way. */
let latency = 0

function stubFetch() {
  asked = []
  latency = 0
  vi.stubGlobal('fetch', (url: string) => {
    if (url.includes('/products')) asked.push(url)
    const term = decodeURIComponent(/[?&]search=([^&]*)/.exec(url)?.[1] ?? '').toLowerCase()
    // The same three columns the server matches over, bar code included.
    const found = PRODUCTS.filter((product) =>
      [product.name, product.productNumber ?? '', product.eanCode ?? ''].some((column) =>
        column.toLowerCase().includes(term),
      ),
    )
    const body = url.includes('/products')
      ? {
          content: found,
          page: 0,
          size: 50,
          totalElements: found.length,
          totalPages: 1,
          sort: '',
        }
      : url.includes('/catalogues')
        ? {}
        : []
    const response = new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
    if (latency === 0) return Promise.resolve(response)
    return new Promise((resolve) => setTimeout(() => resolve(response), latency))
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
            <ProductListPage />
          </QueryClientProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
  })
  await settle()
}

/** Lets the debounce of the search field and the answer that follows it run out. */
async function settle(ms = 300) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms))
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

const rows = () => [...container.querySelectorAll('tbody tr')]
const search = () => container.querySelector('input') as HTMLInputElement

function type(value: string) {
  const control = search()
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(control, value)
  act(() => {
    control.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('ProductListPage', () => {
  it('productListPageHoldsTheSearchBackWhileTypingTest', async () => {
    await render()
    const before = asked.length

    type('s')
    type('sc')
    type('sch')

    // Deferring the render is not rate limiting: with fifty rows React is done in a couple of
    // milliseconds, so every keystroke used to get its own query key and its own call.
    expect(asked.length).toBe(before)

    await settle()

    expect(asked.length).toBe(before + 1)
    expect(asked.at(-1)).toContain('search=sch')
  })

  it('productListPageKeepsTheRowsOnScreenWhileSearchingTest', async () => {
    await render()

    expect(rows()).toHaveLength(2)

    latency = 200
    type('schraube')
    await settle(250)

    // The answer is still on its way. Without a placeholder the table is replaced by its
    // loading state here, which makes it flicker exactly while it is being read.
    expect(rows()).toHaveLength(2)

    await settle(250)

    expect(rows()).toHaveLength(1)
    expect(container.textContent).toContain('Schraube')
  })

  it('productListPageShowsTheBarCodeOfARowFoundByItTest', async () => {
    await render()

    type(EAN)
    await settle()

    // Neither the number nor the name carries what was scanned, so without the code on the
    // row the article looks like an arbitrary hit.
    expect(rows()).toHaveLength(1)
    expect(rows()[0].textContent).toContain(EAN)
  })

  it('productListPageLeavesTheBarCodeOffARowFoundByNameTest', async () => {
    await render()

    type('schraube')
    await settle()

    expect(rows()).toHaveLength(1)
    expect(rows()[0].textContent).not.toContain(EAN)
  })
})
