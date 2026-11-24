// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import type { Page, TimeColleague, TimeEntry, TimeGroup, TimeSummary } from '../lib/types'
import { TimeEvaluationPage } from './TimeEvaluationPage'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// jsdom cannot save a file; what is watched is what reached the download folder.
const downloadFile = vi.hoisted(() => vi.fn<(file: { fileName: string; blob: Blob }) => void>())
vi.mock('../lib/files', () => ({ downloadFile, showFile: vi.fn() }))

const BASE = '/api/tenants/1/time-entries'

/** 42:30 hours in November, 12 entries. */
const SUMMARY: TimeSummary = {
  entries: 12,
  totalMinutes: 2550,
  billableMinutes: 1800,
  openEntries: 3,
  openMinutes: 750,
  inDraftMinutes: 450,
  billedMinutes: 600,
  notBillableMinutes: 750,
}

const NOTHING: TimeSummary = {
  entries: 0,
  totalMinutes: 0,
  billableMinutes: 0,
  openEntries: 0,
  openMinutes: 0,
  inDraftMinutes: 0,
  billedMinutes: 0,
  notBillableMinutes: 0,
}

const COLLEAGUES: TimeColleague[] = [
  { userId: 3, name: 'Anna Muster', active: true },
  { userId: 7, name: 'Beat Keller', active: false },
]

function entry(overrides: Partial<TimeEntry>): TimeEntry {
  return {
    id: 1,
    userId: 3,
    userName: 'Anna Muster',
    workDate: '2026-11-23',
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
    lockVersion: 0,
    ...overrides,
  }
}

const ENTRIES = [
  entry({}),
  entry({
    id: 2,
    userId: 7,
    userName: 'Beat Keller',
    workDate: '2026-11-20',
    durationMinutes: 60,
    startTime: null,
    endTime: null,
    projectId: null,
    projectNumber: null,
    projectName: null,
    partnerId: null,
    customerName: null,
    productId: null,
    productNumber: null,
    serviceName: null,
    description: 'Administration',
    billable: false,
    state: 'NOT_BILLABLE',
  }),
]

const GROUPS: Record<string, TimeGroup[]> = {
  user: [
    { id: 3, name: 'Anna Muster', totals: SUMMARY },
    { id: 7, name: 'Beat Keller', totals: NOTHING },
  ],
  project: [
    { id: 12, number: 'P-00012', name: 'Website', totals: SUMMARY },
    { totals: { ...NOTHING, entries: 2, totalMinutes: 90, notBillableMinutes: 90 } },
  ],
  customer: [{ id: 11, name: 'Muster AG', totals: SUMMARY }, { totals: NOTHING }],
  service: [{ id: 31, number: 'L-001', name: 'Konzeption', totals: SUMMARY }],
  week: [{ period: '2026-W48', from: '2026-11-23', to: '2026-11-29', totals: SUMMARY }],
  month: [{ period: '2026-11', from: '2026-11-01', to: '2026-11-30', totals: SUMMARY }],
}

function page(content: TimeEntry[]): Page<TimeEntry> {
  return { content, page: 0, size: 50, totalElements: content.length, totalPages: 1, sort: '' }
}

function session(permissions: string[], modules = ['TIMETRACKING', 'PROJECT']): AuthState {
  return {
    user: {
      userId: 3,
      username: 'anna',
      activeTenantId: 1,
      superuser: false,
      tenants: [{ id: 1, code: 'WX', name: 'Webux', isDefault: true, modules }],
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
let requested: string[]
let totals: () => Promise<Response>
let entries: TimeEntry[]
let exported: () => Promise<Response>

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  )
}

function csv() {
  return Promise.resolve(
    new Response('﻿Datum;Von;Bis\r\n', {
      status: 200,
      headers: {
        'Content-Type': 'text/csv;charset=UTF-8',
        'Content-Disposition': 'attachment; filename="zeiten-2026-11.csv"',
      },
    }),
  )
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 24, 10, 0))
  requested = []
  totals = () => json(SUMMARY)
  entries = ENTRIES
  exported = csv
  downloadFile.mockReset()
  vi.stubGlobal('fetch', (url: string) => {
    requested.push(url)
    if (url === `${BASE}/lookups/colleagues`) return json(COLLEAGUES)
    const grouped = /\/totals\/by\/(\w+)\?/.exec(url)
    if (grouped !== null) return json(GROUPS[grouped[1]] ?? [])
    if (url.startsWith(`${BASE}/totals?`)) return totals()
    if (url.startsWith(`${BASE}/export.csv?`)) return exported()
    if (url.startsWith(`${BASE}?`)) return json(page(entries))
    return json({ detail: 'unbekannt' }, 404)
  })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

