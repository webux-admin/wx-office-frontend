// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { salesDocumentFor } from '../../lib/salesDocument'
import type { OpenItem, Payment } from '../../lib/types'
import type { OverpaymentAdvice } from '../../lib/receivable'
import { DocumentReceivablePanel } from './DocumentReceivablePanel'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1
const DOCUMENT = 11


function openItem(over: Partial<OpenItem> = {}): OpenItem {
  return {
    documentId: DOCUMENT,
    documentNumber: 'RE-2026-0011',
    documentDate: '2026-01-05',
    dueDate: '2026-02-04',
    partnerId: 1,
    partnerNumber: 'K-1',
    partnerName: 'Meier AG',
    currency: 'CHF',
    totalGross: 1297.2,
    settled: 0,
    open: 1297.2,
    overdue: false,
    daysOverdue: 0,
    ...over,
  }
}

function advice(over: Partial<OverpaymentAdvice> = {}): OverpaymentAdvice {
  return {
    zone: 'KEEP_PROPOSED',
    difference: 0.4,
    currency: 'CHF',
    openAmount: 1297.2,
    keepAllowed: true,
    noteRequired: false,
    keepLimit: 1,
    keepMaximum: 5,
    ...over,
  }
}

let container: HTMLDivElement
let root: Root
let item: OpenItem
let payments: Payment[]
let given: OverpaymentAdvice

function json(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

function stubFetch() {
  vi.stubGlobal('fetch', (url: string) => {
    if (url.includes('/overpayment-advice')) return json(given)
    if (url.includes('/open-item')) return json(item)
    if (url.includes('/payments')) return json(payments)
    return json([])
  })
}

beforeEach(() => {
  item = openItem()
  payments = []
  given = advice()
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

/**
 * Lets the queries and the debounce settle.
 *
 * <p>One wait past the 200 ms debounce, then a few empty ticks for the answer to land — not
 * eight quarter-second rounds, which would put every test past the default timeout.
 */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 250))
  })
  for (let round = 0; round < 4; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

/**
 * The panel takes the two rights as props rather than reading them itself, so the tests do
 * the same instead of building a session around them.
 */
async function render(mayRecord = true, mayWriteOff = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const kind = salesDocumentFor('INVOICE')!
  await act(async () => {
    root.render(
      <MemoryRouter>
        <QueryClientProvider client={client}>
          <DocumentReceivablePanel
            kind={kind}
            tenantId={TENANT}
            documentId={DOCUMENT}
            currency="CHF"
            mayRecord={mayRecord}
            mayWriteOff={mayWriteOff}
          />
        </QueryClientProvider>
      </MemoryRouter>,
    )
  })
  await settle()
}

function text(): string {
  return document.body.textContent ?? ''
}

function button(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll('button')].find(
    (entry) => entry.textContent === label,
  ) as HTMLButtonElement | undefined
}

function field(label: string): HTMLInputElement | undefined {
  const found = [...document.querySelectorAll('label')].find(
    (entry) => entry.textContent === label,
  )
  const id = found?.getAttribute('for')
  return id === null || id === undefined
    ? undefined
    : (document.getElementById(id) as HTMLInputElement | null) ?? undefined
}

