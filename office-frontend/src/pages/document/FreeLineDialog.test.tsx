// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

async function render(): Promise<Calls> {
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
    expect(button('Hinzufügen').disabled).toBe(true)

    click(button('Hinzufügen'))

    expect(calls.sent).toEqual([])
  })
})
