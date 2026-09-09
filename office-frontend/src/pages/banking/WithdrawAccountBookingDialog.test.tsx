// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BankTransaction } from '../../lib/types'
import { WithdrawAccountBookingDialog } from './WithdrawAccountBookingDialog'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1

let container: HTMLDivElement
let root: Root
let sent: { url: string; body: unknown }[] = []

const BOOKED = {
  id: 42,
  entryId: 1,
  accountIban: 'CH4431999123000889012',
  amount: 1240,
  currency: 'CHF',
  inAccountCurrency: true,
  creditDebit: 'DBIT',
  valueDate: '2026-09-03',
  referenceType: 'NONE',
  referenceValid: true,
  debtorName: 'Mustermann Immobilien AG',
  state: 'ACCOUNTED',
  toCheck: false,
} as unknown as BankTransaction

function stubFetch() {
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    sent.push({ url: String(input), body: JSON.parse(String(init?.body ?? 'null')) })
    return Promise.resolve(
      new Response(JSON.stringify({ entryId: 12, entryNumber: '2026-000124' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  })
}

beforeEach(() => {
  sent = []
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

async function render() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <WithdrawAccountBookingDialog
          open
          tenantId={TENANT}
          movement={BOOKED}
          onClose={() => {}}
          onSaved={() => {}}
        />
      </QueryClientProvider>,
    )
  })
}

const text = () => document.body.textContent ?? ''

function buttonOf(label: string): HTMLButtonElement {
  const found = [...document.body.querySelectorAll('button')].find(
    (element) => element.textContent?.trim() === label,
  )
  if (found === undefined) {
    throw new Error(`kein Knopf «${label}»`)
  }
  return found
}

async function type(value: string) {
  const label = [...document.body.querySelectorAll('label')].find((element) =>
    element.textContent?.includes('Grund'),
  )
  const field = document.body.querySelector(
    `#${label?.getAttribute('for')}`,
  ) as HTMLInputElement
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(field, value)
    field.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('WithdrawAccountBookingDialog', () => {
  /**
   * <b>The reason is required.</b> It travels into the counter entry and explains the pair ten
   * years later; a correction without one tells nobody anything.
   */
  it('withdrawAccountBookingDialogNeedsAReasonTest', async () => {
    await render()

    expect(buttonOf('Zurücknehmen').disabled).toBe(true)

    await type('falsches Konto')

    expect(buttonOf('Zurücknehmen').disabled).toBe(false)
  })

  /**
   * <b>The sentence about the dunning is there on purpose.</b> Withdrawing an assignment warns,
   * because an invoice becomes open again; an account booking touches no invoice, and a missing
   * warning is easily taken for an oversight.
   */
  it('withdrawAccountBookingDialogSaysNoInvoiceIsTouchedTest', async () => {
    await render()

    expect(text()).toContain('keine Rechnung betroffen')
    expect(text()).toContain('Mahnung ändert sich dadurch nicht')
  })

  /** What it sends: the reason, trimmed, to the withdrawal path of that movement. */
  it('withdrawAccountBookingDialogSendsTheReasonTest', async () => {
    await render()
    await type('  falsches Konto  ')

    await act(async () => {
      buttonOf('Zurücknehmen').click()
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(sent).toHaveLength(1)
    expect(sent[0]?.url).toContain('/transactions/42/account-booking/withdraw')
    expect(sent[0]?.body).toEqual({ reason: 'falsches Konto' })
  })
})
