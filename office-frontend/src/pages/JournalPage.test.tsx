// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import { ACCOUNTING_RIGHTS, JOURNAL_PATH } from '../lib/accounting'
import type { JournalRow, Page } from '../lib/types'
import { JournalPage } from './JournalPage'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// jsdom has neither a print dialog nor a way to open a tab, so the two ways out of the toolbar
// are stood in for. What is watched here is the address «Drucken» asks for.
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

function session(permissions: string[], modules: string[] = ['ACCOUNTING']): AuthState {
  return {
    user: {
      userId: 1,
      username: 'muster',
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

const POSTING = session([ACCOUNTING_RIGHTS.read, ACCOUNTING_RIGHTS.post])
const READ_ONLY = session([ACCOUNTING_RIGHTS.read])
/** Filing writes an unchangeable row, so it hangs on the closing right and not on the read one. */
const CLOSING = session([ACCOUNTING_RIGHTS.read, ACCOUNTING_RIGHTS.close])

const YEAR_2026 = {
  id: 3,
  label: '2026',
  numberYear: 2026,
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  status: 'OPEN',
  deletable: false,
  editable: false,
  spansAFullCalendarYear: true,
}

/**
 * The year before, for the tests about switching.
 *
 * <p>Deliberately the earlier one: the screen opens on the year today falls into and, where
 * today falls into none, on the one that ends last — so 2026 stays the preselected year
 * whichever of the two branches the clock takes the test down.
 */
const YEAR_2025 = {
  ...YEAR_2026,
  id: 2,
  label: '2025',
  numberYear: 2025,
  startDate: '2025-01-01',
  endDate: '2025-12-31',
  status: 'CLOSED',
}

const YEARS = {
  years: [YEAR_2026],
  boundary: { source: 'NONE', message: '' },
  expiry: { warn: false },
}

const ROWS: JournalRow[] = [
  {
    id: 45,
    entryNumber: '2026-000045',
    bookingDate: '2026-09-09',
    entryKind: 'NORMAL',
    source: 'MANUAL',
    description: 'Miete September',
    documentReference: 'MB-144',
    currencyCode: 'CHF',
    amount: 3200,
    reversesEntryId: null,
    reversalReason: null,
    chainNumber: 45,
    postedAt: '2026-09-09T09:12:00Z',
    postedBy: 'muster',
    lines: [
      {
        id: 1,
        lineNumber: 1,
        accountId: 4,
        accountNumber: '6000',
        accountName: 'Raumaufwand',
        accountType: 'EXPENSE',
        debit: 3200,
        credit: 0,
        exchangeRateUnit: 1,
        taxGenerated: false,
      },
      {
        id: 2,
        lineNumber: 2,
        accountId: 1,
        accountNumber: '1020',
        accountName: 'Bankguthaben',
        accountType: 'ASSET',
        debit: 0,
        credit: 3200,
        exchangeRateUnit: 1,
        taxGenerated: false,
      },
    ],
  },
  {
    id: 46,
    entryNumber: '2026-000046',
    bookingDate: '2026-09-10',
    entryKind: 'NORMAL',
    source: 'MANUAL',
    description: 'Storno zu 2026-000045',
    documentReference: 'MB-144',
    currencyCode: 'CHF',
    amount: 3200,
    reversesEntryId: 45,
    reversalReason: 'falsches Konto',
    chainNumber: 46,
    postedAt: '2026-09-10T07:30:00Z',
    postedBy: 'muster',
    lines: [],
  },
  // Neither a counter entry nor reversed: the only one a reversal may still be offered for.
  {
    id: 47,
    entryNumber: '2026-000047',
    bookingDate: '2026-09-11',
    entryKind: 'NORMAL',
    source: 'MANUAL',
    description: 'Lohn September',
    documentReference: 'MB-145',
    currencyCode: 'CHF',
    amount: 5400,
    reversesEntryId: null,
    reversalReason: null,
    chainNumber: 47,
    postedAt: '2026-09-11T06:05:00Z',
    postedBy: 'muster',
    lines: [],
  },
]

function pageOf(rows: JournalRow[]): Page<JournalRow> {
  return {
    content: rows,
    page: 0,
    size: 50,
    totalElements: rows.length,
    totalPages: rows.length === 0 ? 0 : 1,
    sort: 'bookingDate,asc',
  }
}

let container: HTMLDivElement
let root: Root
let journal: Page<JournalRow>
let years: unknown
let reversed: { url: string; body: unknown } | null
/** What the toolbar sent to the cupboard, so a test can read the day it filed. */
let filed: { url: string; body: unknown } | null
/** Set where a test is about the request failing. */
let journalStatus: number
/** Set where a test is about the reversal being refused. */
let reverseStatus: number

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

function stubFetch() {
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    if (url.includes('/accounting/fiscal-years')) return json(years)
    if (url.includes('/reverse')) {
      reversed = { url, body: JSON.parse(String(init?.body)) }
      return reverseStatus === 200
        ? json({ id: 47, reversesEntryId: 45, posted: true })
        : json({ detail: 'Buchung 2026-000047 ist bereits storniert.' }, reverseStatus)
    }
    if (url.includes('/accounting/journal')) {
      return journalStatus === 200
        ? json(journal)
        : json({ detail: 'Das Backend meldet einen Fehler.' }, journalStatus)
    }
    if (url.includes('/report-archive')) {
      filed = { url, body: JSON.parse(String(init?.body)) }
      return json(
        {
          id: 14,
          report: 'journal',
          origin: 'MANUAL',
          closingNumber: null,
          title: 'Journal',
          asOfDate: '2026-06-30',
          languageCode: 'de',
          byteCount: 4096,
          sha256: 'a'.repeat(64),
          entryCount: 3,
          lastChainNumber: 47,
          createdAt: '2026-07-04T08:12:00Z',
          createdBy: 'muster',
        },
        201,
      )
    }
    if (url.includes('/catalogues')) {
      return json({
        // Renamed by the tenant on purpose: the labels the screen shows have to come from
        // here, never from a constant in the frontend.
        'entry-kind': [
          { code: 'NORMAL', name: 'Laufende Buchung' },
          { code: 'OPENING', name: 'Eröffnung' },
          { code: 'CLOSING', name: 'Abschluss' },
        ],
        'entry-source': [
          { code: 'MANUAL', name: 'Von Hand' },
          { code: 'BANK', name: 'Bankauszug' },
          // Hidden by the tenant in «Werte». The endpoint answers it all the same — leaving it
          // out is the screen's job.
          { code: 'SYSTEM', name: 'Vom System', visible: false },
        ],
      })
    }
    return json({})
  })
}

beforeEach(() => {
  journal = pageOf(ROWS)
  years = YEARS
  reversed = null
  filed = null
  journalStatus = 200
  reverseStatus = 200
  // The two ways out of the toolbar are module mocks and live longer than one test, so their
  // record is wiped between tests — «not called» has to mean this test, not this file. Same
  // handling as in `ReportToolbar.test.tsx`.
  printFile.mockReset()
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
  for (let round = 0; round < 8; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30))
    })
  }
}

