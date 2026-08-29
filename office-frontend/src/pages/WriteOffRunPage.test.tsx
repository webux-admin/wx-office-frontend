// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import type {
  MasterDataEntry,
  WriteOffCandidate,
  WriteOffProposal,
  WriteOffRunResult,
} from '../lib/types'
import { WriteOffRunPage } from './WriteOffRunPage'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1

function session(permissions: string[]): AuthState {
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
    signIn: () => Promise.reject(new Error('nicht gebraucht')),
    completeSecondFactor: () => Promise.reject(new Error('nicht gebraucht')),
    sendSecondFactorCode: () => Promise.resolve(),
    adoptSession: () => {},
    switchTenant: () => Promise.resolve(),
    signOut: () => Promise.resolve(),
    refresh: () => Promise.resolve(),
    can: (permission: string) => permissions.includes(permission),
  }
}

const RUNNER = session(['INVOICE_READ', 'INVOICE_WRITE_OFF', 'INVOICE_WRITE_OFF_RUN'])
const READER = session(['INVOICE_READ'])

const CURRENCIES: MasterDataEntry[] = [
  { id: 501, code: 'CHF', name: 'Schweizer Franken', isDefault: true, active: true },
  { id: 502, code: 'EUR', name: 'Euro', active: true },
]

function candidate(documentId: number, amount: number): WriteOffCandidate {
  return {
    documentId,
    documentNumber: `RE-2026-00${documentId}`,
    documentDate: '2026-01-05',
    dueDate: '2026-02-04',
    daysOverdue: 206,
    partnerId: 1,
    partnerNumber: 'K-1',
    partnerName: 'Druckerei Meier AG',
    currency: 'CHF',
    totalGross: 1297.2,
    settled: 1297.2 - amount,
    open: amount,
    limit: 0.2,
    writeOffAmount: amount,
  }
}

let container: HTMLDivElement
let root: Root
/** Every write the mask sent: address and body. */
let written: { url: string; body: Record<string, unknown> }[]
/** What the proposal endpoint answers. */
let proposal: WriteOffProposal
/** What the run endpoint answers. */
let result: WriteOffRunResult

function json(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

function stubFetch() {
  written = []
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {}
    if (method === 'POST') written.push({ url, body })
    if (url.includes('/write-off-runs/proposal')) return json(proposal)
    if (url.includes('/write-off-runs')) return json(result)
    if (url.includes('/currencies')) return json(CURRENCIES)
    return json([])
  })
}

beforeEach(() => {
  proposal = {
    count: 2,
    total: 0.35,
    largestWriteOff: 0.2,
    currency: 'CHF',
    candidates: [candidate(11, 0.2), candidate(12, 0.15)],
  }
  result = {
    runId: 5,
    postedCount: 2,
    skippedCount: 0,
    postedTotal: 0.35,
    posted: [
      { documentId: 11, documentNumber: 'RE-2026-0011', amount: 0.2, paymentId: 1 },
      { documentId: 12, documentNumber: 'RE-2026-0012', amount: 0.15, paymentId: 2 },
    ],
    skipped: [],
    failed: [],
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

async function render(auth: AuthState = RUNNER) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/kleindifferenzen']}>
        <AuthContext.Provider value={auth}>
          <QueryClientProvider client={client}>
            <WriteOffRunPage />
          </QueryClientProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
  })
  await settle()
}

function text(): string {
  return container.textContent ?? ''
}

function button(label: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find(
    (entry) => entry.textContent === label,
  ) as HTMLButtonElement | undefined
}

function boxes(): HTMLInputElement[] {
  return [...container.querySelectorAll('input[type=checkbox]')] as HTMLInputElement[]
}

function field(label: string): HTMLInputElement | HTMLSelectElement | undefined {
  const caption = [...container.querySelectorAll('label')].find(
    (entry) => entry.textContent === label,
  )
  if (!caption) return undefined
  return (
    (document.getElementById(caption.htmlFor) as HTMLInputElement | null) ?? undefined
  )
}

async function click(element: Element | undefined) {
  expect(element).toBeDefined()
  await act(async () => {
    ;(element as HTMLElement).click()
  })
  await settle()
}

