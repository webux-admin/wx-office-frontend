// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StocktakeLine } from '../../lib/types'
import { StocktakeLinesTable, StocktakeScan } from './StocktakeLinesTable'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** The bar code on the box of the first article, the way a scanner reads it off the shelf. */
const EAN = '7612345678901'

/** A code no line of this count list carries. */
const FOREIGN_EAN = '7690000000005'

/** One line of a count list, with everything the table reads set to something plausible. */
function line(
  fields: Partial<StocktakeLine> & { id: number; productName: string },
): StocktakeLine {
  return {
    productId: fields.id,
    unitShortName: 'Stk',
    expectedQuantity: 10,
    movedSinceCounting: false,
    addedDuringCounting: false,
    sortOrder: fields.id,
    ...fields,
  }
}

/**
 * Four lines over three products: the third product stands twice, once without a number and
 * once under a serial number, which is what a followed article looks like.
 */
const LINES: StocktakeLine[] = [
  line({
    id: 11,
    productNumber: 'P-100',
    productName: 'Schraube M4',
    productEan: EAN,
    expectedQuantity: 20,
  }),
  line({ id: 12, productNumber: 'P-200', productName: 'Winkel 40' }),
  line({
    id: 13,
    productNumber: 'P-300',
    productName: 'Motor',
    countedQuantity: 1,
    countedBy: 'anna',
    countedAt: '2026-01-20T09:14:00Z',
  }),
  line({
    id: 14,
    productNumber: 'P-300',
    productName: 'Motor',
    lotId: 5,
    lotNumber: 'SN-4711',
    expectedQuantity: 1,
  }),
]

let container: HTMLDivElement
let root: Root
/** Which rows were scrolled into view, in order — jsdom scrolls nothing by itself. */
let scrolled: string[]

beforeEach(() => {
  scrolled = []
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    writable: true,
    value(this: Element) {
      scrolled.push(this.getAttribute('data-count-index') ?? '')
    },
  })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  delete (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector
  // Put on the navigator with a property of its own, which `vi.unstubAllGlobals` does not
  // reach — without this the camera outlives the test that asked for it.
  delete (navigator as unknown as { mediaDevices?: unknown }).mediaDevices
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

/** What the table reported back, so a test can check what was sent. */
type Counted = { line: StocktakeLine; quantity: number }

async function render(lines: StocktakeLine[] = LINES): Promise<Counted[]> {
  const sent: Counted[] = []
  await act(async () => {
    root.render(
      <StocktakeLinesTable
        lines={lines}
        blind={false}
        editable
        onCount={(counted, quantity) => {
          sent.push({ line: counted, quantity })
          return Promise.resolve()
        }}
      />,
    )
  })
  return sent
}

/**
 * Renders the table with an answer the test writes itself, so one save can be made to fail.
 *
 * @param answer what the server does with a count
 * @param lines the lines on screen
 * @returns the counts that were handed over, in order
 */
async function renderAnswering(
  answer: () => Promise<unknown>,
  lines: StocktakeLine[] = LINES,
): Promise<Counted[]> {
  const sent: Counted[] = []
  await act(async () => {
    root.render(
      <StocktakeLinesTable
        lines={lines}
        blind={false}
        editable
        onCount={(counted, quantity) => {
          sent.push({ line: counted, quantity })
          return answer()
        }}
      />,
    )
  })
  return sent
}

/** A camera that hands out a stream nobody has to close for real. */
function stubCamera() {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: () => Promise.resolve({ getTracks: () => [{ stop: () => undefined }] }),
    },
  })
}

/** A browser that can read bar codes and always sees the same picture. */
function stubDetector(codes: { rawValue: string }[]) {
  ;(window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector = class {
    detect() {
      return Promise.resolve(codes)
    }
  }
}

/** The camera button, or nothing where the browser reads no bar code. */
const cameraButton = () =>
  [...container.querySelectorAll('button')].find(
    (element) => element.getAttribute('aria-label') === 'Artikel mit der Kamera scannen',
  )

/** The quantity field of one row, by its place in the list. */
const countField = (index: number) =>
  container.querySelector(`[data-count-index="${index}"]`) as HTMLInputElement | null

/** The region the sentence about a scanned code lives in, whether it says anything or not. */
const scanRegion = () => container.querySelector('p[role="status"]')

const text = () => container.textContent ?? ''

/** The button carrying that wording, wherever in the table it stands. */
const button = (label: string) =>
  [...container.querySelectorAll('button')].find((entry) => entry.textContent === label)

/** Lets a promise that has already been answered reach the component. */
async function settle() {
  await act(async () => {
    await Promise.resolve()
  })
}

/** Opens the camera and lets it read what the stub sees. */
async function scan() {
  await act(async () => {
    cameraButton()?.click()
  })
  // The camera is asked for on the click, so the stream has to settle before the first look.
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    vi.advanceTimersByTime(300)
  })
  await act(async () => {
    await Promise.resolve()
  })
}

