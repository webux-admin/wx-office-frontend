// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import { ACCOUNTING_MODULE, ACCOUNTING_RIGHTS } from '../lib/accounting'
import type {
  ClosingPreview,
  ClosingSummary,
  FiscalYear,
  FiscalYearList,
  YearLogLine,
} from '../lib/types'
import { ClosingPage } from './ClosingPage'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1

function auth(permissions: string[], modules: string[] = [ACCOUNTING_MODULE]): AuthState {
  return {
    user: {
      userId: 1,
      username: 'muster',
      activeTenantId: TENANT,
      superuser: false,
      tenants: [
        { id: TENANT, code: 'WX', name: 'Webux', isDefault: true, modules },
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

const CLOSER = auth([ACCOUNTING_RIGHTS.read, ACCOUNTING_RIGHTS.close])
const READER = auth([ACCOUNTING_RIGHTS.read])
/** Both rights, and a tenant that runs no bookkeeping: the fifth state of the screen. */
const OFFLINE = auth([ACCOUNTING_RIGHTS.read, ACCOUNTING_RIGHTS.close], [])
/** Holds nothing at all — not even the right to read the books. */
const OUTSIDER = auth([])

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
    postedEntries: 12,
    ...over,
  }
}

function years(entries: FiscalYear[]): FiscalYearList {
  return {
    years: entries,
    boundary: { postableFrom: null, lockedUntil: null, source: 'NONE', message: '' },
    expiry: { lastEndDate: '2026-12-31', daysLeft: 90, warn: false },
  }
}

/**
 * The four accounts the backend offers a Kollektiv- or Kommanditgesellschaft, in its order.
 *
 * <p>The accounts with `or_position IN ('EK_KAPITAL_INHABER','EK_PRIVAT')`: 2800 and 2850 are the
 * capital accounts, 2820 and 2870 the private ones. 2810 and 2860 — paying capital in and out —
 * stand under `EK_KAPITAL_BEWEGUNG` since V108 and are therefore not in the list the backend
 * sends (backend ADR-0124).
 */
const PARTNERSHIP_OPTIONS = [
  {
    accountNumber: '2800',
    accountName: 'Eigenkapital Gesellschafter A zu Beginn des Geschäftsjahres',
  },
  { accountNumber: '2820', accountName: 'Privat Gesellschafter A' },
  {
    accountNumber: '2850',
    accountName: 'Eigenkapital Kommanditär A zu Beginn des Geschäftsjahres',
  },
  { accountNumber: '2870', accountName: 'Privat Kommanditär A' },
]

function preview(over: Partial<ClosingPreview> = {}): ClosingPreview {
  return {
    checks: [
      { step: '1', passed: true, blocking: true, message: 'Das Geschäftsjahr ist offen.', detail: '' },
      { step: '2', passed: true, blocking: true, message: 'Keine Buchung liegt als Entwurf.', detail: '' },
      {
        step: '2a',
        passed: true,
        blocking: true,
        message: 'Die Abgrenzungen werden im nächsten Schritt bestätigt.',
        detail: '',
      },
      { step: '3', passed: true, blocking: true, message: 'Soll und Haben stimmen überein.', detail: '' },
      {
        step: '3a',
        passed: false,
        blocking: false,
        message: 'Die Abstimmung gegen die Nebenbücher kommt mit dem Beleganschluss.',
        detail: '',
      },
      { step: '4', passed: true, blocking: true, message: 'Es ist das erste Geschäftsjahr.', detail: '' },
      { step: '5', passed: true, blocking: true, message: 'Alle Systemkonten sind zugewiesen.', detail: '' },
      { step: '7', passed: true, blocking: true, message: 'Die Nummernserie 2027 ist frei.', detail: '' },
      { step: '7a', passed: true, blocking: true, message: 'Das Geschäftsjahr 2027 besteht noch nicht.', detail: '' },
    ],
    accruals: [
      { accountNumber: '1300', accountName: 'Aktive Abgrenzung', entryCount: 2, amount: 1800 },
    ],
    netRevenue: 120000,
    financialIncome: 250,
    expectedResult: 38214.9,
    closingLineCount: 5,
    carryForwardAccount: '2970',
    carryForwardOptions: [
      { accountNumber: '2800', accountName: 'Kapital' },
      { accountNumber: '2970', accountName: 'Gewinnvortrag' },
    ],
    followingYear: {
      label: '2027',
      startDate: '2027-01-01',
      endDate: '2027-12-31',
      numberYear: 2027,
      exists: false,
      status: null,
    },
    replacesOpeningEntry: false,
    carriedAccounts: 4,
    blocked: false,
    ...over,
  }
}

function summary(over: Partial<ClosingSummary> = {}): ClosingSummary {
  return {
    fiscalYearId: 3,
    label: '2026',
    status: 'CLOSED',
    result: 38214.9,
    entries: [
      {
        entryId: 91,
        entryNumber: '2026-000900',
        bookingDate: '2026-12-31',
        description: 'Abschluss 2026: Erfolgskonten auf 9200',
        documentReference: 'JA-2026-1',
        reversed: false,
      },
      {
        entryId: 92,
        entryNumber: '2026-000901',
        bookingDate: '2026-12-31',
        description: 'Abschluss 2026: Jahresergebnis auf 2979',
        documentReference: 'JA-2026-2',
        reversed: false,
      },
    ],
    log: [
      {
        event: 'STATUS',
        status: 'CLOSED',
        note: 'Jahresabschluss durchgeführt.',
        changedAt: '2027-03-15T09:00:00Z',
        changedBy: 'jan',
      },
      {
        event: 'ACCRUALS',
        status: null,
        note: 'Die zeitlichen Abgrenzungen wurden geprüft und bestätigt (OR Art. 958b Abs. 1).',
        changedAt: '2027-03-15T08:59:00Z',
        changedBy: 'jan',
      },
    ],
    ...over,
  }
}

let container: HTMLDivElement
let root: Root
let asked: { url: string; method: string; body: unknown }[]
let yearList: FiscalYearList
let previewAnswer: ClosingPreview
let summaryAnswer: ClosingSummary
let closeAnswer: () => Promise<Response>
/**
 * What `GET /fiscal-years/{id}/log` answers.
 *
 * <p>Its own answer and not the one inside the closing summary: the trail stands for every
 * year, and an open one has no summary to carry it.
 */
let logAnswer: YearLogLine[]
/** Lets the year list fail, for the state in which the screen has nothing to show. */
let yearsStatus: number

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

beforeEach(() => {
  asked = []
  yearList = years([year()])
  previewAnswer = preview()
  summaryAnswer = summary()
  logAnswer = summaryAnswer.log
  yearsStatus = 200
  closeAnswer = () =>
    json({
      entryNumbers: ['2026-000900', '2026-000901'],
      openingEntryNumber: '2027-000001',
      followingYearId: 4,
      carriedAccounts: 4,
      result: 38214.9,
    })

  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    asked.push({
      url,
      method,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    })
    if (url.includes('/closing/preview')) return previewAnswer ? json(previewAnswer) : json({}, 500)
    if (url.includes('/reopen')) return json({ entryNumbers: ['2026-000902'] })
    if (url.endsWith('/closing') && method === 'POST') return closeAnswer()
    if (url.endsWith('/closing')) return json(summaryAnswer)
    if (url.includes('/log')) return json(logAnswer)
    if (url.includes('/accounting/entries/')) {
      return json({
        id: 91,
        fiscalYearId: 3,
        bookingDate: '2026-12-31',
        entryKind: 'CLOSING',
        source: 'SYSTEM',
        description: 'Abschluss 2026',
        documentReference: 'JA-2026-1',
        currencyCode: 'CHF',
        entryNumber: '2026-000900',
        posted: true,
        amount: 38214.9,
        lines: [
          {
            lineNumber: 1,
            accountId: 7,
            accountNumber: '3200',
            accountName: 'Erlös',
            debit: 38214.9,
            credit: null,
            exchangeRateUnit: 1,
          },
        ],
      })
    }
    if (url.includes('/accounting/fiscal-years')) {
      return yearsStatus === 200
        ? json(yearList)
        : json({ detail: 'Das Backend meldet einen Fehler.' }, yearsStatus)
    }
    return json({}, 404)
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

async function paint(state: AuthState = CLOSER) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <AuthContext.Provider value={state}>
        <QueryClientProvider client={client}>
          <MemoryRouter>
            <ClosingPage />
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

function text() {
  return container.textContent ?? ''
}

function button(label: string) {
  return [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === label,
  )
}

/**
 * The rows of the findings list, out of the panel of step 1 — `Panel` writes its title into an
 * `h2`, which is how the panel is told from the rest of the screen.
 */
function checkItems(label = '2026'): HTMLLIElement[] {
  const panel = [...container.querySelectorAll('section')].find(
    (candidate) => candidate.querySelector('h2')?.textContent === `Prüfung für ${label}`,
  )
  return panel === undefined ? [] : [...panel.querySelectorAll('li')]
}

/**
 * The findings on screen, one string per row: the number of the step and its message.
 *
 * <p>Read out of the panel of step 1 rather than out of the whole page, so the list can be
 * counted as well as read. #96 asks for «neun Befunde in fester Reihenfolge» and «die Maske zeigt
 * neun Zeilen» — and a handful of `toContain` on the page text stays green on a mask that shows
 * two of the nine, which is the one thing this list has to rule out.
 */
function checkRows(label = '2026'): string[] {
  return checkItems(label).map((row) =>
    (row.querySelector('p')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
  )
}

/**
 * The mark each of those rows carries: «erfüllt», «hält auf» or «offen».
 *
 * <p>Three and not two: the reconciliation against the sub-ledgers is the one finding that never
 * blocks, and it has to read as open rather than as a check that was passed.
 */
function checkMarks(label = '2026'): (string | null)[] {
  return checkItems(label).map(
    (row) => row.querySelector('svg')?.getAttribute('aria-label') ?? null,
  )
}

/** A button inside the open dialog: the page behind it carries the same wording. */
function dialogButton(label: string) {
  const dialog = container.querySelector('[role=dialog]')
  return [...(dialog?.querySelectorAll('button') ?? [])].find(
    (candidate) => candidate.textContent?.trim() === label,
  )
}

async function click(label: string) {
  const target = button(label)
  if (target === undefined) throw new Error(`kein Knopf «${label}»`)
  await act(async () => {
    target.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await settle()
}

/**
 * Switches the year picker, the first select of the screen.
 *
 * <p>Needed wherever every year of the tenant is closed: the screen then opens on the most
 * recent one, and a test about an older year has to walk there the way a person would.
 */
async function pickYear(fiscalYearId: number) {
  const picker = container.querySelector('select') as HTMLSelectElement
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype,
      'value',
    )?.set
    setter?.call(picker, String(fiscalYearId))
    picker.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await settle()
}

/**
 * Picks a carry forward account, the second select of the last step.
 *
 * <p>The year picker is the first one on the screen and stays there, so the picker of the step is
 * the last one — the same way a person finds it, by looking at the panel they are standing in.
 */
async function pickCarryForward(accountNumber: string) {
  const picker = [...container.querySelectorAll('select')].at(-1) as HTMLSelectElement
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype,
      'value',
    )?.set
    setter?.call(picker, accountNumber)
    picker.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await settle()
}

/** The box whose own label carries this wording — label and input are siblings, not nested. */
function checkbox(labelPart: string): HTMLInputElement | undefined {
  const label = [...container.querySelectorAll('label')].find((candidate) =>
    candidate.textContent?.includes(labelPart),
  )
  const id = label?.getAttribute('for')
  return id === null || id === undefined
    ? undefined
    : ([...container.querySelectorAll(`input[type=checkbox]`)].find(
        (candidate) => candidate.id === id,
      ) as HTMLInputElement | undefined)
}

async function tick(labelPart: string) {
  const box = checkbox(labelPart)
  if (box === undefined) throw new Error(`kein Haken «${labelPart}»`)
  await act(async () => {
    box.click()
  })
  await settle()
}

/**
 * The closing screen: the wizard of an open year, and the summary of a closed one.
 *
 * <p>What is checked here is what only a mounted screen can answer: that the wizard walks its
 * three steps, that «Weiter» stops at a blocking finding, that the run sends what was ticked, and
 * that a refusal keeps all nine findings on screen rather than shrinking the list to the red ones.
 */
describe('ClosingPage', () => {
  describe('the wizard', () => {
    /**
     * <b>Step 1 lists every one of the nine, not only what is wrong — counted and in order.</b>
     * #96 asks for it twice: «die Vorprüfung liefert neun Befunde in fester Reihenfolge, die
     * Maske zeigt neun Zeilen». Two `toContain` on two of the messages would stay green on a mask
     * that dropped the other seven, so the rows are read out of the panel and compared in full.
     *
     * <p>The order is the backend's own — 1, 2, 2a, 3, 3a, 4, 5, 7, 7a, the order of
     * `ClosingChecks.of` — because nothing blocks here and `sortedChecks` then hands the list on
     * untouched. Where something blocks it moves to the top, which is
     * `closingPageKeepsTheNineChecksAfterARefusalTest`.
     *
     * <p>And the marks are read as well: finding 3a is the one that never blocks, and it carries
     * «offen» rather than a tick, so nobody takes it for a check that was passed.
     */
    it('closingPageShowsTheNineChecksTest', async () => {
      await paint()

      expect(text()).toContain('Prüfung für 2026')
      expect(checkRows()).toHaveLength(9)
      expect(checkRows()).toEqual([
        '1 Das Geschäftsjahr ist offen.',
        '2 Keine Buchung liegt als Entwurf.',
        '2a Die Abgrenzungen werden im nächsten Schritt bestätigt.',
        '3 Soll und Haben stimmen überein.',
        '3a Die Abstimmung gegen die Nebenbücher kommt mit dem Beleganschluss.',
        '4 Es ist das erste Geschäftsjahr.',
        '5 Alle Systemkonten sind zugewiesen.',
        '7 Die Nummernserie 2027 ist frei.',
        '7a Das Geschäftsjahr 2027 besteht noch nicht.',
      ])
      expect(checkMarks()).toEqual([
        'erfüllt',
        'erfüllt',
        'erfüllt',
        'erfüllt',
        'offen',
        'erfüllt',
        'erfüllt',
        'erfüllt',
        'erfüllt',
      ])
      expect(text()).toContain('38’214.90')
    })

    /** The three steps in order, and the run only at the end of them. */
    it('closingPageWalksTheThreeStepsTest', async () => {
      await paint()

      await click('Weiter')
      expect(text()).toContain('Zeitliche Abgrenzung')
      expect(text()).toContain('Aktive Abgrenzung')
      // Die zwei Zahlen, an denen OR Art. 958b Abs. 2 hängt, stehen neben dem Haken.
      expect(text()).toContain('Nettoerlöse aus Lieferungen und Leistungen')
      expect(text()).toContain('Finanzertrag')
      expect(text()).toContain('100’000 Franken')
      // Und der ungesetzte Haken sperrt den Schritt nicht: «Pflichtklick, keine Sperre».
      expect(button('Weiter')?.disabled).toBe(false)

      await click('Weiter')
      expect(text()).toContain('Saldovortrag')
      expect(button('Abschluss durchführen')).toBeDefined()
      expect(button('Weiter')).toBeUndefined()
    })

    /** «Zurück» goes back a step and keeps what was ticked. */
    it('closingPageGoesBackAStepTest', async () => {
      await paint()
      await click('Weiter')
      await tick('Abgrenzungen sind geprüft')

      await click('Zurück')
      expect(text()).toContain('Prüfung für 2026')

      await click('Weiter')
      expect(checkbox('Abgrenzungen sind geprüft')?.checked).toBe(true)
    })

    /** A finding that stops the run stops the wizard, and the button says why. */
    it('closingPageStopsAtABlockingCheckTest', async () => {
      previewAnswer = preview({
        blocked: true,
        checks: [
          {
            step: '2',
            passed: false,
            blocking: true,
            message: '1 Buchung liegt noch als Entwurf im Geschäftsjahr 2026.',
            detail: '04.11.2026 · Miete Dezember · 2’400.00',
          },
        ],
      })
      await paint()

      expect(button('Weiter')?.disabled).toBe(true)
      expect(text()).toContain('Ein Punkt hält den Abschluss auf.')
      expect(text()).toContain('Miete Dezember')
    })

    /** What the run sends is what was ticked and picked, and nothing invented. */
    it('closingPageSendsTheConfirmationsTest', async () => {
      await paint()
      await click('Weiter')
      await tick('Abgrenzungen sind geprüft')
      await tick('gegen die offenen Posten abgestimmt')
      await click('Weiter')

      await click('Abschluss durchführen')

      const run = asked.find((call) => call.method === 'POST' && call.url.endsWith('/closing'))
      expect(run?.body).toEqual({
        accrualsConfirmed: true,
        carryForwardAccountNumber: null,
        reconciliationConfirmed: true,
      })
      // Und nichts wurde abgewiesen: die Liste der Geschäftsjahre antwortet in diesem Test
      // unverändert, der Bildschirm bleibt deshalb auf dem Assistenten stehen — was danach
      // steht, prüft closingPageStaysOnTheClosedYearAfterTheRunTest.
      expect(text()).not.toContain('nicht bestätigt')
    })

    /**
     * <b>A refusal keeps all nine on screen.</b> The wizard shows the same nine before and after
     * the attempt — counted here, not sampled; pruning the list to the red ones would make eight
     * lines disappear at the moment the ninth turns red.
     *
     * <p><b>The order is the one of the run, with the red one lifted to the top.</b> That is
     * `sortedChecks`, and this is where the mask is asked to do it: a list of nine in which the
     * one that matters sits somewhere in the middle is a list nobody reads to the end.
     *
     * <p>The finding that turns red here is the one about the drafts, and that is the realistic
     * one: somebody saved an entry in another tab while the wizard stood open, so the preview was
     * green and the run is not. The accrual confirmation cannot play that part any more — the
     * screen keeps the run off until the box is ticked, so a refusal about it would never be
     * asked for.
     */
    it('closingPageKeepsTheNineChecksAfterARefusalTest', async () => {
      closeAnswer = () =>
        json(
          {
            detail: '1 Buchung liegt noch als Entwurf im Geschäftsjahr 2026.',
            checks: preview().checks.map((check) =>
              check.step === '2'
                ? {
                    ...check,
                    passed: false,
                    message: '1 Buchung liegt noch als Entwurf im Geschäftsjahr 2026.',
                  }
                : check,
            ),
          },
          400,
        )
      await paint()
      await click('Weiter')
      await tick('Abgrenzungen sind geprüft')
      await click('Weiter')
      await click('Abschluss durchführen')

      expect(text()).toContain('1 Buchung liegt noch als Entwurf im Geschäftsjahr 2026.')

      await click('Zurück')
      await click('Zurück')
      // Neun Zeilen wie vorher, keine einzige weniger — und die rote steht jetzt oben
      // (`sortedChecks`). Der Rest behält die Reihenfolge des Laufs.
      expect(checkRows()).toHaveLength(9)
      expect(checkRows()).toEqual([
        '2 1 Buchung liegt noch als Entwurf im Geschäftsjahr 2026.',
        '1 Das Geschäftsjahr ist offen.',
        '2a Die Abgrenzungen werden im nächsten Schritt bestätigt.',
        '3 Soll und Haben stimmen überein.',
        '3a Die Abstimmung gegen die Nebenbücher kommt mit dem Beleganschluss.',
        '4 Es ist das erste Geschäftsjahr.',
        '5 Alle Systemkonten sind zugewiesen.',
        '7 Die Nummernserie 2027 ist frei.',
        '7a Das Geschäftsjahr 2027 besteht noch nicht.',
      ])
      expect(checkMarks()[0]).toBe('hält auf')
    })

    /** Step 3 confirms the account that will actually be booked, not the backend's default. */
    it('closingPageNamesThePickedCarryAccountTest', async () => {
      await paint()
      await click('Weiter')
      await tick('Abgrenzungen sind geprüft')
      await click('Weiter')
      expect(text()).toContain('Konto 2970')

      await pickCarryForward('2800')

      expect(text()).toContain('Konto 2800')
      expect(text()).not.toContain('Konto 2970')

      await click('Abschluss durchführen')
      const run = asked.find((call) => call.method === 'POST' && call.url.endsWith('/closing'))
      expect((run?.body as { carryForwardAccountNumber?: string }).carryForwardAccountNumber)
        .toBe('2800')
    })

    /**
     * <b>The result panel survives the refetch the run triggers.</b> The run opens the following
     * year, so «the oldest year that is not closed» becomes that new one — without pinning, the
     * picker would jump to 2027 and unmount the panel before anybody read it.
     */
    it('closingPageStaysOnTheClosedYearAfterTheRunTest', async () => {
      await paint()
      await click('Weiter')
      await tick('Abgrenzungen sind geprüft')
      await click('Weiter')
      // From here the year list answers the way it does after the run: 2026 closed, 2027 open.
      yearList = years([
        year({ status: 'CLOSED' }),
        year({
          id: 4,
          label: '2027',
          numberYear: 2027,
          startDate: '2027-01-01',
          endDate: '2027-12-31',
          status: 'OPEN',
        }),
      ])

      await click('Abschluss durchführen')

      // Auf dem abgeschlossenen Jahr, mit der Zusammenfassung statt des Assistenten —
      // und nicht auf dem Folgejahr, das der Lauf gerade eroeffnet hat.
      expect(text()).toContain('Geschäftsjahr 2026 ist abgeschlossen')
      expect(text()).toContain('Buchungen des Abschlusses')
      expect(text()).not.toContain('Prüfung für 2027')
    })

    /** A locked year is closed all the same: that is what the state is for. */
    it('closingPageOffersTheWizardForALockedYearTest', async () => {
      yearList = years([year({ status: 'LOCKED' })])
      await paint()

      expect(text()).toContain('Prüfung für 2026')
    })

    /** Without the closing right the screen says which one is missing, and asks for no preview. */
    it('closingPageWithoutTheClosingRightTest', async () => {
      await paint(READER)

      expect(text()).toContain('ACCOUNTING_CLOSE')
      expect(asked.some((call) => call.url.includes('/closing/preview'))).toBe(false)
    })

    /** A tenant without a fiscal year gets a sentence rather than an empty picker. */
    it('closingPageWithoutAFiscalYearTest', async () => {
      yearList = years([])
      await paint()

      expect(text()).toContain('Noch kein Geschäftsjahr')
    })

    /**
     * <b>The accrual tick is compulsory, and the screen is where that is enforced.</b>
     *
     * <p>The wizard walks all three steps with the box untouched — «Pflichtklick, keine Sperre»,
     * and refusing to move on would leave somebody staring at a dead button one step before the
     * sentence that explains it. What stops is the run: «Abschluss durchführen» stays off, the
     * sentence the backend would refuse with stands beside it, and nothing is sent. The same
     * screen treats the reason of the reopening that way, and a compulsory answer carried by a
     * 400 alone is one the mask calls optional.
     */
    it('closingPageKeepsTheRunOffWithoutTheAccrualConfirmationTest', async () => {
      await paint()
      await click('Weiter')
      await click('Weiter')

      expect(button('Abschluss durchführen')?.disabled).toBe(true)
      expect(text()).toContain(
        'Die Abgrenzungen sind nicht bestätigt. Der Abschluss verlangt die Bestätigung nach' +
          ' OR Art. 958b Abs. 1.',
      )
      expect(text()).toContain('Der Haken steht im Schritt «Abgrenzungen»')

      await click('Abschluss durchführen')
      expect(asked.some((call) => call.method === 'POST' && call.url.endsWith('/closing')))
        .toBe(false)
    })

    /**
     * <b>And the tick sets the run free, with `true` in the request.</b> The other half of the
     * rule: once the box is ticked the sentence goes, the button carries again, and what the run
     * is told is what the person declared (OR Art. 958b Abs. 1) — the declaration lands in the
     * trail of the year with their name on it.
     */
    it('closingPageRunsWithTheAccrualConfirmationTest', async () => {
      await paint()
      await click('Weiter')
      await tick('Abgrenzungen sind geprüft')
      await click('Weiter')

      expect(text()).not.toContain('Die Abgrenzungen sind nicht bestätigt.')
      expect(button('Abschluss durchführen')?.disabled).toBe(false)

      await click('Abschluss durchführen')

      const run = asked.find((call) => call.method === 'POST' && call.url.endsWith('/closing'))
      expect((run?.body as { accrualsConfirmed?: boolean }).accrualsConfirmed).toBe(true)
    })

    /**
     * <b>A company is not asked where its result goes.</b> The carry forward runs onto 2970
     * «Gewinnvortrag oder Verlustvortrag», the backend offers no options at all, and the step
     * shows the account instead of a picker with one entry.
     */
    it('closingPageDoesNotAskACompanyWhereTheResultGoesTest', async () => {
      previewAnswer = preview({ equityLayout: 'JURISTIC', carryForwardOptions: [] })
      await paint()
      await click('Weiter')
      await click('Weiter')

      // Der Jahrwähler ist die einzige Auswahlliste des Bildschirms.
      expect(container.querySelectorAll('select')).toHaveLength(1)
      expect(text()).toContain('2970')
      expect(text()).toContain('AG oder GmbH')
      // Und der Satz zur Gewinnverwendung ist der der Generalversammlung, nicht der andere.
      expect(text()).toContain('Generalversammlung')
      expect(text()).toContain('OR Art. 698 Abs. 2 Ziff. 4')
      expect(text()).not.toContain('Einzelunternehmen')
    })

    /**
     * <b>A partnership is asked, out of the four accounts the server sends.</b> 2800 and 2850 are
     * the capital accounts, 2820 and 2870 the private ones.
     *
     * <p><b>What this test holds is that the mask keeps no list of its own.</b> The picker maps
     * `carryForwardOptions` as it comes, which is why both `toEqual` below are written out in
     * full: every entry the server sent stands on screen, in its order and under its own name,
     * and no entry stands there that the server did not send. `asksCarryForward` reads nothing
     * but the length of that list.
     *
     * <p><b>That 2810 and 2860 are not offered is a rule of the backend, and it is checked
     * there.</b> The two collect the capital a partner pays in and takes out;
     * `ClosingManagement.CARRY_FORWARD_POSITIONS` keeps them out of the list, and
     * `ClosingManagementTest.previewCloseLeavesTheDepositAccountsOutTest` names both numbers —
     * and shows that the chart of that case carries 2810 at all, so the case cannot pass on a
     * fixture that never held it (backend ADR-0124). Here the two numbers are absent from the
     * fixture, so asserting them absent from the screen would prove nothing and would stay green
     * on the day the rule falls.
     *
     * <p>The preview names 2820: the tenant answered the question at its last close and the
     * backend hands the remembered account back. It is shown as the picked entry and not as a
     * fixed line — a Kollektivgesellschaft moves the result from one partner to another, and
     * that is the screen it does it on.
     */
    it('closingPageAsksAPartnershipWhereTheResultGoesTest', async () => {
      previewAnswer = preview({
        equityLayout: 'PARTNERSHIP',
        carryForwardAccount: '2820',
        carryForwardOptions: PARTNERSHIP_OPTIONS,
      })
      await paint()
      await click('Weiter')
      await click('Weiter')

      const picker = [...container.querySelectorAll('select')].at(-1) as HTMLSelectElement
      expect([...picker.options].map((option) => option.value)).toEqual([
        '',
        '2800',
        '2820',
        '2850',
        '2870',
      ])
      // Mit ihrer eigenen Bezeichnung aus dem Kontenplan des Mandanten, nicht mit einer erfundenen.
      expect([...picker.options].map((option) => option.textContent)).toEqual([
        '— bitte wählen —',
        '2800 Eigenkapital Gesellschafter A zu Beginn des Geschäftsjahres',
        '2820 Privat Gesellschafter A',
        '2850 Eigenkapital Kommanditär A zu Beginn des Geschäftsjahres',
        '2870 Privat Kommanditär A',
      ])
      // Die gemerkte Antwort steht als gewählter Eintrag, nicht als feste Zeile.
      expect(picker.value).toBe('2820')
      expect(text()).not.toContain('steht das Vortragskonto fest')
      // Und der zweite der beiden Sätze des Issues zur Gewinnverwendung, der beiden Rechtsformen
      // ohne Beschluss gilt — nicht der der Generalversammlung.
      expect(text()).toContain('Einzelunternehmen')
      expect(text()).not.toContain('Generalversammlung')
    })

    /**
     * <b>What a partner picks is what the run is told.</b> The remembered account is a proposal
     * and not a decision: picking another one changes the sentence in front of the button, and
     * that account — not the remembered one — travels in the request. The run would otherwise
     * book the result onto the capital account of the wrong partner, and no control would catch
     * it, because the balance sheet adds up either way.
     */
    it('closingPageSendsThePickedPartnershipAccountTest', async () => {
      previewAnswer = preview({
        equityLayout: 'PARTNERSHIP',
        carryForwardAccount: '2820',
        carryForwardOptions: PARTNERSHIP_OPTIONS,
      })
      await paint()
      await click('Weiter')
      await tick('Abgrenzungen sind geprüft')
      await click('Weiter')
      expect(text()).toContain('Konto 2820')

      await pickCarryForward('2870')

      expect(text()).toContain('Der Gewinn wird auf Konto 2870 vorgetragen')
      expect(text()).not.toContain('Konto 2820')

      await click('Abschluss durchführen')

      const run = asked.find((call) => call.method === 'POST' && call.url.endsWith('/closing'))
      expect(run?.body).toEqual({
        accrualsConfirmed: true,
        carryForwardAccountNumber: '2870',
        reconciliationConfirmed: false,
      })
    })

    /**
     * <b>A year that carries nothing says «Keines», not a dash.</b> The backend leaves
     * `carryForwardAccount` empty exactly where it needs none — it skips the last of its three
     * tries at a result of nil (`ClosingManagement.carryAccountOf`), and finding 5 lets that
     * case through. A dormant company read «Vortragskonto —» there and went looking for what it
     * had forgotten to set; the line now says that there is nothing to carry, that this is no
     * fault, and the closing sentence names no account at all.
     */
    it('closingPageShowsNoCarryAccountWhereNothingIsCarriedTest', async () => {
      previewAnswer = preview({
        equityLayout: 'JURISTIC',
        carryForwardAccount: null,
        carryForwardOptions: [],
        expectedResult: 0,
      })
      await paint()
      await click('Weiter')
      await click('Weiter')

      expect(text()).toContain('Keines — es ist nichts vorzutragen')
      expect(text()).toContain('Ein Vortragskonto braucht es nur für ein Ergebnis')
      expect(text()).toContain('hält den Abschluss nicht auf')
      expect(text()).toContain(
        'Es wird kein Ergebnis vorgetragen, und 4 Konten werden in das neu angelegte' +
          ' Geschäftsjahr 2027 übernommen.',
      )
      // Weder der Gewinnsatz noch der Satz über das feste Vortragskonto der AG.
      expect(text()).not.toContain('Der Gewinn wird auf Konto')
      expect(text()).not.toContain('steht das Vortragskonto fest')
    })
  })

  describe('a closed year', () => {
    beforeEach(() => {
      yearList = years([year({ status: 'CLOSED' })])
    })

    /** The summary names the result, the entries and who confirmed the accruals. */
    it('closingPageShowsWhatTheCloseDidTest', async () => {
      await paint()

      expect(text()).toContain('Geschäftsjahr 2026 ist abgeschlossen')
      expect(text()).toContain('2026-000900')
      expect(text()).toContain('JA-2026-2')
      expect(text()).toContain('Abgrenzungen bestätigt')
      expect(text()).toContain('jan')
    })

    /** Folding a row open shows the lines of that entry, fetched only then. */
    it('closingPageFoldsAnEntryOpenTest', async () => {
      await paint()
      expect(asked.some((call) => call.url.includes('/accounting/entries/'))).toBe(false)

      const chevron = [...container.querySelectorAll('button')].find(
        (candidate) => candidate.getAttribute('aria-label') === 'Zeile aufklappen',
      )
      expect(chevron).toBeDefined()
      await act(async () => {
        chevron?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      await settle()

      expect(asked.some((call) => call.url.includes('/accounting/entries/'))).toBe(true)
      expect(text()).toContain('3200')
      expect(text()).toContain('Erlös')
    })

    /** The reopening asks for a reason and sends it; without one the button stays off. */
    it('closingPageReopensWithAReasonTest', async () => {
      await paint()

      await click('Wieder öffnen')
      expect(text()).toContain('Der Abschluss wird zurückgenommen, nicht gelöscht.')
      expect(dialogButton('Wieder öffnen')?.disabled).toBe(true)

      const field = container.querySelector('textarea') as HTMLTextAreaElement
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype,
          'value',
        )?.set
        setter?.call(field, 'Nachträgliche Abgrenzung')
        field.dispatchEvent(new Event('input', { bubbles: true }))
      })
      await settle()

      const ready = dialogButton('Wieder öffnen')
      expect(ready?.disabled).toBe(false)
      await act(async () => {
        ready?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      await settle()

      const call = asked.find((entry) => entry.url.includes('/reopen'))
      expect(call?.body).toEqual({ reason: 'Nachträgliche Abgrenzung' })
    })

    /** Without the closing right there is no way to reopen, and the summary still reads. */
    it('closingPageWithoutTheClosingRightOnAClosedYearTest', async () => {
      await paint(READER)

      expect(text()).toContain('Geschäftsjahr 2026 ist abgeschlossen')
      expect(button('Wieder öffnen')).toBeUndefined()
      expect(text()).toContain('ACCOUNTING_CLOSE')
    })

    /**
     * <b>A later year that is closed replaces the dialog with a notice, before the reason is
     * typed.</b> The backend refuses the same case, and the cascade is deliberately not
     * automated — whoever wants three years open decides it three times. The notice therefore
     * carries the way to that year, and taking it switches the picker rather than opening
     * anything.
     */
    it('closingPageBlocksTheReopeningOnALaterClosedYearTest', async () => {
      yearList = years([
        year({ status: 'CLOSED' }),
        year({
          id: 4,
          label: '2027',
          numberYear: 2027,
          startDate: '2027-01-01',
          endDate: '2027-12-31',
          status: 'CLOSED',
        }),
      ])
      await paint()
      // Alles abgeschlossen: der Bildschirm öffnet auf dem jüngsten Jahr, gemeint ist 2026.
      await pickYear(3)

      await click('Wieder öffnen')

      expect(text()).toContain(
        'Das Geschäftsjahr 2027 ist abgeschlossen. Öffnen Sie zuerst 2027, dann 2026.',
      )
      expect(container.querySelector('textarea')).toBeNull()

      const way = [
        ...(container.querySelector('[role=dialog]')?.querySelectorAll('button') ?? []),
      ].find((candidate) => candidate.textContent?.includes('Geschäftsjahr 2027 öffnen'))
      expect(way).toBeDefined()
      await act(async () => {
        way?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      await settle()

      expect((container.querySelector('select') as HTMLSelectElement).value).toBe('4')
      expect(asked.some((call) => call.url.includes('/reopen'))).toBe(false)
    })

    /**
     * <b>Module off, and what the close did still reads.</b> Only «Wieder öffnen» goes: a closed
     * year, its entries and its trail stay legible for ten years whether or not the tenant still
     * runs the bookkeeping (OR Art. 958f, backend ADR-0119).
     */
    it('closingPageWithTheModuleOffOnAClosedYearTest', async () => {
      await paint(OFFLINE)

      expect(text()).toContain('Geschäftsjahr 2026 ist abgeschlossen')
      expect(text()).toContain('2026-000900')
      expect(text()).toContain('JA-2026-2')
      expect(text()).toContain('Modul nicht eingeschaltet')
      expect(button('Wieder öffnen')).toBeUndefined()
    })
  })

  /**
   * The five states in which the screen shows something other than a year.
   *
   * <p>«Leer» stands with the wizard above, where the empty picker belongs; the four here are
   * the ones a person meets when nothing of their own is wrong.
   */
  describe('the states of the screen', () => {
    /** Nothing is decided while the year list is on its way — least of all «es gibt keines». */
    it('closingPageShowsLoadingTest', async () => {
      vi.stubGlobal('fetch', () => new Promise(() => {}))
      await paint()

      expect(text()).toContain('Wird geladen')
      expect(text()).not.toContain('Noch kein Geschäftsjahr')
    })

    /**
     * <b>A list that could not be read is not an empty list.</b> «Es gibt noch kein
     * Geschäftsjahr» beside «Das Backend meldet einen Fehler» would send somebody off to create
     * a year that stands.
     */
    it('closingPageShowsAnErrorTest', async () => {
      yearsStatus = 500
      await paint()

      expect(text()).toContain('Das Backend meldet einen Fehler.')
      expect(text()).not.toContain('Noch kein Geschäftsjahr')
      expect(text()).not.toContain('Wird geladen')
    })

    /** Without the reading right the screen says which one is missing, and asks for nothing. */
    it('closingPageWithoutTheReadRightTest', async () => {
      await paint(OUTSIDER)

      expect(text()).toContain('Keine Berechtigung')
      expect(text()).toContain(ACCOUNTING_RIGHTS.read)
      expect(asked).toEqual([])
    })

    /**
     * <b>Module off takes the two buttons and nothing else.</b> The year, its state and its
     * trail stay on screen — all of that is readable for ten years whether or not the tenant
     * still runs the bookkeeping (OR Art. 958f) — and the wizard is not mounted at all, so its
     * preview is never fetched.
     */
    it('closingPageWithTheModuleOffTest', async () => {
      await paint(OFFLINE)

      expect(text()).toContain('Modul nicht eingeschaltet')
      expect(text()).toContain('ist für diesen Mandanten nicht eingeschaltet')
      expect(text()).toContain('2026')
      expect(text()).toContain('Offen')
      expect(text()).toContain('Protokoll')
      expect(text()).toContain('Abgrenzungen bestätigt')
      expect(text()).not.toContain('Prüfung für 2026')
      expect(asked.some((call) => call.url.includes('/closing/preview'))).toBe(false)
      expect(asked.some((call) => call.url.includes('/log'))).toBe(true)
    })
  })

  /**
   * The trail of the year, from `GET /fiscal-years/{id}/log`.
   *
   * <p>Beside both faces of the screen and not inside one of them: «wer hat 2026 wann gesperrt,
   * und warum» is a question about an open year as much as about a closed one.
   */
  describe('the trail', () => {
    beforeEach(() => {
      logAnswer = [
        {
          event: 'STATUS',
          status: 'LOCKED',
          note: 'an den Treuhänder',
          changedAt: '2026-09-02T14:12:00Z',
          changedBy: 'maja.keller',
        },
        {
          event: 'STATUS',
          status: 'OPEN',
          note: null,
          changedAt: '2026-01-02T08:03:00Z',
          changedBy: 'maja.keller',
        },
      ]
    })

    /** An open year has no closing summary to carry its trail, and shows it all the same. */
    it('closingPageShowsTheTrailOfAnOpenYearTest', async () => {
      await paint()

      expect(asked.some((call) => call.url.endsWith('/log'))).toBe(true)
      expect(text()).toContain('Protokoll')
      expect(text()).toContain('Gesperrt')
      expect(text()).toContain('an den Treuhänder')
      expect(text()).toContain('maja.keller')
      // Daneben, nicht statt: der Assistent steht weiter.
      expect(text()).toContain('Prüfung für 2026')
    })

    /** And a locked year, which is the state a year is handed to the fiduciary in. */
    it('closingPageShowsTheTrailOfALockedYearTest', async () => {
      yearList = years([year({ status: 'LOCKED' })])
      await paint()

      expect(text()).toContain('Protokoll')
      expect(text()).toContain('an den Treuhänder')
      expect(text()).toContain('Prüfung für 2026')
    })
  })
})
