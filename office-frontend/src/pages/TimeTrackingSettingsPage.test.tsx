// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import type { TimeBillingSettings, TimeServiceChoice, TimeUserDefault } from '../lib/types'
import { TimeTrackingSettingsPage } from './TimeTrackingSettingsPage'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1
const DEFAULTS_URL = '/api/tenants/1/time-tracking/user-defaults'
const SETTINGS_URL = '/api/tenants/1/time-tracking/settings'

const SENIOR: TimeServiceChoice = { productId: 31, productNumber: 'L-001', name: 'Beratung Senior' }
const JUNIOR: TimeServiceChoice = { productId: 32, productNumber: 'L-002', name: 'Beratung Junior' }

const ANNA: TimeUserDefault = {
  userId: 41,
  userName: 'Anna Muster',
  userActive: true,
  productId: 31,
  productNumber: 'L-001',
  serviceName: 'Beratung Senior',
  serviceActive: true,
}
const BEAT: TimeUserDefault = { userId: 42, userName: 'Beat Keller', userActive: true, serviceActive: false }
const CARLA: TimeUserDefault = {
  userId: 43,
  userName: 'Carla Frei',
  userActive: false,
  productId: 33,
  productNumber: 'L-003',
  serviceName: 'Workshop',
  serviceActive: false,
}

function session(permissions = ['TIME_WRITE'], modules = ['TIMETRACKING']): AuthState {
  return {
    user: {
      userId: 41,
      username: 'anna',
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
let requests: { method: string; url: string; body: unknown }[]
let rows: TimeUserDefault[]
let readFails: boolean
/** What the next write answers instead of success, once. */
let refusal: { status: number; body: unknown } | null
/** The billing increment as the backend holds it. */
let increment: TimeBillingSettings
let incrementFails: boolean

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  )
}

beforeEach(() => {
  requests = []
  rows = [ANNA, BEAT, CARLA]
  readFails = false
  refusal = null
  increment = { billingIncrementMinutes: 15, changedAt: '2026-11-20T09:30:00Z', changedBy: 'admin' }
  incrementFails = false
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    requests.push({ method, url, body })
    if (url === SETTINGS_URL) {
      if (method === 'GET') {
        return incrementFails ? json({ detail: 'Der Takt lässt sich nicht lesen.' }, 500) : json(increment)
      }
      if (refusal !== null) {
        const { status, body: answer } = refusal
        refusal = null
        return json(answer, status)
      }
      increment = { billingIncrementMinutes: body.billingIncrementMinutes, changedAt: '2026-11-24T10:00:00Z', changedBy: 'anna' }
      return json(increment)
    }
    if (method === 'PUT') {
      if (refusal !== null) {
        const { status, body: answer } = refusal
        refusal = null
        return json(answer, status)
      }
      const userId = Number(url.split('/').at(-1))
      const service = [SENIOR, JUNIOR].find((entry) => entry.productId === body.productId)
      const row = rows.find((entry) => entry.userId === userId) ?? BEAT
      return json({
        userId,
        userName: row.userName,
        userActive: row.userActive,
        productId: service?.productId ?? null,
        productNumber: service?.productNumber ?? null,
        serviceName: service?.name ?? null,
        serviceActive: service !== undefined,
      })
    }
    if (url === DEFAULTS_URL) {
      return readFails ? json({ detail: 'Das Backend meldet einen Fehler.' }, 500) : json(rows)
    }
    if (url.startsWith('/api/tenants/1/time-entries/lookups/services')) return json([SENIOR, JUNIOR])
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

async function settle(ms = 30) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms))
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function render(auth: AuthState = session()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/zeiterfassung-einstellungen']}>
        <AuthContext.Provider value={auth}>
          <QueryClientProvider client={client}>
            <TimeTrackingSettingsPage />
          </QueryClientProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
  })
  await settle()
}

const text = () => document.body.textContent ?? ''
const writes = () => requests.filter((request) => request.method !== 'GET')

function row(name: string): HTMLElement {
  const found = [...container.querySelectorAll('tbody tr')].find((entry) =>
    entry.textContent?.includes(name),
  )
  if (found === undefined) throw new Error(`no row ${name}`)
  return found as HTMLElement
}

async function click(element: Element | null | undefined) {
  if (!element) throw new Error('nothing to click')
  await act(async () => {
    ;(element as HTMLElement).click()
  })
  await settle()
}

function byLabel(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll('button')].find(
    (entry) => entry.getAttribute('aria-label') === label || entry.textContent?.trim() === label,
  )
}

