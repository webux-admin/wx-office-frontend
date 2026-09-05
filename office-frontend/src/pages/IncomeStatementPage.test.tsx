// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import { ACCOUNTING_RIGHTS } from '../lib/accounting'
import type { FiscalYear, FiscalYearList, Statement, StatementRow } from '../lib/types'
import { IncomeStatementPage } from './IncomeStatementPage'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1

const AUTH: AuthState = {
  user: {
    userId: 1,
    username: 'muster',
    activeTenantId: TENANT,
    superuser: false,
    tenants: [
      { id: TENANT, code: 'WX', name: 'Webux', isDefault: true, modules: ['ACCOUNTING'] },
    ],
    permissions: [ACCOUNTING_RIGHTS.read],
  },
  loading: false,
  signIn: () => Promise.reject(new Error('nicht gebraucht')),
  completeSecondFactor: () => Promise.reject(new Error('nicht gebraucht')),
  sendSecondFactorCode: () => Promise.resolve(),
  adoptSession: () => {},
  signOut: () => Promise.resolve(),
  switchTenant: () => Promise.resolve(),
  refresh: () => Promise.resolve(),
  can: (permission: string) => permission === ACCOUNTING_RIGHTS.read,
}

/** Wide enough that today always falls into it, whenever the suite happens to run. */
const YEAR: FiscalYear = {
  id: 3,
  label: 'laufend',
  numberYear: 2026,
  startDate: '2000-01-01',
  endDate: '2099-12-31',
  status: 'OPEN',
  deletable: false,
  editable: false,
  spansAFullCalendarYear: true,
  postedEntries: 12,
}

const YEARS: FiscalYearList = {
  years: [YEAR],
  boundary: { postableFrom: null, lockedUntil: null, source: 'NONE', message: '' },
  expiry: { lastEndDate: '2099-12-31', daysLeft: 9999, warn: false },
}

/**
 * A gross position in its three rows: expense, income, and the balance under them. OR Art. 958c
 * Abs. 1 Ziff. 7 knows no exception from the ban on offsetting.
 */
const ROWS: StatementRow[] = [
  {
    kind: 'POSITION',
    level: 0,
    position: 'ER_FINANZERFOLG',
    label: 'Finanzaufwand und Finanzertrag',
    amount: -944.55,
    priorAmount: -1100,
    negativeItem: false,
    synthetic: false,
  },
  {
    kind: 'GROSS',
    level: 1,
    position: 'ER_FINANZERFOLG',
    label: 'davon Aufwand',
    amount: -1284.55,
    priorAmount: -1420,
    negativeItem: false,
    synthetic: false,
  },
  {
    kind: 'GROSS',
    level: 1,
    position: 'ER_FINANZERFOLG',
    label: 'davon Ertrag',
    amount: 340,
    priorAmount: 320,
    negativeItem: false,
    synthetic: false,
  },
  {
    kind: 'POSITION',
    level: 0,
    position: 'ER_JAHRESERGEBNIS',
    label: 'Jahresgewinn oder Jahresverlust',
    amount: 24200,
    priorAmount: 40000,
    negativeItem: false,
    synthetic: true,
  },
]

const STATEMENT: Statement = {
  report: 'INCOME_STATEMENT',
  fiscalYearId: 3,
  fiscalYearLabel: 'laufend',
  startDate: '2000-01-01',
  endDate: '2099-12-31',
  asOf: null,
  currency: 'CHF',
  priorFiscalYearId: 2,
  priorFiscalYearLabel: '2025',
  drafts: { count: 0, amount: 0 },
  control: null,
  notes: [],
  rows: ROWS,
}

let container: HTMLDivElement
let root: Root

function json(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

beforeEach(() => {
  vi.stubGlobal('fetch', (url: string) => {
    if (url.includes('/accounting/fiscal-years')) return json(YEARS)
    return json(STATEMENT)
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

async function paint() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <AuthContext.Provider value={AUTH}>
        <QueryClientProvider client={client}>
          <MemoryRouter>
            <IncomeStatementPage />
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

describe('IncomeStatementPage', () => {
  /**
   * <b>The four double positions stand gross.</b> Both halves are shown whatever «Konten zeigen»
   * says — they are not accounts, and the ban on offsetting knows no exception.
   */
  it('incomeStatementShowsGrossPositionsTest', async () => {
    await paint()

    expect(container.textContent).toContain('Finanzaufwand und Finanzertrag')
    expect(container.textContent).toContain('davon Aufwand')
    expect(container.textContent).toContain('davon Ertrag')
  })

  /** The result line is the proof here, so there is no control line under the table. */
  it('incomeStatementHasNoControlLineTest', async () => {
    await paint()

    expect(container.textContent).toContain('Jahresgewinn oder Jahresverlust')
    expect(container.textContent).not.toContain('Aktiven minus Passiven')
  })
})
