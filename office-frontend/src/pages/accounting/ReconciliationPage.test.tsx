// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../../auth/authContext'
import { ACCOUNTING_RIGHTS } from '../../lib/accounting'
import { ReconciliationPage } from './ReconciliationPage'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1

let container: HTMLDivElement
let root: Root
let rows: unknown[] = []
let asked: string[] = []

function auth(permissions: string[]): AuthState {
  return {
    user: {
      userId: 1,
      username: 'muster',
      activeTenantId: TENANT,
      superuser: false,
      tenants: [
        { id: TENANT, code: 'WX', name: 'Webux', isDefault: true, modules: ['ACCOUNTING'] },
      ],
      permissions,
    },
    loading: false,
    signIn: () => Promise.reject(new Error('not in this test')),
    completeSecondFactor: () => Promise.reject(new Error('not in this test')),
    sendSecondFactorCode: () => Promise.resolve(),
    adoptSession: () => {},
    signOut: () => Promise.resolve(),
    switchTenant: () => Promise.resolve(),
    refresh: () => Promise.resolve(),
    can: (permission: string) => permissions.includes(permission),
  }
}

const READER = auth([ACCOUNTING_RIGHTS.read])

function stubFetch() {
  vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
    const url = String(input)
    asked.push(url)
    let body: unknown = {}
    if (url.includes('/fiscal-years')) {
      body = {
        years: [
          {
            id: 7,
            label: '2026',
            year: 2026,
            startDate: '2026-01-01',
            endDate: '2026-12-31',
            status: 'OPEN',
          },
        ],
      }
    } else if (url.includes('/reconciliation')) {
      body = { asOf: null, rows }
    }
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  })
}

beforeEach(() => {
  asked = []
  rows = [
    {
      systemKey: 'DEBITOR_SAMMEL',
      accountNumber: '1100',
      accountName: 'Forderungen aus L+L',
      ledgerAmount: 127400,
      subsidiaryAmount: 127400,
      difference: 0,
      balanced: true,
    },
    {
      systemKey: 'ERHALTENE_ANZAHLUNGEN',
      accountNumber: '2030',
      accountName: 'Anzahlungen von Dritten',
      ledgerAmount: 8250,
      subsidiaryAmount: 8000,
      difference: 250,
      balanced: false,
    },
    {
      systemKey: 'KREDITOR_SAMMEL',
      accountNumber: '2000',
      accountName: 'Verbindlichkeiten aus L+L',
      ledgerAmount: 41900,
      reason: 'kein Nebenbuch',
      balanced: false,
    },
  ]
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

async function render(session: AuthState = READER) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <MemoryRouter>
        <AuthContext.Provider value={session}>
          <QueryClientProvider client={client}>
            <ReconciliationPage />
          </QueryClientProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
  })
  for (let round = 0; round < 5; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

const text = () => container.textContent ?? ''

describe('ReconciliationPage', () => {
  /**
   * <b>The report the module cut is argued from.</b> Three collective accounts, each with what
   * the ledger holds and what the auxiliary book behind it holds.
   */
  it('reconciliationPageShowsTheThreeCollectiveAccountsTest', async () => {
    await render()

    for (const label of ['1100', '2030', '2000']) {
      expect(text()).toContain(label)
    }
    expect(text()).toContain('stimmt überein')
    expect(text()).toContain('Differenz')
  })

  /**
   * <b>A dash, never a zero.</b> Where no auxiliary book stands behind the account, the row
   * carries the reason instead of figures — a difference of nothing would read as «geprüft und
   * in Ordnung».
   */
  it('reconciliationPageShowsADashWhereNothingWasComparedTest', async () => {
    await render()

    expect(text()).toContain('kein Nebenbuch')
    expect(text()).toContain('—')
  })

  /**
   * The year is compulsory at the endpoint, so the screen picks one before it asks: the year
   * today falls into. A reading without it would come back as 400.
   */
  it('reconciliationPageAsksWithAFiscalYearTest', async () => {
    await render()

    expect(asked.some((url) => url.includes('/reconciliation?fiscalYearId=7'))).toBe(true)
  })

  /**
   * The expansions are loaded when they are opened and not before: a screen that asks four
   * questions for every row pays for three nobody reads.
   */
  it('reconciliationPageLoadsAnExpansionOnlyWhenOpenedTest', async () => {
    await render()

    expect(asked.some((url) => url.includes('manual-entries'))).toBe(false)
    expect(asked.some((url) => url.includes('sources-without-entry'))).toBe(false)
  })
})
