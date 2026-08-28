// @vitest-environment jsdom
import { act, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  IssuedLot,
  Lot,
  LotAllocation,
  LotProposal,
  Product,
  StockBalance,
  StockLocation,
} from '../../lib/types'
import { BookStockDialog } from './BookStockDialog'
import { LotAllocationField } from './LotAllocationField'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1

/** A product nobody tracks: no number anywhere in the dialog. */
const PLAIN: Product = {
  id: 42,
  productNumber: 'P-001',
  name: 'Schraube',
  productType: 'GOODS',
  unit: 'PIECE',
  vatCategory: 'STANDARD',
  stockManaged: true,
  tracking: 'NONE',
}

/** A product kept in batches, the everyday case for food and chemicals. */
const BATCHED: Product = { ...PLAIN, id: 43, productNumber: 'P-002', name: 'Farbe', tracking: 'LOT' }

/** A product kept piece by piece, each with its own number. */
const SERIALISED: Product = {
  ...PLAIN,
  id: 44,
  productNumber: 'P-003',
  name: 'Messgerät',
  tracking: 'SERIAL',
}

const MAIN: StockLocation = { id: 1, code: 'HAUPT', name: 'Hauptlager', defaultLocation: true }

const BALANCES: StockBalance[] = [
  {
    productId: 43,
    locationId: 1,
    quantity: 12,
    reservedQuantity: 0,
    availableQuantity: 12,
    productName: 'Farbe',
    unitShortName: 'Stk',
  },
]

/** Three of the batch that runs out first, the rest out of the next one. */
const PROPOSAL: LotProposal = {
  lines: [
    {
      lotId: 7,
      lotNumber: 'CH-A',
      expiryDate: '2026-09-30',
      expired: false,
      available: 3,
      proposed: 3,
    },
    {
      lotId: 8,
      lotNumber: 'CH-B',
      expiryDate: '2026-12-31',
      expired: false,
      available: 9,
      proposed: 2,
    },
  ],
  withoutNumber: {
    lotId: null,
    lotNumber: null,
    expiryDate: null,
    expired: false,
    available: 0,
    proposed: 0,
  },
  uncovered: 0,
}

const KNOWN_LOTS: Lot[] = [
  {
    id: 7,
    productId: 43,
    kind: 'LOT',
    lotNumber: 'CH-A',
    expiryDate: '2026-09-30',
    expired: false,
    blocked: false,
    quantity: 3,
    locations: [{ locationId: 1, locationName: 'Hauptlager', quantity: 3 }],
  },
]

let container: HTMLDivElement
let root: Root

/** The changeover case: everything at the location lies there from before the tracking. */
const WITHOUT_NUMBER: LotProposal = {
  lines: [],
  withoutNumber: {
    lotId: null,
    lotNumber: null,
    expiryDate: null,
    expired: false,
    available: 8,
    proposed: 2,
  },
  uncovered: 0,
}

/** The four pieces of the serialised product that lie at the location, in the offered order. */
const SERIAL_NUMBERS = ['SN-1', 'SN-2', 'SN-3', 'SN-4']

/**
 * What the server suggests taking out of a serialised product.
 *
 * <p>Every number at the location is in it, whether it is proposed or not: an expired one, and
 * everything beyond the asked quantity. That is what makes another choice possible at all.
 *
 * @param proposed how many of the numbers carry a proposal
 * @param expired which of them are past their date, and therefore proposed with nothing
 */
function serialProposal(proposed = 2, expired: readonly string[] = []): LotProposal {
  return {
    lines: SERIAL_NUMBERS.map((lotNumber, index) => ({
      lotId: 70 + index,
      lotNumber,
      expiryDate: expired.includes(lotNumber) ? '2026-01-31' : null,
      expired: expired.includes(lotNumber),
      available: 1,
      proposed: index < proposed && !expired.includes(lotNumber) ? 1 : 0,
    })),
    withoutNumber: {
      lotId: null,
      lotNumber: null,
      expiryDate: null,
      expired: false,
      available: 0,
      proposed: 0,
    },
    uncovered: 0,
  }
}

/**
 * The numbers a stored position carries, none of which the store holds any more.
 *
 * <p>Deliberately none of {@link SERIAL_NUMBERS}: a proposal that happened to name the same
 * pieces would answer the same either way and hide every replacement.
 */
const STORED_SERIALS = ['SN-4711', 'SN-4712', 'SN-4713', 'SN-4714', 'SN-4715']

/** The same four pieces as the lot list answers them, for «Aus Bestand wählen». */
const SERIAL_LOTS: Lot[] = SERIAL_NUMBERS.map((lotNumber, index) => ({
  id: 70 + index,
  productId: 44,
  kind: 'SERIAL' as const,
  lotNumber,
  expiryDate: null,
  expired: false,
  blocked: false,
  quantity: 1,
  locations: [{ locationId: 1, locationName: 'Hauptlager', quantity: 1 }],
}))

/**
 * Answers the take-out of the serialised product.
 *
 * @param proposal what the server suggests taking
 * @param hold true keeps the proposal on its way until the returned function is called, so a
 *             test can act while the field is drawn but the answer is not there yet
 * @returns the release of a held back proposal
 */
function stubSerialFetch(proposal: LotProposal = serialProposal(), hold = false): () => void {
  let release: () => void = () => undefined
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  vi.stubGlobal('fetch', (url: string) => {
    const body = url.includes('/lot-proposal')
      ? proposal
      : url.includes('/lots')
        ? { content: SERIAL_LOTS, page: 0, size: 20, totalElements: 4, totalPages: 1, sort: '' }
        : []
    const answer = () =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    if (hold && url.includes('/lot-proposal')) return held.then(answer)
    return Promise.resolve(answer())
  })
  return release
}

