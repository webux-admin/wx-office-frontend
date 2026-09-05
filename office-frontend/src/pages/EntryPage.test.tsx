// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import {
  ACCOUNTING_RIGHTS,
  emptyEntryDraft,
  entryDraftKey,
  readEntryDraft,
  type EntryDraftState,
} from '../lib/accounting'
import { toIsoDate } from '../lib/format'
import type {
  Account,
  EntryTemplate,
  EntryTemplateLine,
  FiscalYearList,
  Page,
} from '../lib/types'
import { EntryPage } from './EntryPage'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1

/** The key the mask rescues under, with the prefix `preferences.ts` puts in front of it. */
const STORE_KEY = `webux.${entryDraftKey(TENANT)}`

/** How long the mask waits before it writes — {@code useDebouncedValue(draft, 400)}. */
const DEBOUNCE = 400

const AUTH: AuthState = {
  user: {
    userId: 1,
    username: 'muster',
    activeTenantId: TENANT,
    superuser: false,
    tenants: [
      { id: TENANT, code: 'WX', name: 'Webux', isDefault: true, modules: ['ACCOUNTING'] },
    ],
    permissions: [ACCOUNTING_RIGHTS.read, ACCOUNTING_RIGHTS.write],
  },
  loading: false,
  signIn: () => Promise.reject(new Error('nicht gebraucht')),
  completeSecondFactor: () => Promise.reject(new Error('nicht gebraucht')),
  sendSecondFactorCode: () => Promise.resolve(),
  adoptSession: () => {},
  signOut: () => Promise.resolve(),
  switchTenant: () => Promise.resolve(),
  refresh: () => Promise.resolve(),
  can: (permission: string) =>
    permission === ACCOUNTING_RIGHTS.read || permission === ACCOUNTING_RIGHTS.write,
}

const CHART: Account[] = [
  {
    id: 1,
    accountNumber: '1020',
    name: 'Bankguthaben',
    accountType: 'ASSET',
    orPosition: 'UV_FLUESSIGE_MITTEL',
    directPostingAllowed: true,
    active: true,
  },
  {
    id: 4,
    accountNumber: '6000',
    name: 'Raumaufwand',
    accountType: 'EXPENSE',
    orPosition: 'ER_UEBRIGER_BETRIEBSAUFWAND',
    directPostingAllowed: true,
    active: true,
  },
]

function pageOf(rows: Account[]): Page<Account> {
  return {
    content: rows,
    page: 0,
    size: 200,
    totalElements: rows.length,
    totalPages: 1,
    sort: 'accountNumber,asc',
  }
}

/** Wide enough that today always falls into it, whenever the suite happens to run. */
const YEARS: FiscalYearList = {
  years: [
    {
      id: 3,
      label: 'laufend',
      numberYear: 2026,
      startDate: '2000-01-01',
      endDate: '2099-12-31',
      status: 'OPEN',
      deletable: false,
      editable: false,
      spansAFullCalendarYear: true,
      postedEntries: 0,
    },
  ],
  boundary: { postableFrom: null, lockedUntil: null, source: 'NONE', message: '' },
  expiry: { lastEndDate: '2099-12-31', daysLeft: 9999, warn: false },
}

function line(over: Partial<EntryTemplateLine> = {}): EntryTemplateLine {
  return {
    accountId: 4,
    accountNumber: '6000',
    accountName: 'Raumaufwand',
    side: 'DEBIT',
    amount: 3200,
    taxCodeId: null,
    taxCode: null,
    text: null,
    postable: true,
    ...over,
  }
}

/**
 * One template that carries an entry text and **no** voucher — the case the mask has to be
 * honest about: applying it empties the voucher field.
 */
const TEMPLATES: EntryTemplate[] = [
  {
    id: 300,
    name: 'Miete Geschäftslokal',
    description: 'jeden Monatsletzten',
    entryDescription: 'Miete September',
    documentReference: null,
    carriesAmounts: false,
    sortOrder: 0,
    version: 3,
    lines: [line({ amount: null }), line({ accountId: 1, accountNumber: '1020',
      accountName: 'Bankguthaben', side: 'CREDIT', amount: null })],
    problems: [],
  },
]

