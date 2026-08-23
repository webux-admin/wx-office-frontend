// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../../auth/authContext'
import { salesDocumentFor } from '../../lib/salesDocument'
import type { DocumentDefaults, DocumentType, Page, Partner } from '../../lib/types'
import { NewDocumentMask } from './NewDocumentMask'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1
const KIND = salesDocumentFor('INVOICE')!

const TYPES: DocumentType[] = [
  { id: 4, code: 'RE', category: 'INVOICE', name: 'Rechnung', active: true, categoryDefault: true },
  {
    id: 9,
    code: 'RE2',
    category: 'INVOICE',
    name: 'Behördenrechnung',
    active: true,
    categoryDefault: false,
  },
]

const PARTNERS: Page<Partner> = {
  content: [
    { id: 77, name: 'Druckerei Meier AG', partnerNumber: 'K-1001', active: true } as Partner,
  ],
  page: 0,
  size: 200,
  totalElements: 1,
  totalPages: 1,
  sort: '',
}

/** What the backend answers once the customer stands: the kind it gets, and the rest. */
let defaults: DocumentDefaults

let container: HTMLDivElement
let root: Root
let asked: string[]

function stubFetch() {
  asked = []
  vi.stubGlobal('fetch', (url: string, options?: RequestInit) => {
    asked.push(`${options?.method ?? 'GET'} ${url}`)
    const body = url.includes('/defaults')
      ? defaults
      : url.includes('/partners')
        ? PARTNERS
        : TYPES
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  })
}

function auth(): AuthState {
  return {
    user: null,
    loading: false,
    signIn: () => Promise.reject(new Error('not in this test')),
    signOut: () => Promise.resolve(),
    switchTenant: () => Promise.resolve(),
    can: () => true,
  }
}

beforeEach(() => {
  defaults = {
    recipient: { name: 'Druckerei Meier AG' },
    partnerNumber: 'K-1001',
    languageCode: 'de',
    languageLabel: 'Deutsch',
    currencyCode: 'CHF',
    currencyLabel: 'Schweizer Franken',
    addressUsage: 'INVOICE',
    documentTypeId: 4,
    documentTypeCode: 'RE',
    documentTypeName: 'Rechnung',
  }
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

async function render(): Promise<void> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  await act(async () => {
    root.render(
      <MemoryRouter>
        <QueryClientProvider client={client}>
          <AuthContext.Provider value={auth()}>
            <NewDocumentMask tenantId={TENANT} kind={KIND} />
          </AuthContext.Provider>
        </QueryClientProvider>
      </MemoryRouter>,
    )
  })
  await settle()
}

/** The select a label points at, found the way a user finds it: by its wording. */
function selectNamed(label: string): HTMLSelectElement {
  const found = [...container.querySelectorAll('label')].find(
    (element) => element.textContent?.trim() === label,
  )
  if (found === undefined) throw new Error(`no field labelled ${label}`)
  return document.getElementById(found.htmlFor) as HTMLSelectElement
}

function pick(select: HTMLSelectElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
  setValue?.call(select, value)
  act(() => {
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

function text(): string {
  return container.textContent ?? ''
}

describe('NewDocumentMask', () => {
  /** The customer is the first thing asked, because everything else follows from them. */
  it('newDocumentMaskAsksForTheCustomerFirstTest', async () => {
    await render()

    const fields = [...container.querySelectorAll('label')].map((label) =>
      label.textContent?.trim(),
    )
    expect(fields.indexOf('Kunde')).toBeLessThan(fields.indexOf('Belegart'))
  })

  it('newDocumentMaskLeavesTheKindDisabledUntilACustomerStandsTest', async () => {
    await render()

    expect(selectNamed('Belegart').disabled).toBe(true)
    expect(text()).toContain('Wird gefüllt, sobald der Kunde gewählt ist.')
  })

  /** The point of the whole rework: picking the customer fills the kind of document in. */
  it('newDocumentMaskFillsTheKindFromTheCustomerTest', async () => {
    await render()

    pick(selectNamed('Kunde'), '77')
    await settle()

    expect(selectNamed('Belegart').value).toBe('4')
    expect(text()).toContain('Vorschlag für diesen Kunden')
  })

  /** The first ask carries no kind: the backend is the one that works it out. */
  it('newDocumentMaskAsksTheDefaultsWithoutAKindTest', async () => {
    await render()

    pick(selectNamed('Kunde'), '77')
    await settle()

    expect(
      asked.some(
        (request) => request.includes('/defaults?partnerId=77') && !request.includes('documentTypeId'),
      ),
    ).toBe(true)
  })

  it('newDocumentMaskFollowsAnAgreementOfTheCustomerTest', async () => {
    defaults = { ...defaults, documentTypeId: 9, documentTypeCode: 'RE2' }

    await render()
    pick(selectNamed('Kunde'), '77')
    await settle()

    expect(selectNamed('Belegart').value).toBe('9')
  })

  /** Suggested is not prescribed: another kind may be picked and stays picked. */
  it('newDocumentMaskKeepsAKindThatWasPickedByHandTest', async () => {
    await render()
    pick(selectNamed('Kunde'), '77')
    await settle()

    pick(selectNamed('Belegart'), '9')
    await settle()

    expect(selectNamed('Belegart').value).toBe('9')
    expect(text()).toContain('Weicht vom Vorschlag für diesen Kunden ab.')
  })
})
