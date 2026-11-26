// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import type {
  TimeBillingRunPreviewLine,
  TimeBillingRunResult,
  TimeWorklistLine,
} from '../lib/types'
import { TimeBillingWorklistPage } from './TimeBillingWorklistPage'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const WORKLIST_URL = '/api/tenants/1/time-tracking/billing/worklist'

function line(overrides: Partial<TimeWorklistLine>): TimeWorklistLine {
  return {
    partnerId: 11,
    customerName: 'Muster AG',
    projectId: 51,
    projectNumber: 'P-00012',
    projectName: 'Website',
    openEntries: 3,
    openMinutes: 580,
    billedMinutes: 585,
    estimatedAmount: 1560,
    currency: 'CHF',
    oldestWorkDate: '2026-11-03',
    ...overrides,
  }
}

const WEBSITE = line({})
const MUSTER_ALONE = line({
  projectId: null,
  projectNumber: null,
  projectName: null,
  openEntries: 1,
  openMinutes: 30,
  billedMinutes: 30,
  estimatedAmount: 80,
  oldestWorkDate: '2026-11-28',
})

/** The preview of a run over both rows: the project billable, the customer alone not. */
const RUN_PREVIEW: TimeBillingRunPreviewLine[] = [
  {
    partnerId: 11,
    projectId: 51,
    customerName: 'Muster AG',
    projectNumber: 'P-00012',
    projectName: 'Website',
    entries: 3,
    totalNet: 1560,
    currency: 'CHF',
    skipped: [],
    refusal: null,
  },
  {
    partnerId: 11,
    projectId: null,
    entries: 0,
    totalNet: 0,
    skipped: [],
    refusal: 'Keiner der gewählten Einträge lässt sich abrechnen.',
  },
]

const RUN_RESULT: TimeBillingRunResult = {
  created: [
    { partnerId: 11, projectId: 51, documentId: 501, lines: 2, entries: 3, skipped: 0, totalNet: 1560, currency: 'CHF' },
  ],
  skipped: [{ partnerId: 11, projectId: null, message: 'Keiner der gewählten Einträge lässt sich abrechnen.' }],
  failed: [],
}

function session(permissions: string[], modules = ['TIMETRACKING', 'PROJECT']): AuthState {
  return {
    user: {
      userId: 1,
      username: 'anna',
      activeTenantId: 1,
      superuser: false,
      tenants: [{ id: 1, code: 'WX', name: 'Webux', isDefault: true, modules }],
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

let container: HTMLDivElement
let root: Root
let requested: string[]
let lines: TimeWorklistLine[]
let fails: boolean
/** Every write, with its address and body. */
let writes: { url: string; body: unknown }[]

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  )
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 30, 10, 0))
  requested = []
  lines = [WEBSITE, MUSTER_ALONE]
  fails = false
  writes = []
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    requested.push(url)
    if (init?.method === 'POST') {
      const body: unknown = typeof init.body === 'string' ? JSON.parse(init.body) : null
      writes.push({ url, body })
      if (url.endsWith('/billing/batch/preview')) return json(RUN_PREVIEW)
      if (url.endsWith('/billing/batch')) return json(RUN_RESULT)
    }
    if (url.startsWith(WORKLIST_URL)) {
      return fails ? json({ detail: 'Das Backend meldet einen Fehler.' }, 500) : json(lines)
    }
    return json({ detail: 'unbekannt' }, 404)
  })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

/** Where «Abrechnen» led, and what it handed over. */
function Landed() {
  const location = useLocation()
  return (
    <p data-testid="landed">
      {location.pathname} {JSON.stringify(location.state)}
    </p>
  )
}

