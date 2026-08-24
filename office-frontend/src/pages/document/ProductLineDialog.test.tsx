// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../../auth/authContext'
import { originState } from '../../lib/origin'
import type { DocumentLine, Product } from '../../lib/types'
import { ProductLineDialog } from './ProductLineDialog'
import type { ProductLine } from './lineForm'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1
const PARTNER = 3
const BACK = originState('/auftraege/42', 'Auftrag')

const PRODUCTS: Product[] = [
  {
    id: 7,
    productNumber: 'P-100',
    name: 'Wartung',
    productType: 'SERVICE',
    unit: 'HOUR',
    unitLabel: 'Std',
    revenueAccount: '3400',
    revenueAccountLabel: 'Dienstleistungsertrag',
    vatCategory: 'STANDARD',
  },
  {
    id: 8,
    productNumber: 'P-200',
    name: 'Sonderteil',
    productType: 'GOODS',
    unit: 'PIECE',
    unitLabel: 'Stk',
    revenueAccount: '3000',
    vatCategory: 'STANDARD',
    discountable: false,
  },
]

let container: HTMLDivElement
let root: Root
/** True where the price resolution is refused, the way it is without `PRODUCT_READ`. */
let priceRefused = false
/** How long a line takes to be taken, so a test can press a key while one is on its way. */
let sendLatency = 0
/** True where the VAT rates of the day are refused, the way an unseeded day refuses them. */
let ratesRefused = false

/** What the inventory answers about the product the dialog works with. */
const AVAILABILITY = {
  productId: 7,
  stockManaged: true,
  onHand: 12,
  reserved: 4,
  availableQuantity: 8,
  locations: [
    { locationId: 1, locationName: 'Hauptlager', onHand: 12, reserved: 4, availableQuantity: 8 },
  ],
  heldBy: [{ documentNumber: 'AU-2026-0142', quantity: 4 }],
}

/** Answers every endpoint the dialog reads, caught at `fetch` rather than at `lib/api`. */
function stubFetch() {
  priceRefused = false
  sendLatency = 0
  ratesRefused = false
  vi.stubGlobal('fetch', (url: string) => {
    // The stock figures. Matched before "/products", which the path of the catalogue also
    // carries. The hit list asks for a whole list and gets an array; the fact box asks about
    // the one product it shows.
    if (url.includes('/inventory/availability')) {
      return json(url.includes('productIds=') ? [] : AVAILABILITY)
    }
    // Matched on the customer's price list, not on "/price": the route is
    // /partners/{id}/prices/{productId}, and "/products/" below would swallow it otherwise.
    if (url.includes('/prices/')) {
      const body = priceRefused
        ? { detail: 'Dafür fehlt die Berechtigung.' }
        : { productId: 7, partnerId: PARTNER, price: 120, origin: 'PARTNER', includesVat: false }
      return json(body, priceRefused ? 403 : 200)
    }
    if (url.includes('/vat-rates')) {
      return ratesRefused
        ? json({ detail: 'Kein Satz an diesem Tag.' }, 400)
        : json({ STANDARD: 8.1, REDUCED: 2.6 })
    }
    if (url.includes('/catalogues')) return json({ 'vat-category': [{ code: 'STANDARD', name: 'Normalsatz' }] })
    const single = /\/products\/(\d+)/.exec(url)
    if (single) return json(PRODUCTS.find((product) => String(product.id) === single[1]) ?? {})
    if (url.includes('/products')) {
      return json({
        content: PRODUCTS,
        page: 0,
        size: 20,
        totalElements: PRODUCTS.length,
        totalPages: 1,
        sort: '',
      })
    }
    return json({})
  })
}

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

/**
 * A session that may read the inventory, which is what the stock figures hang on.
 *
 * <p>The real application always has one; the components ask it before they fire a request
 * that would come back 403 for a user without the right.
 */
