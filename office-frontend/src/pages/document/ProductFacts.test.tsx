// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../../auth/authContext'
import type { Product } from '../../lib/types'
import { ProductFacts } from './ProductFacts'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1
const PARTNER = 3

const CABLE: Product = {
  id: 7,
  productNumber: 'K-010',
  name: 'Kabel 3m',
  productType: 'GOODS',
  unit: 'PIECE',
  unitLabel: 'Stk',
  revenueAccount: '3000',
  vatCategory: 'STANDARD',
}

/** What the inventory answers about the product; a test that cares sets its own. */
let availability: unknown
/** The status the availability endpoint answers with, for the refusal. */
let availabilityStatus: number
/** True while the session holds no INVENTORY_READ, so the query never runs. */
let withoutInventoryRight: boolean
/** Every request that went out, so a test can prove one never did. */
let asked: string[]

let container: HTMLDivElement
let root: Root

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

function stubFetch() {
  asked = []
  availabilityStatus = 200
  withoutInventoryRight = false
  availability = {
    productId: 7,
    stockManaged: true,
    onHand: 12,
    reserved: 4,
    availableQuantity: 8,
    locations: [
      { locationId: 1, locationName: 'Hauptlager', onHand: 12, reserved: 4, availableQuantity: 8 },
    ],
    heldBy: [{ documentNumber: 'AU-2026-0142', quantity: 4 }],
  }
  vi.stubGlobal('fetch', (url: string) => {
    asked.push(url)
    if (url.includes('/inventory/availability')) {
      return json(
        availabilityStatus === 200 ? availability : { detail: 'Kein Zugriff' },
        availabilityStatus,
      )
    }
    if (url.includes('/prices/')) {
      return json({
        productId: 7,
        partnerId: PARTNER,
        price: 40,
        origin: 'BASE',
        includesVat: false,
      })
    }
    return json({})
  })
}

/** A session that may read the inventory, unless a test says otherwise. */
function auth(): AuthState {
  return {
    user: null,
    loading: false,
    signIn: () => Promise.reject(new Error('not in this test')),
    signOut: () => Promise.resolve(),
    switchTenant: () => Promise.resolve(),
    refresh: () => Promise.resolve(),
    can: (permission: string) =>
      !(withoutInventoryRight && permission === 'INVENTORY_READ'),
  }
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

async function render(quantity = 1): Promise<void> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <AuthContext.Provider value={auth()}>
        <QueryClientProvider client={client}>
          <ProductFacts
            tenantId={TENANT}
            partnerId={PARTNER}
            product={CABLE}
            quantity={quantity}
            currency="CHF"
            vatOf={(category) => (category === 'STANDARD' ? '8.1 %' : undefined)}
          />
        </QueryClientProvider>
      </AuthContext.Provider>,
    )
  })
  await settle()
}

async function settle() {
  for (let round = 0; round < 4; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

const text = () => container.textContent ?? ''

/** The labels of the figures in the box, so «Verfügbar» is told from «Verfügbarkeit». */
const factLabels = () => [...container.querySelectorAll('dt')].map((label) => label.textContent)

/** What the live region says, which is the only way the box reaches a screen reader. */
const spoken = () => container.querySelector('[aria-live="polite"]')?.textContent ?? ''

describe('ProductFacts', () => {
  it('productFactsShowsTheAvailableQuantityTest', async () => {
    await render()

    // One figure, with the unit of the product next to it, and the two it is made of below.
    expect(factLabels()).toContain('Verfügbar')
    expect(text()).toContain('8 Stk')
    expect(text()).toContain('Bestand 12 · 4 reserviert')
  })

  it('productFactsAnnouncesTheAvailableQuantityTest', async () => {
    await render()

    // No second live region: the fact walks into the one the box already has.
    expect(spoken()).toContain('Verfügbar 8 Stk')
    expect(container.querySelectorAll('[aria-live]')).toHaveLength(1)
  })

  it('productFactsWarnsWhenTheQuantityIsNotCoveredTest', async () => {
    await render(20)

    expect(text()).toContain('20 gebraucht')
    expect(text()).toContain('reserviert für AU-2026-0142')
    expect(container.querySelector('.text-warning')).not.toBeNull()
  })

  it('productFactsWithoutStockManagementTest', async () => {
    availability = { productId: 7, stockManaged: false }

    await render()

    // Neither a figure nor a placeholder, and above all no 0: that would read as «sold out».
    expect(factLabels()).not.toContain('Verfügbar')
    expect(text()).not.toContain('0 Stk')
    expect(text()).toContain('Einzelpreis')
  })

  it('productFactsWithARefusedAvailabilityTest', async () => {
    availabilityStatus = 403

    await render()

    expect(factLabels()).not.toContain('Verfügbar')
    expect(text()).toContain('Die Verfügbarkeit konnte nicht gelesen werden.')
  })

  it('productFactsWithoutInventoryPermissionTest', async () => {
    withoutInventoryRight = true

    await render()

    // Missing right is not a fault: the fact is simply not there, and nothing is said about
    // it. The request is never sent either, so no 403 is provoked per keystroke.
    expect(factLabels()).not.toContain('Verfügbar')
    expect(text()).not.toContain('konnte nicht gelesen werden')
    expect(asked.some((url) => url.includes('/inventory/availability'))).toBe(false)
  })
})
