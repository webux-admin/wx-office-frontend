// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import { timeSheetKey } from '../lib/timetracking'
import type {
  RunningTimer,
  TimeEntry,
  TimeRecentTarget,
  TimeServiceChoice,
  TimeTargetChoice,
} from '../lib/types'
import { TimerButton } from './TimerButton'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1
const BASE = '/api/tenants/1/time-entries'
const TIMER = `${BASE}/mine/timer`

/** A moment on Wednesday, 25 November 2026, on the clock of this browser. */
function at(day: number, hours: number, minutes: number, seconds = 0): Date {
  return new Date(2026, 10, day, hours, minutes, seconds)
}

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
const SERVICE_NAMES: Record<number, string> = { 31: 'Konzeption', 32: 'Support' }

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
]

/** Started at 09:17:20 on the website project: at ten o'clock it runs 42 minutes. */
function timer(overrides: Partial<RunningTimer> = {}): RunningTimer {
  return {
    id: 3,
    userId: 1,
    startedAt: at(25, 9, 17, 20).toISOString(),
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
    elapsedMinutes: 42,
    longRunning: false,
    endRequired: false,
    lockVersion: 4,
    ...overrides,
  }
}

/** Forgotten last night: started yesterday at 19:30, fourteen hours and a half ago. */
const OVERNIGHT = timer({
  startedAt: at(24, 19, 30).toISOString(),
  elapsedMinutes: 870,
  longRunning: true,
  notice: 'Die Stoppuhr läuft seit 14 Std. — stimmt das?',
})

/** Forgotten for more than a day: started on Monday at 08:00. */
const FORGOTTEN = timer({
  startedAt: at(23, 8, 0).toISOString(),
  elapsedMinutes: 3000,
  longRunning: true,
  endRequired: true,
  notice: 'Die Stoppuhr läuft seit 50 Std., länger als einen Tag. Zum Anhalten das echte Ende angeben.',
})

/** What a stop writes: the work of the stopwatch as one entry. */
const WRITTEN: TimeEntry = {
  id: 77,
  userId: 1,
  workDate: '2026-11-25',
  durationMinutes: 90,
  startTime: '08:30',
  endTime: '10:00',
  projectId: 12,
  projectNumber: 'P-00012',
  projectName: 'Website',
  partnerId: 11,
  customerName: 'Muster AG',
  productId: 31,
  serviceName: 'Konzeption',
  billable: true,
  state: 'OPEN',
  editable: true,
  lockVersion: 0,
}

function session(permissions = ['TIME_TRACK'], modules = ['TIMETRACKING', 'PROJECT']): AuthState {
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
let client: QueryClient
/** Every request: method, address and body. */
let requests: { method: string; url: string; body: unknown }[]
/** The stopwatch the server holds. */
let running: RunningTimer | null
/** What the next request to this method and address answers instead, once. */
let refusal: { method: string; url: string; status: number; body: unknown } | null

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  )
}

const noContent = () => Promise.resolve(new Response(null, { status: 204 }))

/** The stopwatch as the server makes it from what a start or a change sent. */
function applied(base: RunningTimer, body: Record<string, unknown>): RunningTimer {
  const projectId = (body.projectId as number | undefined) ?? null
  const productId = (body.productId as number | undefined) ?? null
  return {
    ...base,
    projectId,
    projectNumber: projectId === 12 ? 'P-00012' : null,
    projectName: projectId === 12 ? 'Website' : null,
    partnerId: projectId === 12 ? 11 : ((body.partnerId as number | undefined) ?? null),
    customerName: projectId === 12 || body.partnerId === 11 ? 'Muster AG' : null,
    productId,
    serviceName: productId === null ? null : SERVICE_NAMES[productId],
    description: (body.description as string | undefined) ?? null,
    billable: (body.billable as boolean | undefined) ?? (projectId !== null || body.partnerId !== undefined),
    startedAt: (body.startedAt as string | undefined) ?? base.startedAt,
  }
}

