// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import type {
  Contract,
  ContractCustomer,
  ContractStatusChange,
  ContractVersion,
  Product,
} from '../lib/types'
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
  status: 'DRAFT',
  lockVersion: 3,
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
  slaValues: [],
}

/** Availability 99.5 % a month, as a contract and a version send it. */
const AVAILABILITY = {
  metric: 'AVAILABILITY',
  targetValue: 99.5,
  unit: 'PERCENT',
  description: 'pro Kalendermonat',
} as const

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

/** Version 1 of the stored contract, before the price of hosting went up. */
const VERSION_ONE: ContractVersion = {
  versionNo: 1,
  validFrom: '2027-01-01',
  title: 'Hosting und Support',
  partnerId: 11,
  customerName: 'Bäckerei Huber AG',
  customerTown: 'Bern',
  startDate: '2027-01-01',
  endDate: null,
  noticePeriodAmount: 3,
  noticePeriodUnit: 'MONTHS',
  currency: 'CHF',
  positions: [{ ...STORED.positions[0], unitPrice: 900, amount: 900 }],
  totals: [{ interval: 'MONTHLY', amount: 900 }],
  slaValues: [{ ...AVAILABILITY, targetValue: 99 }],
  createdAt: '2026-12-01T09:00:00Z',
  createdBy: 'anna',
}

/** Version 2, the one the stored contract stands for once it is active. */
const VERSION_TWO: ContractVersion = {
  ...VERSION_ONE,
  versionNo: 2,
  validFrom: '2028-01-01',
  positions: STORED.positions,
  totals: STORED.totals,
  slaValues: [AVAILABILITY],
  createdAt: '2027-11-20T09:00:00Z',
}

const STEPS: ContractStatusChange[] = [
  { fromStatus: 'DRAFT', toStatus: 'ACTIVE', changedAt: '2026-12-01T09:00:00Z', changedBy: 'anna' },
]

let container: HTMLDivElement
/** What the backend holds as contract 5; a draft unless a test says otherwise. */
let stored: Contract
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
  stored = STORED
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
    if (url.endsWith('/contracts/5')) return json(stored)
    if (url.endsWith('/contracts/5/versions')) return json([VERSION_TWO, VERSION_ONE])
    if (url.endsWith('/contracts/5/status-changes')) return json(STEPS)
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

/** Chooses an option of a select by its value. */
async function choose(label: string, value: string, scope: ParentNode = container) {
  const select = control(label, scope)
  await act(async () => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(select), 'value')?.set?.call(select, value)
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await settle()
}