async function render(auth: AuthState = POSTING, at: string = JOURNAL_PATH) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[at]}>
        <AuthContext.Provider value={auth}>
          <QueryClientProvider client={client}>
            <JournalPage />
          </QueryClientProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
  })
  await settle()
}

function button(text: string): HTMLButtonElement | undefined {
  return [...document.body.querySelectorAll('button')].find((entry) =>
    entry.textContent?.includes(text),
  ) as HTMLButtonElement | undefined
}

/** The «Stornieren» buttons of the rows, and never the one in the open dialog. */
function reversibleRows(): HTMLButtonElement[] {
  return [...container.querySelectorAll('button')].filter(
    (entry) =>
      entry.textContent?.includes('Stornieren') && entry.closest('[role="dialog"]') === null,
  ) as HTMLButtonElement[]
}

/** A button inside the open dialog, told apart from the row button of the same wording. */
function inDialog(text: string): HTMLButtonElement | undefined {
  const dialog = document.body.querySelector('[role="dialog"]')
  return [...(dialog?.querySelectorAll('button') ?? [])].find((entry) =>
    entry.textContent?.includes(text),
  ) as HTMLButtonElement | undefined
}

function dialogInput(index: number): HTMLInputElement {
  const dialog = document.body.querySelector('[role="dialog"]')
  const input = [...(dialog?.querySelectorAll('input') ?? [])][index]
  if (input === undefined) throw new Error(`Feld ${index} im Dialog fehlt`)
  return input
}

