// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../../auth/authContext'
import { originState } from '../../lib/origin'
import type { DocumentLine, LotProposal, Product, StockEffect } from '../../lib/types'
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
    tracking: 'NONE',
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
  {
    id: 9,
    productNumber: 'P-300',
    name: 'Bohrmaschine',
    productType: 'GOODS',
    unit: 'PIECE',
    unitLabel: 'Stk',
    revenueAccount: '3000',
    vatCategory: 'STANDARD',
    tracking: 'SERIAL',
  },
]

/** The serial numbers the delivering store holds, in the order the server offers them. */
const SERIALS_IN_STOCK = ['SN-4711', 'SN-4712', 'SN-4713']

/** What the movement journal says went out on a document, for the return line. */
const ISSUED = [
  { lotNumber: 'SN-4720', quantity: 1, bookedOn: '2026-08-21', documentNumber: 'LS-2026-0002' },
]

/**
 * What the server suggests taking, as the proposal of the inventory answers it.
 *
 * <p>One line per number that lies at the location and what it cannot cover — three pieces
 * against a position of five leave two that somebody has to name themselves.
 *
 * @param url the request, whose `quantity` decides how much is proposed
 */
function lotProposal(url: string): LotProposal {
  const asked = Number(/quantity=(\d+)/.exec(url)?.[1] ?? 0)
  return {
    lines: SERIALS_IN_STOCK.map((lotNumber, index) => ({
      lotId: 70 + index,
      lotNumber,
      expiryDate: null,
      expired: false,
      available: 1,
      proposed: index < asked ? 1 : 0,
    })),
    withoutNumber: {
      lotId: null,
      lotNumber: null,
      expiryDate: null,
      expired: false,
      available: 0,
      proposed: 0,
    },
    uncovered: Math.max(0, asked - SERIALS_IN_STOCK.length),
  }
}

let container: HTMLDivElement
let root: Root
/** True where the price resolution is refused, the way it is without `PRODUCT_READ`. */
let priceRefused = false
/** How long a line takes to be taken, so a test can press a key while one is on its way. */
let sendLatency = 0
/** True where the VAT rates of the day are refused, the way an unseeded day refuses them. */
let ratesRefused = false
/**
 * While set, the answer about the stored product waits for this, so a test can act in the
 * window in which the dialog knows the product only by its id.
 */
let productGate: Promise<void> | null = null
/** True where the catalogue is refused, the way it is for a clerk without `PRODUCT_READ`. */
let productRefused = false

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
  productGate = null
  productRefused = false
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
    // Matched before the single product below, whose path this one carries as well.
    if (url.includes('/lot-proposal')) return json(lotProposal(url))
    if (url.includes('/issued-lots')) return json(ISSUED)
    const single = /\/products\/(\d+)/.exec(url)
    if (single) {
      const answer = () =>
        productRefused
          ? json({ detail: 'Dafür fehlt die Berechtigung.' }, 403)
          : json(PRODUCTS.find((product) => String(product.id) === single[1]) ?? {})
      return productGate === null ? answer() : productGate.then(answer)
    }
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
    completeSecondFactor: () => Promise.reject(new Error('not in this test')),
    sendSecondFactorCode: () => Promise.resolve(),
    adoptSession: () => {},
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

/** What the dialog sent, so a test can check the position that went out. */
type Calls = { sent: ProductLine[]; closed: number }

/** Held here, not passed in: a component may not write to its own props. */
let calls: Calls

/**
 * What the kind of document does to the stock, and which store it delivers from. Left out the
 * dialog knows of neither, which is how an Offerte opens it.
 */
type Stock = { stockEffect?: StockEffect; stockLocationId?: number }

/**
 * The dialog with the `busy` flag wired to the request the way the order mask wires it: true
 * from the moment a line goes out until the backend has answered.
 */
function Harness({ line, refused, stock }: { line?: DocumentLine; refused: boolean; stock: Stock }) {
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
      stockLocationId={stock.stockLocationId}
      stockEffect={stock.stockEffect}
    />
  )
}

