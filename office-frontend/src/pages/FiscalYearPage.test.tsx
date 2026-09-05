// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import {
  ACCOUNTING_RIGHTS,
  ACCOUNTING_SETTINGS_PATH,
  FISCAL_YEARS_PATH,
} from '../lib/accounting'
import type { FiscalYear, FiscalYearList, FiscalYearPreview, Tenant } from '../lib/types'
import { FiscalYearPage } from './FiscalYearPage'

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

/**
 * Holds the tenant right on top, so the signpost into the tenant mask stands.
 *
 * <p>Not for the two lock dates: those travel in the fiscal year answer and stand for
 * {@link READER} just the same.
 */
const KEEPER = session([ACCOUNTING_RIGHTS.read, ACCOUNTING_RIGHTS.close, 'TENANT_READ'])
const READER = session([ACCOUNTING_RIGHTS.read])

function year(overrides: Partial<FiscalYear> = {}): FiscalYear {
  return {
    id: 12,
    label: '2026',
    numberYear: 2026,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    status: 'OPEN',
    deletable: true,
    editable: true,
    spansAFullCalendarYear: false,
    postedEntries: 0,
    ...overrides,
  }
}

/**
 * What `GET /fiscal-years` answers.
 *
 * <p>`warn` is handed over, never worked out here: the thirty days are a constant of
 * `FiscalYearRules` and live in the backend and nowhere else (backend ADR-0113).
 */
function list(overrides: Partial<FiscalYearList> = {}): FiscalYearList {
  return {
    years: [year()],
    boundary: {
      postableFrom: '2026-09-01',
      lockedUntil: '2026-08-31',
      source: 'LOCK_DATE',
      message: 'Bis und mit 31.08.2026 ist das Buchen gesperrt (Sperrdatum der Buchhaltung).',
    },
    expiry: { lastEndDate: '2026-12-31', daysLeft: 200, warn: false },
    // Both lock dates travel with the years, so the screen shows them on `ACCOUNTING_READ`
    // alone (backend ADR-0113).
    postingsLockedUntil: '2026-08-31',
    vatPeriodsLockedUntil: '2026-06-30',
    ...overrides,
  }
}

/**
 * The tenant record, read for one thing only: the start month the create dialog prefills the
 * very first year with. The VAT date on it is deliberately a **different** day from the one in
 * {@link list}, so a test that read it from here instead of from the years would say so.
 */
const TENANT_RECORD: Tenant = {
  id: TENANT,
  code: 'WX',
  name: 'Webux GmbH',
  address: { postalCode: '8001', town: 'Zürich' },
  fiscalYearStartMonth: 1,
  vatPeriodsLockedUntil: '2020-01-31',
}

const PREVIEW: FiscalYearPreview = {
  numberYear: 2027,
  label: '2027',
  days: 364,
  spansAFullCalendarYear: false,
  warning: '',
  error: '',
  following: {
    label: '2028',
    numberYear: 2028,
    startDate: '2028-01-01',
    endDate: '2028-12-31',
  },
}

const DBG_WARNING =
  'Dieses Geschäftsjahr überspannt das Kalenderjahr 2027 ohne Abschluss.'

const EXPIRY_WARNING = 'Das letzte Geschäftsjahr endet am'

let container: HTMLDivElement
let root: Root
/** What the fiscal year endpoint answers; every test sets what it is about. */
let years: FiscalYearList
/** What the preview endpoint answers. */
let preview: FiscalYearPreview
/**
 * What the preview endpoint answers for one address.
 *
 * <p>Per address and not per test run: since the typed name and the typed series travel in the
 * query, a test about an override has to answer the two requests differently.
 */
let previewFor: (url: string) => FiscalYearPreview
/** Set where a test is about the list failing. */
let listStatus: number
/** Every write the mask sent: address, method and body per request. */
let written: { url: string; method: string; body: Record<string, unknown> }[]
/** Every address the mask read, so a test can say what was *not* fetched. */
let read: string[]

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