/** The button that says exactly this, the last one when there are several. */
function button(label: string): HTMLButtonElement {
  const found = [...document.querySelectorAll('button')]
    .filter((entry) => entry.textContent?.trim() === label)
    .at(-1)
  if (found === undefined) throw new Error(`no button ${label}`)
  return found
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
          slaValues: [],
          lockVersion: null,
          validFrom: null,
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
    expect(written[0].body.lockVersion).toBe(3)
    // A draft takes no version, so no day is asked for and none is sent.
    expect(written[0].body.validFrom).toBeNull()
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

  it('contractPageActivatesADraftTest', async () => {
    answer = () => json({ ...STORED, status: 'ACTIVE', currentVersionNo: 1 })
    await render('/vertraege/5')
    expect(text()).toContain('Entwurf')

    await press('Aktivieren')
    expect(text()).toContain('erhält Version 1')
    await press('Aktivieren')

    expect(written).toEqual([
      { url: '/api/tenants/1/contracts/5/activate', method: 'POST', body: {} },
    ])
  })

  it('contractPageActivatesOnlyWhatIsSavedTest', async () => {
    await render('/vertraege/5')

    await type('Bezeichnung', 'Hosting neu')

    expect(button('Aktivieren').disabled).toBe(true)
    expect(text()).toContain('Aktivieren geht erst, wenn die Änderungen gespeichert sind.')
  })

  it('contractPageAsksForTheDayOfANewVersionTest', async () => {
    stored = { ...STORED, status: 'ACTIVE', currentVersionNo: 2 }
    answer = () => json({ ...stored, currentVersionNo: 3 })
    await render('/vertraege/5')
    expect(text()).toContain('Jede Änderung am Vereinbarten wird eine neue Version')

    await pressIcon('Domain entfernen')
    await press('Speichern')
    expect(written).toEqual([])
    expect(text()).toContain('Ab welchem Tag gilt die Änderung?')

    await type('Änderung gilt ab', '2028-01-01')
    await press('Speichern')

    expect(written[0].method).toBe('PUT')
    expect(written[0].body.validFrom).toBe('2028-01-01')
    expect(written[0].body.lockVersion).toBe(3)
  })

  it('contractPageFixesTheStartOfAnActiveContractTest', async () => {
    stored = { ...STORED, status: 'ACTIVE', currentVersionNo: 2 }
    answer = () => json({ ...stored, currentVersionNo: 3 })
    await render('/vertraege/5')

    expect((control('Beginn') as HTMLInputElement).disabled).toBe(true)
    expect(text()).toContain('Steht fest seit der Aktivierung.')
    expect(document.querySelector('[aria-label="Beginn: nicht änderbar"]')).not.toBeNull()

    // Extending the contract stays open: a new end takes the next version.
    expect((control('Ende') as HTMLInputElement).disabled).toBe(false)
    await type('Ende', '2030-12-31')
    await type('Änderung gilt ab', '2028-01-01')
    await press('Speichern')

    expect(written[0].method).toBe('PUT')
    expect(written[0].body.endDate).toBe('2030-12-31')
    expect(written[0].body.startDate).toBe(STORED.startDate)
  })

  it('contractPageLeavesTheStartOfADraftOpenTest', async () => {
    await render('/vertraege/5')

    expect((control('Beginn') as HTMLInputElement).disabled).toBe(false)
    expect(text()).not.toContain('Steht fest seit der Aktivierung.')
  })

  it('contractPageRefusesADayBeforeTheStartTest', async () => {
    stored = { ...STORED, status: 'ACTIVE', currentVersionNo: 2 }
    await render('/vertraege/5')

    await type('Bezeichnung', 'Hosting')
    await type('Änderung gilt ab', '2026-12-31')
    await press('Speichern')

    expect(written).toEqual([])
    expect(text()).toContain('Die Änderung kann nicht vor dem Vertragsbeginn gelten.')
  })

  it('contractPageSavesANoteWithoutADayTest', async () => {
    stored = { ...STORED, status: 'ACTIVE', currentVersionNo: 2 }
    answer = () => json(stored)
    await render('/vertraege/5')

    await type('Notiz', 'Rückruf im März')
    expect(() => control('Änderung gilt ab')).toThrow()
    await press('Speichern')

    expect(written[0].body.note).toBe('Rückruf im März')
    expect(written[0].body.validFrom).toBeNull()
  })

  it('contractPageEndsAnActiveContractTest', async () => {
    stored = { ...STORED, status: 'ACTIVE', currentVersionNo: 2 }
    answer = () =>
      json({ ...stored, status: 'ENDED', endedOn: '2028-06-30', endReason: 'TERMINATED_BY_CUSTOMER' })
    await render('/vertraege/5')

    await press('Beenden')
    expect(text()).toContain('Kündigungsfrist laut Vertrag: 3 Monate')
    await press('Beenden')
    expect(written).toEqual([])
    expect(text()).toContain('Einen Grund aus der Liste wählen.')

    await type('Letzter Vertragstag', '2028-06-30', dialog())
    await choose('Grund', 'TERMINATED_BY_CUSTOMER', dialog())
    await press('Beenden')

    expect(written).toEqual([
      {
        url: '/api/tenants/1/contracts/5/end',
        method: 'POST',
        body: { endedOn: '2028-06-30', reason: 'TERMINATED_BY_CUSTOMER' },
      },
    ])
  })

  it('contractPageRefusesAnExpiredTermWithoutAnEndTest', async () => {
    stored = { ...STORED, status: 'ACTIVE', currentVersionNo: 1 }
    await render('/vertraege/5')

    await press('Beenden')
    await type('Letzter Vertragstag', '2028-06-30', dialog())
    await choose('Grund', 'TERM_EXPIRED', dialog())
    await press('Beenden')

    expect(written).toEqual([])
    expect(text()).toContain('Ein unbefristeter Vertrag läuft nicht ab.')
  })

  it('contractPageKeepsAnEndedContractToItsNoteTest', async () => {
    stored = {
      ...STORED,
      status: 'ENDED',
      currentVersionNo: 2,
      endedOn: '2028-06-30',
      endReason: 'MUTUAL_AGREEMENT',
    }
    await render('/vertraege/5')

    expect(text()).toContain('Beendet, letzter Vertragstag 30.06.2028')
    expect(text()).toContain('Aufhebung im gegenseitigen Einvernehmen')
    expect((control('Bezeichnung') as HTMLInputElement).disabled).toBe(true)
    expect((control('Notiz') as HTMLTextAreaElement).disabled).toBe(false)
    expect(text()).not.toContain('Position hinzufügen')
    const labels = [...document.querySelectorAll('button')].map((entry) => entry.textContent?.trim())
    expect(labels).not.toContain('Beenden')
    expect(labels).not.toContain('Aktivieren')
  })

  it('contractPageShowsTheVersionsTest', async () => {
    stored = { ...STORED, status: 'ACTIVE', currentVersionNo: 2 }
    await render('/vertraege/5')

    const register = [...document.querySelectorAll('[role="tab"]')].find((entry) =>
      entry.textContent?.startsWith('Versionen'),
    ) as HTMLButtonElement
    await act(async () => {
      register.click()
    })
    await settle()

    expect(read.some((url) => url.endsWith('/contracts/5/versions'))).toBe(true)
    expect(text()).toContain('Aktiviert')
    expect(text()).toContain('gilt ab 01.01.2028')
    expect(text()).toContain('aktuell')
    expect(text()).not.toContain('Position hinzufügen')

    const older = [...document.querySelectorAll('button[aria-pressed]')].find((entry) =>
      entry.textContent?.startsWith('Version 1'),
    ) as HTMLButtonElement
    await act(async () => {
      older.click()
    })
    await settle()
    expect(document.querySelector('[aria-label="Version 1"]')).not.toBeNull()
  })

  it('contractPageAddsAnSlaValueTest', async () => {
    await render('/vertraege/neu')

    await fillHead()
    await press('Service-Level hinzufügen')
    await type('Zielwert', '99.5', dialog())
    await type('Text', 'pro Kalendermonat', dialog())
    await press('Hinzufügen')
    expect(text()).toContain('Verfügbarkeit 99.5 % (pro Kalendermonat)')
    await press('Speichern')

    expect(written[0].body.slaValues).toEqual([
      { metric: 'AVAILABILITY', targetValue: 99.5, unit: 'PERCENT', description: 'pro Kalendermonat' },
    ])
  })

  it('contractPageOffersOnlyTheUnitsOfTheMetricTest', async () => {
    await render('/vertraege/neu')

    await press('Service-Level hinzufügen')
    const units = () =>
      [...(control('Einheit', dialog()) as HTMLSelectElement).options].map((option) => option.value)
    expect(units()).toEqual(['PERCENT'])
    await choose('Kennzahl', 'RESPONSE_TIME', dialog())

    expect(units()).toEqual(['HOURS', 'MINUTES', 'DAYS', 'BUSINESS_DAYS'])
    expect((control('Einheit', dialog()) as HTMLSelectElement).value).toBe('HOURS')
  })

  it('contractPageRefusesAboveHundredPercentInTheDialogTest', async () => {
    await render('/vertraege/neu')

    await press('Service-Level hinzufügen')
    await type('Zielwert', '100.5', dialog())
    await press('Hinzufügen')

    expect(text()).toContain('In Prozent liegt ein Zielwert zwischen 0 und 100.')
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
  })

  it('contractPageAsksForTheDayWhenAnSlaValueChangesTest', async () => {
    stored = { ...STORED, status: 'ACTIVE', currentVersionNo: 2, slaValues: [AVAILABILITY] }
    answer = () => json({ ...stored, currentVersionNo: 3 })
    await render('/vertraege/5')
    expect(text()).toContain('Verfügbarkeit 99.5 % (pro Kalendermonat)')

    await pressIcon('Verfügbarkeit 99.5 % (pro Kalendermonat) bearbeiten')
    await type('Zielwert', '99.9', dialog())
    await press('Übernehmen')
    await press('Speichern')
    expect(written).toEqual([])
    expect(text()).toContain('Ab welchem Tag gilt die Änderung?')

    await type('Änderung gilt ab', '2028-01-01')
    await press('Speichern')

    expect(written[0].body.validFrom).toBe('2028-01-01')
    expect(written[0].body.slaValues).toEqual([{ ...AVAILABILITY, targetValue: 99.9 }])
  })

  it('contractPageShowsTheSlaFieldErrorOfTheBackendAtThePanelTest', async () => {
    answer = () =>
      json(
        {
          status: 400,
          detail: 'Service-Level 1: Die Kennzahl «UPTIME» gibt es nicht.',
          errors: [
            {
              field: 'slaValues[0].metric',
              message: 'Service-Level 1: Die Kennzahl «UPTIME» gibt es nicht.',
            },
          ],
        },
        400,
      )
    await render('/vertraege/5')

    await type('Bezeichnung', 'Hosting neu')
    await press('Speichern')

    const alerts = [...document.querySelectorAll('[role="alert"]')].map((entry) => entry.textContent)
    expect(alerts).toContain('Service-Level 1: Die Kennzahl «UPTIME» gibt es nicht.')
    // Told at the panel, so no notice above the form says it a second time.
    expect(text().split('Die Kennzahl «UPTIME» gibt es nicht.')).toHaveLength(2)
  })

  it('contractPageShowsTheSlaValuesOfAVersionTest', async () => {
    stored = { ...STORED, status: 'ACTIVE', currentVersionNo: 2, slaValues: [AVAILABILITY] }
    await render('/vertraege/5')

    const register = [...document.querySelectorAll('[role="tab"]')].find((entry) =>
      entry.textContent?.startsWith('Versionen'),
    ) as HTMLButtonElement
    await act(async () => {
      register.click()
    })
    await settle()
    expect(text()).toContain('Verfügbarkeit 99.5 % (pro Kalendermonat)')
    expect(text()).not.toContain('Service-Level hinzufügen')

    const older = [...document.querySelectorAll('button[aria-pressed]')].find((entry) =>
      entry.textContent?.startsWith('Version 1'),
    ) as HTMLButtonElement
    await act(async () => {
      older.click()
    })
    await settle()
    expect(text()).toContain('Verfügbarkeit 99 % (pro Kalendermonat)')
  })

  it('contractPageShowsNoRegistersForADraftTest', async () => {
    await render('/vertraege/5')

    expect(document.querySelector('[role="tab"]')).toBeNull()
  })

  it('contractPageIsReadOnlyWithoutTheWriteRightTest', async () => {
    await render('/vertraege/5', ['CONTRACT_READ'])

    expect([...document.querySelectorAll('button')].map((entry) => entry.textContent?.trim()))
      .not.toContain('Speichern')
    expect(text()).not.toContain('Position hinzufügen')
    expect((control('Bezeichnung') as HTMLInputElement).disabled).toBe(true)
  })
})
