// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../../auth/authContext'
import type { DocumentLine, SalesDocument, StockLocation } from '../../lib/types'
import { DocumentHeaderPanel } from './DocumentHeaderPanel'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1
const BASE = `/api/tenants/${TENANT}/orders/42`
const OFFER_BASE = `/api/tenants/${TENANT}/offers/42`

const LANGUAGES = [
  { id: 1, code: 'de', name: 'Deutsch', isDefault: true },
  { id: 2, code: 'fr', name: 'Français' },
]
const CURRENCIES = [
  { id: 1, code: 'CHF', name: 'Schweizer Franken', isDefault: true },
  { id: 2, code: 'EUR', name: 'Euro' },
]

/** One line, with only what the test cares about spelled out. */
function line(fields: Partial<DocumentLine> & { lineNumber: number }): DocumentLine {
  return { kind: 'ITEM', priceIncludesVat: false, lineNet: 0, lineVat: 0, lineGross: 0, ...fields }
}

function draft(lines: DocumentLine[] = CATALOGUE_LINES): SalesDocument {
  return {
    id: 42,
    documentTypeId: 1,
    category: 'ORDER',
    status: 'DRAFT',
    documentDate: '2026-08-21',
    partnerId: 3,
    language: 'de',
    currency: 'CHF',
    baseCurrency: 'CHF',
    totalNet: 1250,
    totalVat: 101.25,
    totalGross: 1351.25,
    subtotalsIncludeVat: false,
    pricesIncludeVat: false,
    lines,
  }
}

/** An offer draft: the one kind whose head carries a valid-until date. */
function offerDraft(fields: Partial<SalesDocument> = {}): SalesDocument {
  return { ...draft(), category: 'OFFER', ...fields }
}

const CATALOGUE_LINES = [line({ lineNumber: 1, productId: 7, description: 'Wartung' })]
const MIXED_LINES = [
  line({ lineNumber: 1, productId: 7, description: 'Wartung' }),
  line({ lineNumber: 2, description: 'Nach Aufwand' }),
]

let container: HTMLDivElement
let root: Root
let sent: { url: string; method: string; body: unknown }[]
/** What the inventory answers for this test; empty unless a test says otherwise. */
let locations: StockLocation[]

/** A store, with only what the panel reads spelled out. */
function store(fields: Partial<StockLocation> & { id: number }): StockLocation {
  return { code: `L${fields.id}`, name: `Lager ${fields.id}`, active: true, ...fields }
}

const TWO_STORES = [
  store({ id: 1, code: 'HAUPT', name: 'Hauptlager' }),
  store({ id: 2, code: 'AUSSEN', name: 'Aussenlager' }),
]

/** Everyone may read everything; the panel only asks about the inventory right. */
function auth(): AuthState {
  return {
    user: null,
    loading: false,
    signIn: () => Promise.reject(new Error('not in this test')),
    completeSecondFactor: () => Promise.reject(new Error('not in this test')),
    sendSecondFactorCode: () => Promise.resolve(),
    signOut: () => Promise.resolve(),
    switchTenant: () => Promise.resolve(),
    refresh: () => Promise.resolve(),
    can: () => true,
  }
}

