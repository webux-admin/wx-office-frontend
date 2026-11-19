// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Partner, SalesDocument } from '../../lib/types'
import { ChangeAddressDialog } from './ChangeAddressDialog'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1
const BASE = `/api/tenants/${TENANT}/orders/42`

/** A customer with a head office, marked as default, and a branch. */
const PARTNER: Partner = {
  id: 3,
  partnerNumber: 'K-0003',
  partnerType: 'ORGANISATION',
  name: 'Muster AG',
  isCustomer: true,
  isSupplier: false,
  addresses: [
    {
      id: 11,
      name: 'Muster AG, Filiale Bern',
      street: 'Marktgasse',
      buildingNumber: '1',
      postalCode: '3000',
      town: 'Bern',
      useAsDefault: false,
      usages: [],
    },
    {
      id: 10,
      name: 'Muster AG',
      street: 'Bahnhofstrasse',
      buildingNumber: '12',
      postalCode: '8001',
      town: 'Zürich',
      useAsDefault: true,
      usages: [],
    },
  ],
}

const DRAFT: SalesDocument = {
  id: 42,
  documentTypeId: 1,
  category: 'ORDER',
  status: 'DRAFT',
  documentDate: '2026-08-21',
  partnerId: 3,
  currency: 'CHF',
  baseCurrency: 'CHF',
  totalNet: 0,
  totalVat: 0,
  totalGross: 0,
  subtotalsIncludeVat: false,
  pricesIncludeVat: false,
  lines: [],
  recipient: { name: 'Muster AG', postalCode: '8001', town: 'Zürich', addressId: 10 },
}

let container: HTMLDivElement
let root: Root
let sent: { url: string; method: string; body: unknown }[]

beforeEach(() => {
  sent = []
  vi.stubGlobal('fetch', (url: string, options?: RequestInit) => {
    sent.push({
      url,
      method: options?.method ?? 'GET',
      body: options?.body === undefined ? undefined : JSON.parse(String(options.body)),
    })
    const body = url.includes('/partners/') ? PARTNER : url.includes('/catalogues') ? {} : DRAFT
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
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
  for (let round = 0; round < 5; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

async function render(): Promise<{ changed: SalesDocument[]; closed: number[] }> {
  const changed: SalesDocument[] = []
  const closed: number[] = []
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <ChangeAddressDialog
          tenantId={TENANT}
          base={BASE}
          open
          onClose={() => closed.push(1)}
          document={DRAFT}
          onChanged={(answer) => changed.push(answer)}
        />
      </QueryClientProvider>,
    )
  })
  await settle()
  return { changed, closed }
}

/** The radio button of the card that names a town. */
function card(town: string): HTMLInputElement {
  const found = [...document.querySelectorAll('label')].find((label) =>
    label.textContent?.includes(town),
  )
  const radio = found?.querySelector('input[type="radio"]')
  if (!radio) throw new Error(`Keine Adresse in "${town}"`)
  return radio as HTMLInputElement
}

async function press(label: string) {
  const found = [...document.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === label,
  )
  if (!found) throw new Error(`Kein Knopf "${label}"`)
  await act(async () => found.click())
  await settle()
}

const writes = () => sent.filter((request) => request.method !== 'GET')

describe('ChangeAddressDialog', () => {
  it('changeAddressDialogTest', async () => {
    const { changed } = await render()

    await act(async () => card('Bern').click())
    await press('Übernehmen')

    expect(writes()).toEqual([
      { url: `${BASE}/header`, method: 'PUT', body: { addressId: 11, priceMode: 'COPY' } },
    ])
    expect(changed).toHaveLength(1)
  })

  /** The address the draft carries is the one selected when the dialog opens. */
  it('changeAddressDialogStartsOnTheCurrentAddressTest', async () => {
    await render()

    expect(card('Zürich').checked).toBe(true)
    expect(card('Bern').checked).toBe(false)
    // The default address comes first, whatever order the partner sent.
    expect(document.querySelector('label')?.textContent).toContain('Zürich')
  })

  it('changeAddressDialogWithoutAChangeSendsNothingTest', async () => {
    const { closed } = await render()

    await press('Übernehmen')

    expect(writes()).toEqual([])
    expect(closed).toHaveLength(1)
  })
})
