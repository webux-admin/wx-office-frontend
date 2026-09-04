// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import type { Tenant } from '../lib/types'
import { TenantPage } from './TenantPage'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1

const PERMISSIONS = ['TENANT_READ', 'TENANT_WRITE']

const SESSION: AuthState = {
  user: {
    userId: 1,
    username: 'muster',
    activeTenantId: TENANT,
    superuser: false,
    tenants: [{ id: TENANT, code: 'WX', name: 'Webux', isDefault: true, modules: ['INVENTORY'] }],
    permissions: PERMISSIONS,
  },
  loading: false,
  signIn: () => Promise.reject(new Error('nicht gebraucht')),
  completeSecondFactor: () => Promise.reject(new Error('nicht gebraucht')),
  sendSecondFactorCode: () => Promise.resolve(),
  adoptSession: () => {},
  signOut: () => Promise.resolve(),
  switchTenant: () => Promise.resolve(),
  refresh: () => Promise.resolve(),
  can: (permission: string) => PERMISSIONS.includes(permission),
}

/** The label of the two fields under test, as the user reads them. */
const PERCENT = 'Begründungspflicht ab'
const MINIMUM = 'Untergrenze der Begründungspflicht'
const ROUNDING_LIMIT = 'Überzahlung: Rundung bis'
const KEEP_LIMIT = 'Einbehalt vorschlagen bis'
const KEEP_MAXIMUM = 'Einbehalt höchstens'
/** The three fields the VAT panel gained with the fiscal year (backend ADR-0113). */
const BASIS = 'Abrechnungsart'
const BASIS_FROM = 'Abrechnungsart gilt ab'
const VAT_LOCKED = 'MWST abgerechnet bis'

/** A tenant that is registered for VAT — the case the mask could not save at all. */
function liable(overrides: Partial<Tenant> = {}): Tenant {
  return tenant({
    uid: 'CHE-123.456.789',
    vat: {
      vatLiable: true,
      vatMethod: 'EFFECTIVE',
      vatLiableFrom: '2024-01-01',
      vatAccountingBasis: 'COLLECTED_CONSIDERATION',
      vatAccountingBasisFrom: '2026-01-01',
    },
    vatPeriodsLockedUntil: '2026-06-30',
    ...overrides,
  })
}

/**
 * The tenant the mask reads.
 *
 * <p>Thresholds away from the shipped 5 % and 1 on purpose: a field that shows the default no
 * matter what the tenant stored would pass a test built on the default.
 */
function tenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: TENANT,
    code: 'WEBUX',
    active: true,
    name: 'Webux GmbH',
    address: { postalCode: '8001', town: 'Zürich', country: 'CH' },
    baseCurrency: 'CHF',
    fiscalYearStartMonth: 1,
    defaultLanguage: 'de',
    cashRoundingEnabled: true,
    cashRoundingIncrement: 0.05,
    stocktakeReasonPercent: 12.5,
    stocktakeReasonMinimum: 3,
    overpaymentRoundingLimit: 0.1,
    overpaymentKeepLimit: 2,
    overpaymentKeepMaximum: 20,
    ...overrides,
  }
}

let container: HTMLDivElement
let root: Root
/** The tenant the endpoint answers with; every test sets what it is about. */
let stored: Tenant
/** Every write the mask sent: method and body per request. */
let written: { url: string; method: string; body: Record<string, unknown> }[]

function json(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

function stubFetch() {
  written = []
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (method !== 'GET') {
      written.push({
        url,
        method,
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : {},
      })
      return json(stored)
    }
    if (url.includes('/catalogues')) return json({})
    if (url.endsWith(`/api/tenants/${TENANT}`)) return json(stored)
    return json([])
  })
}

beforeEach(() => {
  stored = tenant()
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

async function render() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[`/mandanten/${TENANT}`]}>
        <AuthContext.Provider value={SESSION}>
          <QueryClientProvider client={client}>
            <Routes>
              <Route path="/mandanten/:id" element={<TenantPage />} />
            </Routes>
          </QueryClientProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
  })
  await settle()
}

/** The input the given label points at, or undefined while the mask does not show it. */
function field(label: string): HTMLInputElement | undefined {
  const caption = [...container.querySelectorAll('label')].find(
    (entry) => entry.textContent === label,
  )
  if (!caption) return undefined
  return (document.getElementById(caption.htmlFor) as HTMLInputElement | null) ?? undefined
}

async function save() {
  const button = [...container.querySelectorAll('button')].find(
    (entry) => entry.textContent === 'Speichern',
  )
  expect(button).toBeDefined()
  await act(async () => {
    button?.click()
  })
  await settle()
}

