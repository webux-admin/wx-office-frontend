// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../../auth/authContext'
import { ACCOUNTING_MODULE, ACCOUNTING_RIGHTS, PRIOR_YEAR_PATH } from '../../lib/accounting'
import type {
  Account,
  FiscalYear,
  FiscalYearList,
  FiscalYearPreview,
  OpeningEntryOutcome,
  PriorYearBalances,
} from '../../lib/types'
import { PriorYearPage } from './PriorYearPage'

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

const CLOSER = auth([ACCOUNTING_RIGHTS.read, ACCOUNTING_RIGHTS.close])
const READER = auth([ACCOUNTING_RIGHTS.read])
/** Both rights, and a tenant that runs no bookkeeping. */
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
    postedEntries: 1,
    postedEntriesBesidesOpening: 0,
    ...over,
  }
}

/** The year before the changeover: laid out, and nothing posted in it yet. */
const PRIOR = year({
  id: 2,
  label: '2025',
  numberYear: 2025,
  startDate: '2025-01-01',
  endDate: '2025-12-31',
  deletable: true,
  editable: true,
  postedEntries: 0,
  postedEntriesBesidesOpening: 0,
})

function years(entries: FiscalYear[]): FiscalYearList {
  return {
    years: entries,
    boundary: { postableFrom: null, lockedUntil: null, source: 'NONE', message: '' },
    expiry: { lastEndDate: '2026-12-31', daysLeft: 90, warn: false },
  }
}

function account(id: number, accountNumber: string, name: string, accountType: Account['accountType']): Account {
  return {
    id,
    accountNumber,
    name,
    accountType,
    orPosition: 'UV_FLUESSIGE_MITTEL',
    directPostingAllowed: true,
    active: true,
  }
}

const ACCOUNTS: Account[] = [
  account(1, '1020', 'Bankguthaben', 'ASSET'),
  account(8, '2800', 'Grundkapital', 'EQUITY'),
  account(12, '3200', 'Handelserlöse', 'REVENUE'),
  account(14, '4200', 'Handelswarenaufwand', 'EXPENSE'),
]

function balances(over: Partial<PriorYearBalances> = {}): PriorYearBalances {
  return {
    captured: false,
    entryId: null,
    entryNumber: null,
    bookingDate: null,
    lines: [],
    debitTotal: 0,
    creditTotal: 0,
    blockedBy: null,
    notice: null,
    followingYearEntryNumber: null,
    ...over,
  }
}

/** What the year answers once the balances stand in it. */
function captured(): PriorYearBalances {
  return balances({
    captured: true,
    entryId: 50,
    entryNumber: '2025-000001',
    bookingDate: '2025-12-31',
    lines: [
      { accountId: 1, accountNumber: '1020', accountName: 'Bankguthaben', debit: 48210.55, credit: 0 },
      { accountId: 8, accountNumber: '2800', accountName: 'Grundkapital', debit: 0, credit: 48210.55 },
    ],
    debitTotal: 48210.55,
    creditTotal: 48210.55,
  })
}

function outcome(over: Partial<OpeningEntryOutcome> = {}): OpeningEntryOutcome {
  return {
    entryId: 50,
    entryNumber: '2025-000001',
    bookingDate: '2025-12-31',
    replacedEntryNumber: null,
    reversalEntryNumber: null,
    ...over,
  }
}

const PREVIEW: FiscalYearPreview = {
  numberYear: 2025,
  label: '2025',
  days: 364,
  spansAFullCalendarYear: true,
  warning: '',
  error: '',
  following: null,
}

