// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import { ACCOUNTING_RIGHTS, PRIOR_YEAR_PATH } from '../lib/accounting'
import type { FiscalYear, FiscalYearList, Statement, StatementRow } from '../lib/types'
import { BalanceSheetPage } from './BalanceSheetPage'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// jsdom has neither a print dialog nor a way to open a tab or save a file, so the three ways out
// of the head are stood in for. What is watched here is the address «Drucken» asks for.
const printFile = vi.hoisted(() =>
  vi.fn<(file: { fileName: string; blob: Blob }) => Promise<void>>(),
)
vi.mock('../lib/print', () => ({
  printFile,
  PrintNotPossibleError: class PrintNotPossibleError extends Error {},
}))

const showFile = vi.hoisted(() => vi.fn<(file: { fileName: string; blob: Blob }) => void>())
const downloadFile = vi.hoisted(() => vi.fn<(file: { fileName: string; blob: Blob }) => void>())
vi.mock('../lib/files', () => ({ showFile, downloadFile }))

const TENANT = 1

function session(permissions: string[]): AuthState {
  return {
    user: {
      userId: 1,
      username: 'muster',
      activeTenantId: TENANT,
      superuser: false,
      tenants: [
        { id: TENANT, code: 'WX', name: 'Webux', isDefault: true, modules: ['ACCOUNTING'] },
      ],
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

const READER = session([ACCOUNTING_RIGHTS.read])
/** Holds the closing right on top: the one that may capture the prior year. */
const CLOSER = session([ACCOUNTING_RIGHTS.read, ACCOUNTING_RIGHTS.close])

/** The note the backend words where there is no prior year (OR Art. 958d Abs. 2). */
const PRIOR_YEAR_NOTE =
  'Vorjahreszahlen liegen nicht vor — erstes Geschäftsjahr in dieser Buchhaltung'
  + ' (OR Art. 958d Abs. 2).'

/** Wide enough that today always falls into it, whenever the suite happens to run. */
const YEAR: FiscalYear = {
  id: 3,
  label: 'laufend',
  numberYear: 2026,
  startDate: '2000-01-01',
  endDate: '2099-12-31',
  status: 'OPEN',
  deletable: false,
  editable: false,
  spansAFullCalendarYear: true,
  postedEntries: 12,
  postedEntriesBesidesOpening: 11,
}

const YEARS: FiscalYearList = {
  years: [YEAR],
  boundary: { postableFrom: null, lockedUntil: null, source: 'NONE', message: '' },
  expiry: { lastEndDate: '2099-12-31', daysLeft: 9999, warn: false },
}

function statement(over: Partial<Statement> = {}): Statement {
  return {
    report: 'BALANCE_SHEET',
    fiscalYearId: 3,
    fiscalYearLabel: 'laufend',
    startDate: '2000-01-01',
    endDate: '2099-12-31',
    asOf: null,
    currency: 'CHF',
    priorFiscalYearId: 2,
    priorFiscalYearLabel: '2025',
    drafts: { count: 0, amount: 0 },
    control: { label: 'Aktiven minus Passiven', amount: 0, balanced: true },
    notes: [
      { kind: 'MANUAL_ONLY', text: 'Diese Auswertung enthält, was gebucht wurde.' },
      { kind: 'NO_ANNUAL_ACCOUNTS', text: 'Die Jahresrechnung nach OR Art. 958 Abs. 2 …' },
    ],
    rows: ROWS,
    ...over,
  }
}

const ROWS: StatementRow[] = [
  { kind: 'GROUP', level: 0, label: 'AKTIVEN', negativeItem: false, synthetic: false },
  {
    kind: 'POSITION',
    level: 2,
    position: 'UV_FORDERUNGEN_LL',
    label: 'Forderungen aus Lieferungen und Leistungen',
    amount: 127400,
    priorAmount: 98230.55,
    negativeItem: false,
    synthetic: false,
  },
  {
    kind: 'ACCOUNT',
    level: 3,
    position: 'UV_FORDERUNGEN_LL',
    label: 'Forderungen aus L+L',
    accountId: 11,
    accountNumber: '1100',
    amount: 127400,
    priorAmount: 98230.55,
    negativeItem: false,
    synthetic: false,
  },
  {
    kind: 'POSITION',
    level: 2,
    position: 'UV_VORRAETE',
    label: 'Vorräte',
    amount: 0,
    priorAmount: 0,
    negativeItem: false,
    synthetic: false,
  },
  {
    kind: 'TOTAL',
    level: 0,
    label: 'TOTAL AKTIVEN',
    amount: 127400,
    priorAmount: 98230.55,
    negativeItem: false,
    synthetic: false,
  },
  // The proof is a row of the answer like any other — the shape the backend really sends.
  {
    kind: 'CONTROL',
    level: 0,
    label: 'Aktiven minus Passiven',
    amount: 0,
    priorAmount: 0,
    negativeItem: false,
    synthetic: false,
  },
]

let container: HTMLDivElement
let root: Root
let asked: string[]
let answer: Statement

function json(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

beforeEach(() => {
  asked = []
  answer = statement()
  vi.stubGlobal('fetch', (url: string) => {
    asked.push(url)
    if (url.includes('/accounting/fiscal-years')) return json(YEARS)
    return json(answer)
  })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

async function paint(auth: AuthState = READER) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <AuthContext.Provider value={auth}>
        <QueryClientProvider client={client}>
          <MemoryRouter>
            <BalanceSheetPage />
          </MemoryRouter>
        </QueryClientProvider>
      </AuthContext.Provider>,
    )
  })
  await settle()
}

async function settle() {
  for (let round = 0; round < 4; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
  }
}

/** One button, by the text on it. */
function buttonNamed(label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === label,
  )
  if (found === undefined) throw new Error(`Knopf «${label}» fehlt`)
  return found as HTMLButtonElement
}

/** How often one text stands on the screen. */
function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

/** One link, by the text on it, or nothing where it does not stand. */
function linkNamed(label: string): HTMLAnchorElement | undefined {
  return [...container.querySelectorAll('a')].find(
    (candidate) => candidate.textContent?.trim() === label,
  )
}

/** The answer of a first fiscal year: no year before it, and the note that says so. */
function firstYear(): Statement {
  return statement({
    priorFiscalYearId: null,
    priorFiscalYearLabel: null,
    notes: [{ kind: 'PRIOR_YEAR_MISSING', text: PRIOR_YEAR_NOTE }],
  })
}

describe('BalanceSheetPage', () => {
  /** The proof stands under the figures, and it stands there even at 0.00. */
  it('balanceSheetShowsTheControlLineTest', async () => {
    await paint()

    // Once, and only once: the answer carries the proof as a row, and drawing it a second time
    // in a footer would have the screen show two proofs where printout and CSV show one.
    expect(occurrences(container.textContent ?? '', 'Aktiven minus Passiven')).toBe(1)
    expect(container.textContent).toContain('TOTAL AKTIVEN')
    // The year is compulsory at the endpoint, so the screen picks one before it asks at all.
    expect(asked.some((url) => url.includes('/balance-sheet?fiscalYearId=3'))).toBe(true)
  })

  /**
   * <b>OR Art. 958d Abs. 2 is answered on the screen, not only in the code.</b> Where there is
   * no prior year, the note the backend worded stands under the figures.
   */
  it('balanceSheetShowsThePriorYearNoteTest', async () => {
    answer = firstYear()

    await paint()

    expect(container.textContent).toContain('Vorjahreszahlen liegen nicht vor')
    expect(container.textContent).toContain('OR Art. 958d Abs. 2')
  })

  /**
   * <b>The second of the three ways to the prior year screen.</b> The note names the gap, and
   * beside it stands the way to close it — without a year in the address, because where the
   * note stands there is no prior year to name.
   */
  it('balanceSheetOffersThePriorYearCaptureTest', async () => {
    answer = firstYear()

    await paint(CLOSER)

    const way = linkNamed('Vorjahr erfassen')
    expect(way?.getAttribute('href')).toBe(PRIOR_YEAR_PATH)
    // Beside the note, in the same sentence block — not somewhere in the head.
    expect(way?.closest('p')?.textContent).toContain('Vorjahreszahlen liegen nicht vor')
  })

  /** The note stands for every reader; the link stands for the right that can capture. */
  it('balanceSheetHidesThePriorYearCaptureWithoutCloseTest', async () => {
    answer = firstYear()

    await paint(READER)

    expect(container.textContent).toContain('Vorjahreszahlen liegen nicht vor')
    expect(linkNamed('Vorjahr erfassen')).toBeUndefined()
  })

  /** Where a prior year stands, there is no note and nothing to capture from here. */
  it('balanceSheetOffersNoPriorYearCaptureWithAPriorYearTest', async () => {
    await paint(CLOSER)

    expect(container.textContent).not.toContain('Vorjahreszahlen liegen nicht vor')
    expect(linkNamed('Vorjahr erfassen')).toBeUndefined()
  })

  /** What is not in the figures is said above them, in the words the backend chose. */
  it('balanceSheetShowsTheDraftWarningTest', async () => {
    answer = statement({
      drafts: { count: 3, amount: 12480.55 },
      notes: [
        {
          kind: 'DRAFTS',
          text: '3 Buchungen sind noch nicht verbucht (12’480.55 CHF). Sie sind in dieser'
            + ' Auswertung nicht enthalten.',
        },
      ],
    })

    await paint()

    expect(container.textContent).toContain('3 Buchungen sind noch nicht verbucht')
  })

  /**
   * <b>«Als CSV» leads to the archive ZIP of the year and nowhere else.</b> A second way to the
   * same figures would be a second file name and a second header line that can drift apart, and
   * OR Art. 958f wants the year in one file rather than five loose sheets.
   */
  it('balanceSheetCsvLeadsToTheArchiveZipTest', async () => {
    await paint()

    await act(async () => {
      buttonNamed('Als CSV').click()
    })
    await settle()

    expect(asked.some((url) => url === '/api/tenants/1/accounting/export?fiscalYearId=3')).toBe(true)
    expect(asked.some((url) => url.includes('bilanz.csv'))).toBe(false)
  })

  /**
   * «Positionen ohne Werte ausblenden» is on by default and filters locally: the answer already
   * carries every position, so switching it costs no request.
   */
  it('balanceSheetHidesEmptyPositionsByDefaultTest', async () => {
    await paint()

    expect(container.textContent).toContain('Forderungen aus Lieferungen')
    expect(container.textContent).not.toContain('Vorräte')
    // And the account lines are off until somebody asks for them.
    expect(container.textContent).not.toContain('1100 Forderungen aus L+L')
  })

  /**
   * <b>The toolbar stands in the head, and the paper shows what the screen showed.</b> «Drucken»
   * asks for the PDF with the two switches as they stand, and once a day is typed and the
   * accounts are turned on, the address carries all three.
   */
  it('balanceSheetPrintsThePdfWithTheSwitchesTest', async () => {
    printFile.mockResolvedValue(undefined)
    await paint()

    await act(async () => {
      buttonNamed('Drucken').click()
    })
    await settle()

    expect(asked).toContain(
      '/api/tenants/1/accounting/pdf/balance-sheet?fiscalYearId=3&hideEmpty=true'
        + '&withAccounts=false',
    )
    expect(printFile).toHaveBeenCalledTimes(1)

    await act(async () => {
      fieldNamed('Konten zeigen').click()
    })
    typeInto(fieldNamed('Stichtag'), '2026-06-30')
    await settle()
    await act(async () => {
      buttonNamed('Drucken').click()
    })
    await settle()

    expect(asked).toContain(
      '/api/tenants/1/accounting/pdf/balance-sheet?fiscalYearId=3&asOf=2026-06-30'
        + '&hideEmpty=true&withAccounts=true',
    )
    expect(printFile).toHaveBeenCalledTimes(2)
  })
})

/** The control behind one label. */
function fieldNamed(label: string): HTMLInputElement {
  const found = [...container.querySelectorAll('label')].find(
    (candidate) => candidate.textContent === label,
  )
  const input = found === undefined ? null : document.getElementById(found.htmlFor)
  if (input === null) throw new Error(`Feld «${label}» fehlt`)
  return input as HTMLInputElement
}

/** One keystroke, the way React notices one. */
function typeInto(element: HTMLInputElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )?.set
    setter?.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
