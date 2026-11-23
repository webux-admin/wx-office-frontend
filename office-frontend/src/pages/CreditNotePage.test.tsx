// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import type { SalesDocument } from '../lib/types'
import { CreditNotePage } from './CreditNotePage'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1

/** A draft Gutschrift of 125.00 on invoice RE-2026-0009. */
const DRAFT: SalesDocument = {
  id: 14,
  documentTypeId: 5,
  category: 'CREDIT_NOTE',
  status: 'DRAFT',
  documentDate: '2026-08-25',
  partnerId: 3,
  language: 'de',
  currency: 'CHF',
  baseCurrency: 'CHF',
  totalNet: 115.63,
  totalVat: 9.37,
  totalGross: 125,
  subtotalsIncludeVat: true,
  pricesIncludeVat: true,
  lines: [],
  creditedDocumentId: 9,
  creditedDocumentNumber: 'RE-2026-0009',
  creditedDocumentDate: '2026-03-15',
}

let container: HTMLDivElement
let root: Root

function json(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

beforeEach(() => {
  vi.stubGlobal('fetch', (url: string) =>
    url.endsWith('/credit-notes/14') ? json(DRAFT) : json([]))
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

function auth(permissions: string[]): AuthState {
  return {
    user: {
      userId: 1,
      username: 'muster',
      activeTenantId: TENANT,
      superuser: false,
      tenants: [{ id: TENANT, code: 'WX', name: 'Webux', isDefault: true, modules: [] }],
      permissions,
    },
    loading: false,
    signIn: () => Promise.reject(new Error('not in this test')),
    completeSecondFactor: () => Promise.reject(new Error('not in this test')),
    sendSecondFactorCode: () => Promise.resolve(),
    adoptSession: () => {},
    signOut: () => Promise.resolve(),
    switchTenant: () => Promise.resolve(),
    refresh: () => Promise.resolve(),
    can: (permission: string) => permissions.includes(permission),
  }
}

async function render(permissions: string[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/gutschriften/14']}>
        <AuthContext.Provider value={auth(permissions)}>
          <QueryClientProvider client={client}>
            <Routes>
              <Route path="/gutschriften/:id" element={<CreditNotePage />} />
            </Routes>
          </QueryClientProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
  })
  for (let round = 0; round < 6; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

function button(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll('button')].find(
    (entry) => entry.textContent === label,
  ) as HTMLButtonElement | undefined
}

describe('CreditNotePage', () => {
  it('creditNotePageOffersToRewriteTheLinesTest', async () => {
    await render(['CREDIT_NOTE_READ', 'CREDIT_NOTE_WRITE', 'INVOICE_READ'])

    expect(document.body.textContent).toContain('Gutschrift (Entwurf)')
    expect(button('Positionen bearbeiten…')).toBeDefined()
  })

  /**
   * The dialog reads what the invoice still has to give, and that endpoint asks for the read
   * right of the invoice as well. Without it the button would only open a 403.
   */
  it('creditNotePageHidesTheRewriteWithoutTheInvoiceRightTest', async () => {
    await render(['CREDIT_NOTE_READ', 'CREDIT_NOTE_WRITE'])

    expect(document.body.textContent).toContain('Gutschrift (Entwurf)')
    expect(button('Positionen bearbeiten…')).toBeUndefined()
  })
})
