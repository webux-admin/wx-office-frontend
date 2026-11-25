// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../../auth/authContext'
import type { Page, Project, ProjectTerms, TimeEntry, TimeSummary } from '../../lib/types'
import { ProjectTimes } from './ProjectTimes'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1
const TERMS_URL = '/api/tenants/1/time-tracking/projects/12/terms'

const WEBSITE: Project = {
  id: 12,
  projectNumber: 'P-00012',
  name: 'Website',
  partnerId: 11,
  customerName: 'Muster AG',
  status: 'ACTIVE',
}

/** 42:30 hours on the project: 12 entries, 3 of them open for 12:30. */
const SUMMARY: TimeSummary = {
  entries: 12,
  totalMinutes: 2550,
  billableMinutes: 750,
  openEntries: 3,
  openMinutes: 750,
  inDraftMinutes: 0,
  billedMinutes: 0,
  notBillableMinutes: 1800,
}

/** Terms nobody saved: by effort, without a rate and without a lockVersion. */
const DEFAULT_TERMS: ProjectTerms = {
  projectId: 12,
  billingMode: 'BY_EFFORT',
  billableByDefault: true,
  billableAllowed: true,
  openEntries: 3,
}

const WIREFRAMES: TimeEntry = {
  id: 5,
  userId: 1,
  userName: 'Anna Muster',
  workDate: '2026-11-25',
  durationMinutes: 150,
  startTime: '08:00',
  endTime: '10:30',
  projectId: 12,
  projectNumber: 'P-00012',
  projectName: 'Website',
  partnerId: 11,
  customerName: 'Muster AG',
  productId: 31,
  productNumber: 'L-001',
  serviceName: 'Konzeption',
  description: 'Wireframes',
  billable: true,
  state: 'OPEN',
  editable: true,
  lockVersion: 1,
}

function page(content: TimeEntry[]): Page<TimeEntry> {
  return {
    content,
    page: 0,
    size: 50,
    totalElements: content.length,
    totalPages: content.length === 0 ? 0 : 1,
    sort: '',
  }
}

function session(permissions: string[]): AuthState {
  return {
    user: {
      userId: 1,
      username: 'anna',
      activeTenantId: TENANT,
      superuser: false,
      tenants: [
        { id: TENANT, code: 'WX', name: 'Webux', isDefault: true, modules: ['PROJECT', 'TIMETRACKING'] },
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

let container: HTMLDivElement
let root: Root
/** Every request: method, address and body. */
let requests: { method: string; url: string; body: unknown }[]
let terms: ProjectTerms
let entries: TimeEntry[]
let summaryFails: boolean
/** What the next write answers instead of success, once. */
let refusal: { status: number; body: unknown } | null

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  )
}

function stubFetch() {
  requests = []
  terms = DEFAULT_TERMS
  entries = [WIREFRAMES]
  summaryFails = false
  refusal = null
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    requests.push({ method, url, body })
    if (method === 'PUT' && url === TERMS_URL) {
      if (refusal !== null) {
        const { status, body: answer } = refusal
        refusal = null
        return json(answer, status)
      }
      terms = {
        ...terms,
        billingMode: body.billingMode,
        hourlyRate: body.hourlyRate,
        currency: body.hourlyRate === null ? null : 'CHF',
        lockVersion: (terms.lockVersion ?? -1) + 1,
        openEntries: 12,
      }
      return json(terms)
    }
    if (url === TERMS_URL) return json(terms)
    if (url.endsWith('/projects/12/summary')) {
      return summaryFails ? json({ detail: 'Das Backend meldet einen Fehler.' }, 500) : json(SUMMARY)
    }
    if (url.startsWith('/api/tenants/1/time-entries?')) return json(page(entries))
    return json({})
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

async function settle(ms = 30) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms))
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

/** What «Meine Zeiten» was opened with, so the hand-over can be read. */
function HandedOver() {
  return <p data-testid="handed-over">{JSON.stringify(useLocation().state)}</p>
}

async function render(permissions = ['TIME_READ'], project: Project = WEBSITE) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/projekte/12']}>
        <AuthContext.Provider value={session(permissions)}>
          <QueryClientProvider client={client}>
            <Routes>
              <Route path="/projekte/12" element={<ProjectTimes tenantId={TENANT} project={project} />} />
              <Route path="/zeiten" element={<HandedOver />} />
              <Route path="/zeiten-abrechnen/projekt/12" element={<HandedOver />} />
            </Routes>
          </QueryClientProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
  })
  await settle()
}

