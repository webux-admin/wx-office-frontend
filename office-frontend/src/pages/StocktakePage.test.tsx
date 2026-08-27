// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import type { Stocktake, StocktakeLine, StocktakeStatus, StockMovement } from '../lib/types'
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

/** What the session holds. Read, count and post unless a test takes one of them away. */
const ALL_RIGHTS = ['INVENTORY_READ', 'INVENTORY_COUNT', 'INVENTORY_COUNT_POST']

/** The rights of the session under test; reset before each of them. */
let rights: string[] = ALL_RIGHTS

const SESSION: AuthState = {
  user: {
    userId: 1,
    username: 'muster',
    activeTenantId: TENANT,
    superuser: false,
    tenants: [{ id: TENANT, code: 'WX', name: 'Webux', isDefault: true, inventoryEnabled: true }],
    // Read through a getter, so a test can narrow the rights before it renders without
    // building a second session object next to this one.
    get permissions() {
      return rights
    },
  },
  loading: false,
  signIn: () => Promise.reject(new Error('nicht gebraucht')),
  signOut: () => Promise.resolve(),
  switchTenant: () => Promise.resolve(),
  can: (permission: string) => rights.includes(permission),
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

/**
 * A line nobody has counted yet — 120 pieces expected, and the first field of the mask.
 *
 * <p>The counting criteria of the issue need rows on screen. Before this the line page of the
 * stub was empty, and a mask with no row proves nothing about counting.
 */
const SCHRAUBE: StocktakeLine = {
  id: 101,
  productId: 11,
  productNumber: 'P-100',
  productName: 'Schraube M4',
  unitShortName: 'Stk',
  expectedQuantity: 120,
  movedSinceCounting: false,
  addedDuringCounting: false,
  sortOrder: 1,
}

/** The bar code on the box of the counted article, as a scanner reads it off the shelf. */
const MUTTER_EAN = '7612345678901'

/** A code no line of this count list carries. */
const FOREIGN_EAN = '7690000000005'

/** The line the second counter already did: what the mask asks about before overwriting. */
const MUTTER: StocktakeLine = {
  id: 102,
  productId: 12,
  productNumber: 'P-200',
  productName: 'Mutter M6',
  productEan: MUTTER_EAN,
  unitShortName: 'Stk',
  expectedQuantity: 80,
  countedQuantity: 80,
  countedBy: 'Anna',
  countedAt: '2026-01-20T10:14:00Z',
  movedSinceCounting: false,
  addedDuringCounting: false,
  sortOrder: 2,
}

/** A second open line behind the counted one: where the focus has to land on `Enter`. */
const SCHEIBE: StocktakeLine = {
  id: 103,
  productId: 13,
  productNumber: 'P-300',
  productName: 'Scheibe M6',
  unitShortName: 'Stk',
  expectedQuantity: 40,
  movedSinceCounting: false,
  addedDuringCounting: false,
  sortOrder: 3,
}

/**
 * What booking the list left in the journal: one movement per counted difference.
 *
 * <p>Both carry the number of the count list as their source, which is what lets the mask ask
 * the journal for exactly the rows this booking wrote (backend ADR-0061).
 */
const ADJUSTMENTS: StockMovement[] = [
  {
    id: 900,
    productId: 11,
    productNumber: 'P-100',
    productName: 'Schraube M4',
    unitShortName: 'Stk',
    locationId: 7,
    quantity: -2,
    reason: 'COUNT_ADJUSTMENT',
    bookedOn: '2026-01-20',
    sourceKind: 'STOCKTAKE',
    sourceId: 42,
    sourceNumber: 'INV-2026-0001',
  },
  {
    id: 901,
    productId: 13,
    productNumber: 'P-300',
    productName: 'Scheibe M6',
    unitShortName: 'Stk',
    locationId: 7,
    lotId: 5,
    lotNumber: 'CH-77',
    quantity: 1,
    reason: 'COUNT_ADJUSTMENT',
    bookedOn: '2026-01-20',
    sourceKind: 'STOCKTAKE',
    sourceId: 42,
    sourceNumber: 'INV-2026-0001',
  },
]

/**
 * A count list of that many lines, in the order they are counted.
 *
 * <p>A whole location easily holds more rows than one page of the mask, which is the case the
 * pager exists for: without it everything past the first page is out of reach, and a count
 * that cannot reach a line cannot be finished.
 *
 * @param count how many lines the list has
 * @returns the lines, numbered from `P-0001`
 */
function manyLines(count: number): StocktakeLine[] {
  return Array.from({ length: count }, (_ignored, index) => ({
    id: 1000 + index,
    productId: 2000 + index,
    productNumber: `P-${String(index + 1).padStart(4, '0')}`,
    productName: `Artikel ${index + 1}`,
    unitShortName: 'Stk',
    expectedQuantity: 10,
    movedSinceCounting: false,
    addedDuringCounting: false,
    sortOrder: index + 1,
  }))
}

let container: HTMLDivElement
let root: Root
/** The count list the mask reads; every test sets the state it is about. */
let head: Stocktake
/** What the journal answers the «Buchungen» panel with. */
let movementRows: StockMovement[]
/** Set by a test that wants the journal request refused, with that status. */
let movementFailure: number | null
/** The lines the stub hands out; empty unless a test is about the counting itself. */
let lineRows: StocktakeLine[]
/** Every request the mask sent, in order. */
let sent: string[]
/** The same requests with what they carried, for the tests that check a count went out. */
let calls: { url: string; method: string; body: string }[]
/** Set by a test that wants the request for the archived protocol refused, with that status. */
let protocolFailure: number | null
/** Set by a test that wants the count request refused, with that status. */
let countFailure: number | null

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

/** What the endpoint answers on a refused request: a problem document, as the real one does. */
function problem(status: number) {
  return Promise.resolve(
    new Response(JSON.stringify({ detail: 'Das ging schief' }), {
      status,
      headers: { 'Content-Type': 'application/problem+json' },
    }),
  )
}

/**
 * What the endpoint reads out of a query parameter.
 *
 * <p>A space travels as `+`: that is what `URLSearchParams` writes and what the servlet
 * container reads back as a space. `decodeURIComponent` alone leaves the `+` standing, and a
 * term like «Artikel 7» would then find nothing here while it finds plenty in production.
 *
 * @param raw the value as it stands in the URL
 * @returns the value the endpoint sees
 */
function queryValue(raw: string): string {
  return decodeURIComponent(raw.replaceAll('+', '%20'))
}

function stubFetch() {
  sent = []
  calls = []
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    sent.push(url)
    calls.push({
      url,
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? init.body : '',
    })
    if (url.includes('/protocol')) {
      if (protocolFailure === null) return pdf()
      return Promise.resolve(
        new Response('', {
          status: protocolFailure,
          headers: { 'Content-Type': 'application/problem+json' },
        }),
      )
    }
    // The count of one line. Answered with the head, the way the endpoint does it.
    if (url.includes('/count')) {
      return countFailure === null ? json(head) : problem(countFailure)
    }
    if (url.includes('/lines')) {
      // The «Offen» chip, the jump field and the paging are all the server's, so the stub
      // does what the server does: what the mask has to get right is asking for it.
      const open = url.includes('openOnly=true')
      const term = queryValue(/[?&]search=([^&]*)/.exec(url)?.[1] ?? '').toLowerCase()
      const rows = lineRows
        .filter((row) => !open || row.countedQuantity === undefined)
        .filter((row) =>
          term === ''
            ? true
            : [row.productNumber, row.productName, row.productEan, row.lotNumber]
                .filter((code) => code !== undefined)
                .some((code) => code.toLowerCase().includes(term)),
        )
      const size = Number(/[?&]size=(\d+)/.exec(url)?.[1] ?? '100')
      const asked = Number(/[?&]page=(\d+)/.exec(url)?.[1] ?? '0')
      return json({
        content: rows.slice(asked * size, asked * size + size),
        page: asked,
        size,
        totalElements: rows.length,
        totalPages: Math.max(1, Math.ceil(rows.length / size)),
        sort: '',
      })
    }
    if (url.includes('/status-trail')) return json([])
    // The journal, as the «Buchungen» panel asks it: narrowed to the number of this list.
    if (url.includes('/inventory/movements')) {
      if (movementFailure !== null) return problem(movementFailure)
      return json({
        content: movementRows,
        page: 0,
        size: 50,
        totalElements: movementRows.length,
        totalPages: 1,
        sort: 'bookedOn,desc',
      })
    }
    if (url.includes('/catalogues')) return json(CATALOGUES)
    if (url.includes('/inventory/stocktakes/42')) return json(head)
    return json([])
  })
}

