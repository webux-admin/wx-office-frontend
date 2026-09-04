// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import { ACCOUNTING_RIGHTS, CHART_OF_ACCOUNTS_PATH } from '../lib/accounting'
import type { Account, AccountingSettings, ChartTemplate, Page } from '../lib/types'
import { ChartOfAccountsPage } from './ChartOfAccountsPage'

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

const CONFIGURE = session([ACCOUNTING_RIGHTS.read, ACCOUNTING_RIGHTS.configure])
const READ_ONLY = session([ACCOUNTING_RIGHTS.read])

const SOURCE_NOTE =
  'Kontonummern und Kontobezeichnungen nach dem Schweizer Kontenrahmen KMU, offizielle '
  + 'Schulversion, herausgegeben von veb.ch / SwissAccounting.'

/** What the backend answers where a chart already stands — the sentence names how many. */
const CHART_EXISTS =
  'Für diesen Mandanten besteht bereits ein Kontenplan mit 39 Konten. Ein Kontenplan wird '
  + 'einmal aus einer Vorlage angelegt; danach kommen Konten einzeln dazu.'

/** The one template that is shipped today. The dialog must never name another. */
const ONE_TEMPLATE: ChartTemplate = {
  code: 'OR_MINIMAL',
  name: 'Mindestgliederung nach OR',
  edition: 'OR Art. 959a/959b',
  sourceNote: 'Eigenwerk aus der gemeinfreien Gliederung nach OR Art. 959a/959b.',
  sortOrder: 20,
  accountCount: { JURISTIC: 39, SOLE_PROPRIETOR: 36, PARTNERSHIP: 40 },
}

function account(over: Partial<Account>): Account {
  return {
    id: 1,
    accountNumber: '1000',
    name: 'Kasse',
    accountType: 'ASSET',
    orPosition: 'UV_FLUESSIGE_MITTEL',
    directPostingAllowed: true,
    active: true,
    ...over,
  }
}

const ACCOUNTS: Account[] = [
  account({ id: 1, accountNumber: '1000', name: 'Kasse' }),
  account({
    id: 2,
    accountNumber: '6000',
    name: 'Raumaufwand',
    accountType: 'EXPENSE',
    orPosition: 'ER_UEBRIGER_BETRIEBSAUFWAND',
  }),
  account({
    id: 3,
    accountNumber: '9200',
    name: 'Jahresgewinn oder Jahresverlust',
    accountType: 'CLOSING',
    orPosition: 'ABSCHLUSS',
    systemKey: 'JAHRESERGEBNIS_ER',
    directPostingAllowed: false,
  }),
]

function pageOf(rows: Account[]): Page<Account> {
  return {
    content: rows,
    page: 0,
    size: 50,
    totalElements: rows.length,
    totalPages: rows.length === 0 ? 0 : 1,
    sort: 'accountNumber,asc',
  }
}

let container: HTMLDivElement
let root: Root
let accounts: Page<Account>
let settings: AccountingSettings
let templates: ChartTemplate[]
/** Set to a status where a test is about the request failing. */
let accountsStatus: number
/** Set where a test is about the copy from the template being refused; null while it works. */
let copyRefusal: string | null

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

function stubFetch() {
  vi.stubGlobal('fetch', (url: string) => {
    if (url.includes('/accounting/chart-templates')) return json(templates)
    if (url.includes('/accounting/settings')) return json(settings)
    if (url.includes('/accounting/accounts/system-keys')) return json([])
    if (url.includes('/accounting/accounts/from-template')) {
      return copyRefusal === null ? json({ created: 39 }) : json({ detail: copyRefusal }, 409)
    }
    if (url.includes('/accounting/accounts')) {
      return accountsStatus === 200
        ? json(accounts)
        : json({ detail: 'Das Backend meldet einen Fehler.' }, accountsStatus)
    }
    if (url.includes('/catalogues')) {
      return json({
        'account-type': [
          { code: 'ASSET', name: 'Aktivum' },
          { code: 'EXPENSE', name: 'Aufwand' },
          { code: 'CLOSING', name: 'Abschluss' },
        ],
        'or-position': [
          { code: 'UV_FLUESSIGE_MITTEL', name: 'Flüssige Mittel' },
          { code: 'ER_UEBRIGER_BETRIEBSAUFWAND', name: 'Übriger betrieblicher Aufwand' },
          { code: 'ABSCHLUSS', name: 'Abschluss' },
        ],
      })
    }
    return json({})
  })
}

