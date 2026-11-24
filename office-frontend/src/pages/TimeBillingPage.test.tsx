// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import type {
  DocumentSummary,
  Page,
  TimeBillingCandidate,
  TimeBillingLine,
  TimeBillingPreview,
  TimeBillingRequest,
  TimeBillingResult,
  TimeSkipReason,
} from '../lib/types'
import { TimeBillingPage } from './TimeBillingPage'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const PREVIEW_URL = '/api/tenants/1/time-tracking/billing/preview'
const BILL_URL = '/api/tenants/1/time-tracking/billing'

function candidate(overrides: Partial<TimeBillingCandidate>): TimeBillingCandidate {
  return {
    entryId: 101,
    workDate: '2026-11-03',
    userId: 1,
    userName: 'Anna Muster',
    projectId: 51,
    projectNumber: 'P-00012',
    productId: 31,
    serviceName: 'Konzeption',
    durationMinutes: 150,
    billedMinutes: 150,
    description: 'Wireframes',
    selected: true,
    ...overrides,
  }
}

/** The sketch of #127: Konzeption 2:30 and 1:10, Umsetzung 6:00; increment 15 minutes. */
const WIREFRAMES = candidate({})
const REVIEW = candidate({
  entryId: 102,
  workDate: '2026-11-05',
  durationMinutes: 70,
  billedMinutes: 75,
  description: 'Review mit Kunde',
})
const TEMPLATES = candidate({
  entryId: 103,
  workDate: '2026-11-12',
  userId: 2,
  userName: 'Beat Beispiel',
  productId: 32,
  serviceName: 'Umsetzung',
  durationMinutes: 360,
  billedMinutes: 360,
  description: 'Templates',
})
/** On the customer alone, on a day without a VAT rate: skipped. */
const SMALL_STUFF = candidate({
  entryId: 104,
  workDate: '2026-11-28',
  userId: 2,
  userName: 'Beat Beispiel',
  projectId: null,
  projectNumber: null,
  productId: 32,
  serviceName: 'Umsetzung',
  durationMinutes: 20,
  billedMinutes: 30,
  description: 'Kleinkram',
})

const DRAFT: DocumentSummary = {
  id: 42,
  documentTypeId: 1,
  category: 'INVOICE',
  status: 'DRAFT',
  documentDate: '2026-11-20',
  partnerId: 11,
  currency: 'CHF',
  totalNet: 1000,
  totalGross: 1081,
}

