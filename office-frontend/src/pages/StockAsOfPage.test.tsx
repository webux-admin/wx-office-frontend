// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import type { StockAsOfEntry, StockAsOfSummary, StockLocation } from '../lib/types'
import { StockAsOfPage } from './StockAsOfPage'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// jsdom has neither a print dialog nor a way to open a tab, so the two ways out of the split
// button are stood in for. What each of them does is tested in `lib/print.test.ts` and
// `lib/files.test.ts`; what is tested here is which of the two a click reaches for, and with
// which file.
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

/**
 * The day the screen believes it is opened on.
 *
 * <p>Pinned down because everything on this mask hangs on it: the field starts with today, the
 * server measures a cut-off date against it, and the header, the empty state and the journal
 * links all spell the accepted day out.
 */
const TODAY = new Date(2026, 0, 21, 14, 3)

const MAIN: StockLocation = { id: 7, code: 'HAUPT', name: 'Hauptlager', active: true }

/** Three lines without a cost, which is the case the value column has to disappear for. */
const ROWS: StockAsOfEntry[] = [
  {
    productId: 42,
    productNumber: 'P-001',
    productName: 'Schraube',
    locationId: 7,
    locationCode: 'HAUPT',
    locationName: 'Hauptlager',
    quantity: 128,
    unitShortName: 'Stk',
  },
  {
    productId: 43,
    productNumber: 'P-002',
    productName: 'Kabel',
    locationId: 7,
    locationCode: 'HAUPT',
    locationName: 'Hauptlager',
    quantity: 12.5,
    unitShortName: 'm',
  },
  {
    productId: 44,
    productNumber: 'P-003',
    productName: 'Mutter',
    locationId: 7,
    locationCode: 'HAUPT',
    locationName: 'Hauptlager',
    quantity: 60,
    unitShortName: 'Stk',
  },
]

/** The same three lines, each with a cost in the bookkeeping currency. */
const VALUED_ROWS: StockAsOfEntry[] = ROWS.map((row, index) => ({
  ...row,
  unitCost: 1.25,
  unitCostCurrency: 'CHF',
  lineValue: [160, 15.63, 75][index],
}))

/**
 * A session holding the named rights and nothing else.
 *
 * <p>Reading the report and booking stock are two different rights: the way out of an empty
 * report is the booking dialog, and whoever may only look is not offered a button that ends
 * in a 403.
 */
function session(rights: string[]): AuthState {
  return {
    user: {
      userId: 1,
      username: 'muster',
      activeTenantId: TENANT,
      superuser: false,
      tenants: [{ id: TENANT, code: 'WX', name: 'Webux', isDefault: true, modules: ['INVENTORY'] }],
      permissions: rights,
    },
    loading: false,
    signIn: () => Promise.reject(new Error('nicht gebraucht')),
    completeSecondFactor: () => Promise.reject(new Error('nicht gebraucht')),
    sendSecondFactorCode: () => Promise.resolve(),
    adoptSession: () => {},
    signOut: () => Promise.resolve(),
    switchTenant: () => Promise.resolve(),
    refresh: () => Promise.resolve(),
    can: (permission: string) => rights.includes(permission),
  }
}

let container: HTMLDivElement
let root: Root
/** The rights of whoever is looking; a test that needs more sets its own. */
let auth: AuthState
/** The rows the report answers with. */
let rows: StockAsOfEntry[]
/** The figures over the whole report; a test that cares about them sets its own. */
let facts: StockAsOfSummary
/** Set by a test that wants the page request to be refused. */
let reportFailure: { status: number; detail?: string } | null
/** Set by a test that wants the request for the figures to be refused. */
let summaryFailure: { status: number; detail?: string } | null
/** Set by a test that wants the request for the PDF to be refused. */
let pdfFailure: { status: number; detail?: string } | null
/** Every request the mask sent, in order and whole — query string included. */
let sent: string[]

