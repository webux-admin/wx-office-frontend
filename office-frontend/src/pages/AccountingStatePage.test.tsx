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
import type { AccountingSettings, FiscalYear, FiscalYearList } from '../lib/types'
import { AccountingStatePage } from './AccountingStatePage'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

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

const CONFIGURE = session([ACCOUNTING_RIGHTS.read, ACCOUNTING_RIGHTS.configure])
const READ_ONLY = session([ACCOUNTING_RIGHTS.read])
/** The session that may also look at the roles — only it is shown the rights hint. */
const WITH_ROLES = session([
  ACCOUNTING_RIGHTS.read,
  ACCOUNTING_RIGHTS.configure,
  'USER_READ',
])

const STORED: AccountingSettings = {
  ledgerCurrency: 'CHF',
  equityLayout: 'JURISTIC',
  profitAndLossForm: 'PRODUCTION',
}

const HINT = 'Keine Rolle dieses Mandanten trägt die Buchhaltungsrechte.'

const YEAR_2026: FiscalYear = {
  id: 12,
  label: '2026',
  numberYear: 2026,
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  status: 'OPEN',
  deletable: true,
  editable: true,
  spansAFullCalendarYear: false,
}

/**
 * What `GET /fiscal-years` answers.
 *
 * <p>`warn` is not worked out here: the thirty days are counted in the backend, and a browser
 * counting them a second time would be a second rule to keep in step (backend ADR-0113).
 */
function fiscalYears(daysLeft: number | null, years: FiscalYear[] = [YEAR_2026]): FiscalYearList {
  return {
    years,
    boundary: { postableFrom: null, lockedUntil: null, source: 'NONE', message: '' },
    expiry: {
      lastEndDate: years.at(-1)?.endDate ?? null,
      daysLeft,
      warn: daysLeft !== null && daysLeft <= 30,
    },
  }
}

const EXPIRY_WARNING = 'Das letzte Geschäftsjahr endet am'

/** What `App.tsx` holds an answer fresh for. */
const APP_STALE_TIME = 30_000

let container: HTMLDivElement
let root: Root
/** What `GET /settings` answers; every test sets what it is about. */
let settings: AccountingSettings
/** What the role endpoint answers. Empty means: nobody may keep books yet. */
let roles: { permissions: string[] }[]
/** What the fiscal year endpoint answers; every test about the warning sets it. */
let years: FiscalYearList
/** Every write the mask sent: address, method and body per request. */
let written: { url: string; method: string; body: Record<string, unknown> }[]
/** Every address the mask read, so a test can say what was *not* fetched. */
let read: string[]

function json(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

function stubFetch() {
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (method !== 'GET') {
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {}
      written.push({ url, method, body })
      settings = { ...settings, postingsLockedUntil: body.postingsLockedUntil ?? undefined }
      return json(settings)
    }
    read.push(url)
    if (url.endsWith('/roles')) return json(roles)
    if (url.includes('/fiscal-years')) return json(years)
    return json(settings)
  })
}

beforeEach(() => {
  settings = { ...STORED }
  roles = []
  years = fiscalYears(200)
  written = []
  read = []
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
  for (let round = 0; round < 5; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

/**
 * @param auth the session the mask runs under
 * @param staleTime how long an answer counts as fresh; `APP_STALE_TIME` is what `App.tsx`
 *   runs with, and only under it does a test say anything about invalidating a cache
 */
async function render(auth: AuthState = CONFIGURE, staleTime = 0) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime } } })
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[ACCOUNTING_SETTINGS_PATH]}>
        <AuthContext.Provider value={auth}>
          <QueryClientProvider client={client}>
            <AccountingStatePage />
          </QueryClientProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
  })
  await settle()
}

/** The input the given label points at, or undefined while the mask does not show it. */
function field(label: string): HTMLInputElement | undefined {
  const caption = [...container.querySelectorAll('label')].find(
    (entry) => entry.textContent === label,
  )
  if (!caption) return undefined
  return (document.getElementById(caption.htmlFor) as HTMLInputElement | null) ?? undefined
}

