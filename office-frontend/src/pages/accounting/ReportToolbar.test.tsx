// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../../auth/authContext'
import { ACCOUNTING_RIGHTS, type ReportOptions } from '../../lib/accounting'
import type { AccountingReport, ArchivedReport } from '../../lib/types'
import { ReportToolbar } from './ReportToolbar'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// jsdom has neither a print dialog nor a way to open a tab, so the two ways out of the toolbar
// are stood in for. What each of them does is tested in `lib/print.test.ts` and
// `lib/files.test.ts`; what is tested here is which of the two a click reaches for, and with
// which file.
const printFile = vi.hoisted(() =>
  vi.fn<(file: { fileName: string; blob: Blob }) => Promise<void>>(),
)
vi.mock('../../lib/print', () => ({
  printFile,
  PrintNotPossibleError: class PrintNotPossibleError extends Error {},
}))

const showFile = vi.hoisted(() => vi.fn<(file: { fileName: string; blob: Blob }) => void>())
vi.mock('../../lib/files', () => ({ showFile }))

const TENANT = 1

/** The name the backend proposes for the freshly drawn PDF. */
const PDF_FILE = 'balance-sheet-2026.pdf'

/** The name of the self-contained page of #94, which is the other way to the same paper. */
const PAGE_FILE = 'balance-sheet-2026.html'

/** What the backend answers once a paper is filed by hand. */
const FILED: ArchivedReport = {
  id: 14,
  report: 'balance-sheet',
  origin: 'MANUAL',
  closingNumber: null,
  title: 'Bilanz',
  asOfDate: '2026-06-30',
  languageCode: 'de',
  byteCount: 184_320,
  sha256: 'a'.repeat(64),
  entryCount: 34,
  lastChainNumber: 1842,
  createdAt: '2026-07-04T08:12:00Z',
  createdBy: 'muster',
}

/**
 * A session holding the named rights and nothing else.
 *
 * <p>Reading a paper and filing it are two different rights: filing writes a row that can never
 * be changed or removed, and whoever may only look is not offered an entry that ends in a 403.
 */