/** The figures of a report whose value column is intact. */
function summary(fields: Partial<StockAsOfSummary> = {}): StockAsOfSummary {
  return {
    asOf: '2026-01-21',
    generatedAt: '2026-01-21T13:03:00Z',
    lineCount: 84,
    unvaluedLineCount: 0,
    foreignCurrencyLineCount: 0,
    baseCurrencyCode: 'CHF',
    backdatedMovements: 0,
    showsValue: true,
    ...fields,
  }
}

function json(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

/** An answer the client turns into an `ApiError`, the way the backend refuses one. */
function problem(failure: { status: number; detail?: string }) {
  return Promise.resolve(
    new Response(failure.detail === undefined ? '' : JSON.stringify({ detail: failure.detail }), {
      status: failure.status,
      headers: { 'Content-Type': 'application/problem+json' },
    }),
  )
}

/** The name the backend proposes for the freshly rendered report. */
const PDF_FILE = 'inventar-2026-01-21.pdf'

/** The report as bytes rather than JSON — the split button asks for a file. */
function pdf() {
  return Promise.resolve(
    new Response('%PDF-1.7', {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${PDF_FILE}"`,
      },
    }),
  )
}

function stubFetch() {
  sent = []
  // Every request is recorded before it is answered, the PDF among them: all three endpoints
  // demand `date`, and one that goes out without it earns a 400 nobody would see here.
  vi.stubGlobal('fetch', (url: string) => {
    sent.push(url)
    if (url.includes('/inventory/locations')) return json([MAIN])
    if (url.includes('/inventory/as-of/pdf')) {
      return pdfFailure === null ? pdf() : problem(pdfFailure)
    }
    if (url.includes('/inventory/as-of/summary')) {
      return summaryFailure === null ? json(facts) : problem(summaryFailure)
    }
    if (url.includes('/inventory/as-of')) {
      if (reportFailure !== null) return problem(reportFailure)
      return json({
        content: rows,
        page: 0,
        size: 50,
        totalElements: rows.length,
        totalPages: rows.length === 0 ? 0 : 1,
        sort: 'productName,asc',
      })
    }
    return json([])
  })
}

beforeEach(() => {
  // Only the clock, never the timers: the debounce of the search field and the settling below
  // both run on real ones.
  vi.useFakeTimers({ toFake: ['Date'], now: TODAY })
  auth = session(['INVENTORY_READ'])
  rows = ROWS
  facts = summary()
  reportFailure = null
  summaryFailure = null
  pdfFailure = null
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
  vi.useRealTimers()
})

/** Lets the answers of both queries arrive. */
async function settle() {
  for (let round = 0; round < 4; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

/** Lets the debounce of the quick search run out as well, before the answer arrives. */
async function settleSearch() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 300))
  })
  await settle()
}

async function render() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <MemoryRouter>
        <AuthContext.Provider value={auth}>
          <QueryClientProvider client={client}>
            <StockAsOfPage />
          </QueryClientProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
  })
  await settle()
}

const text = () => container.textContent ?? ''
const bodyRows = () => [...container.querySelectorAll('tbody tr')]
const headers = () => [...container.querySelectorAll('thead th')].map((cell) => cell.textContent)
const dateField = () => container.querySelector('input[type="date"]') as HTMLInputElement
const searchField = () =>
  [...container.querySelectorAll('input')].find(
    (input) => input.placeholder === 'Nummer oder Bezeichnung',
  ) as HTMLInputElement
const zeroRowsBox = () => container.querySelector('input[type="checkbox"]') as HTMLInputElement
const alerts = () => [...container.querySelectorAll('[role="alert"]')]
const buttonNamed = (label: string) =>
  [...container.querySelectorAll('button')].find((button) => button.textContent?.includes(label))
const linkNamed = (label: string) =>
  [...container.querySelectorAll('a')].find((link) => link.textContent?.includes(label))
/** The arrow of the split button, which holds the other way to the same report. */
const splitToggle = () => container.querySelector('button[aria-haspopup="menu"]') ?? undefined
const menuItemNamed = (label: string) =>
  [...container.querySelectorAll('[role="menuitem"]')].find((item) =>
    item.textContent?.includes(label),
  )