/** Answers the two selection lists and records what the section writes. */
function stubFetch() {
  sent = []
  locations = []
  vi.stubGlobal('fetch', (url: string, options?: RequestInit) => {
    sent.push({
      url,
      method: options?.method ?? 'GET',
      body: options?.body === undefined ? undefined : JSON.parse(String(options.body)),
    })
    const body = url.includes('/languages')
      ? LANGUAGES
      : url.includes('/currencies')
        ? CURRENCIES
        : url.includes('/inventory/locations')
          ? locations
          : draft()
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
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

async function render(document: SalesDocument, editable = true): Promise<void> {
  await mount({ document, editable })
}

/** Renders the panel the way the offer mask does: with the valid-until field. */
async function renderOffer(document: SalesDocument): Promise<void> {
  await mount({ document, base: OFFER_BASE, validity: true })
}

async function renderWithNote(document: SalesDocument, readOnlyNote: string): Promise<void> {
  await mount({ document, readOnlyNote, editable: false })
}

async function mount({
  document,
  base = BASE,
  editable = true,
  validity = false,
  readOnlyNote,
}: {
  document: SalesDocument
  base?: string
  editable?: boolean
  validity?: boolean
  readOnlyNote?: string
}): Promise<void> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <AuthContext.Provider value={auth()}>
          <DocumentHeaderPanel
            tenantId={TENANT}
            base={base}
            document={document}
            editable={editable}
            validity={validity}
            readOnlyNote={readOnlyNote}
            onChanged={() => undefined}
          />
        </AuthContext.Provider>
      </QueryClientProvider>,
    )
  })
  await settle()
}

function text(): string {
  return container.textContent ?? ''
}

function byLabel<T extends HTMLElement>(label: string): T {
  const found = [...container.querySelectorAll('label')].find(
    (candidate) => candidate.textContent?.trim() === label,
  )
  const control = found?.htmlFor ? window.document.getElementById(found.htmlFor) : null
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

function apply(): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === 'Übernehmen',
  )
  if (!button) throw new Error('Kein Knopf "Übernehmen"')
  return button as HTMLButtonElement
}

function writes(): { url: string; method: string; body: unknown }[] {
  return sent.filter((call) => call.method === 'PUT')
}

