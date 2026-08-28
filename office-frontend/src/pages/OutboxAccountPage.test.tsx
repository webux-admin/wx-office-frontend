// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import { OUTBOX_ACCOUNT_PATH, OUTBOX_RIGHTS } from '../lib/outbox'
import type { MailAccount } from '../lib/types'
import { OutboxAccountPage } from './OutboxAccountPage'

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
        { id: TENANT, code: 'WX', name: 'Webux', isDefault: true, modules: ['OUTBOX'] },
      ],
      permissions,
    },
    loading: false,
    signIn: () => Promise.reject(new Error('nicht gebraucht')),
    signOut: () => Promise.resolve(),
    switchTenant: () => Promise.resolve(),
    refresh: () => Promise.resolve(),
    can: (permission: string) => permissions.includes(permission),
  }
}

const BOTH = session([OUTBOX_RIGHTS.read, OUTBOX_RIGHTS.configure])
const READ_ONLY = session([OUTBOX_RIGHTS.read])

const STORED: MailAccount = {
  authKind: 'SMTP_PASSWORD',
  host: 'smtp.webux.ch',
  port: 587,
  security: 'STARTTLS',
  username: 'rechnung@webux.ch',
  senderAddress: 'rechnung@webux.ch',
  senderName: 'Webux GmbH',
  active: true,
  passwordSet: true,
}

let container: HTMLDivElement
let root: Root
/** What the account endpoint answers; `null` means «this tenant has none yet» (404). */
let account: MailAccount | null
/** What the connection test answers, or the status it fails with. */
let testResult: { status: number; body: unknown }
/** Every write the mask sent: address, method and body per request. */
let written: { url: string; method: string; body: Record<string, unknown> }[]

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

function stubFetch() {
  written = []
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (method === 'POST' && url.endsWith('/test')) {
      return json(testResult.body, testResult.status)
    }
    if (method !== 'GET') {
      written.push({
        url,
        method,
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : {},
      })
      return json(STORED)
    }
    // The backend answers 404 for a tenant without an account. The mask has to read that as
    // «none yet» rather than as a failure.
    return account === null ? json({ detail: 'Nicht gefunden.' }, 404) : json(account)
  })
}

beforeEach(() => {
  account = STORED
  testResult = { status: 200, body: { message: 'Verbindung zu smtp.webux.ch steht' } }
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
      <MemoryRouter initialEntries={[OUTBOX_ACCOUNT_PATH]}>
        <AuthContext.Provider value={auth}>
          <QueryClientProvider client={client}>
            <OutboxAccountPage />
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

async function click(element: HTMLElement | undefined) {
  expect(element).toBeDefined()
  await act(async () => {
    element?.click()
  })
  await settle()
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

describe('OutboxAccountPage', () => {
  it('outboxAccountPageShowsTheStoredAccountTest', async () => {
    await render()

    expect(field('Server')?.value).toBe('smtp.webux.ch')
    expect(field('Port')?.value).toBe('587')
    expect(field('Absenderadresse')?.value).toBe('rechnung@webux.ch')
  })

  /**
   * The one thing this mask must not get wrong: the backend hands the password out nowhere, so
   * saving without typing one has to leave it alone. A payload carrying an empty password
   * would empty the account of whoever only changed the port.
   */
  it('outboxAccountPageSavesWithoutSendingAPasswordTest', async () => {
    await render()

    await type('Port', '25')
    await click(button('Speichern'))

    const put = written.find((entry) => entry.method === 'PUT')
    expect(put?.body.port).toBe(25)
    expect('password' in (put?.body ?? {})).toBe(false)
  })

  it('outboxAccountPageSaysThatAPasswordIsStoredTest', async () => {
    await render()

    expect(field('Passwort')?.placeholder).toBe('••••••••, gespeichert')
    expect(field('Passwort')?.value).toBe('')
    expect(container.textContent).toContain('Leer lassen heisst: unverändert.')
  })

  it('outboxAccountPageSendsATypedPasswordTest', async () => {
    await render()

    await type('Passwort', 'ein-langes-passwort')
    await click(button('Speichern'))

    expect(written.find((entry) => entry.method === 'PUT')?.body.password).toBe(
      'ein-langes-passwort',
    )
  })

  /** A tenant without an account gets 404, and that is where every tenant starts. */
  it('outboxAccountPageOpensEmptyWithoutAnAccountTest', async () => {
    account = null
    await render()

    expect(field('Server')?.value).toBe('')
    expect(field('Port')?.value).toBe('587')
    expect(container.textContent).not.toContain('Nicht gefunden')
    expect(button('Verbindung prüfen')?.disabled).toBe(true)
  })

  it('outboxAccountPageShowsASuccessfulConnectionTestTest', async () => {
    await render()

    await click(button('Verbindung prüfen'))

    expect(container.textContent).toContain('Verbindung zu smtp.webux.ch steht')
  })

  it('outboxAccountPageShowsAFailedConnectionTestTest', async () => {
    testResult = {
      status: 400,
      body: { detail: 'Der Mailserver hat die Anmeldung abgelehnt' },
    }
    await render()

    await click(button('Verbindung prüfen'))

    expect(container.textContent).toContain('Der Mailserver hat die Anmeldung abgelehnt')
  })

  /**
   * Reading is one right, changing is another. Without the second the mask still opens — the
   * settings are worth looking at — but nothing in it can be touched.
   */
  it('outboxAccountPageLocksEveryFieldWithoutTheRightTest', async () => {
    await render(READ_ONLY)

    expect(field('Server')?.disabled).toBe(true)
    expect(field('Passwort')?.disabled).toBe(true)
    expect(field('Absenderadresse')?.disabled).toBe(true)
    expect(button('Speichern')).toBeUndefined()
    expect(button('Verbindung prüfen')).toBeUndefined()
    expect(container.textContent).toContain('Postausgang einrichten')
  })

  /** The test signs in with the stored password, which the open form does not carry. */
  it('outboxAccountPageSaysTheTestUsesTheStoredAccountTest', async () => {
    await render()

    await type('Port', '25')

    expect(container.textContent).toContain('nicht die offenen Änderungen')
  })
})
