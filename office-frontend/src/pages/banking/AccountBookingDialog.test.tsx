// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountBookingDialog, type BookableMovement } from './AccountBookingDialog'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1

let container: HTMLDivElement
let root: Root
let sent: { url: string; body: unknown }[] = []
let ledgerAccounts: unknown[] = []

/** A debit: rent went out. The chosen account belongs in the debit column. */
const RENT: BookableMovement = {
  id: 42,
  amount: 1240,
  currency: 'CHF',
  creditDebit: 'DBIT',
  accountIban: 'CH4431999123000889012',
  bookingDate: '2026-09-03',
  valueDate: '2026-09-03',
  debtorName: 'Mustermann Immobilien AG',
  remittanceUnstructured: 'Miete September',
}

function stubFetch() {
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (init?.method === 'POST') {
      sent.push({ url, body: JSON.parse(String(init.body)) })
      return Promise.resolve(
        new Response(JSON.stringify({ entryId: 9, entryNumber: '2026-000123' }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    }
    let body: unknown = []
    if (url.includes('/bank-accounts')) {
      body = ledgerAccounts
    } else if (url.includes('/tax-codes')) {
      body = {
        codes: [
          {
            id: 7,
            code: 'VSI81',
            name: 'Vorsteuer Investitionen',
            direction: 'INPUT',
            kind: 'NORMAL',
            rate: 8.1,
            active: true,
            sortOrder: 1,
          },
        ],
      }
    } else if (url.includes('/accounts')) {
      body = {
        content: [
          { id: 42, accountNumber: '6000', name: 'Raumaufwand', accountType: 'EXPENSE' },
        ],
        page: { number: 0, size: 50, totalElements: 1, totalPages: 1 },
      }
    }
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  })
}

beforeEach(() => {
  sent = []
  ledgerAccounts = [
    {
      id: 3,
      accountIban: 'CH4431999123000889012',
      accountId: 5,
      accountNumber: '1020',
      accountName: 'Bankguthaben',
      active: true,
    },
  ]
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

async function render(movement: BookableMovement | null = RENT) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <AccountBookingDialog
          open
          tenantId={TENANT}
          movement={movement}
          onClose={() => {}}
          onSaved={() => {}}
        />
      </QueryClientProvider>,
    )
  })
  for (let round = 0; round < 5; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

const text = () => document.body.textContent ?? ''

const preview = () =>
  document.body.querySelector('[data-testid="booking-preview"]')?.textContent ?? ''

function fieldOf(label: string): HTMLSelectElement | HTMLInputElement {
  const found = [...document.body.querySelectorAll('select, input')].find((element) => {
    const id = element.getAttribute('id')
    return (
      id !== null &&
      document.body.querySelector(`label[for="${id}"]`)?.textContent?.includes(label) === true
    )
  })
  if (found === undefined) {
    throw new Error(`kein Feld «${label}»`)
  }
  return found as HTMLSelectElement | HTMLInputElement
}

function buttonOf(label: string): HTMLButtonElement {
  const found = [...document.body.querySelectorAll('button')].find(
    (element) => element.textContent?.trim() === label,
  )
  if (found === undefined) {
    throw new Error(`kein Knopf «${label}»`)
  }
  return found
}

async function choose(label: string, value: string) {
  const field = fieldOf(label)
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      field instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype,
      'value',
    )?.set
    setter?.call(field, value)
    field.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

describe('AccountBookingDialog', () => {
  /**
   * <b>The direction comes from `creditDebit`.</b> Rent going out books the chosen account in
   * the debit column and the bank in the credit one — reading it out of the amount, which is
   * never negative, would get every debit backwards.
   */
  it('accountBookingDialogShowsTheDirectionOfADebitTest', async () => {
    await render()

    await choose('Konto', '6000')

    const box = preview()
    expect(box).toContain('So wird gebucht')
    // Soll comes before Haben in the box, and the chosen account stands on the Soll line.
    expect(box.indexOf('6000')).toBeLessThan(box.indexOf('1020'))
    expect(box).toContain('Guthaben sinkt')
  })

  /** A credit is the other way round: the bank grows. */
  it('accountBookingDialogShowsTheDirectionOfACreditTest', async () => {
    await render({ ...RENT, creditDebit: 'CRDT' })

    await choose('Konto', '6000')

    const box = preview()
    expect(box.indexOf('1020')).toBeLessThan(box.indexOf('6000'))
    expect(box).toContain('Guthaben steigt')
  })

  /**
   * <b>Without a ledger account for the IBAN there is no other side</b>, so the dialog says so
   * and the button stays shut — instead of letting somebody fill the form for a refusal.
   */
  it('accountBookingDialogWithoutALedgerAccountTest', async () => {
    ledgerAccounts = []

    await render()

    expect(text()).toContain('fehlt das Fibu-Konto')
    expect(buttonOf('Buchen').disabled).toBe(true)
  })

  /** Nothing is sent before an account was picked. */
  it('accountBookingDialogNeedsAnAccountTest', async () => {
    await render()

    expect(buttonOf('Buchen').disabled).toBe(true)
  })

  /**
   * The code travels as a code, and only where one was picked: a movement without VAT sends
   * none rather than an empty string.
   */
  it('accountBookingDialogSendsTheChosenCodeTest', async () => {
    await render()
    await choose('Konto', '6000')
    await choose('Steuercode', 'VSI81')

    await act(async () => {
      buttonOf('Buchen').click()
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(sent).toHaveLength(1)
    expect(sent[0]?.url).toContain('/transactions/42/account-booking')
    expect(sent[0]?.body).toMatchObject({
      accountNumber: '6000',
      taxCode: 'VSI81',
      bookingDate: '2026-09-03',
      description: 'Miete September',
    })
  })
})