describe('DocumentHeaderPanel', () => {
  it('orderHeaderSendsOnlyWhatChangedTest', async () => {
    await render(draft())

    type(byLabel<HTMLInputElement>('Belegdatum'), '2026-08-25')
    act(() => apply().click())
    await settle()

    expect(writes()[0].url).toBe(`${BASE}/header`)
    expect(writes()[0].body).toEqual({ documentDate: '2026-08-25', priceMode: 'COPY' })
  })

  it('orderHeaderSendsNothingWhileNothingChangedTest', async () => {
    await render(draft())

    expect(apply().disabled).toBe(true)
  })

  it('orderHeaderKeepsThePricesOnACurrencyChangeTest', async () => {
    await render(draft())

    choose(byLabel<HTMLSelectElement>('Währung'), 'EUR')
    act(() => apply().click())
    await settle()

    // This section never changes the customer, so no price list is asked again: the
    // amounts are converted, which the backend does whatever the mode says.
    expect(writes()[0].body).toEqual({ currencyCode: 'EUR', priceMode: 'COPY' })
  })

  it('orderHeaderSaysTheAmountsAreConvertedTest', async () => {
    await render(draft())

    choose(byLabel<HTMLSelectElement>('Währung'), 'EUR')

    expect(text()).toMatch(/wechselt von CHF auf EUR/)
    expect(text()).toMatch(/umgerechnet/)
  })

  it('orderHeaderDoesNotCallACurrencyChangeAMistakeTest', async () => {
    await render(draft())

    choose(byLabel<HTMLSelectElement>('Währung'), 'EUR')

    // A changed currency is allowed and saveable, so nothing may be marked as wrong.
    expect(byLabel<HTMLSelectElement>('Währung').getAttribute('aria-invalid')).toBeNull()
    expect(apply().disabled).toBe(false)
  })

  it('orderHeaderSaysHandWrittenLinesAreConvertedTooTest', async () => {
    await render(draft(MIXED_LINES))

    choose(byLabel<HTMLSelectElement>('Währung'), 'EUR')

    expect(text()).toMatch(/auch die von Hand geschriebenen/)
    expect(writes()).toHaveLength(0)
  })

  it('orderHeaderSaysNothingAboutTheAmountsWithoutACurrencyChangeTest', async () => {
    await render(draft(MIXED_LINES))

    type(byLabel<HTMLInputElement>('Belegdatum'), '2026-08-25')

    expect(text()).not.toMatch(/umgerechnet/)
  })

  it('orderHeaderKeepsTheLiveRegionInThePageTest', async () => {
    await render(draft())

    // A live region has to be there before its text is, or a screen reader stays silent.
    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull()
  })

  it('orderHeaderShowsTheKindOfDocumentTest', async () => {
    await render({ ...draft(), documentTypeCode: 'AUFTRAG' })

    // A draft has no number, so the kind is the only thing that says what it is.
    expect(byLabel<HTMLInputElement>('Belegart').value).toBe('AUFTRAG')
  })

  it('orderHeaderSaysWhyItIsReadOnlyWithoutThePermissionTest', async () => {
    await renderWithNote(draft(), 'Zum Ändern fehlt das Recht ORDER_WRITE.')

    expect(text()).toMatch(/fehlt das Recht ORDER_WRITE/)
    expect(text()).not.toMatch(/Ausgestellte Belege/)
  })

  it('orderHeaderIsReadOnlyOnAnIssuedDocumentTest', async () => {
    await render({ ...draft(), status: 'FINALISED' }, false)

    expect(
      [...container.querySelectorAll('button')].some(
        (button) => button.textContent?.trim() === 'Übernehmen',
      ),
    ).toBe(false)
    expect(byLabel<HTMLInputElement>('Belegdatum').disabled).toBe(true)
    expect(byLabel<HTMLSelectElement>('Währung').disabled).toBe(true)
  })

  it('offerHeaderShowsTheValidUntilFieldTest', async () => {
    await renderOffer(offerDraft({ validUntil: '2026-09-20' }))

    expect(byLabel<HTMLInputElement>('Gültig bis').value).toBe('2026-09-20')
  })

  it('orderHeaderHasNoValidUntilFieldTest', async () => {
    // The field hangs on the validity flag, not on the category: an order promises nothing
    // with an expiry, so its head must not even show the label.
    await render(draft())

    expect(() => byLabel<HTMLInputElement>('Gültig bis')).toThrow()
  })

  it('offerHeaderSendsOnlyTheValidityWhenOnlyTheDateMovedTest', async () => {
    await renderOffer(offerDraft())

    type(byLabel<HTMLInputElement>('Gültig bis'), '2026-09-30')
    act(() => apply().click())
    await settle()

    // No header write for a date-only save: the date travels through /validity alone.
    expect(writes()).toHaveLength(1)
    expect(writes()[0].url).toBe(`${OFFER_BASE}/validity`)
    expect(writes()[0].body).toEqual({ validUntil: '2026-09-30' })
  })

  it('offerHeaderClearsTheDateWithANullTest', async () => {
    await renderOffer(offerDraft({ validUntil: '2026-09-20' }))

    type(byLabel<HTMLInputElement>('Gültig bis'), '')
    act(() => apply().click())
    await settle()

    // null, not left out: in this request null is the order to clear the stored date.
    expect(writes()).toHaveLength(1)
    expect(writes()[0].url).toBe(`${OFFER_BASE}/validity`)
    expect(writes()[0].body).toEqual({ validUntil: null })
  })

  it('offerHeaderSendsTheHeaderBeforeTheValidityTest', async () => {
    await renderOffer(offerDraft())

    type(byLabel<HTMLInputElement>('Belegdatum'), '2026-08-25')
    type(byLabel<HTMLInputElement>('Gültig bis'), '2026-09-30')
    act(() => apply().click())
    await settle()

    expect(writes().map((call) => call.url)).toEqual([
      `${OFFER_BASE}/header`,
      `${OFFER_BASE}/validity`,
    ])
    expect(writes()[0].body).toEqual({ documentDate: '2026-08-25', priceMode: 'COPY' })
    expect(writes()[1].body).toEqual({ validUntil: '2026-09-30' })
  })

  it('offerHeaderSendsNothingWhileNothingChangedTest', async () => {
    await renderOffer(offerDraft({ validUntil: '2026-09-20' }))

    expect(apply().disabled).toBe(true)
  })

  it('offerHeaderSendsTheValidityFirstWhenBothDatesMoveForwardTest', async () => {
    // The backend checks the new document date against the STORED validity. Extending both
    // in one save must therefore extend the validity first, or the header write would be
    // refused against a date the same save is about to replace.
    await renderOffer(offerDraft({ validUntil: '2026-08-31' }))

    type(byLabel<HTMLInputElement>('Belegdatum'), '2026-09-15')
    type(byLabel<HTMLInputElement>('Gültig bis'), '2026-10-15')
    act(() => apply().click())
    await settle()

    expect(writes().map((call) => call.url)).toEqual([
      `${OFFER_BASE}/validity`,
      `${OFFER_BASE}/header`,
    ])
    expect(writes()[0].body).toEqual({ validUntil: '2026-10-15' })
    expect(writes()[1].body).toEqual({ documentDate: '2026-09-15', priceMode: 'COPY' })
  })
})

