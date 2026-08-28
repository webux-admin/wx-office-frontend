// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import type { DueOfferReminder } from '../lib/types'
import { DashboardPage } from './DashboardPage'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1

/** A session that may read offers, which is what the follow-up list hangs on. */
const SESSION: AuthState = {
  user: {
    userId: 1,
    username: 'muster',
    activeTenantId: TENANT,
    superuser: false,
    tenants: [],
    permissions: ['OFFER_READ'],
  },
  loading: false,
  signIn: () => Promise.reject(new Error('nicht gebraucht')),
  completeSecondFactor: () => Promise.reject(new Error('nicht gebraucht')),
  sendSecondFactorCode: () => Promise.resolve(),
  signOut: () => Promise.resolve(),
  switchTenant: () => Promise.resolve(),
  refresh: () => Promise.resolve(),
  can: (permission: string) => permission === 'OFFER_READ',
}

const DUE: DueOfferReminder[] = [
  {
    reminderId: 5,
    documentId: 7,
    documentNumber: 'OF-2026-0002',
    partnerName: 'Muster AG',
    dueAt: '2026-08-20T07:00:00Z',
    note: 'Nachfragen',
  },
  {
    reminderId: 6,
    documentId: 9,
    dueAt: '2026-08-21T07:00:00Z',
  },
]

let container: HTMLDivElement
let root: Root
let due: DueOfferReminder[]
/** How many shortfalls the inventory tile counts. */
let shortages: number

function json(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

function stubFetch() {
  vi.stubGlobal('fetch', (url: string) => {
    if (url.includes('/offers/reminders/due')) return json(due)
    if (url.includes('/inventory/stock/shortages')) {
      return json({
        content: [],
        page: 0,
        size: 1,
        totalElements: shortages,
        totalPages: shortages,
        sort: '',
      })
    }
    if (url.includes('/offers?')) {
      return json({ content: [], page: 0, size: 1, totalElements: 3, totalPages: 3, sort: '' })
    }
    if (url.includes('/catalogues')) return json({})
    return json([])
  })
}

/**
 * A session of a tenant that runs the inventory and may read it.
 *
 * @param runsInventory whether that tenant has the module switched on
 */
function inventorySession(runsInventory: boolean): AuthState {
  return {
    ...SESSION,
    user: {
      ...SESSION.user!,
      tenants: [
        {
          id: TENANT,
          code: 'WX',
          name: 'Webux',
          isDefault: true,
          modules: runsInventory ? ['INVENTORY'] : [],
        },
      ],
      permissions: ['INVENTORY_READ'],
    },
    can: (permission: string) => permission === 'INVENTORY_READ',
  }
}

beforeEach(() => {
  due = DUE
  shortages = 3
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

async function settle() {
  for (let round = 0; round < 5; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

/** Stands in for the offer mask and echoes what the link handed over. */
function OfferMaskProbe() {
  const { id } = useParams()
  const state: unknown = useLocation().state
  const tab =
    typeof state === 'object' && state !== null && 'tab' in state ? String(state.tab) : 'kein'
  return (
    <p>
      Maske {id} auf {tab}
    </p>
  )
}

async function render(session: AuthState = SESSION): Promise<void> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/']}>
        <AuthContext.Provider value={session}>
          <QueryClientProvider client={client}>
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/offerten/:id" element={<OfferMaskProbe />} />
            </Routes>
          </QueryClientProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
  })
  await settle()
}

function text(): string {
  return document.body.textContent ?? ''
}

describe('DashboardPage', () => {
  it('dashboardPageRendersTheDueRemindersTest', async () => {
    await render()

    expect(text()).toContain('Nachfassen')
    expect(text()).toContain('OF-2026-0002')
    expect(text()).toContain('Muster AG')
    expect(text()).toContain('Nachfragen')
    // A draft has no number and is named as what it is.
    expect(text()).toContain('Entwurf')
  })

  it('dashboardPageLinksAReminderToTheFollowUpRegisterTest', async () => {
    await render()
    const link = document.querySelector<HTMLAnchorElement>('a[href="/offerten/7"]')
    expect(link).not.toBeNull()

    await act(async () => {
      link?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
    })
    await settle()

    // The row leads onto the follow-up register of its offer, named in the router state.
    expect(text()).toContain('Maske 7 auf nachfassen')
  })

  it('dashboardPageHidesTheFollowUpListWhenNothingIsDueTest', async () => {
    due = []
    await render()

    expect(text()).not.toContain('Nachfassen')
  })

  /**
   * The tile names the module and leads to its entrance; the number is a signal. Warning
   * instead of blocking only works while somebody looks at it, and this is where they look.
   */
  it('dashboardPageShowsTheInventoryTileTest', async () => {
    await render(inventorySession(true))

    expect(text()).toContain('Lager')
    expect(text()).toContain('3 in Unterdeckung')
    expect(document.querySelector('a[href="/bestand"]')).not.toBeNull()
  })

  /** Nothing short is worth saying so, rather than a bare zero. */
  it('dashboardPageShowsTheInventoryTileWithoutAnyShortageTest', async () => {
    shortages = 0
    await render(inventorySession(true))

    expect(text()).toContain('Bestand gedeckt')
  })

  /** Without the right there is no tile — the sidebar entry is gone with it. */
  it('dashboardPageHidesTheInventoryTileWithoutThePermissionTest', async () => {
    await render()

    expect(document.querySelector('a[href="/bestand"]')).toBeNull()
  })

  /** Right and switch: a tenant that does not run the inventory sees no inventory. */
  it('dashboardPageHidesTheInventoryTileWithoutTheModuleTest', async () => {
    await render(inventorySession(false))

    expect(document.querySelector('a[href="/bestand"]')).toBeNull()
  })
})
