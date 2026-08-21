// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DocumentLine, SalesDocument } from '../../lib/types'
import { ChangePartnerDialog } from './ChangePartnerDialog'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1
const BASE = `/api/tenants/${TENANT}/orders/42`

/** Two customers: one invoiced in the currency of the document, one in another. */
const PARTNERS = {
  content: [
    { id: 3, partnerNumber: 'K-0003', partnerType: 'ORGANISATION', name: 'Muster AG', currency: 'CHF' },
    { id: 4, partnerNumber: 'K-0004', partnerType: 'ORGANISATION', name: 'Beispiel GmbH', currency: 'EUR' },
  ],
  page: 0,
  size: 200,
  totalElements: 2,
  totalPages: 1,
  sort: '',
}

/** One line, with only what the test cares about spelled out. */
function line(fields: Partial<DocumentLine> & { lineNumber: number }): DocumentLine {
  return { kind: 'ITEM', priceIncludesVat: false, lineNet: 0, lineVat: 0, lineGross: 0, ...fields }
}

function draft(lines: DocumentLine[]): SalesDocument {
  return {
    id: 42,
    documentTypeId: 1,
    category: 'ORDER',
    status: 'DRAFT',
    documentDate: '2026-08-21',
    partnerId: 3,
    currency: 'CHF',
    baseCurrency: 'CHF',
    totalNet: 1250,
    totalVat: 101.25,
    totalGross: 1351.25,
    lines,
  }
}

const CATALOGUE_LINES = [line({ lineNumber: 1, productId: 7, description: 'Wartung' })]
const MIXED_LINES = [
  line({ lineNumber: 1, productId: 7, description: 'Wartung' }),
  line({ lineNumber: 2, description: 'Nach Aufwand' }),
  line({ lineNumber: 3, kind: 'COMMENT', description: 'Hinweis' }),
  line({ lineNumber: 4, description: 'Anfahrt' }),
]

let container: HTMLDivElement
let root: Root
let sent: { url: string; method: string; body: unknown }[]

/** Answers the partner list and records what the dialog writes. */
function stubFetch() {
  sent = []
  vi.stubGlobal('fetch', (url: string, options?: RequestInit) => {
    sent.push({
      url,
      method: options?.method ?? 'GET',
      body: options?.body === undefined ? undefined : JSON.parse(String(options.body)),
    })
    const body = url.includes('/partners') ? PARTNERS : draft(CATALOGUE_LINES)
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

async function render(lines: DocumentLine[]): Promise<{ changed: SalesDocument[] }> {
  const changed: SalesDocument[] = []
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <ChangePartnerDialog
          tenantId={TENANT}
          base={BASE}
          open
          onClose={() => undefined}
          document={draft(lines)}
          onChanged={(answer) => changed.push(answer)}
        />
      </QueryClientProvider>,
    )
  })
  await settle()
  return { changed }
}

function text(): string {
  return document.body.textContent ?? ''
}

/** The control belonging to a caption, found the way a person finds it: by its label. */
function byLabel<T extends HTMLElement>(label: string): T {
  const found = [...document.querySelectorAll('label')].find(
    (candidate) => candidate.textContent?.trim() === label,
  )
  const control = found?.htmlFor ? document.getElementById(found.htmlFor) : null
  if (!control) throw new Error(`Kein Feld mit der Beschriftung "${label}"`)
  return control as T
}