beforeEach(() => {
  years = list()
  preview = { ...PREVIEW }
  previewFor = () => preview
  listStatus = 200
  written = []
  read = []
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (method !== 'GET') {
      written.push({
        url,
        method,
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : {},
      })
      return json(years)
    }
    read.push(url)
    if (url.includes('/fiscal-years/preview')) return json(previewFor(url))
    if (url.includes('/fiscal-years')) {
      return listStatus === 200
        ? json(years)
        : json({ detail: 'Das Backend meldet einen Fehler.' }, listStatus)
    }
    return json(TENANT_RECORD)
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

async function settle() {
  for (let round = 0; round < 8; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60))
    })
  }
}

async function render(auth: AuthState = KEEPER) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[FISCAL_YEARS_PATH]}>
        <AuthContext.Provider value={auth}>
          <QueryClientProvider client={client}>
            <FiscalYearPage />
          </QueryClientProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
  })
  await settle()
}

/** The input the given label points at, or undefined while the mask does not show it. */
function field(label: string): HTMLInputElement | undefined {
  const caption = [...document.querySelectorAll('label')].find(
    (entry) => entry.textContent === label,
  )
  if (!caption) return undefined
  return (document.getElementById(caption.htmlFor) as HTMLInputElement | null) ?? undefined
}

/** Buttons are looked for in the whole document: a dialog renders outside the container. */
function button(text: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll('button')].find(
    (entry) => entry.textContent?.trim() === text,
  ) as HTMLButtonElement | undefined
}

/** The overflow button of one row, addressed the way a screen reader hears it. */
function rowMenu(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll('button')].find(
    (entry) => entry.getAttribute('aria-label') === `Weitere Aktionen für ${label}`,
  ) as HTMLButtonElement | undefined
}

/** The entries of the open row menu, in the order the arrow keys walk them. */
function menuItems(): HTMLButtonElement[] {
  return [...document.querySelectorAll('[role="menuitem"]')] as HTMLButtonElement[]
}