describe('Lagerort', () => {
  /** A draft whose kind of document books stock out — the only one that shows the field. */
  function delivering(fields: Partial<SalesDocument> = {}): SalesDocument {
    return { ...draft(), stockEffect: 'ISSUE', stockLocationName: 'Hauptlager', ...fields }
  }

  it('stockLocationFieldHiddenWithSingleLocationTest', async () => {
    // The rule of ADR-0014, read off the data: with one store there is nothing to choose.
    locations = [store({ id: 1, code: 'HAUPT', name: 'Hauptlager' })]

    await render(delivering())

    expect(() => byLabel('Lagerort')).toThrow()
  })

  it('stockLocationFieldShownWithTwoLocationsTest', async () => {
    locations = TWO_STORES

    await render(delivering())

    expect(byLabel<HTMLSelectElement>('Lagerort').value).toBe('')
  })

  it('stockLocationFieldHiddenWithoutAStockEffectTest', async () => {
    // An Offerte that books nothing has no store to choose.
    locations = TWO_STORES

    await render(draft())

    expect(() => byLabel('Lagerort')).toThrow()
  })

  it('stockLocationEmptyOptionNamesTheFallbackTest', async () => {
    // The empty value is not "no store" but "Vorgabe der Belegart" — and while the document
    // names none of its own, the name the server sent IS that fallback.
    locations = TWO_STORES

    await render(delivering())

    expect(text()).toContain('Vorgabe der Belegart (Hauptlager)')
  })

  it('stockLocationEmptyOptionWithoutAFallbackNameTest', async () => {
    // Once the document names a store, the server's name is that one — so no bracket is
    // filled in rather than a wrong one.
    locations = TWO_STORES

    await render(delivering({ stockLocationId: 2, stockLocationName: 'Aussenlager' }))

    expect(text()).toContain('Vorgabe der Belegart')
    expect(text()).not.toContain('Vorgabe der Belegart (')
  })

  it('stockLocationOnAnIssuedDocumentIsTextTest', async () => {
    locations = TWO_STORES

    await render(delivering({ status: 'FINALISED', stockLocationName: 'Aussenlager' }), false)

    expect(() => byLabel('Lagerort')).toThrow()
    expect(text()).toContain('Aussenlager')
  })

  it('stockLocationIsSentToItsOwnEndpointTest', async () => {
    locations = TWO_STORES
    await render(delivering())

    choose(byLabel<HTMLSelectElement>('Lagerort'), '2')
    act(() => apply().click())
    await settle()

    expect(writes()).toHaveLength(1)
    expect(writes()[0].url).toBe(`${BASE}/stock-location`)
    expect(writes()[0].body).toEqual({ locationId: 2 })
  })

  it('stockLocationBackToTheDocumentTypeSendsNullTest', async () => {
    locations = TWO_STORES
    await render(delivering({ stockLocationId: 2, stockLocationName: 'Aussenlager' }))

    choose(byLabel<HTMLSelectElement>('Lagerort'), '')
    act(() => apply().click())
    await settle()

    expect(writes()[0].body).toEqual({ locationId: null })
  })
})
