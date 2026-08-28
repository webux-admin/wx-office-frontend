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
    completeSecondFactor: () => Promise.reject(new Error('not in this test')),
    sendSecondFactorCode: () => Promise.resolve(),
    signOut: () => Promise.resolve(),
    switchTenant: () => Promise.resolve(),
    refresh: () => Promise.resolve(),
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

/** Waits past the debounce of the type-ahead, then lets the answer arrive. */
async function settleSearch() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 260))
  })
  await settle()
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

/** The control a label points at, found the way a user finds it: by its wording. */
function fieldNamed<T extends HTMLElement>(label: string): T {
  const found = [...container.querySelectorAll('label')].find(
    (element) => element.textContent?.trim() === label,
  )
  if (found === undefined) throw new Error(`no field labelled ${label}`)
  return document.getElementById(found.htmlFor) as T
}

function selectNamed(label: string): HTMLSelectElement {
  return fieldNamed<HTMLSelectElement>(label)
}

/** Types into a field the way a browser does: set the value, then fire the native event. */
function type(input: HTMLInputElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setValue?.call(input, value)
  act(() => {
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

/**
 * Picks the customer the way a user does: type, wait for the hits, click the first one.
 */
async function pickCustomer(term = 'Meier') {
  const field = fieldNamed<HTMLInputElement>('Kunde')
  act(() => field.dispatchEvent(new FocusEvent('focus', { bubbles: true })))
  type(field, term)
  await settleSearch()
  const hit = container.querySelector('[role="option"]')
  if (hit === null) throw new Error('the search found nobody')
  act(() => {
    hit.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await settle()
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

    await pickCustomer()

    expect(selectNamed('Belegart').value).toBe('4')
    expect(text()).toContain('Vorschlag für diesen Kunden')
  })

  /** The first ask carries no kind: the backend is the one that works it out. */
  it('newDocumentMaskAsksTheDefaultsWithoutAKindTest', async () => {
    await render()

    await pickCustomer()

    expect(
      asked.some(
        (request) => request.includes('/defaults?partnerId=77') && !request.includes('documentTypeId'),
      ),
    ).toBe(true)
  })

  it('newDocumentMaskFollowsAnAgreementOfTheCustomerTest', async () => {
    defaults = { ...defaults, documentTypeId: 9, documentTypeCode: 'RE2' }

    await render()
    await pickCustomer()

    expect(selectNamed('Belegart').value).toBe('9')
  })

  /** Suggested is not prescribed: another kind may be picked and stays picked. */
  it('newDocumentMaskKeepsAKindThatWasPickedByHandTest', async () => {
    await render()
    await pickCustomer()

    pick(selectNamed('Belegart'), '9')
    await settle()

    expect(selectNamed('Belegart').value).toBe('9')
    expect(text()).toContain('Weicht vom Vorschlag für diesen Kunden ab.')
  })

  /** The whole point of the type-ahead: nobody is loaded before somebody types. */
  it('newDocumentMaskLoadsNoCustomersUpFrontTest', async () => {
    await render()

    expect(asked.some((request) => request.includes('/partners'))).toBe(false)
  })

  it('newDocumentMaskSearchesTheCustomersOnTheServerTest', async () => {
    await render()
    await pickCustomer('Meier')

    // The first call goes out on focus with an empty field; the one that carries the term
    // is the one this test is about.
    const search = asked.findLast((request) => request.includes('/partners'))
    expect(search).toContain('search=Meier')
    expect(search).toContain('role=customer')
    expect(search).toContain('activeOnly=true')
  })

  /** Typing again gives up the customer, so a stale draft cannot be started. */
  it('newDocumentMaskDropsTheCustomerWhenTheFieldIsTypedInAgainTest', async () => {
    await render()
    await pickCustomer()

    type(fieldNamed<HTMLInputElement>('Kunde'), 'Andere')
    await settle()

    expect(selectNamed('Belegart').disabled).toBe(true)
  })
})
