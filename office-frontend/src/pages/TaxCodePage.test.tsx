// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import { ACCOUNTING_RIGHTS, CHART_OF_ACCOUNTS_PATH, TAX_CODES_PATH } from '../lib/accounting'
import type { TaxCode, TaxCodeCatalogue, TaxDirection, TaxKind } from '../lib/types'
import { TaxCodePage } from './TaxCodePage'

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

const READER = session([ACCOUNTING_RIGHTS.read])

/** What the three tax accounts of the shipped chart are called. */
const ACCOUNT_NAMES: Record<string, string> = {
  '2200': 'Umsatzsteuer (MWST)',
  '1170': 'Vorsteuer MWST auf Material, Waren, Dienstleistungen und Energie',
  '1171': 'Vorsteuer MWST auf Investitionen und übrigem Betriebsaufwand',
}

/** One row of the seeded catalogue, in the order of the migration. */
type Seed = [
  code: string,
  name: string,
  direction: TaxDirection,
  kind: TaxKind,
  rate: number,
  account: string | null,
  digit: string | null,
  validFrom: string,
  validTo: string | null,
]

/**
 * The catalogue as `V101__accounting_tax_codes.sql` ships it: 27 codes, output before input,
 * current rates before the old ones, the two fallback codes last.
 */
const SEEDS: Seed[] = [
  ['UST81', 'Umsatzsteuer 8.1 %', 'OUTPUT', 'NORMAL', 8.1, '2200', '303', '2024-01-01', null],
  ['UST26', 'Umsatzsteuer 2.6 %', 'OUTPUT', 'NORMAL', 2.6, '2200', '313', '2024-01-01', null],
  ['UST38', 'Umsatzsteuer Beherbergung 3.8 %', 'OUTPUT', 'NORMAL', 3.8, '2200', '343', '2024-01-01', null],
  ['USTEX', 'Von der Steuer befreit (MWSTG Art. 23)', 'OUTPUT', 'NORMAL', 0, null, '220', '2010-01-01', null],
  ['USTAL', 'Leistung im Ausland', 'OUTPUT', 'NORMAL', 0, null, '221', '2010-01-01', null],
  ['USTAN', 'Von der Steuer ausgenommen (MWSTG Art. 21)', 'OUTPUT', 'NORMAL', 0, null, '230', '2010-01-01', null],
  ['USTERH81', 'Entgeltserhöhung 8.1 % (MWSTG Art. 24 Abs. 1)', 'OUTPUT', 'INCREASE', 8.1, '2200', '303', '2024-01-01', null],
  ['USTMIN81', 'Entgeltsminderung 8.1 %', 'OUTPUT', 'REDUCTION', 8.1, '2200', '235', '2024-01-01', null],
  ['USTMIN26', 'Entgeltsminderung 2.6 %', 'OUTPUT', 'REDUCTION', 2.6, '2200', '235', '2024-01-01', null],
  ['USTMIN38', 'Entgeltsminderung Beherbergung 3.8 %', 'OUTPUT', 'REDUCTION', 3.8, '2200', '235', '2024-01-01', null],
  ['UST77', 'Umsatzsteuer 7.7 %', 'OUTPUT', 'NORMAL', 7.7, '2200', '302', '2018-01-01', '2023-12-31'],
  ['UST25', 'Umsatzsteuer 2.5 %', 'OUTPUT', 'NORMAL', 2.5, '2200', '312', '2018-01-01', '2023-12-31'],
  ['UST37', 'Umsatzsteuer Beherbergung 3.7 %', 'OUTPUT', 'NORMAL', 3.7, '2200', '342', '2018-01-01', '2023-12-31'],
  ['USTMIN77', 'Entgeltsminderung 7.7 %', 'OUTPUT', 'REDUCTION', 7.7, '2200', '235', '2018-01-01', '2023-12-31'],
  ['USTMIN25', 'Entgeltsminderung 2.5 %', 'OUTPUT', 'REDUCTION', 2.5, '2200', '235', '2018-01-01', '2023-12-31'],
  ['USTMIN37', 'Entgeltsminderung Beherbergung 3.7 %', 'OUTPUT', 'REDUCTION', 3.7, '2200', '235', '2018-01-01', '2023-12-31'],
  ['VSM81', 'Vorsteuer Material, Waren, DL, Energie 8.1 %', 'INPUT', 'NORMAL', 8.1, '1170', '400', '2024-01-01', null],
  ['VSM26', 'Vorsteuer Material, Waren, DL, Energie 2.6 %', 'INPUT', 'NORMAL', 2.6, '1170', '400', '2024-01-01', null],
  ['VSI81', 'Vorsteuer Investitionen, übriger Betriebsaufwand 8.1 %', 'INPUT', 'NORMAL', 8.1, '1171', '405', '2024-01-01', null],
  ['VSI26', 'Vorsteuer Investitionen, übriger Betriebsaufwand 2.6 %', 'INPUT', 'NORMAL', 2.6, '1171', '405', '2024-01-01', null],
  ['VSI38', 'Vorsteuer Beherbergung 3.8 %', 'INPUT', 'NORMAL', 3.8, '1171', '405', '2024-01-01', null],
  ['VSMMIN81', 'Vorsteuerminderung Material 8.1 %', 'INPUT', 'REDUCTION', 8.1, '1170', '400', '2024-01-01', null],
  ['VSIMIN81', 'Vorsteuerminderung Investitionen 8.1 %', 'INPUT', 'REDUCTION', 8.1, '1171', '405', '2024-01-01', null],
  ['VSM77', 'Vorsteuer Material 7.7 %', 'INPUT', 'NORMAL', 7.7, '1170', '400', '2018-01-01', '2023-12-31'],
  ['VSI77', 'Vorsteuer Investitionen 7.7 %', 'INPUT', 'NORMAL', 7.7, '1171', '405', '2018-01-01', '2023-12-31'],
  ['UNKLAR', 'Steuer ohne passenden Code - Klärfall', 'OUTPUT', 'NORMAL', 0, '2200', null, '2010-01-01', null],
  ['UNKLAR_VS', 'Vorsteuer ohne passenden Code - Klärfall', 'INPUT', 'NORMAL', 0, '1171', null, '2010-01-01', null],
]

