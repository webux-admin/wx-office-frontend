// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import type { SubscriptionPreview, SubscriptionRunResult } from '../lib/types'
import { SubscriptionRunPage } from './SubscriptionRunPage'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1

function session(permissions: string[], modules = ['SUBSCRIPTION']): AuthState {
  return {
    user: {
      userId: 1,
      username: 'muster',
      activeTenantId: TENANT,
      superuser: false,
      tenants: [{ id: TENANT, code: 'WX', name: 'Webux', isDefault: true, modules }],
      permissions,
    },
    loading: false,
    signIn: () => Promise.reject(new Error('nicht gebraucht')),
    completeSecondFactor: () => Promise.reject(new Error('nicht gebraucht')),
    sendSecondFactorCode: () => Promise.resolve(),
    adoptSession: () => {},
    switchTenant: () => Promise.resolve(),
    signOut: () => Promise.resolve(),
    refresh: () => Promise.resolve(),
    can: (permission: string) => permissions.includes(permission),
  }
}

const RUNNER = session(['SUBSCRIPTION_READ', 'SUBSCRIPTION_RUN', 'INVOICE_READ'])
const READER = session(['SUBSCRIPTION_READ'])

let container: HTMLDivElement
let root: Root
/** Every request the screen sent: method, address and body. */
let requests: { method: string; url: string; body: Record<string, unknown> }[]
let preview: SubscriptionPreview
let result: SubscriptionRunResult

function json(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

function stubFetch() {
  requests = []
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {}
    requests.push({ method, url, body })
    if (url.includes('/subscription-runs/preview')) return json(preview)
    if (url.includes('/subscription-runs')) return json(result)
    return json([])
  })
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2028, 0, 10))
  preview = {
    month: '2028-01',
    invoiceCount: 1,
    lineCount: 2,
    skippedCount: 1,
    totals: [{ currency: 'CHF', amount: 1300 }],
    contracts: [
      {
        contractId: 7,
        contractNumber: 'V-00007',
        title: 'Hosting und Lizenz',
        customerName: 'Bäckerei Huber AG',
        status: 'ACTIVE',
        versionNo: 2,
        currency: 'CHF',
        total: 1300,
        lines: [
          {
            positionKey: 'a',
            title: 'Hosting',
            periodStart: '2028-01-01',
            periodEnd: '2028-01-31',
            quantity: 1,
            unitPrice: 100,
            priceIncludesVat: false,
            vatCategory: 'STANDARD',
            amount: 100,
          },
          {
            positionKey: 'b',
            title: 'Lizenz',
            periodStart: '2028-01-01',
            periodEnd: '2028-12-31',
            quantity: 1,
            unitPrice: 1200,
            priceIncludesVat: false,
            vatCategory: 'STANDARD',
            amount: 1200,
          },
        ],
        skipped: [],
        notices: ['Version 3 gilt ab 15.03.2028, mitten in der Periode.'],
      },
      {
        contractId: 8,
        contractNumber: 'V-00008',
        title: 'Support',
        customerName: 'Schreinerei Keller GmbH',
        status: 'DRAFT',
        versionNo: null,
        currency: null,
        total: 0,
        lines: [],
        skipped: [
          {
            contractId: 8,
            contractNumber: 'V-00008',
            positionKey: 'c',
            title: 'Support',
            periodStart: '2028-01-01',
            periodEnd: '2028-01-31',
            reason: 'CONTRACT_DRAFT',
            message: 'Der Vertrag ist ein Entwurf; verrechnet wird erst ein aktiver Vertrag.',
          },
        ],
        notices: [],
      },
    ],
  }
  result = {
    runId: 9,
    month: '2028-01',
    created: [
      {
        contractId: 7,
        contractNumber: 'V-00007',
        customerName: 'Bäckerei Huber AG',
        documentId: 300,
        versionNo: 2,
        lineCount: 2,
        currency: 'CHF',
        totalGross: 1405.3,
      },
    ],
    skipped: [
      {
        contractId: 8,
        contractNumber: 'V-00008',
        positionKey: 'c',
        title: 'Support',
        periodStart: '2028-01-01',
        periodEnd: '2028-01-31',
        reason: 'CONTRACT_DRAFT',
        message: 'Der Vertrag ist ein Entwurf; verrechnet wird erst ein aktiver Vertrag.',
      },
    ],
    failed: [
      {
        contractId: 10,
        contractNumber: 'V-00010',
        customerName: 'Druckerei Meier AG',
        message: 'ein Beleg in Fremdwährung braucht einen Kurs in die Buchführungswährung',
      },
    ],
    notices: [],
  }
  stubFetch()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

async function settle() {
  for (let round = 0; round < 6; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

async function render(auth: AuthState = RUNNER) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/abo-lauf']}>
        <AuthContext.Provider value={auth}>
          <QueryClientProvider client={client}>
            <SubscriptionRunPage />
          </QueryClientProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
  })
  await settle()
}

