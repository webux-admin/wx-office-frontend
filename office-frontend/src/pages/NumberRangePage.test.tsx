// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import { JOURNAL_NUMBER_RANGE_CODE } from '../lib/accounting'
import type { DocumentType, NumberRange } from '../lib/types'
import { NumberRangePage } from './NumberRangePage'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1

const PERMISSIONS = ['NUMBER_RANGE_READ', 'NUMBER_RANGE_WRITE', 'DOCUMENT_TYPE_READ']

const SESSION: AuthState = {
  user: {
    userId: 1,
    username: 'muster',
    activeTenantId: TENANT,
    superuser: false,
    tenants: [
      { id: TENANT, code: 'WX', name: 'Webux', isDefault: true, modules: ['ACCOUNTING'] },
    ],
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

/**
 * What the tenant has: an invoice range, and the journal range the fiscal year laid out.
 *
 * <p>The journal range is real — it stands in `number_range` like any other, and the backend
 * writes it when a fiscal year is created. What it is not is editable from here.
 */
const RANGES: NumberRange[] = [
  {
    tenantId: TENANT,
    documentTypeCode: 'RE',
    fiscalYear: 2026,
    prefix: 'RE-2026-',
    padding: 4,
    nextNumber: 42,
    nextDocumentNumber: 'RE-2026-0042',
  },
  {
    tenantId: TENANT,
    documentTypeCode: JOURNAL_NUMBER_RANGE_CODE,
    fiscalYear: 2026,
    padding: 6,
    nextNumber: 1,
    nextDocumentNumber: '000001',
  },
]

const TYPES: DocumentType[] = [
  { id: 1, code: 'RE', name: 'Rechnung', category: 'INVOICE', active: true },
  { id: 2, code: JOURNAL_NUMBER_RANGE_CODE, name: 'Journal', category: 'INVOICE', active: true },
]

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
    url.includes('/document-types') ? json(TYPES) : json(RANGES),
  )
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

async function render() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/nummernkreise']}>
        <AuthContext.Provider value={SESSION}>
          <QueryClientProvider client={client}>
            <NumberRangePage />
          </QueryClientProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
  })
  await settle()
}

function button(text: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find((entry) =>
    entry.textContent?.includes(text),
  ) as HTMLButtonElement | undefined
}

/** The codes the picker of the dialog offers. */
function options(): string[] {
  return [...container.querySelectorAll('option')].map((entry) => entry.value)
}

describe('NumberRangePage', () => {
  it('numberRangePageListsTheRangesTest', async () => {
    await render()

    expect(container.textContent).toContain('RE-2026-0042')
    expect(container.textContent).toContain('Rechnung')
  })

  /**
   * The journal range is not in the table.
   *
   * <p>It is laid out and removed with the fiscal year it counts for, and the backend refuses
   * it on this endpoint. A row that only ever answers 400 does not belong in a mask that
   * invites changing it — the barrier is in the backend, this only tidies the browser
   * (backend ADR-0113).
   */
  it('numberRangePageHidesTheJournalRangeTest', async () => {
    await render()

    expect(container.textContent).not.toContain(JOURNAL_NUMBER_RANGE_CODE)
    expect(container.textContent).toContain('RE')
  })

  /** And not in the picker either, where it would invite laying a second one out. */
  it('numberRangePageHidesTheJournalKindInTheDialogTest', async () => {
    await render()

    await act(async () => {
      button('Nummernkreis')?.click()
    })
    await settle()

    expect(options()).toContain('RE')
    expect(options()).not.toContain(JOURNAL_NUMBER_RANGE_CODE)
  })
})
