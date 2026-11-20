// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import type { DocumentType } from '../lib/types'
import { DocumentTypePage } from './DocumentTypePage'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1

const PERMISSIONS = ['DOCUMENT_TYPE_READ', 'DOCUMENT_TYPE_WRITE', 'PRINT_LAYOUT_READ']

const SESSION: AuthState = {
  user: {
    userId: 1,
    username: 'muster',
    activeTenantId: TENANT,
    superuser: false,
    tenants: [{ id: TENANT, code: 'WX', name: 'Webux', isDefault: true, modules: [] }],
    permissions: PERMISSIONS,
  },
  loading: false,
  signIn: () => Promise.reject(new Error('nicht gebraucht')),
  completeSecondFactor: () => Promise.reject(new Error('nicht gebraucht')),
  sendSecondFactorCode: () => Promise.resolve(),
  adoptSession: () => {},
  signOut: () => Promise.resolve(),
  switchTenant: () => Promise.resolve(),
  refresh: () => Promise.resolve(),
  can: (permission: string) => PERMISSIONS.includes(permission),
}

const DELIVERY_NOTE: DocumentType = {
  id: 7,
  code: 'LS',
  name: 'Lieferschein',
  category: 'DELIVERY_NOTE',
  numberPrefix: 'LS',
  documentLayoutId: 12,
  documentLayoutName: 'Lieferschein A4',
  copies: [
    { position: 1, label: 'Original', copies: 1 },
    { position: 2, label: 'Lager', copies: 2, internal: true },
  ],
  predecessorTypeIds: [],
  copyPriceMode: 'RECALCULATE',
  active: true,
  categoryDefault: false,
}

let container: HTMLDivElement
let root: Root
let stored: DocumentType
let sent: { url: string; method: string }[]

function json(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

/** Answers every read the mask makes; what it does not care about comes back empty. */
function answer(url: string) {
  if (/\/document-types\/\d+$/.test(url)) return json(stored)
  if (url.includes('/document-types')) return json([stored])
  if (url.includes('/products')) return json({ content: [], totalElements: 0 })
  return json([])
}

beforeEach(() => {
  stored = DELIVERY_NOTE
  sent = []
  vi.stubGlobal('fetch', (url: string, options?: RequestInit) => {
    sent.push({ url, method: options?.method ?? 'GET' })
    return answer(url)
  })
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

async function render(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <AuthContext.Provider value={SESSION}>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path="/belegarten/:id" element={<DocumentTypePage />} />
            </Routes>
          </MemoryRouter>
        </AuthContext.Provider>
      </QueryClientProvider>,
    )
  })
  await settle()
}

/** Everything on screen, dialogs included: they are drawn into `body`. */
function text(): string {
  return document.body.textContent ?? ''
}

function buttonNamed(name: string): HTMLButtonElement {
  const found = Array.from(document.body.querySelectorAll('button')).find(
    (button) => button.textContent?.trim() === name,
  )
  if (found === undefined) throw new Error(`no button «${name}»`)
  return found
}

async function click(element: HTMLElement) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await settle()
}

describe('DocumentTypePage', () => {
  it('documentTypePageShowsTheFactsTest', async () => {
    await render('/belegarten/7')

    expect(text()).toContain('Lieferschein A4')
    expect(text()).toContain('3 Blätter')
  })

  /** Category and code are fixed once the kind exists; a lock says why instead of a sentence. */
  it('documentTypePageLocksCategoryAndCodeTest', async () => {
    await render('/belegarten/7')

    expect(document.body.querySelector('[aria-label="Code: nicht änderbar"]')).not.toBeNull()
    expect(document.body.querySelector('[aria-label="Kategorie: nicht änderbar"]')).not.toBeNull()
  })

  /** The tenant names no printers any more: the browser's dialog chooses (backend ADR-0138). */
  it('documentTypePagePrintRegisterNamesNoPrinterTest', async () => {
    await render('/belegarten/7')

    await click(buttonNamed('Druck'))

    expect(text()).toContain('Ausfertigungen')
    expect(text()).not.toContain('Drucker')
    expect(text()).not.toContain('Schacht')
    expect(sent.some((request) => request.url.includes('/printers'))).toBe(false)
  })

  it('documentTypePageAsksBeforeDeactivatingTest', async () => {
    await render('/belegarten/7')

    await click(buttonNamed('Deaktivieren'))

    expect(text()).toContain('Belegart deaktivieren?')
    expect(sent.some((request) => request.method === 'DELETE')).toBe(false)
  })

  /** The default of its category cannot be switched off, so the button is not offered. */
  it('documentTypePageWithTheDefaultOffersNoDeactivationTest', async () => {
    stored = { ...DELIVERY_NOTE, categoryDefault: true }

    await render('/belegarten/7')

    expect(() => buttonNamed('Deaktivieren')).toThrow()
    expect(text()).toContain('Diese Belegart ist der Standard.')
  })

  it('documentTypePageForANewKindTest', async () => {
    await render('/belegarten/neu')

    expect(text()).toContain('Neue Belegart')
    expect(text()).toContain('Kategorie und Code stehen nach dem Speichern fest.')
    expect(document.body.querySelector('[aria-label="Code: nicht änderbar"]')).toBeNull()
  })
})