function session(permissions: string[], modules = ['TIMETRACKING', 'PROJECT']): AuthState {
  return {
    user: {
      userId: 1,
      username: 'anna',
      activeTenantId: 1,
      superuser: false,
      tenants: [{ id: 1, code: 'WX', name: 'Webux', isDefault: true, modules }],
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

const BILLER = ['TIME_BILL', 'INVOICE_WRITE', 'INVOICE_READ']

let container: HTMLDivElement
let root: Root
let requests: { method: string; url: string; body: unknown }[]
/** Entries another billing took: the preview no longer lists them. */
let billedElsewhere: number[]
/** What the next `POST /billing` answers instead of success, once. */
let billRefusal: { status: number; body: unknown } | null
/** What every preview with a draft as target answers instead of success. */
let targetRefusal: { status: number; body: unknown } | null
/** What every preview answers instead of success, whatever its target. */
let previewRefusal: { status: number; body: unknown } | null
let nothingOpen: boolean
/** Whether the tenant is registered for VAT, as the preview says. */
let vatLiable: boolean
/** Why the entry of 28.11. is skipped, with the sentence of the backend. */
let smallStuffSkip: { reason: TimeSkipReason; message: string }

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  )
}

/** The lines the fake backend writes: by service at 160.00, or one per entry. */
function linesOf(chosen: TimeBillingCandidate[], request: TimeBillingRequest): TimeBillingLine[] {
  const line = (entries: TimeBillingCandidate[]): TimeBillingLine => {
    const quantity = entries.reduce((sum, one) => sum + one.billedMinutes, 0) / 60
    return {
      productId: entries[0].productId ?? 0,
      serviceName: entries[0].serviceName ?? '',
      subtitle: request.grouping === 'BY_ENTRY' ? `${entries[0].workDate} · ${entries[0].description}` : null,
      note: request.grouping === 'BY_ENTRY' ? null : entries.map((one) => one.description).join('\n'),
      serviceDateFrom: entries[0].workDate,
      serviceDateTo: entries.length > 1 ? entries[entries.length - 1].workDate : null,
      quantity,
      unitPrice: 160,
      priceIncludesVat: false,
      rateOrigin: request.projectId === undefined ? 'CUSTOMER_PRICE' : 'PROJECT_RATE',
      vatRate: 8.1,
      amount: quantity * 160,
      entryIds: entries.map((one) => one.entryId),
    }
  }
  if (request.grouping === 'BY_ENTRY') return chosen.map((one) => line([one]))
  const services = [...new Set(chosen.map((one) => one.productId))]
  return services.map((service) => line(chosen.filter((one) => one.productId === service)))
}

function previewOf(request: TimeBillingRequest): TimeBillingPreview {
  const all = request.projectId === undefined ? [WIREFRAMES, REVIEW, TEMPLATES, SMALL_STUFF] : [WIREFRAMES, REVIEW, TEMPLATES]
  const open = nothingOpen ? [] : all.filter((one) => !billedElsewhere.includes(one.entryId))
  const ticked = (one: TimeBillingCandidate) =>
    request.entryIds === undefined || request.entryIds.includes(one.entryId)
  const candidates = open.map((one) => ({ ...one, selected: ticked(one) }))
  const chosen = candidates.filter((one) => one.selected && one.entryId !== SMALL_STUFF.entryId)
  const lines = linesOf(chosen, request)
  const total = lines.reduce((sum, one) => sum + one.amount, 0)
  return {
    partnerId: 11,
    customerName: 'Muster AG',
    ...(request.projectId === undefined
      ? {}
      : { projectId: 51, projectNumber: 'P-00012', projectName: 'Website' }),
    until: request.until ?? '2026-11-30',
    grouping: request.grouping ?? 'BY_SERVICE',
    documentId: request.documentId ?? null,
    currency: 'CHF',
    language: 'de',
    billingIncrementMinutes: 15,
    headerText: request.documentId === undefined ? 'Projekt P-00012 Website' : null,
    candidates,
    lines,
    skipped: candidates
      .filter((one) => one.selected && one.entryId === SMALL_STUFF.entryId)
      .map((one) => ({ entryId: one.entryId, ...smallStuffSkip })),
    totalAmount: total,
    totalNet: total,
    vatLiable,
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 30, 10, 0))
  requests = []
  billedElsewhere = []
  billRefusal = null
  targetRefusal = null
  previewRefusal = null
  nothingOpen = false
  vatLiable = true
  smallStuffSkip = {
    reason: 'NO_VAT_RATE',
    message: 'Für Umsetzung gibt es am 28.11.2026 keinen MWST-Satz.',
  }
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    requests.push({ method, url, body })
    if (method === 'POST' && url === PREVIEW_URL) {
      if (previewRefusal !== null) return json(previewRefusal.body, previewRefusal.status)
      if (body.documentId !== undefined && targetRefusal !== null) {
        return json(targetRefusal.body, targetRefusal.status)
      }
      return json(previewOf(body))
    }
    if (method === 'POST' && url === BILL_URL) {
      if (billRefusal !== null) {
        const { status, body: answer } = billRefusal
        billRefusal = null
        if (status === 409) billedElsewhere = (answer as { entryIds: number[] }).entryIds
        return json(answer, status)
      }
      const result: TimeBillingResult = {
        documentId: body.documentId ?? 77,
        newDraft: body.documentId === undefined,
        currency: 'CHF',
        totalNet: 1560,
        totalVat: 126.36,
        totalGross: 1686.36,
        lines: 2,
        billedEntryIds: [101, 102, 103],
        skipped: [],
      }
      return json(result, 201)
    }
    if (url.startsWith('/api/tenants/1/invoices?')) {
      const drafts: Page<DocumentSummary> = {
        content: [DRAFT],
        page: 0,
        size: 200,
        totalElements: 1,
        totalPages: 1,
        sort: 'documentDate,desc',
      }
      return json(drafts)
    }
    return json({ detail: 'unbekannt' }, 404)
  })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

