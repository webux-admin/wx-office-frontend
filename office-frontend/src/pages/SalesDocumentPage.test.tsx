// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import { OFFER_KIND, ORDER_KIND } from '../lib/salesDocument'
import type {
  DocumentChainEntry,
  OfferOutcome,
  OfferTracking,
  SalesDocument,
  StockReversalLine,
} from '../lib/types'
import { SalesDocumentPage } from './SalesDocumentPage'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1
const OFFER_BASE = `/api/tenants/${TENANT}/offers/42`

/** A session that may work on offers and write orders, which is all the mask asks of it. */
const PERMISSIONS = [
  'OFFER_READ',
  'OFFER_WRITE',
  'OFFER_FINALISE',
  'ORDER_READ',
  'ORDER_WRITE',
  // The stock sentences hang on these three: issuing books, reopening books back, the Storno
  // books back through its counter document.
  'ORDER_FINALISE',
  'ORDER_REOPEN',
  'ORDER_CANCEL',
]

const SESSION: AuthState = {
  user: {
    userId: 1,
    username: 'muster',
    activeTenantId: TENANT,
    superuser: false,
    tenants: [],
    permissions: PERMISSIONS,
  },
  loading: false,
  signIn: () => Promise.reject(new Error('nicht gebraucht')),
  signOut: () => Promise.resolve(),
  switchTenant: () => Promise.resolve(),
  can: (permission: string) => PERMISSIONS.includes(permission),
}

const CATALOGUES = {
  'document-status': [
    { code: 'DRAFT', name: 'Entwurf' },
    { code: 'FINALISED', name: 'Finalisiert' },
    { code: 'CANCELLED', name: 'Storniert' },
  ],
  'offer-outcome': [
    { code: 'OPEN', name: 'Offen' },
    { code: 'ACCEPTED', name: 'Angenommen' },
    { code: 'DECLINED', name: 'Abgelehnt' },
    // Display only: never stored as an outcome, worn by an open offer past its day.
    { code: 'EXPIRED', name: 'Abgelaufen' },
  ],
  'offer-decline-reason': [
    { code: 'PRICE', name: 'Preis' },
    { code: 'COMPETITOR', name: 'Konkurrenz' },
  ],
}

/** An issued document of the given category, with one charged line. */
function issued(category: 'OFFER' | 'ORDER'): SalesDocument {
  return {
    id: 42,
    documentTypeId: 1,
    category,
    status: 'FINALISED',
    documentNumber: category === 'OFFER' ? 'OF-2026-0001' : 'AU-2026-0001',
    documentDate: '2026-08-01',
    finalisedAt: '2026-08-01T10:00:00Z',
    partnerId: 3,
    recipient: { name: 'Muster AG' },
    currency: 'CHF',
    totalNet: 1000,
    totalVat: 81,
    totalGross: 1081,
    subtotalsIncludeVat: false,
    pricesIncludeVat: false,
    lines: [
      {
        lineNumber: 1,
        kind: 'ITEM',
        description: 'Wartung',
        quantity: 1,
        unitPrice: 1000,
        priceIncludesVat: false,
        lineNet: 1000,
        lineVat: 81,
        lineGross: 1081,
      },
    ],
  }
}

/** What the order endpoint answers; a test that cares about stock sets its own. */
let orderState: SalesDocument | null = null

/** What the reopen preview answers. */
let reversalState: StockReversalLine[] = []

let container: HTMLDivElement
let root: Root
/** Every request the mask sent, in order. */
let sent: { url: string; method: string; body: unknown }[]
/** The follow-up state the stub holds, rewritten by the outcome endpoint like the backend. */
let trackingState: OfferTracking

/** The chain the mask reads; a test that cares about it sets its own. */
let chainState: DocumentChainEntry[]

/** The document itself, which every chain carries. */
const SELF_ENTRY: DocumentChainEntry = {
  id: 42,
  documentTypeCode: 'OF',
  documentTypeName: 'Offerte',
  category: 'OFFER',
  status: 'FINALISED',
  documentNumber: 'OF-2026-0042',
  documentDate: '2026-08-20',
  currencyCode: 'CHF',
  totalGross: 100,
  relation: 'SELF',
  distance: 0,
}

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

