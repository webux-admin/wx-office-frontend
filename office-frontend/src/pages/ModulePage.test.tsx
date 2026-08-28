// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import type { Tenant, TenantModule } from '../lib/types'
import { ModulePage } from './ModulePage'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1

/** How many times the screen asked the session to be read again. */
let refreshed: number

function session(permissions: string[], activeTenantId: number | null = TENANT): AuthState {
  return {
    user: {
      userId: 1,
      username: 'muster',
      activeTenantId,
      superuser: activeTenantId === null,
      tenants:
        activeTenantId === null
          ? []
          : [{ id: TENANT, code: 'WX', name: 'Webux', isDefault: true, modules: [] }],
      permissions,
    },
    loading: false,
    signIn: () => Promise.reject(new Error('nicht gebraucht')),
    signOut: () => Promise.resolve(),
    switchTenant: () => Promise.resolve(),
    refresh: () => {
      refreshed += 1
      return Promise.resolve()
    },
    can: (permission: string) => permissions.includes(permission),
  }
}

const BOTH = session(['TENANT_READ', 'TENANT_WRITE'])
const READ_ONLY = session(['TENANT_READ'])
const NOTHING = session([])

const TENANT_DATA: Tenant = {
  id: TENANT,
  code: 'WEBUX',
  active: true,
  name: 'Webux GmbH',
  address: { postalCode: '8001', town: 'Zürich', country: 'CH' },
  stocktakeReasonPercent: 12.5,
  stocktakeReasonMinimum: 3,
}

let container: HTMLDivElement
let root: Root
/** What the module endpoint answers; every test sets what it is about. */
let modules: TenantModule[]
/** Every write the mask sent: address, method and body per request. */
let written: { url: string; method: string; body: Record<string, unknown> }[]

function inventory(overrides: Partial<TenantModule> = {}): TenantModule {
  return {
    code: 'INVENTORY',
    label: 'Lager',
    description: 'Lagerorte, Bestand und Bewegungen.',
    active: false,
    ...overrides,
  }
}

function outbox(overrides: Partial<TenantModule> = {}): TenantModule {
  return {
    code: 'OUTBOX',
    label: 'Postausgang',
    description: 'E-Mail-Versand von Belegen, Mailkonto, Textvorlagen und Versandprotokoll.',
    active: false,
    ...overrides,
  }
}

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
  refreshed = 0
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (method !== 'GET') {
      written.push({
        url,
        method,
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : {},
      })
      return url.includes('/modules') ? json(modules) : json(TENANT_DATA)
    }
    if (url.includes('/modules')) return json(modules)
    if (url.endsWith(`/api/tenants/${TENANT}`)) return json(TENANT_DATA)
    return json([])
  })
}

beforeEach(() => {
  modules = [inventory()]
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

async function render(auth: AuthState = BOTH) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/module']}>
        <AuthContext.Provider value={auth}>
          <QueryClientProvider client={client}>
            <ModulePage />
          </QueryClientProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
  })
  await settle()
}

/** The checkbox the given label points at, or undefined while the mask does not show it. */
function box(label: string): HTMLInputElement | undefined {
  const caption = [...container.querySelectorAll('label')].find(
    (entry) => entry.textContent === label,
  )
  if (!caption) return undefined
  return (document.getElementById(caption.htmlFor) as HTMLInputElement | null) ?? undefined
}

function button(text: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find(
    (entry) => entry.textContent === text,
  ) as HTMLButtonElement | undefined
}

async function click(element: HTMLElement | undefined) {
  expect(element).toBeDefined()
  await act(async () => {
    element?.click()
  })
  await settle()
}

/**
 * Clicks a checkbox the way a person would.
 *
 * <p>`click()` and not setting `checked`: React tracks the value of an input, and a value set
 * from outside never reaches its `onChange`.
 */
async function toggle(label: string, checked: boolean) {
  const input = box(label)
  expect(input).toBeDefined()
  expect(input?.checked).toBe(!checked)
  await click(input)
}

