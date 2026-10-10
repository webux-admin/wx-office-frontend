// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../../auth/authContext'
import { ACCOUNTING_RIGHTS } from '../../lib/accounting'
import { ReconciliationPage } from './ReconciliationPage'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1

let container: HTMLDivElement
let root: Root
let rows: unknown[] = []
let asked: string[] = []
let orphans: unknown[] = []
/** What `GET /entries/attention` answers: the counters and the changeover day. */
let attention: Record<string, unknown> = {}
/** The stretches the bookkeeping was off, as the report carries them. */
let offPeriods: unknown[] = []
/** What the register «Nicht gebucht» lists while the module is off. */
let waiting: unknown[] = []
/** What the proposal of the catch-up run answers. */
let pending: Record<string, unknown> = {}
/** What the catch-up run answers. */
let ranResult: Record<string, unknown> = {}
/** The bodies of every POST, by URL. */
let posted: { url: string; body: Record<string, unknown> }[] = []

function auth(permissions: string[], modules: string[] = ['ACCOUNTING']): AuthState {
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
    signIn: () => Promise.reject(new Error('not in this test')),
    completeSecondFactor: () => Promise.reject(new Error('not in this test')),
    sendSecondFactorCode: () => Promise.resolve(),
    adoptSession: () => {},
    signOut: () => Promise.resolve(),
    switchTenant: () => Promise.resolve(),
    refresh: () => Promise.resolve(),
    can: (permission: string) => permissions.includes(permission),
  }
}

const READER = auth([ACCOUNTING_RIGHTS.read])
const POSTER = auth([ACCOUNTING_RIGHTS.read, ACCOUNTING_RIGHTS.post])

function stubFetch() {
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    asked.push(url)
    let body: unknown = {}
    if (init?.method === 'POST') {
      posted.push({ url, body: JSON.parse(String(init.body ?? '{}')) })
    }
    if (url.includes('/catch-up-run')) {
      body = ranResult
    } else if (url.includes('/pending-sources')) {
      body = pending
    } else if (url.includes('/fiscal-years')) {
      body = {
        years: [
          {
            id: 7,
            label: '2026',
            year: 2026,
            startDate: '2026-01-01',
            endDate: '2026-12-31',
            status: 'OPEN',
          },
        ],
      }
    } else if (url.includes('/entries/attention')) {
      body = attention
    } else if (url.includes('entries-without-source')) {
      body = orphans
    } else if (url.includes('sources-without-entry')) {
      body = waiting
    } else if (url.includes('/reconciliation')) {
      body = { asOf: null, rows, moduleOffPeriods: offPeriods }
    }
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  })
}

beforeEach(() => {
  asked = []
  posted = []
  pending = {
    from: '2026-07-01',
    total: 2,
    rows: [
      {
        sourceKind: 'DOCUMENT',
        sourceId: 31,
        reference: 'RE-2026-0412',
        day: '2026-08-18',
        amount: 1080.1,
        partner: 'Druckerei Meier AG',
        bookable: true,
      },
      {
        sourceKind: 'DOCUMENT',
        sourceId: 32,
        reference: 'RE-2026-0101',
        day: '2026-07-15',
        amount: 90,
        partner: 'Muster AG',
        reason: 'Nicht nachbuchbar: Das Geschäftsjahr 2026 ist abgeschlossen.',
        bookable: false,
      },
    ],
  }
  ranResult = {
    posted: [
      {
        sourceKind: 'DOCUMENT',
        sourceId: 31,
        reference: 'RE-2026-0412',
        outcome: 'POSTED',
        entryNumber: '2026-000118',
      },
    ],
    skipped: [],
    failed: [],
  }
  attention = {
    drafts: 0,
    draftTotal: 0,
    unpostedDocuments: 12,
    unpostedBankTransactions: 0,
    postingStartsOn: '2026-07-01',
  }
  offPeriods = []
  waiting = [
    {
      sourceKind: 'DOCUMENT',
      sourceId: 31,
      reference: 'RE-2026-0412',
      day: '2026-08-18',
      amount: 1080.1,
    },
  ]
  rows = [
    {
      systemKey: 'DEBITOR_SAMMEL',
      accountNumber: '1100',
      accountName: 'Forderungen aus L+L',
      ledgerAmount: 127400,
      subsidiaryAmount: 127400,
      difference: 0,
      balanced: true,
    },
    {
      systemKey: 'ERHALTENE_ANZAHLUNGEN',
      accountNumber: '2030',
      accountName: 'Anzahlungen von Dritten',
      ledgerAmount: 8250,
      subsidiaryAmount: 8000,
      difference: 250,
      balanced: false,
    },
    {
      systemKey: 'KREDITOR_SAMMEL',
      accountNumber: '2000',
      accountName: 'Verbindlichkeiten aus L+L',
      ledgerAmount: 41900,
      reason: 'kein Nebenbuch',
      balanced: false,
    },
  ]
  orphans = [
    {
      id: 4711,
      entryNumber: '2026-000901',
      bookingDate: '2026-03-04',
      description: 'Rechnung',
      sourceKind: 'DOCUMENT',
      sourceId: 999999,
      lines: [],
    },
  ]
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

async function render(session: AuthState = READER, path = '/buchhaltung/abstimmung') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <AuthContext.Provider value={session}>
          <QueryClientProvider client={client}>
            <ReconciliationPage />
          </QueryClientProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
  })
  await settle()
}

