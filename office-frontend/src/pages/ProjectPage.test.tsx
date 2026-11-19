// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import type { Project, ProjectContact, ProjectCustomer, ProjectResponsible } from '../lib/types'
import { ProjectPage } from './ProjectPage'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1

const HUBER: ProjectCustomer = { partnerId: 11, partnerNumber: 'K-00011', name: 'Bäckerei Huber AG' }
const KELLER: ProjectCustomer = { partnerId: 12, partnerNumber: 'K-00012', name: 'Keller GmbH' }
const EVA: ProjectContact = { contactId: 21, name: 'Eva Huber' }
const ANNA: ProjectResponsible = { userId: 31, name: 'Anna Meier', active: true }
const BEAT: ProjectResponsible = { userId: 32, name: 'Beat Keller', active: false }

const STORED: Project = {
  id: 5,
  projectNumber: 'P-00005',
  name: 'Umbau Showroom',
  partnerId: 11,
  customerName: 'Bäckerei Huber AG',
  contactPersonId: 21,
  contactPersonName: 'Eva Huber',
  responsibleUserId: 32,
  responsibleName: 'Beat Keller',
  startDate: '2026-03-02',
  endDate: '2026-06-30',
  description: null,
  status: 'OPEN',
}

function session(permissions: string[]): AuthState {
  return {
    user: {
      userId: 1,
      username: 'muster',
      activeTenantId: TENANT,
      superuser: false,
      tenants: [{ id: TENANT, code: 'WX', name: 'Webux', isDefault: true, modules: ['PROJECT'] }],
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
/** Every write the mask sent: address, method and body per request. */
let written: { url: string; method: string; body: Record<string, unknown> }[]
/** Every customer search the mask sent. */
let searched: string[]

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
  searched = []
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (method !== 'GET') {
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {}
      written.push({ url, method, body })
      if (method === 'DELETE') return Promise.resolve(new Response(null, { status: 204 }))
      if (url.endsWith('/start')) return json({ ...STORED, status: 'ACTIVE' })
      return json({ ...STORED, ...body, id: 6, projectNumber: 'P-00006' }, method === 'POST' ? 201 : 200)
    }
    if (url.includes('/projects/customers/11/contacts')) return json([EVA])
    if (url.includes('/projects/customers/12/contacts')) return json([])
    if (url.includes('/projects/customers')) {
      searched.push(url)
      return json(url.includes('search=keller') ? [KELLER] : [HUBER, KELLER])
    }
    if (url.includes('/projects/responsibles')) return json([ANNA, BEAT])
    if (url.endsWith('/projects/5')) return json(STORED)
    if (url.endsWith('/projects/7')) return json({ ...STORED, id: 7, status: 'ARCHIVED' })
    if (url.endsWith('/projects/8')) return json({ ...STORED, id: 8, status: 'COMPLETED' })
    return json([])
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

async function settle(ms = 300) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms))
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function render(path: string, permissions = ['PROJECT_READ', 'PROJECT_WRITE']) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <AuthContext.Provider value={session(permissions)}>
          <QueryClientProvider client={client}>
            <Routes>
              <Route path="/projekte/:id" element={<ProjectPage />} />
              <Route path="/projekte" element={<p>Liste</p>} />
            </Routes>
          </QueryClientProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
  })
  await settle()
}

const text = () => container.textContent ?? ''

/** The control the given label points at. */
function control(label: string): HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  const caption = [...container.querySelectorAll('label')].find(
    (entry) => entry.textContent === label,
  )
  const found = caption ? document.getElementById(caption.htmlFor) : null
  if (found === null) throw new Error(`no field labelled ${label}`)
  return found as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
}

async function type(label: string, value: string) {
  const input = control(label)
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set?.call(
      input,
      value,
    )
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await settle()
}

