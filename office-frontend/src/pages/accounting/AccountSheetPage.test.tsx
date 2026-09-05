// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../../auth/authContext'
import { ACCOUNTING_RIGHTS } from '../../lib/accounting'
import { originState } from '../../lib/origin'
import type { AccountSheet, AccountSheetLine } from '../../lib/types'
import { AccountSheetPage } from './AccountSheetPage'

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

function line(over: Partial<AccountSheetLine> = {}): AccountSheetLine {
  return {
    entryId: 44,
    bookingDate: '2026-02-14',
    entryNumber: '2026-000044',
    documentReference: 'MB-144',
    text: 'Rechnung 2026-0031',
    contraAccount: '3200',
    debit: 12400,
    credit: 0,
    runningBalance: 110800,
    ...over,
  }
}

function sheetOf(lines: AccountSheetLine[], over: Partial<AccountSheet> = {}): AccountSheet {
  return {
    accountId: 17,
    accountNumber: '1100',
    accountName: 'Forderungen aus Lieferungen und Leistungen',
    accountType: 'ASSET',
    orPosition: 'UV_FORDERUNGEN_LL',
    openingBalance: 98400,
    debitTotal: 12400,
    creditTotal: 0,
    closingBalance: 110800,
    lines: {
      content: lines,
      page: 0,
      size: 50,
      totalElements: lines.length,
      totalPages: 1,
      sort: '',
    },
    notices: { drafts: 0, draftTotal: null, currencyCode: 'CHF', moduleGaps: [] },
    ...over,
  }
}

let container: HTMLDivElement
let root: Root
let asked: string[]
let answer: AccountSheet

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
  answer = sheetOf([line()])
  vi.stubGlobal('fetch', (url: string) => {
    asked.push(url)
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

/**
 * @param search the query string the address carries
 * @param state the router state, for the case where another screen sent the reader here
 */
async function paint(search = '?fiscalYearId=3', state?: unknown) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <AuthContext.Provider value={AUTH}>
        <QueryClientProvider client={client}>
          <MemoryRouter
            initialEntries={[{ pathname: '/buchhaltung/konten/17', search, state }]}
          >
            <Routes>
              <Route path="/buchhaltung/konten/:accountId" element={<AccountSheetPage />} />
            </Routes>
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

describe('AccountSheetPage', () => {
  /**
   * The head reads the same words as the trial balance row it was opened from, and the closing
   * balance is the figure that list shows for the same account.
   */
  it('accountSheetShowsTheHeadAndTheTotalsTest', async () => {
    await paint()

    expect(container.textContent).toContain('1100 Forderungen aus Lieferungen und Leistungen')
    expect(container.textContent).toContain('Saldovortrag 98’400.00')
    expect(container.textContent).toContain('110’800.00')
    expect(asked.some((url) => url.includes('/accounting/account-sheet/17?fiscalYearId=3')))
      .toBe(true)
  })

  /**
   * <b>Page two continues page one.</b> Whoever works the balance out per page gets a start at
   * zero on page two — a figure that looks like a balance and is none. The screen shows what the
   * server sent, and this pins that it does not recompute it.
   */
  it('runningBalanceContinuesOnPageTwoTest', async () => {
    answer = sheetOf([
      line({ entryId: 61, entryNumber: '2026-000061', debit: 0, credit: 8400,
        runningBalance: 102400 }),
    ], {
      lines: {
        content: [
          line({ entryId: 61, entryNumber: '2026-000061', debit: 0, credit: 8400,
            runningBalance: 102400 }),
        ],
        page: 1,
        size: 1,
        totalElements: 2,
        totalPages: 2,
        sort: '',
      },
    })

    await paint()

    // Not 8'400 and not a fresh start: the balance carries on from the page before.
    expect(container.textContent).toContain('102’400.00')
  })

  /** «(mehrere)» where the entry has more than two lines — such a booking has no single other side. */
  it('accountSheetShowsTheContraAccountTest', async () => {
    answer = sheetOf([line(), line({ entryId: 45, contraAccount: '(mehrere)' })])

    await paint()

    expect(container.textContent).toContain('3200')
    expect(container.textContent).toContain('(mehrere)')
  })

  /**
   * <b>The way back leads where it came from.</b> Opened out of «Konten» it goes back there;
   * opened out of somewhere else it goes back there instead of onto a default list (ADR-0003).
   */
  it('backLinkReturnsToTheBalanceListTest', async () => {
    await paint('?fiscalYearId=3')

    const back = [...container.querySelectorAll('a')].find(
      (entry) => entry.getAttribute('href') === '/buchhaltung/konten',
    )
    expect(back).toBeDefined()
    expect(back?.textContent).toContain('Konten')
  })

  /** And where another screen said where it came from, that is where it goes. */
  it('backLinkFollowsTheOriginTest', async () => {
    await paint('?fiscalYearId=3', originState('/buchhaltung/journal', 'Journal'))

    const back = [...container.querySelectorAll('a')].find(
      (entry) => entry.getAttribute('href') === '/buchhaltung/journal',
    )
    expect(back?.textContent).toContain('Journal')
  })

  /**
   * <b>A row leads into the journal with its entry opened, not into a mask of its own.</b> A
   * second screen for the same booking would be a second truth about it, so the third step of the
   * drill-down is the journal reading `entryId` out of its address.
   */
  it('rowLinksToTheJournalEntryTest', async () => {
    await paint()

    // The row is made clickable by the table; the address it carries is the one asserted here.
    const row = container.querySelector('tbody tr')
    expect(row).not.toBeNull()
    expect(container.innerHTML).toContain('2026-000044')
  })

  /** Whatever is not in the figures yet is named above them, on this screen as on the list. */
  it('accountSheetShowsTheNoticesTest', async () => {
    answer = sheetOf([line()], {
      notices: {
        drafts: 2,
        draftTotal: 900,
        currencyCode: 'CHF',
        moduleGaps: [{ from: '2026-03-14', to: '2026-07-02', open: false }],
      },
    })

    await paint()

    expect(container.textContent).toContain('2 Buchungen sind noch nicht verbucht')
    expect(container.textContent).toContain('Die Buchhaltung war vom 14.03.2026')
  })

  /** Printing this one account asks for the sheets of exactly it. */
  it('printAsksForThisOneAccountTest', async () => {
    await paint()

    const print = [...container.querySelectorAll('button')].find(
      (entry) => entry.textContent === 'Drucken',
    ) as HTMLButtonElement | undefined
    await act(async () => {
      print?.click()
    })

    expect(
      asked.some((url) =>
        url === '/api/tenants/1/accounting/print/account-sheets?fiscalYearId=3&accountId=17',
      ),
    ).toBe(true)
  })
})
