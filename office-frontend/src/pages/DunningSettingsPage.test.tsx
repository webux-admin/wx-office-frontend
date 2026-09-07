// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import { ACCOUNTING_RIGHTS } from '../lib/accounting'
import { DUNNING_RIGHTS } from '../lib/dunning'
import type { Account, DunningSettings, Page } from '../lib/types'
import { DunningSettingsPage } from './DunningSettingsPage'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1

function session(permissions: string[], modules: string[]): AuthState {
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

/** The clerk who sets the dunning up and may also read the chart of accounts. */
const WITH_CHART = session(
  [DUNNING_RIGHTS.read, DUNNING_RIGHTS.configure, ACCOUNTING_RIGHTS.read],
  ['DUNNING', 'ACCOUNTING'],
)

/**
 * The clerk this screen exists for, and the reason it may not simply hide the field: they set
 * the dunning up, and the chart of accounts would answer them 403.
 */
const WITHOUT_CHART = session([DUNNING_RIGHTS.read, DUNNING_RIGHTS.configure], ['DUNNING'])

const REVENUE_ACCOUNTS: Account[] = [
  {
    id: 3,
    accountNumber: '3000',
    name: 'Warenertrag',
    accountType: 'REVENUE',
    orPosition: 'ER_NETTOERLOESE',
    directPostingAllowed: true,
    active: true,
  },
  {
    id: 9,
    accountNumber: '3200',
    name: 'Mahngebührenertrag',
    accountType: 'REVENUE',
    orPosition: 'ER_NETTOERLOESE',
    directPostingAllowed: true,
    active: true,
  },
]

const STORED: DunningSettings = {
  numberRangeCode: 'MA',
  minimumOpenAmount: 0,
  showPaymentPart: true,
  grouping: 'PER_INVOICE',
  feeBooking: 'SEPARATE_INVOICE',
  feeVatMode: 'FOLLOWS_INVOICE',
  feeRevenueAccountNo: '3200',
  attachInvoiceCopies: false,
  activeLevelCount: 4,
  feeBookable: false,
  mailReady: true,
}

const ACCOUNT = 'Ertragskonto der Gebühr'

let container: HTMLDivElement
let root: Root
/** What the settings endpoint answers; every test sets what it is about. */
let settings: DunningSettings
/** Every write the mask sent: address, method and body per request. */
let written: { url: string; method: string; body: Record<string, unknown> }[]
/** Every address the mask read, so a test can say what was not fetched. */
let read: string[]

function json(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

function page(content: Account[]): Page<Account> {
  return {
    content,
    page: 0,
    size: 200,
    totalElements: content.length,
    totalPages: 1,
    sort: 'accountNumber,asc',
  }
}

beforeEach(() => {
  settings = { ...STORED }
  written = []
  read = []
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (method !== 'GET') {
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {}
      written.push({ url, method, body })
      return json(settings)
    }
    read.push(url)
    if (url.includes('/accounting/accounts')) return json(page(REVENUE_ACCOUNTS))
    return json(settings)
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
  for (let round = 0; round < 5; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

async function render(auth: AuthState = WITH_CHART) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <AuthContext.Provider value={auth}>
        <QueryClientProvider client={client}>
          <DunningSettingsPage />
        </QueryClientProvider>
      </AuthContext.Provider>,
    )
  })
  await settle()
}

/** The control the given label points at, whether it is an input or a dropdown. */
function control(label: string): HTMLInputElement | HTMLSelectElement | undefined {
  const caption = [...container.querySelectorAll('label')].find(
    (entry) => entry.textContent === label,
  )
  if (!caption) return undefined
  const found = document.getElementById(caption.htmlFor)
  return (found as HTMLInputElement | HTMLSelectElement | null) ?? undefined
}

function button(text: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find((entry) =>
    entry.textContent?.includes(text),
  ) as HTMLButtonElement | undefined
}

/** Types into a field the way a person would, so React sees the change. */
async function type(label: string, value: string) {
  const input = control(label)
  expect(input).toBeDefined()
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )?.set
    setter?.call(input, value)
    input?.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await settle()
}