const CODES: TaxCode[] = SEEDS.map(
  ([code, name, direction, kind, rate, account, digit, validFrom, validTo], index) => ({
    id: index + 41,
    code,
    name,
    direction,
    kind,
    rate,
    taxAccountNumber: account,
    taxAccountName: account === null ? null : ACCOUNT_NAMES[account],
    estvDigit: digit,
    inTurnoverTotal: direction === 'OUTPUT' && kind !== 'REDUCTION',
    validFrom,
    validTo,
    active: true,
    sortOrder: (index + 1) * 10,
  }),
)

/** How many of the shipped codes may no longer be booked on — the ones up to 2023. */
const EXPIRED = SEEDS.filter(([, , , , , , , , validTo]) => validTo !== null).length

let container: HTMLDivElement
let root: Root
let catalogue: TaxCodeCatalogue
/** Set to a status where a test is about the request failing. */
let status: number

function json(body: unknown, code = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: code,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

beforeEach(() => {
  catalogue = { codes: CODES, emptyReason: null }
  status = 200
  vi.stubGlobal('fetch', () =>
    status === 200
      ? json(catalogue)
      : json({ detail: 'Das Backend meldet einen Fehler.' }, status),
  )
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

async function paint(auth: AuthState = READER) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[TAX_CODES_PATH]}>
        <AuthContext.Provider value={auth}>
          <QueryClientProvider client={client}>
            <TaxCodePage />
          </QueryClientProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
  })
}

async function render(auth: AuthState = READER) {
  await paint(auth)
  await settle()
}

function rows(): Element[] {
  return [...container.querySelectorAll('tbody tr')]
}

