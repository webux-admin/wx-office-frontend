// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../../auth/authContext'
import { ACCOUNTING_RIGHTS } from '../../lib/accounting'
import type { Account, Page, SystemKey } from '../../lib/types'
import { SystemAccountDialog } from './SystemAccountDialog'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1

function session(permissions: string[]): AuthState {
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

const CONFIGURE = session([ACCOUNTING_RIGHTS.read, ACCOUNTING_RIGHTS.configure])
const READ_ONLY = session([ACCOUNTING_RIGHTS.read])

/** Account 9200: barred from being posted to by hand, not from carrying a key. */
const CLOSING_ACCOUNT: Account = {
  id: 9,
  accountNumber: '9200',
  name: 'Jahresgewinn oder Jahresverlust',
  accountType: 'CLOSING',
  orPosition: 'ABSCHLUSS',
  directPostingAllowed: false,
  active: true,
}

const EXPENSE_ACCOUNT: Account = {
  id: 4,
  accountNumber: '6000',
  name: 'Raumaufwand',
  accountType: 'EXPENSE',
  orPosition: 'ER_UEBRIGER_BETRIEBSAUFWAND',
  directPostingAllowed: true,
  active: true,
}

const KEYS: SystemKey[] = [
  {
    key: 'DEBITOR_SAMMEL',
    question: 'Welches Konto führt Ihre offenen Kundenrechnungen?',
    hint: 'Sammelkonto der Debitoren; gebraucht, sobald Rechnungen verbucht werden.',
    allowedTypes: ['ASSET'],
  },
  {
    key: 'JAHRESERGEBNIS_ER',
    question: 'Welches Konto führt Ihren Jahresgewinn in der Erfolgsrechnung?',
    hint: 'Abschlusskonto, auf das der Jahresabschluss die Erfolgsrechnung schliesst.',
    allowedTypes: ['CLOSING'],
  },
]

let container: HTMLDivElement
let root: Root
/** Every write the dialog sent: address, method and body per request. */
let written: { url: string; method: string; body: Record<string, unknown> }[]

function json(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

function accountPage(): Page<Account> {
  return {
    content: [EXPENSE_ACCOUNT, CLOSING_ACCOUNT],
    page: 0,
    size: 200,
    totalElements: 2,
    totalPages: 1,
    sort: 'accountNumber,asc',
  }
}

beforeEach(() => {
  written = []
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (method !== 'GET') {
      written.push({
        url,
        method,
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : {},
      })
      return json(CLOSING_ACCOUNT)
    }
    if (url.includes('/system-keys')) return json(KEYS)
    if (url.includes('/accounting/accounts')) return json(accountPage())
    if (url.includes('/catalogues')) {
      return json({
        'account-type': [
          { code: 'CLOSING', name: 'Abschluss' },
          { code: 'EXPENSE', name: 'Aufwand' },
        ],
      })
    }
    return json({})
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

async function settle() {
  for (let round = 0; round < 6; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

async function render(auth: AuthState = CONFIGURE) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <MemoryRouter>
        <AuthContext.Provider value={auth}>
          <QueryClientProvider client={client}>
            <SystemAccountDialog tenantId={TENANT} onClose={() => {}} />
          </QueryClientProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
  })
  await settle()
}

function button(text: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find((entry) =>
    entry.textContent?.includes(text),
  ) as HTMLButtonElement | undefined
}

async function click(text: string) {
  await act(async () => {
    button(text)?.click()
  })
  await settle()
}

describe('SystemAccountDialog', () => {
  /**
   * The questions come from `GET /accounts/system-keys`, and the key itself appears nowhere:
   * `JAHRESERGEBNIS_ER` means nothing to anybody who has to answer the question.
   */
  it('showsTheQuestionsFromTheEndpointTest', async () => {
    await render()

    expect(container.textContent).toContain('Welches Konto führt Ihre offenen Kundenrechnungen?')
    expect(container.textContent).toContain(
      'Welches Konto führt Ihren Jahresgewinn in der Erfolgsrechnung?',
    )
    expect(container.textContent).toContain('— nicht gesetzt —')
    expect(container.textContent).not.toContain('JAHRESERGEBNIS_ER')
    expect(container.textContent).not.toContain('DEBITOR_SAMMEL')
  })

  /**
   * The picker offers what `allowedTypes` permits — and **9200 is among them**. The account is
   * barred from being posted to by hand, not from carrying a key.
   */
  it('findsTheClosingAccountForTheClosingKeyTest', async () => {
    await render()

    await click('Welches Konto führt Ihren Jahresgewinn in der Erfolgsrechnung?')

    expect(container.textContent).toContain('9200')
    expect(container.textContent).toContain('Jahresgewinn oder Jahresverlust')
    // The expense account is no answer to this question and is not offered.
    expect(container.textContent).not.toContain('Raumaufwand')
    expect(container.textContent).toContain('Abschlusskonto, auf das der Jahresabschluss')
  })

  /** A key moves through this one endpoint and through no other way. */
  it('assignsTheChosenAccountTest', async () => {
    await render()
    await click('Welches Konto führt Ihren Jahresgewinn in der Erfolgsrechnung?')
    await click('9200')
    await click('Übernehmen')

    expect(written).toHaveLength(1)
    expect(written[0].method).toBe('PUT')
    expect(written[0].url).toContain('/accounting/accounts/system-key/JAHRESERGEBNIS_ER')
    expect(written[0].body).toEqual({ accountId: 9 })
  })

  /** Reading which account answers a question is one right, moving a key another. */
  it('hidesTheAssignmentWithoutConfigureTest', async () => {
    await render(READ_ONLY)
    await click('Welches Konto führt Ihren Jahresgewinn in der Erfolgsrechnung?')

    expect(container.textContent).toContain('9200')
    expect(button('Übernehmen')).toBeUndefined()
  })
})