function auth(): AuthState {
  return {
    user: null,
    loading: false,
    signIn: () => Promise.reject(new Error('not in this test')),
    signOut: () => Promise.resolve(),
    switchTenant: () => Promise.resolve(),
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

/** What the dialog sent, so a test can check the position that went out. */
type Calls = { sent: ProductLine[]; closed: number }

/** Held here, not passed in: a component may not write to its own props. */
let calls: Calls

/**
 * The dialog with the `busy` flag wired to the request the way the order mask wires it: true
 * from the moment a line goes out until the backend has answered.
 */
function Harness({ line, refused }: { line?: DocumentLine; refused: boolean }) {
  const [busy, setBusy] = useState(false)
  return (
    <ProductLineDialog
      tenantId={TENANT}
      partnerId={PARTNER}
      documentDate="2026-08-21"
      currency="CHF"
      back={BACK}
      open
      onClose={() => {
        calls.closed += 1
      }}
      onSubmit={(sent) => {
        calls.sent.push(sent)
        setBusy(true)
        const answer = new Promise<void>((resolve, reject) => {
          setTimeout(
            () => (refused ? reject(new Error('Abgelehnt')) : resolve()),
            sendLatency,
          )
        })
        return answer.then(
          () => setBusy(false),
          (reason) => {
            setBusy(false)
            throw reason
          },
        )
      }}
      line={line}
      busy={busy}
    />
  )
}

async function render(line?: DocumentLine, refused = false): Promise<Calls> {
  calls = { sent: [], closed: 0 }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <MemoryRouter>
        <AuthContext.Provider value={auth()}>
          <QueryClientProvider client={client}>
            <Harness line={line} refused={refused} />
          </QueryClientProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
  })
  await settle()
  return calls
}

/** Waits out the debounce of the search field and the answers that follow it. */
async function settle(ms = 300) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms))
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

const text = () => container.textContent ?? ''
const options = () => [...container.querySelectorAll('[role="option"]')]

/** The control a form label points at. */
function field(label: string): HTMLInputElement {
  const owner = [...container.querySelectorAll('label')].find(
    (candidate) => candidate.textContent?.trim() === label,
  )
  const id = owner?.getAttribute('for')
  const control = id ? container.querySelector<HTMLInputElement>(`[id="${id}"]`) : null
  if (!control) throw new Error(`Kein Feld mit der Beschriftung "${label}"`)
  return control
}

function button(label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === label,
  )
  if (!found) throw new Error(`Kein Knopf mit der Aufschrift "${label}"`)
  return found
}

function click(element: HTMLElement) {
  act(() => {
    element.click()
  })
}