function typeInDialog(index: number, value: string) {
  const input = dialogInput(index)
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )?.set
    setter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function select(label: string): HTMLSelectElement {
  const found = [...container.querySelectorAll('label')].find(
    (candidate) => candidate.textContent === label,
  )
  const control = found === undefined ? null : document.getElementById(found.htmlFor)
  if (control === null) throw new Error(`Feld «${label}» fehlt`)
  return control as HTMLSelectElement
}

/** A labelled input of the filter row, found the same way as the two dropdowns beside it. */
function field(label: string): HTMLInputElement {
  const found = [...container.querySelectorAll('label')].find(
    (candidate) => candidate.textContent === label,
  )
  const control = found === undefined ? null : document.getElementById(found.htmlFor)
  if (control === null) throw new Error(`Feld «${label}» fehlt`)
  return control as HTMLInputElement
}

/** Writes into a controlled field the way a person does: through the native setter, then input. */
async function typeInto(label: string, value: string) {
  const input = field(label)
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )?.set
    setter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await settle()
}

/** Picks a value in one of the dropdowns of the filter row. */
async function chooseIn(label: string, value: string) {
  const control = select(label)
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype,
      'value',
    )?.set
    setter?.call(control, value)
    control.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await settle()
}

/** The entries behind the arrow of the report toolbar — the rarer ways to the same paper. */
function menuItems(): HTMLButtonElement[] {
  return [...container.querySelectorAll('[role="menuitem"]')] as HTMLButtonElement[]
}

/** Opens the menu behind the arrow and picks one of its entries. */
async function pickInMenu(label: string) {
  const toggle = container.querySelector('button[aria-haspopup="menu"]')
  await click(toggle === null ? undefined : (toggle as HTMLButtonElement))
  await click(menuItems().find((item) => item.textContent?.includes(label)))
}

async function click(element: HTMLElement | undefined) {
  if (element === undefined) throw new Error('Bedienelement fehlt')
  await act(async () => {
    element.click()
  })
  await settle()
}

/**
 * Writes down every address asked for, and answers it the way `beforeEach` does.
 *
 * <p>The tests about the three ways to the paper are all about the address one of them builds,
 * and a recorder wrapped around the standing stub keeps them from each carrying a second one.
 */
function watchAddresses(): string[] {
  const asked: string[] = []
  const answer = globalThis.fetch
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    asked.push(url)
    return answer(url, init)
  })
  return asked
}