let container: HTMLDivElement
let root: Root

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

/** The chart the screen reads; emptied to reach the first empty state. */
let chart: typeof CHART

/** The fiscal years the screen reads; emptied to reach the second empty state. */
let years: typeof YEARS

function stubFetch() {
  vi.stubGlobal('fetch', (url: string) => {
    if (url.includes('/accounting/accounts')) return json(pageOf(chart))
    if (url.includes('/accounting/tax-codes')) return json({ codes: [] })
    if (url.includes('/accounting/fiscal-years')) return json(years)
    if (url.includes('/accounting/settings')) return json({ ledgerCurrency: 'CHF' })
    if (url.includes('/accounting/entry-templates')) return json(TEMPLATES)
    if (url.includes('/accounting/entries/suggestions')) return json([])
    return json({})
  })
}

beforeEach(() => {
  window.sessionStorage.clear()
  chart = CHART
  years = YEARS
  stubFetch()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  window.sessionStorage.clear()
  vi.unstubAllGlobals()
})

async function paint() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <AuthContext.Provider value={AUTH}>
        <QueryClientProvider client={client}>
          <MemoryRouter>
            <EntryPage />
          </MemoryRouter>
        </QueryClientProvider>
      </AuthContext.Provider>,
    )
  })
  await settle()
}

async function settle() {
  for (let round = 0; round < 3; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
  }
}

/** Waits past the rescue debounce, so what the mask keeps has actually been written. */
async function waitForTheRescue() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, DEBOUNCE + 120))
  })
}

function field(label: string): HTMLInputElement {
  const found = [...container.querySelectorAll('label')].find(
    (candidate) => candidate.textContent === label,
  )
  const input = found === undefined ? null : document.getElementById(found.htmlFor)
  if (input === null) throw new Error(`Feld «${label}» fehlt`)
  return input as HTMLInputElement
}

function type(element: HTMLElement, value: string) {
  const input = element as HTMLInputElement
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )?.set
    setter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function button(text: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find(
    (entry) => entry.textContent === text,
  ) as HTMLButtonElement | undefined
}

/** Puts a state into the rescue store, the way a tab that was typing in leaves it behind. */
function rescue(over: Partial<EntryDraftState>) {
  const state: EntryDraftState = {
    ...emptyEntryDraft(toIsoDate()),
    description: 'Miete September',
    documentReference: 'MB-100',
    savedAt: new Date().toISOString(),
    ...over,
  }
  window.sessionStorage.setItem(STORE_KEY, JSON.stringify(state))
}