/** What the journal answers about a serialised product that was delivered twice. */
const ISSUED: IssuedLot[] = [
  { lotNumber: 'SN-4711', quantity: 1, bookedOn: '2026-08-21', documentNumber: 'LS-2026-0002' },
  { lotNumber: 'SN-4712', quantity: 1, bookedOn: '2026-08-20', documentNumber: 'LS-2026-0001' },
]

/**
 * Answers a return: what last went out, plus the lot list nobody should be reading here.
 *
 * <p>The lot list stays on purpose. A return offers the numbers that were delivered, and the
 * batches that happen to lie on the shelf are exactly what it must not offer.
 *
 * @param issued what the journal says last went out
 * @param lying which numbers lie somewhere, by number and location. Everything else is answered
 *              without a location — a batch, a number nobody wrote down and one that lies
 *              nowhere all come back that way (backend ADR-0081)
 * @returns the addresses that were asked, in the order they were asked
 */
function stubIssuedFetch(issued: IssuedLot[], lying: Record<string, string> = {}): string[] {
  const asked: string[] = []
  vi.stubGlobal('fetch', (url: string) => {
    asked.push(url)
    // Matched without regard to case and answered with the spelling the lot master holds, the
    // way the server does it — the field asks with the number lower-cased.
    const asking = decodeURIComponent(url.split('lotNumber=')[1] ?? '')
    const stored = Object.keys(lying).find(
      (one) => one.toLocaleLowerCase('de-CH') === asking.toLocaleLowerCase('de-CH'),
    )
    const body = url.includes('/issued-lots')
      ? issued
      : url.includes('/serial-number-holding')
        ? { lotNumber: stored ?? asking, locationName: stored === undefined ? null : lying[stored] }
        : url.includes('/lots')
          ? { content: KNOWN_LOTS, page: 0, size: 20, totalElements: 1, totalPages: 1, sort: '' }
          : []
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  })
  return asked
}

function stubFetch(proposal: LotProposal = PROPOSAL) {
  vi.stubGlobal('fetch', (url: string) => {
    const body = url.includes('/lot-proposal')
      ? proposal
      : url.includes('/lots')
        ? { content: KNOWN_LOTS, page: 0, size: 20, totalElements: 1, totalPages: 1, sort: '' }
        : url.includes('/inventory/balances')
          ? BALANCES
          : url.includes('/catalogues')
            ? { 'movement-reason': [{ code: 'RECEIPT', name: 'Wareneingang' }] }
            : url.includes('/products')
              ? { content: [], page: 0, size: 20, totalElements: 0, totalPages: 0, sort: '' }
              : []
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  })
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

/** Renders the booking dialog with a product already taken over, as the product mask opens it. */
async function show(product: Product) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <BookStockDialog
          open
          onClose={() => undefined}
          tenantId={TENANT}
          locations={[MAIN]}
          product={product}
        />
      </QueryClientProvider>,
    )
  })
  await settle()
}

/**
 * The field on its own, the way the position dialog draws it over a stored line.
 *
 * <p>Not through the booking dialog: a booking is written once and hands nothing in, while a
 * document position is opened again and again with the numbers it already carries.
 *
 * @param props everything the field is drawn with; the tenant and the reporting are wired here
 * @returns the allocations reported upwards, in the order they were reported
 */
async function showField(
  props: Omit<ComponentProps<typeof LotAllocationField>, 'tenantId' | 'onChange'>,
): Promise<LotAllocation[][]> {
  const reports: LotAllocation[][] = []
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <LotAllocationField
          tenantId={TENANT}
          onChange={(allocations) => reports.push(allocations)}
          {...props}
        />
      </QueryClientProvider>,
    )
  })
  await settle()
  return reports
}

/**
 * The field over a quantity that can be typed over, the way the position dialog draws it.
 *
 * <p>The field is not mounted afresh for it: the quantity is typed into the mask above it and
 * the field keeps everything it holds across that keystroke. That is the only way to ask what
 * a split does when the quantity under it changes.
 *
 * @param props everything the field is drawn with; the tenant and the reporting are wired here
 * @returns the allocations reported upwards, and a way to draw the same field over another
 *          quantity
 */
async function showFieldOverQuantity(
  props: Omit<ComponentProps<typeof LotAllocationField>, 'tenantId' | 'onChange'>,
): Promise<{ reports: LotAllocation[][]; over: (quantity: number) => Promise<void> }> {
  const reports: LotAllocation[][] = []
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  const over = async (quantity: number) => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <LotAllocationField
            tenantId={TENANT}
            onChange={(allocations) => reports.push(allocations)}
            {...props}
            quantity={quantity}
          />
        </QueryClientProvider>,
      )
    })
    await settle()
  }
  await over(props.quantity ?? 0)
  return { reports, over }
}

/**
 * Lets the requests of the dialog land, so the field has an answer to draw.
 *
 * <p>A macrotask, not only flushed microtasks: the proposal travels through TanStack Query,
 * which schedules its own notification, and the rows are seeded from the answer.
 */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

function field(label: string): HTMLInputElement {
  const found = [...document.querySelectorAll('label')].find(
    (element) => element.textContent?.trim() === label,
  )
  const id = found?.getAttribute('for')
  return document.getElementById(id ?? '') as HTMLInputElement
}

function fields(label: string): HTMLInputElement[] {
  return [...document.querySelectorAll('label')]
    .filter((element) => element.textContent?.trim() === label)
    .map((element) => document.getElementById(element.getAttribute('for') ?? ''))
    .filter((element): element is HTMLInputElement => element !== null)
}

function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function press(input: HTMLInputElement, key: string) {
  input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
}