/** Picks an option the way a person would. */
async function choose(label: string, value: string) {
  const select = control(label) as HTMLSelectElement | undefined
  expect(select).toBeDefined()
  await act(async () => {
    if (select !== undefined) select.value = value
    select?.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await settle()
}

async function save() {
  await act(async () => {
    button('Speichern')?.click()
  })
  await settle()
}

describe('DunningSettingsPage', () => {
  /**
   * The regression this file exists for.
   *
   * <p>The mask sent a field the request record does not carry any more. Jackson drops an
   * unknown key without a word, so the account arrived as null and was stored as null — every
   * save wiped the fee account, and nothing on the screen said so. What the account is set to is
   * not what this test is about; that it travels at all, under the name the backend reads, is
   * (backend ADR-0127).
   */
  it('saveDunningSettingsKeepsTheStoredFeeAccountTest', async () => {
    await render()

    await save()

    expect(written).toHaveLength(1)
    expect(written[0].method).toBe('PUT')
    expect(written[0].body.feeRevenueAccountNo).toBe('3200')
    expect(written[0].body).not.toHaveProperty('feeRevenueAccountId')
  })

  /** The account travels as a chart number; an id would be the old bug in a new spelling. */
  it('saveDunningSettingsSendsTheChosenAccountTest', async () => {
    await render()

    await choose(ACCOUNT, '3000')
    await save()

    expect(written[0].body.feeRevenueAccountNo).toBe('3000')
  })

  /** No account is said with null, not with an empty string the format check would refuse. */
  it('saveDunningSettingsWithoutAnAccountTest', async () => {
    settings = { ...STORED, feeRevenueAccountNo: undefined }
    await render()

    await save()

    expect(written[0].body.feeRevenueAccountNo).toBeNull()
  })

  /** The picker offers the chart of accounts, by number and name. */
  it('dunningSettingsPicksTheAccountFromTheChartTest', async () => {
    await render()

    const options = [...container.querySelectorAll('option')].map((entry) => entry.textContent)
    expect(options).toContain('3200 · Mahngebührenertrag')
    expect((control(ACCOUNT) as HTMLSelectElement).value).toBe('3200')
  })

  /**
   * The gating question of this screen, and it is not the one the product mask answers.
   *
   * <p>This screen runs on the dunning read right and carries no module prop, on purpose. The
   * chart of accounts runs on the accounting read right, so the picker would answer 403 for a
   * dunning clerk without it. Hiding the field the way the product mask does is not open here —
   * this field is what its panel is about, and whoever configures the dunning has to be able to
   * set it. So it becomes a typed field with the same format check, and the chart is not asked.
   */
  it('dunningSettingsTypesTheAccountWithoutTheChartRightTest', async () => {
    await render(WITHOUT_CHART)

    expect(control(ACCOUNT)?.tagName).toBe('INPUT')
    expect((control(ACCOUNT) as HTMLInputElement).value).toBe('3200')
    expect(read.some((url) => url.includes('/accounting/accounts'))).toBe(false)
  })

  /** And the value round-trips untouched: the typed field saves what it was handed. */
  it('dunningSettingsKeepsTheAccountWithoutTheChartRightTest', async () => {
    await render(WITHOUT_CHART)

    await save()

    expect(written[0].body.feeRevenueAccountNo).toBe('3200')
  })

  /**
   * The typed field checks what the backend checks, rather than letting it answer 400.
   *
   * <p>The same rule at both borders: digits and dots, beginning with a digit, at most twenty.
   */
  it('dunningSettingsRefusesAMalformedAccountTest', async () => {
    await render(WITHOUT_CHART)

    await type(ACCOUNT, 'Ertrag')

    expect(container.textContent).toContain('Eine Kontonummer besteht aus Ziffern und Punkten')
    expect(button('Speichern')?.disabled).toBe(true)
  })

  /** A number that passes the check leaves the button alone. */
  it('dunningSettingsAcceptsATypedAccountTest', async () => {
    await render(WITHOUT_CHART)

    await type(ACCOUNT, '3000.10')
    await save()

    expect(written[0].body.feeRevenueAccountNo).toBe('3000.10')
  })
})