function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('DocumentReceivablePanel', () => {
  /**
   * The line names the difference and says what will happen.
   *
   * <p>Before this it was one static sentence that never showed a figure (backend ADR-0105).
   */
  it('documentReceivablePanelNamesTheOverpaymentTest', async () => {
    await render()

    await act(async () => {
      button('Zahlung erfassen')?.click()
    })
    await settle()

    await act(async () => {
      type(field('Betrag')!, '1297.60')
    })
    await settle()

    expect(text()).toContain('0.40 CHF zu viel')
    expect(text()).toContain('einbehalten')
  })

  /**
   * The mask warns and does <b>not</b> block.
   *
   * <p>A customer who transfers twenty rappen too much must not become an error dialog
   * (ADR-0091), and a mistyped hundred thousand is still recorded — it just gets no offer to
   * keep it.
   */
  it('documentReceivablePanelDoesNotBlockAnOverpaymentTest', async () => {
    given = advice({ zone: 'CREDIT_ONLY', difference: 98702.8, keepAllowed: false })

    await render()
    await act(async () => {
      button('Zahlung erfassen')?.click()
    })
    await settle()
    await act(async () => {
      type(field('Betrag')!, '100000.00')
    })
    await settle()

    expect(text()).toContain('lässt sich nichts einbehalten')
    expect(button('Erfassen')?.disabled).toBe(false)
  })

  it('documentReceivablePanelCallsARoundingARoundingTest', async () => {
    given = advice({ zone: 'ROUNDING', difference: 0.05 })

    await render()
    await act(async () => {
      button('Zahlung erfassen')?.click()
    })
    await settle()
    await act(async () => {
      type(field('Betrag')!, '1297.25')
    })
    await settle()

    expect(text()).toContain('Das ist eine Rundung')
  })

  /**
   * Three ways out, and «stehen lassen» needs no click.
   *
   * <p>Until somebody keeps it, the surplus belongs to the customer (OR Art. 62).
   */
  it('documentReceivablePanelOffersThreeExitsOnASurplusTest', async () => {
    item = openItem({ open: -0.4, settled: 1297.6 })

    await render()

    expect(text()).toContain('0.40 CHF zu viel bezahlt')
    expect(text()).toContain('bleibt als Guthaben des Kunden stehen')
    expect(button('Einbehalten')).toBeDefined()
    expect(text()).toContain('Zurückzahlen')
    expect(text()).toContain('kein steuerfreies Trinkgeld')
  })

  it('documentReceivablePanelHidesTheKeepWithoutTheRightTest', async () => {
    item = openItem({ open: -0.4, settled: 1297.6 })

    await render(true, false)

    expect(text()).toContain('0.40 CHF zu viel bezahlt')
    expect(button('Einbehalten')).toBeUndefined()
  })

  /** Nothing overpaid, nothing to decide: the notice stays away. */
  it('documentReceivablePanelShowsNoNoticeWithoutASurplusTest', async () => {
    await render()

    expect(text()).not.toContain('zu viel bezahlt')
  })
  // --- a payment in another currency (backend ADR-0106) ----------------------

  /**
   * The three rate fields stay out of sight until they are needed.
   *
   * <p>Paying in the currency of the invoice is the everyday case, and the dialog for it is
   * exactly what it was.
   */
  it('documentReceivablePanelHidesTheRateFieldsByDefaultTest', async () => {
    await render()
    await act(async () => {
      button('Zahlung erfassen')?.click()
    })
    await settle()

    expect(field('Kurs')).toBeUndefined()
    expect(field('Kursdatum')).toBeUndefined()
    expect(field('Währung')?.value).toBe('CHF')
  })

  /** Another currency: the fields appear, and the preview says what will be settled. */
  it('documentReceivablePanelShowsTheRateFieldsForAnotherCurrencyTest', async () => {
    await render()
    await act(async () => {
      button('Zahlung erfassen')?.click()
    })
    await settle()

    await act(async () => {
      type(field('Währung')!, 'EUR')
    })
    await settle()

    expect(field('Kurs')).toBeDefined()
    expect(field('Kursdatum')).toBeDefined()
    expect(text()).toContain('MWSTV Art. 45')
  })

  /** Without a rate and a rate date the button stays shut: the server would refuse anyway. */
  it('documentReceivablePanelBlocksAConversionWithoutARateTest', async () => {
    await render()
    await act(async () => {
      button('Zahlung erfassen')?.click()
    })
    await settle()
    await act(async () => {
      type(field('Betrag')!, '940.00')
    })
    await act(async () => {
      type(field('Währung')!, 'EUR')
    })
    await settle()

    expect(button('Erfassen')?.disabled).toBe(true)

    await act(async () => {
      type(field('Kurs')!, '1.060900')
    })
    await act(async () => {
      type(field('Kursdatum')!, '2026-04-17')
    })
    await settle()

    expect(button('Erfassen')?.disabled).toBe(false)
    // The preview is shown, not sent: the server works the settled amount out itself.
    expect(text()).toContain('997.25')
  })

  /** The history shows what arrived beside what the invoice settled. */
  it('documentReceivablePanelShowsTheEvidenceOnAConvertedLineTest', async () => {
    payments = [
      {
        id: 1,
        documentId: DOCUMENT,
        kind: 'PAYMENT',
        amount: 997.246,
        currency: 'EUR',
        valueDate: '2026-04-17',
        originalAmount: 940,
        originalCurrency: 'CHF',
        exchangeRate: 1.0609,
        exchangeRateUnit: 1,
        exchangeRateDate: '2026-04-17',
        source: 'MANUAL',
        recordedAt: '2026-04-17T09:12:00Z',
        recordedBy: 'muster',
      },
    ]

    await render()

    expect(text()).toContain('997.25 EUR')
    expect(text()).toContain('940.00 CHF')
  })
})