/** The address the router stands on, to read what the screen wrote into it. */
function Address() {
  const location = useLocation()
  return <p data-testid="address">{`${location.pathname}${location.search}`}</p>
}

/** Stands in for the menu entry: the same screen, without a filter. */
function MenuEntry() {
  return <Link to="/zeiten-auswertung">Menü Auswertung</Link>
}

async function settle() {
  for (let round = 0; round < 5; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

async function render(
  address = '/zeiten-auswertung',
  permissions = ['TIME_READ', 'INVOICE_READ'],
  modules?: string[],
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[address]}>
        <AuthContext.Provider value={session(permissions, modules)}>
          <QueryClientProvider client={client}>
            <Routes>
              <Route path="/zeiten-auswertung" element={<TimeEvaluationPage />} />
            </Routes>
            <Address />
            <MenuEntry />
          </QueryClientProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
  })
  await settle()
}

const text = () => container.textContent ?? ''
const rows = () => [...container.querySelectorAll('tbody tr')] as HTMLElement[]
const address = () => container.querySelector('[data-testid="address"]')?.textContent ?? ''
const searchOf = () => new URLSearchParams(address().split('?')[1] ?? '')
const lastOf = (prefix: string) => requested.filter((url) => url.startsWith(prefix)).at(-1)

function fieldOf(label: string): HTMLInputElement | HTMLSelectElement {
  const caption = [...container.querySelectorAll('label')].find(
    (entry) => entry.textContent?.trim() === label,
  )
  const field = document.getElementById(caption?.htmlFor ?? '')
  if (!(field instanceof HTMLInputElement) && !(field instanceof HTMLSelectElement)) {
    throw new Error(`no field ${label}`)
  }
  return field
}

function errorAt(label: string): string | undefined {
  return document.getElementById(`${fieldOf(label).id}-hint`)?.textContent ?? undefined
}

function button(name: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find(
    (entry) => entry.textContent?.trim() === name || entry.getAttribute('aria-label') === name,
  )
  if (found === undefined) throw new Error(`no button ${name}`)
  return found
}

async function type(label: string, value: string) {
  await act(async () => {
    const field = fieldOf(label)
    const prototype = field instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(field, value)
    field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
  })
  await settle()
}

async function click(element: HTMLElement) {
  await act(async () => {
    element.click()
  })
  await settle()
}