beforeEach(() => {
  accounts = pageOf(ACCOUNTS)
  // Both layout fields, and deliberately so: `equityLayout` is the stored default and always
  // there, `suggestedEquityLayout` is what the legal form points at and the only one the
  // dialog pre-selects from (backend ADR-0112).
  settings = {
    ledgerCurrency: 'CHF',
    equityLayout: 'JURISTIC',
    suggestedEquityLayout: 'JURISTIC',
    chartSource: SOURCE_NOTE,
  }
  templates = [ONE_TEMPLATE]
  accountsStatus = 200
  copyRefusal = null
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
  for (let round = 0; round < 6; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

async function paint(auth: AuthState = CONFIGURE) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[CHART_OF_ACCOUNTS_PATH]}>
        <AuthContext.Provider value={auth}>
          <QueryClientProvider client={client}>
            <ChartOfAccountsPage />
          </QueryClientProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
  })
  return client
}

async function render(auth: AuthState = CONFIGURE) {
  const client = await paint(auth)
  await settle()
  return client
}

function button(text: string): HTMLButtonElement | undefined {
  return [...document.body.querySelectorAll('button')].find((entry) =>
    entry.textContent?.includes(text),
  ) as HTMLButtonElement | undefined
}

describe('ChartOfAccountsPage', () => {
  it('rendersAccountsTest', async () => {
    await render()

    expect(container.textContent).toContain('1000')
    expect(container.textContent).toContain('Raumaufwand')
    expect(container.textContent).toContain('Übriger betrieblicher Aufwand')
    // The rules come from the first digit of the number and carry the class heading.
    expect(container.textContent).toContain('1 Aktiven')
    expect(container.textContent).toContain('9 Abschluss')
    // The mark on 9200, and the source note that stands in the footer for good.
    expect(container.textContent).toContain('nur fürs System')
    expect(container.textContent).toContain(SOURCE_NOTE)
  })

  /** The first of the five states: nothing has arrived yet, and the table says so. */
  it('rendersLoadingTest', async () => {
    vi.stubGlobal('fetch', () => new Promise(() => {}))
    await paint()

    expect(container.textContent).toContain('Wird geladen')
  })

  /** The chart is there, the search found nothing in it. Not the fifth state. */
  it('rendersEmptyResultTest', async () => {
    await render()

    const search = container.querySelector('input') as HTMLInputElement
    accounts = pageOf([])
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set
      setter?.call(search, 'gibtesnicht')
      search.dispatchEvent(new Event('input', { bubbles: true }))
    })
    // The search field holds a term back until it has stood still, so this has to wait it out.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 260))
    })
    await settle()

    expect(container.textContent).toContain('Nichts gefunden')
    expect(container.textContent).not.toContain('Noch kein Kontenplan')
  })

  it('rendersErrorTest', async () => {
    accountsStatus = 500
    await render()

    expect(container.textContent).toContain('Das Backend meldet einen Fehler.')
  })

  /** The right says who may look; the module switch says whether there is anything to look at. */
  it('rendersForbiddenTest', async () => {
    await render(session(['PARTNER_READ']))

    expect(container.textContent).toContain('Keine Berechtigung')
    expect(container.textContent).toContain(ACCOUNTING_RIGHTS.read)
  })

  it('rendersModuleOffTest', async () => {
    await render(session([ACCOUNTING_RIGHTS.read], []))

    expect(container.textContent).toContain('Modul nicht eingeschaltet')
    expect(container.textContent).toContain('Buchhaltung')
  })

  /**
   * The fifth state. **Every word about the template is rendered**, so the screen never names
   * one that is not shipped — and the number is the one of the equity layout on the settings.
   */
  it('rendersNoChartYetTest', async () => {
    accounts = pageOf([])
    await render()

    expect(container.textContent).toContain('Noch kein Kontenplan')
    expect(container.textContent).toContain('Die Vorlage «Mindestgliederung nach OR»')
    expect(container.textContent).toContain('39 Konten')
    expect(button('Aus der Vorlage anlegen')).toBeDefined()
    expect(button('Leer beginnen')).toBeDefined()
    // No search field and no table above it: there is nothing to search yet.
    expect(container.querySelector('table')).toBeNull()
  })

  /**
   * The precaution the licence question demands: where no template is shipped, the way in
   * through a template disappears instead of pointing at something that is not there.
   */
  it('rendersNoChartYetWithoutTemplateTest', async () => {
    accounts = pageOf([])
    templates = []
    await render()

    expect(container.textContent).toContain('Noch kein Kontenplan')
    expect(button('Aus der Vorlage anlegen')).toBeUndefined()
    expect(container.textContent).not.toContain('Die Vorlage')
    expect(button('Leer beginnen')).toBeDefined()
  })

  /**
   * With exactly one template shipped the dialog offers exactly one option, and it is the one
   * the endpoint answered — not a name typed into this frontend.
   */
  it('offersOneTemplateOnlyTest', async () => {
    accounts = pageOf([])
    await render()

    await act(async () => {
      button('Aus der Vorlage anlegen')?.click()
    })
    await settle()

    const options = [...document.body.querySelectorAll('input[type="radio"]')]
    // Three for the equity question, one for the single template.
    expect(options).toHaveLength(4)
    expect(document.body.textContent).toContain('Mindestgliederung nach OR, OR Art. 959a/959b')
    expect(document.body.textContent).not.toContain('Kontenrahmen KMU (Auswahl)')
    // Pre-filled from the suggestion the backend read off the legal form.
    expect(button('Kontenplan anlegen')?.disabled).toBe(false)
  })

  /**
   * The other half of that: a legal form nobody mapped suggests nothing, and then the dialog
   * pre-selects nothing — although `equityLayout` stands in the same answer and carries a
   * value. The stored default is no answer to a question (backend ADR-0112).
   */
  it('preselectsNoLayoutWithoutASuggestionTest', async () => {
    accounts = pageOf([])
    settings = { ledgerCurrency: 'CHF', equityLayout: 'JURISTIC', chartSource: SOURCE_NOTE }
    await render()

    await act(async () => {
      button('Aus der Vorlage anlegen')?.click()
    })
    await settle()

    const chosen = [...document.body.querySelectorAll('input[name="equity-layout"]')].filter(
      (option) => (option as HTMLInputElement).checked,
    )
    expect(chosen).toHaveLength(0)
    expect(button('Kontenplan anlegen')?.disabled).toBe(true)
  })

  /** «Leer beginnen» stores nothing; it only closes the state and shows the empty chart. */
  it('startsEmptyTest', async () => {
    accounts = pageOf([])
    await render()

    await act(async () => {
      button('Leer beginnen')?.click()
    })
    await settle()

    expect(container.textContent).not.toContain('Noch kein Kontenplan')
    expect(button('Erstes Konto anlegen')).toBeDefined()
    // And no dead end: as long as there is no account, the template is still one click away.
    expect(button('Aus der Vorlage anlegen')).toBeDefined()
  })

  /**
   * The copy is refused because a second session got there first, and the sentence naming how
   * many accounts it found is what the reader gets.
   *
   * <p>Then the list behind the box catches up and the screen leaves «Noch kein Kontenplan» for
   * the table — <b>and the sentence has to survive that switch</b>. The three dialogs keep their
   * place in the tree across it; drawn inside the branch they would be remounted, and a reader
   * would be left with a box that had silently forgotten why nothing happened.
   */
  it('keepsTheRefusalWhenTheChartFillsUnderneathTest', async () => {
    accounts = pageOf([])
    copyRefusal = CHART_EXISTS
    const client = await render()

    await act(async () => {
      button('Aus der Vorlage anlegen')?.click()
    })
    await settle()
    await act(async () => {
      button('Kontenplan anlegen')?.click()
    })
    await settle()

    expect(document.body.textContent).toContain(CHART_EXISTS)

    // What the refusal said, now visible to this screen too.
    accounts = pageOf(ACCOUNTS)
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['accounts', TENANT] })
    })
    await settle()

    expect(container.textContent).toContain('Raumaufwand')
    expect(container.textContent).not.toContain('Noch kein Kontenplan')
    expect(document.body.textContent).toContain(CHART_EXISTS)
  })

  /** Reading is one right, every button another. */
  it('hidesTheButtonsWithoutConfigureTest', async () => {
    await render(READ_ONLY)

    expect(button('Konto anlegen')).toBeUndefined()
    // Checking the system accounts is a reading way and stays open.
    expect(button('Systemkonten prüfen')).toBeDefined()
  })
})