function serve(method: string, url: string, body: Record<string, unknown>): Promise<Response> {
  const path = url.split('?')[0]
  const query = new URL(url, 'http://localhost').searchParams
  if (refusal !== null && refusal.method === method && refusal.url === path) {
    const { status, body: answer } = refusal
    refusal = null
    return json(answer, status)
  }
  if (path === TIMER && method === 'GET') return running === null ? noContent() : json(running)
  if (path === TIMER && method === 'POST') {
    running = applied(timer({ startedAt: new Date().toISOString(), elapsedMinutes: 0 }), body)
    return json({ timer: running, started: true, stoppedEntries: [] }, 201)
  }
  if (path === TIMER && method === 'PUT' && running !== null) {
    running = { ...applied(running, body), lockVersion: running.lockVersion + 1 }
    return json(running)
  }
  if (path === `${TIMER}/stop` && running !== null) {
    running = null
    return json([WRITTEN])
  }
  if (path === TIMER && method === 'DELETE' && running !== null) {
    running = null
    return noContent()
  }
  if (path.startsWith(TIMER)) {
    return json({ detail: 'Es läuft keine Stoppuhr. Vielleicht wurde sie auf einem anderen Gerät angehalten; neu laden.' }, 404)
  }
  if (path === `${BASE}/mine/recent`) return json(RECENT)
  if (path === `${BASE}/mine/default-service`) {
    return query.get('projectId') === '12' ? json(CONCEPT) : noContent()
  }
  if (path === `${BASE}/lookups/targets`) {
    const search = (query.get('search') ?? '').toLowerCase()
    return json([WEBSITE, MUSTER].filter((target) =>
      [target.projectNumber, target.projectName, target.customerName].join(' ').toLowerCase().includes(search),
    ))
  }
  if (path === `${BASE}/lookups/services`) {
    const search = (query.get('search') ?? '').toLowerCase()
    return json([CONCEPT, SUPPORT].filter((service) => service.name.toLowerCase().includes(search)))
  }
  return json({})
}

function stubFetch() {
  requests = []
  refusal = null
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    requests.push({ method, url, body })
    return serve(method, url, body ?? {})
  })
}

beforeEach(() => {
  // Only the date is ours, so the debounce of the lists runs on real timers; ten o'clock.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(at(25, 10, 0))
  running = null
  stubFetch()
  document.title = 'webux ERP'
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

/** Lets timers run out and answers arrive. */
async function settle(ms = 0) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms))
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function render(
  place: 'sidebar' | 'rail' | 'bar' = 'sidebar',
  auth: AuthState = session(),
) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <AuthContext.Provider value={auth}>
        <QueryClientProvider client={client}>
          <TimerButton place={place} />
        </QueryClientProvider>
      </AuthContext.Provider>,
    )
  })
  await settle()
}

/** The button in the sidebar, whatever it says. */
function face(): HTMLButtonElement {
  const found = container.querySelector('button')
  if (found === null) throw new Error('no stopwatch button')
  return found
}

/** The open dialog; one fading out sits in an inert layer and takes nothing any more. */
function dialog(): HTMLElement | null {
  const open = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].filter(
    (box) => box.closest('[inert]') === null,
  )
  return open.at(-1) ?? null
}

function button(label: string): HTMLButtonElement {
  const found = [...document.querySelectorAll('button')].filter(
    (entry) => entry.textContent?.trim() === label || entry.getAttribute('aria-label') === label,
  )
  const last = found.at(-1)
  if (last === undefined) throw new Error(`no button ${label}`)
  return last
}

function control(label: string): HTMLInputElement {
  const caption = [...document.querySelectorAll('label')].find((entry) => entry.textContent === label)
  const found = caption ? document.getElementById(caption.htmlFor) : null
  if (found === null) throw new Error(`no field labelled ${label}`)
  return found as HTMLInputElement
}

