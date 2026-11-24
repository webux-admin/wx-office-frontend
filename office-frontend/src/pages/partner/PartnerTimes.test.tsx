// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../../auth/authContext'
import type { Page, TimeEntry, TimeSummary } from '../../lib/types'
import { PartnerTimes } from './PartnerTimes'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** Muster AG: 7:00 hours, one hour of it without a project. */
const SUMMARY: TimeSummary = {
  entries: 3,
  totalMinutes: 420,
  billableMinutes: 240,
  openEntries: 2,
  openMinutes: 240,
  inDraftMinutes: 0,
  billedMinutes: 0,
  notBillableMinutes: 180,
}

function entry(overrides: Partial<TimeEntry>): TimeEntry {
  return {
    id: 1,
    userId: 1,
    userName: 'Anna Muster',
    workDate: '2026-11-25',
    durationMinutes: 60,
    partnerId: 11,
    customerName: 'Muster AG',
    billable: true,
    state: 'OPEN',
    editable: true,
    lockVersion: 0,
    ...overrides,
  }
}

const ON_PROJECT = entry({
  id: 5,
  durationMinutes: 180,
  projectId: 12,
  projectNumber: 'P-00012',
  projectName: 'Website',
  description: 'Wireframes',
})
const WITHOUT_PROJECT = entry({ id: 6, userName: 'Beat Keller', description: 'Ticket 4711' })

function session(permissions: string[]): AuthState {
  return {
    user: {
      userId: 1,
      username: 'anna',
      activeTenantId: 1,
      superuser: false,
      tenants: [{ id: 1, code: 'WX', name: 'Webux', isDefault: true, modules: ['TIMETRACKING'] }],
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
let entries: TimeEntry[]

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  )
}

function page(content: TimeEntry[]): Page<TimeEntry> {
  return {
    content,
    page: 0,
    size: 50,
    totalElements: content.length,
    totalPages: content.length === 0 ? 0 : 1,
    sort: '',
  }
}

beforeEach(() => {
  requested = []
  entries = [ON_PROJECT, WITHOUT_PROJECT]
  vi.stubGlobal('fetch', (url: string) => {
    requested.push(url)
    if (url.endsWith('/customers/11/summary')) return json(SUMMARY)
    if (url.startsWith('/api/tenants/1/time-entries?')) return json(page(entries))
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
})

/** What the billing mask was opened with, so the hand-over can be read. */
function HandedOver() {
  return <p data-testid="handed-over">{JSON.stringify(useLocation().state)}</p>
}

async function render(permissions = ['TIME_READ']) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/kunden/11']}>
        <AuthContext.Provider value={session(permissions)}>
          <QueryClientProvider client={client}>
            <Routes>
              <Route path="/kunden/11" element={<PartnerTimes tenantId={1} partnerId={11} />} />
              <Route path="/zeiten-abrechnen/kunde/11" element={<HandedOver />} />
            </Routes>
          </QueryClientProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30))
  })
}

const rows = () => [...container.querySelectorAll('tbody tr')].map((row) => row.textContent ?? '')

function link(label: string): HTMLAnchorElement | undefined {
  return [...container.querySelectorAll('a')].find((entry) => entry.textContent?.trim() === label)
}

describe('PartnerTimes', () => {
  /** The summary and the list of the customer, with and without a project. */
  it('partnerTimesAsksForThisCustomerTest', async () => {
    await render()

    expect(requested).toEqual([
      '/api/tenants/1/time-tracking/customers/11/summary',
      '/api/tenants/1/time-entries?partnerId=11&page=0&size=50',
    ])
  })

  it('partnerTimesShowsTheTilesTest', async () => {
    await render()

    const text = container.textContent ?? ''
    expect(text).toContain('Total')
    expect(text).toContain('7:00 Std.')
    expect(text).toContain('Offen verrechenbar')
    expect(text).toContain('4:00 Std.')
    expect(text).toContain('Nicht verrechenbar')
  })

  /** The column «Projekt» tells the times of a project from those on the customer alone. */
  it('partnerTimesShowsTheProjectColumnTest', async () => {
    await render()

    expect(container.querySelector('thead')?.textContent).toContain('Projekt')
    expect(rows()[0]).toContain('P-00012 Website')
    expect(rows()[1]).toContain('ohne Projekt')
    expect(rows()[1]).toContain('Beat Keller')
  })

  it('partnerTimesWithoutEntriesTest', async () => {
    entries = []

    await render()

    expect(container.textContent).toContain('Noch keine Zeiten')
  })

  /** «Abrechnen» opens the billing of the customer and names the customer as the way back. */
  it('partnerTimesOpensTheBillingTest', async () => {
    await render(['TIME_READ', 'TIME_BILL'])

    const bill = link('Abrechnen')
    expect(bill?.getAttribute('href')).toBe('/zeiten-abrechnen/kunde/11')
    await act(async () => {
      bill?.click()
    })

    const state = JSON.parse(
      container.querySelector('[data-testid="handed-over"]')?.textContent ?? '{}',
    )
    expect(state.origin).toEqual({ from: '/kunden/11', label: 'Kunde' })
    expect(state.billing).toEqual({ until: null, withoutProject: false })
  })

  it('partnerTimesWithoutTheBillRightTest', async () => {
    await render()

    expect(link('Abrechnen')).toBeUndefined()
  })
})