function control(label: string): HTMLInputElement {
  const caption = [...document.querySelectorAll('label')].find((entry) => entry.textContent === label)
  const found = caption ? document.getElementById(caption.htmlFor) : null
  if (found === null) throw new Error(`no field labelled ${label}`)
  return found as HTMLInputElement
}

async function type(input: HTMLInputElement, value: string, wait = 0) {
  await act(async () => {
    input.focus()
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await settle(wait)
}

/** The «Speichern» in the foot of the dialog. */
const saveButton = () =>
  [...document.querySelectorAll('[role="dialog"] button')].find(
    (entry) => entry.textContent?.trim() === 'Speichern',
  )

describe('TimeTrackingSettingsPage', () => {
  /** Every user with their default, and what has become of it. */
  it('timeTrackingSettingsPageListsTheUsersTest', async () => {
    await render()

    expect(container.querySelector('h1')?.textContent).toBe('Zeiterfassung')
    expect(text()).toContain('Standardleistung je Benutzer')
    expect(row('Anna Muster').textContent).toContain('L-001')
    expect(row('Anna Muster').textContent).toContain('Beratung Senior')
    expect(row('Beat Keller').textContent).toContain('Keine')
    expect(row('Carla Frei').textContent).toContain('Deaktiviert')
    expect(row('Carla Frei').textContent).toContain('wird nicht mehr vorgeschlagen')
  })

  /** A user without a default gets «Festlegen» and nothing to remove. */
  it('timeTrackingSettingsPageOffersWhatEachRowCanTest', async () => {
    await render()

    expect(byLabel('Standardleistung von Beat Keller festlegen')).toBeDefined()
    expect(byLabel('Standardleistung von Beat Keller entfernen')).toBeUndefined()
    expect(byLabel('Standardleistung von Anna Muster ändern')).toBeDefined()
    expect(byLabel('Standardleistung von Anna Muster entfernen')).toBeDefined()
  })

  /** A service from the quick search, saved for that one user. */
  it('timeTrackingSettingsPageSetsADefaultTest', async () => {
    await render()

    await click(byLabel('Standardleistung von Beat Keller festlegen'))
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      'Standardleistung von Beat Keller',
    )
    await type(control('Standardleistung'), 'junior', 260)
    await click(
      [...document.querySelectorAll('[role="option"]')].find((option) =>
        option.textContent?.includes('Beratung Junior'),
      ),
    )
    await click(saveButton())

    expect(writes()).toEqual([{ method: 'PUT', url: `${DEFAULTS_URL}/42`, body: { productId: 32 } }])
    expect(row('Beat Keller').textContent).toContain('Beratung Junior')
    expect(text()).toContain('Standardleistung von Beat Keller: Beratung Junior.')
  })

  /** Removing needs no dialog: `productId: null` and the row says «Keine». */
  it('timeTrackingSettingsPageRemovesADefaultTest', async () => {
    await render()

    await click(byLabel('Standardleistung von Anna Muster entfernen'))

    expect(writes()).toEqual([{ method: 'PUT', url: `${DEFAULTS_URL}/41`, body: { productId: null } }])
    expect(row('Anna Muster').textContent).toContain('Keine')
    expect(text()).toContain('Standardleistung von Anna Muster entfernt.')
  })

  /** A name typed and never taken is no service; nothing is sent. */
  it('timeTrackingSettingsPageAsksForAServiceTest', async () => {
    await render()

    await click(byLabel('Standardleistung von Beat Keller festlegen'))
    await click(saveButton())

    expect(writes()).toEqual([])
    expect(text()).toContain('Eine Leistung aus der Liste wählen.')
  })

  /** A refusal at the service stands at the field. */
  it('timeTrackingSettingsPageShowsARefusedServiceAtTheFieldTest', async () => {
    await render()
    refusal = {
      status: 400,
      body: {
        detail: 'Beratung Junior ist deaktiviert.',
        errors: [{ field: 'productId', message: 'Beratung Junior ist deaktiviert.' }],
      },
    }

    await click(byLabel('Standardleistung von Beat Keller festlegen'))
    await type(control('Standardleistung'), 'junior', 260)
    await click(
      [...document.querySelectorAll('[role="option"]')].find((option) =>
        option.textContent?.includes('Beratung Junior'),
      ),
    )
    await click(saveButton())

    expect(control('Standardleistung').getAttribute('aria-invalid')).toBe('true')
    expect(text()).toContain('Beratung Junior ist deaktiviert.')
    expect(document.querySelector('[role="dialog"] [role="alert"]')).toBeNull()
  })

  /** A refusal of the removal names no field and stands above the table. */
  it('timeTrackingSettingsPageShowsARefusedRemovalTest', async () => {
    await render()
    refusal = {
      status: 409,
      body: { detail: 'Die Standardleistung von Anna Muster wurde gleichzeitig geändert. Neu laden und die Änderung wiederholen.' },
    }

    await click(byLabel('Standardleistung von Anna Muster entfernen'))

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'wurde gleichzeitig geändert',
    )
  })

  it('timeTrackingSettingsPageWhenTheTableCannotBeReadTest', async () => {
    readFails = true

    await render()

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Das Backend meldet einen Fehler.',
    )
  })

  it('timeTrackingSettingsPageWithoutUsersTest', async () => {
    rows = []

    await render()

    expect(text()).toContain('Keine Benutzer')
  })

  /** TIME_READ is not enough: keeping the defaults is keeping the times of others. */
  it('timeTrackingSettingsPageWithoutTheWriteRightTest', async () => {
    await render(session(['TIME_TRACK', 'TIME_READ']))

    expect(text()).toContain('Keine Berechtigung')
    expect(requests).toEqual([])
  })

  it('timeTrackingSettingsPageWithTheModuleOffTest', async () => {
    await render(session(['TIME_WRITE'], ['PROJECT']))

    expect(text()).toContain('Modul nicht eingeschaltet')
    expect(requests).toEqual([])
  })

  // --- the billing increment (#127, backend ADR-0163) ------------------------------

  const incrementField = () => control('Abrechnungstakt') as unknown as HTMLSelectElement
  /** The «Speichern» of the increment, which stands outside any dialog. */
  const saveIncrement = () =>
    [...container.querySelectorAll('section button')].find(
      (entry) => entry.textContent?.trim() === 'Speichern',
    )

  async function chooseIncrement(value: string) {
    await act(async () => {
      const select = incrementField()
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(select, value)
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await settle()
  }

  /** The increment as stored, the six choices, and the sentence of the issue. */
  it('timeTrackingSettingsPageShowsTheIncrementTest', async () => {
    await render()

    expect(incrementField().value).toBe('15')
    expect([...incrementField().options].map((option) => option.textContent)).toEqual([
      'kein Takt',
      '5 Minuten',
      '6 Minuten',
      '10 Minuten',
      '15 Minuten',
      '30 Minuten',
    ])
    expect(text()).toContain('Gerundet wird nur die Menge auf der Rechnung, die erfasste Zeit bleibt.')
    expect(text()).toContain('von admin')
    expect((saveIncrement() as HTMLButtonElement).disabled).toBe(true)
  })

  it('timeTrackingSettingsPageSavesTheIncrementTest', async () => {
    await render()

    await chooseIncrement('6')
    await click(saveIncrement())

    expect(writes()).toEqual([
      { method: 'PUT', url: SETTINGS_URL, body: { billingIncrementMinutes: 6 } },
    ])
    expect(incrementField().value).toBe('6')
    expect(text()).toContain('Abrechnungstakt gespeichert: 6 Minuten.')
  })

  /** No increment is 1, as the backend spells it. */
  it('timeTrackingSettingsPageSavesNoIncrementTest', async () => {
    await render()

    await chooseIncrement('1')
    await click(saveIncrement())

    expect(writes()).toEqual([
      { method: 'PUT', url: SETTINGS_URL, body: { billingIncrementMinutes: 1 } },
    ])
    expect(text()).toContain('Abrechnungstakt gespeichert: kein Takt.')
  })

  /** An increment nobody saved yet is 1, and the page says no more about it. */
  it('timeTrackingSettingsPageWithAnIncrementNeverSavedTest', async () => {
    increment = { billingIncrementMinutes: 1 }

    await render()

    expect(incrementField().value).toBe('1')
    expect(text()).not.toContain('Geändert')
  })

  it('timeTrackingSettingsPageShowsARefusedIncrementAtTheFieldTest', async () => {
    await render()
    refusal = {
      status: 400,
      body: {
        detail: 'Der Abrechnungstakt 7 gibt es nicht.',
        errors: [{ field: 'billingIncrementMinutes', message: 'Der Abrechnungstakt 7 gibt es nicht.' }],
      },
    }

    await chooseIncrement('30')
    await click(saveIncrement())

    expect(incrementField().getAttribute('aria-invalid')).toBe('true')
    expect(text()).toContain('Der Abrechnungstakt 7 gibt es nicht.')
  })

  it('timeTrackingSettingsPageWhenTheIncrementCannotBeReadTest', async () => {
    incrementFails = true

    await render()

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Der Takt lässt sich nicht lesen.',
    )
    expect(text()).toContain('Standardleistung je Benutzer')
  })
})
