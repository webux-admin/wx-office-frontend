// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../../auth/authContext'
import { ACCOUNTING_RIGHTS } from '../../lib/accounting'
import type {
  FiscalYear,
  FiscalYearList,
  TrialBalance,
  TrialBalanceRow,
} from '../../lib/types'
import { AccountBalanceListPage } from './AccountBalanceListPage'

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

function row(over: Partial<TrialBalanceRow> = {}): TrialBalanceRow {
  return {
    accountId: 4,
    accountNumber: '6000',
    accountName: 'Raumaufwand',
    accountType: 'EXPENSE',
    orPosition: 'ER_UEBRIGER_BETRIEBSAUFWAND',
    debitTotal: 3200,
    creditTotal: 0,
    balance: 3200,
    ...over,
  }
}

function balanceOf(rows: TrialBalanceRow[], over: Partial<TrialBalance> = {}): TrialBalance {
  return {
    accounts: {
      content: rows,
      page: 0,
      size: 50,
      totalElements: rows.length,
      totalPages: 1,
      sort: 'accountNumber,asc',
    },
    control: {
      debitTotal: 3200,
      creditTotal: 3200,
      difference: 0,
      accountCount: 132,
    },
    notices: { drafts: 0, draftTotal: null, currencyCode: 'CHF', moduleGaps: [] },
    ...over,
  }
}

let container: HTMLDivElement
let root: Root
let asked: string[]
let answer: TrialBalance

function json(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

beforeEach(() => {
  asked = []
  answer = balanceOf([row(), row({ accountId: 1, accountNumber: '1020',
    accountName: 'Bankguthaben', debitTotal: 0, creditTotal: 3200, balance: -3200 })])
  vi.stubGlobal('fetch', (url: string) => {
    asked.push(url)
    if (url.includes('/accounting/fiscal-years')) return json(YEARS)
    return json(answer)
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
            <AccountBalanceListPage />
          </MemoryRouter>
        </QueryClientProvider>
      </AuthContext.Provider>,
    )
  })
  await settle()
}

/** The input behind one label. */
function fieldNamed(label: string): HTMLInputElement {
  const found = [...container.querySelectorAll('label')].find(
    (candidate) => candidate.textContent === label,
  )
  const input = found === undefined ? null : document.getElementById(found.htmlFor)
  if (input === null) throw new Error(`Feld  fehlt`)
  return input as HTMLInputElement
}

/** One keystroke, the way React notices one. */
function type(element: HTMLInputElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )?.set
    setter?.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function settle() {
  for (let round = 0; round < 4; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
  }
}

describe('AccountBalanceListPage', () => {
  /**
   * <b>The proof under the list, and the number it counts.</b> «Total über 132 Konten» names the
   * accounts of the chart, not the rows on the page — otherwise somebody reads it as the count of
   * what is in front of them.
   */
  it('controlRowShowsTheDifferenceTest', async () => {
    await paint()

    expect(container.textContent).toContain('Total über 132 Konten')
    expect(container.textContent).toContain('3’200.00')
    // A liability or revenue account stands negative: the balance is debit minus credit and is
    // never turned round by account type.
    expect(container.textContent).toContain('-3’200.00')
    expect(container.textContent).not.toContain('stimmen nicht überein')
  })

  /**
   * <b>The proof goes past the search.</b> One worked out over the shown subset would claim a
   * balance that subset does not have — the exact opposite of what it is for.
   */
  it('controlRowIgnoresTheSearchTest', async () => {
    await paint()
    answer = balanceOf([row()])

    type(fieldNamed('Suchen'), '6000')
    // Past the debounce of `useQuickSearch`: until it lets the term through, no request goes out.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 260))
    })
    await settle()

    // One row left, and the same proof under it.
    expect(container.textContent).toContain('Total über 132 Konten')
    expect(asked.some((url) => url.includes('q=6000'))).toBe(true)
  })

  /**
   * <b>A difference that cannot come from a posting of this application.</b> The balance is a
   * deferred constraint trigger in the database, so anything but zero means somebody wrote past
   * it — and the sentence says what to do about it rather than naming a column.
   */
  it('controlRowNamesAnImbalanceTest', async () => {
    answer = balanceOf([row()], {
      control: { debitTotal: 3200, creditTotal: 3000, difference: 200, accountCount: 132 },
    })

    await paint()

    expect(container.textContent).toContain('Soll und Haben stimmen nicht überein')
    expect(container.textContent).toContain('Systembetreuung')
    expect(container.textContent).toContain('Integrität')
  })

  /** Every row leads into its account sheet — that is what the account id on the row is for. */
  it('rowLinksToTheAccountSheetTest', async () => {
    await paint()

    const rows = [...container.querySelectorAll('tbody tr')]
    expect(rows.length).toBeGreaterThan(0)
    // The table makes a row clickable; the address is built out of the account id.
    expect(container.innerHTML).toContain('Raumaufwand')
    expect(asked.some((url) => url.includes('/accounting/trial-balance'))).toBe(true)
  })

  /** The drafts left out of the figures are named above them, with the way to look at them. */
  it('draftNoticeLinksToTheDraftsTest', async () => {
    answer = balanceOf([row()], {
      notices: { drafts: 3, draftTotal: 12480.55, currencyCode: 'CHF', moduleGaps: [] },
    })

    await paint()

    expect(container.textContent).toContain('3 Buchungen sind noch nicht verbucht')
    const link = [...container.querySelectorAll('a')].find(
      (entry) => entry.getAttribute('href') === '/buchhaltung/entwuerfe',
    )
    expect(link).toBeDefined()
  })

  /** Without a fiscal year there is nothing to evaluate, and the screen says where to make one. */
  it('emptyStateNamesTheMissingFiscalYearTest', async () => {
    vi.stubGlobal('fetch', (url: string) => {
      asked.push(url)
      if (url.includes('/accounting/fiscal-years')) {
        return json({ ...YEARS, years: [] })
      }
      return json(answer)
    })

    await paint()

    expect(container.textContent).toContain('Noch kein Geschäftsjahr')
    expect(container.textContent).toContain('Geschäftsjahre')
    // And nothing was asked for: without a year the endpoint would answer 400 anyway.
    expect(asked.some((url) => url.includes('/accounting/trial-balance'))).toBe(false)
  })
})