async function settle() {
  for (let round = 0; round < 6; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

/** Where the mask led after writing, and what it handed over. */
function Landed() {
  const location = useLocation()
  return (
    <p data-testid="landed">
      {location.pathname} {JSON.stringify(location.state)}
    </p>
  )
}

async function render(
  path = '/zeiten-abrechnen/projekt/51',
  permissions = BILLER,
  state: unknown = { billing: { until: '2026-11-30', withoutProject: false } },
  modules?: string[],
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[{ pathname: path, state }]}>
        <AuthContext.Provider value={session(permissions, modules)}>
          <QueryClientProvider client={client}>
            <Routes>
              <Route
                path="/zeiten-abrechnen/projekt/:projectId"
                element={<TimeBillingPage target="PROJECT" />}
              />
              <Route
                path="/zeiten-abrechnen/kunde/:partnerId"
                element={<TimeBillingPage target="CUSTOMER" />}
              />
              <Route path="/rechnungen/:id" element={<Landed />} />
            </Routes>
          </QueryClientProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
  })
  await settle()
}

const text = () => container.textContent ?? ''
const previews = () => requests.filter((request) => request.url === PREVIEW_URL)
const lastPreview = () => previews().at(-1)?.body
const bills = () => requests.filter((request) => request.url === BILL_URL)

function button(label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find(
    (entry) => entry.textContent?.trim() === label,
  )
  if (found === undefined) throw new Error(`no button ${label}`)
  return found
}

function control(label: string): HTMLInputElement & HTMLSelectElement {
  const caption = [...container.querySelectorAll('label')].find(
    (entry) => entry.textContent?.trim() === label,
  )
  const found = caption ? document.getElementById(caption.htmlFor) : null
  if (found === null) throw new Error(`no field labelled ${label}`)
  return found as HTMLInputElement & HTMLSelectElement
}

/** The box of one entry, named by what its row says. */
function box(starts: string): HTMLInputElement {
  const caption = [...container.querySelectorAll('label')].find((entry) =>
    entry.textContent?.startsWith(starts),
  )
  const found = caption ? document.getElementById(caption.htmlFor) : null
  if (found === null) throw new Error(`no box ${starts}`)
  return found as HTMLInputElement
}

async function click(element: Element) {
  await act(async () => {
    ;(element as HTMLElement).click()
  })
  await settle()
}

async function choose(select: HTMLSelectElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(select, value)
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await settle()
}

/** The lines of the preview, as their text. */
function lineRows(): string[] {
  const tables = [...container.querySelectorAll('table')]
  const lines = tables.find((table) => table.querySelector('thead')?.textContent?.includes('Menge'))
  return [...(lines?.querySelectorAll('tbody tr') ?? [])].map((row) => row.textContent ?? '')
}

