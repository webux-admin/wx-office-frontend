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
let orphans: unknown[] = []

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
    } else if (url.includes('entries-without-source')) {
      body = orphans
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
  orphans = [
    {
      id: 4711,
      entryNumber: '2026-000901',
      bookingDate: '2026-03-04',
      description: 'Rechnung',
      sourceKind: 'DOCUMENT',
      sourceId: 999999,
      lines: [],
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
  await settle()
}

/** Lets the queries resolve: five turns of the loop, which is more than the page ever needs. */
async function settle() {
  for (let round = 0; round < 5; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

/**
 * Opens the first expansion with that summary. jsdom does not toggle a `details` on a click,
 * so the flag is set and the event the screen listens for is raised by hand.
 */
async function open(summary: string) {
  const expansion = Array.from(container.querySelectorAll('details')).find(
    (node) => node.querySelector('summary')?.textContent === summary,
  )
  if (expansion === undefined) {
    throw new Error(`keine Aufklappung «${summary}»`)
  }
  await act(async () => {
    expansion.open = true
    expansion.dispatchEvent(new Event('toggle'))
  })
  await settle()
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
    expect(asked.some((url) => url.includes('entries-without-source'))).toBe(false)
  })

  /**
   * <b>The third expansion.</b> An entry whose record the subsidiary ledger no longer holds —
   * the right way round, because an entry is kept for ten years and the record it came from
   * need not be. Opened, it names the entry so nobody hunts for a document that is not there.
   */
  it('reconciliationPageShowsAnEntryWithoutItsSourceTest', async () => {
    await render()

    await open('Buchungen ohne Beleg')

    expect(asked.some((url) => url.includes('entries-without-source'))).toBe(true)
    expect(text()).toContain('2026-000901')
  })

  /** Opened with nothing behind it, the expansion says so rather than staying blank. */
  it('reconciliationPageShowsNoEntryWithoutItsSourceTest', async () => {
    orphans = []
    await render()

    await open('Buchungen ohne Beleg')

    expect(text()).toContain('Zu jeder Buchung auf diesem Konto steht ihr Beleg.')
  })
})
