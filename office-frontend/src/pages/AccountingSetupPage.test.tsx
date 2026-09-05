// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import { ACCOUNTING_RIGHTS } from '../lib/accounting'
import type { FiscalYear, FiscalYearList, SetupState } from '../lib/types'
import { AccountingSetupPage } from './AccountingSetupPage'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1

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

/** Wide enough that today always falls into it, whenever the suite happens to run. */
const YEAR: FiscalYear = {
  id: 3,
  label: 'laufend',
  numberYear: 2026,
  startDate: '2000-01-01',
  endDate: '2099-12-31',
  status: 'OPEN',
  deletable: true,
  editable: true,
  spansAFullCalendarYear: true,
  postedEntries: 0,
}

const YEARS: FiscalYearList = {
  years: [YEAR],
  boundary: { postableFrom: null, lockedUntil: null, source: 'NONE', message: '' },
  expiry: { lastEndDate: '2099-12-31', daysLeft: 9999, warn: false },
}

function setupState(over: Partial<SetupState> = {}): SetupState {
  return {
    accountCount: 0,
    equityLayout: null,
    fiscalYear: null,
    postingStartsOn: null,
    openingEntry: null,
    openingSuggestion: [],
    nextStep: 'EQUITY_AND_CHART',
    ...over,
  }
}

/** A tenant with a chart and a year: the wizard opens at step 3. */
function atTheOpening(): SetupState {
  return setupState({
    accountCount: 132,
    equityLayout: 'JURISTIC',
    fiscalYear: YEAR,
    nextStep: 'OPENING',
    openingSuggestion: [
      { accountId: 1, accountNumber: '1000', accountName: 'Kasse', fromOpenItems: false },
      { accountId: 3, accountNumber: '1100', accountName: 'Debitoren', fromOpenItems: true },
    ],
  })
}

let container: HTMLDivElement
let root: Root
let state: SetupState

function json(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

beforeEach(() => {
  state = setupState()
  vi.stubGlobal('fetch', (url: string) => {
    if (url.includes('/accounting/setup-state')) return json(state)
    if (url.includes('/accounting/fiscal-years')) return json(YEARS)
    if (url.includes('/accounting/settings')) {
      return json({ ledgerCurrency: 'CHF', equityLayout: 'JURISTIC' })
    }
    if (url.includes('/accounting/chart-templates')) {
      return json([
        { code: 'KMU', name: 'Kontenrahmen KMU', edition: '2024', sortOrder: 1, accountCount: {} },
      ])
    }
    if (url.includes('/open-items/total')) return json({ rows: [] })
    if (url.includes('/accounting/accounts')) {
      return json({ content: [], page: 0, size: 200, totalElements: 0, totalPages: 0, sort: '' })
    }
    return json({})
  })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

async function paint(permissions: string[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <AuthContext.Provider value={auth(permissions)}>
        <QueryClientProvider client={client}>
          <MemoryRouter>
            <AccountingSetupPage />
          </MemoryRouter>
        </QueryClientProvider>
      </AuthContext.Provider>,
    )
  })
  for (let round = 0; round < 4; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
  }
}

/** One button, by the text on it. */
function buttonNamed(label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === label,
  )
  if (found === undefined) throw new Error(`Knopf «${label}» fehlt`)
  return found as HTMLButtonElement
}

describe('AccountingSetupPage', () => {
  /**
   * <b>The wizard keeps no state of its own.</b> Whoever breaks off keeps what is finished, and
   * the way back in starts at the first unfinished step — a reading of the books rather than of
   * a note about them.
   */
  it('setupResumesAtTheFirstUnfinishedStepTest', async () => {
    state = atTheOpening()

    await paint([ACCOUNTING_RIGHTS.read])

    expect(container.textContent).toContain('Schritt 3 von 3')
    expect(container.textContent).toContain('Ab wann führen Sie hier Buch?')
  })

  /** With nothing at all, the wizard opens at step 1. */
  it('setupStartsAtTheChartTest', async () => {
    await paint([ACCOUNTING_RIGHTS.read])

    expect(container.textContent).toContain('Schritt 1 von 3')
    expect(container.textContent).toContain('Wie ist Ihr Eigenkapital gegliedert?')
  })

  /**
   * <b>Step 3 checks both rights before the first of its two calls.</b> Whoever holds only
   * `ACCOUNTING_CLOSE` would otherwise fail at `PUT /settings` and be left with a step that is
   * half done — the one state the wizard promises never to leave behind.
   */
  it('setupWithoutConfigureRightTest', async () => {
    state = atTheOpening()

    await paint([ACCOUNTING_RIGHTS.read, ACCOUNTING_RIGHTS.close])

    expect(container.textContent).toContain('ACCOUNTING_CONFIGURE')
    expect(buttonNamed('Eröffnung buchen').disabled).toBe(true)
  })

  /** And the other way round: the closing right is named where it is the one missing. */
  it('setupWithoutCloseRightTest', async () => {
    state = atTheOpening()

    await paint([ACCOUNTING_RIGHTS.read, ACCOUNTING_RIGHTS.configure])

    expect(container.textContent).toContain('ACCOUNTING_CLOSE')
    expect(buttonNamed('Eröffnung buchen').disabled).toBe(true)
  })

  /** Whoever may only read still sees where the tenant stands — a 403 page would hide that. */
  it('setupWithoutAnyWriteRightShowsTheStateTest', async () => {
    state = atTheOpening()

    await paint([ACCOUNTING_RIGHTS.read])

    expect(container.textContent).toContain('Eigenkapital und Kontenplan')
    expect(container.textContent).toContain('Geschäftsjahr')
    expect(container.textContent).toContain('Eröffnung')
  })
})
