// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccountingReport, ArchivedReport, FiscalYear } from '../../lib/types'
import { ReportArchivePanel } from './ReportArchivePanel'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// jsdom cannot open a tab, so the way out of the panel is stood in for. What `showFile` does is
// tested in `lib/files.test.ts`; what is tested here is that a click reaches for it, and with
// which file.
const showFile = vi.hoisted(() => vi.fn<(file: { fileName: string; blob: Blob }) => void>())
vi.mock('../../lib/files', () => ({ showFile }))

const TENANT = 1

/** The five papers a close files, in the order the backend files them (`AccountingReport`). */
const FILING_ORDER: AccountingReport[] = [
  'journal',
  'account-sheets',
  'trial-balance',
  'balance-sheet',
  'income-statement',
]

function year(over: Partial<FiscalYear> = {}): FiscalYear {
  return {
    id: 3,
    label: '2026',
    numberYear: 2026,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    status: 'OPEN',
    deletable: false,
    editable: false,
    spansAFullCalendarYear: true,
    postedEntries: 1204,
    postedEntriesBesidesOpening: 1203,
    ...over,
  }
}

/**
 * One filed paper. Midday UTC on purpose: `formatDateTime` prints the local day, and an
 * evening moment would fall on the next day east of Greenwich.
 */
function paper(over: Partial<ArchivedReport> = {}): ArchivedReport {
  return {
    id: 14,
    report: 'balance-sheet',
    origin: 'MANUAL',
    closingNumber: null,
    title: 'Bilanz',
    asOfDate: '2026-06-30',
    languageCode: 'de',
    byteCount: 182_272,
    sha256: 'a'.repeat(64),
    entryCount: 34,
    lastChainNumber: 1842,
    createdAt: '2026-07-04T12:00:00Z',
    createdBy: 'muster',
    ...over,
  }
}

/**
 * The five papers of one close, as the backend answers them: newest first, so in the reverse
 * of the filing order. The ids leave room for a second close below them.
 *
 * @param closingNumber which close
 * @param firstId the id of the journal, the first paper filed
 */
function close(closingNumber: number, firstId: number): ArchivedReport[] {
  return FILING_ORDER.map((report, index) =>
    paper({
      id: firstId + index,
      report,
      origin: 'CLOSING',
      closingNumber,
      asOfDate: '2026-12-31',
      byteCount: 184_320 + index * 1024,
      createdAt: '2027-03-12T12:00:00Z',
      createdBy: 'jan',
    }),
  ).reverse()
}

let container: HTMLDivElement
let root: Root
/** What the cupboard holds, or the status the list is refused with. */
let archive: ArchivedReport[] | { status: number }
/** Set by a test that wants the bytes of a paper refused. */
let fileFailure: { status: number; detail?: string } | null
/** Every request the panel sent, in order. */
let asked: string[]

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
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

function stubFetch() {
  asked = []
  vi.stubGlobal('fetch', (url: string) => {
    asked.push(url)
    if (/\/report-archive\/\d+$/.test(url)) {
      if (fileFailure !== null) return problem(fileFailure)
      // A string body rather than a Blob: jsdom's Blob has no stream(), and the API client
      // reads the body as one.
      return Promise.resolve(
        new Response('%PDF-1.7', {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': 'inline; filename="balance-sheet-2026.pdf"',
          },
        }),
      )
    }
    if (url.includes('/report-archive?fiscalYearId=')) {
      return Array.isArray(archive) ? json(archive) : problem(archive)
    }
    return json({})
  })
}