function stubFetch() {
  sent = []
  trackingState = { outcome: 'OPEN', expired: false }
  chainState = [SELF_ENTRY]
  orderState = null
  reversalState = []
  vi.stubGlobal('fetch', (url: string, options?: RequestInit) => {
    const method = options?.method ?? 'GET'
    const body = options?.body === undefined ? undefined : JSON.parse(String(options.body))
    sent.push({ url, method, body })

    if (url.endsWith('/tracking/outcome') && method === 'PUT') {
      const asked = body as { outcome: OfferOutcome; reasonCode?: string; note?: string }
      // Only an open offer can be expired, so a mark clears the flag the way the backend
      // computes it; taking the mark back leaves the calendar where it was.
      trackingState =
        asked.outcome === 'OPEN'
          ? { outcome: 'OPEN', expired: trackingState.expired }
          : {
              outcome: asked.outcome,
              expired: false,
              outcomeAt: '2026-08-23T10:00:00Z',
              outcomeBy: 'muster',
              winProbability: asked.outcome === 'ACCEPTED' ? 100 : 0,
              declinedReasonCode: asked.reasonCode,
              declinedNote: asked.note,
            }
      return json(trackingState)
    }
    if (url.endsWith('/tracking')) return json(trackingState)
    if (url.includes('/reminders')) return json([])
    if (url.includes('/status-trail')) return json([])
    if (url.includes('/related')) return json(chainState)
    if (url.includes('/printouts') || url.includes('/printers')) return json([])
    if (url.includes('/catalogues')) return json(CATALOGUES)
    if (url.includes('/stock-reversal')) return json(reversalState)
    if (url.includes('/finalise')) return json(orderState ?? issued('ORDER'))
    if (url.includes('/offers/42')) return json(issued('OFFER'))
    if (url.includes('/orders/42')) return json(orderState ?? issued('ORDER'))
    return json([])
  })
}

beforeEach(() => {
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

async function render(path: string, state?: unknown): Promise<void> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <MemoryRouter
        initialEntries={[state === undefined ? path : { pathname: path, state }]}
      >
        <AuthContext.Provider value={SESSION}>
          <QueryClientProvider client={client}>
            <Routes>
              <Route path="/offerten/:id" element={<SalesDocumentPage kind={OFFER_KIND} />} />
              <Route path="/auftraege/:id" element={<SalesDocumentPage kind={ORDER_KIND} />} />
            </Routes>
          </QueryClientProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
  })
  await settle()
}

function text(): string {
  return document.body.textContent ?? ''
}

function buttonNamed(label: string): HTMLButtonElement {
  const found = [...document.querySelectorAll('button')].find(
    (button) => button.textContent?.trim() === label,
  )
  if (found === undefined) throw new Error(`no button named ${label}`)
  return found as HTMLButtonElement
}