const text = () => document.body.textContent ?? ''
const writes = () => requests.filter((request) => request.method !== 'GET')

function button(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll('button')]
    .filter((entry) => entry.textContent?.trim() === label)
    .at(-1)
}

async function press(label: string) {
  const found = button(label)
  if (found === undefined) throw new Error(`no button ${label}`)
  await act(async () => {
    found.click()
  })
  await settle()
}

function control(label: string): HTMLInputElement {
  const caption = [...document.querySelectorAll('label')].find((entry) => entry.textContent === label)
  const found = caption ? document.getElementById(caption.htmlFor) : null
  if (found === null) throw new Error(`no field labelled ${label}`)
  return found as HTMLInputElement
}

async function type(label: string, value: string) {
  const input = control(label)
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await settle()
}

/** Picks one of the three billing modes in the dialog. */
async function chooseMode(label: string) {
  const option = [...document.querySelectorAll('[role="dialog"] label')].find(
    (entry) => entry.textContent === label,
  )
  const radio = option?.querySelector('input')
  if (!radio) throw new Error(`no mode ${label}`)
  await act(async () => {
    radio.click()
  })
  await settle()
}

/** The tiles, as «label value» pairs. */
const tiles = () =>
  [...container.querySelectorAll('dl > div')].map(
    (tile) => `${tile.querySelector('dt')?.textContent} ${tile.querySelector('dd')?.textContent}`,
  )

const WRITER = ['TIME_READ', 'TIME_WRITE']

