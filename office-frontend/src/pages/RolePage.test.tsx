// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import type { PermissionCatalogue, Role } from '../lib/types'
import { RolePage } from './RolePage'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1

const RIGHTS = ['USER_READ', 'ROLE_MANAGE']

const SESSION: AuthState = {
  user: {
    userId: 1,
    username: 'admin',
    activeTenantId: TENANT,
    superuser: false,
    tenants: [{ id: TENANT, code: 'WX', name: 'Webux', isDefault: true, modules: [] }],
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

/**
 * The catalogue as `/roles/permissions` groups it, cut down to the new group and its
 * neighbours — the backend lists the time tracking between the run and the users.
 */
const CATALOGUE: PermissionCatalogue = {
  INVOICE: ['INVOICE_READ', 'INVOICE_WRITE'],
  SUBSCRIPTION: ['SUBSCRIPTION_READ', 'SUBSCRIPTION_RUN'],
  TIMETRACKING: ['TIME_TRACK', 'TIME_READ', 'TIME_WRITE', 'TIME_BILL'],
  USER: ['USER_READ', 'USER_WRITE'],
}

function role(overrides: Partial<Role> = {}): Role {
  return {
    id: 3,
    tenantId: TENANT,
    name: 'Verkauf',
    description: 'Erfasst Kunden, Offerten, Aufträge und Rechnungen.',
    deletable: false,
    permissions: ['INVOICE_READ', 'INVOICE_WRITE', 'TIME_TRACK', 'TIME_READ', 'TIME_BILL'],
    ...overrides,
  }
}

let container: HTMLDivElement
let root: Root
/** What the role list answers. */
let roles: Role[]
/** Every write the mask sent: address, method and body per request. */
let written: { url: string; method: string; body: Record<string, unknown> }[]

function json(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

beforeEach(() => {
  roles = [role()]
  written = []
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (method !== 'GET') {
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {}
      written.push({ url, method, body })
      return json(role({ id: 9, ...body }))
    }
    if (url.endsWith('/roles/permissions')) return json(CATALOGUE)
    return json(roles)
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
      <MemoryRouter initialEntries={['/rollen']}>
        <AuthContext.Provider value={SESSION}>
          <QueryClientProvider client={client}>
            <RolePage />
          </QueryClientProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
  })
  await settle()
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

/** The box of one module in the permission matrix, found by its heading. */
function group(heading: string): HTMLElement {
  const found = button(heading)?.parentElement
  if (!found) throw new Error(`no group headed ${heading}`)
  return found
}

/** The checkboxes of a group, by the label each one carries. */
function boxesOf(heading: string): Map<string, HTMLInputElement> {
  const boxes = new Map<string, HTMLInputElement>()
  for (const caption of group(heading).querySelectorAll('label')) {
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

async function type(label: string, value: string) {
  const caption = [...container.querySelectorAll('label')].find(
    (entry) => entry.textContent === label,
  )
  const input = caption ? (document.getElementById(caption.htmlFor) as HTMLInputElement) : null
  expect(input).not.toBeNull()
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set?.call(
      input,
      value,
    )
    input?.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await settle()
}

describe('RolePage', () => {
  it('rolePageShowsTheTimeTrackingGroupTest', async () => {
    await render()
    await click(button('Rolle'))

    const boxes = boxesOf('Zeiterfassung')

    expect([...boxes.keys()]).toEqual(['Erfassen', 'Lesen', 'Bearbeiten', 'Abrechnen'])
    expect(lineOf(boxes.get('Erfassen'))).toBe(
      'Eigene Zeiten erfassen, ändern und löschen, mit eigener Stoppuhr.',
    )
    expect(lineOf(boxes.get('Lesen'))).toBe(
      'Die Zeiten aller Benutzer lesen, auswerten und exportieren.',
    )
    expect(lineOf(boxes.get('Bearbeiten'))).toContain('Zeiten anderer erfassen und ändern')
    expect(lineOf(boxes.get('Abrechnen'))).toContain('nur zusammen mit «Rechnungen: Bearbeiten»')
  })

  it('rolePageShowsTheTimeTrackingBetweenTheRunAndTheUsersTest', async () => {
    // The matrix keeps the order the backend sends: the new group neither jumps to the top
    // nor sinks below the users.
    await render()
    await click(button('Rolle'))

    const headings = [...container.querySelectorAll('fieldset button')].map(
      (entry) => entry.textContent,
    )

    expect(headings).toEqual(['Rechnungen', 'Abo-Lauf', 'Zeiterfassung', 'Benutzer'])
  })

  it('rolePageShowsNoLineUnderTheOtherRightsTest', async () => {
    // A verb that says it all keeps its box as short as before.
    await render()
    await click(button('Rolle'))

    expect(lineOf(boxesOf('Rechnungen').get('Lesen'))).toBeUndefined()
    expect(lineOf(boxesOf('Benutzer').get('Bearbeiten'))).toBeUndefined()
  })

  it('rolePageTicksTheTimeRightsOfAStoredRoleTest', async () => {
    await render()
    await click(button('Verkauf'))

    const boxes = boxesOf('Zeiterfassung')

    expect(boxes.get('Erfassen')?.checked).toBe(true)
    expect(boxes.get('Lesen')?.checked).toBe(true)
    expect(boxes.get('Abrechnen')?.checked).toBe(true)
    expect(boxes.get('Bearbeiten')?.checked).toBe(false)
  })

  it('rolePageGrantsTheWholeTimeTrackingGroupAtOnceTest', async () => {
    await render()
    await click(button('Rolle'))
    await type('Name', 'Projektleitung')

    await click(button('Zeiterfassung'))
    await click(button('Speichern'))

    const post = written.find((entry) => entry.method === 'POST')
    expect(post?.url).toBe(`/api/tenants/${TENANT}/roles`)
    expect(post?.body.name).toBe('Projektleitung')
    expect(post?.body.permissions).toEqual(['TIME_TRACK', 'TIME_READ', 'TIME_WRITE', 'TIME_BILL'])
  })
})
