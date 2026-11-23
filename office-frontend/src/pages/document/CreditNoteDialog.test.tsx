// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../../auth/authContext'
import type { CreditableInvoice, SalesDocument } from '../../lib/types'
import { CreditNoteDialog } from './CreditNoteDialog'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1

/** An invoice over 1’250.00 with one line, the acceptance case of issue #112. */
const CREDITABLE: CreditableInvoice = {
  invoiceId: 9,
  documentNumber: 'RE-2026-0009',
  documentDate: '2026-03-15',
  currency: 'CHF',
  totalGross: 1250,
  credited: 0,
  writtenOff: 0,
  remaining: 1250,
  lines: [
    {
      lineId: 31,
      lineNumber: 1,
      description: 'Wartung März',
      quantity: 1,
      unit: 'Pausch.',
      unitPrice: 1250,
      priceIncludesVat: true,
      vatRate: 8.1,
      lineGross: 1250,
      creditedGross: 0,
      proposedQuantity: 1,
      proposedUnitPrice: 1250,
    },
  ],
  groups: [{ vatCategory: 'STANDARD', vatRate: 8.1, invoiced: 1250, credited: 0,
    writtenOff: 0, remaining: 1250 }],
}

let container: HTMLDivElement
let root: Root
let sent: { url: string; method: string; body: unknown }[]
let answer: Response | null

function stubFetch() {
  sent = []
  answer = null
  vi.stubGlobal('fetch', (url: string, options?: RequestInit) => {
    const method = options?.method ?? 'GET'
    if (method !== 'GET') {
      sent.push({ url, method, body: JSON.parse(String(options?.body)) })
      return Promise.resolve(answer ?? json({ id: 12, category: 'CREDIT_NOTE' }))
    }
    return Promise.resolve(json(CREDITABLE))
  })
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function auth(): AuthState {
  return {
    user: null,
    loading: false,
    signIn: () => Promise.reject(new Error('not in this test')),
    completeSecondFactor: () => Promise.reject(new Error('not in this test')),
    sendSecondFactorCode: () => Promise.resolve(),
    adoptSession: () => {},
    signOut: () => Promise.resolve(),
    switchTenant: () => Promise.resolve(),
    refresh: () => Promise.resolve(),
    can: () => true,
  }
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

async function render(draft?: SalesDocument): Promise<{ saved: SalesDocument[] }> {
  const saved: SalesDocument[] = []
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <AuthContext.Provider value={auth()}>
          <CreditNoteDialog
            tenantId={TENANT}
            invoiceId={9}
            open
            onClose={() => undefined}
            draft={draft}
            onSaved={(stored) => saved.push(stored)}
          />
        </AuthContext.Provider>
      </QueryClientProvider>,
    )
  })
  await settle()
  return { saved }
}

function text(): string {
  return document.body.textContent ?? ''
}

function buttonNamed(label: string): HTMLButtonElement {
  const found = [...document.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === label,
  )
  if (!found) throw new Error(`Kein Knopf mit der Beschriftung "${label}"`)
  return found as HTMLButtonElement
}

function inputLabelled(label: string): HTMLInputElement {
  const found = [...document.querySelectorAll('label')].find(
    (candidate) => candidate.textContent?.includes(label),
  )
  const id = found?.getAttribute('for')
  const input = id === null || id === undefined ? null : document.getElementById(id)
  if (!(input instanceof HTMLInputElement)) throw new Error(`Kein Feld «${label}»`)
  return input
}

/** Types into a controlled input the way React notices it. */
function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  act(() => {
    setter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function tick(input: HTMLInputElement) {
  act(() => input.click())
}

describe('CreditNoteDialog', () => {
  it('showsWhatTheInvoiceStillHasTest', async () => {
    await render()

    expect(text()).toContain('Rechnung RE-2026-0009 vom 15.03.2026')
    expect(text()).toContain('Noch gutschreibbar: 1’250.00 CHF')
    expect(text()).toContain('Wartung März')
  })

  it('sendsNothingWhileNoLineIsTickedTest', async () => {
    await render()

    expect(buttonNamed('Gutschrift erstellen').disabled).toBe(true)
  })

  /** 125.00 on an invoice of 1’250.00: one line ticked, the price typed. */
  it('writesTheCreditNoteTest', async () => {
    const { saved } = await render()

    tick(inputLabelled('Wartung März'))
    type(inputLabelled('Preis inkl. MWST'), '125.00')
    type(inputLabelled('Eigene Bezeichnung'), 'SLA-Gutschrift März')
    act(() => buttonNamed('Gutschrift erstellen').click())
    await settle()

    expect(sent).toHaveLength(1)
    expect(sent[0].url).toBe('/api/tenants/1/invoices/9/credit-notes')
    expect(sent[0].method).toBe('POST')
    expect(sent[0].body).toMatchObject({
      lines: [{ invoiceLineId: 31, quantity: 1, unitPrice: 125,
        description: 'SLA-Gutschrift März' }],
    })
    expect(saved).toHaveLength(1)
  })

  it('refusesAPriceOfZeroAtTheFieldTest', async () => {
    await render()

    tick(inputLabelled('Wartung März'))
    type(inputLabelled('Preis inkl. MWST'), '0')

    expect(text()).toContain('Der Preis muss grösser als null sein.')
    expect(buttonNamed('Gutschrift erstellen').disabled).toBe(true)
  })

  /** What exceeds the invoice is the backend's answer, and it stands in the dialog. */
  it('showsTheRefusalOfTheBackendTest', async () => {
    const { saved } = await render()
    answer = json({ title: 'Ungültige Gutschrift',
      detail: 'Die Gutschrift schreibt zum Satz von 8.1 % 1300.00 CHF gut' }, 400)

    tick(inputLabelled('Wartung März'))
    type(inputLabelled('Preis inkl. MWST'), '1300')
    act(() => buttonNamed('Gutschrift erstellen').click())
    await settle()

    expect(text()).toContain('1300.00 CHF gut')
    expect(saved).toHaveLength(0)
  })
})
