// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Account, Page } from '../../lib/types'
import { AccountSelect } from './AccountSelect'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1

const REVENUE_ACCOUNTS: Account[] = [
  {
    id: 3,
    accountNumber: '3000',
    name: 'Warenertrag',
    accountType: 'REVENUE',
    orPosition: 'ER_NETTOERLOESE',
    directPostingAllowed: true,
    active: true,
  },
  {
    id: 4,
    accountNumber: '3400',
    name: 'Dienstleistungsertrag',
    accountType: 'REVENUE',
    orPosition: 'ER_NETTOERLOESE',
    directPostingAllowed: true,
    active: true,
  },
]

function page(content: Account[]): Page<Account> {
  return {
    content,
    page: 0,
    size: 200,
    totalElements: content.length,
    totalPages: 1,
    sort: 'accountNumber,asc',
  }
}

let container: HTMLDivElement
let root: Root
/** Every address the picker asked for, in order. */
let asked: string[]

function json(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

beforeEach(() => {
  asked = []
  vi.stubGlobal('fetch', (url: string) => {
    asked.push(url)
    return json(page(REVENUE_ACCOUNTS))
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

async function render(props: Partial<Parameters<typeof AccountSelect>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <AccountSelect
          label="Ertragskonto"
          tenantId={TENANT}
          value=""
          onChange={() => {}}
          emptyLabel="Konto des Mandanten"
          {...props}
        />
      </QueryClientProvider>,
    )
  })
  await settle()
}

/** The option labels, in the order the dropdown offers them. */
function options(): string[] {
  return [...container.querySelectorAll('option')].map((option) => option.textContent ?? '')
}

describe('AccountSelect', () => {
  it('accountSelectShowsNumberAndNameTest', async () => {
    await render()

    expect(options()).toEqual([
      'Konto des Mandanten',
      '3000 · Warenertrag',
      '3400 · Dienstleistungsertrag',
    ])
  })

  it('accountSelectStoresTheAccountNumberTest', async () => {
    const chosen: string[] = []
    await render({ onChange: (code) => chosen.push(code) })

    const select = container.querySelector('select') as HTMLSelectElement
    select.value = '3400'
    await act(async () => select.dispatchEvent(new Event('change', { bubbles: true })))

    expect(chosen).toEqual(['3400'])
  })

  /**
   * The proof test: `activeOnly` alone would offer accounts that refuse a hand posting.
   *
   * <p>An account can be active and still barred from being posted to directly, and such an
   * account in a picker is a trap — the refusal only comes at the far end.
   */
  it('accountSelectAsksForPostableActiveRevenueAccountsTest', async () => {
    await render()

    expect(asked).toHaveLength(1)
    expect(asked[0]).toContain('/api/tenants/1/accounting/accounts?')
    expect(asked[0]).toContain('accountType=REVENUE')
    expect(asked[0]).toContain('activeOnly=true')
    expect(asked[0]).toContain('postable=true')
  })

  it('accountSelectTakesTheAccountTypeTest', async () => {
    await render({ accountType: 'EXPENSE' })

    expect(asked[0]).toContain('accountType=EXPENSE')
  })

  /**
   * A stored account the chart no longer offers stays chosen.
   *
   * <p>Switched off, or barred from hand postings since: dropping it would move the record to
   * the next best account on the next save, silently.
   */
  it('accountSelectKeepsAnAccountTheChartNoLongerOffersTest', async () => {
    await render({ value: '3200' })

    expect(options()).toContain('3200')
    expect((container.querySelector('select') as HTMLSelectElement).value).toBe('3200')
  })

  /** Nothing is offered while the chart is on its way; the mask around it reports that. */
  it('accountSelectShowsNothingWhileTheChartIsOnItsWayTest', async () => {
    vi.stubGlobal('fetch', () => new Promise<Response>(() => {}))

    await render()

    expect(options()).toEqual(['Konto des Mandanten'])
  })

  /**
   * A refusal empties the list and nothing else.
   *
   * <p>The endpoint runs on `ACCOUNTING_READ`, so a session without it gets 403 here — the
   * reason the product mask hides the field rather than showing an empty one. What the record
   * carries stays selected all the same, and a save therefore cannot lose it.
   */
  it('accountSelectSaysNothingWhenTheChartIsRefusedTest', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('', { status: 403 })))

    await render({ value: '3000' })

    expect(options()).toEqual(['Konto des Mandanten', '3000'])
  })
})