/**
 * The three requests this screen makes, told apart by their address.
 *
 * <p>Kept separate because all three endpoints demand the cut-off date and answer 400 without
 * it: a recorder that only collected the list would leave the two most likely regressions —
 * the figures and the PDF going out bare — with nothing watching them.
 */
const listCalls = () => sent.filter((url) => url.includes('/inventory/as-of?'))
const summaryCalls = () => sent.filter((url) => url.includes('/inventory/as-of/summary'))
const pdfCalls = () => sent.filter((url) => url.includes('/inventory/as-of/pdf'))

/** What the field says about the day standing in it, read the way a screen reader gets it. */
function dateHint(): string {
  const hint = document.getElementById(dateField().getAttribute('aria-describedby') ?? '')
  return hint?.textContent ?? ''
}

function typeInto(control: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(control, value)
  act(() => {
    control.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function typeDate(value: string) {
  typeInto(dateField(), value)
}

function click(element: Element | undefined) {
  act(() => {
    ;(element as HTMLElement).click()
  })
}

/** Clicks something that fetches, and lets the answer come back. */
async function press(element: Element | undefined) {
  await act(async () => {
    ;(element as HTMLElement).click()
  })
  await settle()
}

describe('StockAsOfPage', () => {
  it('stockAsOfPageTest', async () => {
    await render()

    expect(bodyRows()).toHaveLength(3)
    expect(text()).toContain('Schraube')
    expect(text()).toContain('P-001')
    // Today is the default, and the header spells it out rather than saying «heute».
    expect(text()).toContain('Bestand per 21.01.2026')
    expect(text()).toContain('84 Zeilen')
    expect(text()).not.toContain('war kein Bestand gebucht')
  })

  /** The cut-off date is what this screen is about, so the first request already carries it. */
  it('stockAsOfPageAsksWithTodayTest', async () => {
    await render()

    expect(listCalls()).toHaveLength(1)
    expect(listCalls()[0]).toContain('date=2026-01-21')
  })

  /**
   * `date` is mandatory on all three endpoints of the report — without it the backend answers
   * 400 (backend `InventoryRules.validateAsOfDate`). The list, the figures over it and the PDF
   * are three separate requests, so every one of them has to carry the day of its own accord.
   */
  it('stockAsOfPageAsksEveryEndpointWithTheCutOffDateTest', async () => {
    await render()

    await press(buttonNamed('Als PDF anzeigen'))

    expect(listCalls()).toHaveLength(1)
    expect(summaryCalls()).toHaveLength(1)
    expect(pdfCalls()).toHaveLength(1)
    for (const url of [...listCalls(), ...summaryCalls(), ...pdfCalls()]) {
      expect(url).toContain('date=2026-01-21')
    }
  })

  /** A day chosen afterwards reaches all three as well, and not only the list under it. */
  it('stockAsOfPageCarriesTheChosenDateToEveryEndpointTest', async () => {
    await render()

    typeDate('2025-12-31')
    await settle()
    await press(buttonNamed('Als PDF anzeigen'))

    expect(listCalls().at(-1)).toContain('date=2025-12-31')
    expect(summaryCalls().at(-1)).toContain('date=2025-12-31')
    expect(pdfCalls()).toEqual(['/api/tenants/1/inventory/as-of/pdf?date=2025-12-31'])
  })

  /**
   * The PDF is the report standing on the screen, so what narrows the screen narrows it too.
   * Handing out an unfiltered report under the same button would put a different set of
   * figures in front of the trustee than the one that was read.
   */
  it('stockAsOfPageCarriesTheFiltersIntoThePdfTest', async () => {
    await render()

    click(zeroRowsBox())
    await settle()
    await press(buttonNamed('Als PDF anzeigen'))

    expect(pdfCalls()).toEqual([
      '/api/tenants/1/inventory/as-of/pdf?date=2026-01-21&includeZero=true',
    ])
    // The quick search stays out of it, the way it stays out of the figures: nobody types
    // their way to a smaller inventory.
    expect(summaryCalls().at(-1)).toBe(
      '/api/tenants/1/inventory/as-of/summary?date=2026-01-21&includeZero=true',
    )
  })

  /** «Als PDF anzeigen» fetches the report and hands it to the viewer (issue #23). */
  it('stockAsOfPageShowsTheReportAsAPdfTest', async () => {
    await render()

    await press(buttonNamed('Als PDF anzeigen'))

    expect(showFile).toHaveBeenCalledTimes(1)
    expect(showFile.mock.calls[0][0].fileName).toBe(PDF_FILE)
    expect(await showFile.mock.calls[0][0].blob.text()).toBe('%PDF-1.7')
    expect(printFile).not.toHaveBeenCalled()
    expect(alerts()).toHaveLength(0)
  })

  /** The second way behind the arrow goes to the print dialog, not into a tab (ADR-0009). */
  it('stockAsOfPagePrintsTheReportTest', async () => {
    await render()

    click(splitToggle())
    await press(menuItemNamed('Drucken'))

    expect(pdfCalls()).toEqual(['/api/tenants/1/inventory/as-of/pdf?date=2026-01-21'])
    expect(printFile).toHaveBeenCalledTimes(1)
    expect(printFile.mock.calls[0][0].fileName).toBe(PDF_FILE)
    expect(showFile).not.toHaveBeenCalled()
  })

  /** A PDF that does not come back says so on the screen, not in the console. */
  it('stockAsOfPageSaysWhenThePdfFailedTest', async () => {
    pdfFailure = { status: 500 }
    await render()

    await press(buttonNamed('Als PDF anzeigen'))

    expect(alerts()).toHaveLength(1)
    expect(alerts()[0]?.textContent).toContain('Das Backend meldet einen Fehler.')
    expect(showFile).not.toHaveBeenCalled()
    // The rows are untouched: it was the printout that failed, not the report.
    expect(bodyRows()).toHaveLength(3)
  })

  /**
   * Where one line has no cost the column goes for the whole report and a sentence says why. A
   * column filled in for 72 of 84 lines invites a total nobody may rely on (backend ADR-0071).
   */
  it('stockAsOfPageWithoutCostsShowsNoValueColumnTest', async () => {
    facts = summary({ showsValue: false, unvaluedLineCount: 12 })
    await render()

    expect(headers()).not.toContain('Einstandspreis')
    expect(headers()).not.toContain('Wert')
    // The reason in plain words, and nowhere a zero pretending to be an amount.
    expect(text()).toContain(
      'Für 12 von 84 Zeilen ist kein Einstandspreis erfasst — der Bericht führt deshalb '
        + 'keine Werte.',
    )
    expect(text()).not.toContain('0.00')
  })

  it('stockAsOfPageShowsTheValueColumnsWhereEveryLineHasACostTest', async () => {
    rows = VALUED_ROWS
    await render()

    expect(headers()).toContain('Einstandspreis')
    expect(headers()).toContain('Wert')
    expect(text()).not.toContain('kein Einstandspreis erfasst')
  })

  /**
   * On a phone the two columns that explain a row give way and the ones the screen is about
   * stay. Done in the column catalogue, so it is the same route and never a second mask.
   */
  it('stockAsOfPageDropsTheExplainingColumnsOnASmallScreenTest', async () => {
    rows = VALUED_ROWS
    await render()

    const narrow = (cell: Element) => cell.className.includes('hidden sm:table-cell')
    const dropped = [...container.querySelectorAll('thead th')].filter(narrow)

    expect(dropped.map((cell) => cell.textContent)).toEqual(['Einheit', 'Einstandspreis'])
    expect(headers()).toContain('Bezeichnung')
    expect(headers()).toContain('Menge')
    // Heading and cells go together, or a row would fall out of line with its own header.
    const cells = [...(container.querySelector('tbody tr')?.querySelectorAll('td') ?? [])]
    expect(cells.filter(narrow)).toHaveLength(2)
  })

  it('stockAsOfPageWithoutBackdatedMovementsShowsNoHintTest', async () => {
    await render()

    expect(container.querySelector('[role="status"]')).toBeNull()
    expect(text()).not.toContain('nachträglich')
  })

  /**
   * Without this sentence nobody can explain why the same report reads differently than last
   * month, so it names the number and leads into the movements it is talking about.
   */
  it('stockAsOfPageLinksTheBackdatedHintIntoTheJournalTest', async () => {
    facts = summary({ backdatedMovements: 3 })
    await render()

    const hint = container.querySelector('[role="status"]')

    expect(hint?.textContent).toContain(
      '3 Buchungen wurden nachträglich auf einen Tag bis zum 21.01.2026 gebucht.',
    )
    expect(hint?.querySelector('a')?.getAttribute('href')).toBe('/lagerbewegungen?bis=2026-01-21')
  })

  /**
   * A computed figure without a way to check it is not believed, and the check is cut at the
   * same day the figure was worked out for.
   */
  it('stockAsOfPageLinksEveryQuantityToTheJournalTest', async () => {
    await render()

    const hrefs = [...container.querySelectorAll('tbody a')].map((link) =>
      link.getAttribute('href'),
    )

    expect(hrefs).toEqual(
      ROWS.map(
        (row) =>
          `/lagerbewegungen?produkt=${row.productId}&lagerort=${row.locationId}&bis=2026-01-21`,
      ),
    )
  })

  /**
   * A whole day is asked for, whichever day it is: whether a cut-off date may be asked about
   * is a rule of the inventory and belongs to the server. Its refusal then stands at the date
   * field in its own words, the ones of `InventoryRules.validateAsOfDate` — issue #23 asks for
   * «die ApiError-Meldung» in that place, and a second wording in the mask would be the same
   * rule twice, free to drift.
   *
   * <p>What the table shows is the last day that was answered for, and the header names that
   * day: «Bestand per 31.12.2099» over the rows of the 21.01.2026 would be worse than the
   * message that was missing.
   */
  it('stockAsOfPageWithAFutureDateKeepsTheRowsTest', async () => {
    await render()

    reportFailure = { status: 400, detail: 'Der Stichtag darf nicht in der Zukunft liegen' }
    summaryFailure = reportFailure
    typeDate('2099-12-31')
    await settle()

    // The day went out, whole and to both endpoints the screen reads from.
    expect(listCalls()).toHaveLength(2)
    expect(listCalls()[1]).toContain('date=2099-12-31')
    expect(summaryCalls()).toHaveLength(2)
    // ... and what came back stands at the field, word for word.
    expect(dateHint()).toBe('Der Stichtag darf nicht in der Zukunft liegen')
    expect(dateField().getAttribute('aria-invalid')).toBe('true')
    // The rows are the ones of the day the header names, and nothing is said a second time.
    expect(bodyRows()).toHaveLength(3)
    expect(text()).toContain('Bestand per 21.01.2026')
    expect(text()).not.toContain('war kein Bestand gebucht')
    expect(alerts()).toHaveLength(0)
    // Every way out of the table is cut at that day too, not at the one in the field.
    expect(container.querySelector('tbody a')?.getAttribute('href')).toContain(
      'bis=2026-01-21',
    )
  })

  /**
   * The figures over the table belong to the day the rows belong to. Losing them under a
   * refusal would take the value columns with them, which reads as «no cost is entered» — a
   * statement about the books that nobody made (backend ADR-0071).
   */
  it('stockAsOfPageWithAFutureDateKeepsTheFiguresOfTheAcceptedDayTest', async () => {
    rows = VALUED_ROWS
    facts = summary({ backdatedMovements: 3 })
    await render()

    reportFailure = { status: 400, detail: 'Der Stichtag darf nicht in der Zukunft liegen' }
    summaryFailure = reportFailure
    typeDate('2099-12-31')
    await settle()

    expect(text()).toContain('84 Zeilen')
    expect(headers()).toContain('Wert')
    // The hint names the day the figures were worked out for, not the one in the field.
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      '3 Buchungen wurden nachträglich auf einen Tag bis zum 21.01.2026 gebucht.',
    )
  })

  /**
   * The one place where the wrong day would be a lie rather than a slip: «Am 31.12.2099 war
   * kein Bestand gebucht» about a day the server flatly refused to answer for.
   */
  it('stockAsOfPageWithAFutureDateKeepsTheDayOfTheEmptyStateTest', async () => {
    rows = []
    facts = summary({ lineCount: 0, showsValue: false })
    await render()

    typeDate('2025-12-31')
    await settle()
    expect(text()).toContain('Am 31.12.2025 war kein Bestand gebucht.')

    reportFailure = { status: 400, detail: 'Der Stichtag darf nicht in der Zukunft liegen' }
    summaryFailure = reportFailure
    typeDate('2099-12-31')
    await settle()

    expect(text()).toContain('Am 31.12.2025 war kein Bestand gebucht.')
    expect(text()).not.toContain('2099')
    expect(dateHint()).toBe('Der Stichtag darf nicht in der Zukunft liegen')
  })

  /** The printout is the report on the screen, so it asks for the day the screen is about. */
  it('stockAsOfPageWithAFutureDatePrintsTheAcceptedDayTest', async () => {
    await render()

    reportFailure = { status: 400, detail: 'Der Stichtag darf nicht in der Zukunft liegen' }
    summaryFailure = reportFailure
    typeDate('2099-12-31')
    await settle()
    await press(buttonNamed('Als PDF anzeigen'))

    expect(pdfCalls()).toEqual(['/api/tenants/1/inventory/as-of/pdf?date=2026-01-21'])
    expect(showFile).toHaveBeenCalledTimes(1)
  })

  /**
   * A half typed day is no day; asking then would earn a 400 for nothing.
   *
   * <p>The list and the figures both stand still: a request built without `date` is malformed,
   * and it is the mask that keeps it at home rather than the server that turns it away. Its
   * sentence is about completeness and about nothing else — «not in the future» is not said
   * here, because that rule is answered by the server (`missingAsOfDateNote`).
   */
  it('stockAsOfPageWithAnEmptyDateAsksNothingTest', async () => {
    await render()

    typeDate('')
    await settle()

    expect(dateHint()).toBe('Zu einem Bestandsbericht gehört ein vollständiger Stichtag.')
    expect(dateHint()).not.toContain('Zukunft')
    expect(bodyRows()).toHaveLength(3)
    expect(listCalls()).toHaveLength(1)
    expect(summaryCalls()).toHaveLength(1)
  })

  it('stockAsOfPageAsksAgainForAnAcceptedDateTest', async () => {
    await render()

    typeDate('2025-12-31')
    await settle()

    expect(dateHint()).toBe('')
    expect(listCalls()).toHaveLength(2)
    expect(listCalls()[1]).toContain('date=2025-12-31')
    expect(text()).toContain('Bestand per 31.12.2025')
  })

  /** Nothing was booked up to that day — which is an answer, and reads as one. */
  it('stockAsOfPageExplainsAnEmptyReportTest', async () => {
    rows = []
    facts = summary({ lineCount: 0, showsValue: false })
    await render()

    typeDate('2025-12-31')
    await settle()

    expect(text()).toContain('Am 31.12.2025 war kein Bestand gebucht.')
    expect(linkNamed('Bestand heute ansehen')?.getAttribute('href')).toBe('/bestand')
    // Nothing to value and nothing to explain: no note about a missing value column either.
    expect(text()).not.toContain('kein Einstandspreis erfasst')
  })

  /**
   * A search that finds nothing says nothing about the day. The sentence above the table counts
   * the whole report and leaves the quick search out on purpose, so the empty state has to
   * reconcile the two instead of contradicting them.
   */
  it('stockAsOfPageWithASearchThatFindsNothingSaysSoTest', async () => {
    await render()

    rows = []
    typeInto(searchField(), 'gibtesnicht')
    await settleSearch()

    expect(text()).toContain('Keine Treffer.')
    expect(text()).not.toContain('war kein Bestand gebucht')
    expect(text()).toContain('Die Zeilenzahl darüber zählt den ganzen Bericht')
    expect(text()).toContain('84 Zeilen')
    expect(buttonNamed('Filter zurücksetzen')).not.toBeUndefined()
  })

  /**
   * «Zeilen ohne Bestand zeigen» is a filter like the other two, so the reset takes it back and
   * the day itself is only spoken about once nothing narrows the list any more.
   */
  it('stockAsOfPageResetsAFilterThatEmptiedTheListTest', async () => {
    await render()

    rows = []
    click(zeroRowsBox())
    await settle()

    expect(text()).toContain('Keine Treffer.')
    // Nothing was searched for, so nothing needs explaining about the figures either.
    expect(text()).not.toContain('Die Zeilenzahl darüber')

    rows = ROWS
    click(buttonNamed('Filter zurücksetzen'))
    await settle()

    expect(zeroRowsBox().checked).toBe(false)
    expect(bodyRows()).toHaveLength(3)
  })

  /**
   * The way out of an empty report is a booking, not a look at today's stock — the report is
   * empty because nothing was ever booked up to that day (issue #23, «Weg zum Buchungsdialog»).
   */
  it('stockAsOfPageOffersTheBookingDialogWhereNothingIsBookedTest', async () => {
    auth = session(['INVENTORY_READ', 'INVENTORY_MOVE'])
    rows = []
    facts = summary({ lineCount: 0, showsValue: false })
    await render()

    click(buttonNamed('Bestand buchen'))
    await settle()

    expect(text()).toContain('Bestand entsteht nur aus Bewegungen')
  })

  /** Without the right to book, the button that would end in a 403 is not offered at all. */
  it('stockAsOfPageWithoutTheRightToBookOffersNoBookingTest', async () => {
    rows = []
    facts = summary({ lineCount: 0, showsValue: false })
    await render()

    expect(buttonNamed('Bestand buchen')).toBeUndefined()
    expect(linkNamed('Bestand heute ansehen')).not.toBeUndefined()
  })

  /**
   * The worst of the silent failures: without the figures the value columns are gone, and that
   * looks exactly like a report nobody entered a cost for. One is a statement about the books,
   * the other is a broken connection (backend ADR-0071).
   */
  it('stockAsOfPageSaysWhenTheFiguresFailedTest', async () => {
    rows = VALUED_ROWS
    summaryFailure = { status: 500 }
    await render()

    expect(alerts()).toHaveLength(1)
    expect(alerts()[0]?.textContent).toContain('Das Backend meldet einen Fehler.')
    expect(alerts()[0]?.textContent).toContain('führt keine Wertspalten')
    expect(text()).not.toContain('kein Einstandspreis erfasst')
    expect(headers()).not.toContain('Wert')
    // The quantities came back and stay: only the valuation is unclear.
    expect(bodyRows()).toHaveLength(3)
  })

  /**
   * A refused request is not an empty day. Where nothing came back at all the table says what
   * happened instead of claiming that nothing was booked.
   */
  it('stockAsOfPageWithARefusedRequestShowsNoEmptyStateTest', async () => {
    reportFailure = { status: 400, detail: 'Der Stichtag liegt vor dem ersten Geschäftsjahr.' }
    await render()

    expect(text()).not.toContain('war kein Bestand gebucht')
    expect(alerts()).toHaveLength(1)
    expect(alerts()[0]?.textContent).toContain('Der Stichtag liegt vor dem ersten Geschäftsjahr.')
    // And the field carries it too, because the day is what the server refused.
    expect(dateHint()).toBe('Der Stichtag liegt vor dem ersten Geschäftsjahr.')
  })

  /**
   * The same for a day asked for later on, and for any other reason the server has: a refusal
   * is shown, never turned into an answer — and it is shown once, at the field. A notice over
   * the table replaces the table, and the rows of the day that was accepted still hold.
   */
  it('stockAsOfPageWithARefusedDateShowsTheFailureNotAnEmptyReportTest', async () => {
    await render()

    reportFailure = { status: 400, detail: 'Der Stichtag liegt vor dem ersten Geschäftsjahr.' }
    typeDate('2020-01-01')
    await settle()

    expect(dateHint()).toBe('Der Stichtag liegt vor dem ersten Geschäftsjahr.')
    expect(text()).not.toContain('war kein Bestand gebucht')
    expect(alerts()).toHaveLength(0)
    expect(bodyRows()).toHaveLength(3)
    expect(text()).toContain('Bestand per 21.01.2026')
  })
})
