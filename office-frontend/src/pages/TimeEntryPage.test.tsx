// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import type {
  BillingMode,
  RunningTimer,
  TimeBillableDefault,
  TimeColleague,
  TimeEntry,
  TimeRecentTarget,
  TimeServiceChoice,
  TimeSheet,
  TimeTargetChoice,
} from '../lib/types'
import { TimeEntryPage } from './TimeEntryPage'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1
const BASE = '/api/tenants/1/time-entries'

const WEBSITE: TimeTargetChoice = {
  kind: 'PROJECT',
  projectId: 12,
  projectNumber: 'P-00012',
  projectName: 'Website',
  partnerId: 11,
  customerName: 'Muster AG',
}
const MUSTER: TimeTargetChoice = {
  kind: 'CUSTOMER',
  partnerId: 11,
  partnerNumber: 'K-00011',
  customerName: 'Muster AG',
}
const CONCEPT: TimeServiceChoice = { productId: 31, productNumber: 'L-001', name: 'Konzeption' }
const SUPPORT: TimeServiceChoice = { productId: 32, productNumber: 'L-002', name: 'Support' }

function entry(overrides: Partial<TimeEntry>): TimeEntry {
  return {
    id: 1,
    userId: 1,
    workDate: '2026-11-25',
    durationMinutes: 60,
    billable: false,
    state: 'NOT_BILLABLE',
    editable: true,
    lockVersion: 0,
    ...overrides,
  }
}

const WIREFRAMES = entry({
  id: 5,
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
  lockVersion: 1,
})
const TICKET = entry({
  id: 6,
  durationMinutes: 60,
  partnerId: 11,
  customerName: 'Muster AG',
  productId: 32,
  productNumber: 'L-002',
  serviceName: 'Support',
  description: 'Ticket 4711',
  billable: true,
  state: 'OPEN',
  lockVersion: 2,
})
const TRAINING = entry({ id: 7, durationMinutes: 180, description: 'Weiterbildung' })
const TUESDAY = entry({ id: 8, workDate: '2026-11-24', durationMinutes: 490, description: 'Workshop' })
const ARCHIVED = entry({
  id: 9,
  workDate: '2026-11-23',
  durationMinutes: 465,
  projectId: 3,
  projectNumber: 'P-00003',
  projectName: 'Altbau',
  partnerId: 11,
  customerName: 'Muster AG',
  billable: true,
  state: 'OPEN',
  editable: false,
  readOnlyReason: 'Das Projekt P-00003 ist archiviert. Seine Zeiten lassen sich nur noch lesen.',
})

/** On a draft invoice since #127: locked, linked to its draft, and to be taken off with TIME_BILL. */
const DRAFTED = entry({
  id: 10,
  durationMinutes: 70,
  projectId: 12,
  projectNumber: 'P-00012',
  projectName: 'Website',
  partnerId: 11,
  customerName: 'Muster AG',
  productId: 31,
  serviceName: 'Konzeption',
  description: 'Review mit Kunde',
  billable: true,
  state: 'IN_DRAFT',
  editable: false,
  readOnlyReason: 'Der Eintrag steht auf einem Rechnungsentwurf und lässt sich nicht ändern.',
  documentId: 77,
})
/** On an issued invoice: locked, and its badge names the invoice. */
const INVOICED = entry({
  ...DRAFTED,
  id: 11,
  description: 'Konzept abgenommen',
  state: 'BILLED',
  readOnlyReason: 'Der Eintrag ist mit der Rechnung RE-2026-0042 verrechnet und lässt sich nicht ändern.',
  documentId: 78,
  documentNumber: 'RE-2026-0042',
})

/** The week of the sketch in #124: Monday to Wednesday worked, 22:25 in all. */
function week(entries: TimeEntry[], userId = 1, userName = 'Anna Muster'): TimeSheet {
  const days = ['23', '24', '25', '26', '27', '28', '29'].map((day) => `2026-11-${day}`)
  const totals = days.map((date) => ({
    date,
    totalMinutes: entries
      .filter((one) => one.workDate === date)
      .reduce((sum, one) => sum + one.durationMinutes, 0),
  }))
  return {
    userId,
    userName,
    from: days[0],
    to: days[6],
    totalMinutes: totals.reduce((sum, total) => sum + total.totalMinutes, 0),
    days: totals,
    entries,
  }
}

const RECENT: TimeRecentTarget[] = [
  {
    projectId: 12,
    projectNumber: 'P-00012',
    projectName: 'Website',
    partnerId: 11,
    customerName: 'Muster AG',
    productId: 31,
    productNumber: 'L-001',
    serviceName: 'Konzeption',
  },
  { partnerId: 11, customerName: 'Muster AG', productId: 32, serviceName: 'Support' },
  {},
]

/** The stopwatch «Fortsetzen» starts on the wireframes. */
const CONTINUED: RunningTimer = {
  id: 3,
  userId: 1,
  startedAt: '2026-11-25T09:00:00Z',
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
  elapsedMinutes: 0,
  longRunning: false,
  endRequired: false,
  lockVersion: 0,
}

