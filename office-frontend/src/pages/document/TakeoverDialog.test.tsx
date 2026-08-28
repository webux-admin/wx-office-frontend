// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../../auth/authContext'
import { SALES_DOCUMENT_KINDS } from '../../lib/salesDocument'
import type {
  DocumentType,
  OpenLineQuantity,
  PredecessorCandidate,
  SalesDocument,
} from '../../lib/types'
import { TakeoverDialog } from './TakeoverDialog'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1
/** The Lieferschein, which is what this dialog writes here. */
const KIND = SALES_DOCUMENT_KINDS.find((entry) => entry.category === 'DELIVERY_NOTE')!

const TYPES: DocumentType[] = [
  {
    id: 10,
    code: 'LS',
    category: 'DELIVERY_NOTE',
    name: 'Lieferschein',
    numberPrefix: 'LS',
    active: true,
    predecessorTypeIds: [2],
  } as DocumentType,
]

/** An Auftrag with something left, and one that is done. */
const CANDIDATES: PredecessorCandidate[] = [
  {
    id: 42,
    documentNumber: 'AU-2026-0001',
    documentDate: '2026-08-18',
    partnerId: 3,
    partnerName: 'Muster AG',
    totalGross: 1500,
    currency: 'CHF',
    itemLineCount: 2,
    openLineCount: 1,
  },
  {
    id: 43,
    documentNumber: 'AU-2026-0002',
    documentDate: '2026-08-19',
    partnerId: 3,
    partnerName: 'Beispiel GmbH',
    totalGross: 400,
    currency: 'CHF',
    itemLineCount: 1,
    openLineCount: 0,
  },
]

/** Two positions of AU-2026-0001: one partly delivered, one done. */
const OPEN_LINES: OpenLineQuantity[] = [
  {
    lineId: 101,
    lineNumber: 1,
    productId: 5,
    productNumber: 'P-100',
    description: 'Beratung',
    unit: 'Std.',
    orderedQuantity: 10,
    deliveredQuantity: 6,
    openQuantity: 4,
  },
  {
    lineId: 102,
    lineNumber: 2,
    productId: 6,
    productNumber: 'P-200',
    description: 'Schulung',
    unit: 'Std.',
    orderedQuantity: 4,
    deliveredQuantity: 4,
    openQuantity: 0,
  },
]

let container: HTMLDivElement
let root: Root
let posted: { url: string; body: unknown }[]

function stubFetch() {
  posted = []
  vi.stubGlobal('fetch', (url: string, options?: RequestInit) => {
    const method = options?.method ?? 'GET'
    if (method === 'POST') {
      posted.push({ url, body: JSON.parse(String(options?.body)) })
      return json({ id: 99 } as SalesDocument)
    }
    if (url.includes('/open-quantities')) {
      return json(url.includes('/43/') ? [] : OPEN_LINES)
    }
    return json(CANDIDATES)
  })
}

function json(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
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

async function render(): Promise<{ created: SalesDocument[] }> {
  const created: SalesDocument[] = []
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <AuthContext.Provider value={auth()}>
          <TakeoverDialog
            tenantId={TENANT}
            kind={KIND}
            open
            onClose={() => undefined}
            documentTypes={TYPES}
            onCreated={(answer) => created.push(answer)}
          />
        </AuthContext.Provider>
      </QueryClientProvider>,
    )
  })
  await settle()
  return { created }
}

function text(): string {
  return document.body.textContent ?? ''
}

/** Picks a candidate the way a person does: by clicking its row. */
async function pick(documentNumber: string) {
  const row = [...document.querySelectorAll('button')].find((candidate) =>
    candidate.textContent?.includes(documentNumber),
  )
  if (!row) throw new Error(`Keine Zeile für ${documentNumber}`)
  act(() => row.click())
  await settle()
}

function buttonNamed(label: string): HTMLButtonElement {
  const found = [...document.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === label,
  )
  if (!found) throw new Error(`Kein Knopf mit der Beschriftung "${label}"`)
  return found as HTMLButtonElement
}

describe('TakeoverDialog', () => {
  it('showsHowMuchOfACandidateIsOpenTest', async () => {
    await render()

    expect(text()).toContain('1 offen')
    expect(text()).toContain('erledigt')
  })

  it('showsOrderedDeliveredAndOpenPerLineTest', async () => {
    await render()

    await pick('AU-2026-0001')

    expect(text()).toContain('Bestellt')
    expect(text()).toContain('Geliefert')
    expect(text()).toContain('Offen')
    expect(text()).toContain('Beratung')
  })

  it('hidesFullyDeliveredLinesTest', async () => {
    await render()

    await pick('AU-2026-0001')

    // The takeover writes no line for a position that is done, so it is not promised here.
    expect(text()).not.toContain('Schulung')
  })

  it('refusesToTakeOverACompletedDocumentTest', async () => {
    await render()

    await pick('AU-2026-0002')

    expect(text()).toContain('nichts mehr offen')
    expect(buttonNamed('Übernehmen').disabled).toBe(true)
  })

  it('takesOverTheChosenDocumentTest', async () => {
    const { created } = await render()

    await pick('AU-2026-0001')
    act(() => buttonNamed('Übernehmen').click())
    await settle()

    expect(posted).toHaveLength(1)
    expect(posted[0].body).toEqual({ documentTypeId: 10, sourceId: 42 })
    expect(created).toHaveLength(1)
  })
})
