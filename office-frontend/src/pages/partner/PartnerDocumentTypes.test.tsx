// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DocumentType, PartnerDocumentType } from '../../lib/types'
import { PartnerDocumentTypes } from './PartnerDocumentTypes'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1
const PARTNER = 42
const BASE = `/api/tenants/${TENANT}/partners/${PARTNER}/document-types`

const TYPES: DocumentType[] = [
  { id: 1, code: 'OF', category: 'OFFER', name: 'Offerte', active: true, categoryDefault: true },
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

const ASSIGNED: PartnerDocumentType[] = [
  {
    category: 'OFFER',
    documentTypeId: 1,
    documentTypeCode: 'OF',
    documentTypeName: 'Offerte',
    overridden: false,
    active: true,
  },
  {
    category: 'INVOICE',
    documentTypeId: 4,
    documentTypeCode: 'RE',
    documentTypeName: 'Rechnung',
    overridden: false,
    active: true,
  },
]

let container: HTMLDivElement
let root: Root
let sent: { url: string; method: string; body: unknown }[]
let assigned: PartnerDocumentType[]

/** Answers the assignment and the catalogue, and records what the register writes. */
function stubFetch() {
  sent = []
  vi.stubGlobal('fetch', (url: string, options?: RequestInit) => {
    sent.push({
      url,
      method: options?.method ?? 'GET',
      body: options?.body === undefined ? undefined : JSON.parse(String(options.body)),
    })
    // The catalogue and the assignment sit on paths that share a suffix, so the longer one
    // is asked about first.
    const body = url.includes('/partners/') ? assigned : TYPES
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  })
}

beforeEach(() => {
  assigned = ASSIGNED
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

async function render(mayWrite = true): Promise<void> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <PartnerDocumentTypes tenantId={TENANT} partnerId={PARTNER} mayWrite={mayWrite} />
      </QueryClientProvider>,
    )
  })
  await settle()
}

function text(): string {
  return container.textContent ?? ''
}

function selects(): HTMLSelectElement[] {
  return [...container.querySelectorAll('select')]
}

function buttonNamed(label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find(
    (button) => button.textContent?.trim() === label,
  )
  if (found === undefined) throw new Error(`no button named ${label}`)
  return found as HTMLButtonElement
}

/** Picks an option the way a browser does: set the value, then fire the native event. */
function pick(select: HTMLSelectElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
  setValue?.call(select, value)
  act(() => {
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

function click(element: HTMLElement) {
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

describe('PartnerDocumentTypes', () => {
  it('partnerDocumentTypesShowsOneRowPerStepTest', async () => {
    await render()

    expect(selects()).toHaveLength(2)
    expect(text()).toContain('Standardbelegart')
  })

  /** A step nobody overrode says so, and names the kind it falls back to. */
  it('partnerDocumentTypesNamesTheFallbackTest', async () => {
    await render()

    expect(text()).toContain('Es gilt die Standardbelegart: Rechnung')
    expect(selects()[1].value).toBe('')
  })

  it('partnerDocumentTypesMarksAnAgreementOfItsOwnTest', async () => {
    assigned = [
      {
        category: 'INVOICE',
        documentTypeId: 9,
        documentTypeCode: 'RE2',
        documentTypeName: 'Behördenrechnung',
        overridden: true,
        active: true,
      },
    ]

    await render()

    expect(text()).toContain('Eigene Abmachung')
    expect(selects()[0].value).toBe('9')
  })

  it('partnerDocumentTypesSavesOnlyTheOverriddenStepsTest', async () => {
    await render()

    pick(selects()[1], '9')
    click(buttonNamed('Übernehmen'))
    await settle()

    const written = sent.find((request) => request.method === 'PUT')
    expect(written?.url).toBe(BASE)
    expect(written?.body).toEqual({
      assignments: [{ category: 'INVOICE', documentTypeId: 9 }],
    })
  })

  /** Going back to the default is how a step loses its assignment: it drops out of the body. */
  it('partnerDocumentTypesClearsAnAgreementTest', async () => {
    assigned = [
      {
        category: 'INVOICE',
        documentTypeId: 9,
        documentTypeCode: 'RE2',
        documentTypeName: 'Behördenrechnung',
        overridden: true,
        active: true,
      },
    ]

    await render()

    pick(selects()[0], '')
    click(buttonNamed('Übernehmen'))
    await settle()

    expect(sent.find((request) => request.method === 'PUT')?.body).toEqual({ assignments: [] })
  })

  it('partnerDocumentTypesWithoutTheRightToWriteTest', async () => {
    await render(false)

    expect(selects().every((select) => select.disabled)).toBe(true)
    expect(
      [...container.querySelectorAll('button')].some(
        (button) => button.textContent?.trim() === 'Übernehmen',
      ),
    ).toBe(false)
  })

  it('partnerDocumentTypesWithoutAnyKindTest', async () => {
    assigned = []

    await render()

    expect(text()).toContain('führt noch keine Belegart')
  })
})