describe('TaxCodePage', () => {
  /**
   * The whole catalogue in one piece: it is unpaged, and the order is the one the backend
   * declares — output before input, current rates before the old ones, the fallback last.
   */
  it('taxCodePageRendersTheCatalogueTest', async () => {
    await render()

    expect(rows()).toHaveLength(27)
    expect(rows()[0].textContent).toContain('UST81')
    expect(rows()[0].textContent).toContain('8.1 %')
    expect(rows()[26].textContent).toContain('UNKLAR_VS')
    // The account arrives as number and name, so no second request is needed for the name.
    expect(rows()[0].textContent).toContain('2200')
    expect(rows()[0].textContent).toContain('Umsatzsteuer (MWST)')
    expect(rows()[0].textContent).toContain('01.01.2024')

    // A rate of zero is «—» and never «0 %»: nothing to tax and a rate of nothing are two
    // statements, and on the fallback code it means «the rate comes from the entry line».
    const exempt = rows().find((row) => row.textContent?.includes('USTEX'))
    expect(exempt?.textContent).toContain('—')
    expect(container.textContent).not.toContain('0 %')

    // Eight codes ran out at the end of 2023 and stay in the list with their badge: an invoice
    // from 2023 written off in 2026 is corrected at 7.7 %.
    expect(container.querySelectorAll('[title^="gültig bis"]')).toHaveLength(EXPIRED)
    const old = rows().find((row) => row.textContent?.includes('UST77'))
    expect(old?.textContent).toContain('Abgelaufen')
    expect(rows()[0].textContent).not.toContain('Abgelaufen')
  })

  /**
   * The first of the four named empty states. Not an empty table: whoever finds no tax code
   * has to learn from the screen whether something is missing or whether nothing is owed.
   */
  it('taxCodePageSaysWhyItIsEmptyForAnExemptTenantTest', async () => {
    catalogue = { codes: [], emptyReason: 'NOT_VAT_LIABLE' }
    await render()

    expect(container.textContent).toContain('Nicht mehrwertsteuerpflichtig')
    expect(container.textContent).toContain('Es werden keine Steuercodes geführt')
    expect(container.querySelector('table')).toBeNull()
    // Nothing to do here, so nothing that points at the chart of accounts either.
    expect(container.querySelector('a')).toBeNull()
  })

  /** The only empty state with a way out: the codes are copied along with the chart. */
  it('taxCodePageSaysWhyItIsEmptyWithoutAChartTest', async () => {
    catalogue = { codes: [], emptyReason: 'NO_CHART' }
    await render()

    expect(container.textContent).toContain('Es gibt noch keinen Kontenplan.')
    expect(container.textContent).toContain('Die Steuercodes entstehen zusammen mit ihm.')
    expect(container.querySelector('table')).toBeNull()

    const link = container.querySelector('a')
    expect(link?.textContent).toContain('Zum Kontenplan')
    expect(link?.getAttribute('href')).toBe(CHART_OF_ACCOUNTS_PATH)
  })

  /** A method this application refuses on purpose says so, rather than showing nothing. */
  it('taxCodePageSaysWhyItIsEmptyForASaldoTenantTest', async () => {
    catalogue = { codes: [], emptyReason: 'SALDO' }
    await render()

    expect(container.textContent).toContain('Saldosteuersatzmethode (MWSTG Art. 37)')
    expect(container.textContent).toContain('kennt keinen Vorsteuerteil')
    expect(container.querySelector('table')).toBeNull()
  })

  /** There is a chart, it was typed by hand, and that is why there are no codes. */
  it('taxCodePageSaysWhyItIsEmptyWithoutACopyTest', async () => {
    catalogue = { codes: [], emptyReason: 'NOT_COPIED' }
    await render()

    expect(container.textContent).toContain('ohne Vorlage entstanden')
    expect(container.querySelector('table')).toBeNull()
    // Not the chart state: there is one, so nothing points at it.
    expect(container.textContent).not.toContain('Es gibt noch keinen Kontenplan.')
  })

  it('taxCodePageShowsAnErrorTest', async () => {
    status = 500
    await render()

    expect(container.textContent).toContain('Das Backend meldet einen Fehler.')
    // No empty table underneath, and no empty state that would blame the tenant for it.
    expect(container.querySelector('table')).toBeNull()
    expect(container.textContent).not.toContain('Keine Steuercodes')
  })

  it('taxCodePageShowsLoadingTest', async () => {
    vi.stubGlobal('fetch', () => new Promise(() => {}))
    await paint()

    expect(container.textContent).toContain('Wird geladen')
  })

  /** The right says who may look; the module switch says whether there is anything to look at. */
  it('taxCodePageShowsForbiddenTest', async () => {
    await render(session(['PARTNER_READ']))

    expect(container.textContent).toContain('Keine Berechtigung')
    expect(container.textContent).toContain(ACCOUNTING_RIGHTS.read)
  })

  it('taxCodePageShowsModuleOffTest', async () => {
    await render(session([ACCOUNTING_RIGHTS.read], []))

    expect(container.textContent).toContain('Modul nicht eingeschaltet')
    expect(container.textContent).toContain('Buchhaltung')
  })
})
