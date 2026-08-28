// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import { OUTBOX_PATH, OUTBOX_RIGHTS } from '../lib/outbox'
import type { OutboxMessage, OutboxSummary, Page } from '../lib/types'
import { OutboxListPage } from './OutboxListPage'

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
    completeSecondFactor: () => Promise.reject(new Error('nicht gebraucht')),
    sendSecondFactorCode: () => Promise.resolve(),
    signOut: () => Promise.resolve(),
    switchTenant: () => Promise.resolve(),
    refresh: () => Promise.resolve(),
    can: (permission: string) => permissions.includes(permission),
  }
}

const BOTH = session([OUTBOX_RIGHTS.read, OUTBOX_RIGHTS.send])
const READ_ONLY = session([OUTBOX_RIGHTS.read])

function summary(overrides: Partial<OutboxSummary> = {}): OutboxSummary {
  return {
    id: 7,
    status: 'FAILED',
    recipients: 'kunde@example.ch',
    subject: 'Rechnung RE-2026-0042',
    attempts: 5,
    lastError: 'Unknown host smtp.falsch.ch',
    createdAt: '2026-08-28T09:00:00Z',
    ...overrides,
  }
}

function detail(overrides: Partial<OutboxMessage> = {}): OutboxMessage {
  return {
    id: 7,
    status: 'FAILED',
    senderAddress: 'rechnung@webux.ch',
    to: ['kunde@example.ch'],
    cc: [],
    bcc: [],
    subject: 'Rechnung RE-2026-0042',
    body: 'Guten Tag\n\nBeiliegend die Rechnung.',
    sourceModule: 'DOCUMENT',
    sourceKind: 'INVOICE',
    sourceId: 42,
    attachments: [
      { id: 3, fileName: 'Rechnung_RE-2026-0042.pdf', mediaType: 'application/pdf', byteCount: 20480 },
    ],
    attempts: 5,
    lastError: 'Unknown host smtp.falsch.ch',
    createdAt: '2026-08-28T09:00:00Z',
    ...overrides,
  }
}

let container: HTMLDivElement
let root: Root
/** The rows the list endpoint answers. */
let rows: OutboxSummary[]
/** The message the detail endpoint answers. */
let opened: OutboxMessage
/** Every address the mask asked for, in order — the filter is read off these. */
let asked: string[]
/** Every write the mask sent. */
let written: { url: string; method: string }[]

function json(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

function page(content: OutboxSummary[]): Page<OutboxSummary> {
  return { content, page: 0, size: 50, totalElements: content.length, totalPages: 1, sort: '' }
}

function stubFetch() {
  asked = []
  written = []
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (method !== 'GET') {
      written.push({ url, method })
      return json({})
    }
    asked.push(url)
    // `/messages/7` and `/messages?...` are told apart by what follows the segment.
    if (/\/messages\/\d+$/.test(url)) return json(opened)
    return json(page(rows))
  })
}

beforeEach(() => {
  rows = [summary()]
  opened = detail()
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
  for (let round = 0; round < 6; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

async function render(auth: AuthState = BOTH) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[OUTBOX_PATH]}>
        <AuthContext.Provider value={auth}>
          <QueryClientProvider client={client}>
            <OutboxListPage />
          </QueryClientProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
  })
  await settle()
}

function button(text: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find((entry) =>
    entry.textContent?.includes(text),
  ) as HTMLButtonElement | undefined
}

async function click(element: HTMLElement | undefined | null) {
  expect(element).toBeTruthy()
  await act(async () => {
    ;(element as HTMLElement | null)?.click()
  })
  await settle()
}

/** Opens the first row, the way a click on it does. */
async function openFirstRow() {
  await click(container.querySelector('tbody tr'))
}

describe('OutboxListPage', () => {
  /**
   * Nobody opens this screen to admire what went out. The one question it is opened with is
   * what did not, so the filter starts there.
   */
  it('outboxListPageStartsOnFailedTest', async () => {
    await render()

    expect(asked[0]).toContain('status=FAILED')
    expect(container.textContent).toContain('Fehlgeschlagen')
  })

  it('outboxListPageFiltersOnAStatusTest', async () => {
    await render()
    const select = [...container.querySelectorAll('select')].find((entry) =>
      entry.innerHTML.includes('Gesendet'),
    )

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLSelectElement.prototype,
        'value',
      )?.set
      setter?.call(select, 'SENT')
      select?.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await settle()

    expect(asked.at(-1)).toContain('status=SENT')
  })

  it('outboxListPageShowsTheReasonOfAFailureTest', async () => {
    await render()

    await openFirstRow()

    expect(container.textContent).toContain('Unknown host smtp.falsch.ch')
    expect(container.textContent).toContain('Beiliegend die Rechnung.')
  })

  it('outboxListPageLinksToTheDocumentTest', async () => {
    await render()

    await openFirstRow()

    const link = [...container.querySelectorAll('a')].find((entry) =>
      entry.textContent?.includes('Rechnung öffnen'),
    )
    expect(link?.getAttribute('href')).toBe('/rechnungen/42')
  })

  /** A free mail has no document, and a link into a screen that is not there is worse. */
  it('outboxListPageShowsNoLinkForAFreeMailTest', async () => {
    opened = detail({ sourceModule: undefined, sourceKind: undefined, sourceId: undefined })
    await render()

    await openFirstRow()

    expect(container.textContent).not.toContain('öffnen')
  })

  it('outboxListPageOffersTheAttachmentTest', async () => {
    await render()

    await openFirstRow()

    expect(container.textContent).toContain('Rechnung_RE-2026-0042.pdf')
    expect(container.textContent).toContain('20 KB')
  })

  it('outboxListPageResendsAFailedMessageTest', async () => {
    await render()
    await openFirstRow()

    await click(button('Erneut senden'))

    expect(written.map((entry) => entry.url)).toContain(
      `/api/tenants/${TENANT}/outbox/messages/7/resend`,
    )
  })

  /**
   * A sent mail does not go out twice. The button stays visible but off, with the reason in
   * its tooltip: a resend would be a new mail, and the outbox is the record of what went out.
   */
  it('outboxListPageDoesNotResendASentMessageTest', async () => {
    rows = [summary({ status: 'SENT', attempts: 1, lastError: undefined, sentAt: '2026-08-28T09:05:00Z' })]
    opened = detail({ status: 'SENT', attempts: 1, lastError: undefined, sentAt: '2026-08-28T09:05:00Z' })
    await render()

    await openFirstRow()

    expect(button('Erneut senden')?.disabled).toBe(true)
    expect(button('Erneut senden')?.title).toContain('neue Mail')
  })

  it('outboxListPageHidesResendingWithoutTheRightTest', async () => {
    await render(READ_ONLY)

    await openFirstRow()

    expect(button('Erneut senden')).toBeUndefined()
    expect(container.textContent).toContain('Unknown host smtp.falsch.ch')
  })

  /** Nothing failed is good news, and it reads as such rather than as «keine Treffer». */
  it('outboxListPageSaysSoWhenNothingFailedTest', async () => {
    rows = []
    await render()

    expect(container.textContent).toContain('Nichts fehlgeschlagen')
  })
})