/** Picks a value the way a browser does: set the value, then fire the native event. */
function choose(control: HTMLSelectElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
  setValue?.call(control, value)
  act(() => {
    control.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

/** Flips a checkbox the way a browser does: the click toggles it and fires the event. */
function toggle(control: HTMLInputElement) {
  act(() => control.click())
}

/** Types into a field the way a browser does: set the value, then fire the native event. */
function type(control: HTMLInputElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setValue?.call(control, value)
  act(() => {
    control.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

/** Whether a field with that caption is on screen at all. */
function has(label: string): boolean {
  return [...document.querySelectorAll('label')].some(
    (candidate) => candidate.textContent?.trim() === label,
  )
}

function press(label: string) {
  const button = [...document.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === label,
  )
  if (!button) throw new Error(`Kein Knopf mit der Beschriftung "${label}"`)
  act(() => button.click())
}

function priceOptions(): HTMLOptionElement[] {
  return [...byLabel<HTMLSelectElement>('Preise').options]
}

/** The button with that caption, so its state can be read as well as pressed. */
function button(label: string): HTMLButtonElement {
  const found = [...document.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === label,
  )
  if (!found) throw new Error(`Kein Knopf mit der Beschriftung "${label}"`)
  return found as HTMLButtonElement
}

describe('ChangePartnerDialog', () => {
  it('changePartnerRepricesByDefaultTest', async () => {
    await render(CATALOGUE_LINES)
    choose(byLabel<HTMLSelectElement>('Kunde'), '3')

    press('Wechseln')
    await settle()

    const put = sent.find((call) => call.method === 'PUT')
    expect(put?.url).toBe(`${BASE}/header`)
    expect(put?.body).toEqual({ partnerId: 3, priceMode: 'RECALCULATE' })
  })

  it('changePartnerKeepsTheAmountsWhenAskedTest', async () => {
    await render(CATALOGUE_LINES)
    choose(byLabel<HTMLSelectElement>('Kunde'), '3')

    choose(byLabel<HTMLSelectElement>('Preise'), 'COPY')
    press('Wechseln')
    await settle()

    expect(sent.find((call) => call.method === 'PUT')?.body).toEqual({
      partnerId: 3,
      priceMode: 'COPY',
    })
  })

  it('changePartnerHandsTheAnsweredDocumentBackTest', async () => {
    const { changed } = await render(CATALOGUE_LINES)
    choose(byLabel<HTMLSelectElement>('Kunde'), '3')

    press('Wechseln')
    await settle()

    expect(changed).toHaveLength(1)
    expect(changed[0].id).toBe(42)
  })

  it('changePartnerSendsNothingWithoutACustomerTest', async () => {
    await render(CATALOGUE_LINES)

    press('Wechseln')
    await settle()

    expect(sent.some((call) => call.method === 'PUT')).toBe(false)
  })

  it('changePartnerAsksForTheRateInAnotherCurrencyTest', async () => {
    await render(CATALOGUE_LINES)

    choose(byLabel<HTMLSelectElement>('Kunde'), '4')

    // A document in a foreign currency needs a rate, so it is asked for here and not
    // answered with a refusal after the fact.
    expect(has('Umrechnungskurs')).toBe(true)
    expect(button('Wechseln').disabled).toBe(true)
  })

  it('changePartnerSendsNothingWithoutARateTest', async () => {
    await render(CATALOGUE_LINES)
    choose(byLabel<HTMLSelectElement>('Kunde'), '4')

    press('Wechseln')
    await settle()

    expect(sent.some((call) => call.method === 'PUT')).toBe(false)
  })

  it('changePartnerTakesTheCurrencyOfTheNewCustomerTest', async () => {
    await render(CATALOGUE_LINES)
    choose(byLabel<HTMLSelectElement>('Kunde'), '4')
    type(byLabel<HTMLInputElement>('Umrechnungskurs'), '0.94')

    press('Wechseln')
    await settle()

    expect(sent.find((call) => call.method === 'PUT')?.body).toEqual({
      partnerId: 4,
      currencyCode: 'EUR',
      exchangeRate: 0.94,
      priceMode: 'RECALCULATE',
    })
  })

  it('changePartnerKeepsAmountsInAnotherCurrencyTest', async () => {
    await render(CATALOGUE_LINES)
    choose(byLabel<HTMLSelectElement>('Kunde'), '4')
    type(byLabel<HTMLInputElement>('Umrechnungskurs'), '0.94')

    // Keeping the amounts is a choice even in another currency: they are converted, not
    // relabelled, so nothing about them is invented.
    expect(priceOptions().find((option) => option.value === 'COPY')?.disabled).toBe(false)
    choose(byLabel<HTMLSelectElement>('Preise'), 'COPY')
    press('Wechseln')
    await settle()

    expect(sent.find((call) => call.method === 'PUT')?.body).toEqual({
      partnerId: 4,
      currencyCode: 'EUR',
      exchangeRate: 0.94,
      priceMode: 'COPY',
    })
  })

  it('changePartnerLetsTheDocumentStayInItsCurrencyTest', async () => {
    await render(CATALOGUE_LINES)
    choose(byLabel<HTMLSelectElement>('Kunde'), '4')

    toggle(byLabel<HTMLInputElement>('Beleg in EUR führen'))

    // The document stays in francs, so there is nothing to convert and no rate to ask for.
    expect(has('Umrechnungskurs')).toBe(false)
    expect(button('Wechseln').disabled).toBe(false)
  })

  it('changePartnerForgetsTheChoiceOnAnotherCustomerTest', async () => {
    await render(CATALOGUE_LINES)
    choose(byLabel<HTMLSelectElement>('Kunde'), '4')
    toggle(byLabel<HTMLInputElement>('Beleg in EUR führen'))
    choose(byLabel<HTMLSelectElement>('Preise'), 'COPY')

    choose(byLabel<HTMLSelectElement>('Kunde'), '3')
    choose(byLabel<HTMLSelectElement>('Kunde'), '4')

    // What was decided for one customer says nothing about the next.
    expect(byLabel<HTMLInputElement>('Beleg in EUR führen').checked).toBe(true)
    expect(byLabel<HTMLSelectElement>('Preise').value).toBe('RECALCULATE')
  })

  it('changePartnerNamesTheHandWrittenLinesTest', async () => {
    await render(MIXED_LINES)

    choose(byLabel<HTMLSelectElement>('Kunde'), '3')

    // Before anything is sent: these are the lines a re-pricing cannot answer for.
    expect(text()).toMatch(/Die Positionen 2 und 4 sind von Hand geschrieben/)
    expect(sent.some((call) => call.method === 'PUT')).toBe(false)
  })

  it('changePartnerWarnsAboutNoLinesWhileTheAmountsAreKeptTest', async () => {
    await render(MIXED_LINES)
    choose(byLabel<HTMLSelectElement>('Kunde'), '3')

    choose(byLabel<HTMLSelectElement>('Preise'), 'COPY')

    expect(text()).not.toMatch(/von Hand geschrieben/)
  })

  it('changePartnerWithoutHandWrittenLinesSaysNothingTest', async () => {
    await render(CATALOGUE_LINES)

    choose(byLabel<HTMLSelectElement>('Kunde'), '3')

    expect(text()).not.toMatch(/von Hand geschrieben/)
  })
})