describe('EntryPage', () => {
  /**
   * <b>Both empty states lead into the setup wizard, and it stands first.</b> The wizard has no
   * menu entry, so a route without these buttons would be a delivered screen nobody finds — and
   * whoever lands here has nothing at all yet.
   */
  it('entryEmptyStateLeadsToTheSetupTest', async () => {
    chart = []
    await paint()

    expect(container.textContent).toContain('Es gibt noch keinen Kontenplan')
    expect(button('Buchhaltung einrichten')).toBeDefined()
    expect(button('Kontenplan anlegen')).toBeDefined()
  })

  /** And the other one, for the day nobody has laid out a fiscal year. */
  it('entryEmptyStateWithoutAFiscalYearLeadsToTheSetupTest', async () => {
    years = { ...YEARS, years: [] }
    await paint()

    expect(container.textContent).toContain('gibt es kein Geschäftsjahr')
    expect(button('Buchhaltung einrichten')).toBeDefined()
    expect(button('Geschäftsjahr anlegen')).toBeDefined()
  })


  /**
   * Applying a template replaces the entry text and the voucher too, so it has to ask before it
   * does — even where no row is filled yet. Counting rows alone let somebody who had typed a
   * reference and a booking text lose both without ever seeing the question.
   */
  it('applyTemplateAsksBeforeItReplacesTheHeaderTest', async () => {
    await paint()

    type(field('Beleg'), 'MB-144')
    type(field('Text'), 'Mietzins Oktober')
    await act(async () => {
      button('Vorlage anwenden')?.click()
    })

    expect(container.textContent).toContain(
      'Der getippte Text und der getippte Beleg werden ersetzt.',
    )
    // Nothing has been replaced yet: the question stands in front of the change.
    expect(field('Beleg').value).toBe('MB-144')
    expect(field('Text').value).toBe('Mietzins Oktober')

    await act(async () => {
      button('Ersetzen')?.click()
    })

    // And after the yes it is what the template says — the voucher it carries none of is empty.
    expect(field('Text').value).toBe('Miete September')
    expect(field('Beleg').value).toBe('')
  })

  /** An untouched mask has nothing to lose: the template goes in without a question. */
  it('applyTemplateWithoutAnythingTypedTest', async () => {
    await paint()

    await act(async () => {
      button('Vorlage anwenden')?.click()
    })

    expect(container.textContent).not.toContain('werden ersetzt')
    expect(field('Text').value).toBe('Miete September')
  })

  /**
   * What is typed while the banner is still standing is rescued too. Suppressing every write
   * until the banner is answered meant an F5 in that state brought the **older** offer back and
   * lost everything typed under it.
   */
  it('rescuesWhatIsTypedWhileTheBannerStandsTest', async () => {
    rescue({})
    await paint()

    expect(container.textContent).toContain('Sie hatten hier etwas angefangen')

    type(field('Beleg'), 'MB-999')
    await waitForTheRescue()

    expect(readEntryDraft(TENANT)?.documentReference).toBe('MB-999')
  })

  /**
   * «Weiterschreiben» fills the mask and drops the banner in one tick, while the debounced state
   * still holds the empty mask of 400 ms ago. Deciding on that one threw the store away, and a
   * reload inside the next 400 ms lost the draft outright.
   */
  it('keepsTheRescuedDraftOnCarryingOnTest', async () => {
    rescue({ description: 'Miete September', documentReference: 'MB-100' })
    await paint()

    await act(async () => {
      button('Weiterschreiben')?.click()
    })

    // Straight away, in the window a reload would fall into.
    expect(window.sessionStorage.getItem(STORE_KEY)).not.toBeNull()
    expect(readEntryDraft(TENANT)?.documentReference).toBe('MB-100')
    expect(field('Beleg').value).toBe('MB-100')

    // And still after the debounce has caught up, now with a fresh stamp.
    await waitForTheRescue()
    expect(readEntryDraft(TENANT)?.documentReference).toBe('MB-100')
  })

  /** «Verwerfen» is the one press that empties the store, and it still does. */
  it('discardsTheRescuedDraftTest', async () => {
    rescue({})
    await paint()

    await act(async () => {
      button('Verwerfen')?.click()
    })
    await waitForTheRescue()

    expect(window.sessionStorage.getItem(STORE_KEY)).toBeNull()
    expect(container.textContent).not.toContain('Sie hatten hier etwas angefangen')
  })

  /**
   * A state the shipped version before this one wrote carries no stamp. The banner said
   * «zuletzt -.» over it — a broken screen at the moment somebody decides whether to trust what
   * is offered back.
   */
  it('bannerWithoutAStampTest', async () => {
    const state = {
      ...emptyEntryDraft(toIsoDate()),
      description: 'Miete September',
      documentReference: 'MB-100',
    }
    window.sessionStorage.setItem(STORE_KEY, JSON.stringify(state))

    await paint()

    expect(container.textContent).toContain('Sie hatten hier etwas angefangen.')
    expect(container.textContent).not.toContain('zuletzt -')
  })

  /** With a stamp the banner names the moment, as it always did. */
  it('bannerWithAStampTest', async () => {
    rescue({ savedAt: '2026-09-09T14:12:00.000Z' })

    await paint()

    expect(container.textContent).toContain('Sie hatten hier etwas angefangen — zuletzt ')
    expect(container.textContent).not.toContain('zuletzt -')
  })
})