async function press(label: string) {
  await act(async () => {
    buttonNamed(label).dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await settle()
}

function byLabel<T extends HTMLElement>(label: string): T {
  const found = [...document.querySelectorAll('label')].find(
    (candidate) => candidate.textContent?.trim() === label,
  )
  const control = found?.htmlFor ? document.getElementById(found.htmlFor) : null
  if (!control) throw new Error(`Kein Feld mit der Beschriftung "${label}"`)
  return control as T
}

/** Types into a field the way a browser does: set the value, then fire the native event. */
function type(control: HTMLInputElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setValue?.call(control, value)
  act(() => {
    control.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function choose(control: HTMLSelectElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
  setValue?.call(control, value)
  act(() => {
    control.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

function outcomeWrites(): { url: string; method: string; body: unknown }[] {
  return sent.filter(
    (call) => call.method === 'PUT' && call.url === `${OFFER_BASE}/tracking/outcome`,
  )
}

describe('SalesDocumentPage', () => {
  it('salesDocumentPageMarksAnOfferAcceptedWithOneClickTest', async () => {
    await render('/offerten/42')
    expect(text()).toContain('Offen')

    await press('Angenommen')

    expect(outcomeWrites()).toHaveLength(1)
    expect(outcomeWrites()[0].body).toEqual({ outcome: 'ACCEPTED' })
    // The mask reads the state again and shows the answer: the badge wears the outcome, the
    // one-click buttons give way to undoing the mark and writing the order.
    expect(text()).toContain('Angenommen')
    expect(buttonNamed('Markierung aufheben')).toBeDefined()
    expect(buttonNamed('Auftrag erstellen…')).toBeDefined()
    expect(() => buttonNamed('Angenommen')).toThrow()
  })

  it('salesDocumentPageDeclinesAnOfferWithReasonAndNoteTest', async () => {
    await render('/offerten/42')

    await press('Abgelehnt')
    choose(byLabel<HTMLSelectElement>('Grund'), 'PRICE')
    type(byLabel<HTMLInputElement>('Notiz'), 'Preis zu hoch')
    await press('Als abgelehnt markieren')

    expect(outcomeWrites()).toHaveLength(1)
    expect(outcomeWrites()[0].body).toEqual({
      outcome: 'DECLINED',
      reasonCode: 'PRICE',
      note: 'Preis zu hoch',
    })
    expect(text()).toContain('Abgelehnt')
    expect(buttonNamed('Markierung aufheben')).toBeDefined()
  })

  it('salesDocumentPageShowsTheFollowUpRegisterForOffersTest', async () => {
    await render('/offerten/42')

    expect(document.querySelector('[role="tablist"]')).not.toBeNull()
    expect(text()).toContain('Nachfassen')
  })

  it('salesDocumentPageShowsNoFollowUpRegisterOnTheOrderMaskTest', async () => {
    await render('/auftraege/42')

    // The chain register is there for every kind; only the follow-up belongs to the offer.
    expect(document.querySelector('[role="tablist"]')).not.toBeNull()
    expect(text()).toContain('Zusammenhänge')
    expect(text()).not.toContain('Nachfassen')
    // The order mask never asks for a follow-up state that does not exist for it.
    expect(sent.some((call) => call.url.includes('/orders/42/tracking'))).toBe(false)
  })

  it('salesDocumentPageOpensTheFollowUpRegisterFromTheLinkStateTest', async () => {
    await render('/offerten/42', { tab: 'nachfassen' })

    expect(text()).toContain('Verfolgung')
    expect(text()).toContain('Erinnerungen')
    expect(text()).toContain('Gewinnwahrscheinlichkeit')
  })

  it('salesDocumentPageSwitchesToTheFollowUpRegisterTest', async () => {
    await render('/offerten/42')
    expect(text()).not.toContain('Verfolgung')

    await press('Nachfassen')

    expect(text()).toContain('Verfolgung')
    expect(text()).toContain('Erinnerungen')
  })

  it('salesDocumentPageShowsAnExpiredOpenOfferAsExpiredTest', async () => {
    trackingState = { outcome: 'OPEN', expired: true }

    await render('/offerten/42')

    // The badge wears «Abgelaufen» instead of «Offen» — the flag comes from the server,
    // the browser never compares dates itself.
    expect(text()).toContain('Abgelaufen')
    expect(text()).not.toContain('Offen')
    // Expired is information, not a lock: the offer can still be answered.
    expect(buttonNamed('Angenommen')).toBeDefined()
    expect(buttonNamed('Abgelehnt')).toBeDefined()
  })

  it('salesDocumentPageShowsAnAcceptedOfferAsAcceptedEvenWhenExpiredTest', async () => {
    // The backend never claims this pair, but the mark has to win in the mask regardless.
    trackingState = {
      outcome: 'ACCEPTED',
      expired: true,
      outcomeAt: '2026-08-23T10:00:00Z',
      outcomeBy: 'muster',
      winProbability: 100,
    }

    await render('/offerten/42')

    expect(text()).toContain('Angenommen')
    expect(text()).not.toContain('Abgelaufen')
  })

  /** The one fact the mask hid until now: that somebody already wrote on from this offer. */
  it('salesDocumentPageWarnsAboutASuccessorTest', async () => {
    chainState = [
      SELF_ENTRY,
      {
        ...SELF_ENTRY,
        id: 43,
        documentTypeCode: 'AU',
        documentTypeName: 'Auftrag',
        category: 'ORDER',
        documentNumber: 'AU-2026-0007',
        relation: 'SUCCESSOR',
        distance: 1,
      },
    ]

    await render('/offerten/42')

    expect(text()).toContain('Aus diesem Beleg wurde AU-2026-0007 geschrieben.')
  })

  it('salesDocumentPageSaysNothingWithoutASuccessorTest', async () => {
    await render('/offerten/42')

    expect(text()).not.toContain('Aus diesem Beleg')
  })

  it('salesDocumentPageShowsTheChainRegisterTest', async () => {
    chainState = [
      SELF_ENTRY,
      {
        ...SELF_ENTRY,
        id: 43,
        documentTypeName: 'Auftrag',
        category: 'ORDER',
        documentNumber: 'AU-2026-0007',
        relation: 'SUCCESSOR',
        distance: 1,
      },
    ]

    await render('/offerten/42')
    await press('Zusammenhänge')

    expect(text()).toContain('Nachfolgebeleg')
    expect(text()).toContain('AU-2026-0007')
  })

  // --- what the mask says about stock (ADR-0064 of the backend) --------------

  it('salesDocumentPageNamesTheStockEffectOfIssuingTest', async () => {
    orderState = {
      ...issued('ORDER'),
      status: 'DRAFT',
      documentNumber: undefined,
      finalisedAt: undefined,
      stockEffect: 'ISSUE',
      stockLocationName: 'Hauptlager',
    }

    await render('/auftraege/42')

    expect(text()).toContain('Ausstellen bucht den Bestand im Hauptlager ab.')
  })

  it('salesDocumentPageSaysNothingAboutStockWithoutAnEffectTest', async () => {
    // The invisible rule is the biggest mistake such a mask can make; a permanent hint with
    // no content is the second biggest.
    orderState = {
      ...issued('ORDER'),
      status: 'DRAFT',
      documentNumber: undefined,
      finalisedAt: undefined,
    }

    await render('/auftraege/42')

    expect(text()).not.toContain('bucht den Bestand')
  })

  it('salesDocumentPageShowsTheStockConflictOfIssuingTest', async () => {
    orderState = {
      ...issued('ORDER'),
      status: 'DRAFT',
      documentNumber: undefined,
      finalisedAt: undefined,
      stockEffect: 'ISSUE',
      stockLocationName: 'Hauptlager',
    }
    await render('/auftraege/42')
    // The location blocks a stock below zero, so the backend refuses with 409 and the plain
    // sentence in `detail`. No new error path in the mask reads it.
    vi.stubGlobal('fetch', (url: string, options?: RequestInit) => {
      const method = options?.method ?? 'GET'
      sent.push({ url, method, body: undefined })
      if (url.includes('/finalise')) {
        return json({ detail: 'Hauptlager: 2 verfügbar, 5 gebucht' }, 409)
      }
      return json(orderState)
    })

    await press('Ausstellen')

    expect(text()).toContain('Hauptlager: 2 verfügbar, 5 gebucht')
  })

  it('salesDocumentPageShowsWhatComesBackWhenReopeningTest', async () => {
    orderState = { ...issued('ORDER'), stockEffect: 'ISSUE', stockLocationName: 'Hauptlager' }
    reversalState = [
      {
        productNumber: 'P-100',
        productName: 'Schraube M4',
        quantity: 12,
        unitShortName: 'Stk',
        locationName: 'Hauptlager',
      },
    ]
    await render('/auftraege/42')

    await press('Zurückstellen')

    // Numbers, not a general warning: quantity, unit, product and location.
    expect(text()).toContain('12 Stk P-100 Schraube M4')
    expect(text()).toContain('Hauptlager')
    expect(text()).toContain('mehr Bestand, als im Regal liegt')
  })

  it('salesDocumentPageSaysTheStornoBooksStockBackTest', async () => {
    orderState = { ...issued('ORDER'), stockEffect: 'ISSUE', stockLocationName: 'Hauptlager' }
    await render('/auftraege/42')

    await press('Stornieren')

    expect(text()).toContain('Der Storno bucht den Bestand zurück')
  })
})
