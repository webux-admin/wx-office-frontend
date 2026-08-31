// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import type { CustomerCredit, CustomerCreditBalance } from '../lib/types'
import { CustomerCreditPage } from './CustomerCreditPage'

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
const RECORDER = session(['INVOICE_READ', 'CUSTOMER_CREDIT_RECORD'])
const FULL = session(['INVOICE_READ', 'CUSTOMER_CREDIT_RECORD', 'CUSTOMER_CREDIT_REFUND'])

function balance(over: Partial<CustomerCreditBalance> = {}): CustomerCreditBalance {
  return {
    partnerId: 42,
    partnerNumber: 'K-1',
    partnerName: 'Meier AG',
    currency: 'CHF',
    balance: 1250,
    oldestValueDate: '2026-01-05',
    receiptCount: 2,
    ...over,
  }
}

function credit(over: Partial<CustomerCredit> = {}): CustomerCredit {
  return {
    receiptId: 31,
    kind: 'ADVANCE',
    partnerId: 42,
    partnerNumber: 'K-1',
    payerName: 'Meier AG',
    amount: 1250,
    applied: 400,
    used: 0,
    remaining: 850,
    currency: 'CHF',
    valueDate: '2026-01-05',
    ageDays: 102,
    note: 'Kostenvorschuss',
    uses: [],
    ...over,
  }
}

let container: HTMLDivElement
let root: Root
let asked: string[]
let balances: CustomerCreditBalance[]
let credits: CustomerCredit[]

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
    if (url.includes('/customer-credits/balances')) return json(balances)
    if (url.includes('/customer-credits')) return json(credits)
    return json([])
  })
}

beforeEach(() => {
  balances = [balance()]
  credits = [credit()]
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

async function render(auth: AuthState = FULL) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/guthaben']}>
        <AuthContext.Provider value={auth}>
          <QueryClientProvider client={client}>
            <CustomerCreditPage />
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

describe('CustomerCreditPage', () => {
  it('customerCreditPageShowsTheBalanceTest', async () => {
    await render()

    expect(text()).toContain('Meier AG')
    expect(text()).toContain('1’250.00')
    expect(asked.some((url) => url.includes('/customer-credits/balances'))).toBe(true)
  })

  /**
   * One total per currency, never one across them.
   *
   * <p>CHF and EUR do not add up, and a single number over both would be a figure nobody can
   * act on (backend ADR-0104).
   */
  it('customerCreditPageTotalsPerCurrencyTest', async () => {
    balances = [
      balance({ balance: 1000 }),
      balance({ partnerId: 43, partnerName: 'Huber GmbH', currency: 'EUR', balance: 400 }),
    ]

    await render()

    expect(text()).toContain('Total CHF')
    expect(text()).toContain('Total EUR')
    expect(text()).not.toContain('Total 1’400.00')
  })

  /** The screen says out loud that a credit does not expire on its own. */
  it('customerCreditPageSaysNothingExpiresByItselfTest', async () => {
    await render()

    expect(text()).toContain('verfällt nicht von selbst')
    expect(text()).toContain('OR Art. 142')
  })

  it('customerCreditPageHidesTheButtonsWithoutTheRightsTest', async () => {
    await render(READER)

    expect(button('Vorauszahlung erfassen')).toBeUndefined()
    expect(text()).toContain('fehlt das Recht')
  })

  /**
   * Recording is not refunding.
   *
   * <p>Assigning money is daily work, disposing of somebody else's money without a service in
   * return is not — so the two buttons hang on two rights.
   */
  it('customerCreditPageOffersRefundOnlyWithTheRefundRightTest', async () => {
    await render(RECORDER)
    await act(async () => {
      button('Eingänge')?.click()
    })
    await settle()

    expect(button('Verrechnen')).toBeDefined()
    expect(button('Zurückzahlen')).toBeUndefined()
    expect(button('Auflösen')).toBeUndefined()
  })

  it('customerCreditPageShowsTheAgeOnTheReceiptsTest', async () => {
    await render()
    await act(async () => {
      button('Eingänge')?.click()
    })
    await settle()

    expect(text()).toContain('102 Tage')
    expect(text()).toContain('91–365 Tage')
    expect(text()).toContain('Vorauszahlung')
  })

  /** A credit with nothing left offers no action; there is nothing to do with it. */
  it('customerCreditPageOffersNothingOnAUsedUpCreditTest', async () => {
    credits = [credit({ applied: 1250, remaining: 0 })]

    await render()
    await act(async () => {
      button('Eingänge')?.click()
    })
    await settle()

    expect(button('Verrechnen')).toBeUndefined()
    expect(button('Zurückzahlen')).toBeUndefined()
  })

  it('customerCreditPageOpensTheAdvanceDialogTest', async () => {
    await render()

    await act(async () => {
      button('Vorauszahlung erfassen')?.click()
    })
    await settle()

    // The dialog names the rule that makes a prepayment different from an ordinary receipt.
    expect(text()).toContain('MWSTG Art. 40 Abs. 1 Bst. c')
  })

  it('customerCreditPageShowsAnEmptyBalanceTest', async () => {
    balances = []
    credits = []

    await render()

    expect(text()).toContain('Kein Guthaben')
  })
})
