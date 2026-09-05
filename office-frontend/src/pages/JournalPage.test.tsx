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

const YEARS = {
  years: [
    {
      id: 3,
      label: '2026',
      numberYear: 2026,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      status: 'OPEN',
      deletable: false,
      editable: false,
      spansAFullCalendarYear: true,
    },
  ],
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
  journalStatus = 200
  reverseStatus = 200
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

async function click(element: HTMLElement | undefined) {
  if (element === undefined) throw new Error('Bedienelement fehlt')
  await act(async () => {
    element.click()
  })
  await settle()
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