async function choose(label: string, value: string) {
  const select = control(label)
  await act(async () => {
    select.value = value
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await settle()
}

async function save() {
  await press('Speichern')
}

/** The buttons on the page, by what they say. */
const buttons = () =>
  [...document.querySelectorAll('button')].map((entry) => entry.textContent?.trim() ?? '')

/** Presses the last button that says exactly this, so a dialog wins over the header. */
async function press(label: string) {
  const button = [...document.querySelectorAll('button')]
    .filter((entry) => entry.textContent?.trim() === label)
    .at(-1)
  if (button === undefined) throw new Error(`no button ${label}`)
  await act(async () => {
    button.click()
  })
  await settle()
}

const options = (label: string) =>
  [...(control(label) as HTMLSelectElement).options].map((option) => option.textContent)

describe('ProjectPage', () => {
  it('projectPageCreatesAProjectTest', async () => {
    await render('/projekte/neu')

    await type('Name', 'Umbau Showroom')
    await choose('Kunde', '11')
    await choose('Kontaktperson', '21')
    await choose('Verantwortlich', '31')
    await type('Start', '2026-03-02')
    await save()

    expect(written).toEqual([
      {
        url: '/api/tenants/1/projects',
        method: 'POST',
        body: {
          name: 'Umbau Showroom',
          partnerId: 11,
          contactPersonId: 21,
          responsibleUserId: 31,
          startDate: '2026-03-02',
          endDate: null,
          description: null,
        },
      },
    ])
    expect(text()).toContain('Liste')
  })

  it('projectPageNamesWhatIsMissingBeforeSendingTest', async () => {
    await render('/projekte/neu')

    await type('Name', 'Umbau Showroom')
    await save()

    expect(written).toHaveLength(0)
    expect(text()).toContain('Ein Projekt braucht einen Kunden.')
  })

  it('projectPageRefusesAnEndBeforeTheStartTest', async () => {
    await render('/projekte/neu')

    await type('Name', 'Umbau')
    await choose('Kunde', '11')
    await type('Start', '2026-06-30')
    await type('Ende', '2026-03-02')
    await save()

    expect(written).toHaveLength(0)
    expect(text()).toContain('Das Enddatum liegt vor dem Startdatum.')
  })

  it('projectPageClearsTheContactWithAnotherCustomerTest', async () => {
    await render('/projekte/neu')

    await choose('Kunde', '11')
    await choose('Kontaktperson', '21')
    await choose('Kunde', '12')

    expect((control('Kontaktperson') as HTMLSelectElement).value).toBe('')
    expect(text()).toContain('Bei diesem Kunden ist keine Kontaktperson erfasst.')
  })

  it('projectPageSearchesCustomersTest', async () => {
    await render('/projekte/neu')

    await type('Kunde suchen', 'keller')

    expect(searched.at(-1)).toBe('/api/tenants/1/projects/customers?search=keller')
    expect(options('Kunde')).toEqual(['Bitte wählen', 'K-00012 · Keller GmbH'])
  })

  it('projectPageShowsAStoredProjectTest', async () => {
    await render('/projekte/5')

    expect(text()).toContain('P-00005')
    expect(text()).toContain('Offen')
    expect((control('Name') as HTMLInputElement).value).toBe('Umbau Showroom')
    expect((control('Kunde') as HTMLSelectElement).value).toBe('11')
    expect((control('Kontaktperson') as HTMLSelectElement).value).toBe('21')
  })

  it('projectPageKeepsADeactivatedResponsibleTheProjectNamesTest', async () => {
    await render('/projekte/5')

    // Beat is deactivated: still there because this project names him, marked as such.
    expect(options('Verantwortlich')).toEqual([
      'Noch niemand',
      'Anna Meier',
      'Beat Keller (deaktiviert)',
    ])
  })

  it('projectPageHidesADeactivatedUserOnANewProjectTest', async () => {
    await render('/projekte/neu')

    expect(options('Verantwortlich')).toEqual(['Noch niemand', 'Anna Meier'])
  })

  it('projectPageChangesAStoredProjectTest', async () => {
    await render('/projekte/5')

    await type('Name', 'Umbau Etappe 2')
    await save()

    expect(written).toHaveLength(1)
    expect(written[0].method).toBe('PUT')
    expect(written[0].url).toBe('/api/tenants/1/projects/5')
    expect(written[0].body.name).toBe('Umbau Etappe 2')
    expect(written[0].body.responsibleUserId).toBe(32)
  })

  it('projectPageWithoutWriteRightTest', async () => {
    await render('/projekte/5', ['PROJECT_READ'])

    expect(text()).not.toContain('Speichern')
    expect((control('Name') as HTMLInputElement).disabled).toBe(true)
    expect(container.querySelectorAll('label')).not.toHaveLength(0)
    expect([...container.querySelectorAll('label')].some((entry) => entry.textContent === 'Kunde suchen'))
      .toBe(false)
  })

  it('projectPageStartsAnOpenProjectTest', async () => {
    await render('/projekte/5')

    expect(buttons()).not.toContain('Archivieren')
    await press('Starten')

    expect(written).toEqual([{ url: '/api/tenants/1/projects/5/start', method: 'POST', body: {} }])
    // A step keeps the mask open on the same project.
    expect(text()).not.toContain('Liste')
  })

  it('projectPageOffersArchiveAndReopenOnACompletedProjectTest', async () => {
    await render('/projekte/8')

    expect(buttons()).toEqual(expect.arrayContaining(['Archivieren', 'Wieder öffnen']))
    expect(buttons()).not.toContain('Löschen')
    expect(buttons()).not.toContain('Starten')
  })

  it('projectPageKeepsAnArchivedProjectReadOnlyTest', async () => {
    await render('/projekte/7')

    expect(text()).toContain('Archiviert')
    expect(text()).toContain('Dieses Projekt ist archiviert und lässt sich nur noch lesen.')
    expect(buttons()).not.toContain('Speichern')
    expect(buttons()).toContain('Aus dem Archiv holen')
    expect((control('Name') as HTMLInputElement).disabled).toBe(true)
  })

  it('projectPageDeletesAnOpenProjectAfterAskingTest', async () => {
    await render('/projekte/5')

    await press('Löschen')
    expect(document.body.textContent).toContain('P-00005 löschen?')
    expect(written).toHaveLength(0)

    await press('Löschen')

    expect(written).toEqual([{ url: '/api/tenants/1/projects/5', method: 'DELETE', body: {} }])
    expect(text()).toContain('Liste')
  })

  it('projectPageOffersNoStepWithoutWriteRightTest', async () => {
    await render('/projekte/5', ['PROJECT_READ'])

    expect(buttons()).not.toContain('Starten')
    expect(buttons()).not.toContain('Löschen')
  })

  it('projectPageOffersNoStepOnANewProjectTest', async () => {
    await render('/projekte/neu')

    expect(buttons()).not.toContain('Starten')
    expect(buttons()).not.toContain('Löschen')
  })

  it('projectPageWithoutReadRightTest', async () => {
    await render('/projekte/5', [])

    expect(text()).not.toContain('Umbau Showroom')
  })
})
