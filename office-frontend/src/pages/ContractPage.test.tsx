// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import type { Contract, ContractCustomer, Product } from '../lib/types'
import { ContractPage } from './ContractPage'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1

const HUBER: ContractCustomer = { partnerId: 11, partnerNumber: 'K-00011', name: 'Bäckerei Huber AG' }

const HOSTING: Product = {
  id: 7,
  productNumber: 'P-100',
  productType: 'SERVICE',
  name: 'Hosting Basic',
  vatCategory: 'REDUCED',
} as Product

const STORED: Contract = {
  id: 5,
  contractNumber: 'V-00005',
  title: 'Hosting und Support',
  partnerId: 11,
  customerName: 'Bäckerei Huber AG',
  customerTown: 'Bern',
  startDate: '2027-01-01',
  endDate: null,
  noticePeriodAmount: 3,
  noticePeriodUnit: 'MONTHS',
  note: null,
  currency: 'CHF',
  positions: [
    {
      positionKey: 'key-hosting',
      title: 'Hosting',
      productNumber: 'P-100',
      description: null,
      quantity: 1,
      unitPrice: 1000,
      currency: 'CHF',
      priceIncludesVat: false,
      vatCategory: 'STANDARD',
      interval: 'MONTHLY',
      amount: 1000,
    },
    {
      positionKey: 'key-support',
      title: 'Support',
      productNumber: null,
      description: null,
      quantity: 2,
      unitPrice: 100,
      currency: 'CHF',
      priceIncludesVat: false,
      vatCategory: 'STANDARD',
      interval: 'QUARTERLY',
      amount: 200,
    },
    {
      positionKey: 'key-domain',
      title: 'Domain',
      productNumber: null,
      description: null,
      quantity: 1,
      unitPrice: 50,
      currency: 'CHF',
      priceIncludesVat: true,
      vatCategory: 'STANDARD',
      interval: 'YEARLY',
      amount: 50,
    },
  ],
  totals: [
    { interval: 'MONTHLY', amount: 1000 },
    { interval: 'QUARTERLY', amount: 200 },
    { interval: 'YEARLY', amount: 50 },
  ],
}

function session(permissions: string[]): AuthState {
  return {
    user: {
      userId: 1,
      username: 'muster',
      activeTenantId: TENANT,
      superuser: false,
      tenants: [{ id: TENANT, code: 'WX', name: 'Webux', isDefault: true, modules: ['CONTRACT'] }],
      permissions,
    },
    loading: false,
    signIn: () => Promise.reject(new Error('nicht gebraucht')),
    completeSecondFactor: () => Promise.reject(new Error('nicht gebraucht')),
    sendSecondFactorCode: () => Promise.resolve(),
    adoptSession: () => {},
    signOut: () => Promise.resolve(),
    switchTenant: () => Promise.resolve(),
    refresh: () => Promise.resolve(),
    can: (permission: string) => permissions.includes(permission),
  }
}

let container: HTMLDivElement
let root: Root
/** Every write the mask sent: address, method and body per request. */
let written: { url: string; method: string; body: Record<string, unknown> }[]
/** Every read the mask sent, by address. */
let read: string[]
/** What the next write answers, a stored contract unless a test says otherwise. */
let answer: () => Promise<Response>

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

function stubFetch() {
  written = []
  read = []
  answer = () => json({ ...STORED, id: 6, contractNumber: 'V-00006' }, 201)
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (method !== 'GET') {
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {}
      written.push({ url, method, body })
      return answer()
    }
    read.push(url)
    if (url.includes('/contracts/customers')) return json([HUBER])
    if (url.endsWith('/contracts/5')) return json(STORED)
    if (url.includes('/currencies')) {
      return json([
        { id: 501, code: 'CHF', name: 'Schweizer Franken', isDefault: true },
        { id: 502, code: 'EUR', name: 'Euro' },
      ])
    }
    if (url.endsWith('/catalogues')) {
      return json({
        'vat-category': [
          { code: 'STANDARD', name: 'Normalsatz' },
          { code: 'REDUCED', name: 'Reduzierter Satz' },
        ],
      })
    }
    if (url.includes('/products/7/price')) {
      return json({ productId: 7, partnerId: 11, price: 89.5, origin: 'PARTNER', includesVat: true })
    }
    if (url.includes('/products?')) {
      return json({ content: [HOSTING], totalElements: 1, totalPages: 1, number: 0, size: 20 })
    }
    if (url.includes('/vat-rates')) return json({ STANDARD: 8.1, REDUCED: 2.6 })
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

async function settle(ms = 300) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms))
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function render(path: string, permissions = ['CONTRACT_READ', 'CONTRACT_WRITE']) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <AuthContext.Provider value={session(permissions)}>
          <QueryClientProvider client={client}>
            <Routes>
              <Route path="/vertraege/:id" element={<ContractPage />} />
              <Route path="/vertraege" element={<p>Liste</p>} />
            </Routes>
          </QueryClientProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
  })
  await settle()
}

