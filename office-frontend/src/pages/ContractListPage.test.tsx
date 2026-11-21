// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import type { Contract } from '../lib/types'
import { ContractListPage } from './ContractListPage'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1

const CONTRACT: Contract = {
  id: 5,
  contractNumber: 'V-00005',
  title: 'Hosting und Support',
  partnerId: 11,
  customerName: 'Bäckerei Huber AG',
  customerTown: 'Bern',
  startDate: '2027-01-01',
  endDate: null,
  currency: 'CHF',
  positions: [],
  totals: [],
}

function session(permissions: string[], modules = ['CONTRACT']): AuthState {
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

let container: HTMLDivElement
let root: Root
let requested: string[]
let rows: Contract[]

beforeEach(() => {
  requested = []
  rows = [CONTRACT]
  vi.stubGlobal('fetch', (url: string) => {
    requested.push(url)
    return Promise.resolve(
      new Response(
        JSON.stringify({ content: rows, totalElements: rows.length, totalPages: 1, number: 0, size: 50 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
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

async function render(permissions: string[], modules?: string[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <MemoryRouter>
        <AuthContext.Provider value={session(permissions, modules)}>
          <QueryClientProvider client={client}>
            <ContractListPage />
          </QueryClientProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50))
  })
}

const text = () => container.textContent ?? ''

describe('ContractListPage', () => {
  it('contractListPageShowsTheContractsTest', async () => {
    await render(['CONTRACT_READ', 'CONTRACT_WRITE'])

    expect(requested[0]).toBe('/api/tenants/1/contracts?page=0&size=50&sort=contractNumber%2Cdesc')
    expect(text()).toContain('V-00005')
    expect(text()).toContain('Hosting und Support')
    expect(text()).toContain('Bäckerei Huber AG, Bern')
    expect(text()).toContain('unbefristet')
    expect(text()).toContain('Vertrag')
  })

  it('contractListPageInvitesTheFirstContractTest', async () => {
    rows = []
    await render(['CONTRACT_READ', 'CONTRACT_WRITE'])

    expect(text()).toContain('Noch keine Verträge')
    expect(text()).toContain('Ersten Vertrag anlegen')
  })

  it('contractListPageOffersNoNewContractWithoutTheWriteRightTest', async () => {
    rows = []
    await render(['CONTRACT_READ'])

    expect(text()).not.toContain('Ersten Vertrag anlegen')
  })

  it('contractListPageStaysShutWithoutTheModuleTest', async () => {
    await render(['CONTRACT_READ'], [])

    expect(requested).toEqual([])
    expect(text()).not.toContain('V-00005')
  })
})