async function click(element: Element) {
  await act(async () => {
    ;(element as HTMLElement).click()
  })
  await settle()
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

const writes = () => requests.filter((request) => request.method !== 'GET')
const announced = () => container.querySelector('[role="status"][aria-live]')?.textContent ?? ''

describe('TimerButton', () => {
  it('timerButtonOffersToStartTest', async () => {
    await render()

    expect(face().textContent).toBe('Zeit starten')
    expect(face().getAttribute('aria-haspopup')).toBe('dialog')
    expect(requests).toEqual([{ method: 'GET', url: TIMER, body: undefined }])
    expect(document.title).toBe('webux ERP')
  })

  /** An empty field and «Start»: the stopwatch runs on internal time, with nothing sent. */
  it('timerButtonStartsOnInternalTimeTest', async () => {
    await render()

    await click(face())
    expect(dialog()?.textContent).toContain('Stoppuhr starten')
    expect(document.activeElement).toBe(control('Projekt oder Kunde'))

    await click(button('Start'))

    expect(writes()).toEqual([{ method: 'POST', url: TIMER, body: {} }])
    expect(dialog()).toBeNull()
    expect(face().textContent).toContain('0:00')
    expect(face().textContent).toContain('· intern')
    expect(announced()).toBe('Stoppuhr läuft: intern.')
  })

  /** The chips «Zuletzt» of the quick line fill the field the same way. */
  it('timerButtonStartsFromARecentChipTest', async () => {
    await render()
    await click(face())

    await click(button('P-00012 Website · Konzeption'))
    await click(button('Start'))

    expect(writes()[0].body).toEqual({ projectId: 12, productId: 31 })
    expect(face().textContent).toContain('P-00012 Website · Konzeption')
  })

  /** A project, Enter on the hit, Enter again: the suggested service comes along. */
  it('timerButtonStartsWithEnterTest', async () => {
    await render()
    await click(face())

    await type(control('Projekt oder Kunde'), 'Web', 250)
    await press(control('Projekt oder Kunde'), 'Enter')
    expect(control('Leistung').value).toBe('Konzeption')
    await press(control('Projekt oder Kunde'), 'Enter')

    expect(writes()).toEqual([{ method: 'POST', url: TIMER, body: { projectId: 12, productId: 31 } }])
  })

  it('timerButtonShowsTheRunningStopwatchTest', async () => {
    running = timer()

    await render()

    expect(face().textContent).toBe('Stoppuhr läuft: 0:42· P-00012 Website · Konzeption')
    expect(face().title).toBe('Stoppuhr läuft: 0:42 · P-00012 Website · Konzeption')
    expect(document.title).toBe('▶ 0:42 · webux ERP')
  })

  /** No request goes out to count: the minute turns at the second of the start. */
  it('timerButtonCountsWithAFakeClockTest', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    vi.setSystemTime(at(25, 10, 0))
    running = timer()
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    await act(async () => {
      root.render(
        <AuthContext.Provider value={session()}>
          <QueryClientProvider client={client}>
            <TimerButton place="sidebar" />
          </QueryClientProvider>
        </AuthContext.Provider>,
      )
    })
    // The answer arrives; the clock moves on by nothing worth a minute.
    for (let step = 0; step < 5; step += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
    }
    expect(face().textContent).toContain('0:42')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(19_000)
    })
    expect(face().textContent).toContain('0:42')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000)
    })
    expect(face().textContent).toContain('0:43')
    expect(document.title).toBe('▶ 0:43 · webux ERP')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60 * 60_000)
    })
    expect(face().textContent).toContain('1:43')
    expect(requests.filter((request) => request.url === TIMER)).toHaveLength(1)
  })

  /** The field opens on the stopwatch read anew, with the focus on «Stopp». */
  it('timerButtonOpensTheRunningStopwatchTest', async () => {
    running = timer()
    await render()

    await click(face())

    expect(requests.filter((request) => request.url === TIMER)).toHaveLength(2)
    expect(dialog()?.textContent).toContain('Stoppuhr · 0:42')
    expect(dialog()?.textContent).toContain('Läuft seit 09:17')
    expect(control('Projekt oder Kunde').value).toBe('P-00012 Website · Muster AG')
    expect(control('Leistung').value).toBe('Konzeption')
    expect(control('Text').value).toBe('Wireframes')
    expect(control('Gestartet um').value).toBe('09:17')
    expect(document.activeElement).toBe(button('Stopp'))
    expect(button('Speichern').disabled).toBe(true)
    expect(dialog()?.textContent).not.toContain('Ende um')
  })

  /** Stopped: the entry is written, the week is read anew, and the title is the old one. */
  it('timerButtonStopsTest', async () => {
    running = timer()
    await render()
    client.setQueryData(timeSheetKey(TENANT, 'mine', '2026-11-23', '2026-11-29'), { entries: [] })
    await click(face())

    await click(button('Stopp'))

    expect(writes()).toEqual([{ method: 'POST', url: `${TIMER}/stop`, body: {} }])
    expect(dialog()).toBeNull()
    expect(face().textContent).toBe('Zeit starten')
    expect(announced()).toBe('Angehalten: 1 Std. 30 Min., P-00012 Website · Muster AG.')
    expect(document.title).toBe('webux ERP')
    expect(
      client.getQueryState(timeSheetKey(TENANT, 'mine', '2026-11-23', '2026-11-29'))?.isInvalidated,
    ).toBe(true)
  })

  /** Billable without a service: the field says so before anything is sent, and it runs on. */
  it('timerButtonAsksForAServiceBeforeStoppingTest', async () => {
    running = timer({ productId: null, productNumber: null, serviceName: null })
    await render()
    await click(face())

    await click(button('Stopp'))

    expect(writes()).toEqual([])
    expect(dialog()?.textContent).toContain('Verrechenbar braucht eine Leistung')
    expect(face().textContent).toContain('0:42')
  })

  /**
   * Refused by the backend at the field: the stopwatch runs on, the message stands at the field,
   * and a second «Stopp» saves the service first.
   */
  it('timerButtonKeepsRunningWhenTheStopIsRefusedTest', async () => {
    running = timer()
    await render()
    await click(face())
    refusal = {
      method: 'POST',
      url: `${TIMER}/stop`,
      status: 400,
      body: {
        detail: 'Die Leistung Konzeption ist deaktiviert.',
        errors: [{ field: 'productId', message: 'Die Leistung Konzeption ist deaktiviert.' }],
      },
    }

    await click(button('Stopp'))
    expect(dialog()).not.toBeNull()
    expect(control('Leistung').getAttribute('aria-invalid')).toBe('true')
    expect(dialog()?.textContent).toContain('Die Leistung Konzeption ist deaktiviert.')
    expect(face().textContent).toContain('0:42')

    await type(control('Leistung'), 'Sup', 250)
    await press(control('Leistung'), 'Enter')
    await click(button('Stopp'))

    expect(writes().slice(1)).toEqual([
      {
        method: 'PUT',
        url: TIMER,
        body: { projectId: 12, productId: 32, description: 'Wireframes', billable: true, lockVersion: 4 },
      },
      { method: 'POST', url: `${TIMER}/stop`, body: {} },
    ])
    expect(dialog()).toBeNull()
  })

  /** «habe vor einer halben Stunde angefangen»: the start goes back, on the minute. */
  it('timerButtonChangesTheStartTest', async () => {
    running = timer()
    await render()
    await click(face())

    await type(control('Gestartet um'), '08:50')
    await click(button('Speichern'))

    expect(writes()).toEqual([
      {
        method: 'PUT',
        url: TIMER,
        body: {
          projectId: 12,
          productId: 31,
          description: 'Wireframes',
          billable: true,
          startedAt: at(25, 8, 50).toISOString(),
          lockVersion: 4,
        },
      },
    ])
    expect(dialog()).toBeNull()
    expect(face().textContent).toContain('1:10')
    expect(announced()).toBe('Stoppuhr geändert.')
  })

  it('timerButtonRefusesAStartInTheFutureTest', async () => {
    running = timer()
    await render()
    await click(face())
    refusal = {
      method: 'PUT',
      url: TIMER,
      status: 400,
      body: {
        detail: 'Die Startzeit liegt in der Zukunft. Die Stoppuhr misst, was schon läuft.',
        errors: [{ field: 'startedAt', message: 'Die Startzeit liegt in der Zukunft. Die Stoppuhr misst, was schon läuft.' }],
      },
    }

    await type(control('Gestartet um'), '11:30')
    await click(button('Speichern'))

    expect(control('Gestartet am').getAttribute('aria-invalid')).toBe('true')
    expect(dialog()?.textContent).toContain('Die Startzeit liegt in der Zukunft.')
  })

  /** From twelve hours on the field shows the notice and offers the real end. */
  it('timerButtonShowsTheNoticeFromTwelveHoursTest', async () => {
    running = OVERNIGHT
    await render()

    await click(face())

    expect(dialog()?.textContent).toContain('Die Stoppuhr läuft seit 14 Std. — stimmt das?')
    expect(control('Ende am').value).toBe('2026-11-24')
    expect(control('Ende um').value).toBe('')
    expect(control('Ende um').required).toBe(false)

    await click(button('Stopp'))
    expect(writes()).toEqual([{ method: 'POST', url: `${TIMER}/stop`, body: {} }])
  })

  it('timerButtonStopsAtTheRealEndTest', async () => {
    running = OVERNIGHT
    await render()
    await click(face())

    await type(control('Ende um'), '22:15')
    await click(button('Stopp'))

    expect(writes()).toEqual([
      { method: 'POST', url: `${TIMER}/stop`, body: { correctedEnd: at(24, 22, 15).toISOString() } },
    ])
  })

  /** After 24 hours the real end is required; without it nothing is sent. */
  it('timerButtonRequiresTheEndAfterADayTest', async () => {
    running = FORGOTTEN
    await render()
    await click(face())
    expect(control('Ende um').required).toBe(true)

    await click(button('Stopp'))

    expect(writes()).toEqual([])
    expect(control('Ende um').getAttribute('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(control('Ende am'))
  })

  /** The backend found more than 24 hours although the button had not: the end is asked for. */
  it('timerButtonAsksForTheEndWhenTheServerSaysSoTest', async () => {
    running = timer()
    await render()
    await click(face())
    const sentence =
      'Die Stoppuhr läuft seit 24.11.2026, 09:17 und damit länger als 24 Stunden. Zum Anhalten das echte Ende angeben.'
    refusal = {
      method: 'POST',
      url: `${TIMER}/stop`,
      status: 409,
      body: { detail: sentence, startedAt: running.startedAt, errors: [{ field: 'correctedEnd', message: sentence }] },
    }

    await click(button('Stopp'))

    expect(control('Ende um').required).toBe(true)
    expect(control('Ende um').getAttribute('aria-invalid')).toBe('true')
    expect(dialog()?.textContent).toContain(sentence)
    expect(dialog()?.querySelector('[role="alert"]')).toBeNull()
  })

  /** Changed on another device in between: the message stands above, the field reads anew. */
  it('timerButtonWhenAnotherDeviceChangedItTest', async () => {
    running = timer()
    await render()
    await click(face())
    refusal = {
      method: 'PUT',
      url: TIMER,
      status: 409,
      body: { detail: 'Die Stoppuhr wurde inzwischen auf einem anderen Gerät geändert. Neu laden und wiederholen.' },
    }
    running = { ...running, description: 'Am Telefon geändert', lockVersion: 5 }

    await type(control('Text'), 'Konzept')
    await click(button('Speichern'))

    expect(dialog()?.querySelector('[role="alert"]')?.textContent).toContain(
      'auf einem anderen Gerät geändert',
    )
    expect(control('Text').value).toBe('Am Telefon geändert')
  })

  /** Stopped on the phone in the meantime: the field turns into the start field and says why. */
  it('timerButtonWhenAnotherDeviceStoppedItTest', async () => {
    running = timer()
    await render()
    await click(face())
    running = null

    await click(button('Stopp'))

    expect(dialog()?.querySelector('[role="alert"]')?.textContent).toContain('Es läuft keine Stoppuhr.')
    expect(dialog()?.textContent).toContain('Stoppuhr starten')
    expect(face().textContent).toBe('Zeit starten')
  })

  /** Two devices start at the same moment: this one gets the other's stopwatch and says so. */
  it('timerButtonTakesTheStopwatchOfAnotherDeviceTest', async () => {
    await render()
    await click(face())
    const other = timer({ id: 9, description: 'Vom Telefon', lockVersion: 0 })
    refusal = {
      method: 'POST',
      url: TIMER,
      status: 200,
      body: { timer: other, started: false, stoppedEntries: [] },
    }
    running = other

    await click(button('Start'))

    expect(dialog()?.textContent).toContain('Auf einem anderen Gerät wurde gleichzeitig eine Stoppuhr gestartet.')
    expect(control('Text').value).toBe('Vom Telefon')
    expect(button('Stopp')).toBeDefined()
  })

  it('timerButtonDiscardsAfterAskingTest', async () => {
    running = timer()
    await render()
    await click(face())

    await click(button('Verwerfen'))
    expect(document.body.textContent).toContain('Stoppuhr verwerfen?')
    expect(writes()).toEqual([])
    await click(button('Verwerfen'))

    expect(writes()).toEqual([{ method: 'DELETE', url: TIMER, body: undefined }])
    expect(dialog()).toBeNull()
    expect(face().textContent).toBe('Zeit starten')
    expect(announced()).toBe('Stoppuhr verworfen. Es wurde nichts gespeichert.')
  })

  /** Back on the tab, a stop on the phone arrives without reloading the page. */
  it('timerButtonReadsAnewWhenTheTabComesBackTest', async () => {
    running = timer()
    await render()
    client.setQueryData(timeSheetKey(TENANT, 'mine', '2026-11-23', '2026-11-29'), { entries: [] })
    running = null

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await settle()

    expect(requests.filter((request) => request.url === TIMER)).toHaveLength(2)
    expect(face().textContent).toBe('Zeit starten')
    expect(document.title).toBe('webux ERP')
    expect(
      client.getQueryState(timeSheetKey(TENANT, 'mine', '2026-11-23', '2026-11-29'))?.isInvalidated,
    ).toBe(true)
  })

  /** Folded, the button is a symbol; what it says stands in its name and tooltip. */
  it('timerButtonInTheRailTest', async () => {
    running = timer()

    await render('rail')

    expect(face().textContent).toBe('')
    expect(face().getAttribute('aria-label')).toBe('Stoppuhr läuft: 0:42 · P-00012 Website · Konzeption')
    expect(face().title).toBe('Stoppuhr läuft: 0:42 · P-00012 Website · Konzeption')
  })

  it('timerButtonInTheRailWithoutStopwatchTest', async () => {
    await render('rail')

    expect(face().getAttribute('aria-label')).toBe('Zeit starten')
    expect(face().title).toBe('Zeit starten')
  })

  it('timerButtonWhenTheStopwatchCannotBeReadTest', async () => {
    refusal = { method: 'GET', url: TIMER, status: 500, body: { detail: 'Das Backend meldet einen Fehler.' } }

    await render()

    expect(face().textContent).toBe('Stoppuhr nicht geladen')
    expect(face().title).toBe('Das Backend meldet einen Fehler. Ein Klick lädt sie neu.')

    await click(face())
    expect(face().textContent).toBe('Zeit starten')
  })

  it('timerButtonWithoutTheRightTest', async () => {
    await render('sidebar', session(['TIME_READ']))

    expect(container.querySelector('button')).toBeNull()
    expect(requests).toEqual([])
  })

  it('timerButtonWithTheModuleOffTest', async () => {
    await render('sidebar', session(['TIME_TRACK'], ['PROJECT']))

    expect(container.querySelector('button')).toBeNull()
    expect(requests).toEqual([])
  })

  /** Without the projects the field searches customers. */
  it('timerButtonWithoutProjectsTest', async () => {
    await render('bar', session(['TIME_TRACK'], ['TIMETRACKING']))

    await click(face())

    expect(control('Kunde')).toBeDefined()
  })
})
