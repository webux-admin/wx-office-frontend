// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SalesDocument } from '../../lib/types'
import { OrderPaymentPanel } from './OrderPaymentPanel'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1
const BASE = `/api/tenants/${TENANT}/orders/42`

const TERMS = [
  { id: 1, code: '30', name: '30 Tage netto', netDays: 30, isDefault: true },
  { id: 2, code: '30_2_10', name: '30 Tage, 2% bei 10', netDays: 30 },
]

function document(fields: Partial<SalesDocument> = {}): SalesDocument {
  return {
    id: 42,
    documentTypeId: 1,
    category: 'ORDER',
    status: 'DRAFT',
    documentDate: '2026-08-21',
    partnerId: 3,
    currency: 'CHF',
    totalNet: 1250,
    totalVat: 101.25,
    totalGross: 1351.25,
    paymentTerm: '30',
    paymentTermName: '30 Tage netto',
    dueDate: '2026-09-20',
    ...fields,
  }
}

let container: HTMLDivElement
let root: Root
let sent: { url: string; method: string; body: unknown }[]

function stubFetch() {
  sent = []
  vi.stubGlobal('fetch', (url: string, options?: RequestInit) => {
    sent.push({
      url,
      method: options?.method ?? 'GET',
      body: options?.body === undefined ? undefined : JSON.parse(String(options.body)),
    })
    const body = url.includes('/payment-terms') ? TERMS : document()
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
  container = window.document.createElement('div')
  window.document.body.appendChild(container)
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

async function render(value: SalesDocument, editable = true, readOnlyNote?: string): Promise<void> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <OrderPaymentPanel
          tenantId={TENANT}
          base={BASE}
          document={value}
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

describe('OrderPaymentPanel', () => {
  it('orderPaymentSendsTheChosenTermTest', async () => {
    await render(document())

    choose(byLabel<HTMLSelectElement>('Zahlungskondition'), '30_2_10')
    act(() => apply().click())
    await settle()

    const put = sent.find((call) => call.method === 'PUT')
    expect(put?.url).toBe(`${BASE}/payment`)
    expect(put?.body).toEqual({ paymentTerm: '30_2_10', dueDate: '2026-09-20' })
  })

  it('orderPaymentSendsNothingWhileNothingChangedTest', async () => {
    await render(document())

    expect(apply().disabled).toBe(true)
  })

  it('orderPaymentIsReadOnlyOnAnIssuedDocumentTest', async () => {
    await render({ ...document(), status: 'FINALISED' }, false)

    expect(text()).toMatch(/30 Tage netto/)
    expect(container.querySelector('select')).toBeNull()
  })

  it('orderPaymentShowsNothingOnAnIssuedDocumentWithoutATermTest', async () => {
    // A tenant without payment terms writes documents without one; there is nothing to show.
    await render({ ...document(), status: 'FINALISED', paymentTerm: undefined }, false)

    expect(text()).toBe('')
  })

  it('orderPaymentLetsADraftWithoutATermGetOneTest', async () => {
    await render(document({ paymentTerm: undefined, dueDate: undefined }))

    expect(byLabel<HTMLSelectElement>('Zahlungskondition')).toBeTruthy()
  })

  it('orderPaymentTakesATermOffAgainTest', async () => {
    await render(document())

    // "Ohne Kondition" is an answer the section offers, so it has to be saveable: what is
    // sent replaces the whole agreement (ADR-0037).
    choose(byLabel<HTMLSelectElement>('Zahlungskondition'), '')
    act(() => apply().click())
    await settle()

    expect(sent.find((call) => call.method === 'PUT')?.body).toEqual({
      dueDate: '2026-09-20',
    })
  })

  it('orderPaymentSaysWhyItIsReadOnlyWithoutThePermissionTest', async () => {
    await render(
      document({ paymentTerm: undefined, dueDate: undefined }),
      false,
      'Zum Ändern fehlt das Recht ORDER_WRITE.',
    )

    // A draft nobody may change is not an issued document, and the section may not read
    // as if it were — nor disappear without a word.
    expect(text()).toMatch(/fehlt das Recht ORDER_WRITE/)
  })
})