describe('ProjectTimes', () => {
  /** The five tiles in hours of the clock, with the entries where they say something. */
  it('projectTimesShowsTheTilesTest', async () => {
    await render()

    expect(tiles().slice(0, 5)).toEqual([
      'Total 42:30 Std.12 Einträge',
      'Offen verrechenbar 12:30 Std.3 Einträge',
      'Im Entwurf 0:00 Std.',
      'Verrechnet 0:00 Std.',
      'Nicht verrechenbar 30:00 Std.',
    ])
  })

  it('projectTimesWhenTheSummaryCannotBeReadTest', async () => {
    summaryFails = true

    await render()

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Das Backend meldet einen Fehler.',
    )
  })

  /** The entries of everybody, a page at a time, with date, person, service, duration and text. */
  it('projectTimesListsTheEntriesTest', async () => {
    await render()

    expect(requests.map((request) => request.url)).toContain(
      '/api/tenants/1/time-entries?projectId=12&page=0&size=50',
    )
    const row = container.querySelector('tbody tr')?.textContent ?? ''
    expect(row).toContain('25.11.2026')
    expect(row).toContain('Anna Muster')
    expect(row).toContain('Konzeption')
    expect(row).toContain('2:30')
    expect(row).toContain('Wireframes')
    expect(row).toContain('offen')
    // The project is the register's own: no column names it a second time.
    expect(container.querySelector('thead')?.textContent).not.toContain('Projekt')
  })

  it('projectTimesWithoutEntriesTest', async () => {
    entries = []

    await render()

    expect(text()).toContain('Noch keine Zeiten')
    expect(text()).toContain('Auf diesem Projekt ist noch keine Zeit erfasst.')
  })

  /** Terms nobody saved: by effort, and the price of the service. */
  it('projectTimesShowsTheTermsTest', async () => {
    await render()

    expect(text()).toContain('Nach Aufwand')
    expect(text()).toContain('Preis der Leistung')
  })

  it('projectTimesShowsTheRateWithItsCurrencyTest', async () => {
    terms = { ...DEFAULT_TERMS, billingMode: 'FIXED_PRICE', hourlyRate: 140, currency: 'CHF', lockVersion: 2 }

    await render()

    expect(text()).toContain('Pauschal')
    expect(text()).toContain('140.00 CHF pro Stunde')
  })

  /** TIME_READ alone reads the terms and changes nothing. */
  it('projectTimesWithoutTheRightToChangeTest', async () => {
    await render(['TIME_READ'])

    expect(button('Ändern')).toBeUndefined()
  })

  /** An archived project keeps its terms read only, also for whoever may write. */
  it('projectTimesKeepsAnArchivedProjectReadOnlyTest', async () => {
    await render(WRITER, { ...WEBSITE, status: 'ARCHIVED' })

    expect(button('Ändern')).toBeUndefined()
    expect(text()).toContain('seine Abrechnung lässt sich nur lesen')
  })

  /**
   * The dialog: «Pauschal» and 140.00, saved without a lockVersion because nobody saved terms
   * before; the answer names the open entries that stay as they are.
   */
  it('projectTimesChangesTheTermsTest', async () => {
    await render(WRITER)

    await press('Ändern')
    await chooseMode('Pauschal')
    await type('Projektsatz pro Stunde', '140')
    await press('Speichern')

    expect(writes()).toEqual([
      { method: 'PUT', url: TERMS_URL, body: { billingMode: 'FIXED_PRICE', hourlyRate: 140 } },
    ])
    expect(text()).toContain(
      'Gespeichert. Die Abrechnungsart gilt für neue Zeit: 12 offene verrechenbare Einträge bleiben, wie sie sind.',
    )
    expect(text()).toContain('140.00 CHF pro Stunde')
  })

  /** Saved terms go back with the state they were read with. */
  it('projectTimesSendsTheLockVersionTest', async () => {
    terms = { ...DEFAULT_TERMS, hourlyRate: 140, currency: 'CHF', lockVersion: 2 }
    await render(WRITER)

    await press('Ändern')
    await type('Projektsatz pro Stunde', '')
    await press('Speichern')

    expect(writes()[0].body).toEqual({ billingMode: 'BY_EFFORT', hourlyRate: null, lockVersion: 2 })
    expect(text()).toContain('Preis der Leistung')
  })

  /** Before saving a new mode, the dialog says that the open entries stay as they are. */
  it('projectTimesWarnsAboutTheOpenEntriesTest', async () => {
    await render(WRITER)

    await press('Ändern')
    expect(text()).not.toContain('3 offene verrechenbare Einträge bleiben')
    await chooseMode('Nicht verrechenbar')

    expect(text()).toContain('3 offene verrechenbare Einträge bleiben, wie sie sind.')
  })

  it('projectTimesRefusesANegativeRateBeforeSendingTest', async () => {
    await render(WRITER)

    await press('Ändern')
    await type('Projektsatz pro Stunde', '-1')
    await press('Speichern')

    expect(writes()).toEqual([])
    expect(control('Projektsatz pro Stunde').getAttribute('aria-invalid')).toBe('true')
    expect(text()).toContain('Der Projektsatz darf nicht negativ sein.')
  })

  /** A refusal at the rate stands at the rate, and not a second time above it. */
  it('projectTimesShowsARefusedRateAtTheFieldTest', async () => {
    await render(WRITER)
    refusal = {
      status: 400,
      body: {
        detail: 'Der Projektsatz hat höchstens 4 Nachkommastellen.',
        errors: [{ field: 'hourlyRate', message: 'Der Projektsatz hat höchstens 4 Nachkommastellen.' }],
      },
    }

    await press('Ändern')
    await type('Projektsatz pro Stunde', '140.12345')
    await press('Speichern')

    expect(control('Projektsatz pro Stunde').getAttribute('aria-invalid')).toBe('true')
    expect(text().split('Der Projektsatz hat höchstens 4 Nachkommastellen.')).toHaveLength(2)
  })

  /** Changed elsewhere meanwhile: the sentence of the backend, and the terms are read anew. */
  it('projectTimesWhenChangedElsewhereTest', async () => {
    terms = { ...DEFAULT_TERMS, lockVersion: 2 }
    await render(WRITER)
    refusal = {
      status: 409,
      body: {
        detail:
          'Die Abrechnungsart des Projekts P-00012 wurde inzwischen geändert. Neu laden und die Änderung wiederholen.',
      },
    }
    const reads = () => requests.filter((request) => request.method === 'GET' && request.url === TERMS_URL).length
    const before = reads()

    await press('Ändern')
    await chooseMode('Pauschal')
    await press('Speichern')

    expect(document.querySelector('[role="dialog"] [role="alert"]')?.textContent).toContain(
      'wurde inzwischen geändert',
    )
    expect(reads()).toBe(before + 1)
  })

  /** «Zeit erfassen» opens «Meine Zeiten» with the project handed over. */
  it('projectTimesOffersToRecordTimeTest', async () => {
    await render(['TIME_READ', 'TIME_TRACK'])

    const link = [...container.querySelectorAll('a')].find((entry) => entry.textContent === 'Zeit erfassen')
    expect(link?.getAttribute('href')).toBe('/zeiten')
    await act(async () => {
      link?.click()
    })
    await settle()

    expect(JSON.parse(container.querySelector('[data-testid="handed-over"]')?.textContent ?? '{}')).toEqual({
      recordOn: {
        kind: 'PROJECT',
        projectId: 12,
        projectNumber: 'P-00012',
        projectName: 'Website',
        partnerId: 11,
        customerName: 'Muster AG',
      },
    })
  })

  /** A completed project takes no new time, so nothing offers to record any. */
  it('projectTimesOffersNoRecordingOnACompletedProjectTest', async () => {
    await render(['TIME_READ', 'TIME_TRACK'], { ...WEBSITE, status: 'COMPLETED' })

    expect(text()).not.toContain('Zeit erfassen')
  })

  /** An open project has not begun: time goes on it once it is active (backend ADR-0165). */
  it('projectTimesOffersNoRecordingOnAnOpenProjectTest', async () => {
    await render(['TIME_READ', 'TIME_TRACK'], { ...WEBSITE, status: 'OPEN' })

    expect(text()).not.toContain('Zeit erfassen')
  })

  it('projectTimesOffersNoRecordingWithoutTheTrackRightTest', async () => {
    await render(['TIME_READ'])

    expect(text()).not.toContain('Zeit erfassen')
  })

  // --- billing (#127, frontend ADR-0085) --------------------------------------------

  /** «Abrechnen» opens the billing of the project and names the project as the way back. */
  it('projectTimesOpensTheBillingTest', async () => {
    await render(['TIME_READ', 'TIME_BILL'])
    const link = [...container.querySelectorAll('a')].find((entry) => entry.textContent === 'Abrechnen')
    expect(link?.getAttribute('href')).toBe('/zeiten-abrechnen/projekt/12')

    await act(async () => {
      link?.click()
    })

    expect(JSON.parse(container.querySelector('[data-testid="handed-over"]')?.textContent ?? '{}')).toEqual({
      origin: { from: '/projekte/12', label: 'P-00012 Website' },
      billing: { until: null, withoutProject: false },
    })
  })

  /** A completed project is billed still: it takes no new time, but its open time is billable. */
  it('projectTimesBillsACompletedProjectTest', async () => {
    await render(['TIME_READ', 'TIME_TRACK', 'TIME_BILL'], { ...WEBSITE, status: 'COMPLETED' })

    expect(text()).toContain('Abrechnen')
    expect(text()).not.toContain('Zeit erfassen')
  })

  it('projectTimesOffersNoBillingWithoutTheBillRightTest', async () => {
    await render(['TIME_READ', 'TIME_TRACK'])

    expect([...container.querySelectorAll('a')].map((entry) => entry.textContent)).not.toContain('Abrechnen')
  })

  /** A billed entry in the list: its badge leads to the invoice with INVOICE_READ, back to here. */
  it('projectTimesLinksABilledEntryTest', async () => {
    entries = [
      {
        ...WIREFRAMES,
        state: 'BILLED',
        editable: false,
        readOnlyReason: 'Der Eintrag ist mit der Rechnung RE-2026-0042 verrechnet und lässt sich nicht ändern.',
        documentId: 78,
        documentNumber: 'RE-2026-0042',
      },
    ]

    await render(['TIME_READ', 'INVOICE_READ'])

    const badge = [...container.querySelectorAll('tbody a')].find(
      (entry) => entry.textContent === 'verrechnet RE-2026-0042',
    )
    expect(badge?.getAttribute('href')).toBe('/rechnungen/78')
    expect(container.querySelector('tbody button[aria-label$="gesperrt"]')).not.toBeNull()
  })

  /** An entry on a draft can be taken off it here too, with TIME_BILL. */
  it('projectTimesReleasesAnEntryFromItsDraftTest', async () => {
    entries = [{ ...WIREFRAMES, state: 'IN_DRAFT', editable: false, documentId: 77 }]
    await render(['TIME_READ', 'TIME_BILL'])

    const release = container.querySelector<HTMLButtonElement>(
      'tbody button[aria-label="2:30 vom 25.11.2026 vom Entwurf lösen"]',
    )
    expect(release).not.toBeNull()
    await act(async () => {
      release?.click()
    })
    await settle()
    await press('Lösen')

    expect(writes()).toEqual([
      { method: 'POST', url: '/api/tenants/1/time-tracking/billing/release', body: { entryIds: [5] } },
    ])
  })
})