beforeEach(() => {
  archive = []
  fileFailure = null
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

async function render(fiscalYear: FiscalYear = year()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <ReportArchivePanel tenantId={TENANT} year={fiscalYear} />
      </QueryClientProvider>,
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

const text = () => container.textContent ?? ''
const headings = () => [...container.querySelectorAll('h3')].map((h) => h.textContent)
/** The name of every paper listed, top to bottom — the first span of the text column, not the one inside the button. */
const names = () =>
  [...container.querySelectorAll('li > div > span:first-child')].map((span) => span.textContent)
/** The fact line under one paper, by the paper's name. */
const factsOf = (name: string) =>
  [...container.querySelectorAll('li')]
    .find((row) => row.querySelector('span')?.textContent === name)
    ?.querySelectorAll('span')[1]?.textContent
/** The «Anzeigen» button of one paper, by what a screen reader is told it opens. */
const openButton = (name: string) =>
  container.querySelector<HTMLButtonElement>(`button[aria-label="${name} anzeigen"]`)
const alerts = () => [...container.querySelectorAll('[role="alert"]')]

/** Clicks something, and lets whatever it fetched come back. */
async function press(element: Element | null | undefined) {
  if (!element) throw new Error('Bedienelement fehlt')
  await act(async () => {
    ;(element as HTMLElement).click()
  })
  await settle()
}

describe('ReportArchivePanel', () => {
  /**
   * <b>The five papers of one close stand as one block</b>, the statements first and the books
   * after, whatever order the backend answered them in — and each says what it is, how big it
   * is, and when and by whom it was filed.
   */
  it('reportArchivePanelGroupsTheFivePapersOfACloseTest', async () => {
    archive = close(1, 20)

    await render()

    expect(asked).toContain('/api/tenants/1/accounting/report-archive?fiscalYearId=3')
    expect(text()).toContain('Archivierte Auswertungen 2026')
    expect(headings()).toEqual(['Abschluss Nr. 1'])
    expect(names()).toEqual([
      'Bilanz per 31.12.2026',
      'Erfolgsrechnung per 31.12.2026',
      'Saldenliste per 31.12.2026',
      'Journal per 31.12.2026',
      'Kontoblätter per 31.12.2026',
    ])
    // The minute is not pinned: `formatDateTime` prints it in the timezone the tests run in.
    expect(factsOf('Journal per 31.12.2026')).toMatch(
      /^PDF · 180 KB · erstellt am 12\.03\.2027, \d{2}:\d{2} von jan$/,
    )
    expect(alerts()).toHaveLength(0)
  })

  /** The panel says why every paper is the same file every time. */
  it('reportArchivePanelSaysNothingIsRedrawnTest', async () => {
    archive = close(1, 20)

    await render()

    expect(text()).toContain('liegt seither unverändert im Archiv')
    expect(text()).toContain('Jeder Aufruf gibt dieselbe Datei zurück; neu gezeichnet wird sie nie.')
    // The row above offers three papers to print and the cupboard holds five: the panel
    // says where the other two come from rather than leaving the difference unexplained.
    expect(text()).toContain('die drei Bücher von oben, dazu Bilanz und Erfolgsrechnung')
  })

  /** An open year without a paper: nothing has been closed yet, and the two ways in are named. */
  it('reportArchivePanelShowsTheEmptyStateTest', async () => {
    archive = []

    await render()

    expect(text()).toContain('Noch nichts abgelegt')
    expect(text()).toContain('Für 2026 liegt noch kein Papier im Archiv.')
    expect(text()).toContain('«Drucken → Archivieren …»')
    expect(headings()).toHaveLength(0)
    expect(openButton('Bilanz per 31.12.2026')).toBeNull()
  })

  /**
   * <b>A closed year without papers was closed before the close filed any, and nothing is
   * rendered after the fact.</b> The panel says so in one sentence, and names the way that
   * stays open: filing by hand.
   */
  it('reportArchivePanelExplainsAClosedYearWithoutPapersTest', async () => {
    archive = []

    await render(year({ status: 'CLOSED' }))

    expect(text()).toContain('Keine Papiere abgelegt')
    expect(text()).toContain('Für 2026 wurden beim Abschluss keine Papiere archiviert')
    expect(text()).toContain('Nachträglich gezeichnet wird nichts')
    expect(text()).toContain('von Hand ablegen')
    expect(text()).not.toContain('Noch nichts abgelegt')
  })

  /** A click fetches the bytes of that one paper and hands them to the viewer. */
  it('reportArchivePanelOpensThePaperTest', async () => {
    archive = close(1, 20)

    await render()
    await press(openButton('Bilanz per 31.12.2026'))

    // The balance sheet is the fourth paper filed, so its id is the journal's plus three.
    expect(asked.filter((url) => /\/report-archive\/\d+$/.test(url))).toEqual([
      '/api/tenants/1/accounting/report-archive/23',
    ])
    expect(showFile).toHaveBeenCalledTimes(1)
    expect(showFile.mock.calls[0][0].fileName).toBe('balance-sheet-2026.pdf')
    expect(await showFile.mock.calls[0][0].blob.text()).toBe('%PDF-1.7')
    expect(alerts()).toHaveLength(0)
  })

  /**
   * A paper that does not come back says so above the list — and the list stays, because the
   * other papers of the year are still there to be opened.
   */
  it('reportArchivePanelKeepsTheListWhenOpeningFailsTest', async () => {
    archive = close(1, 20)
    fileFailure = { status: 500 }

    await render()
    await press(openButton('Journal per 31.12.2026'))

    expect(alerts()).toHaveLength(1)
    expect(alerts()[0]?.textContent).toContain('Das Backend meldet einen Fehler.')
    expect(showFile).not.toHaveBeenCalled()
    expect(names()).toHaveLength(5)
    expect(openButton('Journal per 31.12.2026')?.disabled).toBe(false)
  })

  /**
   * <b>A year closed twice holds ten papers, and none of the first five was overwritten.</b>
   * The newer close stands above the older one, each under its own number (GeBüV Art. 3).
   */
  it('reportArchivePanelShowsTwoClosesAsTwoGroupsTest', async () => {
    archive = [...close(2, 40), ...close(1, 20)]

    await render()

    expect(headings()).toEqual(['Abschluss Nr. 2', 'Abschluss Nr. 1'])
    expect(names()).toHaveLength(10)
    expect(names().slice(0, 5)).toEqual(names().slice(5))
    // Two rows of the same name, one per close, and each opens its own paper.
    const both = container.querySelectorAll('button[aria-label="Bilanz per 31.12.2026 anzeigen"]')
    expect(both).toHaveLength(2)
  })

  /**
   * A paper filed by hand stands in a block of its own below the closes, whatever day it was
   * filed on — so nobody takes it for the paper of a close it is not.
   */
  it('reportArchivePanelListsHandFiledPapersLastTest', async () => {
    // Filed by hand after the close, so the backend answers it first.
    archive = [paper({ id: 50, createdAt: '2027-04-01T12:00:00Z' }), ...close(1, 20)]

    await render()

    expect(headings()).toEqual(['Abschluss Nr. 1', 'Von Hand abgelegt'])
    expect(names()[5]).toBe('Bilanz per 30.06.2026')
    expect(factsOf('Bilanz per 30.06.2026')).toMatch(
      /^PDF · 178 KB · erstellt am 01\.04\.2027, \d{2}:\d{2} von muster$/,
    )
  })

  /** Only hand-filed papers: one block, and no «Abschluss» over it. */
  it('reportArchivePanelWithOnlyHandFiledPapersTest', async () => {
    archive = [
      paper({ id: 51, asOfDate: '2026-09-30', createdAt: '2026-10-02T12:00:00Z' }),
      paper({ id: 50 }),
    ]

    await render()

    expect(headings()).toEqual(['Von Hand abgelegt'])
    expect(names()).toEqual(['Bilanz per 30.09.2026', 'Bilanz per 30.06.2026'])
  })

  /** A cupboard that cannot be read says so instead of pretending it is empty. */
  it('reportArchivePanelSaysWhenTheListFailedTest', async () => {
    archive = { status: 500 }

    await render()

    expect(alerts()).toHaveLength(1)
    expect(alerts()[0]?.textContent).toContain('Das Backend meldet einen Fehler.')
    expect(text()).not.toContain('Noch nichts abgelegt')
    expect(names()).toHaveLength(0)
  })

  /**
   * While one paper is on its way, its button shows it and the others are off: a second click
   * would fetch a second file into a second tab before the first has opened.
   */
  it('reportArchivePanelIsBusyWhileAPaperIsOnItsWayTest', async () => {
    archive = close(1, 20)
    await render()
    // A fetch that never answers: the panel stays in its busy state for the whole test.
    vi.stubGlobal('fetch', () => new Promise(() => {}))

    await press(openButton('Bilanz per 31.12.2026'))

    expect(openButton('Bilanz per 31.12.2026')?.getAttribute('aria-busy')).toBe('true')
    expect(openButton('Bilanz per 31.12.2026')?.disabled).toBe(true)
    expect(openButton('Journal per 31.12.2026')?.getAttribute('aria-busy')).toBe('false')
    expect(openButton('Journal per 31.12.2026')?.disabled).toBe(true)
    expect(showFile).not.toHaveBeenCalled()
  })
})
