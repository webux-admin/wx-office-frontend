// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import type {
  SalesDocument,
  TimeBillingPreview,
  TimeBillingRequest,
  TimeWorklistLine,
} from '../lib/types'
import { TimeTakeover } from './TimeTakeover'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const WORKLIST_URL = '/api/tenants/1/time-tracking/billing/worklist'
const PREVIEW_URL = '/api/tenants/1/time-tracking/billing/preview'
const BILL_URL = '/api/tenants/1/time-tracking/billing'

/** An invoice draft of Muster AG. */
const DRAFT: SalesDocument = {
  id: 42,
  documentTypeId: 1,
  category: 'INVOICE',
  status: 'DRAFT',
  documentDate: '2026-11-20',
  partnerId: 11,
  recipient: { name: 'Muster AG' },
  currency: 'CHF',
  totalNet: 0,
  totalVat: 0,
  totalGross: 0,
  subtotalsIncludeVat: false,
  pricesIncludeVat: false,
  lines: [],
}

function worklistLine(overrides: Partial<TimeWorklistLine>): TimeWorklistLine {
  return {
    partnerId: 11,
    customerName: 'Muster AG',
    projectId: 51,
    projectNumber: 'P-00012',
    projectName: 'Website',
    openEntries: 3,
    openMinutes: 580,
    billedMinutes: 585,
    estimatedAmount: 1560,
    currency: 'CHF',
    oldestWorkDate: '2026-11-03',
    ...overrides,
  }
}

function previewOf(request: TimeBillingRequest): TimeBillingPreview {
  return {
    partnerId: 11,
    customerName: 'Muster AG',
    until: request.until ?? '2026-11-30',
    grouping: request.grouping ?? 'BY_SERVICE',
    documentId: request.documentId ?? null,
    currency: 'CHF',
    billingIncrementMinutes: 1,
    candidates: [
      {
        entryId: 101,
        workDate: '2026-11-03',
        userId: 1,
        userName: 'Anna Muster',
        projectId: 51,
        projectNumber: 'P-00012',
        productId: 31,
        serviceName: 'Konzeption',
        durationMinutes: 150,
        billedMinutes: 150,
        description: 'Wireframes',
        selected: true,
      },
    ],
    lines: [
      {
        productId: 31,
        serviceName: 'Konzeption',
        subtitle: 'P-00012 Website',
        serviceDateFrom: '2026-11-03',
        quantity: 2.5,
        unitPrice: 160,
        priceIncludesVat: false,
        rateOrigin: 'PROJECT_RATE',
        vatRate: 8.1,
        amount: 400,
        entryIds: [101],
      },
    ],
    skipped: [],
    totalAmount: 400,
    totalNet: 400,
    vatLiable: true,
  }
}

function session(
  permissions = ['TIME_BILL', 'INVOICE_WRITE', 'INVOICE_READ'],
  modules = ['TIMETRACKING'],
): AuthState {
  return {
    user: {
      userId: 1,
      username: 'anna',
      activeTenantId: 1,
      superuser: false,
      tenants: [{ id: 1, code: 'WX', name: 'Webux', isDefault: true, modules }],
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
let requests: { method: string; url: string; body: unknown }[]
let lines: TimeWorklistLine[]
let taken: number

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  )
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 30, 10, 0))
  requests = []
  taken = 0
  // Website and a second project, and the time on the customer alone: 12:30 in all.
  lines = [
    worklistLine({}),
    worklistLine({ projectId: 52, projectNumber: 'P-00015', openMinutes: 140 }),
    worklistLine({ projectId: null, projectNumber: null, projectName: null, openMinutes: 30 }),
  ]
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    requests.push({ method, url, body })
    if (url.startsWith(WORKLIST_URL)) return json(lines)
    if (url === PREVIEW_URL) return json(previewOf(body))
    if (url === BILL_URL) {
      return json(
        {
          documentId: 42,
          newDraft: false,
          currency: 'CHF',
          totalNet: 400,
          totalVat: 32.4,
          totalGross: 432.4,
          lines: 1,
          billedEntryIds: [101],
          skipped: [],
        },
        201,
      )
    }
    return json({ detail: 'unbekannt' }, 404)
  })
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

async function render(auth: AuthState = session()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/rechnungen/42']}>
        <AuthContext.Provider value={auth}>
          <QueryClientProvider client={client}>
            <TimeTakeover tenantId={1} document={DRAFT} onTaken={() => (taken += 1)} />
          </QueryClientProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
  })
  await settle()
}

function button(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll('button')].find((entry) => entry.textContent?.trim() === label)
}

async function click(element: Element | undefined) {
  if (element === undefined) throw new Error('nothing to click')
  await act(async () => {
    ;(element as HTMLElement).click()
  })
  await settle()
}

describe('TimeTakeover', () => {
  /** The customer of the draft has 12:30 open over two projects and without one. */
  it('timeTakeoverShowsTheOpenHoursTest', async () => {
    await render()

    expect(requests[0].url).toBe(`${WORKLIST_URL}?until=2026-11-30&partnerId=11`)
    expect(button('Zeiten übernehmen (12:30 Std.)')).toBeDefined()
  })

  /** The mask opens with this draft as target, which cannot be changed there. */
  it('timeTakeoverOpensTheMaskOnThisDraftTest', async () => {
    await render()

    await click(button('Zeiten übernehmen (12:30 Std.)'))

    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog?.textContent).toContain('Zeiten übernehmen')
    expect(dialog?.textContent).toContain('kommen als Positionen in Entwurf 42')
    expect(requests.find((request) => request.url === PREVIEW_URL)?.body).toEqual({
      partnerId: 11,
      until: '2026-11-30',
      grouping: 'BY_SERVICE',
      documentId: 42,
    })
    expect(dialog?.textContent).toContain('Projektsatz')
    expect(dialog?.textContent).not.toContain('Ziel')
    expect(requests.some((request) => request.url.includes('/invoices'))).toBe(false)
  })

  /** Taking the times over writes onto this draft, closes and lets the draft read itself anew. */
  it('timeTakeoverWritesOntoTheDraftTest', async () => {
    await render()
    await click(button('Zeiten übernehmen (12:30 Std.)'))

    await click(button('In den Entwurf übernehmen'))

    const bill = requests.find((request) => request.url === BILL_URL)
    expect(bill?.method).toBe('POST')
    expect(bill?.body).toMatchObject({ partnerId: 11, documentId: 42 })
    expect(taken).toBe(1)
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  /** Nothing open for the customer: no button. */
  it('timeTakeoverWithoutOpenTimeTest', async () => {
    lines = []

    await render()

    expect(container.querySelector('button')).toBeNull()
  })

  /** TIME_BILL and INVOICE_WRITE together, as the backend asks for writing. */
  it('timeTakeoverWithoutTheRightsTest', async () => {
    await render(session(['TIME_BILL', 'INVOICE_READ']))
    expect(container.querySelector('button')).toBeNull()

    act(() => root.unmount())
    root = createRoot(container)
    await render(session(['INVOICE_WRITE']))
    expect(container.querySelector('button')).toBeNull()
    expect(requests).toEqual([])
  })

  it('timeTakeoverWithTheModuleOffTest', async () => {
    await render(session(undefined, ['PROJECT']))

    expect(container.querySelector('button')).toBeNull()
    expect(requests).toEqual([])
  })
})
