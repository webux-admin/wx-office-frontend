// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import { ACCOUNTING_RIGHTS, ACCOUNTING_SETTINGS_PATH } from '../lib/accounting'
import type { AccountingSettings } from '../lib/types'
import { AccountingStatePage } from './AccountingStatePage'

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
/** The session that may also look at the roles — only it is shown the rights hint. */
const WITH_ROLES = session([
  ACCOUNTING_RIGHTS.read,
  ACCOUNTING_RIGHTS.configure,
  'USER_READ',
])

const STORED: AccountingSettings = {
  ledgerCurrency: 'CHF',
  equityLayout: 'JURISTIC',
  profitAndLossForm: 'PRODUCTION',
}

const HINT = 'Keine Rolle dieses Mandanten trägt die Buchhaltungsrechte.'

let container: HTMLDivElement
let root: Root
/** What `GET /settings` answers; every test sets what it is about. */
let settings: AccountingSettings
/** What the role endpoint answers. Empty means: nobody may keep books yet. */
let roles: { permissions: string[] }[]
/** Every write the mask sent: address, method and body per request. */
let written: { url: string; method: string; body: Record<string, unknown> }[]
/** Every address the mask read, so a test can say what was *not* fetched. */
let read: string[]

function json(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

function stubFetch() {
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (method !== 'GET') {
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {}
      written.push({ url, method, body })
      settings = { ...settings, postingsLockedUntil: body.postingsLockedUntil ?? undefined }
      return json(settings)
    }
    read.push(url)
    if (url.endsWith('/roles')) return json(roles)
    return json(settings)
  })
}

beforeEach(() => {
  settings = { ...STORED }
  roles = []
  written = []
  read = []
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

async function render(auth: AuthState = CONFIGURE) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[ACCOUNTING_SETTINGS_PATH]}>
        <AuthContext.Provider value={auth}>
          <QueryClientProvider client={client}>
            <AccountingStatePage />
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

function button(text: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find((entry) =>
    entry.textContent?.includes(text),
  ) as HTMLButtonElement | undefined
}

function link(text: string): HTMLAnchorElement | undefined {
  return [...container.querySelectorAll('a')].find((entry) =>
    entry.textContent?.includes(text),
  ) as HTMLAnchorElement | undefined
}

/** Types into a field the way a person would, so React sees the change. */
async function type(label: string, value: string) {
  const input = field(label)
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

describe('AccountingStatePage', () => {
  it('rendersLedgerCurrencyTest', async () => {
    await render()

    expect(container.textContent).toContain('Buchführungswährung')
    expect(container.textContent).toContain('CHF')
    expect(container.textContent).toContain('Eingeschaltet')
    expect(link('Systemeinstellungen → Module')?.getAttribute('href')).toBe('/module')
  })

  /**
   * The state this screen exists for: a tenant that keeps its books in euros cannot keep them
   * here at all, and the explanation belongs on the screen rather than in a red error page.
   */
  it('rendersBlockerTest', async () => {
    settings = {
      blocker:
        'Die Buchhaltung führt derzeit nur Franken. Dieser Mandant rechnet in EUR. Nach OR '
        + 'Art. 958d Abs. 3 müsste die Jahresrechnung zusätzlich in Franken ausgewiesen und '
        + 'die Umrechnungskurse müssten im Anhang offengelegt werden; das baut diese Reihe '
        + 'nicht.',
    }
    await render(WITH_ROLES)

    expect(container.textContent).toContain('Dieser Mandant kann hier keine Bücher führen.')
    expect(container.textContent).toContain('OR Art. 958d Abs. 3')
    expect(link('Mandant → Grunddaten')?.getAttribute('href')).toBe(`/mandanten/${TENANT}`)
    // No field and no button — there is nothing to set while no books can be kept.
    expect(field('Gesperrt bis')).toBeUndefined()
    expect(button('Speichern')).toBeUndefined()
    // And no second warning beside it: two of them read as a broken mask.
    expect(container.textContent).not.toContain(HINT)
  })

  /**
   * The fourth case, and expressly not the third: a set reference pointing nowhere sends
   * somebody to a screen whose field is filled — they would conclude the software is lying.
   */
  it('rendersUnresolvableCurrencyBlockerTest', async () => {
    settings = {
      blocker:
        'Die hinterlegte Buchführungswährung dieses Mandanten lässt sich nicht auflösen — der '
        + 'Stammdateneintrag dazu fehlt. Bitte unter Mandant → Grunddaten neu auswählen.',
    }
    await render()

    expect(container.textContent).toContain('lässt sich nicht auflösen')
    expect(container.textContent).not.toContain('ist keine Buchführungswährung gesetzt')
    expect(field('Gesperrt bis')).toBeUndefined()
  })

  /** Reading the state is one right, moving the bolt is another (backend ADR-0119). */
  it('hidesSaveWithoutConfigureTest', async () => {
    settings = { ...STORED, postingsLockedUntil: '2026-12-31' }
    await render(READ_ONLY)

    expect(button('Speichern')).toBeUndefined()
    expect(field('Gesperrt bis')).toBeUndefined()
    // Shown all the same: whoever may read the state may read the date it is in.
    expect(container.textContent).toContain('31.12.2026')
  })

  it('savesTheLockDateTest', async () => {
    await render()

    await type('Gesperrt bis', '2026-12-31')
    await act(async () => {
      button('Speichern')?.click()
    })
    await settle()

    const put = written.find((entry) => entry.url.endsWith('/accounting/settings'))
    expect(put?.method).toBe('PUT')
    expect(put?.body).toEqual({ postingsLockedUntil: '2026-12-31' })
  })

  it('rendersMissingRightsHintTest', async () => {
    roles = [{ permissions: ['INVOICE_READ', 'PARTNER_READ'] }]
    await render(WITH_ROLES)

    expect(container.textContent).toContain(HINT)
    expect(link('Benutzer → Rollen')?.getAttribute('href')).toBe('/rollen')
  })

  /** Once somebody has assigned them the sentence never comes back. */
  it('hidesMissingRightsHintWhenARoleHasThemTest', async () => {
    roles = [{ permissions: ['INVOICE_READ'] }, { permissions: [ACCOUNTING_RIGHTS.post] }]
    await render(WITH_ROLES)

    expect(container.textContent).not.toContain(HINT)
    expect(container.textContent).toContain('CHF')
  })

  /**
   * Whoever may not read the roles cannot change them either, and a lock without a key only
   * produces a question. The roles are not even fetched.
   */
  it('hidesMissingRightsHintWithoutUserReadTest', async () => {
    await render(CONFIGURE)

    expect(container.textContent).not.toContain(HINT)
    expect(read.some((url) => url.endsWith('/roles'))).toBe(false)
  })
})
