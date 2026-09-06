// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import { ACCOUNTING_RIGHTS, PRIOR_YEAR_PATH } from '../lib/accounting'
import type { FiscalYear, FiscalYearList, Statement, StatementRow } from '../lib/types'
import { IncomeStatementPage } from './IncomeStatementPage'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// jsdom has neither a print dialog nor a way to open a tab or save a file, so the three ways out
// of the head are stood in for. What is watched here is the address «Drucken» asks for.
const printFile = vi.hoisted(() =>
  vi.fn<(file: { fileName: string; blob: Blob }) => Promise<void>>(),
)
vi.mock('../lib/print', () => ({
  printFile,
  PrintNotPossibleError: class PrintNotPossibleError extends Error {},
}))

const showFile = vi.hoisted(() => vi.fn<(file: { fileName: string; blob: Blob }) => void>())
const downloadFile = vi.hoisted(() => vi.fn<(file: { fileName: string; blob: Blob }) => void>())
vi.mock('../lib/files', () => ({ showFile, downloadFile }))

const TENANT = 1

function session(permissions: string[]): AuthState {
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

const READER = session([ACCOUNTING_RIGHTS.read])
/** Holds the closing right on top: the one that may capture the prior year. */
const CLOSER = session([ACCOUNTING_RIGHTS.read, ACCOUNTING_RIGHTS.close])

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
  postedEntriesBesidesOpening: 11,
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

/** The answer of a first fiscal year: no year before it, and the note that says so. */
const FIRST_YEAR: Statement = {
  ...STATEMENT,
  priorFiscalYearId: null,
  priorFiscalYearLabel: null,
  notes: [
    {
      kind: 'PRIOR_YEAR_MISSING',
      text: 'Vorjahreszahlen liegen nicht vor — erstes Geschäftsjahr in dieser Buchhaltung'
        + ' (OR Art. 958d Abs. 2).',
    },
  ],
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

async function paint(auth: AuthState = READER) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <AuthContext.Provider value={auth}>
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

  /**
   * <b>The toolbar stands in the head of this statement as well</b>, and «Drucken» asks for the
   * PDF of the income statement with the two switches as they stand.
   */
  it('incomeStatementPrintsThePdfWithTheSwitchesTest', async () => {
    const asked: string[] = []
    vi.stubGlobal('fetch', (url: string) => {
      asked.push(url)
      if (url.includes('/accounting/fiscal-years')) return json(YEARS)
      return json(STATEMENT)
    })
    printFile.mockResolvedValue(undefined)
    await paint()

    const print = [...container.querySelectorAll('button')].find(
      (candidate) => candidate.textContent?.trim() === 'Drucken',
    )
    await act(async () => {
      print?.click()
    })
    for (let round = 0; round < 4; round += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20))
      })
    }

    expect(asked).toContain(
      '/api/tenants/1/accounting/pdf/income-statement?fiscalYearId=3&hideEmpty=true'
        + '&withAccounts=false',
    )
    expect(printFile).toHaveBeenCalledTimes(1)
    expect(showFile).not.toHaveBeenCalled()
  })

  // --- der zweite Weg zur Vorjahresmaske, auch hier -----------------------------

  /**
   * <b>The income statement carries the way to the prior year as well</b> — it is the same
   * screen as the balance sheet, and the note stands under both. Beside it: «Vorjahr erfassen»,
   * for whoever holds the closing right.
   */
  it('incomeStatementOffersThePriorYearCaptureTest', async () => {
    vi.stubGlobal('fetch', (url: string) => {
      if (url.includes('/accounting/fiscal-years')) return json(YEARS)
      return json(FIRST_YEAR)
    })
    await paint(CLOSER)

    const way = linkNamed('Vorjahr erfassen')
    expect(way?.getAttribute('href')).toBe(PRIOR_YEAR_PATH)
    expect(way?.closest('p')?.textContent).toContain('Vorjahreszahlen liegen nicht vor')
  })

  /** The note stands for every reader; the link stands for the right that can capture. */
  it('incomeStatementHidesThePriorYearCaptureWithoutCloseTest', async () => {
    vi.stubGlobal('fetch', (url: string) => {
      if (url.includes('/accounting/fiscal-years')) return json(YEARS)
      return json(FIRST_YEAR)
    })
    await paint(READER)

    expect(container.textContent).toContain('Vorjahreszahlen liegen nicht vor')
    expect(linkNamed('Vorjahr erfassen')).toBeUndefined()
  })
})

/** One link, by the text on it, or nothing where it does not stand. */
function linkNamed(label: string): HTMLAnchorElement | undefined {
  return [...container.querySelectorAll('a')].find(
    (candidate) => candidate.textContent?.trim() === label,
  )
}