function session(rights: string[]): AuthState {
  return {
    user: {
      userId: 1,
      username: 'muster',
      activeTenantId: TENANT,
      superuser: false,
      tenants: [
        { id: TENANT, code: 'WX', name: 'Webux', isDefault: true, modules: ['ACCOUNTING'] },
      ],
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
/** The rights of whoever is looking; a test that needs fewer sets its own. */
let auth: AuthState
/** Set by a test that wants the request for the PDF to be refused. */
let pdfFailure: { status: number; detail?: string } | null
/** Set by a test that wants the filing to be refused, with what the backend puts beside it. */
let archiveFailure: { status: number; detail: string; archivedReportId?: number } | null
/** Every request the toolbar sent, in order and whole. */
let sent: { url: string; method: string; body: unknown }[]

function file(name: string, type: string, content: string) {
  return Promise.resolve(
    new Response(content, {
      status: 200,
      headers: { 'Content-Type': type, 'Content-Disposition': `inline; filename="${name}"` },
    }),
  )
}

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

/** An answer the client turns into an `ApiError`, the way the backend refuses one. */
function problem(failure: { status: number; detail?: string; archivedReportId?: number }) {
  const { status, ...payload } = failure
  return Promise.resolve(
    new Response(failure.detail === undefined ? '' : JSON.stringify(payload), {
      status,
      headers: { 'Content-Type': 'application/problem+json' },
    }),
  )
}

function stubFetch() {
  sent = []
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    sent.push({
      url,
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    })
    if (url.includes('/accounting/pdf/')) {
      return pdfFailure === null ? file(PDF_FILE, 'application/pdf', '%PDF-1.7') : problem(pdfFailure)
    }
    if (url.includes('/accounting/print/')) {
      return file(PAGE_FILE, 'text/html', '<!doctype html>')
    }
    if (url.includes('/accounting/report-archive')) {
      return archiveFailure === null ? json(FILED, 201) : problem(archiveFailure)
    }
    return json({})
  })
}

beforeEach(() => {
  auth = session([ACCOUNTING_RIGHTS.read, ACCOUNTING_RIGHTS.close])
  pdfFailure = null
  archiveFailure = null
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

type ToolbarProps = {
  report: AccountingReport
  fiscalYearId: number | null
  yearLabel: string | undefined
  options: ReportOptions
}

/** The balance sheet of 2026, cut to the end of June, as the statement screen shows it. */
const BALANCE_SHEET: ToolbarProps = {
  report: 'balance-sheet',
  fiscalYearId: 3,
  yearLabel: '2026',
  options: { asOf: '2026-06-30', hideEmpty: true, withAccounts: false },
}

/**
 * @param over what differs from the balance sheet above. Spread rather than defaulted, so a
 *   test may hand in `undefined` on purpose and have it stay `undefined`
 */
async function render(over: Partial<ToolbarProps> = {}) {
  const props = { ...BALANCE_SHEET, ...over }
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  await act(async () => {
    root.render(
      <MemoryRouter>
        <AuthContext.Provider value={auth}>
          <QueryClientProvider client={client}>
            <ReportToolbar
              tenantId={TENANT}
              report={props.report}
              fiscalYearId={props.fiscalYearId}
              yearLabel={props.yearLabel}
              options={props.options}
            />
          </QueryClientProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
  })
  await settle()
}

async function settle() {
  for (let round = 0; round < 4; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
  }
}

const alerts = () => [...container.querySelectorAll('[role="alert"]')]
/**
 * By the start of its wording: a busy button carries the spinner's «Wird gesendet» behind its
 * label, and the test that watches the busy state has to find it all the same.
 */
const buttonNamed = (label: string) =>
  [...container.querySelectorAll('button')].find((button) =>
    button.textContent?.trim().startsWith(label),
  )
/** The arrow of the split button, which holds the other ways to the same paper. */
const splitToggle = () =>
  container.querySelector('button[aria-haspopup="menu"]') as HTMLButtonElement | null
const menuItems = () => [...container.querySelectorAll('[role="menuitem"]')] as HTMLButtonElement[]
const menuItemNamed = (label: string) =>
  menuItems().find((item) => item.textContent?.includes(label))
const dialog = () => document.body.querySelector('[role="dialog"]')
const inDialog = (label: string) =>
  [...(dialog()?.querySelectorAll('button') ?? [])].find((button) =>
    button.textContent?.trim().startsWith(label),
  )
const pdfCalls = () => sent.filter((call) => call.url.includes('/accounting/pdf/'))
const pageCalls = () => sent.filter((call) => call.url.includes('/accounting/print/'))
const filings = () =>
  sent.filter((call) => call.url.includes('/report-archive') && call.method === 'POST')

/** Clicks something, and lets whatever it fetched come back. */
async function press(element: Element | null | undefined) {
  if (!element) throw new Error('Bedienelement fehlt')
  await act(async () => {
    ;(element as HTMLElement).click()
  })
  await settle()
}

/** Opens the menu behind the arrow and picks one of its entries. */
async function pick(label: string) {
  await press(splitToggle())
  await press(menuItemNamed(label))
}

describe('ReportToolbar', () => {
  /**
   * <b>Four ways to one paper, and one of them is the usual one.</b> «Drucken» stands on its own
   * on the left; the three rarer ways stand behind the arrow, in a fixed order, and each says
   * in a line what it does.
   */
  it('reportToolbarShowsTheFourWaysTest', async () => {
    await render()

    expect(buttonNamed('Drucken')).toBeDefined()
    await press(splitToggle())

    expect(menuItems().map((item) => item.querySelector('span span')?.textContent)).toEqual([
      'Als PDF speichern',
      'Im Browser anzeigen',
      'Archivieren …',
    ])
    expect(menuItemNamed('Als PDF speichern')?.textContent).toContain('von dort lässt es sich')
    expect(menuItemNamed('Im Browser anzeigen')?.textContent).toContain('auch ohne PDF')
    expect(menuItemNamed('Archivieren …')?.textContent).toContain('unveränderlich')
  })

  /**
   * The one entry that writes is set off from the three that only read: a rule stands above
   * «Archivieren …» and above nothing else.
   */
  it('reportToolbarSetsArchivingOffWithARuleTest', async () => {
    await render()

    await press(splitToggle())

    expect(menuItemNamed('Archivieren …')?.dataset.separator).toBe('true')
    expect(menuItemNamed('Als PDF speichern')?.dataset.separator).toBeUndefined()
    expect(menuItemNamed('Im Browser anzeigen')?.dataset.separator).toBeUndefined()
  })

  /**
   * «Drucken» fetches the PDF and opens the print dialog on it — never a tab (ADR-0009). The
   * address carries the day and the two switches, so the paper shows what the screen showed.
   */
  it('reportToolbarPrintsThePdfTest', async () => {
    await render()

    await press(buttonNamed('Drucken'))

    expect(pdfCalls().map((call) => call.url)).toEqual([
      '/api/tenants/1/accounting/pdf/balance-sheet?fiscalYearId=3&asOf=2026-06-30'
        + '&hideEmpty=true&withAccounts=false',
    ])
    expect(printFile).toHaveBeenCalledTimes(1)
    expect(printFile.mock.calls[0][0].fileName).toBe(PDF_FILE)
    expect(await printFile.mock.calls[0][0].blob.text()).toBe('%PDF-1.7')
    expect(showFile).not.toHaveBeenCalled()
    expect(alerts()).toHaveLength(0)
  })

  /** «Als PDF speichern» fetches the same PDF and hands it to the viewer instead. */
  it('reportToolbarShowsThePdfTest', async () => {
    await render()

    await pick('Als PDF speichern')

    expect(pdfCalls()).toHaveLength(1)
    expect(showFile).toHaveBeenCalledTimes(1)
    expect(showFile.mock.calls[0][0].fileName).toBe(PDF_FILE)
    expect(printFile).not.toHaveBeenCalled()
  })

  /**
   * <b>The HTML page of #94 stays.</b> «Im Browser anzeigen» fetches the self-contained page
   * under the same query and opens it in a tab — the way that works where no PDF can be drawn,
   * and the form that has satisfied GeBüV Art. 6 Abs. 3 since #94.
   */
  it('reportToolbarShowsThePageInTheBrowserTest', async () => {
    await render()

    await pick('Im Browser anzeigen')

    expect(pageCalls().map((call) => call.url)).toEqual([
      '/api/tenants/1/accounting/print/balance-sheet?fiscalYearId=3&asOf=2026-06-30'
        + '&hideEmpty=true&withAccounts=false',
    ])
    expect(pdfCalls()).toHaveLength(0)
    expect(showFile).toHaveBeenCalledTimes(1)
    expect(showFile.mock.calls[0][0].fileName).toBe(PAGE_FILE)
    expect(printFile).not.toHaveBeenCalled()
  })

  /** A paper that does not come back says so under the button, not in the console. */
  it('reportToolbarSaysWhenThePdfFailedTest', async () => {
    pdfFailure = { status: 500 }
    await render()

    await press(buttonNamed('Drucken'))

    expect(alerts()).toHaveLength(1)
    expect(alerts()[0]?.textContent).toContain('Das Backend meldet einen Fehler.')
    expect(printFile).not.toHaveBeenCalled()
    expect(showFile).not.toHaveBeenCalled()
  })

  /**
   * <b>Both halves are off while a paper is on its way.</b> A second click on the left would
   * fetch the same PDF again, and the arrow would offer a third way to the same fetch.
   */
  it('reportToolbarIsOffWhileLoadingTest', async () => {
    await render()
    // A fetch that never answers: the toolbar stays in its busy state for the whole test.
    vi.stubGlobal('fetch', () => new Promise(() => {}))

    await press(buttonNamed('Drucken'))

    expect(buttonNamed('Drucken')?.disabled).toBe(true)
    expect(splitToggle()?.disabled).toBe(true)
  })

  /** Without a fiscal year there is nothing to draw, and neither half offers to. */
  it('reportToolbarIsOffWithoutAYearTest', async () => {
    await render({ fiscalYearId: null })

    expect(buttonNamed('Drucken')?.disabled).toBe(true)
    expect(splitToggle()?.disabled).toBe(true)
    expect(sent).toHaveLength(0)
  })

  /**
   * <b>«Archivieren …» stands only for whoever may close a year.</b> Filing writes a row that
   * can never be changed or removed, and the backend asks `ACCOUNTING_CLOSE` for it; whoever
   * holds the read right alone is not offered an entry that ends in a 403.
   */
  it('reportToolbarHidesArchivingWithoutTheRightTest', async () => {
    auth = session([ACCOUNTING_RIGHTS.read])
    await render()

    await press(splitToggle())

    expect(menuItems()).toHaveLength(2)
    expect(menuItemNamed('Archivieren …')).toBeUndefined()
  })

  /**
   * <b>Filing by hand says what it does before it does it, and where the paper went after.</b>
   * The dialog names the paper and the day and the form that is filed; the request carries
   * exactly the three fields the backend takes — no switch, no language; and the answer offers
   * the way into the cupboard.
   */
  it('reportToolbarArchivesByHandTest', async () => {
    await render()

    await pick('Archivieren …')

    expect(dialog()?.textContent).toContain('Bilanz per 30.06.2026 wird als PDF abgelegt.')
    expect(dialog()?.textContent).toContain('nicht mehr ändern und nicht mehr löschen')
    expect(dialog()?.textContent).toContain('gesetzliche Darstellung')
    expect(filings()).toHaveLength(0)

    await press(inDialog('Archivieren'))

    expect(filings()).toHaveLength(1)
    expect(filings()[0].url).toBe('/api/tenants/1/accounting/report-archive')
    expect(filings()[0].body).toEqual({
      report: 'balance-sheet',
      fiscalYearId: 3,
      asOf: '2026-06-30',
    })
    expect(dialog()?.textContent).toContain('«Bilanz» per 30.06.2026 liegt jetzt im Archiv.')
    expect(dialog()?.querySelector('a')?.getAttribute('href')).toBe('/buchhaltung/archiv')
    expect(inDialog('Archivieren')).toBeUndefined()
    expect(inDialog('Schliessen')).toBeDefined()
  })

  /**
   * A second filing of the same paper for the same day is refused with 409 and the id of the
   * existing one; the dialog turns into that sentence and offers the same way into the cupboard
   * rather than a second «Archivieren».
   */
  it('reportToolbarNamesTheExistingPaperTest', async () => {
    archiveFailure = {
      status: 409,
      detail: '«Bilanz» per 30.06.2026 liegt bereits im Archiv.',
      archivedReportId: 14,
    }
    await render()

    await pick('Archivieren …')
    await press(inDialog('Archivieren'))

    expect(dialog()?.textContent).toContain('liegt bereits im Archiv')
    expect(dialog()?.querySelector('a')?.getAttribute('href')).toBe('/buchhaltung/archiv')
    expect(inDialog('Archivieren')).toBeUndefined()
    expect(inDialog('Schliessen')).toBeDefined()
  })

  /** A refusal that names no paper — the module is off, say — keeps the button and offers no link. */
  it('reportToolbarKeepsTheButtonOnAnotherRefusalTest', async () => {
    archiveFailure = { status: 409, detail: 'Der Mandant betreibt die Buchhaltung nicht.' }
    await render()

    await pick('Archivieren …')
    await press(inDialog('Archivieren'))

    expect(dialog()?.textContent).toContain('Der Mandant betreibt die Buchhaltung nicht.')
    expect(dialog()?.querySelector('a')).toBeNull()
    expect(inDialog('Archivieren')).toBeDefined()
  })

  /**
   * <b>The cupboard holds every account, not the one on the screen.</b> Opened from an account
   * sheet the dialog says so, in the plural and without a day or a year it does not know.
   */
  it('reportToolbarNamesEveryAccountForTheSheetsTest', async () => {
    await render({ report: 'account-sheets', yearLabel: undefined, options: { accountId: 17 } })

    await pick('Archivieren …')

    expect(dialog()?.textContent).toContain('Kontoblätter werden als PDF abgelegt.')
    expect(dialog()?.textContent).toContain('aller Konten mit Bewegung')
    expect(dialog()?.textContent).not.toContain('per ')
  })

  /** Without a cut-off day the paper is the whole year, and the sentence names the year. */
  it('reportToolbarNamesTheYearWithoutADayTest', async () => {
    await render({ report: 'journal', options: {} })

    await pick('Archivieren …')

    expect(dialog()?.textContent).toContain('Journal 2026 wird als PDF abgelegt.')
    expect(dialog()?.textContent).toContain('ohne Suche und Filter')
  })

  /**
   * The second filing starts on the question, not on the answer of the first: the box stays in
   * the tree while it is shut, and «liegt jetzt im Archiv» over a paper nobody has filed yet
   * would read as if it had been.
   */
  it('reportToolbarStartsTheSecondFilingCleanTest', async () => {
    await render()

    await pick('Archivieren …')
    await press(inDialog('Archivieren'))
    expect(dialog()?.textContent).toContain('liegt jetzt im Archiv')
    await press(inDialog('Schliessen'))

    await pick('Archivieren …')

    expect(dialog()?.textContent).toContain('Bilanz per 30.06.2026 wird als PDF abgelegt.')
    expect(dialog()?.textContent).not.toContain('liegt jetzt im Archiv')
  })
})
