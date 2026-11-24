// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import type {
  Page,
  Project,
  ProjectContact,
  ProjectCustomer,
  ProjectResponsible,
  ProjectTerms,
  TimeEntry,
  TimeSummary,
} from '../lib/types'
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

/** The register «Zeiten» of the project: 12:30 hours, all of them open. */
const SUMMARY: TimeSummary = {
  entries: 5,
  totalMinutes: 750,
  billableMinutes: 750,
  openEntries: 5,
  openMinutes: 750,
  inDraftMinutes: 0,
  billedMinutes: 0,
  notBillableMinutes: 0,
}
const TERMS: ProjectTerms = {
  projectId: 5,
  billingMode: 'BY_EFFORT',
  billableByDefault: true,
  billableAllowed: true,
  openEntries: 5,
}
const NO_ENTRIES: Page<TimeEntry> = {
  content: [],
  page: 0,
  size: 50,
  totalElements: 0,
  totalPages: 0,
  sort: '',
}

/** The rights and modules of somebody who keeps projects and reads the times of everybody. */
const WITH_TIMES = ['PROJECT_READ', 'PROJECT_WRITE', 'TIME_READ']
const TIME_MODULES = ['PROJECT', 'TIMETRACKING']

function session(permissions: string[], modules = ['PROJECT']): AuthState {
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

let container: HTMLDivElement
let root: Root
/** Every write the mask sent: address, method and body per request. */
let written: { url: string; method: string; body: Record<string, unknown> }[]
/** Every customer search the mask sent. */
let searched: string[]
/** What the next write answers instead of success, once. */
let refusal: { status: number; body: unknown } | null

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
  refusal = null
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (method !== 'GET') {
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {}
      written.push({ url, method, body })
      if (refusal !== null) {
        const { status, body: answer } = refusal
        refusal = null
        return json(answer, status)
      }
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
    if (/\/time-tracking\/projects\/\d+\/summary$/.test(url)) return json(SUMMARY)
    if (/\/time-tracking\/projects\/\d+\/terms$/.test(url)) return json(TERMS)
    if (url.startsWith('/api/tenants/1/time-entries?')) return json(NO_ENTRIES)
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

async function render(
  path: string,
  permissions = ['PROJECT_READ', 'PROJECT_WRITE'],
  modules = ['PROJECT'],
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <AuthContext.Provider value={session(permissions, modules)}>
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

/** Types into the customer field and takes the hit that names this customer. */
async function pickCustomer(term: string, name: string) {
  await type('Kunde', term)
  const hit = [...container.querySelectorAll('[role="option"]')].find((entry) =>
    entry.textContent?.includes(name),
  )
  if (hit === undefined) throw new Error(`no hit ${name}`)
  await act(async () => {
    ;(hit as HTMLElement).click()
  })
  await settle()
}

const hits = () =>
  [...container.querySelectorAll('[role="option"]')].map((entry) => entry.textContent)

const options = (label: string) =>
  [...(control(label) as HTMLSelectElement).options].map((option) => option.textContent)

describe('ProjectPage', () => {
  it('projectPageCreatesAProjectTest', async () => {
    await render('/projekte/neu')

    await type('Name', 'Umbau Showroom')
    await pickCustomer('huber', 'Bäckerei Huber AG')
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
    await pickCustomer('huber', 'Bäckerei Huber AG')
    await type('Start', '2026-06-30')
    await type('Ende', '2026-03-02')
    await save()

    expect(written).toHaveLength(0)
    expect(text()).toContain('Das Enddatum liegt vor dem Startdatum.')
  })

  it('projectPageClearsTheContactWithAnotherCustomerTest', async () => {
    await render('/projekte/neu')

    await pickCustomer('huber', 'Bäckerei Huber AG')
    await choose('Kontaktperson', '21')
    await pickCustomer('keller', 'Keller GmbH')

    expect((control('Kontaktperson') as HTMLSelectElement).value).toBe('')
    expect(text()).toContain('Bei diesem Kunden ist keine Kontaktperson erfasst.')
  })

  it('projectPageSearchesCustomersTest', async () => {
    await render('/projekte/neu')

    await type('Kunde', 'keller')

    expect(searched.at(-1)).toBe('/api/tenants/1/projects/customers?search=keller')
    expect(hits()).toEqual(['K-00012Keller GmbH'])
  })

  it('projectPageForgetsTheCustomerWhenTypingAgainTest', async () => {
    await render('/projekte/neu')

    await type('Name', 'Umbau')
    await pickCustomer('huber', 'Bäckerei Huber AG')
    expect((control('Kunde') as HTMLInputElement).value).toBe('K-00011 · Bäckerei Huber AG')

    await type('Kunde', 'kel')
    await save()

    expect(written).toHaveLength(0)
    expect(text()).toContain('Ein Projekt braucht einen Kunden.')
  })

  it('projectPageShowsAStoredProjectTest', async () => {
    await render('/projekte/5')

    expect(text()).toContain('P-00005')
    expect(text()).toContain('Offen')
    expect((control('Name') as HTMLInputElement).value).toBe('Umbau Showroom')
    expect((control('Kunde') as HTMLInputElement).value).toBe('Bäckerei Huber AG')
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

  it('projectPageAsksBeforeLeavingWithChangesTest', async () => {
    await render('/projekte/5')

    await type('Name', 'Umbau Etappe 2')
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    await settle()

    expect(text()).toContain('Änderungen verwerfen?')
    expect(written).toHaveLength(0)
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
    expect((control('Kunde') as HTMLInputElement).disabled).toBe(true)
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

  /** With the time tracking and TIME_READ a stored project has two registers. */
  it('projectPageShowsTheRegistersTest', async () => {
    await render('/projekte/5', WITH_TIMES, TIME_MODULES)

    expect(registers()).toEqual(['Stammdaten', 'Zeiten'])
    expect((control('Name') as HTMLInputElement).value).toBe('Umbau Showroom')
  })

  /** «Zeiten» shows the tiles of the project and leaves the base data. */
  it('projectPageOpensTheTimesTest', async () => {
    await render('/projekte/5', WITH_TIMES, TIME_MODULES)

    await openRegister('Zeiten')

    expect(text()).toContain('Offen verrechenbar')
    expect(text()).toContain('12:30 Std.')
    expect(text()).toContain('Nach Aufwand')
    expect(container.querySelector('label')?.textContent).not.toBe('Name')
  })

  /** Without the module there is nothing to read, and no register strip at all. */
  it('projectPageWithTheTimeTrackingOffTest', async () => {
    await render('/projekte/5', WITH_TIMES, ['PROJECT'])

    expect(registers()).toEqual([])
    expect(text()).not.toContain('Zeiten')
  })

  /** Without TIME_READ the times of everybody are not the session's to see. */
  it('projectPageWithoutTheRightToReadTimesTest', async () => {
    await render('/projekte/5', ['PROJECT_READ', 'PROJECT_WRITE', 'TIME_TRACK'], TIME_MODULES)

    expect(registers()).toEqual([])
  })

  /** A new project has no times yet, and no registers. */
  it('projectPageWithoutRegistersOnANewProjectTest', async () => {
    await render('/projekte/neu', WITH_TIMES, TIME_MODULES)

    expect(registers()).toEqual([])
  })

  /** A project with times is not deleted: the dialog says why, in the backend's sentence. */
  it('projectPageSaysWhyAProjectIsNotDeletedTest', async () => {
    await render('/projekte/5')
    refusal = {
      status: 409,
      body: {
        detail:
          'An diesem Projekt hängen 14 Zeiteinträge. Ein Projekt mit erfassten Zeiten wird abgeschlossen und archiviert statt gelöscht.',
      },
    }

    await press('Löschen')
    await press('Löschen')

    expect(written).toEqual([{ url: '/api/tenants/1/projects/5', method: 'DELETE', body: {} }])
    expect(document.body.textContent).toContain('An diesem Projekt hängen 14 Zeiteinträge.')
    expect(text()).not.toContain('Liste')
  })

  /** Open billable hours keep a project from the archive; the sentence stands above the mask. */
  it('projectPageSaysWhyAProjectIsNotArchivedTest', async () => {
    await render('/projekte/8')
    refusal = {
      status: 409,
      body: {
        detail:
          '12.50 Std. sind noch nicht abgerechnet. Erst abrechnen oder als nicht verrechenbar markieren, dann archivieren.',
      },
    }

    await press('Archivieren')

    expect(written).toEqual([{ url: '/api/tenants/1/projects/8/archive', method: 'POST', body: {} }])
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      '12.50 Std. sind noch nicht abgerechnet.',
    )
  })

  /** The refusal is read where the step was pressed, on the register «Zeiten» as well. */
  it('projectPageSaysWhyItIsNotArchivedOnTheTimesTest', async () => {
    await render('/projekte/8', WITH_TIMES, TIME_MODULES)
    await openRegister('Zeiten')
    refusal = { status: 409, body: { detail: '12.50 Std. sind noch nicht abgerechnet.' } }

    await press('Archivieren')

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      '12.50 Std. sind noch nicht abgerechnet.',
    )
    expect(text()).toContain('Offen verrechenbar')
  })
})

/** The labels of the register strip, empty without one. */
function registers(): string[] {
  return [...container.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent ?? '')
}

async function openRegister(label: string) {
  const tab = [...container.querySelectorAll('[role="tab"]')].find(
    (entry) => entry.textContent === label,
  )
  if (tab === undefined) throw new Error(`no register ${label}`)
  await act(async () => {
    ;(tab as HTMLElement).click()
  })
  await settle()
}
