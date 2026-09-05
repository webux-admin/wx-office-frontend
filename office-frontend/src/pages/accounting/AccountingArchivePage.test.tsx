// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../../auth/authContext'
import { ACCOUNTING_RIGHTS } from '../../lib/accounting'
import type { FiscalYear, FiscalYearList } from '../../lib/types'
import { AccountingArchivePage } from './AccountingArchivePage'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1

/**
 * @param modules what the tenant runs. The empty list is the case this screen exists for.
 */
function session(modules: string[]): AuthState {
  const permissions: string[] = [ACCOUNTING_RIGHTS.read]
  return {
    user: {
      userId: 1,
      username: 'muster',
      activeTenantId: TENANT,
      superuser: false,
      tenants: [{ id: TENANT, code: 'WX', name: 'Webux', isDefault: true, modules }],
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

function year(over: Partial<FiscalYear> = {}): FiscalYear {
  return {
    id: 3,
    label: '2026',
    numberYear: 2026,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    status: 'OPEN',
    deletable: false,
    editable: false,
    spansAFullCalendarYear: true,
    postedEntries: 1204,
    ...over,
  }
}

function listOf(years: FiscalYear[]): FiscalYearList {
  return {
    years,
    boundary: { postableFrom: null, lockedUntil: null, source: 'NONE', message: '' },
    expiry: { lastEndDate: '2026-12-31', daysLeft: 100, warn: false },
  }
}

let container: HTMLDivElement
let root: Root
let asked: string[]

function json(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

function stubFetch(years: FiscalYear[]) {
  vi.stubGlobal('fetch', (url: string) => {
    asked.push(url)
    if (url.includes('/accounting/fiscal-years')) return json(listOf(years))
    // The two ways out answer bytes, not JSON. A string body rather than a Blob: jsdom's Blob
    // has no stream(), and the API client reads the body as one.
    return Promise.resolve(
      new Response('PK', {
        status: 200,
        headers: { 'Content-Type': 'application/zip' },
      }),
    )
  })
}

beforeEach(() => {
  asked = []
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  // jsdom knows no object URLs. Defined on the real URL rather than replacing it: a stand-in
  // object loses the constructor, and fetch needs that.
  Object.assign(URL, { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} })
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(URL, 'createObjectURL')
  Reflect.deleteProperty(URL, 'revokeObjectURL')
})

async function paint(years: FiscalYear[], modules: string[] = ['ACCOUNTING']) {
  stubFetch(years)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <AuthContext.Provider value={session(modules)}>
        <QueryClientProvider client={client}>
          <MemoryRouter>
            <AccountingArchivePage />
          </MemoryRouter>
        </QueryClientProvider>
      </AuthContext.Provider>,
    )
  })
  for (let round = 0; round < 3; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
  }
}

function button(text: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find(
    (entry) => entry.textContent === text,
  ) as HTMLButtonElement | undefined
}

describe('AccountingArchivePage', () => {
  /** Every year with its period, its state and how much is posted in it. */
  it('archiveNamesEveryFiscalYearTest', async () => {
    await paint([year(), year({ id: 2, label: '2025', postedEntries: 638 })])

    expect(container.textContent).toContain('Geschäftsjahr 2026')
    expect(container.textContent).toContain('01.01.2026 – 31.12.2026')
    expect(container.textContent).toContain('1204 Buchungen')
    expect(container.textContent).toContain('Geschäftsjahr 2025')
    // The headline adds them up in the browser: a second endpoint for two numbers would be a
    // second cache going stale in one of the two.
    expect(container.textContent).toContain('1842 verbuchte Buchungen in 2 Geschäftsjahren')
  })

  /** One year per call — ten years in one request is the difference between a file and a wait. */
  it('downloadAsksForOneFiscalYearTest', async () => {
    await paint([year()])

    await act(async () => {
      button('Alles herunterladen (ZIP)')?.click()
    })

    expect(asked.some((url) => url === '/api/tenants/1/accounting/export?fiscalYearId=3')).toBe(
      true,
    )
  })

  /** Three reports, three buttons, each asking for its own. */
  it('printOpensTheDialogTest', async () => {
    await paint([year()])

    await act(async () => {
      button('Journal')?.click()
    })
    await act(async () => {
      button('Saldenliste')?.click()
    })

    expect(asked).toContain('/api/tenants/1/accounting/print/journal?fiscalYearId=3')
    expect(asked).toContain('/api/tenants/1/accounting/print/trial-balance?fiscalYearId=3')
  })

  /**
   * A year with nothing posted is listed and its buttons are off: the backend refuses an empty
   * archive rather than delivering one, so offering the button would be offering a refusal.
   */
  it('yearWithoutEntriesHasDisabledButtonsTest', async () => {
    await paint([year(), year({ id: 2, label: '2025', postedEntries: 0 })])

    const buttons = [...container.querySelectorAll('button')].filter(
      (entry) => entry.textContent === 'Alles herunterladen (ZIP)',
    ) as HTMLButtonElement[]
    expect(buttons).toHaveLength(2)
    expect(buttons[0].disabled).toBe(false)
    expect(buttons[1].disabled).toBe(true)
  })

  /** Nothing posted anywhere: an empty state that says what has to happen first. */
  it('emptyStateWhenNothingIsPostedTest', async () => {
    await paint([year({ postedEntries: 0 })])

    expect(container.textContent).toContain('Noch nichts verbucht')
    expect(container.textContent).toContain('Sobald die erste Buchung im Journal steht')
    expect(button('Alles herunterladen (ZIP)')).toBeUndefined()
  })

  /**
   * <b>The case this screen exists for.</b> The tenant runs no accounting module at all, and the
   * page still opens with its years and its buttons — no `ModuleOffNotice`. What is kept for ten
   * years has to be reachable for ten years (OR Art. 958f), and GeBüV Art. 6 Abs. 1 wants a
   * person holding the read right to be able to look within a reasonable time.
   */
  it('pageStaysReachableWhileTheModuleIsOffTest', async () => {
    await paint([year()], [])

    expect(container.textContent).toContain('Geschäftsjahr 2026')
    expect(button('Alles herunterladen (ZIP)')?.disabled).toBe(false)
    expect(container.textContent).not.toContain('nicht eingeschaltet')
    expect(container.textContent).toContain(
      'Diese Seite bleibt erreichbar, auch wenn die Buchhaltung abgeschaltet ist.',
    )
  })

  /** The two ways out satisfy two different rules, and the page says which is which. */
  it('archiveNamesTheTwoRulesTest', async () => {
    await paint([year()])

    expect(container.textContent).toContain('OR Art. 958f Abs. 3')
    expect(container.textContent).toContain('GeBüV Art. 6 Abs. 3')
    expect(container.textContent).toContain('auch ohne Hilfsmittel lesbar')
  })
})
