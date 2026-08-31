// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import type { OpenItem, Page, PaymentReceipt } from '../lib/types'
import { PaymentReceiptListPage } from './PaymentReceiptListPage'

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
const RECORDER = session(['INVOICE_READ', 'INVOICE_PAYMENT_RECORD'])

function receipt(overrides: Partial<PaymentReceipt> = {}): PaymentReceipt {
  return {
    id: 31,
    kind: 'PAYMENT',
    partnerId: 1,
    partnerNumber: 'K-1',
    payerName: 'Druckerei Meier AG',
    amount: 1250,
    currency: 'CHF',
    valueDate: '2026-04-17',
    source: 'MANUAL',
    payerReference: '21 00000 00003 13947 14300 09',
    referenceType: 'QRR',
    assigned: 0,
    unassigned: 1250,
    state: 'OPEN',
    assignments: [],
    recordedAt: '2026-04-17T09:12:00Z',
    recordedBy: 'muster',
    ...overrides,
  }
}

function openItem(): OpenItem {
  return {
    documentId: 11,
    documentNumber: 'RE-2026-0142',
    documentDate: '2026-01-05',
    dueDate: '2026-02-04',
    partnerId: 1,
    partnerNumber: 'K-1',
    partnerName: 'Druckerei Meier AG',
    currency: 'CHF',
    totalGross: 400,
    settled: 0,
    open: 400,
    overdue: true,
    daysOverdue: 72,
  }
}

function page(content: PaymentReceipt[]): Page<PaymentReceipt> {
  return { content, page: 0, size: 50, totalElements: content.length, totalPages: 1, sort: '' }
}

let container: HTMLDivElement
let root: Root
/** Every address the mask asked for, in the order it asked. */
let asked: string[]
/** Every body it posted, so a test can prove what travelled together. */
let posted: unknown[]
/** What the list endpoint answers; every test sets what it is about. */
let receipts: Page<PaymentReceipt>

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
  posted = []
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    asked.push(url)
    if (init?.body !== undefined) posted.push(JSON.parse(String(init.body)))
    if (url.includes('/open-items/lookup')) return json(openItem())
    if (url.includes('/payment-receipts?')) return json(receipts)
    if (/\/payment-receipts$/.test(url)) return json(receipt({ id: 77 }))
    if (url.includes('/assignments')) return json(receipt({ id: 77, state: 'PARTIAL' }))
    if (url.includes('/payment-receipts/')) return json(receipts.content[0] ?? receipt())
    return json([])
  })
}

beforeEach(() => {
  receipts = page([receipt()])
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

async function render(auth: AuthState = RECORDER) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/zahlungen']}>
        <AuthContext.Provider value={auth}>
          <QueryClientProvider client={client}>
            <PaymentReceiptListPage />
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
  return [...document.querySelectorAll('button')].find(
    (entry) => entry.textContent === label,
  ) as HTMLButtonElement | undefined
}

function field(label: string): HTMLInputElement | undefined {
  const found = [...document.querySelectorAll('label')].find(
    (entry) => entry.textContent === label,
  )
  const id = found?.getAttribute('for')
  // `getElementById` and not a `#id` selector: React 19 builds ids with guillemets, and
  // jsdom here has no `CSS.escape` to make them selectable.
  return id === null || id === undefined
    ? undefined
    : (document.getElementById(id) as HTMLInputElement | null) ?? undefined
}

/** Types into a field the way React reads it back. */
function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('PaymentReceiptListPage', () => {
  it('paymentReceiptListPageListsWhatCameInTest', async () => {
    await render()

    expect(text()).toContain('Druckerei Meier AG')
    expect(text()).toContain('1’250.00')
    expect(text()).toContain('offen')
    expect(asked.some((url) => url.includes('/api/tenants/1/payment-receipts'))).toBe(true)
  })

  /**
   * The empty state says why the list may be short: it starts on the day the receipt was
   * introduced, and everything older stands at its Rechnung (backend ADR-0103).
   */
  it('paymentReceiptListPageSaysWhereTheListBeginsTest', async () => {
    receipts = page([])

    await render()

    expect(text()).toContain('Nichts erfasst')
    expect(text()).toContain('Tag der Einführung')
  })

  /** A fully spread receipt shows no zero: the reader is looking for what still needs work. */
  it('paymentReceiptListPageHidesAZeroRestTest', async () => {
    receipts = page([receipt({ assigned: 1250, unassigned: 0, state: 'ASSIGNED' })])

    await render()

    const cells = [...container.querySelectorAll('tbody td')].map((cell) => cell.textContent)

    expect(cells).toContain('–')
    expect(cells).not.toContain('0.00')
    expect(text()).toContain('zugewiesen')
  })

  it('paymentReceiptListPageHidesTheButtonWithoutTheRightTest', async () => {
    await render(READER)

    expect(button('Zahlungseingang erfassen')).toBeUndefined()
    expect(text()).toContain('fehlt das Recht')
  })

  /** The filter travels as a query, and a state that was not chosen must not travel at all. */
  it('paymentReceiptListPageFiltersByStateTest', async () => {
    await render()
    const select = document.querySelector('select') as HTMLSelectElement

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLSelectElement.prototype,
        'value',
      )?.set
      setter?.call(select, 'PARTIAL')
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await settle()

    expect(asked.some((url) => url.includes('state=PARTIAL'))).toBe(true)
    expect(asked[0]).not.toContain('state=')
  })

  /**
   * The way through the dialog: type a reference, the Rechnung appears, save.
   *
   * <p>Two calls in one go — the receipt, then every assignment together. Three settlement
   * lines of which two were written is a state nobody can read back.
   */
  it('paymentReceiptListPageRecordsAndAssignsInOneGoTest', async () => {
    await render()

    await act(async () => {
      button('Zahlungseingang erfassen')?.click()
    })
    await settle()

    const amount = field('Betrag')
    expect(amount).toBeDefined()
    await act(async () => {
      type(amount!, '1250.00')
    })

    const lookup = field('Rechnung suchen')
    await act(async () => {
      type(lookup!, 'RE-2026-0142')
    })
    await act(async () => {
      button('Zuweisen')?.click()
    })
    await settle()

    expect(text()).toContain('RE-2026-0142')
    expect(text()).toContain('Noch nicht zugewiesen')

    await act(async () => {
      button('Speichern')?.click()
    })
    await settle()

    expect(posted).toHaveLength(2)
    expect((posted[0] as { amount: number }).amount).toBe(1250)
    expect((posted[1] as { assignments: unknown[] }).assignments).toEqual([
      { documentId: 11, amount: 400 },
    ])
  })

  /** Saving is locked while more was handed out than came in, and the mask says so itself. */
  it('paymentReceiptListPageLocksSavingBeyondTheReceiptTest', async () => {
    await render()

    await act(async () => {
      button('Zahlungseingang erfassen')?.click()
    })
    await settle()

    await act(async () => {
      type(field('Betrag')!, '100.00')
    })
    await act(async () => {
      type(field('Rechnung suchen')!, 'RE-2026-0142')
    })
    await act(async () => {
      button('Zuweisen')?.click()
    })
    await settle()

    // The lookup pre-fills min(Rest, offen) = 100.00, so the line has to be raised by hand
    // for the rule to bite.
    const rows = [...document.querySelectorAll('input')].filter(
      (input) => input.getAttribute('inputmode') === 'decimal',
    )
    await act(async () => {
      type(rows[rows.length - 1]!, '400.00')
    })
    await settle()

    expect(text()).toContain('zu viel')
    expect(button('Speichern')?.disabled).toBe(true)
  })
})