describe('ModulePage', () => {
  it('modulePageListsModulesTest', async () => {
    // A switched off module is listed too. Hiding it would hide the way to switch it on.
    await render()

    expect(box('Lager verwenden')?.checked).toBe(false)
    expect(container.textContent).toContain('Lagerorte, Bestand und Bewegungen.')
  })

  it('modulePageSwitchesAModuleOnTest', async () => {
    await render()
    expect(button('Speichern')?.disabled).toBe(true)

    await toggle('Lager verwenden', true)
    expect(button('Speichern')?.disabled).toBe(false)
    await click(button('Speichern'))

    const put = written.find((entry) => entry.url.includes('/modules'))
    expect(put?.method).toBe('PUT')
    expect(put?.body.modules).toEqual([{ code: 'INVENTORY', active: true }])
  })

  it('modulePageListsEveryModuleTest', async () => {
    // The screen was built for one module and had never seen a second one. Since the outbox
    // became switchable there are two, and there will be more (ADR-0086).
    modules = [inventory(), outbox({ active: true })]
    await render()

    expect(box('Lager verwenden')?.checked).toBe(false)
    expect(box('Postausgang verwenden')?.checked).toBe(true)
    expect(container.textContent).toContain('Textvorlagen und Versandprotokoll')
  })

  it('modulePageSendsOnlyWhatChangedTest', async () => {
    // The payload names changes, not the whole state: a module the payload is silent about
    // keeps what it had. Switching one module must therefore not carry the other along.
    modules = [inventory(), outbox()]
    await render()

    await toggle('Postausgang verwenden', true)
    await click(button('Speichern'))

    const put = written.find((entry) => entry.url.includes('/modules'))
    expect(put?.body.modules).toEqual([{ code: 'OUTBOX', active: true }])
  })

  it('modulePageWarnsAboutTheModuleBeingSwitchedOffTest', async () => {
    // The consequence used to be a fixed paragraph about delivery notes and stock, written
    // when the stock was the only switchable module. Switching the outbox off warned about
    // the stock.
    modules = [
      inventory({ active: true, usage: '142 Bewegungen' }),
      outbox({ active: true, usage: '1284 gesendete Nachrichten, 2 wartende' }),
    ]
    await render()

    await toggle('Postausgang verwenden', false)

    expect(container.textContent).toContain('1284 gesendete Nachrichten, 2 wartende')
    expect(container.textContent).toContain('nicht mehr per E-Mail versenden')
    expect(container.textContent).not.toContain('der Bestand läuft auseinander')
  })

  it('modulePageWarnsAboutTheStockWhenTheStockGoesOffTest', async () => {
    modules = [inventory({ active: true, usage: '142 Bewegungen' }), outbox({ active: true })]
    await render()

    await toggle('Lager verwenden', false)

    expect(container.textContent).toContain('der Bestand läuft auseinander')
    expect(container.textContent).not.toContain('nicht mehr per E-Mail versenden')
  })

  it('modulePageWarnsNeutrallyForAModuleWithoutASentenceTest', async () => {
    // A module the screen has never heard of gets the neutral sentence, never the one of
    // whichever module happens to be listed first.
    modules = [outbox({ code: 'PROJECT', label: 'Projekte', active: true, usage: '7 Projekte' })]
    await render()

    await toggle('Projekte verwenden', false)

    expect(container.textContent).toContain('Was im Modul liegt, bleibt erhalten')
  })

  it('modulePageRefreshesTheSessionAfterSavingTest', async () => {
    // Sidebar and overview read the module list off the session. Without this they keep
    // showing the old state until somebody reloads the page.
    await render()
    await toggle('Lager verwenden', true)

    await click(button('Speichern'))

    expect(refreshed).toBe(1)
  })

  it('modulePageAsksBeforeSwitchingOffWithDataTest', async () => {
    modules = [inventory({ active: true, usage: '142 Bewegungen, 3 offene Reservierungen' })]
    await render()

    await toggle('Lager verwenden', false)

    expect(container.textContent).toContain('142 Bewegungen, 3 offene Reservierungen')
    await click(button('Abbrechen'))
    expect(written).toHaveLength(0)
    expect(button('Speichern')?.disabled).toBe(true)
  })

  it('modulePageSwitchesOffAfterConfirmingTest', async () => {
    modules = [inventory({ active: true, usage: '142 Bewegungen' })]
    await render()
    await toggle('Lager verwenden', false)

    await click(button('Abschalten'))
    await click(button('Speichern'))

    const put = written.find((entry) => entry.url.includes('/modules'))
    expect(put?.body.modules).toEqual([{ code: 'INVENTORY', active: false }])
  })

  /** Nothing lies in the module, so there is nothing to warn about. */
  it('modulePageSwitchesOffWithoutDataWithoutAskingTest', async () => {
    modules = [inventory({ active: true })]
    await render()

    await toggle('Lager verwenden', false)

    expect(button('Abschalten')).toBeUndefined()
    expect(button('Speichern')?.disabled).toBe(false)
  })

  it('modulePageShowsStocktakeThresholdsWithTheInventoryTest', async () => {
    // The two thresholds moved here with the switch they belong to (ADR-0074).
    modules = [inventory({ active: true })]
    await render()

    expect(box('Begründungspflicht ab')?.value).toBe('12.5')
    expect(box('Untergrenze der Begründungspflicht')?.value).toBe('3')
  })

  it('modulePageHidesStocktakeThresholdsWithoutTheInventoryTest', async () => {
    await render()

    expect(box('Begründungspflicht ab')).toBeUndefined()
  })

  it('modulePageWithoutWritePermissionTest', async () => {
    await render(READ_ONLY)

    expect(box('Lager verwenden')?.disabled).toBe(true)
    expect(button('Speichern')).toBeUndefined()
  })

  it('modulePageForbiddenTest', async () => {
    await render(NOTHING)

    expect(box('Lager verwenden')).toBeUndefined()
    expect(container.textContent).toContain('Recht')
  })

  it('modulePageWithoutTenantTest', async () => {
    // A superuser who has not chosen a tenant would otherwise build /api/tenants/null/modules.
    await render(session(['TENANT_READ', 'TENANT_WRITE'], null))

    expect(box('Lager verwenden')).toBeUndefined()
    expect(
      written.concat([]).length +
        [...container.querySelectorAll('input')].filter((entry) => entry.type === 'checkbox')
          .length,
    ).toBe(0)
  })
})
