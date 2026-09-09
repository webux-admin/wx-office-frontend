// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import { ACCOUNTING_RIGHTS } from '../lib/accounting'
import { BANKING_RIGHTS } from '../lib/banking'
import { BankAccountPage } from './BankAccountPage'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1

let container: HTMLDivElement
let root: Root

/**
 * A session, with the modules and rights a case needs.
 *
 * <p>Every case needs the banking module and the right to read it, or the screen itself does
 * not appear. What varies is whether the bookkeeping is kept here too.
 */
function auth(modules: string[], permissions: string[]): AuthState {
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

/** A tenant that receives statements but keeps its books elsewhere. */
const BANKING_ONLY = auth(['BANKING'], [BANKING_RIGHTS.read])

/** A tenant that does both, and a session that may read the chart of accounts. */
const WITH_ACCOUNTING = auth(['BANKING', 'ACCOUNTING'],
  [BANKING_RIGHTS.read, ACCOUNTING_RIGHTS.read])

/** Answers the three lists this screen reads. */
function stubFetch() {
  vi.stubGlobal('fetch', (url: string) => {
    let body: unknown = []
    if (url.includes('/accounting/bank-accounts')) {
      body = [
        {
          id: 5,
          accountIban: 'CH9300762011623852957',
          accountId: 42,
          accountNumber: '1020',
          accountName: 'Bankguthaben',
          active: true,
        },
      ]
    } else if (url.includes('/accounting/accounts')) {
      body = {
        content: [{ id: 42, accountNumber: '1020', name: 'Bankguthaben', accountType: 'ASSET' }],
        page: { number: 0, size: 50, totalElements: 1, totalPages: 1 },
      }
    } else if (url.includes('/bank-accounts')) {
      body = [
        {
          id: 3,
          label: 'Geschäftskonto',
          iban: 'CH93 0076 2011 6238 5295 7',
          currency: 'CHF',
          active: true,
          qrAccount: false,
        },
      ]
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

async function render(session: AuthState) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <MemoryRouter>
        <AuthContext.Provider value={session}>
          <QueryClientProvider client={client}>
            <BankAccountPage />
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

describe('BankAccountPage', () => {
  it('bankAccountPageWithoutTheAccountingModuleTest', async () => {
    await render(BANKING_ONLY)

    // The statements arrive all the same; where the money is booked is a question this tenant
    // does not answer here, so the panel stays away rather than standing empty.
    expect(text()).toContain('Geschäftskonto')
    expect(text()).not.toContain('Fibu-Konten')
  })

  it('bankAccountPageShowsTheLedgerAccountTest', async () => {
    await render(WITH_ACCOUNTING)

    expect(text()).toContain('Fibu-Konten')
    // The picker stores the number, and the row is labelled by the account it belongs to.
    const select = container.querySelector('select') as HTMLSelectElement | null
    expect(select?.value).toBe('1020')
  })

  it('bankAccountPageNamesTheBankAccountOfEachRowTest', async () => {
    await render(WITH_ACCOUNTING)

    // Label and IBAN together: a tenant with two accounts in the same currency tells them
    // apart by neither on its own.
    expect(text()).toContain('Geschäftskonto · CH93 0076 2011 6238 5295 7')
  })
})