let container: HTMLDivElement
let root: Root
let asked: { url: string; method: string; body: unknown }[]
let yearList: FiscalYearList
let yearsStatus: number
let balancesAnswer: PriorYearBalances
let captureAnswer: () => Promise<Response>
let previewAnswer: FiscalYearPreview
let createdList: FiscalYearList

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
  yearList = years([PRIOR, year()])
  yearsStatus = 200
  balancesAnswer = balances()
  captureAnswer = () => json(outcome())
  previewAnswer = PREVIEW
  createdList = years([PRIOR, year()])

  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    asked.push({
      url,
      method,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    })
    if (url.includes('/prior-year-balances')) {
      return method === 'PUT' ? captureAnswer() : json(balancesAnswer)
    }
    if (url.includes('/fiscal-years/preview')) return json(previewAnswer)
    if (url.includes('/accounting/accounts')) {
      return json({
        content: ACCOUNTS,
        page: 0,
        size: 200,
        totalElements: ACCOUNTS.length,
        totalPages: 1,
        sort: 'accountNumber,asc',
      })
    }
    if (url.includes('/accounting/fiscal-years')) {
      if (method === 'POST') return json(createdList)
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

async function paint(state: AuthState = CLOSER, at: string = PRIOR_YEAR_PATH) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <AuthContext.Provider value={state}>
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={[at]}>
            <PriorYearPage />
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

async function click(label: string) {
  const target = button(label)
  if (target === undefined) throw new Error(`kein Knopf «${label}»`)
  await act(async () => {
    target.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await settle()
}

/** The account picker of one row of the grid, counted from one. */
function rowPicker(row: number): HTMLSelectElement | null {
  return container.querySelector(`select[aria-label="Konto Zeile ${row}"]`)
}

async function choose(picker: HTMLSelectElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype,
      'value',
    )?.set
    setter?.call(picker, value)
    picker.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await settle()
}

/**
 * Picks the account of one row and types an amount on one of its two sides.
 *
 * <p>The row is looked up again after the pick: its key carries the account, so picking one
 * rebuilds the row, and the field of the old one is no longer in the document.
 */
async function fillRow(row: number, accountId: number, side: 'Soll' | 'Haben', amount: string) {
  const picker = rowPicker(row)
  if (picker === null) throw new Error(`keine Zeile ${row}`)
  await choose(picker, String(accountId))
  const field = rowPicker(row)?.closest('tr')?.querySelector(`input[aria-label="${side}"]`)
  if (!(field instanceof HTMLInputElement)) throw new Error(`kein Feld «${side}» in Zeile ${row}`)
  await typeInto(field, amount)
}

async function typeInto(field: HTMLInputElement | HTMLTextAreaElement, value: string) {
  await act(async () => {
    const prototype =
      field instanceof HTMLTextAreaElement
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
    setter?.call(field, value)
    field.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await settle()
}

/** The PUT that captures, or nothing where none went out. */
function capture() {
  return asked.find((call) => call.method === 'PUT' && call.url.includes('/prior-year-balances'))
}

function link(label: string): HTMLAnchorElement | undefined {
  return [...container.querySelectorAll('a')].find(
    (candidate) => candidate.textContent?.trim() === label,
  )
}

describe('PriorYearPage', () => {
  /**
   * <b>Decision A of the owner, in plain words at the top of the screen.</b> The balances are
   * captured before the appropriation of the result: balance sheet and income accounts, the
   * result still on the income accounts. A trial balance after the closing entries looks alike
   * and would book the result twice.
   */
  it('priorYearHeaderNamesTheRuleTest', async () => {
    await paint()

    expect(text()).toContain('Vorjahressaldi 2025')
    expect(text()).toContain('Erfasst werden die Salden per 31.12.2025 vor den Abschlussbuchungen')
    expect(text()).toContain('Bestandes- und Erfolgskonten')
    expect(text()).toContain('Das Ergebnis steht noch auf den Erfolgskonten, nicht im Eigenkapital.')
  })

  /** The ordinary case: the earliest year opens, the balances are typed and posted. */
  it('priorYearCapturesTest', async () => {
    await paint()

    expect(button('Speichern und verbuchen')?.disabled).toBe(true)
    await fillRow(1, 1, 'Soll', '1250.00')
    await fillRow(2, 12, 'Haben', '1000.00')
    await fillRow(3, 8, 'Haben', '250.00')

    expect(text()).toContain('Differenz 0.00')
    expect(button('Speichern und verbuchen')?.disabled).toBe(false)
    await click('Speichern und verbuchen')

    const sent = capture()
    expect(sent?.url).toBe(`/api/tenants/${TENANT}/accounting/fiscal-years/2/prior-year-balances`)
    expect(sent?.body).toEqual({
      replaceExisting: false,
      reason: null,
      lines: [
        { accountId: 1, debit: 1250, credit: null, taxCodeId: null },
        { accountId: 12, debit: null, credit: 1000, taxCodeId: null },
        { accountId: 8, debit: null, credit: 250, taxCodeId: null },
      ],
    })
    // No booking date and no year in the payload: the server derives the one and reads the
    // other off the path.
    expect(sent?.body).not.toHaveProperty('bookingDate')
    expect(sent?.body).not.toHaveProperty('fiscalYearId')
    expect(text()).toContain('als Eröffnungsbuchung 2025-000001 per 31.12.2025 verbucht')
    expect(link('Journal 2025 ansehen')?.getAttribute('href')).toBe(
      '/buchhaltung/journal?fiscalYearId=2',
    )
  })

  /** The control figure: revenue against expense among the typed rows, and never sent. */
  it('priorYearShowsTheResultTest', async () => {
    await paint()

    expect(text()).toContain('noch keine Erfolgskonten erfasst')
    await fillRow(1, 1, 'Soll', '1250.00')
    await fillRow(2, 12, 'Haben', '1000.00')
    await fillRow(3, 8, 'Haben', '250.00')

    expect(text()).toMatch(/Jahresergebnis 2025 \(rechnerisch\): Gewinn 1.000\.00/)

    await fillRow(4, 14, 'Soll', '1500.00')
    expect(text()).toMatch(/Verlust 500\.00/)
  })

  /** Unbalanced, the button stays shut and the sentence says why; nothing goes out. */
  it('priorYearDifferenceBlocksTheButtonTest', async () => {
    await paint()

    await fillRow(1, 1, 'Soll', '1250.00')
    await fillRow(2, 8, 'Haben', '1000.00')

    expect(text()).toContain('Differenz 250.00')
    expect(text()).toContain('stimmen noch nicht überein')
    expect(button('Speichern und verbuchen')?.disabled).toBe(true)
    expect(capture()).toBeUndefined()
  })

  /**
   * A year that already carries the figures shows them, editable, and replaces rather than
   * corrects — through a dialog that insists on a reason.
   */
  it('priorYearReplacesWithAReasonTest', async () => {
    balancesAnswer = captured()
    captureAnswer = () =>
      json(outcome({
        entryNumber: '2025-000003',
        replacedEntryNumber: '2025-000001',
        reversalEntryNumber: '2025-000002',
      }))

    await paint()

    expect(text()).toContain('besteht bereits die Eröffnungsbuchung 2025-000001 vom 31.12.2025')
    expect(rowPicker(1)?.value).toBe('1')
    const first = rowPicker(1)?.closest('tr')?.querySelector('input[aria-label="Soll"]')
    expect((first as HTMLInputElement).value).toBe('48210.55')
    expect(button('Vorjahressaldi ersetzen')?.disabled).toBe(false)

    await click('Vorjahressaldi ersetzen')
    expect(container.querySelector('[role=dialog]')).not.toBeNull()
    expect(button('Ersetzen und verbuchen')?.disabled).toBe(true)
    expect(capture()).toBeUndefined()

    const field = container.querySelector('textarea')
    if (field === null) throw new Error('kein Feld «Grund»')
    await typeInto(field, 'Zahlendreher auf 1020')
    expect(button('Ersetzen und verbuchen')?.disabled).toBe(false)
    await click('Ersetzen und verbuchen')

    expect(capture()?.body).toEqual({
      replaceExisting: true,
      reason: 'Zahlendreher auf 1020',
      lines: [
        { accountId: 1, debit: 48210.55, credit: null, taxCodeId: null },
        { accountId: 8, debit: null, credit: 48210.55, taxCodeId: null },
      ],
    })
    expect(text()).toContain('als Eröffnungsbuchung 2025-000003 per 31.12.2025 verbucht')
    expect(text()).toContain('Die bisherige 2025-000001 wurde mit 2025-000002 storniert')
  })

  /**
   * Rule 6: a year that holds other posted entries is carried over as a whole or not at all.
   * The sentence is the backend's, it stands where the grid would, and the way on is the
   * journal of that year.
   */
  it('priorYearBlockedShowsTheSentenceInsteadOfTheGridTest', async () => {
    balancesAnswer = balances({
      blockedBy:
        'Für 2025 sind bereits 14 Buchungen verbucht. Das Vorjahr wird als Ganzes übernommen oder gar nicht.',
    })

    await paint()

    expect(text()).toContain('Für 2025 sind bereits 14 Buchungen verbucht.')
    expect(rowPicker(1)).toBeNull()
    expect(button('Speichern und verbuchen')).toBeUndefined()
    expect(link('Journal 2025 ansehen')?.getAttribute('href')).toBe(
      '/buchhaltung/journal?fiscalYearId=2',
    )
  })

  /**
   * <b>The notice does not block.</b> The following year already carries an opening entry; the
   * closing run of the captured year will replace it, and the screen announces that above the
   * grid — the button stays on.
   */
  it('priorYearNoticeDoesNotBlockTheButtonTest', async () => {
    balancesAnswer = balances({
      notice:
        'Für 2026 besteht bereits eine Eröffnungsbuchung (Journal 2026-000001). Sie wird beim Abschluss von 2025 ersetzt.',
      followingYearEntryNumber: '2026-000001',
    })

    await paint()

    expect(text()).toContain('Sie wird beim Abschluss von 2025 ersetzt.')
    expect(link('Eröffnungsbuchung 2026 ansehen')?.getAttribute('href')).toBe(
      '/buchhaltung/journal?fiscalYearId=3',
    )
    expect(rowPicker(1)).not.toBeNull()

    await fillRow(1, 1, 'Soll', '100.00')
    await fillRow(2, 8, 'Haben', '100.00')
    expect(button('Speichern und verbuchen')?.disabled).toBe(false)
  })

  /**
   * Reading is on `ACCOUNTING_READ`, writing on `ACCOUNTING_CLOSE`: whoever may only read sees
   * the grid and a line naming the missing right, and the button stays off.
   */
  it('priorYearWithoutCloseRightTest', async () => {
    await paint(READER)

    expect(text()).toContain('ACCOUNTING_CLOSE')
    expect(text()).toContain('Geschäftsjahr führen')
    expect(rowPicker(1)).not.toBeNull()

    await fillRow(1, 1, 'Soll', '100.00')
    await fillRow(2, 8, 'Haben', '100.00')
    expect(button('Speichern und verbuchen')?.disabled).toBe(true)
  })

  /** Without the read right there is nothing to show at all. */
  it('priorYearWithoutReadRightTest', async () => {
    await paint(OUTSIDER)

    expect(text()).toContain('Keine Berechtigung')
    expect(text()).toContain('ACCOUNTING_READ')
  })

  /** The module switch stands on the route: this screen exists for a writing way. */
  it('priorYearWithoutTheModuleTest', async () => {
    await paint(OFFLINE)

    expect(text()).toContain('Modul nicht eingeschaltet')
    expect(rowPicker(1)).toBeNull()
  })

  /** A tenant without any year is sent to the wizard: the prior year stands before a first one. */
  it('priorYearWithoutAnyYearTest', async () => {
    yearList = years([])

    await paint()

    expect(text()).toContain('Noch kein Geschäftsjahr')
    expect(link('Buchhaltung einrichten')?.getAttribute('href')).toBe('/buchhaltung/einrichten')
    expect(asked.some((call) => call.url.includes('/prior-year-balances'))).toBe(false)
  })

  /**
   * Where the year before the changeover is not laid out yet, the screen lays it out — named by
   * the calculator of the backend, twelve months ending the day before the earliest year, and
   * opened as soon as it stands.
   */
  it('priorYearCreatesTheYearBeforeTest', async () => {
    yearList = years([year()])

    await paint()

    expect(text()).toContain('Vorjahressaldi 2026')
    expect(button('2025 anlegen')).toBeDefined()
    const preview = asked.find((call) => call.url.includes('/fiscal-years/preview'))
    expect(preview?.url).toContain('start=2025-01-01&end=2025-12-31')

    await click('2025 anlegen')

    const created = asked.find(
      (call) => call.method === 'POST' && call.url.endsWith('/accounting/fiscal-years'),
    )
    expect(created?.body).toEqual({
      label: '2025',
      numberYear: 2025,
      startDate: '2025-01-01',
      endDate: '2025-12-31',
      createFollowingYear: false,
    })
    expect(text()).toContain('Vorjahressaldi 2025')
    expect(asked.some((call) => call.url.includes('/fiscal-years/2/prior-year-balances'))).toBe(true)
  })

  /** A range the calculator objects to is not offered. */
  it('priorYearOffersNoYearBeforeOnAnObjectionTest', async () => {
    previewAnswer = { ...PREVIEW, error: 'Die Periode überschneidet sich mit 2025.' }

    await paint()

    expect(button('2025 anlegen')).toBeUndefined()
  })

  /** The address names the year where the fiscal year screen led here with one. */
  it('priorYearOpensTheNamedYearTest', async () => {
    await paint(CLOSER, `${PRIOR_YEAR_PATH}?fiscalYearId=3`)

    expect(text()).toContain('Vorjahressaldi 2026')
    expect(asked.some((call) => call.url.includes('/fiscal-years/3/prior-year-balances'))).toBe(true)
    expect(asked.some((call) => call.url.includes('/fiscal-years/2/prior-year-balances'))).toBe(false)
  })

  /** Switching the year in the picker reads the other year's figures. */
  it('priorYearSwitchesTheYearTest', async () => {
    await paint()

    const picker = container.querySelector('select') as HTMLSelectElement
    await choose(picker, '3')

    expect(text()).toContain('Vorjahressaldi 2026')
    expect(asked.some((call) => call.url.includes('/fiscal-years/3/prior-year-balances'))).toBe(true)
  })

  /** A refused capture is said in words, and the grid stays as it was typed. */
  it('priorYearShowsARefusalTest', async () => {
    captureAnswer = () =>
      json({ detail: 'Für 2025 besteht bereits die Eröffnungsbuchung 2025-000001.' }, 409)

    await paint()
    await fillRow(1, 1, 'Soll', '100.00')
    await fillRow(2, 8, 'Haben', '100.00')
    await click('Speichern und verbuchen')

    expect(container.querySelector('[role=alert]')?.textContent).toContain(
      'Für 2025 besteht bereits die Eröffnungsbuchung 2025-000001.',
    )
    expect(rowPicker(1)?.value).toBe('1')
  })

  /** A failed year list shows the error rather than an empty screen. */
  it('priorYearShowsTheErrorTest', async () => {
    yearsStatus = 500

    await paint()

    expect(container.querySelector('[role=alert]')).not.toBeNull()
    expect(rowPicker(1)).toBeNull()
  })
})
