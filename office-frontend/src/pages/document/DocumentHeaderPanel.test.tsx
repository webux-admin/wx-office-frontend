// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DocumentLine, SalesDocument } from '../../lib/types'
import { DocumentHeaderPanel } from './DocumentHeaderPanel'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1
const BASE = `/api/tenants/${TENANT}/orders/42`

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

const CATALOGUE_LINES = [line({ lineNumber: 1, productId: 7, description: 'Wartung' })]
const MIXED_LINES = [
  line({ lineNumber: 1, productId: 7, description: 'Wartung' }),
  line({ lineNumber: 2, description: 'Nach Aufwand' }),
]

let container: HTMLDivElement
let root: Root
let sent: { url: string; method: string; body: unknown }[]

/** Answers the two selection lists and records what the section writes. */
function stubFetch() {
  sent = []
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
  await renderWithNote(document, undefined, editable)
}

async function renderWithNote(
  document: SalesDocument,
  readOnlyNote?: string,
  editable = readOnlyNote === undefined,
): Promise<void> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <DocumentHeaderPanel
          tenantId={TENANT}
          base={BASE}
          document={document}
          editable={editable}
          readOnlyNote={readOnlyNote}
          onChanged={() => undefined}
        />
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
})