const COLLEAGUES: TimeColleague[] = [
  { userId: 1, name: 'Anna Muster', active: true },
  { userId: 42, name: 'Beat Keller', active: true },
  { userId: 43, name: 'Carla Frei', active: false },
]

function session(permissions: string[], modules = ['TIMETRACKING', 'PROJECT']): AuthState {
  return {
    user: {
      userId: 1,
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
/** Every request the screen sent: method, address and body. */
let requests: { method: string; url: string; body: Record<string, unknown> }[]
/** What the next write answers instead of success. */
let writeFailure: { status: number; body: unknown } | null
/** Whether the sheet answers with an error. */
let sheetFails: boolean
/** How the project «Website» is billed, as the lookup of «verrechenbar» answers. */
let websiteMode: BillingMode
/** Entries on invoices a test adds to Wednesday. */
let billedEntries: TimeEntry[]

/** The answer of `lookups/default-billable` for the project «Website». */
function websiteDefault(): TimeBillableDefault {
  if (websiteMode === 'NOT_BILLABLE') {
    return {
      billable: false,
      locked: true,
      lockedReason:
        'Das Projekt P-00012 ist als «Nicht verrechenbar» vereinbart. Zeit darauf ist nie verrechenbar.',
      billingMode: websiteMode,
    }
  }
  return { billable: websiteMode === 'BY_EFFORT', locked: false, billingMode: websiteMode }
}

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  )
}

function matches(target: TimeTargetChoice, search: string): boolean {
  const text = [target.projectNumber, target.projectName, target.partnerNumber, target.customerName]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return text.includes(search.toLowerCase())
}

function stubFetch() {
  requests = []
  writeFailure = null
  sheetFails = false
  websiteMode = 'BY_EFFORT'
  billedEntries = []
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {}
    requests.push({ method, url, body })
    const query = new URL(url, 'http://localhost').searchParams
    if (method !== 'GET') {
      if (writeFailure !== null) return json(writeFailure.body, writeFailure.status)
      if (method === 'DELETE') return Promise.resolve(new Response(null, { status: 204 }))
      if (url.endsWith('/time-tracking/billing/release')) {
        const ids = body.entryIds as number[]
        return json(
          billedEntries
            .filter((one) => ids.includes(one.id))
            .map((one) => ({ ...one, state: 'OPEN', editable: true, readOnlyReason: null, documentId: null })),
        )
      }
      if (url.endsWith('/continue')) {
        return json({ timer: CONTINUED, started: true, stoppedEntries: [] }, 201)
      }
      if (method === 'PUT') return json({ ...TICKET, ...body, lockVersion: 3 })
      return json(
        entry({ ...body, id: 99, durationMinutes: body.durationMinutes ?? 90, lockVersion: 0 }),
        201,
      )
    }
    if (url.startsWith(`${BASE}/mine?`) || url.startsWith(`${BASE}/sheet?`)) {
      if (sheetFails) return json({ detail: 'Das Backend meldet einen Fehler.' }, 500)
      if (query.get('from') !== '2026-11-23') return json(week([]))
      return url.includes('/sheet?') ? json(week([TICKET], 42, 'Beat Keller')) : json(
        week([ARCHIVED, TUESDAY, WIREFRAMES, TICKET, TRAINING, ...billedEntries]),
      )
    }
    if (url.startsWith(`${BASE}/mine/recent`)) return json(RECENT)
    if (url.startsWith(`${BASE}/mine/default-service`)) {
      return query.get('projectId') === '12'
        ? json(CONCEPT)
        : Promise.resolve(new Response(null, { status: 204 }))
    }
    if (url.startsWith(`${BASE}/lookups/targets`)) {
      return json([WEBSITE, MUSTER].filter((target) => matches(target, query.get('search') ?? '')))
    }
    if (url.startsWith(`${BASE}/lookups/services`)) return json([CONCEPT, SUPPORT])
    if (url.startsWith(`${BASE}/lookups/colleagues`)) return json(COLLEAGUES)
    if (url.startsWith(`${BASE}/lookups/default-billable`)) {
      return query.get('projectId') === null
        ? json({ billable: true, locked: false })
        : json(websiteDefault())
    }
    return json([])
  })
}

beforeEach(() => {
  // Only the date is ours: Wednesday, 25 November 2026. The timers stay real for the debounce.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 25, 10, 0))
  stubFetch()
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

/** Lets timers run out and answers arrive; 0 for a field without a type-ahead. */
async function settle(ms = 0) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms))
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

const TRACKER = ['TIME_TRACK']

/**
 * @param state the router state the screen is opened with, such as the project «Zeit erfassen»
 *   hands over
 */
async function render(permissions = TRACKER, modules?: string[], state?: unknown) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[{ pathname: '/zeiten', state }]}>
        <AuthContext.Provider value={session(permissions, modules)}>
          <QueryClientProvider client={client}>
            <TimeEntryPage />
          </QueryClientProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
  })
  await settle()
}

const text = () => container.textContent ?? ''

/** The line for a new entry, or the line open in a row. */
function line(name: 'Neuer Eintrag' | 'Eintrag bearbeiten' = 'Neuer Eintrag'): HTMLFormElement {
  const form = container.querySelector(`form[aria-label="${name}"]`)
  if (form === null) throw new Error(`no form ${name}`)
  return form as HTMLFormElement
}

