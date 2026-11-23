// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../../auth/authContext'
import type { PermissionCatalogue, TenantAccess, User, UserAccess } from '../../lib/types'
import { UserAccessPanel } from './UserAccessPanel'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT: TenantAccess = { id: 1, code: 'WX', name: 'Webux', isDefault: true, modules: [] }

const USER: User = {
  id: 42,
  username: 'anna',
  email: 'anna@example.ch',
  displayName: 'Anna Muster',
  active: true,
  superuser: false,
  locked: false,
}

const RIGHTS = ['USER_READ', 'USER_WRITE']

const SESSION: AuthState = {
  user: {
    userId: 1,
    username: 'admin',
    activeTenantId: TENANT.id,
    superuser: false,
    tenants: [TENANT],
    permissions: RIGHTS,
  },
  loading: false,
  signIn: () => Promise.reject(new Error('nicht gebraucht')),
  completeSecondFactor: () => Promise.reject(new Error('nicht gebraucht')),
  sendSecondFactorCode: () => Promise.resolve(),
  adoptSession: () => {},
  signOut: () => Promise.resolve(),
  switchTenant: () => Promise.resolve(),
  refresh: () => Promise.resolve(),
  can: (permission: string) => RIGHTS.includes(permission),
}

const CATALOGUE: PermissionCatalogue = {
  INVOICE: ['INVOICE_READ', 'INVOICE_WRITE'],
  TIMETRACKING: ['TIME_TRACK', 'TIME_READ', 'TIME_WRITE', 'TIME_BILL'],
}

const ACCESS: UserAccess = {
  userId: USER.id,
  tenantId: TENANT.id,
  roleIds: [],
  directPermissions: [],
  effectivePermissions: [],
}

let container: HTMLDivElement
let root: Root

function json(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

beforeEach(() => {
  vi.stubGlobal('fetch', (url: string) => {
    if (url.endsWith('/roles/permissions')) return json(CATALOGUE)
    if (url.endsWith('/roles')) return json([])
    if (url.startsWith('/api/users?')) return json([USER])
    return json(ACCESS)
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

async function render() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <MemoryRouter>
        <AuthContext.Provider value={SESSION}>
          <QueryClientProvider client={client}>
            <UserAccessPanel user={USER} tenants={[TENANT]} />
          </QueryClientProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
  })
  await settle()
}

/** The checkboxes of one module of the extra rights, by the label each one carries. */
function boxesOf(heading: string): Map<string, HTMLInputElement> {
  const title = [...container.querySelectorAll('fieldset p')].find(
    (entry) => entry.textContent === heading,
  )
  const boxes = new Map<string, HTMLInputElement>()
  for (const caption of title?.parentElement?.querySelectorAll('label') ?? []) {
    const input = document.getElementById(caption.htmlFor) as HTMLInputElement | null
    if (input) boxes.set(caption.textContent ?? '', input)
  }
  return boxes
}

/** The line a checkbox points at with `aria-describedby`, the way a screen reader reads it. */
function lineOf(input: HTMLInputElement | undefined): string | undefined {
  const id = input?.getAttribute('aria-describedby')
  if (!id) return undefined
  return document.getElementById(id)?.textContent ?? undefined
}

describe('UserAccessPanel', () => {
  /**
   * A right granted to one person directly is still a right over the times of everybody: the
   * extra rights explain it the way the role mask does (backend ADR-0159).
   */
  it('userAccessPanelExplainsTheTimeRightsTest', async () => {
    await render()

    const boxes = boxesOf('Zeiterfassung')

    expect([...boxes.keys()]).toEqual(['Erfassen', 'Lesen', 'Bearbeiten', 'Abrechnen'])
    expect(lineOf(boxes.get('Lesen'))).toBe(
      'Die Zeiten aller Benutzer lesen, auswerten und exportieren.',
    )
    expect(lineOf(boxes.get('Abrechnen'))).toContain('nur zusammen mit «Rechnungen: Bearbeiten»')
  })

  it('userAccessPanelShowsNoLineUnderTheOtherRightsTest', async () => {
    await render()

    expect(lineOf(boxesOf('Rechnungen').get('Lesen'))).toBeUndefined()
    expect(lineOf(boxesOf('Rechnungen').get('Bearbeiten'))).toBeUndefined()
  })
})
