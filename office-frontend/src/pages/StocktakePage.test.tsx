// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import type { Stocktake, StocktakeStatus } from '../lib/types'
import { StocktakePage } from './StocktakePage'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// jsdom has neither a print dialog nor a way to open a tab, so the two ways out of the panel
// are stood in for. What each of them does is tested in `lib/print.test.ts` and
// `lib/files.test.ts`; what is tested here is that the archived file actually reaches one of
// them — a button that fetches the PDF and then shows nothing must not pass.
const printFile = vi.hoisted(() =>
  vi.fn<(file: { fileName: string; blob: Blob }) => Promise<void>>(),
)
vi.mock('../lib/print', () => ({
  printFile,
  PrintNotPossibleError: class PrintNotPossibleError extends Error {},
}))

const showFile = vi.hoisted(() => vi.fn<(file: { fileName: string; blob: Blob }) => void>())
vi.mock('../lib/files', () => ({ showFile }))

const TENANT = 1

/** A session that may read, count and post — the panel hangs on none of the three. */
const PERMISSIONS = ['INVENTORY_READ', 'INVENTORY_COUNT', 'INVENTORY_COUNT_POST']

const SESSION: AuthState = {
  user: {
    userId: 1,
    username: 'muster',
    activeTenantId: TENANT,
    superuser: false,
    tenants: [{ id: TENANT, code: 'WX', name: 'Webux', isDefault: true, inventoryEnabled: true }],
    permissions: PERMISSIONS,
  },
  loading: false,
  signIn: () => Promise.reject(new Error('nicht gebraucht')),
  signOut: () => Promise.resolve(),
  switchTenant: () => Promise.resolve(),
  can: (permission: string) => PERMISSIONS.includes(permission),
}

const CATALOGUES = {
  'stocktake-status': [
    { code: 'DRAFT', name: 'Entwurf' },
    { code: 'COUNTING', name: 'Zählung läuft' },
    { code: 'POSTED', name: 'Gebucht' },
  ],
}

/**
 * When the list was booked, and with it the moment the protocol was archived.
 *
 * <p>Midday UTC on purpose: `formatDateTime` prints the local day, and an evening moment
 * would fall on the 21st wherever the tests run east of us.
 */
const POSTED_AT = '2026-01-20T12:00:00Z'

/** The size the archive reports for that file: 128 KB, and not a round number of bytes. */
const PROTOCOL_BYTES = 131072

/**
 * A count list in the given state.
 *
 * <p>`postedAt`, the number and the two facts about the archived file come with `POSTED` and
 * only there: all of them are written while the list is booked, and so is the protocol the
 * panel offers.
 */
function stocktake(status: StocktakeStatus): Stocktake {
  const posted = status === 'POSTED'
  return {
    id: 42,
    stocktakeNumber: posted ? 'INV-2026-0001' : undefined,
    locationId: 7,
    locationName: 'Hauptlager',
    status,
    scope: 'ALL',
    blindCount: false,
    countingDate: '2026-01-20',
    uncountedHandling: posted ? 'KEEP' : undefined,
    lineCount: 51,
    countedCount: posted ? 51 : 34,
    differenceSum: posted ? -3 : undefined,
    openedAt: status === 'DRAFT' ? undefined : '2026-01-20T08:00:00Z',
    postedAt: posted ? POSTED_AT : undefined,
    protocolByteCount: posted ? PROTOCOL_BYTES : undefined,
    protocolCreatedAt: posted ? POSTED_AT : undefined,
  }
}

let container: HTMLDivElement
let root: Root
/** The count list the mask reads; every test sets the state it is about. */
let head: Stocktake
/** Every request the mask sent, in order. */
let sent: string[]
/** Set by a test that wants the request for the archived protocol refused, with that status. */
let protocolFailure: number | null

function json(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

/** The name the backend proposes for the archived protocol. */
const PROTOCOL_FILE = 'INV-2026-0001.pdf'

/** The archived protocol, as bytes rather than JSON — the panel asks for a file. */
function pdf() {
  return Promise.resolve(
    new Response('%PDF-1.7', {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${PROTOCOL_FILE}"`,
      },
    }),
  )
}

function stubFetch() {
  sent = []
  vi.stubGlobal('fetch', (url: string) => {
    sent.push(url)
    if (url.includes('/protocol')) {
      if (protocolFailure === null) return pdf()
      return Promise.resolve(
        new Response('', {
          status: protocolFailure,
          headers: { 'Content-Type': 'application/problem+json' },
        }),
      )
    }
    if (url.includes('/lines')) {
      return json({ content: [], page: 0, size: 100, totalElements: 0, totalPages: 0, sort: '' })
    }
    if (url.includes('/status-trail')) return json([])
    if (url.includes('/catalogues')) return json(CATALOGUES)
    if (url.includes('/inventory/stocktakes/42')) return json(head)
    return json([])
  })
}

beforeEach(() => {
  head = stocktake('POSTED')
  protocolFailure = null
  printFile.mockReset()
  printFile.mockResolvedValue(undefined)
  showFile.mockReset()
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

async function render() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/inventuren/42']}>
        <AuthContext.Provider value={SESSION}>
          <QueryClientProvider client={client}>
            <Routes>
              <Route path="/inventuren/:id" element={<StocktakePage />} />
            </Routes>
          </QueryClientProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
  })
  await settle()
}