describe('TenantPage', () => {
  it('tenantPageHasNoInventoryCheckboxTest', async () => {
    // The switch moved to «Systemeinstellungen → Module» — and with it the two thresholds,
    // which had this checkbox as their only visibility condition (ADR-0018).
    await render()

    const labels = [...container.querySelectorAll('label')].map((entry) => entry.textContent)
    expect(labels).not.toContain('Lager verwenden')
    expect(field(PERCENT)).toBeUndefined()
    expect(field(MINIMUM)).toBeUndefined()
  })

  it('tenantPageDoesNotSendTheModuleSwitchTest', async () => {
    // The form has nothing to say about the modules, and the payload no longer carries a field
    // for them at all — they are switched on their own screen (backend ADR-0079). The two count
    // thresholds do still travel, and leaving them out is what keeps a save from resetting them.
    await render()

    await save()

    expect(written).toHaveLength(1)
    expect(written[0].method).toBe('PUT')
    expect(Object.keys(written[0].body)).not.toContain('inventoryEnabled')
    expect(written[0].body.stocktakeReasonPercent).toBeUndefined()
    expect(written[0].body.stocktakeReasonMinimum).toBeUndefined()
  })
  // --- the three zones of an overpayment (backend ADR-0105) ------------------

  /**
   * The three limits are read from the tenant, not from the shipped defaults.
   *
   * <p>The fixture is deliberately away from 0.05 / 1.00 / 5.00: a field that showed the
   * default whatever the tenant stored would pass a test built on the default.
   */
  it('tenantPageReadsTheOverpaymentZonesTest', async () => {
    await render()

    expect(field(ROUNDING_LIMIT)?.value).toBe('0.1')
    expect(field(KEEP_LIMIT)?.value).toBe('2')
    expect(field(KEEP_MAXIMUM)?.value).toBe('20')
  })

  /** Unlike the count thresholds they do travel: this form is where they are edited. */
  it('tenantPageSendsTheOverpaymentZonesTest', async () => {
    await render()

    await save()

    expect(written[0].body.overpaymentRoundingLimit).toBe(0.1)
    expect(written[0].body.overpaymentKeepLimit).toBe(2)
    expect(written[0].body.overpaymentKeepMaximum).toBe(20)
  })

  // --- das Panel «Mehrwertsteuer» (backend ADR-0100 und ADR-0113) ------------

  it('tenantPageShowsTheVatAccountingFieldsTest', async () => {
    stored = liable()
    await render()

    expect(field(BASIS)?.value).toBe('COLLECTED_CONSIDERATION')
    expect(field(BASIS_FROM)?.value).toBe('2026-01-01')
    expect(field(VAT_LOCKED)?.value).toBe('2026-06-30')
  })

  /** Without liability there is no basis to state and no period to settle. */
  it('tenantPageHidesTheVatAccountingFieldsWithoutLiabilityTest', async () => {
    await render()

    expect(field(BASIS)).toBeUndefined()
    expect(field(BASIS_FROM)).toBeUndefined()
    expect(field(VAT_LOCKED)).toBeUndefined()
  })

  /**
   * The bug this issue repairs.
   *
   * <p>`TenantConverter.toVatSettings` replaces the whole VAT block instead of merging it, and
   * `TenantRules.validateVat` refuses a liable tenant without an accounting basis. The mask
   * used to send the block without that field — so a liable tenant could not be saved at all.
   */
  it('tenantPageSendsTheVatAccountingBasisTest', async () => {
    stored = liable()
    await render()

    await save()

    const vat = written[0].body.vat as Record<string, unknown>
    expect(vat.vatLiable).toBe(true)
    expect(vat.vatAccountingBasis).toBe('COLLECTED_CONSIDERATION')
    expect(vat.vatAccountingBasisFrom).toBe('2026-01-01')
  })

  /** «Vereinbarte Entgelte» is the default of MWSTG Art. 39 Abs. 1, not a guess of this mask. */
  it('tenantPageSendsTheDefaultVatAccountingBasisTest', async () => {
    stored = liable({ vat: { vatLiable: true, vatMethod: 'EFFECTIVE' } })
    await render()

    await save()

    const vat = written[0].body.vat as Record<string, unknown>
    expect(vat.vatAccountingBasis).toBe('AGREED_CONSIDERATION')
  })

  /**
   * The settled VAT period travels on the top level, exactly as `TenantDto` carries it.
   *
   * <p>Inside the VAT block it would be lost: that block is replaced wholesale on every save.
   */
  it('tenantPageSendsVatPeriodsLockedUntilOnTheTopLevelTest', async () => {
    stored = liable()
    await render()

    await save()

    expect(written[0].body.vatPeriodsLockedUntil).toBe('2026-06-30')
    const vat = written[0].body.vat as Record<string, unknown>
    expect(vat.vatPeriodsLockedUntil).toBeUndefined()
  })

  /** An empty field sends nothing, and nothing keeps the stored day (backend ADR-0113). */
  it('tenantPageKeepsVatPeriodsLockedUntilWhenEmptyTest', async () => {
    stored = liable({ vatPeriodsLockedUntil: undefined })
    await render()

    await save()

    expect(Object.keys(written[0].body)).not.toContain('vatPeriodsLockedUntil')
  })
})