/** Lets the queries resolve: five turns of the loop, which is more than the page ever needs. */
async function settle() {
  for (let round = 0; round < 5; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

/**
 * Opens the first expansion with that summary. jsdom does not toggle a `details` on a click,
 * so the flag is set and the event the screen listens for is raised by hand.
 */
async function open(summary: string) {
  const expansion = Array.from(container.querySelectorAll('details')).find(
    (node) => node.querySelector('summary')?.textContent === summary,
  )
  if (expansion === undefined) {
    throw new Error(`keine Aufklappung «${summary}»`)
  }
  await act(async () => {
    expansion.open = true
    expansion.dispatchEvent(new Event('toggle'))
  })
  await settle()
}

const text = () => container.textContent ?? ''

function button(label: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find(
    (entry) => entry.textContent === label,
  ) as HTMLButtonElement | undefined
}

function boxes(): HTMLInputElement[] {
  return [...container.querySelectorAll('input[type=checkbox]')] as HTMLInputElement[]
}

/** The tick box of one row, found by the label the screen gives it. */
function boxLabelled(label: string): HTMLInputElement | undefined {
  const caption = [...container.querySelectorAll('label')].find(
    (entry) => entry.textContent === label,
  )
  if (caption === undefined) return undefined
  return (
    (document.getElementById(caption.htmlFor) as HTMLInputElement | null)
    ?? (caption.querySelector('input') as HTMLInputElement | null)
    ?? undefined
  )
}

async function click(element: Element | undefined) {
  expect(element).toBeDefined()
  await act(async () => {
    ;(element as HTMLElement).click()
  })
  await settle()
}

describe('ReconciliationPage', () => {
  /**
   * <b>The report the module cut is argued from.</b> Three collective accounts, each with what
   * the ledger holds and what the auxiliary book behind it holds.
   */
  it('reconciliationPageShowsTheThreeCollectiveAccountsTest', async () => {
    await render()

    for (const label of ['1100', '2030', '2000']) {
      expect(text()).toContain(label)
    }
    expect(text()).toContain('stimmt überein')
    expect(text()).toContain('Differenz')
  })

  /**
   * <b>A dash, never a zero.</b> Where no auxiliary book stands behind the account, the row
   * carries the reason instead of figures — a difference of nothing would read as «geprüft und
   * in Ordnung».
   */
  it('reconciliationPageShowsADashWhereNothingWasComparedTest', async () => {
    await render()

    expect(text()).toContain('kein Nebenbuch')
    expect(text()).toContain('—')
  })

  /**
   * The year is compulsory at the endpoint, so the screen picks one before it asks: the year
   * today falls into. A reading without it would come back as 400.
   */
  it('reconciliationPageAsksWithAFiscalYearTest', async () => {
    await render()

    expect(asked.some((url) => url.includes('/reconciliation?fiscalYearId=7'))).toBe(true)
  })

  /**
   * The expansions are loaded when they are opened and not before: a screen that asks four
   * questions for every row pays for three nobody reads.
   */
  it('reconciliationPageLoadsAnExpansionOnlyWhenOpenedTest', async () => {
    await render()

    expect(asked.some((url) => url.includes('manual-entries'))).toBe(false)
    expect(asked.some((url) => url.includes('sources-without-entry'))).toBe(false)
    expect(asked.some((url) => url.includes('entries-without-source'))).toBe(false)
  })

  /**
   * <b>The third expansion.</b> An entry whose record the subsidiary ledger no longer holds —
   * the right way round, because an entry is kept for ten years and the record it came from
   * need not be. Opened, it names the entry so nobody hunts for a document that is not there.
   */
  it('reconciliationPageShowsAnEntryWithoutItsSourceTest', async () => {
    await render()

    await open('Buchungen ohne Beleg')

    expect(asked.some((url) => url.includes('entries-without-source'))).toBe(true)
    expect(text()).toContain('2026-000901')
  })

  /** Opened with nothing behind it, the expansion says so rather than staying blank. */
  it('reconciliationPageShowsNoEntryWithoutItsSourceTest', async () => {
    orphans = []
    await render()

    await open('Buchungen ohne Beleg')

    expect(text()).toContain('Zu jeder Buchung auf diesem Konto steht ihr Beleg.')
  })

  /**
   * <b>The sentence under the report.</b> When the books were not kept, and how many invoices
   * that left without an entry — the example of the decision, word for word.
   */
  it('reconciliationPageNamesTheSwitchedOffStretchTest', async () => {
    offPeriods = [{ from: '2026-03-14', to: '2026-07-02', open: false, unpostedDocuments: 41 }]

    await render()

    expect(text()).toContain(
      'Die Buchhaltung war vom 14.03.2026 bis 02.07.2026 abgeschaltet. In dieser Zeit sind 41'
        + ' Belege ausgestellt worden, zu denen keine Buchung besteht.',
    )
  })

  /** The register carries the counter, from the same answer the evaluations read. */
  it('reconciliationPageCountsTheUnpostedInvoicesOnTheRegisterTest', async () => {
    await render()

    expect(text()).toContain('Nicht gebucht (12)')
  })

  /**
   * «Ansehen» beside the counter lands on the register itself. With a confirmed day it lists the
   * proposal of the catch-up run, with the customer; without the right to book there is no
   * button and no tick.
   */
  it('reconciliationPageOpensOnTheUnpostedRegisterTest', async () => {
    await render(READER, '/buchhaltung/abstimmung?ansicht=nicht-gebucht')

    expect(text()).toContain('RE-2026-0412')
    expect(text()).toContain('Druckerei Meier AG')
    expect(asked.some((url) => url.includes('/pending-sources'))).toBe(true)
    expect(text()).not.toContain('Nachbuchen')
    expect(boxes()).toHaveLength(0)
  })

  /**
   * <b>A row the backend says cannot be booked shows the reason and takes no tick.</b> The
   * tenant books a supplementary entry in the open year instead.
   */
  it('reconciliationPageShowsTheReasonInsteadOfATickTest', async () => {
    await render(POSTER, '/buchhaltung/abstimmung?ansicht=nicht-gebucht')

    expect(text()).toContain('Nicht nachbuchbar: Das Geschäftsjahr 2026 ist abgeschlossen.')
    expect(boxLabelled('Rechnung RE-2026-0412 markieren')).toBeDefined()
    expect(boxLabelled('Rechnung RE-2026-0101 markieren')).toBeUndefined()
    expect(button('Nachbuchen (0)')?.disabled).toBe(true)
  })

  /**
   * <b>Nothing is written before the check.</b> A tick, «Nachbuchen», the dialog with count and
   * sum — and only «Jetzt nachbuchen» sends the ticked record to `POST /catch-up-run`. Afterwards
   * the three lists stand on the screen.
   */
  it('reconciliationPageBooksTheTickedInvoicesAfterTheCheckTest', async () => {
    await render(POSTER, '/buchhaltung/abstimmung?ansicht=nicht-gebucht')

    await click(boxLabelled('Rechnung RE-2026-0412 markieren'))
    await click(button('Nachbuchen (1)'))

    expect(text()).toContain('1 Rechnung')
    expect(text()).toContain('Buchungsdatum ist jeweils das Belegdatum')
    expect(posted).toHaveLength(0)

    await click(button('Jetzt nachbuchen'))

    expect(posted).toHaveLength(1)
    expect(posted[0].url).toContain('/accounting/catch-up-run')
    expect(posted[0].body).toEqual({ sources: [{ sourceKind: 'DOCUMENT', sourceId: 31 }] })
    expect(text()).toContain('1 gebucht, 0 übersprungen, 0 fehlgeschlagen.')
    expect(text()).toContain('2026-000118')
  })

  /** Skipped and failed records stand in the result with their sentence. */
  it('reconciliationPageShowsTheSkippedAndFailedRecordsTest', async () => {
    ranResult = {
      posted: [],
      skipped: [
        {
          sourceKind: 'DOCUMENT',
          sourceId: 31,
          reference: 'RE-2026-0412',
          outcome: 'SKIPPED',
          message: 'Bereits gebucht als 2026-000044. Jede Quelle wird nur einmal gebucht.',
        },
      ],
      failed: [
        { sourceKind: 'DOCUMENT', sourceId: 33, outcome: 'FAILED', message: 'connection reset' },
      ],
    }
    await render(POSTER, '/buchhaltung/abstimmung?ansicht=nicht-gebucht')

    await click(boxLabelled('Rechnung RE-2026-0412 markieren'))
    await click(button('Nachbuchen (1)'))
    await click(button('Jetzt nachbuchen'))

    expect(text()).toContain('0 gebucht, 1 übersprungen, 1 fehlgeschlagen.')
    expect(text()).toContain('Bereits gebucht als 2026-000044')
    expect(text()).toContain('Beleg 33')
    expect(text()).toContain('connection reset')
  })

  /**
   * <b>With the module off the register still lists, but offers no run.</b> The proposal would
   * answer 409, so the screen does not ask it and reads the report's expansion instead.
   */
  it('reconciliationPageWithTheModuleOffListsWithoutARunTest', async () => {
    await render(
      auth([ACCOUNTING_RIGHTS.read, ACCOUNTING_RIGHTS.post], []),
      '/buchhaltung/abstimmung?ansicht=nicht-gebucht',
    )

    expect(text()).toContain('Die Buchhaltung ist abgeschaltet.')
    expect(text()).toContain('RE-2026-0412')
    expect(asked.some((url) => url.includes('/pending-sources'))).toBe(false)
    expect(asked.some((url) => url.includes('sources-without-entry'))).toBe(true)
    expect(text()).not.toContain('Nachbuchen')
  })

  /**
   * <b>Without a confirmed day the register is a sentence and a way.</b> Nothing books itself
   * and nothing is caught up until the day stands; the link leads to the confirmation dialog.
   */
  it('reconciliationPageWithoutAChangeoverDayLeadsToTheDialogTest', async () => {
    attention = { ...attention, postingStartsOn: null }

    await render(READER, '/buchhaltung/abstimmung?ansicht=nicht-gebucht')

    expect(text()).toContain(
      'Solange kein Stichtag bestätigt ist, wird nichts gebucht und nichts nachgetragen.',
    )
    const link = Array.from(container.querySelectorAll('a')).find(
      (candidate) => candidate.textContent === 'Stichtag bestätigen',
    )
    expect(link?.getAttribute('href')).toBe('/buchhaltung/einstellungen')
    expect(asked.some((url) => url.includes('sources-without-entry'))).toBe(false)
    expect(asked.some((url) => url.includes('/pending-sources'))).toBe(false)
  })

  /**
   * The expansion «Belege ohne Buchung» is the third way to the dialog: without a day it says
   * why it lists every issued document, and where to change that.
   */
  it('reconciliationPageExpansionLeadsToTheDialogTest', async () => {
    attention = { ...attention, postingStartsOn: null }
    await render()

    await open('Belege ohne Buchung')

    expect(text()).toContain('Es ist noch kein Stichtag bestätigt')
    const links = Array.from(container.querySelectorAll('a')).filter(
      (candidate) => candidate.textContent === 'Stichtag bestätigen',
    )
    expect(links.length).toBeGreaterThan(0)
    expect(links[0].getAttribute('href')).toBe('/buchhaltung/einstellungen')
  })

  /** With a confirmed day the expansion says nothing about the dialog. */
  it('reconciliationPageExpansionWithAChangeoverDayTest', async () => {
    await render()

    await open('Belege ohne Buchung')

    expect(text()).not.toContain('Es ist noch kein Stichtag bestätigt')
  })
})