function type(control: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(control, value)
  act(() => {
    control.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function press(control: HTMLElement, key: string, modifier: 'ctrl' | undefined = undefined) {
  act(() => {
    control.dispatchEvent(
      new KeyboardEvent('keydown', { key, ctrlKey: modifier === 'ctrl', bubbles: true }),
    )
  })
}

/** What the block above the fields announces to a screen reader. */
const announced = () =>
  [...container.querySelectorAll('[aria-live="polite"]')]
    .map((one) => one.textContent ?? '')
    .join(' | ')

/** Picks the first hit of the quick search the way the keyboard does. */
function takeFirstProduct() {
  press(field('Produkt'), 'Enter')
}

describe('ProductLineDialog', () => {
  it('productLineDialogOpensWithTheFocusInTheSearchTest', async () => {
    await render()

    // Whoever opens this dialog wants to write a position, not read a heading.
    expect(document.activeElement).toBe(field('Produkt'))
    expect(options().length).toBeGreaterThan(0)
  })

  it('productLineDialogTakesAProductWithTheKeyboardTest', async () => {
    await render()

    takeFirstProduct()

    expect(field('Produkt').value).toBe('P-100 · Wartung')
    // Straight on to the quantity, with the figure selected so typing replaces it.
    expect(document.activeElement).toBe(field('Menge'))
    expect(field('Menge').selectionStart).toBe(0)
    expect(field('Menge').selectionEnd).toBe(1)
  })

  it('productLineDialogAddsWithEnterInTheQuantityTest', async () => {
    const calls = await render()

    takeFirstProduct()
    type(field('Menge'), '3')
    press(field('Menge'), 'Enter')
    await settle(0)

    expect(calls.sent).toEqual([
      { productId: 7, quantity: 3, serviceDateFrom: undefined, serviceDateTo: undefined },
    ])
    expect(calls.closed).toBe(1)
  })

  it('productLineDialogAddsAndStaysOpenTest', async () => {
    const calls = await render()

    takeFirstProduct()
    type(field('Menge'), '4')
    click(button('Hinzufügen und weiter'))
    await settle(0)

    expect(calls.sent).toHaveLength(1)
    expect(calls.sent[0].quantity).toBe(4)
    // Still open, cleared, and the focus back where the next position starts.
    expect(calls.closed).toBe(0)
    expect(field('Produkt').value).toBe('')
    expect(field('Menge').value).toBe('1')
    expect(document.activeElement).toBe(field('Produkt'))
    // And the catalogue is open again, so the next position starts where the last one did.
    expect(options().length).toBeGreaterThan(0)
  })

  it('productLineDialogAddsAndStaysOpenWithControlEnterTest', async () => {
    const calls = await render()

    takeFirstProduct()
    press(field('Menge'), 'Enter', 'ctrl')
    await settle(0)

    expect(calls.sent).toHaveLength(1)
    expect(calls.closed).toBe(0)
  })

  it('productLineDialogKeepsThePeriodOfSupplyForTheNextPositionTest', async () => {
    await render()

    click(button('Weitere Angaben'))
    type(field('Leistung von'), '2026-07-01')
    takeFirstProduct()
    click(button('Hinzufügen und weiter'))
    await settle(0)

    // The period belongs to the delivery, not to the single line, and is not typed ten times.
    expect(field('Leistung von').value).toBe('2026-07-01')
    // A discount does not carry over: it would end up on a position nobody meant to discount.
    expect(field('Rabatt in Prozent').value).toBe('')
  })

  it('productLineDialogWithoutAProductTest', async () => {
    await render()

    expect(button('Hinzufügen').disabled).toBe(true)
    expect(button('Hinzufügen und weiter').disabled).toBe(true)
  })

  it('productLineDialogShowsWhatIsKnownAboutTheProductTest', async () => {
    await render()

    takeFirstProduct()
    await settle(0)

    expect(text()).toContain('Std')
    expect(text()).toContain('3400')
    expect(text()).toContain('Dienstleistungsertrag')
    expect(text()).toContain('8.1 %')
    // The resolved price of this customer, and the rule that decided it.
    expect(text()).toContain('120.00 CHF')
    expect(text()).toContain('Kundenpreis')
  })

  it('productLineDialogWithoutAReadablePriceTest', async () => {
    priceRefused = true
    await render()

    takeFirstProduct()
    await settle(0)

    // Nothing rather than a zero: a price of 0.00 next to a product is a wrong statement.
    expect(text()).not.toContain('0.00')
    expect(text()).toContain('Std')
  })

  it('productLineDialogKeepsADiscountVisibleWhileFoldedTest', async () => {
    await render({
      lineNumber: 1,
      kind: 'ITEM',
      productId: 7,
      productNumber: 'P-100',
      description: 'Wartung',
      quantity: 2,
      discountPercent: 10,
      priceIncludesVat: false,
      lineNet: 0,
      lineVat: 0,
      lineGross: 0,
    })

    // A fold that hides a discount somebody set is a fold that hides an amount.
    expect(button('Weitere Angaben').getAttribute('aria-expanded')).toBe('true')
    expect(text()).toContain('Rabatt 10 %')

    click(button('Weitere Angaben'))

    expect(button('Weitere Angaben').getAttribute('aria-expanded')).toBe('false')
    expect(text()).toContain('Rabatt 10 %')
  })

  it('productLineDialogEditsAStoredLineTest', async () => {
    const calls = await render({
      lineNumber: 5,
      kind: 'ITEM',
      productId: 7,
      productNumber: 'P-100',
      description: 'Wartung Serverraum',
      quantity: 2,
      priceIncludesVat: false,
      lineNet: 0,
      lineVat: 0,
      lineGross: 0,
    })

    // What is on the document, not what the catalogue calls the product today.
    expect(field('Produkt').value).toBe('P-100 · Wartung Serverraum')
    expect(container.querySelector('[role="listbox"]')).toBeNull()
    // A line that is being edited is not added ten times over.
    expect(() => button('Hinzufügen und weiter')).toThrow()

    click(button('Übernehmen'))
    await settle(0)

    expect(calls.sent).toEqual([
      { productId: 7, quantity: 2, serviceDateFrom: undefined, serviceDateTo: undefined },
    ])
  })

  it('productLineDialogKeepsTheDialogOpenWhenTheLineIsRefusedTest', async () => {
    const calls = await render(undefined, true)

    takeFirstProduct()
    type(field('Menge'), '5')
    click(button('Hinzufügen'))
    await settle(0)

    // The dialog is the only place the typed values exist, so a refusal keeps them.
    expect(calls.sent).toHaveLength(1)
    expect(calls.closed).toBe(0)
    expect(field('Produkt').value).toBe('P-100 · Wartung')
    expect(field('Menge').value).toBe('5')
  })

  it('productLineDialogKeepsADiscountThatIsDroppedVisibleTest', async () => {
    await render({
      lineNumber: 1,
      kind: 'ITEM',
      // Marked as not discountable after the line had already been written with a discount.
      productId: 8,
      productNumber: 'P-200',
      description: 'Sonderteil',
      quantity: 3,
      discountPercent: 10,
      priceIncludesVat: false,
      lineNet: 0,
      lineVat: 0,
      lineGross: 0,
    })

    // The figure stays in the field but is not sent any more, so the amount of the line
    // rises. That warning must not sit behind a closed fold.
    expect(button('Weitere Angaben').getAttribute('aria-expanded')).toBe('true')
    expect(field('Rabatt in Prozent').disabled).toBe(true)
    expect(text()).toContain('Der gespeicherte Rabatt entfällt beim Übernehmen')
  })

  it('productLineDialogClosesOnEscapeTest', async () => {
    const calls = await render()

    // Escape closes the dialog, not just the open list: one key, one meaning.
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })

    expect(calls.closed).toBe(1)
  })

  it('productLineDialogSendsAPositionOnlyOnceWhileItIsOnItsWayTest', async () => {
    sendLatency = 50
    const calls = await render()

    takeFirstProduct()
    type(field('Menge'), '3')
    press(field('Menge'), 'Enter')
    press(field('Menge'), 'Enter')
    press(field('Menge'), 'Enter')

    // The buttons are locked while a line is on its way; the keyboard has to be too, or key
    // repeat alone puts the same position on the document three times.
    const sending = container.querySelector<HTMLButtonElement>('button[aria-busy="true"]')
    expect(sending?.disabled).toBe(true)
    expect(calls.sent).toHaveLength(1)

    await settle(100)

    expect(calls.sent).toHaveLength(1)
    expect(calls.closed).toBe(1)
  })

  it('productLineDialogAddsAPositionOnceOnADoubleClickTest', async () => {
    const calls = await render()

    takeFirstProduct()
    type(field('Menge'), '3')
    click(button('Hinzufügen'))
    await settle(0)

    // The backend has answered, so `busy` is false and the button is live again — and the box
    // is still on screen, because it only goes once it has faded out. That is the state the
    // second click of an ordinary double click arrives in.
    click(button('Hinzufügen'))
    await settle(0)

    expect(calls.sent).toHaveLength(1)
    expect(calls.closed).toBe(1)
  })

  it('productLineDialogAddsPositionAfterPositionTest', async () => {
    const calls = await render()

    takeFirstProduct()
    type(field('Menge'), '4')
    click(button('Hinzufügen und weiter'))
    await settle()

    takeFirstProduct()
    type(field('Menge'), '2')
    click(button('Hinzufügen und weiter'))
    await settle()

    // This is what "und weiter" is for: the dialog stays open and takes one position after
    // the other. A lock that never comes off again would end a document after its first line.
    expect(calls.sent).toHaveLength(2)
    expect(calls.sent[0].quantity).toBe(4)
    expect(calls.sent[1].quantity).toBe(2)
    expect(calls.closed).toBe(0)
  })

  it('productLineDialogSendsACorrectedPositionAfterARefusalTest', async () => {
    const calls = await render(undefined, true)

    takeFirstProduct()
    type(field('Menge'), '5')
    click(button('Hinzufügen'))
    await settle(0)

    // The backend said no and the dialog stayed open with everything in it. The lock has to
    // come off with the refusal, or the message names something nobody can put right.
    type(field('Menge'), '2')
    click(button('Hinzufügen'))
    await settle(0)

    expect(calls.sent).toHaveLength(2)
    expect(calls.sent[1].quantity).toBe(2)
    expect(calls.closed).toBe(0)
  })

  it('productLineDialogIgnoresARepeatedEnterTest', async () => {
    const calls = await render()

    takeFirstProduct()
    act(() => {
      field('Menge').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', repeat: true, bubbles: true }),
      )
    })

    expect(calls.sent).toEqual([])
  })

  it('productLineDialogAddsWithControlEnterInTheSearchTest', async () => {
    const calls = await render()

    // The shortcut is documented for the whole dialog. In the search field it used to take
    // the hit and add nothing, because the product of that render was still none.
    press(field('Produkt'), 'Enter', 'ctrl')
    await settle(0)

    expect(calls.sent).toEqual([
      { productId: 7, quantity: 1, serviceDateFrom: undefined, serviceDateTo: undefined },
    ])
    // Added and still open, which is what "und weiter" promises.
    expect(calls.closed).toBe(0)
    expect(field('Produkt').value).toBe('')
  })

  it('productLineDialogEditsAStoredLineWithTheFocusInTheQuantityTest', async () => {
    await render({
      lineNumber: 5,
      kind: 'ITEM',
      productId: 7,
      productNumber: 'P-100',
      description: 'Wartung Serverraum',
      quantity: 2,
      priceIncludesVat: false,
      lineNet: 0,
      lineVat: 0,
      lineGross: 0,
    })

    // In the search field the first keystroke would give the product up, and only picking it
    // from the catalogue again would bring it back. Whoever edits a line wants the quantity.
    expect(document.activeElement).toBe(field('Menge'))
    expect(field('Produkt').value).toBe('P-100 · Wartung Serverraum')
  })

  it('productLineDialogNamesThePriceAsAUnitPriceTest', async () => {
    await render()

    takeFirstProduct()
    await settle(0)

    // "Preis" next to the quantity field reads as the amount of the line; the figure is per
    // unit. And a net price says so rather than leaving it to be read as one.
    expect(text()).toContain('Einzelpreis')
    expect(text()).toContain('exkl. MwSt')
  })

  it('productLineDialogAnnouncesTheProductThatWasTakenTest', async () => {
    await render()

    takeFirstProduct()
    await settle(0)

    // The focus jumps to the quantity, so unit, revenue account, VAT and price appear above
    // a field nobody is on and are never read out otherwise.
    expect(announced()).toContain('Wartung')
    expect(announced()).toContain('Einzelpreis 120.00 CHF')
  })

  it('productLineDialogSaysWhenThePriceCouldNotBeReadTest', async () => {
    priceRefused = true
    await render()

    takeFirstProduct()
    await settle(0)

    // Still no zero, but no silently missing line either.
    expect(text()).not.toContain('0.00')
    expect(text()).toContain('Der Preis konnte nicht gelesen werden.')
  })

  it('productLineDialogSaysWhenTheVatRateCouldNotBeReadTest', async () => {
    ratesRefused = true
    await render()

    takeFirstProduct()
    await settle(0)

    // Falling back to the bare name of the treatment looks like a valid answer. It is not:
    // the rates of that day could not be read at all.
    expect(text()).toContain('Satz konnte nicht gelesen werden.')
  })

  it('productLineDialogSaysThatADroppedDiscountIsNotADiscountTest', async () => {
    await render({
      lineNumber: 1,
      kind: 'ITEM',
      productId: 8,
      productNumber: 'P-200',
      description: 'Sonderteil',
      quantity: 3,
      discountPercent: 10,
      priceIncludesVat: false,
      lineNet: 0,
      lineVat: 0,
      lineGross: 0,
    })

    click(button('Weitere Angaben'))

    // Folded away the warning next to the field is out of sight. A chip saying "Rabatt 10 %"
    // would then claim a discount that is not sent.
    expect(button('Weitere Angaben').getAttribute('aria-expanded')).toBe('false')
    expect(text()).toContain('Rabatt entfällt')
    expect(text()).not.toContain('Rabatt 10 %')
  })

  it('productLineDialogRefusesADiscountThatIsNotANumberTest', async () => {
    const calls = await render()

    takeFirstProduct()
    click(button('Weitere Angaben'))
    type(field('Rabatt in Prozent'), '10%')

    // Sending nothing instead would raise the amount of the line by ten per cent without
    // anything in the mask saying so.
    expect(text()).toContain('Der Rabatt ist keine Zahl.')
    expect(button('Hinzufügen').disabled).toBe(true)

    press(field('Menge'), 'Enter')

    expect(calls.sent).toEqual([])
  })

  it('productLineDialogSaysThePriceIsForOneUnitOnANegativeQuantityTest', async () => {
    await render()

    takeFirstProduct()
    type(field('Menge'), '-1')
    await settle()

    // A returned item carries a negative quantity, and no price band applies to one. The
    // dialog asks for a single unit instead, and has to say that it did.
    expect(text()).toContain('für eine Einheit')
  })

  it('productLineDialogRefusesAQuantityOfZeroTest', async () => {
    const calls = await render()

    takeFirstProduct()
    type(field('Menge'), '0')

    expect(button('Hinzufügen').disabled).toBe(true)
    expect(text()).toContain('Die Menge darf nicht null sein.')

    press(field('Menge'), 'Enter')

    expect(calls.sent).toEqual([])
  })
})