beforeEach(() => {
  rights = ALL_RIGHTS
  head = stocktake('POSTED')
  lineRows = []
  movementRows = ADJUSTMENTS
  protocolFailure = null
  countFailure = null
  movementFailure = null
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
  delete (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector
  // Put on the navigator with a property of its own, which `vi.unstubAllGlobals` does not
  // reach — without this the camera outlives the test that asked for it.
  delete (navigator as unknown as { mediaDevices?: unknown }).mediaDevices
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

/** A camera that hands out a stream nobody has to close for real. */
function stubCamera() {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: () => Promise.resolve({ getTracks: () => [{ stop: () => undefined }] }),
    },
  })
}

/** A browser that can read bar codes and always sees the same picture. */
function stubDetector(code: string) {
  ;(window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector = class {
    detect() {
      return Promise.resolve([{ rawValue: code }])
    }
  }
}

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

/** A button named for a screen reader rather than by its text — the two pager arrows. */
function labelled(label: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find(
    (entry) => entry.getAttribute('aria-label') === label,
  )
}

/** Presses a button found by its label and lets the fetch behind it come back. */
async function pressLabelled(label: string) {
  await act(async () => {
    labelled(label)?.click()
  })
  await settle()
}

/** The pager under the lines, or nothing where there is only one page. */
const pager = () => container.querySelector('nav[aria-label="Seiten"]')

/** The camera button of the counting mask, or nothing where the browser reads no bar code. */
const cameraButton = () =>
  [...container.querySelectorAll('button')].find(
    (entry) => entry.getAttribute('aria-label') === 'Artikel mit der Kamera scannen',
  )

/** The region the sentence about a scanned code lives in, whether it says anything or not. */
const scanRegion = () => container.querySelector('p[role="status"]')

/**
 * Renders the mask with a camera that reads one code, and reads it.
 *
 * <p>Fake timers throughout: the scanner looks at the picture four times a second, and the
 * jump field the read code lands in holds a term back until it stands still. Both are waited
 * out by moving the clock rather than by sleeping.
 *
 * @param code what the camera sees
 */
async function renderAndScan(code: string) {
  stubCamera()
  stubDetector(code)
  vi.useFakeTimers({ shouldAdvanceTime: true })
  await render()
  return scanIt()
}

/** Opens the camera, lets it read, and waits out the search the read starts. */
async function scanIt() {
  await act(async () => {
    cameraButton()?.click()
  })
  // The camera is asked for on the click, so the stream has to settle before the first look.
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    vi.advanceTimersByTime(300)
  })
  // The code lands in the jump field; its term settles and the answer comes back.
  for (let round = 0; round < 8; round += 1) {
    await act(async () => {
      vi.advanceTimersByTime(300)
      await Promise.resolve()
    })
  }
}