const text = () => document.body.textContent ?? ''

/** The open dialog, where the position fields live. */
function dialog(): ParentNode {
  const found = document.querySelector('[role="dialog"]')
  if (found === null) throw new Error('no dialog open')
  return found
}

/** The control the given label points at, inside the given part of the page. */
function control(
  label: string,
  scope: ParentNode = container,
): HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  const caption = [...scope.querySelectorAll('label')].find(
    (entry) => entry.textContent?.replace('*', '').trim() === label,
  )
  const found = caption ? document.getElementById(caption.htmlFor) : null
  if (found === null) throw new Error(`no field labelled ${label}`)
  return found as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
}

async function type(label: string, value: string, scope: ParentNode = container) {
  const input = control(label, scope)
  await act(async () => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')?.set?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await settle()
}

/** Presses the last button that says exactly this, so a dialog wins over the header. */
async function press(label: string) {
  const button = [...document.querySelectorAll('button')]
    .filter((entry) => entry.textContent?.trim() === label)
    .at(-1)
  if (button === undefined) throw new Error(`no button ${label}`)
  await act(async () => {
    button.click()
  })
  await settle()
}

/** Presses the icon button that carries this name for a screen reader. */
async function pressIcon(label: string) {
  const button = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  if (button === null) throw new Error(`no icon button ${label}`)
  await act(async () => {
    button.click()
  })
  await settle()
}

/** Types into a type-ahead and takes the hit that names this record. */
async function pick(label: string, term: string, name: string, scope: ParentNode = container) {
  await type(label, term, scope)
  const hit = [...document.querySelectorAll('[role="option"]')].find((entry) =>
    entry.textContent?.includes(name),
  )
  if (hit === undefined) throw new Error(`no hit ${name}`)
  await act(async () => {
    ;(hit as HTMLElement).click()
  })
  await settle()
}

async function fillHead() {
  await type('Bezeichnung', 'Hosting und Support')
  await pick('Kunde', 'huber', 'Bäckerei Huber AG')
  await type('Beginn', '2027-01-01')
}

describe('ContractPage', () => {
  it('contractPageCreatesAContractWithAPositionTest', async () => {
    await render('/vertraege/neu')

    await fillHead()
    await type('Kündigungsfrist', '3')
    const unit = control('Einheit') as HTMLSelectElement
    await act(async () => {
      unit.value = 'MONTHS'
      unit.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await press('Position hinzufügen')
    await type('Bezeichnung', 'Hosting', dialog())
    await type('Einzelpreis', '1000.00', dialog())
    await press('Hinzufügen')
    await press('Speichern')

    expect(written).toEqual([
      {
        url: '/api/tenants/1/contracts',
        method: 'POST',
        body: {
          title: 'Hosting und Support',
          partnerId: 11,
          startDate: '2027-01-01',
          endDate: null,
          noticePeriodAmount: 3,
          noticePeriodUnit: 'MONTHS',
          note: null,
          positions: [
            {
              positionKey: null,
              title: 'Hosting',
              productNumber: null,
              description: null,
              quantity: 1,
              unitPrice: 1000,
              currency: 'CHF',
              priceIncludesVat: false,
              vatCategory: 'STANDARD',
              interval: 'MONTHLY',
            },
          ],
        },
      },
    ])
    expect(text()).toContain('Liste')
  })

  it('contractPageCreatesAContractWithoutPositionsTest', async () => {
    await render('/vertraege/neu')

    await fillHead()
    await press('Speichern')

    expect(written).toHaveLength(1)
    expect(written[0].body.positions).toEqual([])
  })

  it('contractPageNamesWhatIsMissingBeforeSendingTest', async () => {
    await render('/vertraege/neu')

    await press('Speichern')

    expect(written).toHaveLength(0)
    expect(text()).toContain('Ein Vertrag braucht eine Bezeichnung.')
    expect(text()).toContain('Ein Vertrag braucht einen Kunden.')
    expect(text()).toContain('Ein Vertrag braucht einen Beginn.')
  })

  it('contractPageRefusesANegativePriceInTheDialogTest', async () => {
    await render('/vertraege/neu')

    await press('Position hinzufügen')
    await type('Bezeichnung', 'Rabatt', dialog())
    await type('Einzelpreis', '-10', dialog())
    await press('Hinzufügen')

    expect(text()).toContain('Ein Rabatt wird als tieferer Preis vereinbart, nicht negativ.')
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
  })

  it('contractPageShowsAStoredContractWithItsTotalsTest', async () => {
    await render('/vertraege/5')

    expect(text()).toContain('V-00005')
    expect(text()).toContain('Bäckerei Huber AG, Bern')
    expect((control('Bezeichnung') as HTMLInputElement).value).toBe('Hosting und Support')
    expect((control('Kunde') as HTMLInputElement).value).toBe('Bäckerei Huber AG')
    expect(text()).toContain('Hosting')
    expect(text()).toContain('inkl. MWST')
    expect(text()).toContain('pro Monat')
    expect(text()).toContain('pro Quartal')
    expect(text()).toContain('pro Jahr')
  })

  it('contractPageSendsTheKeysOfStoredPositionsBackTest', async () => {
    answer = () => json(STORED)
    await render('/vertraege/5')

    await pressIcon('Domain entfernen')
    expect(text()).toContain('Die Summen stehen nach dem Speichern.')
    await press('Speichern')

    expect(written[0].method).toBe('PUT')
    expect(written[0].url).toBe('/api/tenants/1/contracts/5')
    expect(
      (written[0].body.positions as { positionKey: string }[]).map((entry) => entry.positionKey),
    ).toEqual(['key-hosting', 'key-support'])
  })

  it('contractPageMovesAPositionTest', async () => {
    answer = () => json(STORED)
    await render('/vertraege/5')

    await pressIcon('Support nach oben')
    await press('Speichern')

    expect(
      (written[0].body.positions as { title: string }[]).map((entry) => entry.title),
    ).toEqual(['Support', 'Hosting', 'Domain'])
  })

  it('contractPageShowsTheFieldErrorOfTheBackendTest', async () => {
    answer = () =>
      json(
        {
          status: 400,
          detail: 'Holz AG ist kein Kunde. Ein Vertrag wird immer mit einem Kunden geschlossen.',
          errors: [
            {
              field: 'partnerId',
              message: 'Holz AG ist kein Kunde. Ein Vertrag wird immer mit einem Kunden geschlossen.',
            },
          ],
        },
        400,
      )
    await render('/vertraege/neu')

    await fillHead()
    await press('Speichern')

    expect(text()).toContain('Holz AG ist kein Kunde.')
    expect(text()).not.toContain('Liste')
  })

  it('contractPageTakesAProductFromTheCatalogueTest', async () => {
    await render('/vertraege/neu', ['CONTRACT_READ', 'CONTRACT_WRITE', 'PRODUCT_READ'])

    await fillHead()
    await press('Position hinzufügen')
    await pick('Produkt', 'hosting', 'Hosting Basic', dialog())

    expect((control('Bezeichnung', dialog()) as HTMLInputElement).value).toBe('Hosting Basic')
    expect((control('Produktnummer', dialog()) as HTMLInputElement).value).toBe('P-100')
    expect((control('Einzelpreis', dialog()) as HTMLInputElement).value).toBe('89.5')
    expect((control('MwSt-Kategorie', dialog()) as HTMLSelectElement).value).toBe('REDUCED')
    expect(read).toContain(
      '/api/tenants/1/partners/11/products/7/price?quantity=1&dateOfSupply=2027-01-01',
    )

    // Taken over, and still free to change: what is stored is the value.
    await type('Bezeichnung', 'Hosting für Huber', dialog())
    await press('Hinzufügen')
    await press('Speichern')

    expect(written[0].body.positions).toEqual([
      {
        positionKey: null,
        title: 'Hosting für Huber',
        productNumber: 'P-100',
        description: null,
        quantity: 1,
        unitPrice: 89.5,
        currency: 'CHF',
        priceIncludesVat: true,
        vatCategory: 'REDUCED',
        interval: 'MONTHLY',
      },
    ])
  })

  it('contractPageAsksForTheCustomerBeforeTheCatalogueTest', async () => {
    await render('/vertraege/neu', ['CONTRACT_READ', 'CONTRACT_WRITE', 'PRODUCT_READ'])

    await press('Position hinzufügen')

    expect(control('Produkt', dialog()).disabled).toBe(true)
    expect(text()).toContain('Zuerst den Kunden wählen')
  })

  it('contractPageOffersNoCatalogueWithoutTheProductRightTest', async () => {
    await render('/vertraege/neu')

    await fillHead()
    await press('Position hinzufügen')

    expect(() => control('Produkt', dialog())).toThrow()
    expect(read.some((url) => url.includes('/products'))).toBe(false)
  })

  it('contractPageIsReadOnlyWithoutTheWriteRightTest', async () => {
    await render('/vertraege/5', ['CONTRACT_READ'])

    expect([...document.querySelectorAll('button')].map((entry) => entry.textContent?.trim()))
      .not.toContain('Speichern')
    expect(text()).not.toContain('Position hinzufügen')
    expect((control('Bezeichnung') as HTMLInputElement).disabled).toBe(true)
  })
})