/** The control a label points at, inside one line. */
function control(label: string, scope: ParentNode = line()): HTMLInputElement {
  const caption = [...scope.querySelectorAll('label')].find((entry) => entry.textContent === label)
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

async function press(target: Element, key: string) {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
  })
  await settle()
}

async function click(element: Element) {
  await act(async () => {
    ;(element as HTMLElement).click()
  })
  await settle()
}

function button(label: string): HTMLButtonElement {
  const found = [...document.querySelectorAll('button')].filter(
    (entry) => entry.textContent?.trim() === label || entry.getAttribute('aria-label') === label,
  )
  const last = found.at(-1)
  if (last === undefined) throw new Error(`no button ${label}`)
  return last
}

function day(title: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('nav[aria-label="Tage der Woche"] button')].find(
    (entry) => entry.getAttribute('aria-label')?.startsWith(title),
  )
  if (found === undefined) throw new Error(`no day ${title}`)
  return found as HTMLButtonElement
}

/** The rows of the day list, as their text. */
const rows = () =>
  [...container.querySelectorAll('ul[aria-label="Einträge des Tages"] > li')].map(
    (row) => row.textContent ?? '',
  )

function row(containing: string): HTMLElement {
  const found = [...container.querySelectorAll('ul[aria-label="Einträge des Tages"] > li')].find(
    (entry) => entry.textContent?.includes(containing),
  )
  if (found === undefined) throw new Error(`no row ${containing}`)
  return found as HTMLElement
}

const writes = () => requests.filter((request) => request.method !== 'GET')

