// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import type { OpenItem, Page } from '../lib/types'
import { OpenItemListPage } from './OpenItemListPage'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1

function session(permissions: string[]): AuthState {
  return {
    user: {
      userId: 1,
      username: 'muster',
      activeTenantId: TENANT,
      superuser: false,
      tenants: [{ id: TENANT, code: 'WX', name: 'Webux', isDefault: true, modules: [] }],
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

const READER = session(['INVOICE_READ'])
const WRITER = session(['INVOICE_READ', 'INVOICE_WRITE_OFF'])

function item(overrides: Partial<OpenItem> = {}): OpenItem {
  return {
    documentId: 11,
    documentNumber: 'RE-2026-0011',
    documentDate: '2026-01-05',
    dueDate: '2026-02-04',
    partnerId: 1,
    partnerNumber: 'K-1',
    partnerName: 'Druckerei Meier AG',
    currency: 'CHF',
    totalGross: 1297.2,
    settled: 1297,
    open: 0.2,
    overdue: true,
    daysOverdue: 206,
    ...overrides,
  }
}

function page(content: OpenItem[]): Page<OpenItem> {
  return { content, page: 0, size: 50, totalElements: content.length, totalPages: 1, sort: '' }
}

let container: HTMLDivElement
let root: Root
/** Every address the mask asked for, in the order it asked. */
let asked: string[]
/** What the open item endpoint answers; every test sets what it is about. */
let items: Page<OpenItem>

function json(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

function stubFetch() {
  asked = []
  vi.stubGlobal('fetch', (url: string) => {
    asked.push(url)
    if (url.includes('/open-items')) return json(items)
    return json([])
  })
}

beforeEach(() => {
  items = page([item()])
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

async function render(auth: AuthState = WRITER) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/offene-posten']}>
        <AuthContext.Provider value={auth}>
          <QueryClientProvider client={client}>
            <OpenItemListPage />
          </QueryClientProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
  })
  await settle()
}

function text(): string {
  return container.textContent ?? ''
}

function button(label: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find(
    (entry) => entry.textContent === label,
  ) as HTMLButtonElement | undefined
}

describe('OpenItemListPage', () => {
  it('openItemListPageListsWhatIsOwedTest', async () => {
    await render()

    expect(text()).toContain('Druckerei Meier AG')
    expect(text()).toContain('RE-2026-0011')
    expect(text()).toContain('0.20')
    expect(text()).toContain('206 Tage')
    expect(asked.some((url) => url.includes('/api/tenants/1/open-items'))).toBe(true)
  })

  /**
   * A negative open amount is a credit the customer is owed.
   *
   * <p>Printed as «-0.20 offen» it would read as a debt of minus twenty rappen — the reading
   * the invoice list already refuses (backend ADR-0091).
   */
  it('openItemListPageShowsANegativeOpenAmountAsACreditTest', async () => {
    items = page([item({ open: -0.2, overdue: false, daysOverdue: 0 })])

    await render()

    expect(text()).toContain('Guthaben')
    expect(text()).not.toContain('-0.20')
  })

  /**
   * Only the five fields the endpoint offers carry a sort button.
   *
   * <p>The name reaches an `ORDER BY`, and the server answers 400 for anything it does not
   * know — a button on «Tage überfällig» would be a broken request waiting to be clicked.
   */
  it('openItemListPageSortsOnlyByWhatTheServerKnowsTest', async () => {
    await render()

    const sortable = [...container.querySelectorAll('thead button')].map(
      (entry) => entry.textContent,
    )

    expect(sortable).toEqual(['Kunde', 'Nummer', 'Belegdatum', 'Fällig', 'Offen'])
  })

  it('openItemListPageHidesTheWriteOffButtonWithoutTheRightTest', async () => {
    await render(READER)

    expect(button('Ausbuchen')).toBeUndefined()
    expect(text()).toContain('fehlt das Recht')
  })

  it('openItemListPageOpensTheWriteOffDialogTest', async () => {
    await render()

    await act(async () => {
      button('Ausbuchen')?.click()
    })
    await settle()

    // The dialog names the booking date, which is what tells it apart from a payment.
    expect(text()).toContain('Periode der MWST-Korrektur')
  })

  /** A settled Rechnung has nothing to give up, so it offers no button either. */
  it('openItemListPageOffersNoWriteOffOnASettledInvoiceTest', async () => {
    items = page([item({ open: 0, overdue: false, daysOverdue: 0 })])

    await render()

    expect(button('Ausbuchen')).toBeUndefined()
    expect(text()).toContain('bezahlt')
  })
})
