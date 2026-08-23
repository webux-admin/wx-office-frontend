// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { composeDueAt } from '../../lib/dueAt'
import type { OfferReminder } from '../../lib/types'
import { OfferReminders } from './OfferReminders'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1
const BASE = `/api/tenants/${TENANT}/offers/42`

/** A reminder whose moment is long past, so it counts as due whenever the test runs. */
const OVERDUE: OfferReminder = {
  id: 5,
  dueAt: '2020-01-06T08:00:00Z',
  note: 'Anrufen',
  done: false,
  createdAt: '2019-12-20T08:00:00Z',
  createdBy: 'muster',
}

let container: HTMLDivElement
let root: Root
/** The rows the stub holds, rewritten by the write endpoints like the backend. */
let rows: OfferReminder[]
let sent: { url: string; method: string; body: unknown }[]

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

function stubFetch() {
  sent = []
  vi.stubGlobal('fetch', (url: string, options?: RequestInit) => {
    const method = options?.method ?? 'GET'
    const body = options?.body === undefined ? undefined : JSON.parse(String(options.body))
    sent.push({ url, method, body })

    if (method === 'POST') {
      const asked = body as { dueAt: string; note?: string }
      const created: OfferReminder = {
        id: 99,
        dueAt: asked.dueAt,
        note: asked.note,
        done: false,
        createdAt: '2026-08-23T08:00:00Z',
        createdBy: 'muster',
      }
      rows = [...rows, created]
      return json(created, 201)
    }
    if (method === 'PUT') {
      const asked = body as { dueAt: string; note?: string; done: boolean }
      const id = Number(url.slice(url.lastIndexOf('/') + 1))
      rows = rows.map((row) =>
        row.id === id
          ? {
              ...row,
              dueAt: asked.dueAt,
              note: asked.note,
              done: asked.done,
              doneAt: asked.done ? '2026-08-23T09:00:00Z' : undefined,
              doneBy: asked.done ? 'muster' : undefined,
            }
          : row,
      )
      return json(rows.find((row) => row.id === id))
    }
    return json(rows)
  })
}

beforeEach(() => {
  rows = []
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

async function render(mayWrite = true, cancelled = false): Promise<void> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <OfferReminders
          tenantId={TENANT}
          base={BASE}
          documentId={42}
          mayWrite={mayWrite}
          cancelled={cancelled}
        />
      </QueryClientProvider>,
    )
  })
  await settle()
}

function text(): string {
  return document.body.textContent ?? ''
}

function buttonNamed(label: string): HTMLButtonElement {
  const found = [...document.querySelectorAll('button')].find(
    (button) => button.textContent?.trim() === label,
  )
  if (found === undefined) throw new Error(`no button named ${label}`)
  return found as HTMLButtonElement
}

async function press(label: string) {
  await act(async () => {
    buttonNamed(label).dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await settle()
}

function byLabel<T extends HTMLElement>(label: string): T {
  const found = [...document.querySelectorAll('label')].find(
    (candidate) => candidate.textContent?.trim() === label,
  )
  const control = found?.htmlFor ? document.getElementById(found.htmlFor) : null
  if (!control) throw new Error(`Kein Feld mit der Beschriftung "${label}"`)
  return control as T
}

/** Types into a field the way a browser does: set the value, then fire the native event. */
function type(control: HTMLInputElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setValue?.call(control, value)
  act(() => {
    control.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('OfferReminders', () => {
  it('offerRemindersCreateSendsTheComposedDueAtTest', async () => {
    await render()

    await press('Erinnerung hinzufügen')
    type(byLabel<HTMLInputElement>('Datum'), '2026-09-01')
    type(byLabel<HTMLInputElement>('Uhrzeit'), '08:30')
    type(byLabel<HTMLInputElement>('Notiz'), 'Rückruf wegen Rabatt')
    await press('Hinzufügen')

    const posts = sent.filter((call) => call.method === 'POST')
    expect(posts).toHaveLength(1)
    expect(posts[0].url).toBe(`${BASE}/reminders`)
    expect(posts[0].body).toEqual({
      dueAt: composeDueAt('2026-09-01', '08:30'),
      note: 'Rückruf wegen Rabatt',
    })
    // The list is read again and shows the new reminder.
    expect(text()).toContain('Rückruf wegen Rabatt')
  })

  it('offerRemindersMarkAsDoneSendsTheWholeRowTest', async () => {
    rows = [OVERDUE]
    await render()
    expect(text()).toContain('Anrufen')
    expect(text()).toContain('fällig')

    await press('Erledigt')

    const puts = sent.filter((call) => call.method === 'PUT')
    expect(puts).toHaveLength(1)
    expect(puts[0].url).toBe(`${BASE}/reminders/5`)
    expect(puts[0].body).toEqual({
      dueAt: '2020-01-06T08:00:00Z',
      note: 'Anrufen',
      done: true,
    })
    expect(buttonNamed('Wieder öffnen')).toBeDefined()
    expect(text()).toContain('Erledigt')
  })

  it('offerRemindersReopenClearsTheDoneMarkTest', async () => {
    rows = [{ ...OVERDUE, done: true, doneAt: '2026-08-23T09:00:00Z', doneBy: 'muster' }]
    await render()

    await press('Wieder öffnen')

    const puts = sent.filter((call) => call.method === 'PUT')
    expect(puts[0].body).toEqual({
      dueAt: '2020-01-06T08:00:00Z',
      note: 'Anrufen',
      done: false,
    })
    expect(buttonNamed('Erledigt')).toBeDefined()
  })

  it('offerRemindersDeleteAsksFirstTest', async () => {
    rows = [OVERDUE]
    await render()

    await press('Löschen')
    // Nothing left the browser yet: the dialog asks first.
    expect(sent.some((call) => call.method === 'DELETE')).toBe(false)
  })

  it('offerRemindersOnACancelledOfferOnlyTheDoneMarkMovesTest', async () => {
    rows = [OVERDUE]
    await render(true, true)

    expect(buttonNamed('Erledigt')).toBeDefined()
    expect(() => buttonNamed('Erinnerung hinzufügen')).toThrow()
    expect(() => buttonNamed('Bearbeiten')).toThrow()
    expect(() => buttonNamed('Löschen')).toThrow()
    expect(text()).toContain('storniert')
  })

  it('offerRemindersWithoutTheWriteRightShowOnlyTheListTest', async () => {
    rows = [OVERDUE]
    await render(false, false)

    expect(() => buttonNamed('Erledigt')).toThrow()
    expect(() => buttonNamed('Erinnerung hinzufügen')).toThrow()
  })
})