describe('JournalPage', () => {
  /**
   * <b>The third step of the drill-down out of the account sheet.</b> A row there leads here with
   * one entry named, and that entry opens straight away — there is no screen of its own for a
   * single booking, because a second mask for the same entry would be a second truth about it.
   */
  it('opensTheEntryFromTheQueryTest', async () => {
    await render(POSTING, `${JOURNAL_PATH}?fiscalYearId=3&entryId=45`)

    const opened = [...container.querySelectorAll('[aria-expanded="true"]')]
    expect(opened).toHaveLength(1)
    expect(opened[0].textContent).toContain('2026-000045')
  })

  /**
   * Without the parameter nothing is opened. The journal is a list, and a row that unfolded on
   * its own would look like the one somebody had been looking for.
   */
  it('opensNothingWithoutTheQueryTest', async () => {
    await render()

    expect(container.querySelectorAll('[aria-expanded="true"]')).toHaveLength(0)
  })

  it('rendersJournalTest', async () => {
    await render()

    expect(container.textContent).toContain('2026-000045')
    expect(container.textContent).toContain('Miete September')
    expect(container.textContent).toContain('09.09.2026')
    // The one figure stands in both columns of the head row.
    expect(container.textContent).toContain('3’200.00')
  })

  it('rendersLoadingTest', async () => {
    vi.stubGlobal('fetch', () => new Promise(() => {}))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[JOURNAL_PATH]}>
          <AuthContext.Provider value={POSTING}>
            <QueryClientProvider client={client}>
              <JournalPage />
            </QueryClientProvider>
          </AuthContext.Provider>
        </MemoryRouter>,
      )
    })

    expect(container.textContent).toContain('Wird geladen')
  })

  it('rendersEmptyTest', async () => {
    journal = pageOf([])
    await render()

    expect(container.textContent).toContain('Nichts verbucht')
  })

  /** No fiscal year: the endpoint could not even be asked, and the screen says why. */
  it('rendersWithoutAFiscalYearTest', async () => {
    years = { years: [], boundary: { source: 'NONE', message: '' }, expiry: { warn: false } }
    await render()

    expect(container.textContent).toContain('Noch kein Geschäftsjahr')
  })

  it('rendersErrorTest', async () => {
    journalStatus = 500
    await render()

    expect(container.textContent).toContain('Das Backend meldet einen Fehler.')
  })

  it('rendersWithoutTheModuleTest', async () => {
    await render(session([ACCOUNTING_RIGHTS.read], []))

    expect(container.textContent).toContain('Modul nicht eingeschaltet')
  })

  it('rendersWithoutTheRightTest', async () => {
    await render(session([]))

    expect(container.textContent).toContain('Keine Berechtigung')
  })

  /**
   * The two filters label themselves out of the catalogue answer. The tenant renamed `NORMAL`
   * to «Laufende Buchung»; a constant in the frontend would still say «Normal».
   */
  it('labelsTheFiltersFromTheCatalogueTest', async () => {
    await render()

    const kinds = [...select('Buchungsart').options].map((option) => option.textContent)
    expect(kinds).toEqual(['Alle', 'Laufende Buchung', 'Eröffnung', 'Abschluss'])
    const sources = [...select('Herkunft').options].map((option) => option.textContent)
    expect(sources).toEqual(['Alle', 'Von Hand', 'Bankauszug'])
    // And nothing of the kind is written in the frontend.
    expect(kinds).not.toContain('NORMAL')
  })

  /**
   * A value the tenant has hidden is not offered here either. Which values are shown is the
   * tenant's to decide in «Werte»; the endpoint answers the whole catalogue, and reading
   * `visible` is the screen's job — the same filter every dropdown in the house goes through.
   */
  it('leavesHiddenCatalogueValuesOutOfTheFiltersTest', async () => {
    await render()

    const sources = [...select('Herkunft').options].map((option) => option.textContent)
    expect(sources).not.toContain('Vom System')
    expect(sources).toEqual(['Alle', 'Von Hand', 'Bankauszug'])
  })

  /** The fiscal year is compulsory at the endpoint, so the screen picks one before it asks. */
  it('sendsTheFiscalYearTest', async () => {
    const asked: string[] = []
    vi.stubGlobal('fetch', (url: string) => {
      asked.push(url)
      if (url.includes('/accounting/fiscal-years')) return json(years)
      if (url.includes('/accounting/journal')) return json(journal)
      return json({})
    })
    await render()

    expect(asked.some((url) => url.includes('/journal?fiscalYearId=3'))).toBe(true)
  })

  /** A row opens to its lines, and closes again. */
  it('opensARowToItsLinesTest', async () => {
    await render()

    expect(container.textContent).not.toContain('Raumaufwand')

    await click(button('2026-000045'))

    expect(container.textContent).toContain('Raumaufwand')
    expect(container.textContent).toContain('Bankguthaben')

    await click(button('2026-000045'))

    expect(container.textContent).not.toContain('Raumaufwand')
  })

  /** A counter entry is marked as one and carries its reason. */
  it('marksACounterEntryTest', async () => {
    await render()

    expect(container.textContent).toContain('Gegenbuchung')
    expect(container.textContent).toContain('falsches Konto')
    // And the reversed entry is marked from the other side.
    expect(container.textContent).toContain('storniert')
  })

  /** Both ways between the pair, as far as both stand on the page being read. */
  it('linksBetweenTheCounterEntryAndTheOriginalTest', async () => {
    await render()

    expect(button('Storno zu 2026-000045')).toBeDefined()
    expect(button('Storniert durch 2026-000046')).toBeDefined()
  })

  /** Where the partner is not on the page, no link is offered rather than a dead one. */
  it('offersNoLinkWithoutThePartnerOnThePageTest', async () => {
    journal = pageOf([ROWS[0]])
    await render()

    expect(button('Storniert durch')).toBeUndefined()
    expect(container.textContent).not.toContain('storniert')
  })

  /** The reversal asks for the reason, and it is the reason that frees the button. */
  it('reversesAnEntryTest', async () => {
    await render()

    await click(button('Stornieren'))
    const dialog = document.body.querySelector('[role="dialog"]')
    const confirm = [...(dialog?.querySelectorAll('button') ?? [])].find((entry) =>
      entry.textContent?.includes('Stornieren'),
    ) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)

    const reason = [...(dialog?.querySelectorAll('input') ?? [])][0]
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set
      setter?.call(reason, 'falsches Konto')
      reason.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await click(confirm)

    expect(reversed?.url).toContain('/entries/47/reverse')
    expect(reversed?.body).toEqual({ reversalReason: 'falsches Konto' })
  })

  /**
   * The second reversal starts on an empty form.
   *
   * <p>The box stays in the tree while it is shut, so a reason and a booking date left over
   * from the entry before would travel with the next one. Both are unfixable afterwards: the
   * counter entry is posted the moment it is written, the inherited reason then stands in the
   * journal beside an entry it says nothing about, and the inherited date decides which period
   * it lands in.
   */
  it('startsTheSecondReversalEmptyTest', async () => {
    journal = pageOf([
      ...ROWS,
      { ...ROWS[2], id: 48, entryNumber: '2026-000048', description: 'Strom September' },
    ])
    await render()

    await click(reversibleRows()[0])
    typeInDialog(0, 'falsches Konto')
    typeInDialog(1, '2026-09-30')
    await click(inDialog('Stornieren'))
    expect(reversed?.body).toEqual({
      reversalReason: 'falsches Konto',
      bookingDate: '2026-09-30',
    })

    await click(reversibleRows()[1])

    expect(dialogInput(0).value).toBe('')
    expect(dialogInput(1).value).toBe('')
  })

  /** Without the posting right there is nothing to reverse with. */
  it('offersNoReversalWithoutTheRightTest', async () => {
    await render(READ_ONLY)

    expect(button('Stornieren')).toBeUndefined()
  })

  /**
   * The third field of the same family — and the one that survived the last repair.
   *
   * <p>Reason and booking date are emptied when the box opens; the error of the request before
   * was not. Reversing A, being refused, cancelling and then opening B showed A's refusal over
   * B's form: a sentence about an entry that has nothing to do with the one standing there, and
   * the most misleading kind, because it reads as if B had already been refused.
   */
  it('startsTheSecondReversalWithoutTheErrorBeforeTest', async () => {
    journal = pageOf([
      ...ROWS,
      { ...ROWS[2], id: 48, entryNumber: '2026-000048', description: 'Strom September' },
    ])
    reverseStatus = 409
    await render()

    await click(reversibleRows()[0])
    typeInDialog(0, 'falsches Konto')
    await click(inDialog('Stornieren'))
    expect(document.body.textContent).toContain('Buchung 2026-000047 ist bereits storniert.')

    await click(inDialog('Abbrechen'))
    await click(reversibleRows()[1])

    expect(document.body.querySelector('[role="dialog"]')?.textContent).not.toContain(
      'ist bereits storniert.',
    )
    expect(document.body.querySelector('[role="alert"]')).toBeNull()
  })

  /**
   * <b>The journal has a print button now, and untouched it prints the whole journal of the
   * year.</b> Before this toolbar the screen had none.
   *
   * <p><b>The untouched cut-off day does not ride along.</b> The field is prefilled with the
   * last day of the year, and that means «the whole year», not a cut-off day — sending it would
   * write « · Stichtag 31.12.2026» into the head of the printable page (backend
   * `AccountingReports.subtitleOf`). The five filters of the list stay behind too, because the
   * endpoint takes none of them and the journal the law asks for is the complete one (GeBüV
   * Art. 1 Abs. 2 Bst. b), not the page somebody narrowed.
   */
  it('journalPrintsThePdfOfTheYearTest', async () => {
    const asked = watchAddresses()
    printFile.mockResolvedValue(undefined)
    await render(READ_ONLY)

    await click(button('Drucken'))

    expect(asked).toContain('/api/tenants/1/accounting/pdf/journal?fiscalYearId=3')
    expect(
      asked.some((url) => url.includes('/accounting/pdf/journal') && url.includes('asOf')),
    ).toBe(false)
    expect(printFile).toHaveBeenCalledTimes(1)
    expect(showFile).not.toHaveBeenCalled()
  })

  /**
   * <b>The cut-off day starts on the last day of the year.</b> That is the journal everybody
   * means when they say «das Journal 2026», and it is what the paper showed before the day was
   * offered at all — so nobody has to fill a field to get the usual paper.
   */
  it('prefillsTheCutOffWithTheYearEndTest', async () => {
    await render()

    expect(field('Stichtag').value).toBe('2026-12-31')
  })

  /**
   * The prefill also reaches whoever is sent here from an account sheet, with the year already
   * named in the address.
   *
   * <p>The year is known from the query before the year list has arrived. Held against the id,
   * the field would stay empty for exactly this way in — which is the way the drill-down takes.
   */
  it('prefillsTheCutOffWithTheYearFromTheQueryTest', async () => {
    await render(POSTING, `${JOURNAL_PATH}?fiscalYearId=3&entryId=45`)

    expect(field('Stichtag').value).toBe('2026-12-31')
  })

  /**
   * The endpoint refuses a day outside the year with 400 («Der Stichtag muss in das
   * Geschäftsjahr … fallen»), so the picker does not offer one.
   */
  it('boundsTheCutOffToTheFiscalYearTest', async () => {
    await render()

    expect(field('Stichtag').min).toBe('2026-01-01')
    expect(field('Stichtag').max).toBe('2026-12-31')
  })

  /**
   * <b>The day narrows the paper and not the list, and the screen says so.</b> `GET /journal`
   * knows `from` and `to` and no cut-off day (backend `JournalController.getJournal`), so a
   * field that looked like a filter would be one that quietly does nothing — the worst kind.
   */
  it('keepsTheCutOffOutOfTheListTest', async () => {
    const asked = watchAddresses()
    await render()

    await typeInto('Stichtag', '2026-06-30')

    expect(asked.filter((url) => url.includes('/accounting/journal'))).not.toHaveLength(0)
    expect(asked.some((url) => url.includes('/accounting/journal') && url.includes('asOf'))).toBe(
      false,
    )
    expect(container.textContent).toContain('Nur fürs Papier.')
  })

  /** A day somebody chose travels to the paper. */
  it('sendsTheCutOffToThePdfTest', async () => {
    const asked = watchAddresses()
    printFile.mockResolvedValue(undefined)
    await render(READ_ONLY)

    await typeInto('Stichtag', '2026-06-30')
    await click(button('Drucken'))

    expect(asked).toContain(
      '/api/tenants/1/accounting/pdf/journal?fiscalYearId=3&asOf=2026-06-30',
    )
  })

  /**
   * <b>«Im Browser anzeigen» is the third way of the toolbar, and untouched it asks for the whole
   * year too.</b> This is the way the day must be kept off: `GET /print/journal` writes a cut-off
   * day it is given into the head of the sheet — « · Stichtag 31.12.2026» (backend
   * `AccountingReports.subtitleOf`) — and that sheet is the one printed for GeBüV Art. 6 Abs. 3.
   * The PDF cannot show the difference, because a missing day falls back to the year end there.
   */
  it('showsThePageOfTheYearTest', async () => {
    const asked = watchAddresses()
    await render(READ_ONLY)

    await pickInMenu('Im Browser anzeigen')

    expect(asked).toContain('/api/tenants/1/accounting/print/journal?fiscalYearId=3')
    expect(
      asked.some((url) => url.includes('/accounting/print/journal') && url.includes('asOf')),
    ).toBe(false)
    expect(showFile).toHaveBeenCalledTimes(1)
    expect(printFile).not.toHaveBeenCalled()
  })

  /** A day somebody chose travels to the printable page as well, and stands in its head. */
  it('sendsTheCutOffToThePageTest', async () => {
    const asked = watchAddresses()
    await render(READ_ONLY)

    await typeInto('Stichtag', '2026-06-30')
    await pickInMenu('Im Browser anzeigen')

    expect(asked).toContain(
      '/api/tenants/1/accounting/print/journal?fiscalYearId=3&asOf=2026-06-30',
    )
  })

  /**
   * <b>Typed back onto the last day of the year, the day is gone again.</b> What counts is the
   * day, not whether the field was touched: the paper of «31.12.2026» is the paper of the whole
   * year, and after moving the day back nothing should tell the two apart on either way out.
   */
  it('dropsTheCutOffPutBackOnTheYearEndTest', async () => {
    const asked = watchAddresses()
    await render(READ_ONLY)

    await typeInto('Stichtag', '2026-06-30')
    await typeInto('Stichtag', '2026-12-31')
    await pickInMenu('Im Browser anzeigen')

    expect(asked).toContain('/api/tenants/1/accounting/print/journal?fiscalYearId=3')
    expect(
      asked.some((url) => url.includes('/accounting/print/journal') && url.includes('asOf')),
    ).toBe(false)
  })

  /**
   * <b>The first day of the year is a cut-off day like any other.</b> It sits on the other edge
   * of what `min`/`max` allow, and it must not be mistaken for the empty field — a journal up to
   * 1 January is a paper somebody may well ask for.
   */
  it('sendsTheFirstDayOfTheYearAsACutOffTest', async () => {
    const asked = watchAddresses()
    await render(READ_ONLY)

    await typeInto('Stichtag', '2026-01-01')
    await pickInMenu('Im Browser anzeigen')

    expect(asked).toContain(
      '/api/tenants/1/accounting/print/journal?fiscalYearId=3&asOf=2026-01-01',
    )
  })

  /**
   * <b>The day the screen shows is the day that goes into the cupboard.</b> A filed paper can
   * never be changed, so it is worth knowing that the cut-off day of the field is the one written
   * into it and not the year end the dialog would otherwise fall back to.
   */
  it('filesTheCutOffWithTheReportTest', async () => {
    await render(CLOSING)

    await typeInto('Stichtag', '2026-06-30')
    await pickInMenu('Archivieren …')

    expect(document.body.textContent).toContain('Journal per 30.06.2026 wird als PDF abgelegt.')

    await click(inDialog('Archivieren'))

    expect(filed?.body).toEqual({ report: 'journal', fiscalYearId: 3, asOf: '2026-06-30' })
  })

  /**
   * <b>Untouched, the cupboard gets the year and no day — and that is the same row as before.</b>
   * The backend keys a filed paper by the day drawn on the sheet, and without a cut-off day it
   * draws the end of the year (backend `ReportArchiveManagement.archiveByHand` over
   * `AccountingPrintouts.paper`). So `asOf: null` files under the same key as `2026-12-31` would:
   * no second row for the same paper, and no key nobody can find again.
   */
  it('filesTheYearWithoutACutOffTest', async () => {
    await render(CLOSING)

    await pickInMenu('Archivieren …')

    expect(document.body.textContent).toContain('Journal 2026 wird als PDF abgelegt.')

    await click(inDialog('Archivieren'))

    expect(filed?.body).toEqual({ report: 'journal', fiscalYearId: 3, asOf: null })
  })

  /**
   * <b>Choosing another year takes the day with it.</b> Left standing, the day of the year
   * before would fall outside the new one, and the endpoint refuses such a day with 400 — a
   * refusal nobody could make sense of, because nothing on the screen was touched but the year.
   */
  it('resetsTheCutOffWithTheFiscalYearTest', async () => {
    years = { ...YEARS, years: [YEAR_2026, YEAR_2025] }
    await render()
    await typeInto('Stichtag', '2026-06-30')
    expect(field('Stichtag').value).toBe('2026-06-30')

    await chooseIn('Geschäftsjahr', '2')

    expect(field('Stichtag').value).toBe('2025-12-31')
    expect(field('Stichtag').min).toBe('2025-01-01')
    expect(field('Stichtag').max).toBe('2025-12-31')
  })

  /**
   * Filing writes a row that can never be changed or removed, which is why the backend asks
   * `ACCOUNTING_CLOSE` for it. Whoever may only read and post is not offered an entry that ends
   * in a 403 — the two other ways to the same paper stay.
   */
  it('offersNoFilingWithoutTheClosingRightTest', async () => {
    await render(POSTING)

    await click(container.querySelector('button[aria-haspopup="menu"]') as HTMLButtonElement)

    expect(menuItems().map((item) => item.textContent)).toEqual([
      expect.stringContaining('Als PDF speichern'),
      expect.stringContaining('Im Browser anzeigen'),
    ])
  })

  /**
   * The field knows the limit the endpoint holds it to.
   *
   * <p>The reason becomes «Storno zu <Journalnummer>: <Grund>», and that sentence goes into two
   * `VARCHAR(200)` columns. So the room is 188 less the journal number — 177 for a number like
   * 2026-000047, not the 200 of the column. Between 178 and 200 characters somebody typed on
   * unhindered and read the refusal only after pressing the button.
   */
  it('namesTheRoomLeftForTheReasonTest', async () => {
    await render()

    await click(button('Stornieren'))

    expect(dialogInput(0).maxLength).toBe(177)
    expect(document.body.textContent).toContain('Noch 177 von 177 Zeichen')

    typeInDialog(0, 'falsches Konto')

    expect(document.body.textContent).toContain('Noch 163 von 177 Zeichen')
  })

  /** An entry that already has a counter entry gets no second one offered. */
  it('offersNoSecondReversalTest', async () => {
    await render()

    const reversible = [...document.body.querySelectorAll('button')].filter((entry) =>
      entry.textContent?.includes('Stornieren'),
    )
    expect(reversible).toHaveLength(1)
  })
})