function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
  act(() => {
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function press(input: HTMLInputElement, key: string) {
  act(() => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

/**
 * Renders the scan block on its own, the way the card view uses it, and reports which line it
 * jumped to.
 *
 * @param code what the camera sees
 * @param lines the lines on screen
 * @returns the indices handed to `onJump`, in order
 */
async function scanInto(code: string, lines: StocktakeLine[] = LINES): Promise<number[]> {
  const jumped: number[] = []
  stubCamera()
  stubDetector([{ rawValue: code }])
  vi.useFakeTimers({ shouldAdvanceTime: true })
  await act(async () => {
    root.render(<StocktakeScan lines={lines} onJump={(index) => jumped.push(index)} />)
  })

  await scan()

  return jumped
}

describe('StocktakeScan', () => {
  /** The everyday case: a bar code off a box, and the line that box belongs to. */
  it('stocktakeScanJumpsToTheLineTest', async () => {
    expect(await scanInto(EAN)).toEqual([0])
  })

  it('stocktakeScanJumpsByProductNumberTest', async () => {
    expect(await scanInto('P-200')).toEqual([1])
  })

  /**
   * A serial number names exactly one line, and it wins over the product number every line of
   * that article carries — otherwise the scan of a piece lands on the row without a number.
   */
  it('stocktakeScanWithALotNumberTest', async () => {
    expect(await scanInto('SN-4711')).toEqual([3])
  })

  /**
   * Where an article stands on several lines, the one nobody has counted is the one that is
   * meant: whoever scans is standing in front of the shelf, not correcting a count.
   */
  it('stocktakeScanPrefersAnUncountedLineTest', async () => {
    expect(await scanInto('P-300')).toEqual([3])
  })

  /** Code 128 and QR payloads carry spaces and a closing newline; case is no difference. */
  it('stocktakeScanTrimsTheCodeTest', async () => {
    expect(await scanInto(' sn-4711 \n')).toEqual([3])
  })

  /** A code this count list does not carry: nothing to jump to, and no guess either. */
  it('stocktakeScanWithoutAMatchTest', async () => {
    expect(await scanInto(FOREIGN_EAN)).toEqual([])
    expect(scanRegion()?.textContent).toBe(`${FOREIGN_EAN} gehört nicht zu dieser Zählung`)
  })

  it('stocktakeScanOnAnEmptyListTest', async () => {
    expect(await scanInto(EAN, [])).toEqual([])
    expect(scanRegion()?.textContent).toBe(`${EAN} gehört nicht zu dieser Zählung`)
  })

  /** Nothing but padding is nothing to look for, and it must not match an empty number. */
  it('stocktakeScanWithoutACodeTest', async () => {
    expect(await scanInto('   ')).toEqual([])
    // And nothing is said about it either: there was no code to report.
    expect(scanRegion()?.textContent).toBe('')
  })
})

describe('StocktakeLinesTable', () => {
  /**
   * No greyed out button that explains itself after the click: where the browser reads no bar
   * code — today above all iPhone and Firefox — the hand scanner types into the jump field of
   * the mask, and there is nothing to press.
   */
  it('stocktakeLinesTableScannerHiddenWithoutSupportTest', async () => {
    await render()

    expect(cameraButton()).toBeUndefined()
    // The table itself is untouched, so counting by hand still works.
    expect(countField(0)).not.toBeNull()
  })

  /**
   * The main case of the camera: standing in the aisle, scan the article, type the quantity,
   * on to the next one. The read number moves the focus into its quantity field and brings the
   * row into view.
   */
  it('stocktakeLinesTableScannerJumpsToTheLineTest', async () => {
    stubCamera()
    stubDetector([{ rawValue: EAN }])
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await render()

    await scan()

    expect(document.activeElement).toBe(countField(0))
    expect(scrolled).toContain('0')
    // The overlay is out of the way, so the keyboard of the device comes up at once.
    expect(text()).not.toContain('Strichcode vor die Kamera halten.')
  })

  /**
   * The scan replaces the search, not the recording: what it jumps to is counted by hand, and
   * Enter sends that line as it always does.
   */
  it('stocktakeLinesTableScannerKeepsTheCountingFlowTest', async () => {
    stubCamera()
    stubDetector([{ rawValue: 'SN-4711' }])
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const sent = await render()

    await scan()
    const field = countField(3) as HTMLInputElement
    expect(document.activeElement).toBe(field)
    type(field, '1')
    press(field, 'Enter')
    await act(async () => {
      await Promise.resolve()
    })

    expect(sent.map((entry) => [entry.line.id, entry.quantity])).toEqual([[14, 1]])
  })

  /**
   * One count, one request. Enter sends and then moves the focus into the next open line —
   * and that move leaves the field, whose blur sends as well. Unguarded that is two PUTs for
   * every line of a count, both carrying the same figure.
   */
  it('stocktakeLinesTableSendsOneRequestPerCountTest', async () => {
    const sent = await render()
    const field = countField(1) as HTMLInputElement

    act(() => field.focus())
    type(field, '7')
    press(field, 'Enter')
    // Sending answers, the focus moves into the next open line, and that move leaves this
    // field — which is exactly what the second request would come out of.
    await act(async () => {
      await Promise.resolve()
    })

    expect(sent.map((entry) => [entry.line.id, entry.quantity])).toEqual([[12, 7]])
  })

  /**
   * The whole flow through an aisle, and not a mouse anywhere in it: the figure is typed,
   * `Enter` sends it, and the focus stands in the next line nobody has counted — over the one
   * that is already counted, which is what makes counting to two work.
   */
  it('stocktakeLinesTableMovesTheFocusToTheNextOpenLineTest', async () => {
    const sent = await render()
    const field = countField(1) as HTMLInputElement

    act(() => field.focus())
    type(field, '7')
    press(field, 'Enter')
    await settle()

    // Line 3 is already counted, so it is skipped and line 4 takes the focus.
    expect(document.activeElement).toBe(countField(3))
    expect(scrolled).toContain('3')
    expect(sent.map((entry) => [entry.line.id, entry.quantity])).toEqual([[12, 7]])
  })

  /**
   * A count somebody else recorded is a statement, and two people on one list must not quietly
   * undo each other. So the row asks first, and until it is answered nothing goes out.
   */
  it('stocktakeLinesTableAsksBeforeOverwritingACountedLineTest', async () => {
    const sent = await render()
    const field = countField(2) as HTMLInputElement

    act(() => field.focus())
    type(field, '2')
    press(field, 'Enter')
    await settle()

    const asking = container.querySelector('[role="alertdialog"]')
    expect(asking?.textContent).toContain('Gezählt von anna')
    expect(asking?.textContent).toContain('überschreiben?')
    expect(sent).toEqual([])

    await act(async () => {
      button('Überschreiben')?.click()
    })
    await settle()

    expect(sent.map((entry) => [entry.line.id, entry.quantity])).toEqual([[13, 2]])
    expect(container.querySelector('[role="alertdialog"]')).toBeNull()
  })

  /**
   * A count takes hours on a phone in an aisle, and the connection drops. The figure exists
   * nowhere but in this field, so it stays in it — with the row marked and a way to send it
   * again (Frontend-ADR-0016).
   */
  it('stocktakeLinesTableKeepsTheTypedValueWhenSavingFailsTest', async () => {
    const sent = await renderAnswering(() => Promise.reject(new Error('Netz weg')))
    const field = countField(1) as HTMLInputElement

    act(() => field.focus())
    type(field, '7')
    press(field, 'Enter')
    await settle()

    expect(sent.map((entry) => [entry.line.id, entry.quantity])).toEqual([[12, 7]])
    expect(countField(1)?.value).toBe('7')
    expect(countField(1)?.getAttribute('aria-invalid')).toBe('true')
    expect(button('Erneut senden')).not.toBeUndefined()
    // And the focus did not run off to the next line: nothing was recorded there yet.
    expect(document.activeElement).not.toBe(countField(3))
  })

  /** «Erneut senden» sends that same figure again, and the row is plain once it lands. */
  it('stocktakeLinesTableResendsTheSameValueTest', async () => {
    let broken = true
    const sent = await renderAnswering(() =>
      broken ? Promise.reject(new Error('Netz weg')) : Promise.resolve(),
    )
    const field = countField(1) as HTMLInputElement
    act(() => field.focus())
    type(field, '7')
    press(field, 'Enter')
    await settle()
    broken = false

    await act(async () => {
      button('Erneut senden')?.click()
    })
    await settle()

    expect(sent.map((entry) => [entry.line.id, entry.quantity])).toEqual([
      [12, 7],
      [12, 7],
    ])
    expect(button('Erneut senden')).toBeUndefined()
    expect(countField(1)?.getAttribute('aria-invalid')).toBeNull()
  })

  /**
   * A code this list does not carry leaves the list standing and says so, naming the code —
   * and it says it in a region that was on the page before, because a region inserted together
   * with its text is no change a screen reader announces.
   */
  it('stocktakeLinesTableScannerUnknownCodeShowsMessageTest', async () => {
    stubCamera()
    stubDetector([{ rawValue: FOREIGN_EAN }])
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await render()
    const region = scanRegion()
    expect(region).not.toBeNull()
    expect(region?.textContent).toBe('')

    await scan()

    expect(scanRegion()).toBe(region)
    expect(region?.textContent).toBe(`${FOREIGN_EAN} gehört nicht zu dieser Zählung`)
    // Nothing was jumped to, and no quantity field was touched.
    expect(document.activeElement).not.toBe(countField(0))
  })
})