describe('TimeEntryPage', () => {
  it('timeEntryPageShowsTheWeekTest', async () => {
    await render()

    expect(container.querySelector('h1')?.textContent).toBe('Meine Zeiten')
    expect(text()).toContain('KW 48 · 23.–29. Nov. 2026')
    expect(requests[0].url).toBe(`${BASE}/mine?from=2026-11-23&to=2026-11-29`)
    expect(day('Montag').textContent).toBe('Mo 23.7:45')
    expect(day('Mittwoch').getAttribute('aria-label')).toBe('Mittwoch, 25. November: 6 Std. 30 Min.')
    expect(day('Mittwoch').getAttribute('aria-pressed')).toBe('true')
    expect(day('Donnerstag').textContent).toBe('Do 26.0:00')
    expect(day('Samstag').textContent).toBe('Sa 28.–')
    expect(container.querySelector('nav[aria-label="Tage der Woche"]')?.textContent).toContain(
      'Woche22:25',
    )
  })

  it('timeEntryPageListsTheChosenDayTest', async () => {
    await render()

    expect(text()).toContain('Mittwoch, 25. November')
    expect(rows()).toHaveLength(3)
    expect(row('Wireframes').textContent).toContain('08:00–10:30')
    expect(row('Wireframes').textContent).toContain('P-00012 Website · Muster AG')
    expect(row('Wireframes').textContent).toContain('offen')
    expect(row('Weiterbildung').textContent).toContain('intern')
    expect(row('Weiterbildung').textContent).toContain('nicht verrechenbar')
  })

  /** A day after today cannot be chosen, and neither can the week after this one. */
  it('timeEntryPageKeepsTheFutureShutTest', async () => {
    await render()

    await click(day('Donnerstag'))

    expect(day('Donnerstag').getAttribute('aria-disabled')).toBe('true')
    expect(text()).toContain('Mittwoch, 25. November')
    expect(day('Dienstag').getAttribute('aria-disabled')).toBeNull()
    expect(button('Nächste Woche').disabled).toBe(true)
    expect(button('Heute').disabled).toBe(true)
  })

  /** A day after today says why it cannot be chosen, not only by looking dimmed (#132). */
  it('timeEntryPageSaysWhyAFutureDayIsShutTest', async () => {
    await render()

    const saturday = day('Samstag')

    expect(saturday.title).toBe('Liegt in der Zukunft. Zeit wird erfasst, wenn sie geleistet ist.')
    expect(saturday.getAttribute('aria-label')).toContain('Liegt in der Zukunft')
    expect(day('Montag').title).toBe('')
  })

  /** A past Saturday is a day like any other: chosen, and the time goes to it (#132). */
  it('timeEntryPageRecordsOnAPastSaturdayTest', async () => {
    await render()
    await click(button('Vorherige Woche'))

    await click(day('Samstag'))
    expect(day('Samstag').getAttribute('aria-disabled')).toBeNull()
    expect(text()).toContain('Samstag, 21. November')
    await type(control('Dauer'), '2')
    await press(control('Dauer'), 'Enter')

    expect(writes()[0].body).toMatchObject({ workDate: '2026-11-21', durationMinutes: 120 })
  })

  it('timeEntryPageGoesToTheWeekBeforeTest', async () => {
    await render()

    await click(button('Vorherige Woche'))

    expect(requests.at(-1)?.url).toBe(`${BASE}/mine?from=2026-11-16&to=2026-11-22`)
    expect(text()).toContain('KW 47 · 16.–22. Nov. 2026')
    expect(text()).toContain('Mittwoch, 18. November')
    expect(text()).toContain('Keine Zeiten an diesem Tag')
    expect(button('Nächste Woche').disabled).toBe(false)

    await click(button('Heute'))
    expect(text()).toContain('KW 48 · 23.–29. Nov. 2026')
  })

  it('timeEntryPageChoosesADayTest', async () => {
    await render()

    await click(day('Dienstag'))

    expect(text()).toContain('Dienstag, 24. November')
    expect(rows()).toHaveLength(1)
    expect(rows()[0]).toContain('Workshop')
    expect(container.querySelector('form[aria-label="Neuer Eintrag"]')?.closest('section')?.textContent).toContain(
      'Erfassen für Dienstag, 24. November',
    )
  })

  /**
   * The issue's core: a project, its suggested service, a duration, a text, Enter. Project and
   * service stay, the focus goes back to the duration for the next entry.
   */
  it('timeEntryPageRecordsWithEnterTest', async () => {
    await render()

    await type(control('Projekt oder Kunde'), 'web', 260)
    await press(control('Projekt oder Kunde'), 'Enter')
    expect(control('Projekt oder Kunde').value).toBe('P-00012 Website · Muster AG')
    expect(control('Leistung').value).toBe('Konzeption')

    await type(control('Dauer'), '1:30')
    // No reading under the field while typing (#131): the tooltip names the forms.
    expect(text()).not.toContain('1 Std. 30 Min.')
    await type(control('Text'), 'Wireframes')
    await press(control('Text'), 'Enter')

    expect(writes()).toEqual([
      {
        method: 'POST',
        url: `${BASE}/mine`,
        body: {
          workDate: '2026-11-25',
          durationMinutes: 90,
          startTime: null,
          endTime: null,
          projectId: 12,
          partnerId: null,
          productId: 31,
          description: 'Wireframes',
          billable: null,
        },
      },
    ])
    expect(control('Projekt oder Kunde').value).toBe('P-00012 Website · Muster AG')
    expect(control('Leistung').value).toBe('Konzeption')
    expect(control('Dauer').value).toBe('')
    expect(control('Text').value).toBe('')
    expect(document.activeElement).toBe(control('Dauer'))
    expect(text()).toContain('Gespeichert: 1 Std. 30 Min. am Mittwoch, 25. November.')
  })

  /**
   * On a project the list of services asks with the project: the server offers what can be
   * billed there, by its rate (#136). Without one it asks for services in hours.
   */
  it('timeEntryPageAsksServicesForTheProjectTest', async () => {
    await render()

    await type(control('Leistung'), 'sup', 260)
    const withoutProject = requests.filter((request) => request.url.includes('/lookups/services'))
    await type(control('Projekt oder Kunde'), 'web', 260)
    await press(control('Projekt oder Kunde'), 'Enter')
    await type(control('Leistung'), 'kon', 260)

    expect(withoutProject.at(-1)?.url).toBe(`${BASE}/lookups/services?search=sup`)
    expect(requests.filter((request) => request.url.includes('/lookups/services')).at(-1)?.url).toBe(
      `${BASE}/lookups/services?search=kon&projectId=12`,
    )
  })

  /** A range goes as its two times; a duration as minutes alone. */
  it('timeEntryPageRecordsARangeTest', async () => {
    await render()

    await type(control('Dauer'), '9-10:30')
    await press(control('Dauer'), 'Enter')

    expect(writes()[0].body).toMatchObject({
      durationMinutes: null,
      startTime: '09:00',
      endTime: '10:30',
      projectId: null,
      partnerId: null,
      billable: null,
    })
  })

  /** A range with points, the way «9.30 Uhr» is written, goes out as two times of day (#131). */
  it('timeEntryPageRecordsARangeWithPointsTest', async () => {
    await render()

    await type(control('Dauer'), '9.3-16.15')
    await press(control('Dauer'), 'Enter')

    expect(writes()[0].body).toMatchObject({
      durationMinutes: null,
      startTime: '09:30',
      endTime: '16:15',
    })
  })

  /** The refusal waits for the attempt to save, like every other complaint of the line (#131). */
  it('timeEntryPageRefusesAnUnreadableDurationTest', async () => {
    await render()

    await type(control('Dauer'), '23-1')
    expect(text()).not.toContain('über Mitternacht')
    await press(control('Dauer'), 'Enter')

    expect(writes()).toEqual([])
    expect(text()).toContain('über Mitternacht')
    expect(control('Dauer').getAttribute('aria-invalid')).toBe('true')
  })

  /** A name typed and never taken would make the hour internal; the line says so instead. */
  it('timeEntryPageRefusesATargetNotTakenTest', async () => {
    await render()

    await type(control('Projekt oder Kunde'), 'muster', 260)
    await press(control('Projekt oder Kunde'), 'Escape')
    await type(control('Dauer'), '1')
    await press(control('Dauer'), 'Enter')

    expect(writes()).toEqual([])
    expect(text()).toContain('Einen Treffer aus der Liste wählen oder das Feld leeren.')
  })

  it('timeEntryPageFillsTheLineFromARecentChipTest', async () => {
    await render()

    await click(button('P-00012 Website · Konzeption'))

    expect(control('Projekt oder Kunde').value).toBe('P-00012 Website · Muster AG')
    expect(control('Leistung').value).toBe('Konzeption')
    expect(document.activeElement).toBe(control('Dauer'))

    await type(control('Dauer'), '2h')
    await press(control('Dauer'), 'Enter')
    expect(writes()[0].body).toMatchObject({ projectId: 12, productId: 31, durationMinutes: 120 })
  })

  /** Billable with a customer and no service is named at the service before anything is sent. */
  it('timeEntryPageAsksForAServiceWhenBillableTest', async () => {
    await render()

    await type(control('Projekt oder Kunde'), 'K-00011', 260)
    await press(control('Projekt oder Kunde'), 'Enter')
    expect(control('verrechenbar').checked).toBe(true)
    await type(control('Dauer'), '1')
    await press(control('Dauer'), 'Enter')

    expect(writes()).toEqual([])
    expect(text()).toContain('Verrechenbar braucht eine Leistung.')

    await click(control('verrechenbar'))
    await press(control('Dauer'), 'Enter')
    expect(writes()[0].body).toMatchObject({ partnerId: 11, projectId: null, billable: false })
  })

  /** Internal time is never billable, so the box is off and cannot be ticked. */
  it('timeEntryPageKeepsInternalTimeUnbillableTest', async () => {
    await render()

    expect(control('verrechenbar').checked).toBe(false)
    expect(control('verrechenbar').disabled).toBe(true)
  })

  it('timeEntryPageEmptiesTheLineWithEscapeTest', async () => {
    await render()
    await click(button('P-00012 Website · Konzeption'))

    await press(document.body, 'Escape')

    expect(control('Projekt oder Kunde').value).toBe('')
    expect(control('Leistung').value).toBe('')
  })

  /** Typed duration or text is work; Escape asks before throwing it away. */
  it('timeEntryPageAsksBeforeEmptyingTypedWorkTest', async () => {
    await render()
    await type(control('Dauer'), '1:30')

    await press(document.body, 'Escape')

    expect(document.body.textContent).toContain('Änderungen verwerfen?')
    expect(control('Dauer').value).toBe('1:30')
    await click(button('Verwerfen'))
    expect(control('Dauer').value).toBe('')
  })

  /** A refusal about one field stands at that field, and not a second time above the line. */
  it('timeEntryPageShowsTheBackendMessageAtTheFieldTest', async () => {
    await render()
    writeFailure = {
      status: 400,
      body: {
        detail: 'Muster AG ist deaktiviert.',
        errors: [{ field: 'partnerId', message: 'Muster AG ist deaktiviert.' }],
      },
    }

    await click(button('Muster AG · Support'))
    await type(control('Dauer'), '1')
    await press(control('Dauer'), 'Enter')

    expect(control('Projekt oder Kunde').getAttribute('aria-invalid')).toBe('true')
    expect(text().split('Muster AG ist deaktiviert.')).toHaveLength(2)
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })

  /** A refusal of the entry as a whole stands above the line. */
  it('timeEntryPageShowsAConflictAboveTheLineTest', async () => {
    await render()
    writeFailure = {
      status: 409,
      body: { detail: 'Der Mandant betreibt die Zeiterfassung nicht.' },
    }

    await type(control('Dauer'), '1')
    await press(control('Dauer'), 'Enter')

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Der Mandant betreibt die Zeiterfassung nicht.',
    )
    expect(control('Dauer').value).toBe('1')
  })

  it('timeEntryPageEditsAnEntryInItsRowTest', async () => {
    await render()

    await click(row('Ticket 4711').querySelector('button') as HTMLButtonElement)
    const editing = line('Eintrag bearbeiten')
    expect(control('Projekt oder Kunde', editing).value).toBe('Muster AG (ohne Projekt)')
    expect(control('Dauer', editing).value).toBe('1:00')
    expect(document.activeElement).toBe(control('Dauer', editing))

    await type(control('Dauer', editing), '1:15')
    await press(control('Dauer', editing), 'Enter')

    expect(writes()).toEqual([
      {
        method: 'PUT',
        url: `${BASE}/mine/6`,
        body: {
          workDate: '2026-11-25',
          durationMinutes: 75,
          startTime: null,
          endTime: null,
          projectId: null,
          partnerId: 11,
          productId: 32,
          description: 'Ticket 4711',
          billable: true,
          lockVersion: 2,
        },
      },
    ])
    expect(container.querySelector('form[aria-label="Eintrag bearbeiten"]')).toBeNull()
  })

  /** «Abbrechen» on a changed row asks first, then closes it without a request. */
  it('timeEntryPageCancelsAChangeInItsRowTest', async () => {
    await render()
    await click(row('Ticket 4711').querySelector('button') as HTMLButtonElement)
    await type(control('Dauer', line('Eintrag bearbeiten')), '2')

    await click(button('Abbrechen'))
    expect(document.body.textContent).toContain('Änderungen verwerfen?')
    await click(button('Verwerfen'))

    expect(container.querySelector('form[aria-label="Eintrag bearbeiten"]')).toBeNull()
    expect(writes()).toEqual([])
  })

  it('timeEntryPageCopiesToTodayTest', async () => {
    await render()
    await click(day('Dienstag'))

    await click(button('8:10 intern auf heute kopieren'))

    expect(writes()).toEqual([
      {
        method: 'POST',
        url: `${BASE}/mine`,
        body: {
          workDate: '2026-11-25',
          durationMinutes: 490,
          startTime: null,
          endTime: null,
          projectId: null,
          partnerId: null,
          productId: null,
          description: 'Workshop',
          billable: false,
        },
      },
    ])
    expect(text()).toContain('Auf heute kopiert:')
  })

  it('timeEntryPageDeletesAfterAskingTest', async () => {
    await render()

    await click(button('3:00 intern löschen'))
    expect(document.body.textContent).toContain('Zeiteintrag löschen?')
    expect(writes()).toEqual([])

    await click(button('Löschen'))

    expect(writes()).toEqual([{ method: 'DELETE', url: `${BASE}/mine/7`, body: {} }])
    expect(text()).toContain('Gelöscht: 3 Std., intern.')
  })

  /** «Fortsetzen» starts the stopwatch on the same work and reads the week anew. */
  it('timeEntryPageContinuesAnEntryTest', async () => {
    await render()
    const sheetReads = requests.filter((request) => request.url.startsWith(`${BASE}/mine?`)).length

    await click(button('2:30 P-00012 Website · Muster AG fortsetzen'))

    expect(writes()).toEqual([{ method: 'POST', url: `${BASE}/mine/5/continue`, body: {} }])
    expect(text()).toContain('Stoppuhr läuft: P-00012 Website · Konzeption.')
    expect(requests.filter((request) => request.url.startsWith(`${BASE}/mine?`)).length).toBe(
      sheetReads + 1,
    )
  })

  /** A project completed since takes no new time; the backend's sentence says so. */
  it('timeEntryPageShowsWhyAnEntryCannotBeContinuedTest', async () => {
    await render()
    writeFailure = {
      status: 400,
      body: {
        detail: 'Das Projekt P-00012 ist abgeschlossen und nimmt keine neue Zeit an.',
        errors: [
          {
            field: 'projectId',
            message: 'Das Projekt P-00012 ist abgeschlossen und nimmt keine neue Zeit an.',
          },
        ],
      },
    }

    await click(button('2:30 P-00012 Website · Muster AG fortsetzen'))

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Das Projekt P-00012 ist abgeschlossen',
    )
  })

  it('timeEntryPageContinuesNoReadOnlyEntryTest', async () => {
    await render()
    await click(day('Montag'))

    expect(row('Altbau').querySelector('button[aria-label$="fortsetzen"]')).toBeNull()
  })

  /** The stopwatch is one's own: the week of a colleague offers no «Fortsetzen». */
  it('timeEntryPageContinuesNothingOfAColleagueTest', async () => {
    await render(['TIME_TRACK', 'TIME_READ', 'TIME_WRITE'])
    const owner = control('Zeiten von', container)
    await act(async () => {
      owner.value = '42'
      owner.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await settle()

    expect(row('Ticket 4711').querySelector('button[aria-label$="auf heute kopieren"]')).not.toBeNull()
    expect(row('Ticket 4711').querySelector('button[aria-label$="fortsetzen"]')).toBeNull()
  })

  /** An entry that can only be read says why, and offers neither change nor delete. */
  it('timeEntryPageShowsWhyAnEntryIsReadOnlyTest', async () => {
    await render()
    await click(day('Montag'))

    const archived = row('Altbau')
    expect(archived.textContent).toContain('Seine Zeiten lassen sich nur noch lesen.')
    expect(archived.querySelector('button[aria-label$="löschen"]')).toBeNull()
    expect(archived.textContent).not.toContain('Bearbeiten:')
  })

  /** With the projects off the field searches customers and says so. */
  it('timeEntryPageWithoutProjectsTest', async () => {
    await render(TRACKER, ['TIMETRACKING'])

    expect(control('Kunde')).toBeDefined()
    expect(text()).not.toContain('Projekt oder Kunde')
  })

  it('timeEntryPageWhenTheWeekCannotBeReadTest', async () => {
    sheetFails = true

    await render()

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Das Backend meldet einen Fehler.',
    )
  })

  /** Without TIME_READ there is no «Zeiten von …», and nobody else's times are asked for. */
  it('timeEntryPageWithoutReadRightTest', async () => {
    await render()

    expect(text()).not.toContain('Zeiten von')
    expect(requests.some((request) => request.url.includes('/colleagues'))).toBe(false)
  })

  /** With TIME_READ alone the week of a colleague is read, and nothing is offered to change. */
  it('timeEntryPageShowsTheWeekOfAColleagueTest', async () => {
    await render(['TIME_TRACK', 'TIME_READ'])
    const owner = control('Zeiten von', container)
    expect([...(owner as unknown as HTMLSelectElement).options].map((option) => option.text)).toEqual([
      'Anna Muster (ich)',
      'Beat Keller',
      'Carla Frei (deaktiviert)',
    ])

    await act(async () => {
      owner.value = '42'
      owner.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await settle()

    expect(requests.at(-1)?.url).toBe(`${BASE}/sheet?userId=42&from=2026-11-23&to=2026-11-29`)
    expect(container.querySelector('h1')?.textContent).toBe('Zeiten von Beat Keller')
    expect(container.querySelector('form[aria-label="Neuer Eintrag"]')).toBeNull()
    expect(text()).toContain('TIME_WRITE')
    expect(row('Ticket 4711').querySelector('button')).toBeNull()
  })

  /** With TIME_WRITE the line records for the colleague, without the chips of one's own. */
  it('timeEntryPageRecordsForAColleagueTest', async () => {
    await render(['TIME_TRACK', 'TIME_READ', 'TIME_WRITE'])
    const owner = control('Zeiten von', container)
    await act(async () => {
      owner.value = '42'
      owner.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await settle()

    expect(text()).not.toContain('Zuletzt:')
    await type(control('Dauer'), '2h')
    await press(control('Dauer'), 'Enter')

    expect(writes()[0].url).toBe(`${BASE}?userId=42`)
    expect(writes()[0].body).toMatchObject({ durationMinutes: 120, workDate: '2026-11-25' })
  })

  it('timeEntryPageWithoutTrackRightTest', async () => {
    await render(['TIME_READ'])

    expect(text()).toContain('Keine Berechtigung')
    expect(requests).toEqual([])
  })

  it('timeEntryPageWithTheModuleOffTest', async () => {
    await render(TRACKER, ['PROJECT'])

    expect(text()).toContain('Modul nicht eingeschaltet')
    expect(requests).toEqual([])
  })

  /**
   * «Zeit erfassen» on a project: the project stands in the line, its suggested service — the
   * user's default service where nothing was taken there yet — beside it, the focus on «Dauer».
   */
  it('timeEntryPageOpensOnAHandedOverProjectTest', async () => {
    await render(TRACKER, undefined, { recordOn: WEBSITE })

    expect(control('Projekt oder Kunde').value).toBe('P-00012 Website · Muster AG')
    expect(control('Leistung').value).toBe('Konzeption')
    expect(document.activeElement).toBe(control('Dauer'))
    expect(requests.map((request) => request.url)).toContain(
      `${BASE}/mine/default-service?projectId=12`,
    )

    await type(control('Dauer'), '2h')
    await press(control('Dauer'), 'Enter')

    expect(writes()[0].body).toMatchObject({ projectId: 12, productId: 31, durationMinutes: 120 })
  })

  /** A state that is no project — an origin, an older version — opens the empty line. */
  it('timeEntryPageWithoutAHandedOverProjectTest', async () => {
    await render(TRACKER, undefined, { recordOn: { kind: 'PROJECT' } })

    expect(control('Projekt oder Kunde').value).toBe('')
    expect(requests.some((request) => request.url.includes('/default-service'))).toBe(false)
  })

  /** «verrechenbar» asks the server for the project chosen, and follows its billing mode. */
  it('timeEntryPageAsksForTheDefaultOfBillableTest', async () => {
    websiteMode = 'FIXED_PRICE'
    await render()

    await type(control('Projekt oder Kunde'), 'web', 260)
    await press(control('Projekt oder Kunde'), 'Enter')

    expect(requests.map((request) => request.url)).toContain(
      `${BASE}/lookups/default-billable?projectId=12`,
    )
    expect(control('verrechenbar').checked).toBe(false)
    expect(control('verrechenbar').disabled).toBe(false)
    expect(text()).toContain('Zusatzaufwand ausserhalb der Pauschale')
  })

  /** At a fixed price, extra work may still be ticked as billable, and goes out as ticked. */
  it('timeEntryPageTicksExtraWorkOnAFixedPriceProjectTest', async () => {
    websiteMode = 'FIXED_PRICE'
    await render()
    await type(control('Projekt oder Kunde'), 'web', 260)
    await press(control('Projekt oder Kunde'), 'Enter')

    await click(control('verrechenbar'))
    await type(control('Dauer'), '1')
    await press(control('Dauer'), 'Enter')

    expect(writes()[0].body).toMatchObject({ projectId: 12, billable: true })
  })

  /** At a fixed price and untouched, no service is asked for: the hour is not billable. */
  it('timeEntryPageRecordsWithoutServiceAtAFixedPriceTest', async () => {
    websiteMode = 'FIXED_PRICE'
    await render()
    await type(control('Projekt oder Kunde'), 'web', 260)
    await press(control('Projekt oder Kunde'), 'Enter')
    await type(control('Leistung'), '')

    await type(control('Dauer'), '1')
    await press(control('Dauer'), 'Enter')

    expect(control('Leistung').getAttribute('aria-invalid')).toBeNull()
    expect(writes()[0].body).toMatchObject({ projectId: 12, productId: null, billable: null })
  })

  /** «Nicht verrechenbar» locks the box, and its tooltip says why in the server's words. */
  it('timeEntryPageLocksBillableOnAProjectNotBilledTest', async () => {
    websiteMode = 'NOT_BILLABLE'
    await render()

    await type(control('Projekt oder Kunde'), 'web', 260)
    await press(control('Projekt oder Kunde'), 'Enter')

    expect(control('verrechenbar').checked).toBe(false)
    expect(control('verrechenbar').disabled).toBe(true)
    expect(text()).toContain('Das Projekt P-00012 ist als «Nicht verrechenbar» vereinbart.')
  })

  /**
   * An entry billable before its project was set to «Nicht verrechenbar» keeps its yes: the box
   * shows it and may be switched off, and a change of the text sends it as it stands.
   */
  it('timeEntryPageKeepsTheYesOfAnEntryOnAProjectNotBilledTest', async () => {
    websiteMode = 'NOT_BILLABLE'
    await render()

    await click(row('Wireframes').querySelector('button') as HTMLButtonElement)
    const editing = line('Eintrag bearbeiten')
    expect(control('verrechenbar', editing).checked).toBe(true)
    expect(control('verrechenbar', editing).disabled).toBe(false)

    await type(control('Text', editing), 'Wireframes, zweite Runde')
    await press(control('Text', editing), 'Enter')

    expect(writes()[0].body).toMatchObject({ projectId: 12, billable: true })
  })

  // --- billed entries (#127, backend ADR-0163) -------------------------------------

  /** On a draft: the badge leads to the draft with INVOICE_READ, and back to «Meine Zeiten». */
  it('timeEntryPageLinksAnEntryOnADraftTest', async () => {
    billedEntries = [DRAFTED]

    await render(['TIME_TRACK', 'INVOICE_READ'])

    const badge = [...row('Review mit Kunde').querySelectorAll('a')].find(
      (link) => link.textContent === 'im Entwurf',
    )
    expect(badge?.getAttribute('href')).toBe('/rechnungen/77')
    expect(badge?.getAttribute('title')).toBe('Rechnungsentwurf öffnen')
  })

  /** Billed: the badge names the invoice, and links it only with INVOICE_READ. */
  it('timeEntryPageNamesTheInvoiceOfABilledEntryTest', async () => {
    billedEntries = [INVOICED]

    await render()

    expect(row('Konzept abgenommen').textContent).toContain('verrechnet RE-2026-0042')
    expect(row('Konzept abgenommen').querySelector('a')).toBeNull()
  })

  /** A billed entry offers neither change nor delete; a lock says why instead. */
  it('timeEntryPageLocksABilledEntryTest', async () => {
    billedEntries = [INVOICED]

    await render()

    const billed = row('Konzept abgenommen')
    expect(billed.textContent).not.toContain('Bearbeiten:')
    expect(billed.querySelector('button[aria-label$="löschen"]')).toBeNull()
    expect(billed.querySelector('button[aria-label$="fortsetzen"]')).toBeNull()
    const lock = billed.querySelector('button[aria-label$="gesperrt"]')
    expect(lock).not.toBeNull()
    const reason = document.getElementById(lock?.getAttribute('aria-describedby') ?? '')
    expect(reason?.textContent).toBe(
      'Der Eintrag ist mit der Rechnung RE-2026-0042 verrechnet und lässt sich nicht ändern.',
    )
  })

  /** «Vom Entwurf lösen» asks first, then takes the entry off and says so. */
  it('timeEntryPageReleasesAnEntryFromItsDraftTest', async () => {
    billedEntries = [DRAFTED]
    await render(['TIME_TRACK', 'TIME_BILL'])

    await click(button('1:10 P-00012 Website · Muster AG vom Entwurf lösen'))
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      'Das geht nur, wenn seine Position im Entwurf schon entfernt ist',
    )
    await click(button('Lösen'))

    expect(writes()).toEqual([
      {
        method: 'POST',
        url: '/api/tenants/1/time-tracking/billing/release',
        body: { entryIds: [10] },
      },
    ])
    expect(text()).toContain('Vom Entwurf gelöst: 1 Eintrag, wieder offen.')
  })

  /** The position still stands on the draft: the backend's sentence stands in the question. */
  it('timeEntryPageShowsARefusedReleaseTest', async () => {
    billedEntries = [DRAFTED]
    await render(['TIME_TRACK', 'TIME_BILL'])
    writeFailure = {
      status: 409,
      body: {
        detail: 'Die Position steht noch auf dem Entwurf. Erst die Position entfernen, dann lösen.',
        entryIds: [10],
      },
    }

    await click(button('1:10 P-00012 Website · Muster AG vom Entwurf lösen'))
    await click(button('Lösen'))

    expect(document.querySelector('[role="dialog"] [role="alert"]')?.textContent).toContain(
      'Die Position steht noch auf dem Entwurf.',
    )
  })

  /** TIME_TRACK alone does not take an entry off its draft, nor does an entry billed already. */
  it('timeEntryPageOffersNoReleaseWithoutTheBillRightTest', async () => {
    billedEntries = [DRAFTED, INVOICED]
    await render()
    expect(row('Review mit Kunde').querySelector('button[aria-label$="vom Entwurf lösen"]')).toBeNull()

    act(() => root.unmount())
    root = createRoot(container)
    await render(['TIME_TRACK', 'TIME_BILL'])
    expect(row('Review mit Kunde').querySelector('button[aria-label$="vom Entwurf lösen"]')).not.toBeNull()
    expect(row('Konzept abgenommen').querySelector('button[aria-label$="vom Entwurf lösen"]')).toBeNull()
  })
})