function button(text: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll('button')].find(
    (element) => element.textContent?.trim() === text,
  )
}

function chips(): string[] {
  return [...document.querySelectorAll('li')]
    .map((element) => element.querySelector('span')?.textContent ?? '')
    .filter((text) => text !== '')
}

/** Takes one number back the way the "×" on its chip does. */
function removeChip(lotNumber: string) {
  const found = document.querySelector<HTMLButtonElement>(`[aria-label="${lotNumber} entfernen"]`)
  if (found === null) throw new Error(`Kein Chip mit der Nummer "${lotNumber}"`)
  found.click()
}

/** Takes one number over out of the list of what last went out. */
function pick(lotNumber: string) {
  const found = document.querySelector<HTMLButtonElement>(
    `[aria-label="${lotNumber} übernehmen"]`,
  )
  if (found === null) throw new Error(`Keine angebotene Nummer "${lotNumber}"`)
  found.click()
}

/** The numbers the typing list offers, in the order they stand in it. */
function options(): string[] {
  return [...document.querySelectorAll('option')].map((element) => element.value)
}

/** Sends one number the way a hand scanner does: the number, then Enter. */
function scan(lotNumber: string) {
  type(field('Seriennummer'), lotNumber)
  press(field('Seriennummer'), 'Enter')
}

/** A camera that hands out a stream nobody has to close for real and always reads one code. */
function stubCamera(code: string) {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: () => Promise.resolve({ getTracks: () => [{ stop: () => undefined }] }),
    },
  })
  ;(window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector = class {
    detect() {
      return Promise.resolve([{ rawValue: code }])
    }
  }
}

/** Opens the camera overlay and lets it read once. */
async function openCamera() {
  const camera = [...document.querySelectorAll('button')].find(
    (element) => element.getAttribute('aria-label') === 'Seriennummern mit der Kamera scannen',
  )
  await act(async () => {
    camera?.click()
  })
  // The camera is asked for on the click, so the stream has to settle before it is read.
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    vi.advanceTimersByTime(300)
  })
  await act(async () => {
    await Promise.resolve()
  })
}

/**
 * What a person can actually read while the camera overlay is up.
 *
 * <p>The overlay is drawn `fixed inset-0` over a z-index of its own, so everything the field
 * draws below it is behind a full screen of dark. Only what is lifted over it counts.
 */
function overTheOverlay(): string[] {
  return [...document.querySelectorAll('.z-\\[70\\]')].map((one) => one.textContent ?? '')
}

/**
 * The red line under the numbers.
 *
 * <p>Read off the element rather than out of the page text: the same sentence also stands in
 * the region that speaks to a screen reader, and that one is never taken back — a test on the
 * page text would find it there and never see the line go.
 */
function refusal(): string[] {
  return [...document.querySelectorAll('p.text-danger')].map((one) => one.textContent ?? '')
}

