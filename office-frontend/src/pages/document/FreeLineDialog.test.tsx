// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DocumentLine } from '../../lib/types'
import { FreeLineDialog } from './FreeLineDialog'
import type { FreeLine } from './lineForm'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1

let container: HTMLDivElement
let root: Root

/** Answers the two lists the dialog reads, caught at `fetch` rather than at `lib/api`. */
function stubFetch() {
  vi.stubGlobal('fetch', (url: string) => {
    const body = url.includes('/catalogues')
      ? { 'vat-category': [{ code: 'STANDARD', name: 'Normalsatz' }] }
      : [{ code: 'PIECE', name: 'Stück', shortName: 'Stk', isDefault: true }]
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

/** What the dialog sent, so a test can check the position that went out. */
type Calls = { sent: FreeLine[] }

/**
 * Draws the dialog, over a stored line where one is given.
 *
 * @param stored the line being edited; left out the dialog adds a new one
 * @param defaultPriceIncludesVat the price base the document is written in
 */
async function render(stored?: DocumentLine, defaultPriceIncludesVat = false): Promise<Calls> {
  const calls: Calls = { sent: [] }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <FreeLineDialog
          tenantId={TENANT}
          open
          onClose={() => undefined}
          onSubmit={(line) => calls.sent.push(line)}
          line={stored}
          defaultPriceIncludesVat={defaultPriceIncludesVat}
          busy={false}
        />
      </QueryClientProvider>,
    )
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  return calls
}

const text = () => container.textContent ?? ''

function field(label: string): HTMLInputElement | HTMLTextAreaElement {
  const owner = [...container.querySelectorAll('label')].find(
    (candidate) => candidate.textContent?.trim() === label,
  )
  const id = owner?.getAttribute('for')
  const control = id
    ? container.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[id="${id}"]`)
    : null
  if (!control) throw new Error(`Kein Feld mit der Beschriftung "${label}"`)
  return control
}

/** The checkbox a label points at, so a test can read whether it is ticked. */
function checkbox(label: string): HTMLInputElement {
  const control = field(label)
  if (!(control instanceof HTMLInputElement)) {
    throw new Error(`"${label}" ist kein Kontrollkästchen`)
  }
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

/** Types into a field the way a browser does, textarea and input alike. */
function type(control: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype =
    control instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(control, value)
  act(() => {
    control.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

/**
 * Leaves a field the way a browser does.
 *
 * <p>React listens on `focusout`, not on `blur`: only the first of the two bubbles up to the
 * root the dialog is drawn in.
 */
function leave(control: HTMLElement) {
  act(() => {
    control.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
  })
}

describe('FreeLineDialog', () => {
  it('freeLineDialogKeepsTheDateOfSupplyVisibleWhileFoldedTest', async () => {
    await render()

    click(button('Weitere Angaben'))
    type(field('Leistung von'), '2026-07-01')
    click(button('Weitere Angaben'))

    // The day of supply decides the VAT rate. A value that disappears when the fold is shut
    // is a value nobody corrects.
    expect(button('Weitere Angaben').getAttribute('aria-expanded')).toBe('false')
    expect(text()).toContain('Leistung ab 01.07.2026')
  })

  it('freeLineDialogWithoutADateOfSupplyTest', async () => {
    await render()

    // Nothing in the fold, nothing to say about it.
    expect(button('Weitere Angaben').getAttribute('aria-expanded')).toBe('false')
    expect(text()).not.toContain('Leistung ab')
  })

  it('freeLineDialogRefusesADiscountThatIsNotANumberTest', async () => {
    const calls = await render()

    type(field('Bezeichnung'), 'Anfahrt')
    type(field('Einzelpreis'), '120')
    type(field('Rabatt in Prozent'), '10%')

    // Sending nothing instead would raise the amount of the line by ten per cent without
    // anything in the mask saying so.
    expect(text()).toContain('Der Rabatt ist keine Zahl.')

    click(button('Hinzufügen'))

    // The button takes the press — it is not locked — and the press goes nowhere.
    expect(calls.sent).toEqual([])
  })

  it('freeLineDialogSaysNothingAboutThePriceBeforeItWasTouchedTest', async () => {
    await render()

    // The dialog opens on an empty price. Saying it is missing before anybody could type it
    // blames the user for the state the dialog itself started in.
    expect(text()).not.toContain('Der Einzelpreis fehlt.')
    expect(text()).not.toContain('Die Bezeichnung fehlt.')
    // Silent, but no dead end: the button takes the press that uncovers what is missing.
    // Locking it while the dialog says nothing leaves the user with nothing to go on.
    expect(button('Hinzufügen').disabled).toBe(false)
  })

  it('freeLineDialogUncoversTheMissingPriceOnTheFirstClickTest', async () => {
    const calls = await render()

    type(field('Bezeichnung'), 'Anfahrt')
    click(button('Hinzufügen'))

    // The price was never touched, so nothing was said about it until now. The press is
    // where the user asks, and it answers instead of going through.
    expect(text()).toContain('Der Einzelpreis fehlt.')
    expect(calls.sent).toEqual([])
  })

  it('freeLineDialogUncoversTheMissingDescriptionOnTheFirstClickTest', async () => {
    const calls = await render()

    type(field('Einzelpreis'), '120')
    click(button('Hinzufügen'))

    // A line without a description is refused by the backend, and used to be refused here
    // by a locked button that never said what it was waiting for.
    expect(text()).toContain('Die Bezeichnung fehlt.')
    expect(calls.sent).toEqual([])
  })

  it('freeLineDialogSendsACompleteLineOnTheFirstClickTest', async () => {
    const calls = await render()

    type(field('Bezeichnung'), 'Anfahrt')
    type(field('Einzelpreis'), '120')
    click(button('Hinzufügen'))

    // Nothing is missing, so the press does what it says and takes no second one.
    expect(calls.sent).toHaveLength(1)
    expect(calls.sent[0].description).toBe('Anfahrt')
    expect(calls.sent[0].unitPrice).toBe(120)
  })

  it('freeLineDialogAsksForThePriceOnceTheFieldWasLeftTest', async () => {
    await render()

    leave(field('Einzelpreis'))

    expect(text()).toContain('Der Einzelpreis fehlt.')
  })

  it('freeLineDialogAsksForThePriceOnceItWasEmptiedAgainTest', async () => {
    await render()

    type(field('Einzelpreis'), '120')
    type(field('Einzelpreis'), '')

    expect(text()).toContain('Der Einzelpreis fehlt.')
  })

  it('freeLineDialogSendsTheSecondDescriptionAndTheCommentTest', async () => {
    const calls = await render()

    type(field('Bezeichnung'), 'Beratung vor Ort')
    type(field('2. Bezeichnung'), 'Anfahrt inbegriffen')
    type(field('Kommentar'), 'Termin nach Absprache, Material separat verrechnet')
    type(field('Einzelpreis'), '180')

    click(button('Hinzufügen'))

    expect(calls.sent).toHaveLength(1)
    expect(calls.sent[0].subtitle).toBe('Anfahrt inbegriffen')
    expect(calls.sent[0].note).toBe('Termin nach Absprache, Material separat verrechnet')
  })

  it('freeLineDialogLeavesTheEmptyTextsOutTest', async () => {
    const calls = await render()

    type(field('Bezeichnung'), 'Beratung vor Ort')
    type(field('2. Bezeichnung'), '   ')
    type(field('Einzelpreis'), '180')

    click(button('Hinzufügen'))

    // Empty is no text: an empty string would be stored as one, and the print would keep a
    // blank line under the description for it.
    expect(calls.sent[0].subtitle).toBeUndefined()
    expect(calls.sent[0].note).toBeUndefined()
  })

  it('freeLineDialogStartsANewLineOnThePriceBaseOfTheDocumentTest', async () => {
    const calls = await render(undefined, true)

    // On a document priced gross, a net line would quietly drop every subtotal of the whole
    // document by its VAT — so a new line starts where the document already stands.
    expect(checkbox('Preis versteht sich inklusive MwSt').checked).toBe(true)

    type(field('Bezeichnung'), 'Reisespesen')
    type(field('Einzelpreis'), '120')
    click(button('Hinzufügen'))

    expect(calls.sent).toHaveLength(1)
    expect(calls.sent[0].priceIncludesVat).toBe(true)
  })

  it('freeLineDialogStartsANewLineNetOnANetDocumentTest', async () => {
    const calls = await render()

    expect(checkbox('Preis versteht sich inklusive MwSt').checked).toBe(false)

    type(field('Bezeichnung'), 'Reisespesen')
    type(field('Einzelpreis'), '120')
    click(button('Hinzufügen'))

    expect(calls.sent[0].priceIncludesVat).toBe(false)
  })

  it('freeLineDialogKeepsTheNetPriceOfAnEditedLineTest', async () => {
    const calls = await render(
      {
        lineNumber: 1,
        kind: 'ITEM',
        description: 'Reisespesen',
        quantity: 1,
        unitPrice: 120,
        priceIncludesVat: false,
        lineNet: 120,
        lineVat: 9.72,
        lineGross: 129.72,
      },
      true,
    )

    // What is written on a line stays on it. A default belongs to a line that is being
    // written, and rewriting a stored one would change an amount nobody touched.
    expect(checkbox('Preis versteht sich inklusive MwSt').checked).toBe(false)

    click(button('Übernehmen'))

    expect(calls.sent[0].priceIncludesVat).toBe(false)
  })

  it('freeLineDialogEditsTheSecondDescriptionAndTheCommentTest', async () => {
    await render({
      lineNumber: 1,
      kind: 'ITEM',
      description: 'Beratung vor Ort',
      subtitle: 'Anfahrt inbegriffen',
      note: 'Termin nach Absprache',
      quantity: 4,
      unitPrice: 180,
      priceIncludesVat: false,
      lineNet: 720,
      lineVat: 58.32,
      lineGross: 778.32,
    })

    // A line that is edited starts on what is stored, or the second text is written twice.
    expect(field('2. Bezeichnung').value).toBe('Anfahrt inbegriffen')
    expect(field('Kommentar').value).toBe('Termin nach Absprache')
  })
})