async function settle() {
  for (let round = 0; round < 4; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

async function render(permissions = ['TIME_BILL', 'PROJECT_READ'], modules?: string[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/zeiten-abrechnen']}>
        <AuthContext.Provider value={session(permissions, modules)}>
          <QueryClientProvider client={client}>
            <Routes>
              <Route path="/zeiten-abrechnen" element={<TimeBillingWorklistPage />} />
              <Route path="/zeiten-abrechnen/*" element={<Landed />} />
            </Routes>
          </QueryClientProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
  })
  await settle()
}

const text = () => container.textContent ?? ''
const rows = () => [...container.querySelectorAll('tbody tr')] as HTMLElement[]

function billLink(row: HTMLElement): HTMLAnchorElement {
  const found = [...row.querySelectorAll('a')].find((link) => link.textContent?.startsWith('Abrechnen'))
  if (found === undefined) throw new Error('no link Abrechnen')
  return found
}

describe('TimeBillingWorklistPage', () => {
  /** One row per project and one per customer without project, up to today. */
  it('timeBillingWorklistPageListsWhatIsOpenTest', async () => {
    await render()

    expect(requested).toEqual([`${WORKLIST_URL}?until=2026-11-30`])
    expect(container.querySelector('h1')?.textContent).toBe('Zeiten abrechnen')
    expect(rows()).toHaveLength(2)
    expect(rows()[0].textContent).toContain('Muster AG')
    expect(rows()[0].textContent).toContain('P-00012 Website')
    expect(rows()[0].textContent).toContain('9:40')
    expect(rows()[0].textContent).toContain('→ 9:45')
    expect(rows()[0].textContent).toContain('1’560.00 CHF')
    expect(rows()[0].textContent).toContain('03.11.2026')
    expect(rows()[1].textContent).toContain('ohne Projekt')
    expect(rows()[1].textContent).not.toContain('→')
  })

  /** Another day asks anew. */
  it('timeBillingWorklistPageAsksForAnotherDayTest', async () => {
    await render()

    await act(async () => {
      const caption = [...container.querySelectorAll('label')].find((entry) => entry.textContent?.trim() === 'Stichtag')
      const field = document.getElementById(caption?.htmlFor ?? '') as HTMLInputElement
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(field, '2026-10-31')
      field.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await settle()

    expect(requested.at(-1)).toBe(`${WORKLIST_URL}?until=2026-10-31`)
  })

  /** «Abrechnen» of a project opens its mask with the day and the way back. */
  it('timeBillingWorklistPageOpensAProjectTest', async () => {
    await render()

    await act(async () => {
      billLink(rows()[0]).click()
    })

    expect(container.querySelector('[data-testid="landed"]')?.textContent).toBe(
      '/zeiten-abrechnen/projekt/51 {"origin":{"from":"/zeiten-abrechnen","label":"Zeiten abrechnen"},"billing":{"until":"2026-11-30","withoutProject":false}}',
    )
  })

  /** The row «ohne Projekt» opens the customer, ticking only its time without a project. */
  it('timeBillingWorklistPageOpensTheCustomerAloneTest', async () => {
    await render()

    await act(async () => {
      billLink(rows()[1]).click()
    })

    expect(container.querySelector('[data-testid="landed"]')?.textContent).toContain(
      '/zeiten-abrechnen/kunde/11 ',
    )
    expect(container.querySelector('[data-testid="landed"]')?.textContent).toContain(
      '"withoutProject":true',
    )
  })

  /** The project links to its mask with PROJECT_READ; without it, it is only a name. */
  it('timeBillingWorklistPageLinksTheProjectTest', async () => {
    await render()
    expect([...rows()[0].querySelectorAll('a')].map((link) => link.getAttribute('href'))).toContain(
      '/projekte/51',
    )

    act(() => root.unmount())
    root = createRoot(container)
    await render(['TIME_BILL'])
    expect([...rows()[0].querySelectorAll('a')].map((link) => link.getAttribute('href'))).not.toContain(
      '/projekte/51',
    )
  })

  /** Without projects there is no column for them. */
  it('timeBillingWorklistPageWithoutProjectsTest', async () => {
    lines = [MUSTER_ALONE]

    await render(['TIME_BILL'], ['TIMETRACKING'])

    expect(container.querySelector('thead')?.textContent).not.toContain('Projekt')
  })

  it('timeBillingWorklistPageWithNothingOpenTest', async () => {
    lines = []

    await render()

    expect(text()).toContain('Nichts abzurechnen')
    expect(text()).toContain('Bis 30.11.2026 liegt keine offene verrechenbare Zeit.')
  })

  it('timeBillingWorklistPageWhenItCannotBeReadTest', async () => {
    fails = true

    await render()

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Das Backend meldet einen Fehler.',
    )
  })

  it('timeBillingWorklistPageWithoutTheBillRightTest', async () => {
    await render(['TIME_READ'])

    expect(text()).toContain('Keine Berechtigung')
    expect(requested).toEqual([])
  })

  it('timeBillingWorklistPageWithTheModuleOffTest', async () => {
    await render(['TIME_BILL'], ['PROJECT'])

    expect(text()).toContain('Modul nicht eingeschaltet')
    expect(requested).toEqual([])
  })

  // --- the billing run (#140) -----------------------------------------------------------

  /** With INVOICE_WRITE the rows can be ticked; the preview names what each would write. */
  it('timeBillingWorklistPagePreviewsTheRunTest', async () => {
    await render(['TIME_BILL', 'INVOICE_WRITE'])

    await clickOn(checkboxes()[0])
    await clickOn(buttonNamed('Gewählte abrechnen (2)'))

    expect(writes).toEqual([
      {
        url: '/api/tenants/1/time-tracking/billing/batch/preview',
        body: { until: '2026-11-30', targets: [{ partnerId: 11, projectId: 51 }, { partnerId: 11, projectId: null }] },
      },
    ])
    expect(document.body.textContent).toContain('Wird übersprungen: Keiner der gewählten Einträge')
    expect(buttonNamed('1 Rechnungsentwurf erstellen').disabled).toBe(false)
  })

  /** The run writes, and the three lists say what came of every row. */
  it('timeBillingWorklistPageRunsTest', async () => {
    await render(['TIME_BILL', 'INVOICE_WRITE'])
    await clickOn(checkboxes()[0])
    await clickOn(buttonNamed('Gewählte abrechnen (2)'))

    await clickOn(buttonNamed('1 Rechnungsentwurf erstellen'))

    expect(writes.at(-1)?.url).toBe('/api/tenants/1/time-tracking/billing/batch')
    expect(document.body.textContent).toContain('1 Entwurf erstellt, 1 übersprungen, 0 fehlgeschlagen.')
    const draft = [...document.querySelectorAll('a')].find((link) => link.textContent === 'Entwurf öffnen')
    expect(draft?.getAttribute('href')).toBe('/rechnungen/501')
    expect(document.body.textContent).toContain('Muster AG · ohne Projekt: Keiner der gewählten Einträge')
  })

  /** Without INVOICE_WRITE nothing can be ticked: the run writes invoices. */
  it('timeBillingWorklistPageOffersNoRunWithoutTheInvoiceRightTest', async () => {
    await render(['TIME_BILL'])

    expect(checkboxes()).toHaveLength(0)
    expect(text()).not.toContain('Gewählte abrechnen')
  })

  /** Nothing ticked, nothing to run. */
  it('timeBillingWorklistPageRunsNothingUntickedTest', async () => {
    await render(['TIME_BILL', 'INVOICE_WRITE'])

    expect(buttonNamed('Gewählte abrechnen').disabled).toBe(true)
  })
})

const checkboxes = () =>
  [...container.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[]

function buttonNamed(name: string): HTMLButtonElement {
  const found = [...document.querySelectorAll('button')].find(
    (entry) => entry.textContent?.trim() === name,
  )
  if (found === undefined) throw new Error(`no button ${name}`)
  return found
}

async function clickOn(element: HTMLElement) {
  await act(async () => {
    element.click()
  })
  await settle()
}