function button(text: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find((entry) =>
    entry.textContent?.includes(text),
  ) as HTMLButtonElement | undefined
}

function link(text: string): HTMLAnchorElement | undefined {
  return [...container.querySelectorAll('a')].find((entry) =>
    entry.textContent?.includes(text),
  ) as HTMLAnchorElement | undefined
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

describe('AccountingStatePage', () => {
  it('rendersLedgerCurrencyTest', async () => {
    await render()

    expect(container.textContent).toContain('Buchführungswährung')
    expect(container.textContent).toContain('CHF')
    expect(container.textContent).toContain('Eingeschaltet')
    expect(link('Systemeinstellungen → Module')?.getAttribute('href')).toBe('/module')
  })

  /**
   * The state this screen exists for: a tenant that keeps its books in euros cannot keep them
   * here at all, and the explanation belongs on the screen rather than in a red error page.
   */
  it('rendersBlockerTest', async () => {
    settings = {
      blocker:
        'Die Buchhaltung führt derzeit nur Franken. Dieser Mandant rechnet in EUR. Nach OR '
        + 'Art. 958d Abs. 3 müsste die Jahresrechnung zusätzlich in Franken ausgewiesen und '
        + 'die Umrechnungskurse müssten im Anhang offengelegt werden; das baut diese Reihe '
        + 'nicht.',
    }
    await render(WITH_ROLES)

    expect(container.textContent).toContain('Dieser Mandant kann hier keine Bücher führen.')
    expect(container.textContent).toContain('OR Art. 958d Abs. 3')
    expect(link('Mandant → Grunddaten')?.getAttribute('href')).toBe(`/mandanten/${TENANT}`)
    // No field and no button — there is nothing to set while no books can be kept.
    expect(field('Gesperrt bis')).toBeUndefined()
    expect(button('Speichern')).toBeUndefined()
    // And no second warning beside it: two of them read as a broken mask.
    expect(container.textContent).not.toContain(HINT)
  })

  /**
   * The fourth case, and expressly not the third: a set reference pointing nowhere sends
   * somebody to a screen whose field is filled — they would conclude the software is lying.
   */
  it('rendersUnresolvableCurrencyBlockerTest', async () => {
    settings = {
      blocker:
        'Die hinterlegte Buchführungswährung dieses Mandanten lässt sich nicht auflösen — der '
        + 'Stammdateneintrag dazu fehlt. Bitte unter Mandant → Grunddaten neu auswählen.',
    }
    await render()

    expect(container.textContent).toContain('lässt sich nicht auflösen')
    expect(container.textContent).not.toContain('ist keine Buchführungswährung gesetzt')
    expect(field('Gesperrt bis')).toBeUndefined()
  })

  /** Reading the state is one right, moving the bolt is another (backend ADR-0119). */
  it('hidesSaveWithoutConfigureTest', async () => {
    settings = { ...STORED, postingsLockedUntil: '2026-12-31' }
    await render(READ_ONLY)

    expect(button('Speichern')).toBeUndefined()
    expect(field('Gesperrt bis')).toBeUndefined()
    // Shown all the same: whoever may read the state may read the date it is in.
    expect(container.textContent).toContain('31.12.2026')
  })

  /**
   * The named day is locked itself.
   *
   * <p>The backend refuses a booking date that is not <b>after</b> the bolt, so «Vor diesem
   * Tag wird nichts verbucht» was wrong by exactly one day — the one day somebody would have
   * posted on before noticing.
   */
  it('namesTheLockedDayItselfTest', async () => {
    await render()

    expect(container.textContent).toContain('Bis und mit diesem Tag wird nichts verbucht.')
    expect(container.textContent).not.toContain('Vor diesem Tag')
  })

  /**
   * The bolt that was just moved is one of the three the posting boundary is worked out from.
   *
   * <p>Rendered with the staleness the application runs with, so a remount alone fetches
   * nothing: without the invalidation «Buchhaltung → Geschäftsjahre» went on naming the day
   * before the save for another half minute.
   */
  it('invalidatesTheFiscalYearsAfterSavingTheLockDateTest', async () => {
    await render(CONFIGURE, APP_STALE_TIME)
    const before = read.filter((url) => url.includes('/fiscal-years')).length

    await type('Gesperrt bis', '2026-12-31')
    await act(async () => {
      button('Speichern')?.click()
    })
    await settle()

    expect(before).toBe(1)
    expect(read.filter((url) => url.includes('/fiscal-years')).length).toBeGreaterThan(before)
  })

  it('savesTheLockDateTest', async () => {
    await render()

    await type('Gesperrt bis', '2026-12-31')
    await act(async () => {
      button('Speichern')?.click()
    })
    await settle()

    const put = written.find((entry) => entry.url.endsWith('/accounting/settings'))
    expect(put?.method).toBe('PUT')
    expect(put?.body).toEqual({ postingsLockedUntil: '2026-12-31' })
  })

  // --- die 30-Tage-Warnung, hier wie auf der Geschaeftsjahresmaske ------------

  /**
   * The warning stands in two places, and this is the second one.
   *
   * <p>ENTSCHEID 2 asks for it on the fiscal year screen <b>and</b> on the screen that answers
   * the state of the module. Both read the same query key, so there is one cached answer.
   */
  it('warnsThirtyDaysBeforeTheLastYearEndsTest', async () => {
    years = fiscalYears(30)
    await render()

    expect(container.textContent).toContain(EXPIRY_WARNING)
    expect(container.textContent).toContain('31.12.2026')
    expect(link('Buchhaltung → Geschäftsjahre')?.getAttribute('href')).toBe(FISCAL_YEARS_PATH)
  })

  /** One day earlier there is nothing to warn about, and the row states the fact instead. */
  it('doesNotWarnThirtyOneDaysBeforeTheLastYearEndsTest', async () => {
    years = fiscalYears(31)
    await render()

    expect(container.textContent).not.toContain(EXPIRY_WARNING)
    expect(container.textContent).toContain('Letztes Geschäftsjahr')
    expect(container.textContent).toContain('31.12.2026')
  })

  /** Once the day has passed the sentence moves into the past tense. */
  it('warnsAfterTheLastYearEndedTest', async () => {
    years = fiscalYears(-4)
    await render()

    expect(container.textContent).toContain('Das letzte Geschäftsjahr endete am')
    expect(container.textContent).toContain('Seither lässt sich nichts mehr buchen')
  })

  /** Without a single year there is nothing to warn about — and the lock date has no effect. */
  it('rendersFiscalYearSectionWithoutYearsTest', async () => {
    years = fiscalYears(null, [])
    await render()

    expect(container.textContent).not.toContain(EXPIRY_WARNING)
    expect(container.textContent).toContain(
      'Solange kein Geschäftsjahr besteht, wirkt das Datum noch nicht.',
    )
  })

  it('rendersMissingRightsHintTest', async () => {
    roles = [{ permissions: ['INVOICE_READ', 'PARTNER_READ'] }]
    await render(WITH_ROLES)

    expect(container.textContent).toContain(HINT)
    expect(link('Benutzer → Rollen')?.getAttribute('href')).toBe('/rollen')
  })

  /** Once somebody has assigned them the sentence never comes back. */
  it('hidesMissingRightsHintWhenARoleHasThemTest', async () => {
    roles = [{ permissions: ['INVOICE_READ'] }, { permissions: [ACCOUNTING_RIGHTS.post] }]
    await render(WITH_ROLES)

    expect(container.textContent).not.toContain(HINT)
    expect(container.textContent).toContain('CHF')
  })

  /**
   * Whoever may not read the roles cannot change them either, and a lock without a key only
   * produces a question. The roles are not even fetched.
   */
  it('hidesMissingRightsHintWithoutUserReadTest', async () => {
    await render(CONFIGURE)

    expect(container.textContent).not.toContain(HINT)
    expect(read.some((url) => url.endsWith('/roles'))).toBe(false)
  })
})