/**
 * Fixes what the browser answers about the width, so a test can pick a view.
 *
 * <p>jsdom has one window size and no way to resize it, and which view is mounted is decided
 * from `matchMedia` rather than from CSS — so this is the only way to reach the card view.
 *
 * @param wide true for the table, false for the cards below `sm`
 */
function stubWidth(wide: boolean) {
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: wide,
    media,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }))
}

/** Presses a button and lets the fetch behind it come back. */
async function press(label: string) {
  await act(async () => {
    button(label)?.click()
  })
  await settle()
}

/** The quantity field of one row, by its place in the list. */
const countField = (index: number) =>
  container.querySelector(`[data-count-index="${index}"]`) as HTMLInputElement | null

/**
 * Types into a field the way somebody with a keyboard does.
 *
 * <p>Through the native setter, because React listens to the input event and reads the value
 * off the element rather than off the event.
 */
function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
  act(() => {
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

/** Presses one key in a field. No mouse anywhere: that is the point of the flow. */
function pressKey(input: HTMLInputElement, key: string) {
  act(() => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

/** Every count that went out, as [line id, what the body said]. */
function countsSent(): [string, string][] {
  return calls
    .filter((call) => call.url.includes('/count'))
    .map((call) => [call.url.replace(/.*\/lines\//, '').replace('/count', ''), call.body])
}

/** The line request the mask sent last, so a chip can be held against it. */
function lastLinesRequest(): string {
  return [...sent].reverse().find((url) => url.includes('/lines?')) ?? ''
}

/** One panel of the mask, by the heading it carries. */
function panel(title: string): HTMLElement | undefined {
  return [...container.querySelectorAll('section')].find(
    (section) => section.querySelector('h2')?.textContent === title,
  )
}

/** Every link of one panel, as [text, address]. */
function linksOf(title: string): [string, string][] {
  return [...(panel(title)?.querySelectorAll('a') ?? [])].map((link) => [
    link.textContent ?? '',
    link.getAttribute('href') ?? '',
  ])
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

  /**
   * Two people count one list, and «Offen» shows each of them only what is still missing.
   *
   * <p>The filter is the server's, so what the mask has to get right is asking for it — and
   * showing what comes back rather than what it had.
   */
  it('stocktakePageShowsOnlyTheOpenLinesTest', async () => {
    head = stocktake('COUNTING')
    lineRows = [SCHRAUBE, MUTTER, SCHEIBE]
    await render()
    expect(text()).toContain('Mutter M6')

    await press('Offen')

    expect(lastLinesRequest()).toContain('openOnly=true')
    expect(text()).not.toContain('Mutter M6')
    expect(text()).toContain('Schraube M4')
    expect(text()).toContain('Scheibe M6')

    // And back: «Alle» asks for the whole list again, without the filter.
    await press('Alle')

    expect(lastLinesRequest()).not.toContain('openOnly')
    expect(text()).toContain('Mutter M6')
  })

  /**
   * The other half of counting in twos: a line somebody else counted asks before it is
   * overwritten, and until that is answered nothing goes to the server. Their count is a
   * statement, and two counters must not quietly undo each other (the criterion of the issue,
   * named for exactly this file).
   */
  it('stocktakePageAsksBeforeOverwritingACountedLineTest', async () => {
    head = stocktake('COUNTING')
    lineRows = [SCHRAUBE, MUTTER, SCHEIBE]
    await render()
    const field = countField(1) as HTMLInputElement

    act(() => field.focus())
    type(field, '95')
    pressKey(field, 'Enter')
    await settle()

    const asking = container.querySelector('[role="alertdialog"]')
    expect(asking?.textContent).toContain('Gezählt von Anna')
    expect(asking?.textContent).toContain('überschreiben?')
    expect(countsSent()).toEqual([])

    await press('Überschreiben')

    expect(countsSent()).toEqual([['102', '{"quantity":95}']])
  })

  /**
   * The connection drops mid count. The figure exists nowhere but in that field, so it stays
   * in it, the row is marked, and «Erneut senden» sends <b>the same</b> figure to the same
   * line — that is what the line by line saving is for (Frontend-ADR-0016).
   */
  it('stocktakePageKeepsTheTypedValueWhenTheRequestFailsTest', async () => {
    head = stocktake('COUNTING')
    lineRows = [SCHRAUBE, MUTTER, SCHEIBE]
    countFailure = 500
    await render()
    const field = countField(0) as HTMLInputElement

    act(() => field.focus())
    type(field, '118')
    pressKey(field, 'Enter')
    await settle()

    expect(countsSent()).toEqual([['101', '{"quantity":118}']])
    expect(countField(0)?.value).toBe('118')
    expect(countField(0)?.getAttribute('aria-invalid')).toBe('true')
    expect(container.querySelector('[role="alert"]')).not.toBeNull()

    countFailure = null
    await press('Erneut senden')

    expect(countsSent()).toEqual([
      ['101', '{"quantity":118}'],
      ['101', '{"quantity":118}'],
    ])
    expect(countField(0)?.value).toBe('118')
  })

  /**
   * Type, `Enter`, and the focus stands in the next line nobody has counted — over the one
   * that is already counted. Nothing here is clicked: this is the flow through an aisle, and
   * it has to work with one hand on the keyboard.
   */
  it('stocktakePageCountsWithTheKeyboardTest', async () => {
    head = stocktake('COUNTING')
    lineRows = [SCHRAUBE, MUTTER, SCHEIBE]
    await render()
    const field = countField(0) as HTMLInputElement

    act(() => field.focus())
    type(field, '118')
    pressKey(field, 'Enter')
    await settle()

    expect(countsSent()).toEqual([['101', '{"quantity":118}']])
    expect(document.activeElement).toBe(countField(2))
    expect(countField(2)?.value).toBe('')
  })

  /**
   * The frontend half of the two rights: whoever may count but not book does not see the way
   * to the difference list at all.
   *
   * <p>Absent and not greyed out — a button nobody may press is a question the mask should not
   * ask. Instead the footer says who may (decision of the Product Owner, ADR-0070). The 403 on
   * the two endpoints is `SecurityIntegrationTest.postStocktakeWithoutPermissionFailsTest`.
   */
  it('stocktakePageHidesThePostingButtonWithoutTheRightTest', async () => {
    rights = ['INVENTORY_READ', 'INVENTORY_COUNT']
    head = stocktake('COUNTING')
    lineRows = [SCHRAUBE, MUTTER, SCHEIBE]
    await render()

    expect(button('Differenzen prüfen')).toBeUndefined()
    expect([...container.querySelectorAll('button')].map((entry) => entry.textContent))
      .not.toContain('Differenzen prüfen')
    expect(text()).toContain('Buchen darf, wer das Recht «Inventur buchen» hält.')
    // Counting itself is untouched: the fields are there and they take input.
    expect(countField(0)?.disabled).toBe(false)
  })

  /** With the right the button is there — otherwise the test above would prove nothing. */
  it('stocktakePageShowsThePostingButtonWithTheRightTest', async () => {
    head = stocktake('COUNTING')
    lineRows = [SCHRAUBE, MUTTER, SCHEIBE]
    await render()

    expect(button('Differenzen prüfen')).not.toBeUndefined()
    expect(text()).not.toContain('Buchen darf, wer das Recht')
  })

  /**
   * The scan reaches the whole count list, not the page that happens to be drawn.
   *
   * <p>With «Offen» in force a line somebody already counted is not on screen at all — the
   * filter is the server's. Reading its bar code off the shelf must not answer «gehört nicht
   * zu dieser Zählung»: that sentence is the only word the user gets, and here it would be a
   * lie. The scan replaces the search, so it takes the road the jump field takes.
   */
  it('stocktakePageScanReachesALineTheFilterHidesTest', async () => {
    head = stocktake('COUNTING')
    lineRows = [SCHRAUBE, MUTTER, SCHEIBE]
    stubCamera()
    stubDetector(MUTTER_EAN)
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await render()
    await press('Offen')
    expect(text()).not.toContain('Mutter M6')

    await scanIt()

    // Asked of the server over the whole list, and without the chip that hid the line.
    expect(lastLinesRequest()).toContain(`search=${MUTTER_EAN}`)
    expect(lastLinesRequest()).not.toContain('openOnly=true')
    expect(text()).toContain('Mutter M6')
    expect(scanRegion()?.textContent).toBe('')
    // And the focus stands in its quantity field, ready for the figure.
    expect(document.activeElement).toBe(countField(0))
  })

  /**
   * A line past the first page is reached the same way. This is the case the rendered page can
   * never answer: it holds a hundred rows and the list holds more.
   */
  it('stocktakePageScanReachesALineOnALaterPageTest', async () => {
    head = stocktake('COUNTING')
    lineRows = manyLines(120)
    await renderAndScan('P-0120')

    expect(lastLinesRequest()).toContain('search=P-0120')
    expect(text()).toContain('Artikel 120')
    expect(scanRegion()?.textContent).toBe('')
    expect(document.activeElement).toBe(countField(0))
  })

  /**
   * And a code the count list really does not carry still says so — now on the server's word
   * rather than on what one page happened to hold.
   */
  it('stocktakePageScanSaysWhatTheCountListDoesNotCarryTest', async () => {
    head = stocktake('COUNTING')
    lineRows = [SCHRAUBE, MUTTER, SCHEIBE]
    await renderAndScan(FOREIGN_EAN)

    expect(lastLinesRequest()).toContain(`search=${FOREIGN_EAN}`)
    expect(scanRegion()?.textContent).toBe(`${FOREIGN_EAN} gehört nicht zu dieser Zählung`)
    // The narrowed list is empty, so the rows are gone — and the camera has to be there for
    // the next article all the same. That is why it hangs above the rows and not in them.
    expect(cameraButton()).not.toBeUndefined()
  })

  /**
   * One camera and not two: the mask hangs it in above both layouts, and the block either view
   * asks for steps aside. Two buttons would be two states of the same sentence.
   */
  it('stocktakePageShowsOneCameraButtonTest', async () => {
    head = stocktake('COUNTING')
    lineRows = [SCHRAUBE, MUTTER, SCHEIBE]
    stubCamera()
    stubDetector(MUTTER_EAN)
    await render()

    const cameras = [...container.querySelectorAll('button')].filter(
      (entry) => entry.getAttribute('aria-label') === 'Artikel mit der Kamera scannen',
    )

    expect(cameras).toHaveLength(1)
    expect(container.querySelectorAll('p[role="status"]')).toHaveLength(1)
  })

  /**
   * A count over a whole location has more rows than one page, and every one of them has to be
   * reachable. Without a pager everything past row 100 could never be counted — and the mask
   * would not even say that there is more.
   */
  it('stocktakePageTurnsToTheNextPageOfLinesTest', async () => {
    head = stocktake('COUNTING')
    lineRows = manyLines(120)
    await render()

    // The first page, and the count of everything behind it.
    expect(text()).toContain('Artikel 1')
    expect(text()).not.toContain('Artikel 120')
    expect(pager()?.textContent).toContain('1–100')
    expect(pager()?.textContent).toContain('120')

    await pressLabelled('Nächste Seite')

    expect(lastLinesRequest()).toContain('page=1')
    expect(text()).toContain('Artikel 120')
    expect(text()).not.toContain('Artikel 1 ')
    expect(labelled('Nächste Seite')?.disabled).toBe(true)

    // And back, so the way is not one directional.
    await pressLabelled('Vorherige Seite')

    expect(lastLinesRequest()).toContain('page=0')
    expect(text()).toContain('Artikel 1')
  })

  /**
   * The same route below `sm`, where the lines are cards: the pager belongs to the mask and not
   * to one of its two layouts, or counting on a phone stops at row 100.
   */
  it('stocktakePagePagesTheCardsAsWellTest', async () => {
    stubWidth(false)
    head = stocktake('COUNTING')
    lineRows = manyLines(120)
    await render()

    // The card view is the one on screen — otherwise this would prove nothing about it.
    expect(container.querySelector('[data-count-card]')).not.toBeNull()

    await pressLabelled('Nächste Seite')

    expect(lastLinesRequest()).toContain('page=1')
    expect(text()).toContain('Artikel 120')
  })

  /** One page is no pager: a control that can do nothing is a question about nothing. */
  it('stocktakePageWithoutASecondPageShowsNoPagerTest', async () => {
    head = stocktake('COUNTING')
    lineRows = [SCHRAUBE, MUTTER, SCHEIBE]
    await render()

    expect(pager()).toBeNull()
  })

  /**
   * Narrowing while standing on a later page starts over at the first one.
   *
   * <p>Page 2 of the whole list is not page 2 of the narrowed one: whoever types into the jump
   * field on page 2 would otherwise be answered with an empty page, which reads as «nothing
   * found» for a term that has plenty.
   */
  it('stocktakePageSearchingGoesBackToTheFirstPageTest', async () => {
    head = stocktake('COUNTING')
    lineRows = manyLines(120)
    await render()
    await pressLabelled('Nächste Seite')
    expect(lastLinesRequest()).toContain('page=1')

    const field = container.querySelector(
      'input[placeholder="Nummer, EAN oder Charge"]',
    ) as HTMLInputElement
    type(field, 'Artikel 7')
    await settle()

    expect(lastLinesRequest()).toContain('page=0')
    expect(text()).toContain('Artikel 7')
  })

  /**
   * «Buchungen» is a row per movement the booking wrote, not one link and a sum.
   *
   * <p>What a count list did to the stock is the point of booking it, and «Differenz insgesamt
   * -3» over a link says nothing about which article moved which way. The issue asks for one
   * row per created movement and a way into the journal.
   */
  it('stocktakePageListsOneRowPerMovementTest', async () => {
    await render()

    const bookings = panel('Buchungen')
    expect(bookings).not.toBeUndefined()
    const rows = [...(bookings?.querySelectorAll('li') ?? [])].map((row) => row.textContent ?? '')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toContain('P-100')
    expect(rows[0]).toContain('Schraube M4')
    // Signed and with the unit: a count adjustment reads as a direction, not as an amount.
    expect(rows[0]).toContain('-2 Stk')
    expect(rows[1]).toContain('Scheibe M6')
    expect(rows[1]).toContain('CH-77')
    expect(rows[1]).toContain('+1 Stk')
  })

  /**
   * Every row leads into the journal, and the panel leads to all of them at once.
   *
   * <p>The addresses have to carry parameters the journal actually reads — a term it drops
   * opens the whole journal and says nothing about it
   * (`StockMovementListPage.test.tsx`).
   */
  it('stocktakePageLinksTheMovementsIntoTheJournalTest', async () => {
    await render()

    expect(linksOf('Buchungen')).toEqual([
      ['Schraube M4', '/lagerbewegungen?produkt=11&lagerort=7'],
      ['Scheibe M6', '/lagerbewegungen?produkt=13&lagerort=7'],
      ['Alle Bewegungen dieser Inventur im Journal', '/lagerbewegungen?suche=INV-2026-0001'],
    ])
  })

  /**
   * A count that matched the books to the piece writes nothing, and the panel says so rather
   * than showing an empty box with a link to nowhere.
   */
  it('stocktakePageSaysWhenTheBookingMovedNothingTest', async () => {
    movementRows = []
    head = { ...stocktake('POSTED'), differenceSum: 0 }
    await render()

    expect(panel('Buchungen')?.textContent).toContain('Diese Inventur hat nichts bewegt.')
    expect(panel('Buchungen')?.querySelectorAll('li')).toHaveLength(0)
  })

  /** A journal that does not answer says so on the mask, not by showing an empty panel. */
  it('stocktakePageSaysWhenTheMovementsCannotBeLoadedTest', async () => {
    movementFailure = 500
    await render()

    expect(panel('Buchungen')?.querySelector('[role="alert"]')).not.toBeNull()
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