describe('TimeBillingPage', () => {
  /** The sketch of #127: two lines at the project rate, 1’560.00 net. */
  it('timeBillingPageShowsThePreviewTest', async () => {
    await render()

    expect(lastPreview()).toEqual({ projectId: 51, until: '2026-11-30', grouping: 'BY_SERVICE' })
    expect(container.querySelector('h1')?.textContent).toBe('Zeiten abrechnen')
    expect(text()).toContain('Muster AG · P-00012 Website')
    expect(text()).toContain('Abrechnungstakt 15 Min.: jeder Eintrag wird aufgerundet, 1:10 wird 1:15.')
    expect(text()).toContain('Kopftext der Rechnung: Projekt P-00012 Website')
    expect(lineRows()).toHaveLength(2)
    expect(lineRows()[0]).toContain('Konzeption')
    expect(lineRows()[0]).toContain('03.11.2026 – 05.11.2026')
    expect(lineRows()[0]).toContain('3.75 Std.')
    expect(lineRows()[0]).toContain('Projektsatz')
    expect(lineRows()[0]).toContain('600.00')
    expect(lineRows()[1]).toContain('960.00')
    expect(text()).toContain('Total netto1’560.00 CHF')
  })

  /** Every open entry is ticked; the duration says what the increment makes of it. */
  it('timeBillingPageTicksEveryOpenEntryTest', async () => {
    await render()

    expect(box('03.11.2026 · Anna Muster').checked).toBe(true)
    expect(box('05.11.2026 · Anna Muster').checked).toBe(true)
    expect(box('12.11.2026 · Beat Beispiel').checked).toBe(true)
    expect(text()).toContain('1:10→ 1:15')
  })

  /** Unticking asks the preview anew with the entries left; the mask adds nothing up. */
  it('timeBillingPageAsksAgainWhenAnEntryIsUntickedTest', async () => {
    await render()

    await click(box('12.11.2026 · Beat Beispiel'))

    expect(lastPreview()).toEqual({
      projectId: 51,
      until: '2026-11-30',
      entryIds: [101, 102],
      grouping: 'BY_SERVICE',
    })
    expect(lineRows()).toHaveLength(1)
    expect(text()).toContain('Total netto600.00 CHF')
  })

  /** Ticking it again means «all» again, so the question goes without a list. */
  it('timeBillingPageTicksAllAgainTest', async () => {
    await render()
    await click(box('12.11.2026 · Beat Beispiel'))

    await click(box('12.11.2026 · Beat Beispiel'))

    expect(lastPreview()).toEqual({ projectId: 51, until: '2026-11-30', grouping: 'BY_SERVICE' })
  })

  /** Nothing ticked: no line, and nothing to write. */
  it('timeBillingPageWithNothingTickedTest', async () => {
    await render()

    await click(box('Alle auf dieser Seite markieren'))

    expect(lastPreview()).toMatchObject({ entryIds: [] })
    expect(text()).toContain('Keine Position')
    expect(button('Rechnungsentwurf erstellen').disabled).toBe(true)
  })

  it('timeBillingPageAsksAgainForAnotherGroupingTest', async () => {
    await render()
    const byEntry = [...container.querySelectorAll('fieldset label')].find(
      (entry) => entry.textContent === 'je Eintrag',
    )

    await click(byEntry?.querySelector('input') ?? container)

    expect(lastPreview()).toMatchObject({ grouping: 'BY_ENTRY' })
    expect(lineRows()).toHaveLength(3)
  })

  /** A later day lists other entries, so every one is ticked again. */
  it('timeBillingPageAsksAgainForAnotherDayTest', async () => {
    await render()
    await click(box('12.11.2026 · Beat Beispiel'))

    await act(async () => {
      const field = control('Stichtag')
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(field, '2026-12-15')
      field.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await settle()

    expect(lastPreview()).toEqual({ projectId: 51, until: '2026-12-15', grouping: 'BY_SERVICE' })
  })

  /** The drafts of the customer of the project are the other targets. */
  it('timeBillingPageOffersTheDraftsOfTheCustomerTest', async () => {
    await render()

    const target = control('Ziel')
    expect([...target.options].map((option) => option.textContent)).toEqual([
      'Neue Rechnung',
      'Entwurf vom 20.11.2026 · 1’081.00 CHF',
    ])
    expect(requests.some((request) => request.url.startsWith('/api/tenants/1/invoices?status=DRAFT&partnerId=11'))).toBe(true)

    await choose(target, '42')

    expect(lastPreview()).toMatchObject({ documentId: 42 })
    expect(text()).not.toContain('Kopftext der Rechnung')
    expect(text()).toContain('Neue Positionen netto1’560.00 CHF')
    expect(button('In den Entwurf übernehmen')).toBeDefined()
  })

  /** Without INVOICE_READ the drafts cannot be listed: a new invoice is the only target. */
  it('timeBillingPageWithoutTheInvoiceListTest', async () => {
    await render('/zeiten-abrechnen/projekt/51', ['TIME_BILL', 'INVOICE_WRITE'])

    expect([...control('Ziel').options].map((option) => option.textContent)).toEqual(['Neue Rechnung'])
    expect(requests.some((request) => request.url.startsWith('/api/tenants/1/invoices'))).toBe(false)
  })

  /** Writing sends the question on screen again and leads to the draft, with the way back. */
  it('timeBillingPageWritesTheDraftAndLeadsToItTest', async () => {
    await render('/zeiten-abrechnen/projekt/51', BILLER, {
      origin: { from: '/projekte/51', label: 'P-00012 Website' },
      billing: { until: '2026-11-30', withoutProject: false },
    })
    await click(box('12.11.2026 · Beat Beispiel'))

    await click(button('Rechnungsentwurf erstellen'))

    expect(bills()).toHaveLength(1)
    expect(bills()[0].body).toEqual(lastPreview())
    expect(container.querySelector('[data-testid="landed"]')?.textContent).toBe(
      '/rechnungen/77 {"origin":{"from":"/projekte/51","label":"P-00012 Website"}}',
    )
  })

  /** Another billing was quicker: the mask reads anew and names what it took. */
  it('timeBillingPageNamesEntriesBilledMeanwhileTest', async () => {
    await render()
    billRefusal = {
      status: 409,
      body: {
        detail: 'Der Eintrag 102 wurde inzwischen abgerechnet. Neu laden; die übrigen lassen sich danach abrechnen.',
        entryIds: [102],
      },
    }
    const asked = previews().length

    await click(button('Rechnungsentwurf erstellen'))

    expect(previews().length).toBeGreaterThan(asked)
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      'Inzwischen abgerechnet: 05.11.2026 · Anna Muster · Konzeption · 1:10.',
    )
    expect(text()).not.toContain('Der Eintrag 102 wurde inzwischen abgerechnet')
    expect(() => box('05.11.2026 · Anna Muster')).toThrow()
    expect(container.querySelector('[data-testid="landed"]')).toBeNull()
  })

  /** A 409 that names no entry: the draft was issued meanwhile. Its sentence stands. */
  it('timeBillingPageShowsAConflictWithoutEntriesTest', async () => {
    await render()
    billRefusal = {
      status: 409,
      body: { detail: 'Der Entwurf wurde inzwischen ausgestellt. Neu laden und ein anderes Ziel wählen.', entryIds: [] },
    }
    const listed = requests.filter((request) => request.url.startsWith('/api/tenants/1/invoices')).length

    await click(button('Rechnungsentwurf erstellen'))

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Der Entwurf wurde inzwischen ausgestellt.',
    )
    expect(requests.filter((request) => request.url.startsWith('/api/tenants/1/invoices')).length).toBeGreaterThan(
      listed,
    )
  })

  /** A target the backend refuses says so at the field «Ziel». */
  it('timeBillingPageShowsARefusedTargetAtTheFieldTest', async () => {
    targetRefusal = {
      status: 400,
      body: {
        detail: 'Der Entwurf lautet auf EUR, die Zeiten auf CHF.',
        errors: [{ field: 'documentId', message: 'Der Entwurf lautet auf EUR, die Zeiten auf CHF.' }],
      },
    }
    await render()

    await choose(control('Ziel'), '42')

    expect(control('Ziel').getAttribute('aria-invalid')).toBe('true')
    expect(text()).toContain('Der Entwurf lautet auf EUR, die Zeiten auf CHF.')
    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(button('In den Entwurf übernehmen').disabled).toBe(true)
  })

  /** The row «ohne Projekt» of the worklist ticks only the time on the customer alone. */
  it('timeBillingPageTicksOnlyTheTimeWithoutProjectTest', async () => {
    await render('/zeiten-abrechnen/kunde/11', BILLER, {
      billing: { until: '2026-11-30', withoutProject: true },
    })

    expect(previews()[0].body).toEqual({ partnerId: 11, until: '2026-11-30', grouping: 'BY_SERVICE' })
    expect(lastPreview()).toMatchObject({ entryIds: [104] })
    expect(box('28.11.2026 · Beat Beispiel').checked).toBe(true)
    expect(box('03.11.2026 · Anna Muster').checked).toBe(false)
    expect(container.querySelector('thead')?.textContent).toContain('Projekt')
  })

  /** A skipped entry is named with its reason, and stays open. */
  it('timeBillingPageSaysWhatIsSkippedTest', async () => {
    await render('/zeiten-abrechnen/kunde/11')

    const skipped = container.querySelector('ul[aria-label="Übersprungene Einträge"]')
    expect(skipped?.textContent).toContain('28.11.2026 · Beat Beispiel · Umsetzung · 0:20')
    expect(skipped?.textContent).toContain('kein MWST-Satz')
    expect(skipped?.textContent).toContain('Für Umsetzung gibt es am 28.11.2026 keinen MWST-Satz.')
    expect(lineRows()[0]).toContain('Kundenpreis')
  })

  /** An entry from before the VAT liability began is skipped with its own reason. */
  it('timeBillingPageSaysWhatIsSkippedBeforeTheTaxLiabilityTest', async () => {
    smallStuffSkip = {
      reason: 'TAX_LIABILITY_STARTS',
      message: 'Am 28.11.2026 war der Mandant noch nicht steuerpflichtig.',
    }

    await render('/zeiten-abrechnen/kunde/11')

    const skipped = container.querySelector('ul[aria-label="Übersprungene Einträge"]')
    expect(skipped?.textContent).toContain('vor der Steuerpflicht')
    expect(skipped?.textContent).toContain('Am 28.11.2026 war der Mandant noch nicht steuerpflichtig.')
  })

  /** With VAT liability every line names its rate. */
  it('timeBillingPageShowsTheVatRateTest', async () => {
    await render()

    const heads = [...container.querySelectorAll('thead')].map((head) => head.textContent ?? '')
    expect(heads.some((head) => head.includes('Menge') && head.includes('MWST'))).toBe(true)
    expect(lineRows()[0]).toContain('8.1 %')
    expect(text()).toContain('Total netto')
  })

  /** Without VAT liability the draft charges none: no rate per line, and no «netto». */
  it('timeBillingPageWithoutVatLiabilityTest', async () => {
    vatLiable = false

    await render()

    const heads = [...container.querySelectorAll('thead')].map((head) => head.textContent ?? '')
    expect(heads.some((head) => head.includes('Menge') && head.includes('MWST'))).toBe(false)
    expect(lineRows()[0]).not.toContain('8.1 %')
    expect(text()).toContain('Total1’560.00 CHF')
    expect(text()).not.toContain('netto')
  })

  /** A refusal that names no field — the unit «Stunde» missing — stands above the mask. */
  it('timeBillingPageShowsARefusalWithoutAFieldTest', async () => {
    previewRefusal = {
      status: 400,
      body: {
        detail:
          'Für diesen Mandanten gibt es die Einheit «Stunde» (Code HOUR) nicht oder nicht mehr aktiv.',
      },
    }

    await render()

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Für diesen Mandanten gibt es die Einheit «Stunde» (Code HOUR) nicht oder nicht mehr aktiv.',
    )
    expect(text()).toContain('Keine Vorschau')
    expect(button('Rechnungsentwurf erstellen').disabled).toBe(true)
  })

  /** The same refusal when writing stands above the mask as well. */
  it('timeBillingPageShowsAWritingRefusalWithoutAFieldTest', async () => {
    await render()
    billRefusal = {
      status: 400,
      body: { detail: 'Für diesen Mandanten gibt es die Einheit «Stunde» (Code HOUR) nicht.' },
    }

    await click(button('Rechnungsentwurf erstellen'))

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Für diesen Mandanten gibt es die Einheit «Stunde» (Code HOUR) nicht.',
    )
    expect(container.querySelector('[data-testid="landed"]')).toBeNull()
  })

  it('timeBillingPageWithNothingOpenTest', async () => {
    nothingOpen = true

    await render()

    expect(text()).toContain('Nichts offen')
    expect(button('Rechnungsentwurf erstellen').disabled).toBe(true)
  })

  /** The preview is TIME_BILL alone; writing needs INVOICE_WRITE beside it. */
  it('timeBillingPageWithoutTheInvoiceRightTest', async () => {
    await render('/zeiten-abrechnen/projekt/51', ['TIME_BILL'])

    expect(lineRows()).toHaveLength(2)
    expect(text()).toContain('Zum Erstellen des Rechnungsentwurfs fehlt das Recht INVOICE_WRITE.')
    expect(() => button('Rechnungsentwurf erstellen')).toThrow()
  })

  it('timeBillingPageWithoutTheBillRightTest', async () => {
    await render('/zeiten-abrechnen/projekt/51', ['TIME_READ', 'INVOICE_WRITE'])

    expect(text()).toContain('Keine Berechtigung')
    expect(requests).toEqual([])
  })

  it('timeBillingPageWithTheModuleOffTest', async () => {
    await render('/zeiten-abrechnen/projekt/51', BILLER, undefined, ['PROJECT'])

    expect(text()).toContain('Modul nicht eingeschaltet')
    expect(requests).toEqual([])
  })

  /** Opened without a day, the mask asks up to today. */
  it('timeBillingPageWithoutAHandOverTest', async () => {
    await render('/zeiten-abrechnen/projekt/51', BILLER, null)

    expect(lastPreview()).toMatchObject({ until: '2026-11-30' })
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/zeiten-abrechnen')
  })

  it('timeBillingPageWithAnAddressThatNamesNothingTest', async () => {
    await render('/zeiten-abrechnen/projekt/abc')

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Diese Adresse nennt kein Projekt und keinen Kunden.',
    )
    expect(requests).toEqual([])
  })
})