async function render(line?: DocumentLine, refused = false, stock: Stock = {}): Promise<Calls> {
  calls = { sent: [], closed: 0 }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <MemoryRouter>
        <AuthContext.Provider value={auth()}>
          <QueryClientProvider client={client}>
            <Harness line={line} refused={refused} stock={stock} />
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

/**
 * Every line in the dialog that counts the pieces of this position: the one over the block and
 * the one the collecting field draws under it.
 *
 * <p>They stand three lines apart and must never say different things — a reader who sees
 * «offen 2» over «offen 0» has no way of telling which one is lying.
 */
const counters = () =>
  text().match(
    /Menge (?:—|[\d’.]+) · zugeordnet [\d’.]+ · (?:offen [\d’.]+|[\d’.]+ zu viel)/g,
  ) ?? []

/**
 * The red lines in the dialog.
 *
 * <p>Read off the elements rather than out of the page text: a refusal also stands in the
 * region that speaks to a screen reader, and that one is never taken back — a test on the page
 * text would find it there and never see the line go.
 */
const refusals = () =>
  [...container.querySelectorAll('p.text-danger')].map((one) => one.textContent ?? '')

/** Picks the first hit of the quick search the way the keyboard does. */
function takeFirstProduct() {
  press(field('Produkt'), 'Enter')
}

/** Picks a named hit of the quick search the way the mouse does. */
function takeProduct(name: string) {
  const hit = options().find((one) => one.textContent?.includes(name))
  if (!hit) throw new Error(`Kein Treffer mit dem Namen "${name}"`)
  click(hit as HTMLElement)
}

/** Sends one serial number the way a hand scanner does: the number, then Enter. */
function scan(lotNumber: string) {
  type(field('Seriennummer'), lotNumber)
  press(field('Seriennummer'), 'Enter')
}

/** Takes one number over out of the list of what last went out. */
function pick(lotNumber: string) {
  const found = container.querySelector<HTMLButtonElement>(
    `[aria-label="${lotNumber} übernehmen"]`,
  )
  if (!found) throw new Error(`Keine angebotene Nummer "${lotNumber}"`)
  click(found)
}

/** Takes one number back the way the "×" on its chip does. */
function removeChip(lotNumber: string) {
  const found = container.querySelector<HTMLButtonElement>(`[aria-label="${lotNumber} entfernen"]`)
  if (!found) throw new Error(`Kein Chip mit der Nummer "${lotNumber}"`)
  click(found)
}

/** A stored position of five pieces, each with the number it was written with. */
function storedSerialLine(): DocumentLine {
  return {
    lineNumber: 1,
    kind: 'ITEM',
    productId: 9,
    productNumber: 'P-300',
    description: 'Bohrmaschine',
    quantity: 5,
    priceIncludesVat: false,
    lineNet: 0,
    lineVat: 0,
    lineGross: 0,
    lots: ['SN-4711', 'SN-4712', 'SN-4713', 'SN-9001', 'SN-9002'].map((lotNumber) => ({
      lotNumber,
      tracking: 'SERIAL' as const,
      quantity: 1,
    })),
  }
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

  it('productLineDialogBlocksASerialPositionWhileNumbersAreOpenTest', async () => {
    const calls = await render(undefined, false, { stockEffect: 'ISSUE', stockLocationId: 1 })

    takeProduct('Bohrmaschine')
    type(field('Menge'), '5')
    await settle()

    // The store holds three of the five pieces, so two carry no number yet. That stands in
    // the mask before anything is pressed, and the button is dark while it does — a rule that
    // only speaks after the click teaches people to guess.
    expect(announced()).toContain('Menge 5 · zugeordnet 3 · offen 2')
    expect(text()).toContain('Noch 2 ohne Nummer.')
    expect(button('Hinzufügen').disabled).toBe(true)
    expect(button('Hinzufügen und weiter').disabled).toBe(true)

    press(field('Menge'), 'Enter')
    await settle(0)

    // Enter in the quantity adds a position — the keyboard must not walk past the lock the
    // button carries.
    expect(calls.sent).toEqual([])
  })

  it('productLineDialogSendsTheNumbersOfASerialPositionTest', async () => {
    const calls = await render(undefined, false, { stockEffect: 'ISSUE', stockLocationId: 1 })

    takeProduct('Bohrmaschine')
    type(field('Menge'), '3')
    await settle()

    expect(announced()).toContain('Menge 3 · zugeordnet 3 · offen 0')
    expect(button('Hinzufügen').disabled).toBe(false)

    press(field('Menge'), 'Enter')
    await settle(0)

    // Three pieces, three numbers, and they travel in the body of the position: one piece per
    // serial number.
    expect(calls.sent).toEqual([
      {
        productId: 9,
        quantity: 3,
        serviceDateFrom: undefined,
        serviceDateTo: undefined,
        lots: [
          { lotNumber: 'SN-4711', quantity: 1 },
          { lotNumber: 'SN-4712', quantity: 1 },
          { lotNumber: 'SN-4713', quantity: 1 },
        ],
      },
    ])
    expect(calls.closed).toBe(1)
  })

  it('productLineDialogOffersWhatWentOutOnAReturnLineTest', async () => {
    const calls = await render(undefined, false, { stockEffect: 'ISSUE', stockLocationId: 1 })

    takeProduct('Bohrmaschine')
    type(field('Menge'), '-1')
    await settle()

    // A negative position is a return. It is offered the number that went out on a document,
    // with that document next to it — and not a generator, which would invent a number for a
    // piece that exists (decision of the Product Owner, backend ADR-0069).
    expect(text()).toContain('Zuletzt ausgeliefert')
    expect(text()).toContain('SN-4720')
    expect(text()).toContain('LS-2026-0002 · 21.08.2026')

    pick('SN-4720')

    expect(announced()).toContain('Menge 1 · zugeordnet 1 · offen 0')

    press(field('Menge'), 'Enter')
    await settle(0)

    // Signed like the line: the piece comes back in.
    expect(calls.sent).toEqual([
      {
        productId: 9,
        quantity: -1,
        serviceDateFrom: undefined,
        serviceDateTo: undefined,
        lots: [{ lotNumber: 'SN-4720', quantity: -1 }],
      },
    ])
  })

  /**
   * «Hinzufügen und weiter» takes the numbers with it, and the next position must not get them.
   *
   * <p>The reset clears the product, the term and the quantity, and the collecting field goes
   * with them — so nothing ever tells the dialog that the numbers are gone too. Pressing
   * Strg+Enter on the same product again sends before the field is even mounted, and the same
   * serial number stands on two positions. The user first learns of it as a 409 at
   * «Ausstellen», naming a number they never picked.
   */
  it('productLineDialogDropsTheNumbersWhenItStaysOpenForTheNextPositionTest', async () => {
    const calls = await render(undefined, false, { stockEffect: 'ISSUE', stockLocationId: 1 })

    takeProduct('Bohrmaschine')
    await settle()

    // One piece, one number, seeded from the proposal.
    expect(text()).toContain('SN-4711')

    press(field('Menge'), 'Enter', 'ctrl')
    await settle(0)
    await settle()

    expect(calls.sent[0].lots).toEqual([{ lotNumber: 'SN-4711', quantity: 1 }])
    // Cleared for the next position, and the block is not drawn while no product is chosen.
    expect(field('Produkt').value).toBe('')
    expect(text()).not.toContain('SN-4711')

    // The same product again, taken and added in one keystroke: the position goes out in the
    // same tick, long before the collecting field could mount and say what it holds.
    press(field('Produkt'), 'ArrowDown')
    press(field('Produkt'), 'ArrowDown')
    press(field('Produkt'), 'Enter', 'ctrl')
    await settle(0)

    expect(calls.sent).toHaveLength(2)
    expect(calls.sent[1].productId).toBe(9)
    // Nothing was picked for this one, so nothing travels with it. Sending SN-4711 again would
    // put the same piece on two positions.
    expect(calls.sent[1].lots).toBeUndefined()
  })

  it('productLineDialogWarnsAboutANumberThatNeverWentOutTest', async () => {
    const calls = await render(undefined, false, { stockEffect: 'ISSUE', stockLocationId: 1 })

    takeProduct('Bohrmaschine')
    type(field('Menge'), '-1')
    await settle()

    scan('SN-9001')

    // Warned and taken: on a return the choice is free, and whoever holds the goods knows
    // more about them than the journal does.
    expect(text()).toContain('SN-9001 ist nicht unter den zuletzt ausgelieferten Nummern.')
    expect(announced()).toContain('Menge 1 · zugeordnet 1 · offen 0')
    expect(button('Hinzufügen').disabled).toBe(false)

    press(field('Menge'), 'Enter')
    await settle(0)

    expect(calls.sent).toEqual([
      {
        productId: 9,
        quantity: -1,
        serviceDateFrom: undefined,
        serviceDateTo: undefined,
        lots: [{ lotNumber: 'SN-9001', quantity: -1 }],
      },
    ])
  })

  it('productLineDialogTakesANumberTheStoreListedButDidNotProposeTest', async () => {
    const calls = await render(undefined, false, { stockEffect: 'ISSUE', stockLocationId: 1 })

    takeProduct('Bohrmaschine')
    type(field('Menge'), '2')
    await settle()

    // The store holds three pieces and two are proposed; the third is listed for whoever
    // wants to send that one instead. Without it a position can only ever be what FEFO named.
    expect(announced()).toContain('Menge 2 · zugeordnet 2 · offen 0')

    removeChip('SN-4711')
    expect(announced()).toContain('Menge 2 · zugeordnet 1 · offen 1')

    scan('SN-4713')

    expect(announced()).toContain('Menge 2 · zugeordnet 2 · offen 0')
    expect(text()).not.toContain('bereits erfasst')

    press(field('Menge'), 'Enter')
    await settle(0)

    expect(calls.sent).toEqual([
      {
        productId: 9,
        quantity: 2,
        serviceDateFrom: undefined,
        serviceDateTo: undefined,
        lots: [
          { lotNumber: 'SN-4712', quantity: 1 },
          { lotNumber: 'SN-4713', quantity: 1 },
        ],
      },
    ])
  })

  it('productLineDialogRefusesANumberThatIsNotInStockTest', async () => {
    await render(undefined, false, { stockEffect: 'ISSUE', stockLocationId: 1 })

    takeProduct('Bohrmaschine')
    type(field('Menge'), '5')
    await settle()
    scan('SN-9001')

    // A number the store does not hold is not counted down quietly: it would be refused on
    // issuing, long after whoever scanned it has moved on (issue #21, Nachtrag). The reason
    // stays open, because the proposal leaves out the blocked numbers as well as the missing
    // ones — «nicht im Bestand» would be a wrong reason for a right refusal.
    expect(refusals()).toEqual([
      'SN-9001 ist an diesem Lagerort nicht verfügbar: kein Bestand oder gesperrt.',
    ])
    expect(announced()).toContain('Menge 5 · zugeordnet 3 · offen 2')
    expect(button('Hinzufügen').disabled).toBe(true)

    // And the quantity is the other way of answering it: the pick the number was refused
    // against is gone, and a red line that outlives its reason complains about nothing.
    type(field('Menge'), '3')
    await settle()

    expect(refusals()).toEqual([])
  })

  /**
   * The line turns from an issue into a return while a number is already picked for the issue.
   *
   * <p>SN-4711 lies in the store and never left it, so it cannot be a piece coming back — and
   * the two counters, the one over the block and the one under it, must not end up counting the
   * same chip with opposite signs.
   */
  it('productLineDialogClearsTheOutgoingPickWhenTheLineTurnsIntoAReturnTest', async () => {
    await render(undefined, false, { stockEffect: 'ISSUE', stockLocationId: 1 })

    takeProduct('Bohrmaschine')
    // The quantity starts at one, so the proposal for the issue lands and seeds a chip before
    // anything is typed. Typing the minus in the same breath would hide the whole defect.
    await settle()
    expect(text()).toContain('SN-4711')
    expect(counters()).toEqual(['Menge 1 · zugeordnet 1 · offen 0', 'Menge 1 · zugeordnet 1 · offen 0'])

    type(field('Menge'), '-1')
    await settle()

    expect(text()).toContain('Zuletzt ausgeliefert')
    expect(text()).not.toContain('SN-4711')
    expect(counters()).toEqual(['Menge 1 · zugeordnet 0 · offen 1', 'Menge 1 · zugeordnet 0 · offen 1'])
    expect(text()).toContain('Noch 1 ohne Nummer.')
    expect(button('Hinzufügen').disabled).toBe(true)

    pick('SN-4720')
    await settle()

    expect(counters()).toEqual(['Menge 1 · zugeordnet 1 · offen 0', 'Menge 1 · zugeordnet 1 · offen 0'])
    expect(button('Hinzufügen').disabled).toBe(false)
  })

  /**
   * The details of the stored product are still on their way. Nothing in the dialog can then
   * tell a followed product from a plain one, and saving in that window used to send a position
   * without a single number — wiping what the line carried, without a word.
   */
  it('productLineDialogWaitsForTheProductBeforeSavingAStoredNumberTest', async () => {
    let arrive: () => void = () => undefined
    productGate = new Promise<void>((resolve) => {
      arrive = resolve
    })

    const calls = await render(storedSerialLine(), false, {
      stockEffect: 'ISSUE',
      stockLocationId: 1,
    })

    expect(button('Übernehmen').disabled).toBe(true)

    // And the keyboard walks past no lock the button carries.
    press(field('Menge'), 'Enter')
    await settle(0)
    expect(calls.sent).toEqual([])

    await act(async () => {
      arrive()
    })
    await settle()

    expect(button('Übernehmen').disabled).toBe(false)

    click(button('Übernehmen'))
    await settle(0)

    expect(calls.sent[0].lots).toHaveLength(5)
  })

  /**
   * A document clerk without `PRODUCT_READ` never learns what the product is. The block cannot
   * be drawn, and the numbers the line carries have to travel untouched all the same — a
   * position that quietly loses them is a data loss nobody would ever see.
   */
  it('productLineDialogKeepsTheStoredNumbersWithoutTheRightToReadTheProductTest', async () => {
    productRefused = true

    const calls = await render(storedSerialLine(), false, {
      stockEffect: 'ISSUE',
      stockLocationId: 1,
    })

    expect(text()).not.toContain('Seriennummer')
    expect(button('Übernehmen').disabled).toBe(false)

    click(button('Übernehmen'))
    await settle(0)

    expect(calls.sent).toEqual([
      {
        productId: 9,
        quantity: 5,
        serviceDateFrom: undefined,
        serviceDateTo: undefined,
        lots: ['SN-4711', 'SN-4712', 'SN-4713', 'SN-9001', 'SN-9002'].map((lotNumber) => ({
          lotNumber,
          quantity: 1,
        })),
      },
    ])
  })

  it('productLineDialogDropsTheNumbersWhenTheProductChangesTest', async () => {
    const calls = await render(storedSerialLine(), false, {
      stockEffect: 'ISSUE',
      stockLocationId: 1,
    })

    expect(announced()).toContain('Menge 5 · zugeordnet 5 · offen 0')

    type(field('Produkt'), 'Wartung')
    await settle()
    takeProduct('Wartung')
    await settle()

    // The numbers name pieces lying under the product they were picked for. Carried over,
    // they would travel to an endpoint that refuses them, with a message about numbers the
    // mask no longer shows.
    expect(text()).not.toContain('Seriennummer')
    expect(button('Übernehmen').disabled).toBe(false)

    click(button('Übernehmen'))
    await settle(0)

    expect(calls.sent).toEqual([
      { productId: 7, quantity: 5, serviceDateFrom: undefined, serviceDateTo: undefined },
    ])
  })

  it('productLineDialogKeepsTheStoredNumbersOfAPositionTest', async () => {
    const stored = ['SN-4711', 'SN-4712', 'SN-4713', 'SN-9001', 'SN-9002']
    const calls = await render(
      {
        lineNumber: 1,
        kind: 'ITEM',
        productId: 9,
        productNumber: 'P-300',
        description: 'Bohrmaschine',
        quantity: 5,
        priceIncludesVat: false,
        lineNet: 0,
        lineVat: 0,
        lineGross: 0,
        lots: stored.map((lotNumber) => ({ lotNumber, tracking: 'SERIAL' as const, quantity: 1 })),
      },
      false,
      { stockEffect: 'ISSUE', stockLocationId: 1 },
    )

    // What is on the document is what was agreed. Opening the position again must not quietly
    // hand it the fresh pick of today — two of these numbers have long left the store, and
    // being offered three instead would lock a position that is complete.
    expect(announced()).toContain('Menge 5 · zugeordnet 5 · offen 0')
    expect(text()).toContain('SN-9002')
    expect(button('Übernehmen').disabled).toBe(false)

    click(button('Übernehmen'))
    await settle(0)

    expect(calls.sent).toEqual([
      {
        productId: 9,
        quantity: 5,
        serviceDateFrom: undefined,
        serviceDateTo: undefined,
        lots: stored.map((lotNumber) => ({ lotNumber, quantity: 1 })),
      },
    ])
  })

  it('productLineDialogAsksForNoNumberOnAnUntrackedProductTest', async () => {
    const calls = await render(undefined, false, { stockEffect: 'ISSUE', stockLocationId: 1 })

    takeFirstProduct()
    type(field('Menge'), '5')
    await settle()

    // A product nobody follows has no number to give, and the dialog looks exactly as it did
    // before any of this existed — not even the line that counts the pieces.
    expect(text()).not.toContain('zugeordnet')
    expect(text()).not.toContain('Seriennummer')
    expect(button('Hinzufügen').disabled).toBe(false)

    press(field('Menge'), 'Enter')
    await settle(0)

    expect(calls.sent).toEqual([
      { productId: 7, quantity: 5, serviceDateFrom: undefined, serviceDateTo: undefined },
    ])
  })

  it('productLineDialogAsksForNoNumberWhereNothingIsBookedTest', async () => {
    await render(undefined, false, { stockEffect: 'NONE', stockLocationId: 1 })

    takeProduct('Bohrmaschine')
    type(field('Menge'), '5')
    await settle()

    // An Offerte moves nothing, so it asks for nothing — not even for a product that is
    // followed piece by piece. The numbers are named on the document that books them out.
    expect(field('Produkt').value).toBe('P-300 · Bohrmaschine')
    expect(text()).not.toContain('zugeordnet')
    expect(text()).not.toContain('Seriennummer')
    // And it goes out: a lock over numbers nobody asked for is a dialog that refuses without
    // a word, since the block that would explain it is not drawn here at all.
    expect(button('Hinzufügen').disabled).toBe(false)
  })
})