function text(): string {
  return document.body.textContent ?? ''
}

function button(label: string): HTMLButtonElement | undefined {
  return [...document.body.querySelectorAll('button')].find(
    (entry) => entry.textContent === label,
  ) as HTMLButtonElement | undefined
}

function monthField(): HTMLInputElement {
  return container.querySelector('input[type=month]') as HTMLInputElement
}

async function click(element: Element | undefined) {
  expect(element).toBeDefined()
  await act(async () => {
    ;(element as HTMLElement).click()
  })
  await settle()
}

async function type(element: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  await act(async () => {
    setter?.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await settle()
}

function writes() {
  return requests.filter((entry) => entry.method === 'POST')
}

describe('SubscriptionRunPage', () => {
  /** The screen opens on the current month and asks the preview for it. */
  it('subscriptionRunPageShowsThePreviewTest', async () => {
    await render()

    expect(monthField().value).toBe('2028-01')
    expect(requests[0].url).toBe('/api/tenants/1/subscription-runs/preview?month=2028-01')
    expect(text()).toContain('Vorschau Januar 2028')
    expect(text()).toContain('V-00007')
    expect(text()).toContain('Bäckerei Huber AG')
    expect(text()).toContain('V2')
    expect(text()).toMatch(/1.300\.00 CHF/)
    expect(writes()).toHaveLength(0)
  })

  /** Skipped periods and notices stand beside the preview, with the reason as a word. */
  it('subscriptionRunPageShowsSkippedPeriodsAndNoticesTest', async () => {
    await render()

    expect(text()).toContain('Übersprungen')
    expect(text()).toContain('Vertrag im Entwurf')
    expect(text()).toContain('verrechnet wird erst ein aktiver Vertrag')
    expect(text()).toContain('Hinweise')
    expect(text()).toContain('Version 3 gilt ab 15.03.2028')
  })

  /** Nothing is written before the dialog named count, month and sum. */
  it('subscriptionRunPageAsksBeforeTheRunTest', async () => {
    await render()
    await click(button('Abo-Lauf starten'))

    expect(text()).toContain('1 Rechnungsentwurf für Januar 2028')
    expect(writes()).toHaveLength(0)

    await click(button('Entwürfe erstellen'))

    expect(writes()).toHaveLength(1)
    expect(writes()[0].url).toBe('/api/tenants/1/subscription-runs')
    expect(writes()[0].body).toEqual({ month: '2028-01' })
  })

  /** The result names what was made, links each draft, and says what broke. */
  it('subscriptionRunPageShowsTheThreeListsTest', async () => {
    await render()
    await click(button('Abo-Lauf starten'))
    await click(button('Entwürfe erstellen'))

    expect(text()).toContain(
      '1 Rechnungsentwurf erstellt, 1 Periode übersprungen, 1 Vertrag fehlgeschlagen.',
    )
    const draftLink = [...container.querySelectorAll('a')].find(
      (anchor) => anchor.textContent === 'Entwurf öffnen',
    )
    expect(draftLink?.getAttribute('href')).toBe('/rechnungen/300')
    expect(text()).toContain('Fehlgeschlagen')
    expect(text()).toContain('braucht einen Kurs')
    expect(text()).toContain('kein Entwurf und keine verrechnete Periode')
  })

  /** Another month is another preview, and the result of the last run goes away. */
  it('subscriptionRunPageAsksAgainForAnotherMonthTest', async () => {
    await render()
    await click(button('Abo-Lauf starten'))
    await click(button('Entwürfe erstellen'))

    await type(monthField(), '2028-02')

    expect(requests.some((entry) => entry.url.endsWith('preview?month=2028-02'))).toBe(true)
    expect(text()).not.toContain('Entwurf öffnen')
    expect(text()).toContain('Vorschau Februar 2028')
  })

  /** A month with nothing due cannot be run. */
  it('subscriptionRunPageWithNothingDueTest', async () => {
    preview = {
      month: '2028-01',
      invoiceCount: 0,
      lineCount: 0,
      skippedCount: 0,
      totals: [],
      contracts: [],
    }
    await render()

    expect(text()).toContain('Nichts fällig')
    expect(button('Abo-Lauf starten')?.disabled).toBe(true)
  })

  /** Reading is allowed, running is not: no button, and a sentence saying why. */
  it('subscriptionRunPageForAReaderTest', async () => {
    await render(READER)

    expect(text()).toContain('V-00007')
    expect(button('Abo-Lauf starten')).toBeUndefined()
    expect(text()).toContain('fehlt das Recht')
  })

  /** A tenant that does not run the module sees no run and asks nothing. */
  it('subscriptionRunPageWithModuleOffTest', async () => {
    await render(session(['SUBSCRIPTION_READ', 'SUBSCRIPTION_RUN'], ['CONTRACT']))

    expect(button('Abo-Lauf starten')).toBeUndefined()
    expect(requests).toHaveLength(0)
  })
})