const text = () => container.textContent ?? ''

/** The button carrying that wording, wherever on the mask it stands. */
function button(label: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find((entry) => entry.textContent === label)
}

/** Presses a button and lets the fetch behind it come back. */
async function press(label: string) {
  await act(async () => {
    button(label)?.click()
  })
  await settle()
}

/** What the panel says about the archived file, under the heading «Inventarprotokoll». */
function protocolFacts(): string {
  const panel = [...container.querySelectorAll('span')].find(
    (span) => span.textContent === 'Inventarprotokoll',
  )
  return panel?.nextElementSibling?.textContent ?? ''
}

describe('StocktakePage', () => {
  /**
   * The protocol is written while the list is booked, so this is the only state in which
   * there is anything to show.
   */
  it('stocktakePageShowsTheProtocolOfAPostedListTest', async () => {
    await render()

    expect(text()).toContain('Dokumente')
    expect(text()).toContain('Inventarprotokoll')
    // Number, kind, size and the moment it was written — the size and the date come off the
    // count list itself, so the panel can name the file without fetching it. The time is not
    // pinned: `formatDateTime` prints it in the timezone the tests happen to run in.
    expect(protocolFacts()).toMatch(
      /^INV-2026-0001 · PDF · 128 KB · erstellt am 20\.01\.2026, \d{2}:\d{2}$/,
    )
    expect(button('Anzeigen')).not.toBeUndefined()
    expect(button('Drucken')).not.toBeUndefined()
  })

  /**
   * The two facts are absent on a list nobody booked, and the panel then says what it knows
   * rather than «- · undefined». Not reachable through this mask — the panel is not there at
   * all before booking — but it is the shape the endpoint answers with while the archive is
   * being written, and a stale cache entry can put it on screen.
   */
  it('stocktakePageWithoutTheArchiveFactsNamesTheFileAnywayTest', async () => {
    head = { ...stocktake('POSTED'), protocolByteCount: undefined, protocolCreatedAt: undefined }
    await render()

    expect(protocolFacts()).toBe('INV-2026-0001 · PDF')
    expect(button('Anzeigen')).not.toBeUndefined()
  })

  /** Not greyed out but absent: a button for something that does not exist asks a question. */
  it('stocktakePageHidesTheProtocolInDraftTest', async () => {
    head = stocktake('DRAFT')
    await render()

    // The mask is there — otherwise the two sentences below would be true of an error page.
    expect(text()).toContain('Kopfdaten')
    expect(text()).toContain('Entwurf')
    expect(text()).not.toContain('Dokumente')
    expect(text()).not.toContain('Inventarprotokoll')
  })

  /** Counting runs without stopping the store; nothing is archived until it is booked. */
  it('stocktakePageHidesTheProtocolWhileCountingTest', async () => {
    head = stocktake('COUNTING')
    await render()

    expect(text()).toContain('Kopfdaten')
    expect(text()).toContain('Zählung läuft')
    expect(text()).not.toContain('Dokumente')
    expect(text()).not.toContain('Inventarprotokoll')
  })

  /** «Anzeigen» hands out the archived bytes, never a fresh render (backend ADR-0024). */
  it('stocktakePageOpensTheArchivedProtocolTest', async () => {
    await render()

    await press('Anzeigen')

    expect(sent).toContain('/api/tenants/1/inventory/stocktakes/42/protocol')
    // Fetching the file is half the job: it has to reach the viewer as well, under the name
    // the backend proposed.
    expect(showFile).toHaveBeenCalledTimes(1)
    expect(showFile.mock.calls[0][0].fileName).toBe(PROTOCOL_FILE)
    expect(await showFile.mock.calls[0][0].blob.text()).toBe('%PDF-1.7')
    expect(printFile).not.toHaveBeenCalled()
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })

  /** «Drucken» takes the same bytes to the print dialog of the browser instead (ADR-0009). */
  it('stocktakePagePrintsTheArchivedProtocolTest', async () => {
    await render()

    await press('Drucken')

    expect(sent).toContain('/api/tenants/1/inventory/stocktakes/42/protocol')
    expect(printFile).toHaveBeenCalledTimes(1)
    expect(printFile.mock.calls[0][0].fileName).toBe(PROTOCOL_FILE)
    expect(await printFile.mock.calls[0][0].blob.text()).toBe('%PDF-1.7')
    expect(showFile).not.toHaveBeenCalled()
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })

  /** A protocol that does not come back says so on the mask, not in the console. */
  it('stocktakePageSaysWhenTheProtocolFailedTest', async () => {
    protocolFailure = 500
    await render()

    await press('Anzeigen')

    const alert = container.querySelector('[role="alert"]')

    expect(alert?.textContent).toContain('Das Backend meldet einen Fehler.')
    expect(showFile).not.toHaveBeenCalled()
    // The buttons come back: the attempt is over, and a second one is allowed.
    expect(button('Anzeigen')?.disabled).toBe(false)
  })
})
