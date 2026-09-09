// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../../auth/authContext'
import { ACCOUNTING_RIGHTS } from '../../lib/accounting'
import { WriteOffAccountPage } from './WriteOffAccountPage'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1

let container: HTMLDivElement
let root: Root
let sent: unknown[] = []

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

/** A session that may look but not change. */
const READER = auth([ACCOUNTING_RIGHTS.read])

/** A session that may say where a reason is booked. */
const CONFIGURER = auth([ACCOUNTING_RIGHTS.read, ACCOUNTING_RIGHTS.configure])

/** How many reasons this tenant has assigned; the rest come back as gaps. */
let assigned: unknown[] = []

function stubFetch() {
  sent = []
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    if (init?.method === 'PUT') {
      sent.push(JSON.parse(String(init.body)))
      return Promise.resolve(new Response('{}', { status: 200 }))
    }
    let body: unknown = []
    if (url.includes('/write-off-accounts')) {
      body = assigned
    } else if (url.includes('/tax-codes')) {
      body = {
        codes: [
          {
            id: 7,
            code: 'USTMIN81',
            name: 'Minderung 8.1 %',
            direction: 'OUTPUT',
            kind: 'REDUCTION',
            rate: 8.1,
            active: true,
            sortOrder: 1,
          },
        ],
      }
    } else if (url.includes('/accounts')) {
      body = {
        content: [
          { id: 42, accountNumber: '3800', name: 'Erlösminderungen', accountType: 'REVENUE' },
        ],
        page: { number: 0, size: 50, totalElements: 1, totalPages: 1 },
      }
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
  assigned = []
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

async function render(session: AuthState = CONFIGURER) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <MemoryRouter>
        <AuthContext.Provider value={session}>
          <QueryClientProvider client={client}>
            <WriteOffAccountPage />
          </QueryClientProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
  })
  for (let round = 0; round < 5; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

const text = () => container.textContent ?? ''

describe('WriteOffAccountPage', () => {
  it('writeOffAccountPageShowsTheSevenReasonsTest', async () => {
    await render()

    // Fixed order and no more rows: the catalogue of reasons is closed.
    for (const label of [
      'Skonto',
      'Skonto unberechtigt',
      'Kleindifferenz',
      'Debitorenverlust',
      'Bankspesen',
      'Kursdifferenz',
      'Überzahlung einbehalten',
    ]) {
      expect(text()).toContain(label)
    }
  })

  /**
   * Nothing is shipped, so a fresh tenant sees seven gaps — and has to be told what that costs,
   * because the write-off itself says nothing when it is not booked.
   */
  it('writeOffAccountPageWarnsAboutEveryGapTest', async () => {
    await render()

    expect(text()).toContain('erfasst und nicht gebucht')
    expect(text()).toContain('Skonto')
  })

  it('writeOffAccountPageSaysNothingWhenEveryReasonIsAssignedTest', async () => {
    assigned = [
      'SKONTO',
      'SKONTO_UNBERECHTIGT',
      'KLEINDIFFERENZ',
      'DEBITORENVERLUST',
      'BANKSPESEN',
      'KURSDIFFERENZ',
      'UEBERZAHLUNG',
    ].map((reason) => ({
      reason,
      debitAccountNumber: '3800',
      debitAccountName: 'Erlösminderungen',
      creditAccountNumber: '3800',
      creditAccountName: 'Erlösminderungen',
    }))

    await render()

    expect(text()).not.toContain('erfasst und nicht gebucht')
  })

  /**
   * The row is replaced as a whole, so both accounts travel every time. Sending one of the two
   * would clear the other — the trap the dunning settings fell into.
   */
  it('writeOffAccountPageSendsBothAccountsTest', async () => {
    assigned = [
      {
        reason: 'SKONTO',
        debitAccountNumber: '3800',
        debitAccountName: 'Erlösminderungen',
        creditAccountNumber: '3800',
        creditAccountName: 'Erlösminderungen',
      },
    ]
    await render()

    const select = [...container.querySelectorAll('select')].find(
      (one) => one.value === '' || one.value === 'USTMIN81',
    ) as HTMLSelectElement
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(
      select,
      'USTMIN81',
    )
    await act(async () => {
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })

    expect(sent).toEqual([
      {
        reason: 'SKONTO',
        debitAccount: '3800',
        creditAccount: '3800',
        taxCode: 'USTMIN81',
      },
    ])
  })

  it('writeOffAccountPageLocksTheFieldsWithoutTheRightTest', async () => {
    await render(READER)

    const selects = [...container.querySelectorAll('select')]
    expect(selects.length).toBeGreaterThan(0)
    expect(selects.every((one) => one.disabled)).toBe(true)
  })
})