describe('LotAllocationField', () => {
  /**
   * The one invariant of the field: while a piece carries no number the button stays dark, and
   * the reason stands next to it before anybody presses it.
   */
  it('lotAllocationFieldBlocksTheBookingWhileOpenTest', async () => {
    await show(BATCHED)

    await act(async () => {
      type(field('Menge'), '5')
    })
    await settle()

    // The line carries the quantity but no number yet, so nothing is allocated: the header,
    // the field and the foot of the dialog all say the same thing.
    expect(document.body.textContent).toContain('Menge 5 · zugeordnet 0 · offen 5')
    expect(document.body.textContent).toContain('Jede Zeile braucht eine Charge.')
    expect(document.body.textContent).toContain('5 sind noch keiner Charge zugeordnet.')
    expect(button('Buchen')?.disabled).toBe(true)

    await act(async () => {
      type(field('Chargennummer'), 'CH-2026-04')
    })
    await settle()

    expect(button('Buchen')?.disabled).toBe(false)
  })

  /**
   * The everyday receipt: one delivery, one batch. The quantity is already in the line, so the
   * only thing left to do is the number off the supplier's label.
   */
  it('lotAllocationFieldPrefillsTheBatchLineTest', async () => {
    await show(BATCHED)

    await act(async () => {
      type(field('Menge'), '40')
    })
    await settle()

    const quantities = fields('Menge')
    expect(quantities).toHaveLength(2)
    expect(quantities[1].value).toBe('40')
  })

  /**
   * The everyday issue: the server proposes, the field shows what it proposed, and nothing has
   * to be typed at all.
   */
  it('lotAllocationFieldPrefillsTheProposalTest', async () => {
    await show(BATCHED)

    await act(async () => {
      button('Abgang')?.click()
    })
    await act(async () => {
      type(field('Menge'), '5')
    })
    await settle()

    expect(document.body.textContent).toContain('CH-A')
    expect(document.body.textContent).toContain('CH-B')
    expect(document.body.textContent).toContain('Menge 5 · zugeordnet 5 · offen 0')
    expect(button('Buchen')?.disabled).toBe(false)
  })

  /** An expiry date is a word on the screen, not only a colour. */
  it('lotAllocationFieldNamesTheExpiryDateTest', async () => {
    await show(BATCHED)

    await act(async () => {
      button('Abgang')?.click()
    })
    await act(async () => {
      type(field('Menge'), '5')
    })
    await settle()

    expect(document.body.textContent).toContain('haltbar bis 30.09.2026')
  })

  /** Scan, Enter, chip — and the field is empty again for the next piece. */
  it('lotAllocationFieldTakesASerialNumberTest', async () => {
    await show(SERIALISED)

    await act(async () => {
      type(field('Menge'), '2')
    })
    await act(async () => {
      type(field('Seriennummer'), 'SN-4711')
      press(field('Seriennummer'), 'Enter')
    })
    await settle()

    expect(chips()).toContain('SN-4711')
    expect(field('Seriennummer').value).toBe('')
    expect(document.body.textContent).toContain('Es fehlen noch 1 Seriennummern.')
  })

  /** The same label scanned twice is a slip of the hand, not a second piece. */
  it('lotAllocationFieldTakesTheSameSerialNumberOnlyOnceTest', async () => {
    await show(SERIALISED)

    await act(async () => {
      type(field('Menge'), '2')
    })
    for (const attempt of ['SN-4711', 'SN-4711']) {
      await act(async () => {
        type(field('Seriennummer'), attempt)
        press(field('Seriennummer'), 'Enter')
      })
    }
    await settle()

    expect(chips().filter((chip) => chip === 'SN-4711')).toHaveLength(1)
    expect(document.body.textContent).toContain('Es fehlen noch 1 Seriennummern.')
  })

  /** Backspace in the empty field takes the last number back, as a chip list should. */
  it('lotAllocationFieldRemovesTheLastSerialNumberTest', async () => {
    await show(SERIALISED)

    await act(async () => {
      type(field('Menge'), '2')
    })
    await act(async () => {
      type(field('Seriennummer'), 'SN-1')
      press(field('Seriennummer'), 'Enter')
    })
    await act(async () => {
      press(field('Seriennummer'), 'Backspace')
    })
    await settle()

    expect(chips()).not.toContain('SN-1')
  })

  /** Every number carries one piece, so the whole quantity is spoken for and the button opens. */
  it('lotAllocationFieldOpensTheButtonWhenEverySerialNumberIsThereTest', async () => {
    await show(SERIALISED)

    await act(async () => {
      type(field('Menge'), '2')
    })
    for (const number of ['SN-1', 'SN-2']) {
      await act(async () => {
        type(field('Seriennummer'), number)
        press(field('Seriennummer'), 'Enter')
      })
    }
    await settle()

    expect(document.body.textContent).toContain('Menge 2 · zugeordnet 2 · offen 0')
    expect(button('Buchen')?.disabled).toBe(false)
  })

  /**
   * A position that already carries numbers opens with them, and the proposal does not quietly
   * pick others: what is on the document is what was agreed, and reopening it moves nothing.
   */
  it('lotAllocationFieldKeepsTheStoredAllocationTest', async () => {
    const reports = await showField({
      product: BATCHED,
      locationId: '1',
      direction: 'OUT',
      quantity: 5,
      allowWithoutNumber: false,
      saved: [{ lotNumber: 'CH-B', quantity: 5 }],
    })

    // The stored split stands, and the proposal only says what lies behind the numbers: it
    // would have taken three out of CH-A, and not one piece of it is allocated.
    expect(document.body.textContent).toContain('Menge 5 · zugeordnet 5 · offen 0')
    const quantities = fields('Menge')
    expect(quantities.map((input) => input.value)).toEqual(['', '5'])
    // Nothing was reported: the caller still holds exactly what it handed in.
    expect(reports).toEqual([])
  })

  /**
   * The quantity of a stored position is corrected, and its numbers stay.
   *
   * <p>The dangerous one. A Lieferschein over five pieces carries the five numbers that were
   * written on it; typing a four must not hand the position whatever FEFO proposes today. What
   * is on the document is what was agreed, and a number nobody picked is a serial number the
   * customer never got — printed, frozen and kept for ten years. So the split stands, the
   * counter says one is too many, and the user takes one off (decision of the Product Owner in
   * issue #21).
   */
  it('lotAllocationFieldKeepsTheStoredAllocationWhenTheQuantityChangesTest', async () => {
    stubSerialFetch()

    const { reports, over } = await showFieldOverQuantity({
      product: SERIALISED,
      locationId: '1',
      direction: 'OUT',
      quantity: 5,
      allowWithoutNumber: false,
      saved: STORED_SERIALS.map((lotNumber) => ({ lotNumber, quantity: 1 })),
    })

    // What the position was saved with, drawn against a store that holds none of it any more.
    expect(chips()).toEqual([...STORED_SERIALS])

    await over(4)

    // Still the numbers of the document, and the correction is asked for rather than made.
    expect(chips()).toEqual([...STORED_SERIALS])
    expect(document.body.textContent).toContain('Menge 4 · zugeordnet 5 · 1 zu viel')
    expect(document.body.textContent).toContain('Es sind 1 zu viel zugeordnet.')
    // And nothing was ever reported: the caller still holds exactly what it handed in.
    expect(reports).toEqual([])
  })

  /**
   * A pick made by hand survives every quantity change, not only the first one.
   *
   * <p>Two identical keystrokes must not have opposite outcomes: whoever takes another piece
   * out of the store and then corrects the quantity twice would find their choice gone on the
   * second correction and have no way of telling why.
   */
  it('lotAllocationFieldKeepsAHandPickedSplitAcrossTwoQuantityChangesTest', async () => {
    stubSerialFetch()

    const { over } = await showFieldOverQuantity({
      product: SERIALISED,
      locationId: '1',
      direction: 'OUT',
      quantity: 2,
      allowWithoutNumber: false,
    })

    // Seeded from the proposal, then changed: another piece goes out instead of the first one.
    expect(chips()).toEqual(['SN-1', 'SN-2'])
    await act(async () => {
      removeChip('SN-1')
    })
    await act(async () => {
      scan('SN-3')
    })
    await settle()
    expect(chips()).toEqual(['SN-2', 'SN-3'])

    await over(3)

    expect(chips()).toEqual(['SN-2', 'SN-3'])
    expect(document.body.textContent).toContain('Menge 3 · zugeordnet 2 · offen 1')

    await over(4)

    expect(chips()).toEqual(['SN-2', 'SN-3'])
    expect(document.body.textContent).toContain('Menge 4 · zugeordnet 2 · offen 2')
  })

  /**
   * A return line, where no proposal fills anything back in. Opening it empty would leave the
   * user with «offen 2» and a locked button over numbers they had already given.
   */
  it('lotAllocationFieldKeepsTheStoredAllocationOnAReturnTest', async () => {
    const reports = await showField({
      product: BATCHED,
      locationId: '1',
      direction: 'IN',
      quantity: 2,
      allowWithoutNumber: false,
      saved: [{ lotNumber: 'CH-A', quantity: 2 }],
    })

    expect(field('Chargennummer').value).toBe('CH-A')
    expect(fields('Menge')[0].value).toBe('2')
    expect(document.body.textContent).toContain('Menge 2 · zugeordnet 2 · offen 0')
    expect(reports).toEqual([])
  })

  /**
   * The changeover case: the stock is there, it carries no number, and a document line cannot
   * take it. Said out loud, because «offen 2» in front of a full shelf explains nothing.
   */
  it('lotAllocationFieldExplainsStockWithoutANumberTest', async () => {
    stubFetch(WITHOUT_NUMBER)

    const reports = await showField({
      product: BATCHED,
      locationId: '1',
      direction: 'OUT',
      quantity: 2,
      allowWithoutNumber: false,
    })

    expect(document.body.textContent).toContain('Keine Charge mit Bestand')
    expect(document.body.textContent).toContain(
      'Bestand ohne Chargennummer: 8. Über eine Inventur zuordnen.',
    )
    // Explained, never allocated: the line freezes a number and this stock has none.
    expect(document.body.textContent).toContain('Menge 2 · zugeordnet 0 · offen 2')
    expect(reports).toEqual([])
  })

  /**
   * The server lists every number the location holds and proposes only some of them. Taking
   * one of the others has to work, or a position over two pieces can only ever be the two the
   * server happened to name.
   */
  it('lotAllocationFieldTakesANumberItListedButDidNotProposeTest', async () => {
    stubSerialFetch()

    const reports = await showField({
      product: SERIALISED,
      locationId: '1',
      direction: 'OUT',
      quantity: 2,
      allowWithoutNumber: false,
    })

    expect(chips()).toEqual(['SN-1', 'SN-2'])

    await act(async () => {
      removeChip('SN-1')
    })
    await act(async () => {
      scan('SN-3')
    })
    await settle()

    expect(chips()).toEqual(['SN-2', 'SN-3'])
    expect(document.body.textContent).not.toContain('bereits erfasst')
    expect(document.body.textContent).toContain('Menge 2 · zugeordnet 2 · offen 0')
    expect(reports.at(-1)).toEqual([
      { lotNumber: 'SN-2', quantity: 1 },
      { lotNumber: 'SN-3', quantity: 1 },
    ])
  })

  /**
   * Taking a chip back on the way out gives the piece up, it does not make it disappear: the
   * number still lies at the location, and whoever changes their mind has to be able to pick
   * it again.
   */
  it('lotAllocationFieldPicksANumberItTookBackAgainTest', async () => {
    stubSerialFetch()

    await showField({
      product: SERIALISED,
      locationId: '1',
      direction: 'OUT',
      quantity: 2,
      allowWithoutNumber: false,
    })

    await act(async () => {
      removeChip('SN-1')
    })
    await act(async () => {
      scan('SN-1')
    })
    await settle()

    expect(refusal()).toEqual([])
    expect(chips()).toEqual(['SN-1', 'SN-2'])
    expect(document.body.textContent).toContain('Menge 2 · zugeordnet 2 · offen 0')
  })

  /**
   * The hint says the backspace removes the last number, and on the way out the list also
   * holds the numbers nobody picked: dropping one of those would look like nothing happened.
   */
  it('lotAllocationFieldRemovesTheLastChipOnATakeOutTest', async () => {
    stubSerialFetch()

    await showField({
      product: SERIALISED,
      locationId: '1',
      direction: 'OUT',
      quantity: 2,
      allowWithoutNumber: false,
    })

    await act(async () => {
      press(field('Seriennummer'), 'Backspace')
    })
    await settle()

    expect(chips()).toEqual(['SN-1'])
    expect(document.body.textContent).toContain('Menge 2 · zugeordnet 1 · offen 1')
  })

  /**
   * An expired lot is listed and never proposed: expired goods leave the house on purpose, as
   * a sample or as scrap, so the choice stays with the person (decision of the Product Owner).
   */
  it('lotAllocationFieldTakesAnExpiredNumberWhenItIsChosenTest', async () => {
    stubSerialFetch(serialProposal(2, ['SN-1']))

    await showField({
      product: SERIALISED,
      locationId: '1',
      direction: 'OUT',
      quantity: 2,
      allowWithoutNumber: false,
    })

    // Listed and marked, never proposed: one piece of the two carries no number yet.
    expect(chips()).toEqual(['SN-2'])

    await act(async () => {
      scan('SN-1')
    })
    await settle()

    expect(chips()).toEqual(['SN-1', 'SN-2'])
    expect(document.body.textContent).toContain('Menge 2 · zugeordnet 2 · offen 0')
  })

  /** «Aus Bestand wählen» is the same way in as the scanner, for goods nobody holds in hand. */
  it('lotAllocationFieldTakesAListedNumberFromThePickerTest', async () => {
    stubSerialFetch()

    await showField({
      product: SERIALISED,
      locationId: '1',
      direction: 'OUT',
      quantity: 3,
      allowWithoutNumber: false,
    })

    await act(async () => {
      button('Aus Bestand wählen')?.click()
    })
    await settle()
    await act(async () => {
      button('SN-3')?.click()
    })
    await act(async () => {
      button('Fertig')?.click()
    })
    await settle()

    expect(chips()).toEqual(['SN-1', 'SN-2', 'SN-3'])
    expect(document.body.textContent).toContain('Menge 3 · zugeordnet 3 · offen 0')
  })

  /**
   * A scanned number the location does not hold is not taken in silently: it would count
   * against the open quantity and be refused on issuing, long after whoever scanned it has
   * moved on (issue #21, Nachtrag).
   */
  it('lotAllocationFieldRefusesANumberThatIsNotInStockTest', async () => {
    stubSerialFetch({ ...serialProposal(4), uncovered: 1 })

    const reports = await showField({
      product: SERIALISED,
      locationId: '1',
      direction: 'OUT',
      quantity: 5,
      allowWithoutNumber: false,
    })

    const before = reports.length

    await act(async () => {
      scan('SN-9')
    })
    await settle()

    // The reason stays open on purpose: the proposal leaves out what is blocked as well as
    // what is not there at all, so «nicht im Bestand» would be a wrong reason for a right
    // refusal — the server used to answer «gesperrt» for the first case.
    expect(document.body.textContent).toContain(
      'SN-9 ist an diesem Lagerort nicht verfügbar: kein Bestand oder gesperrt.',
    )
    expect(chips()).toEqual(SERIAL_NUMBERS)
    expect(document.body.textContent).toContain('Menge 5 · zugeordnet 4 · offen 1')
    // Refused means nothing changed, so the caller hears nothing either.
    expect(reports).toHaveLength(before)
  })

  /**
   * The refusal has to reach whoever is holding the camera, while they are holding it. Drawn
   * inside the field it sits behind the overlay, which covers the whole screen — the piece is
   * thrown away and the person sees nothing but «offen 1» once they put the camera down
   * (issue #21, Nachtrag).
   */
  it('lotAllocationFieldShowsTheRefusalOverTheCameraOverlayTest', async () => {
    stubSerialFetch({ ...serialProposal(4), uncovered: 1 })
    stubCamera('SN-9')
    vi.useFakeTimers({ shouldAdvanceTime: true })

    await showField({
      product: SERIALISED,
      locationId: '1',
      direction: 'OUT',
      quantity: 5,
      allowWithoutNumber: false,
    })

    await openCamera()

    expect(overTheOverlay()).toEqual([
      'SN-9 ist an diesem Lagerort nicht verfügbar: kein Bestand oder gesperrt.',
    ])

    delete (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector
    vi.useRealTimers()
  })

  /**
   * The refusal answers one scan against the split as it then stood. Taking a chip back is the
   * user answering it, and a red line that outlives its reason is a mask complaining about
   * something that is no longer there.
   */
  it('lotAllocationFieldClearsTheRefusalWhenTheCauseIsGoneTest', async () => {
    stubSerialFetch({ ...serialProposal(4), uncovered: 1 })

    await showField({
      product: SERIALISED,
      locationId: '1',
      direction: 'OUT',
      quantity: 5,
      allowWithoutNumber: false,
    })

    await act(async () => {
      scan('SN-9')
    })
    await settle()

    expect(refusal()).toEqual([
      'SN-9 ist an diesem Lagerort nicht verfügbar: kein Bestand oder gesperrt.',
    ])

    await act(async () => {
      removeChip('SN-1')
    })
    await settle()

    expect(refusal()).toEqual([])
  })

  /**
   * The seed itself stays: a field nobody has touched takes the whole proposal, quantities and
   * all. Merging an empty hand onto it would answer «offen 2» on a line that should have been
   * one glance — the trap the fix for the race below has to walk around.
   */
  it('lotAllocationFieldSeedsAFreshLineFromTheProposalTest', async () => {
    stubSerialFetch()

    await showField({
      product: SERIALISED,
      locationId: '1',
      direction: 'OUT',
      quantity: 2,
      allowWithoutNumber: false,
    })

    expect(chips()).toEqual(['SN-1', 'SN-2'])
    expect(document.body.textContent).toContain('Menge 2 · zugeordnet 2 · offen 0')
  })

  /**
   * And the same on a fresh line, where nothing was handed in: a number scanned while the very
   * first proposal is still on its way is a decision, and the answer landing behind it must not
   * quietly throw it away.
   */
  it('lotAllocationFieldKeepsWhatWasScannedBeforeTheFirstProposalTest', async () => {
    const release = stubSerialFetch(serialProposal(), true)

    await showField({
      product: SERIALISED,
      locationId: '1',
      direction: 'OUT',
      quantity: 2,
      allowWithoutNumber: false,
    })

    // Nothing is seeded yet: the answer is still on its way.
    expect(chips()).toEqual([])

    await act(async () => {
      scan('SN-3')
    })
    expect(chips()).toEqual(['SN-3'])

    await act(async () => {
      release()
    })
    await settle()

    expect(chips()).toEqual(['SN-3'])
    expect(document.body.textContent).toContain('Menge 2 · zugeordnet 1 · offen 1')
  })

  /**
   * A batch return opens with the whole quantity on one line, so the warning about a number
   * that never went out used to appear on the first keystroke and re-word itself until the
   * number was finished. It is a judgement about a number, and half a number is none.
   */
  it('lotAllocationFieldWaitsForTheTypedBatchNumberBeforeWarningTest', async () => {
    stubIssuedFetch([
      { lotNumber: 'CH-OLD', quantity: 3, bookedOn: '2026-08-21', documentNumber: 'LS-2026-0002' },
    ])

    await showField({
      product: BATCHED,
      locationId: '1',
      direction: 'IN',
      returning: true,
      quantity: 2,
      allowWithoutNumber: false,
    })

    for (const typed of ['C', 'CH', 'CH-']) {
      await act(async () => {
        type(field('Chargennummer'), typed)
      })
      await settle()
      expect(document.body.textContent).not.toContain('nicht unter den zuletzt ausgelieferten')
    }

    // Finished and left: now it is a number, and it is not one that went out. Left with
    // `focusout`, which is the event React delegates `onBlur` from.
    await act(async () => {
      type(field('Chargennummer'), 'CH-NEW')
      field('Chargennummer').dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    })
    await settle()

    expect(document.body.textContent).toContain(
      'CH-NEW ist nicht unter den zuletzt ausgelieferten Nummern.',
    )
  })

  /**
   * A pick made for an issue says nothing about a return: SN-1 lies at the location and never
   * left it. Turning the line over therefore empties the field rather than carrying the chip
   * across — and the caller is told, so its own counter cannot drift away from this one.
   */
  it('lotAllocationFieldClearsThePickWhenTheDirectionTurnsTest', async () => {
    stubSerialFetch()

    let direction: 'IN' | 'OUT' = 'OUT'
    const reports: LotAllocation[][] = []
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
    const draw = async () => {
      await act(async () => {
        root.render(
          <QueryClientProvider client={client}>
            <LotAllocationField
              tenantId={TENANT}
              product={SERIALISED}
              locationId="1"
              direction={direction}
              returning={direction === 'IN'}
              quantity={2}
              allowWithoutNumber={false}
              onChange={(allocations) => reports.push(allocations)}
            />
          </QueryClientProvider>,
        )
      })
      await settle()
    }

    await draw()
    expect(chips()).toEqual(['SN-1', 'SN-2'])

    stubIssuedFetch(ISSUED)
    direction = 'IN'
    await draw()

    // Read off the chips themselves: «Zuletzt ausgeliefert» is a list of numbers too, and it
    // is exactly what should be standing there instead.
    expect(document.querySelector('[aria-label="SN-1 entfernen"]')).toBeNull()
    expect(document.querySelector('[aria-label="SN-2 entfernen"]')).toBeNull()
    expect(document.body.textContent).toContain('Menge 2 · zugeordnet 0 · offen 2')
    // Said out loud: the caller holds the numbers too, and silence would leave it counting
    // pieces this field no longer shows.
    expect(reports.at(-1)).toEqual([])
  })

  /**
   * The server names at most twenty lots. A full list may be missing one, and a mask that
   * refuses a number it merely did not hear about is worse than one that stays quiet.
   */
  it('lotAllocationFieldTakesAnUnlistedNumberWhereTheListIsFullTest', async () => {
    const full: LotProposal = {
      ...serialProposal(),
      lines: [...Array(20).keys()].map((index) => ({
        lotId: 100 + index,
        lotNumber: `SN-${index + 1}`,
        expiryDate: null,
        expired: false,
        available: 1,
        proposed: index < 2 ? 1 : 0,
      })),
    }
    stubSerialFetch(full)

    await showField({
      product: SERIALISED,
      locationId: '1',
      direction: 'OUT',
      quantity: 3,
      allowWithoutNumber: false,
    })

    await act(async () => {
      scan('SN-99')
    })
    await settle()

    expect(chips()).toContain('SN-99')
    expect(document.body.textContent).toContain('Menge 3 · zugeordnet 3 · offen 0')
  })

  /**
   * The field is usable while the proposal is still on its way. What is done in that moment is
   * a decision of the user, and the answer landing behind it must not quietly undo it.
   */
  it('lotAllocationFieldKeepsWhatWasDoneWhileTheProposalWasOnItsWayTest', async () => {
    const release = stubSerialFetch(serialProposal(), true)

    const reports = await showField({
      product: SERIALISED,
      locationId: '1',
      direction: 'OUT',
      quantity: 2,
      allowWithoutNumber: false,
      saved: [
        { lotNumber: 'SN-1', quantity: 1 },
        { lotNumber: 'SN-2', quantity: 1 },
      ],
    })

    // The stored split is drawn at once; the proposal is still on its way.
    expect(chips()).toEqual(['SN-1', 'SN-2'])

    await act(async () => {
      removeChip('SN-1')
    })
    await act(async () => {
      scan('SN-3')
    })

    expect(chips()).toEqual(['SN-2', 'SN-3'])

    await act(async () => {
      release()
    })
    await settle()

    expect(chips()).toEqual(['SN-2', 'SN-3'])
    expect(document.body.textContent).toContain('Menge 2 · zugeordnet 2 · offen 0')
    expect(reports.at(-1)).toEqual([
      { lotNumber: 'SN-2', quantity: 1 },
      { lotNumber: 'SN-3', quantity: 1 },
    ])
  })

  /**
   * The return of a serialised piece: the mask offers what went out, with the delivery note
   * next to it, and generating fresh numbers is not on offer at all — a customer sends back a
   * piece that exists, and inventing a number for it would be the opposite of a trace.
   */
  it('lotAllocationFieldOffersTheNumbersThatLastWentOutTest', async () => {
    stubIssuedFetch(ISSUED)

    await showField({
      product: SERIALISED,
      locationId: '1',
      direction: 'IN',
      returning: true,
      quantity: 2,
      allowWithoutNumber: false,
    })

    expect(document.body.textContent).toContain('Zuletzt ausgeliefert')
    expect(document.body.textContent).toContain('LS-2026-0002 · 21.08.2026')
    expect(button('Nummern erzeugen')).toBeUndefined()

    await act(async () => {
      pick('SN-4711')
    })
    await settle()

    expect(document.querySelector('[aria-label="SN-4711 entfernen"]')).not.toBeNull()
    expect(document.body.textContent).toContain('Menge 2 · zugeordnet 1 · offen 1')
  })

  /**
   * A number nobody was ever delivered is warned about and taken all the same: whoever holds
   * the goods knows more about them than the journal does (decision of the Product Owner).
   */
  it('lotAllocationFieldWarnsAboutANumberThatNeverWentOutTest', async () => {
    stubIssuedFetch(ISSUED)

    const reports = await showField({
      product: SERIALISED,
      locationId: '1',
      direction: 'IN',
      returning: true,
      quantity: 1,
      allowWithoutNumber: false,
    })

    await act(async () => {
      scan('SN-9001')
    })
    await settle()

    expect(document.body.textContent).toContain(
      'SN-9001 ist nicht unter den zuletzt ausgelieferten Nummern.'
        + ' Die Rücknahme wird trotzdem gebucht.',
    )
    // Warned, never blocked: the piece is in, it counts, and the caller has it.
    expect(document.querySelector('[aria-label="SN-9001 entfernen"]')).not.toBeNull()
    expect(document.body.textContent).toContain('Menge 1 · zugeordnet 1 · offen 0')
    expect(reports.at(-1)).toEqual([{ lotNumber: 'SN-9001', quantity: 1 }])
  })

  /**
   * A piece that is lying in the warehouse right now is named while it is scanned, not when the
   * document is issued: the server refuses it then, and on a return over twenty devices that is
   * twenty positions too late (backend ADR-0077, ADR-0081).
   */
  it('lotAllocationFieldWarnsAboutANumberAlreadyInStockTest', async () => {
    stubIssuedFetch(ISSUED, { 'SN-4711': 'Hauptlager' })

    const reports = await showField({
      product: SERIALISED,
      locationId: '1',
      direction: 'IN',
      returning: true,
      quantity: 1,
      allowWithoutNumber: false,
    })

    await act(async () => {
      scan('SN-4711')
    })
    await settle()

    expect(document.body.textContent).toContain(
      'SN-4711 liegt bereits in Hauptlager. Das Ausstellen weist die Position ab.',
    )
    // A warning and not a block: the number stays in, and the caller gets it.
    expect(document.querySelector('[aria-label="SN-4711 entfernen"]')).not.toBeNull()
    expect(reports.at(-1)).toEqual([{ lotNumber: 'SN-4711', quantity: 1 }])
  })

  /** A number that lies nowhere is exactly what a return brings back, and is not warned about. */
  it('lotAllocationFieldStaysQuietAboutANumberThatLiesNowhereTest', async () => {
    stubIssuedFetch(ISSUED)

    await showField({
      product: SERIALISED,
      locationId: '1',
      direction: 'IN',
      returning: true,
      quantity: 1,
      allowWithoutNumber: false,
    })

    await act(async () => {
      scan('SN-4711')
    })
    await settle()

    expect(document.body.textContent).not.toContain('liegt bereits')
  })

  /**
   * On the way out nothing is asked at all: the numbers there are the ones that lie at the
   * location, and lying there is what makes them choosable.
   */
  it('lotAllocationFieldAsksNothingAboutStockOnAnIssueTest', async () => {
    stubSerialFetch(serialProposal())
    const asked: string[] = []
    const answering = globalThis.fetch
    vi.stubGlobal('fetch', (url: string) => {
      asked.push(url)
      return answering(url)
    })

    await showField({
      product: SERIALISED,
      locationId: '1',
      direction: 'OUT',
      quantity: 2,
      allowWithoutNumber: false,
    })

    expect(asked.some((url) => url.includes('/serial-number-holding'))).toBe(false)
    expect(document.body.textContent).not.toContain('liegt bereits')
  })

  /**
   * The same on a batch: the numbers that were delivered are what is offered and what the
   * typing list holds — not the batches that happen to lie on the shelf today.
   */
  it('lotAllocationFieldOffersTheLastBatchesOnAReturnTest', async () => {
    stubIssuedFetch([
      { lotNumber: 'CH-OLD', quantity: 3, bookedOn: '2026-08-21', documentNumber: 'LS-2026-0002' },
    ])

    const reports = await showField({
      product: BATCHED,
      locationId: '1',
      direction: 'IN',
      returning: true,
      quantity: 2,
      allowWithoutNumber: false,
    })

    expect(options()).toEqual(['CH-OLD'])

    await act(async () => {
      pick('CH-OLD')
    })
    await settle()

    expect(field('Chargennummer').value).toBe('CH-OLD')
    expect(document.body.textContent).toContain('Menge 2 · zugeordnet 2 · offen 0')
    expect(reports.at(-1)).toEqual([{ lotNumber: 'CH-OLD', quantity: 2 }])
  })

  /**
   * A delivery from a supplier is untouched by all of that: its numbers come off the label,
   * and the list offered is the one of batches this product already carries.
   */
  it('lotAllocationFieldOffersTheKnownBatchesOnAReceiptTest', async () => {
    stubIssuedFetch([
      { lotNumber: 'CH-OLD', quantity: 3, bookedOn: '2026-08-21', documentNumber: 'LS-2026-0002' },
    ])

    await showField({
      product: BATCHED,
      locationId: '1',
      direction: 'IN',
      quantity: 2,
    })

    expect(options()).toEqual(['CH-A'])
    expect(document.body.textContent).not.toContain('Zuletzt ausgeliefert')
  })

  /** A product nobody tracks has no number to give, and is asked for none. */
  it('lotAllocationFieldIsAbsentForAnUntrackedProductTest', async () => {
    await show(PLAIN)

    await act(async () => {
      type(field('Menge'), '5')
    })
    await settle()

    expect(field('Chargennummer')).toBeNull()
    expect(field('Seriennummer')).toBeNull()
    expect(button('Buchen')?.disabled).toBe(false)
  })
})