/** Types into a field the way React sees it: through the native setter, then an input event. */
async function type(element: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )?.set
  await act(async () => {
    setter?.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await settle()
}

describe('WriteOffRunPage', () => {
  /**
   * Either an amount or a percentage, never both.
   *
   * <p>The backend refuses the combination; the mask shows exactly one field, so the
   * contradiction cannot even be typed (backend ADR-0102).
   */
  it('writeOffRunPageOffersEitherAmountOrPercentTest', async () => {
    await render()

    expect(field('Bis Betrag')).toBeDefined()
    expect(field('Bis Prozent')).toBeUndefined()

    const kind = field('Toleranzart') as HTMLSelectElement
    await act(async () => {
      kind.value = 'PERCENT'
      kind.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await settle()

    expect(field('Bis Prozent')).toBeDefined()
    expect(field('Bis Betrag')).toBeUndefined()
    // And the hint says what the percentage is measured against, which is the point.
    expect(text()).toContain('tatsächlich eingegangen')
  })

  it('writeOffRunPageCountsTheSelectionTest', async () => {
    await render()

    expect(button('Ausbuchen')?.disabled).toBe(true)
    await click(boxes()[1])

    expect(text()).toContain('1 Posten markiert')
    expect(button('Ausbuchen')?.disabled).toBe(false)
  })

  /** Nothing is booked before the dialog named count, sum, reason and date. */
  it('writeOffRunPageAsksBeforeBookingTest', async () => {
    await render()
    await click(boxes()[0])
    await click(button('Ausbuchen'))

    expect(text()).toContain('Ausbuchen bestätigen')
    expect(text()).toContain('2 Posten markiert')
    expect(text()).toContain('Kleindifferenz')
    expect(written.filter((entry) => !entry.url.includes('/proposal'))).toHaveLength(0)

    await click(button('Jetzt ausbuchen'))

    const booked = written.filter((entry) => !entry.url.includes('/proposal'))
    expect(booked).toHaveLength(1)
    expect(booked[0].body.documentIds).toEqual([11, 12])
    expect(booked[0].body.toleranceAmount).toBe(0.2)
    expect(booked[0].body.tolerancePercent).toBeUndefined()
  })

  /**
   * A changed tolerance puts a different proposal on the screen.
   *
   * <p>What was ticked before means something else afterwards, so it is asked about rather
   * than silently kept — the guard the price entry puts around its typed prices.
   */
  it('writeOffRunPageDropsTheSelectionWhenTheToleranceChangesTest', async () => {
    await render()
    await click(boxes()[1])
    expect(text()).toContain('1 Posten markiert')

    await type(field('Bis Betrag') as HTMLInputElement, '0.50')

    expect(text()).toContain('Markierung verwerfen?')
    // Still ticked while the question stands: nothing is thrown away behind the user's back.
    expect(boxes().filter((box) => box.checked)).toHaveLength(1)

    await click(button('Verwerfen und ändern'))

    expect(boxes().filter((box) => box.checked)).toHaveLength(0)
    expect(button('Ausbuchen')?.disabled).toBe(true)
  })

  /** Gebucht, übersprungen, fehlgeschlagen — each with its reason. */
  it('writeOffRunPageReportsAPartialRunTest', async () => {
    result = {
      runId: 5,
      postedCount: 1,
      skippedCount: 1,
      postedTotal: 0.2,
      posted: [{ documentId: 11, documentNumber: 'RE-2026-0011', amount: 0.2, paymentId: 1 }],
      skipped: [
        {
          documentId: 12,
          documentNumber: 'RE-2026-0012',
          message: 'Inzwischen ist die Rechnung ausgeglichen',
        },
      ],
      failed: [],
    }

    await render()
    await click(boxes()[0])
    await click(button('Ausbuchen'))
    await click(button('Jetzt ausbuchen'))

    expect(text()).toContain('1 Posten ausgebucht')
    expect(text()).toContain('1 übersprungen')
    expect(text()).toContain('Inzwischen ist die Rechnung ausgeglichen')
  })

  /** The head names the biggest single amount, or «1 %» becomes a hundred francs unnoticed. */
  it('writeOffRunPageNamesTheLargestWriteOffTest', async () => {
    await render()

    expect(text()).toContain('Grösster Einzelbetrag')
    expect(text()).toContain('0.20')
  })

  it('writeOffRunPageHidesTheSelectionWithoutTheRightTest', async () => {
    await render(READER)

    expect(boxes()).toHaveLength(0)
    expect(button('Ausbuchen')).toBeUndefined()
    expect(text()).toContain('fehlt das Recht')
  })
})