describe('TimeEvaluationPage', () => {
  /** Without a filter in the address the evaluation asks for this month. */
  it('timeEvaluationPageStartsOnThisMonthTest', async () => {
    await render()

    expect(container.querySelector('h1')?.textContent).toBe('Auswertung')
    expect(lastOf(`${BASE}/totals?`)).toBe(`${BASE}/totals?from=2026-11-01&to=2026-11-30`)
    expect(lastOf(`${BASE}?`)).toBe(
      `${BASE}?from=2026-11-01&to=2026-11-30&page=0&size=50&sort=workDate%2Cdesc`,
    )
    expect(fieldOf('Von').value).toBe('2026-11-01')
    expect(fieldOf('Bis').value).toBe('2026-11-30')
    expect(button('Dieser Monat').getAttribute('aria-pressed')).toBe('true')
    expect(button('Diese Woche').getAttribute('aria-pressed')).toBe('false')
  })

  /** Six tiles over the whole filter, in hours of the clock, as the backend counted them. */
  it('timeEvaluationPageShowsTheSumsTest', async () => {
    await render()

    const tiles = container.querySelector('dl')?.textContent ?? ''
    expect(tiles).toContain('Total42:30 Std.12 Einträge')
    expect(tiles).toContain('Verrechenbar30:00 Std.')
    expect(tiles).toContain('Offen verrechenbar12:30 Std.3 Einträge')
    expect(tiles).toContain('Im Entwurf7:30 Std.')
    expect(tiles).toContain('Verrechnet10:00 Std.')
    expect(tiles).toContain('Nicht verrechenbar12:30 Std.')
  })

  it('timeEvaluationPageListsTheEntriesTest', async () => {
    await render()

    expect(rows()).toHaveLength(2)
    expect(rows()[0].textContent).toContain('23.11.2026')
    expect(rows()[0].textContent).toContain('Anna Muster')
    expect(rows()[0].textContent).toContain('P-00012 Website')
    expect(rows()[0].textContent).toContain('Muster AG')
    expect(rows()[0].textContent).toContain('Konzeption')
    expect(rows()[0].textContent).toContain('2:30')
    expect(rows()[0].textContent).toContain('offen')
    expect(rows()[1].textContent).toContain('ohne Projekt')
    expect(rows()[1].textContent).toContain('intern')
    expect(rows()[1].textContent).toContain('nicht verrechenbar')
  })

  /** A link carries the whole question, and the screen asks exactly that. */
  it('timeEvaluationPageReadsTheFilterFromTheAddressTest', async () => {
    await render(
      '/zeiten-auswertung?von=2026-10-01&bis=2026-10-31&person=3&projekt=12&kunde=ohne'
        + '&zustand=OPEN&zustand=BILLED&suche=Konzept',
    )

    expect(lastOf(`${BASE}/totals?`)).toBe(
      `${BASE}/totals?from=2026-10-01&to=2026-10-31&userId=3&projectId=12&state=OPEN&state=BILLED`
        + '&search=Konzept&unassigned=CUSTOMER',
    )
    expect(fieldOf('Von').value).toBe('2026-10-01')
    expect(fieldOf('Projekt').value).toBe('12')
    expect(fieldOf('Kunde').value).toBe('ohne')
    expect(fieldOf('Suche im Text').value).toBe('Konzept')
    expect(button('Anna Muster aus dem Filter nehmen')).toBeDefined()
    expect((fieldOf('offen') as HTMLInputElement).checked).toBe(true)
    expect((fieldOf('verrechnet') as HTMLInputElement).checked).toBe(true)
    expect((fieldOf('im Entwurf') as HTMLInputElement).checked).toBe(false)
    expect(button('Dieser Monat').getAttribute('aria-pressed')).toBe('false')
  })

  /** Every field writes the address at once, replacing the entry rather than adding one. */
  it('timeEvaluationPageWritesTheFilterIntoTheAddressTest', async () => {
    await render()

    await click(button('Letzter Monat'))
    expect(searchOf().get('von')).toBe('2026-10-01')
    expect(searchOf().get('bis')).toBe('2026-10-31')
    expect(lastOf(`${BASE}/totals?`)).toBe(`${BASE}/totals?from=2026-10-01&to=2026-10-31`)

    await click(fieldOf('verrechnet'))
    expect(searchOf().getAll('zustand')).toEqual(['BILLED'])

    await type('Kunde', '11')
    expect(searchOf().get('kunde')).toBe('11')

    await type('Mitarbeitende', '7')
    expect(searchOf().getAll('person')).toEqual(['7'])
    expect(lastOf(`${BASE}/totals?`)).toBe(
      `${BASE}/totals?from=2026-10-01&to=2026-10-31&userId=7&partnerId=11&state=BILLED`,
    )
  })

  /** A chosen person goes again with its chip, and «Filter zurücksetzen» keeps the range alone. */
  it('timeEvaluationPageTakesTheFilterBackTest', async () => {
    await render('/zeiten-auswertung?von=2026-10-01&bis=2026-10-31&person=3&person=7&leistung=31')

    await click(button('Beat Keller aus dem Filter nehmen'))
    expect(searchOf().getAll('person')).toEqual(['3'])

    await click(button('Filter zurücksetzen'))
    expect(address()).toBe('/zeiten-auswertung?von=2026-10-01&bis=2026-10-31')
    expect(text()).not.toContain('Filter zurücksetzen')
  })

  /** The choices of a field are what has time in the range, «ohne …» last. */
  it('timeEvaluationPageOffersWhatHasTimeTest', async () => {
    await render()

    const projects = [...(fieldOf('Projekt') as HTMLSelectElement).options].map((option) => option.text)
    expect(projects).toEqual(['Alle Projekte', 'P-00012 Website', 'ohne Projekt'])
    const people = [...(fieldOf('Mitarbeitende') as HTMLSelectElement).options].map((option) => option.text)
    expect(people).toEqual(['Alle', 'Anna Muster', 'Beat Keller (deaktiviert)'])
    expect(requested).toContain(`${BASE}/totals/by/project?from=2026-11-01&to=2026-11-30`)
  })

  /** The search goes into the address with every key, and to the server once the typing stops. */
  it('timeEvaluationPageSearchesTest', async () => {
    await render()

    await type('Suche im Text', 'Wire')
    expect(searchOf().get('suche')).toBe('Wire')
    expect(fieldOf('Suche im Text').value).toBe('Wire')

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350))
    })
    await settle()
    expect(lastOf(`${BASE}/totals?`)).toBe(`${BASE}/totals?from=2026-11-01&to=2026-11-30&search=Wire`)
  })

  /** Typing keeps its own letters; an address from elsewhere — the menu — empties the field. */
  it('timeEvaluationPageFollowsAnAddressFromElsewhereTest', async () => {
    await render('/zeiten-auswertung?von=2026-10-01&bis=2026-10-31')
    await type('Suche im Text', 'Wire')
    await type('Suche im Text', 'Wirefr')
    expect(fieldOf('Suche im Text').value).toBe('Wirefr')

    const menu = [...container.querySelectorAll('a')].find((link) => link.textContent === 'Menü Auswertung')
    if (menu === undefined) throw new Error('no menu entry')
    await click(menu)

    expect(address()).toBe('/zeiten-auswertung')
    expect(fieldOf('Suche im Text').value).toBe('')
    expect(fieldOf('Von').value).toBe('2026-11-01')
  })

  it('timeEvaluationPageSortsTest', async () => {
    await render()

    await click(button('Person'))

    expect(lastOf(`${BASE}?`)).toBe(
      `${BASE}?from=2026-11-01&to=2026-11-30&page=0&size=50&sort=userName%2Casc`,
    )
    expect(address()).not.toContain('sort')
  })

  /** The switch stands in the address and asks the sums of its grouping. */
  it('timeEvaluationPageSwitchesTheGroupingTest', async () => {
    await render()

    await click(button('nach Projekt'))

    expect(searchOf().get('nach')).toBe('projekt')
    expect(button('nach Projekt').getAttribute('aria-selected')).toBe('true')
    expect(rows()).toHaveLength(2)
    expect(rows()[0].textContent).toContain('P-00012 Website')
    expect(rows()[0].textContent).toContain('42:30')
    expect(rows()[1].textContent).toContain('ohne Projekt')
    expect(rows()[1].textContent).toContain('1:30')

    await click(button('nach Woche'))
    expect(searchOf().get('nach')).toBe('woche')
    expect(lastOf(`${BASE}/totals/by/week`)).toBe(
      `${BASE}/totals/by/week?from=2026-11-01&to=2026-11-30`,
    )
    expect(rows()[0].textContent).toContain('KW 48 · 2026')
    expect(rows()[0].textContent).toContain('23.11.2026–29.11.2026')
  })

  /** A click on «ohne Projekt» lists the entries without a project. */
  it('timeEvaluationPageOpensTheEntriesOfAGroupTest', async () => {
    await render('/zeiten-auswertung?von=2026-11-01&bis=2026-11-30&zustand=OPEN&nach=projekt')

    const without = [...rows()[1].querySelectorAll('a')][0]
    await click(without)

    expect(searchOf().get('projekt')).toBe('ohne')
    expect(searchOf().getAll('zustand')).toEqual(['OPEN'])
    expect(searchOf().has('nach')).toBe(false)
    expect(lastOf(`${BASE}?`)).toBe(
      `${BASE}?from=2026-11-01&to=2026-11-30&state=OPEN&unassigned=PROJECT&page=0&size=50`
        + '&sort=workDate%2Cdesc',
    )
    expect(button('Einträge').getAttribute('aria-selected')).toBe('true')
  })

  /** A person narrows to them, a week to its days inside the range. */
  it('timeEvaluationPageOpensAPersonAndAWeekTest', async () => {
    await render('/zeiten-auswertung?nach=person')

    await click([...rows()[0].querySelectorAll('a')][0])
    expect(searchOf().getAll('person')).toEqual(['3'])

    await click(button('nach Woche'))
    await click([...rows()[0].querySelectorAll('a')][0])
    expect(searchOf().get('von')).toBe('2026-11-23')
    expect(searchOf().get('bis')).toBe('2026-11-29')
    expect(searchOf().getAll('person')).toEqual(['3'])
  })

  /** The file takes the filter on screen and lands in the download folder under the server's name. */
  it('timeEvaluationPageDownloadsTheFilterTest', async () => {
    await render('/zeiten-auswertung?von=2026-11-01&bis=2026-11-30&kunde=11')

    await click(button('Als CSV herunterladen'))

    expect(lastOf(`${BASE}/export.csv`)).toBe(
      `${BASE}/export.csv?from=2026-11-01&to=2026-11-30&partnerId=11`,
    )
    expect(downloadFile).toHaveBeenCalledTimes(1)
    expect(downloadFile.mock.calls[0][0].fileName).toBe('zeiten-2026-11.csv')
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      'Heruntergeladen: zeiten-2026-11.csv',
    )
  })

  /** More than a file takes: the backend's sentence, and nothing saved. */
  it('timeEvaluationPageWithTooManyEntriesTest', async () => {
    exported = () =>
      json(
        {
          detail: 'Der Export umfasst 61’204 Einträge, eine Datei nimmt höchstens 50’000. Bitte den Zeitraum einschränken.',
          entries: 61204,
          maximum: 50000,
        },
        422,
      )
    await render('/zeiten-auswertung?von=2026-01-01&bis=2026-12-31')

    await click(button('Als CSV herunterladen'))

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Der Export umfasst 61’204 Einträge, eine Datei nimmt höchstens 50’000. Bitte den Zeitraum einschränken.',
    )
    expect(downloadFile).not.toHaveBeenCalled()

    // A narrower range is another question: the sentence about the wider one goes.
    await click(button('Dieser Monat'))
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })

  /** A refusal at a field stands at the field, once. */
  it('timeEvaluationPageWithARangeTooLongTest', async () => {
    totals = () =>
      json(
        {
          detail: 'Ein Zeitraum umfasst höchstens 366 Tage.',
          errors: [{ field: 'to', message: 'Ein Zeitraum umfasst höchstens 366 Tage.' }],
        },
        400,
      )
    await render('/zeiten-auswertung?von=2026-01-01&bis=2027-01-02')

    expect(errorAt('Bis')).toBe('Ein Zeitraum umfasst höchstens 366 Tage.')
    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(text()).toContain('Filter prüfen')
  })

  /** A day emptied asks nothing, and says what is missing. */
  it('timeEvaluationPageWithADayMissingTest', async () => {
    await render()
    requested = []

    await type('Von', '')

    expect(errorAt('Von')).toBe('Einen Tag wählen.')
    expect(requested.filter((url) => url.startsWith(`${BASE}?`) || url.startsWith(`${BASE}/totals`))).toEqual([])
    expect(text()).toContain('Kein Zeitraum')
    expect(button('Als CSV herunterladen').disabled).toBe(true)
    expect(address()).toBe('/zeiten-auswertung?von=&bis=2026-11-30')
  })

  it('timeEvaluationPageWithNothingInTheRangeTest', async () => {
    totals = () => json(NOTHING)
    entries = []

    await render()

    expect(text()).toContain('Keine Zeiten')
    expect(text()).toContain('Im Zeitraum ist keine Zeit erfasst.')
  })

  it('timeEvaluationPageWhenItCannotBeReadTest', async () => {
    totals = () => json({ detail: 'Das Backend meldet einen Fehler.' }, 500)

    await render()

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Das Backend meldet einen Fehler.',
    )
  })

  /** TIME_TRACK opens one's own times and not those of everybody. */
  it('timeEvaluationPageWithoutTheReadRightTest', async () => {
    await render('/zeiten-auswertung', ['TIME_TRACK'])

    expect(text()).toContain('Keine Berechtigung')
    expect(text()).toContain('TIME_READ')
    expect(requested).toEqual([])
  })

  it('timeEvaluationPageWithTheModuleOffTest', async () => {
    await render('/zeiten-auswertung', ['TIME_READ'], ['PROJECT'])

    expect(text()).toContain('Modul nicht eingeschaltet')
    expect(requested).toEqual([])
  })

  /** Without projects there is no field, no column and no grouping for them. */
  it('timeEvaluationPageWithoutProjectsTest', async () => {
    await render('/zeiten-auswertung?projekt=12&nach=projekt', ['TIME_READ'], ['TIMETRACKING'])

    expect(container.querySelector('thead')?.textContent).not.toContain('Projekt')
    expect([...container.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent)).not.toContain(
      'nach Projekt',
    )
    expect(text()).not.toContain('Alle Projekte')
    expect(requested.some((url) => url.includes('/totals/by/project'))).toBe(false)
    expect(lastOf(`${BASE}/totals?`)).toBe(`${BASE}/totals?from=2026-11-01&to=2026-11-30`)
  })
})