/** Presses a key on an element the way a keyboard does: it bubbles. */
function press(element: HTMLElement | undefined, key: string) {
  expect(element).toBeDefined()
  act(() => {
    element?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

function link(text: string): HTMLAnchorElement | undefined {
  return [...document.querySelectorAll('a')].find((entry) =>
    entry.textContent?.includes(text),
  ) as HTMLAnchorElement | undefined
}

function text(): string {
  return document.body.textContent ?? ''
}

async function click(element: Element | undefined) {
  expect(element).toBeDefined()
  await act(async () => {
    ;(element as HTMLElement).click()
  })
  await settle()
}

/** Types into a field the way a person would, so React sees the change. */
async function type(label: string, value: string) {
  const input = field(label)
  expect(input).toBeDefined()
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )?.set
    setter?.call(input, value)
    input?.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await settle()
}

/** Opens the create dialog and waits for the first preview to arrive. */
async function openCreateDialog() {
  await click(button('Geschäftsjahr anlegen'))
}

describe('FiscalYearPage', () => {
  it('fiscalYearPageListsTheYearsTest', async () => {
    years = list({
      years: [
        year(),
        year({ id: 11, label: '2025', numberYear: 2025, startDate: '2025-01-01', endDate: '2025-12-31', status: 'LOCKED' }),
        year({ id: 10, label: '2024', numberYear: 2024, startDate: '2024-01-01', endDate: '2024-12-31', status: 'CLOSED', deletable: false, editable: false }),
      ],
    })
    await render()

    expect(text()).toContain('2026')
    expect(text()).toContain('01.01.2026')
    expect(text()).toContain('31.12.2026')
    expect(text()).toContain('Offen')
    expect(text()).toContain('Gesperrt')
    expect(text()).toContain('Abgeschlossen')
  })

  it('fiscalYearPageShowsLoadingTest', async () => {
    vi.stubGlobal('fetch', () => new Promise(() => {}))
    await render()

    expect(text()).toContain('Wird geladen')
  })

  it('fiscalYearPageShowsEmptyStateTest', async () => {
    years = list({
      years: [],
      boundary: { postableFrom: null, lockedUntil: null, source: 'NONE', message: '' },
      expiry: { lastEndDate: null, daysLeft: null, warn: false },
      postingsLockedUntil: null,
      vatPeriodsLockedUntil: null,
    })
    await render()

    expect(text()).toContain('Es gibt noch kein Geschäftsjahr')
    expect(button('Erstes Geschäftsjahr anlegen')).toBeDefined()
    // Nothing is locked, so the footer says so rather than naming a day.
    expect(text()).toContain('Es ist nichts gesperrt.')
    // A date nobody set stays «nicht gesetzt» — the null travels as a null.
    expect(text()).toContain('nicht gesetzt')
  })

  it('fiscalYearPageShowsErrorTest', async () => {
    listStatus = 500
    await render()

    expect(text()).toContain('Das Backend meldet einen Fehler.')
  })

  /** The right says who may look; the module switch says whether there is anything to look at. */
  it('fiscalYearPageShowsForbiddenTest', async () => {
    await render(session(['PARTNER_READ']))

    expect(text()).toContain('Keine Berechtigung')
    expect(text()).toContain(ACCOUNTING_RIGHTS.read)
  })

  it('fiscalYearPageShowsModuleOffTest', async () => {
    await render(session([ACCOUNTING_RIGHTS.read], []))

    expect(text()).toContain('Modul nicht eingeschaltet')
  })

  // --- die eine Buchungsgrenze und die zwei Lesewerte ------------------------

  /**
   * One boundary and not three.
   *
   * <p>The footer says from which day on this tenant books and names what holds it. The two
   * lock dates below it are read values with a signpost each — no input field, because each is
   * maintained on the one screen it belongs to (backend ADR-0113).
   */
  it('fiscalYearPageShowsOneBoundaryWithItsSourceTest', async () => {
    await render()

    expect(text()).toContain('Gebucht wird ab dem 01.09.2026.')
    expect(text()).toContain('Bis und mit 31.08.2026 ist das Buchen gesperrt')
    expect(text()).toContain('Sperrdatum der Buchhaltung')
  })

  it('fiscalYearPageShowsBothLockDatesAsReadValuesTest', async () => {
    await render()

    expect(text()).toContain('Sperrdatum')
    expect(text()).toContain('31.08.2026')
    expect(text()).toContain('MWST abgerechnet bis')
    expect(text()).toContain('30.06.2026')
    // No field for either of them: two masks writing one row would be two caches of it.
    expect(field('Sperrdatum')).toBeUndefined()
    expect(field('MWST abgerechnet bis')).toBeUndefined()
    expect(link('Buchhaltung → Einstellungen')?.getAttribute('href')).toBe(
      ACCOUNTING_SETTINGS_PATH,
    )
    expect(link('Mandant → Mehrwertsteuer')?.getAttribute('href')).toBe(`/mandanten/${TENANT}`)
  })

  /**
   * The point of the whole exercise: a bookkeeper without `TENANT_READ` reads both days.
   *
   * <p>Before this, the VAT date came from `GET /api/tenants/{id}` and the row said «nicht
   * gesetzt» at a date that was set — a wrong display, not a missing one. Both days now travel
   * in the fiscal year answer, and no request goes to the tenant at all.
   */
  it('fiscalYearPageShowsBothLockDatesWithoutTenantReadTest', async () => {
    await render(READER)

    expect(text()).toContain('Sperrdatum')
    expect(text()).toContain('31.08.2026')
    expect(text()).toContain('MWST abgerechnet bis')
    expect(text()).toContain('30.06.2026')
    expect(text()).not.toContain('nicht gesetzt')
    expect(read.some((url) => url === `/api/tenants/${TENANT}`)).toBe(false)
    expect(read.some((url) => url.includes('/accounting/settings'))).toBe(false)
  })

  /** A signpost into a mask that answers 403 would only produce a question. */
  it('fiscalYearPageHidesTheTenantSignpostWithoutTenantReadTest', async () => {
    await render(READER)

    expect(text()).toContain('MWST abgerechnet bis')
    expect(link('Mandant → Mehrwertsteuer')).toBeUndefined()
    expect(link('Buchhaltung → Einstellungen')).toBeDefined()
    expect(read.some((url) => url === `/api/tenants/${TENANT}`)).toBe(false)
  })

  // --- die 30-Tage-Warnung ---------------------------------------------------

  it('fiscalYearPageWarnsAtThirtyDaysTest', async () => {
    years = list({ expiry: { lastEndDate: '2026-12-31', daysLeft: 30, warn: true } })
    await render()

    expect(text()).toContain(EXPIRY_WARNING)
    expect(text()).toContain('31.12.2026')
  })

  /** One day earlier there is nothing to say, and the screen says nothing. */
  it('fiscalYearPageDoesNotWarnAtThirtyOneDaysTest', async () => {
    years = list({ expiry: { lastEndDate: '2026-12-31', daysLeft: 31, warn: false } })
    await render()

    expect(text()).not.toContain(EXPIRY_WARNING)
  })

  /** Once the day has passed the sentence moves into the past tense. */
  it('fiscalYearPageWarnsAfterTheLastYearEndedTest', async () => {
    years = list({ expiry: { lastEndDate: '2026-12-31', daysLeft: -3, warn: true } })
    await render()

    expect(text()).toContain('Das letzte Geschäftsjahr endete am')
  })

  // --- was eine Zeile anbietet ----------------------------------------------

  /**
   * «Löschen» is missing at a year that has already issued a journal number.
   *
   * <p>The backend refuses that with 409, and a button whose only outcome is a refusal is a
   * trap. The state switch stays: an open year may still be locked.
   */
  it('fiscalYearPageHidesDeleteOnAnUndeletableYearTest', async () => {
    years = list({ years: [year({ deletable: false, editable: false })] })
    await render()

    // Nothing rarer is left to offer, so the menu itself is gone — and with it «Löschen».
    expect(rowMenu('2026')).toBeUndefined()
    expect(text()).not.toContain('Löschen')
    // The state switch stays: an open year may still be locked.
    expect(button('Sperren')).toBeDefined()
  })

  /** Only «Löschen» is missing where a number was drawn; correcting the name stays possible. */
  it('fiscalYearPageOffersOnlyEditOnAnUndeletableYearTest', async () => {
    years = list({ years: [year({ deletable: false })] })
    await render()

    await click(rowMenu('2026'))

    expect(text()).toContain('Ändern')
    expect(text()).not.toContain('Löschen')
  })

  it('fiscalYearPageOffersDeleteOnADeletableYearTest', async () => {
    await render()

    await click(rowMenu('2026'))

    expect(text()).toContain('Löschen')
    expect(text()).toContain('Ändern')
  })

  it('fiscalYearPageDeletesAYearTest', async () => {
    await render()

    await click(rowMenu('2026'))
    await click(button('Löschen'))
    expect(text()).toContain('Das Geschäftsjahr 2026 und sein Protokoll werden gelöscht.')
    await click(button('Löschen'))

    const removed = written.find((entry) => entry.method === 'DELETE')
    expect(removed?.url).toBe(`/api/tenants/${TENANT}/accounting/fiscal-years/12`)
  })

  it('fiscalYearPageLocksAnOpenYearTest', async () => {
    await render()

    await click(button('Sperren'))

    const put = written.find((entry) => entry.url.endsWith('/status'))
    expect(put?.method).toBe('PUT')
    expect(put?.body).toEqual({ status: 'LOCKED' })
  })

  /** Nothing to lock and nothing to open: a closed year is reached by the closing run only. */
  it('fiscalYearPageOffersNoStatusButtonOnAClosedYearTest', async () => {
    years = list({ years: [year({ status: 'CLOSED', deletable: false, editable: false })] })
    await render()

    expect(button('Sperren')).toBeUndefined()
    expect(button('Öffnen')).toBeUndefined()
  })

  /** Reading the years is one right; laying one out is another. */
  it('fiscalYearPageHidesTheActionsWithoutCloseTest', async () => {
    await render(READER)

    expect(button('Geschäftsjahr anlegen')).toBeUndefined()
    expect(button('Sperren')).toBeUndefined()
    expect(text()).toContain('2026')
  })

  // --- der Anlegedialog -----------------------------------------------------

  it('fiscalYearDialogAsksThePreviewTest', async () => {
    await render()

    await openCreateDialog()

    const asked = read.filter((url) => url.includes('/fiscal-years/preview'))
    expect(asked.length).toBeGreaterThan(0)
    expect(asked[0]).toContain('start=2027-01-01')
    expect(asked[0]).toContain('end=2027-12-31')
    // Name and series come from the answer, not from arithmetic in the browser.
    expect(field('Bezeichnung')?.value).toBe('2027')
    expect(field('Nummernserie')?.value).toBe('2027')
  })

  /** Every change to beginning or end asks again, debounced. */
  it('fiscalYearDialogAsksThePreviewAgainAfterAChangeTest', async () => {
    await render()
    await openCreateDialog()

    preview = { ...PREVIEW, numberYear: 2028, label: '2028' }
    await type('Ende', '2028-06-30')

    const asked = read.filter((url) => url.includes('/fiscal-years/preview'))
    expect(asked.at(-1)).toContain('end=2028-06-30')
  })

  /**
   * The warning is confirmed through the wording of the button, not through a second dialog.
   *
   * <p>A year that covers a calendar year it does not end in leaves that year without a
   * closing — DBG Art. 79 Abs. 3. The year of foundation may look like that, and only the
   * tenant knows whether this is one, so it warns and does not refuse.
   */
  it('fiscalYearDialogLabelsTheButtonTrotzdemAnlegenTest', async () => {
    preview = { ...PREVIEW, spansAFullCalendarYear: true, warning: DBG_WARNING }
    await render()

    await openCreateDialog()

    expect(text()).toContain(DBG_WARNING)
    expect(button('Trotzdem anlegen')).toBeDefined()
    expect(button('Anlegen')).toBeUndefined()
  })

  /** With an error the button stays off, and the sentence stands at the fields. */
  it('fiscalYearDialogDisablesTheButtonOnAnErrorTest', async () => {
    preview = {
      ...PREVIEW,
      error: 'Das Geschäftsjahr überlappt mit dem bestehenden Geschäftsjahr 2026.',
    }
    await render()

    await openCreateDialog()

    expect(text()).toContain('überlappt mit dem bestehenden')
    expect(button('Anlegen')?.disabled).toBe(true)
  })

  /**
   * The tick is set, and it travels.
   *
   * <p>One click, one request, one transaction, two years — set from the start because the
   * closing run lays the following year out anyway and because on the 2nd of January the sales
   * desk otherwise stands still.
   */
  it('fiscalYearDialogSendsCreateFollowingYearTest', async () => {
    await render()
    await openCreateDialog()

    expect(text()).toContain('Folgejahr 2028 gleich mit anlegen')
    await click(button('Anlegen'))

    const post = written.find((entry) => entry.method === 'POST')
    expect(post?.body).toEqual({
      label: '2027',
      numberYear: 2027,
      startDate: '2027-01-01',
      endDate: '2027-12-31',
      createFollowingYear: true,
    })
  })

  /** Unticked it stays away, and one year is laid out. */
  it('fiscalYearDialogSendsWithoutTheFollowingYearTest', async () => {
    await render()
    await openCreateDialog()

    const tick = [...document.querySelectorAll('input[type="checkbox"]')][0]
    await click(tick)
    await click(button('Anlegen'))

    const post = written.find((entry) => entry.method === 'POST')
    expect(post?.body.createFollowingYear).toBe(false)
  })

  /** What somebody typed is never overwritten by a later answer of the calculator. */
  it('fiscalYearDialogKeepsATypedLabelTest', async () => {
    await render()
    await openCreateDialog()

    await type('Bezeichnung', 'Gründungsjahr')
    preview = { ...PREVIEW, numberYear: 2028, label: '2028' }
    await type('Ende', '2028-06-30')

    expect(field('Bezeichnung')?.value).toBe('Gründungsjahr')
  })

  /**
   * The dialog used to block itself for good, and this is the case it happened in.
   *
   * <p>A tenant with the stub year 01.01.–30.06.2026 lays out the second period. The
   * calculator answers that the series 2026 is taken and asks for another one; the reader
   * types 2027, exactly as told. Under a key made of the two dates alone that was the very
   * same question, so no request went out, the sentence stayed and «Anlegen» never came back
   * on — the second period of a split year could not be created at all.
   */
  it('fiscalYearDialogClearsASeriesErrorWhenTheSeriesIsRetypedTest', async () => {
    const taken: FiscalYearPreview = {
      ...PREVIEW,
      numberYear: 2026,
      label: '2026',
      following: null,
      error:
        'Für 2026 besteht bereits ein Geschäftsjahr. Wählen Sie eine andere Nummernserie — '
        + 'die Bezeichnung bleibt frei wählbar.',
    }
    previewFor = (url) => (url.includes('numberYear=2027') ? { ...taken, error: '' } : taken)
    await render()

    await openCreateDialog()
    expect(text()).toContain('Wählen Sie eine andere Nummernserie')
    expect(button('Anlegen')?.disabled).toBe(true)

    await type('Nummernserie', '2027')

    // The typed series travelled, so the backend judged that one and not the one it reads off
    // the dates.
    expect(read.some((url) => url.includes('numberYear=2027'))).toBe(true)
    expect(text()).not.toContain('Wählen Sie eine andere Nummernserie')
    expect(button('Anlegen')?.disabled).toBe(false)
  })

  /** A renamed year asks again, and the name travels with the question. */
  it('fiscalYearDialogSendsTheTypedLabelToThePreviewTest', async () => {
    await render()
    await openCreateDialog()

    await type('Bezeichnung', 'Gründungsjahr')

    const asked = read.filter((url) => url.includes('/fiscal-years/preview'))
    expect(asked.at(-1)).toContain('label=Gr%C3%BCndungsjahr')
  })

  /**
   * A half typed series is no question.
   *
   * <p>«20» would be answered with a telling-off in the middle of somebody typing their own
   * correction, so nothing goes out until four digits stand there.
   */
  it('fiscalYearDialogAsksNothingForAHalfTypedSeriesTest', async () => {
    await render()
    await openCreateDialog()
    const before = read.filter((url) => url.includes('/fiscal-years/preview')).length

    await type('Nummernserie', '20')

    const asked = read.filter((url) => url.includes('/fiscal-years/preview'))
    expect(asked).toHaveLength(before)
    expect(asked.some((url) => url.includes('numberYear'))).toBe(false)
  })

  // --- das Zeilenmenue an der Tastatur ---------------------------------------

  /**
   * The menu carries `role="menu"`, so the arrow keys walk it and wrap round at the end —
   * the same pattern `components/SplitButton` implements. A role that promises this and then
   * does nothing is worse than no role at all.
   */
  it('fiscalYearPageRowMenuWalksWithTheArrowKeysTest', async () => {
    await render()

    await click(rowMenu('2026'))

    expect(menuItems().map((item) => item.textContent)).toEqual(['Ändern', 'Löschen'])
    expect(document.activeElement).toBe(menuItems()[0])
    press(menuItems()[0], 'ArrowDown')
    expect(document.activeElement).toBe(menuItems()[1])
    press(menuItems()[1], 'ArrowDown')
    expect(document.activeElement).toBe(menuItems()[0])
  })

  it('fiscalYearPageRowMenuWalksBackwardsTest', async () => {
    await render()
    await click(rowMenu('2026'))

    press(menuItems()[0], 'ArrowUp')

    expect(document.activeElement).toBe(menuItems()[1])
  })

  it('fiscalYearPageRowMenuJumpsWithHomeAndEndTest', async () => {
    await render()
    await click(rowMenu('2026'))

    press(menuItems()[0], 'End')
    expect(document.activeElement).toBe(menuItems()[1])
    press(menuItems()[1], 'Home')
    expect(document.activeElement).toBe(menuItems()[0])
  })

  /** Escape closes and hands focus back, or the next Tab starts at the top of the page. */
  it('fiscalYearPageRowMenuClosesOnEscapeTest', async () => {
    await render()
    await click(rowMenu('2026'))

    press(menuItems()[0], 'Escape')

    expect(menuItems()).toHaveLength(0)
    expect(document.activeElement).toBe(rowMenu('2026'))
  })

  /** From the button, ArrowUp opens at the last entry — what a menu button is expected to do. */
  it('fiscalYearPageRowMenuOpensAtTheLastEntryOnArrowUpTest', async () => {
    await render()

    press(rowMenu('2026'), 'ArrowUp')

    expect(menuItems()).toHaveLength(2)
    expect(document.activeElement).toBe(menuItems()[1])
  })

  it('fiscalYearPageRowMenuClosesOnAClickElsewhereTest', async () => {
    await render()
    await click(rowMenu('2026'))

    act(() => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })

    expect(menuItems()).toHaveLength(0)
  })
})
