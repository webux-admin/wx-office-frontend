// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import type { PrintLayout, PrintLayoutDefinition } from '../lib/types'
import { element, sampleCatalogue, sampleForm } from '../printlayout/fixtures'
import { PrintLayoutPage } from './PrintLayoutPage'

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
    signOut: () => Promise.resolve(),
    switchTenant: () => Promise.resolve(),
    refresh: () => Promise.resolve(),
    can: (permission: string) => permissions.includes(permission),
  }
}

let container: HTMLDivElement
let root: Root
/** What the backend holds as form 7. */
let stored: PrintLayout
/** What `GET /fields` answers; a test may replace it. */
let catalogue: unknown
/** Every write the designer sent: address, method and body. */
let written: { url: string; method: string; body: { name?: string; definition?: PrintLayoutDefinition } }[]
/** Every address the designer read. */
let read: string[]
/** What the next write answers. */
let answer: (url: string) => Promise<Response>

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

function layout(definition: PrintLayoutDefinition = sampleForm()): PrintLayout {
  return {
    id: 7,
    code: 'RECHNUNG',
    name: 'Rechnung Webux',
    system: false,
    active: true,
    designed: true,
    usedBy: [{ id: 3, code: 'RE', name: 'Rechnung' }],
    definition,
  }
}

beforeEach(() => {
  stored = layout()
  catalogue = sampleCatalogue()
  written = []
  read = []
  answer = () => json(stored)
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (method !== 'GET') {
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {}
      written.push({ url, method, body })
      return answer(url)
    }
    read.push(url)
    if (url.endsWith('/print-layouts/fields')) return json(catalogue)
    if (url.endsWith('/print-layouts/sample-payment-part')) {
      return Promise.resolve(
        new Response('<svg xmlns="http://www.w3.org/2000/svg"/>', {
          status: 200,
          headers: { 'Content-Type': 'image/svg+xml' },
        }),
      )
    }
    if (url.endsWith('/print-layouts/7')) return json(stored)
    return json({ detail: 'Nicht gefunden.' }, 404)
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

async function settle(ms = 50) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms))
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function render(permissions = ['PRINT_LAYOUT_READ', 'PRINT_LAYOUT_WRITE']) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/druckvorlagen/7']}>
        <AuthContext.Provider value={session(permissions)}>
          <QueryClientProvider client={client}>
            <Routes>
              <Route path="/druckvorlagen/:id" element={<PrintLayoutPage />} />
              <Route path="/druckvorlagen" element={<p>Liste</p>} />
            </Routes>
          </QueryClientProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
  })
  await settle(120)
}

const text = () => document.body.textContent ?? ''

/** The sheet, where the sample document is drawn. */
function sheet(): HTMLElement {
  const found = container.querySelector<HTMLElement>('[data-sheet]')
  if (found === null) throw new Error('no sheet on the page')
  return found
}

/** The object on the sheet behind a key such as `e:1` or `s:2`. */
function object(key: string): HTMLElement {
  const found = sheet().querySelector<HTMLElement>(`[data-key="${key}"]`)
  if (found === null) throw new Error(`nothing on the sheet has the key ${key}`)
  return found
}

/** The keys of what is selected on the sheet. */
function selected(): string[] {
  return [...sheet().querySelectorAll<HTMLElement>('[data-selected="true"]')].map(
    (node) => node.dataset.key ?? '',
  )
}

/** Clicks an object on the sheet the way a pointer does: press and release without moving. */
async function selectOnSheet(key: string, shiftKey = false) {
  const target = object(key).querySelector('[data-object]') ?? object(key)
  await act(async () => {
    target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, shiftKey }))
    target.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0, shiftKey }))
  })
  await settle()
}

/** The control a label points at. */
function control(label: string): HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  const caption = [...document.querySelectorAll('label')].find(
    (entry) => entry.textContent?.replace('*', '').trim() === label,
  )
  const found = caption ? document.getElementById(caption.htmlFor) : null
  if (found === null) throw new Error(`no field labelled ${label}`)
  return found as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
}

/** Types into a field without leaving it. */
async function type(label: string, value: string) {
  const input = control(label)
  await act(async () => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')?.set?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await settle()
}

/** Types a number into a field and confirms it with Enter. */
async function enter(label: string, value: string) {
  await type(label, value)
  await act(async () => {
    control(label).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })
  await settle()
}

async function choose(label: string, value: string) {
  const select = control(label)
  await act(async () => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(select), 'value')?.set?.call(select, value)
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await settle()
}

async function click(target: Element | null | undefined) {
  if (!target) throw new Error('nothing to click')
  await act(async () => {
    ;(target as HTMLElement).click()
  })
  await settle()
}

/** The button that says exactly this, the last one when there are several. */
function button(label: string): HTMLButtonElement {
  const found = [...document.querySelectorAll('button')]
    .filter((entry) => entry.textContent?.trim() === label)
    .at(-1)
  if (found === undefined) throw new Error(`no button ${label}`)
  return found
}

/** The control whose accessible name or tooltip is exactly this. */
function named(label: string): HTMLElement {
  const found = document.querySelector<HTMLElement>(`[aria-label="${label}"], [title="${label}"]`)
  if (found === null) throw new Error(`nothing is named ${label}`)
  return found
}

/** A register of the left pane. */
async function openTab(label: string) {
  const tab = [...document.querySelectorAll('[role="tab"]')].find(
    (entry) => entry.textContent?.trim() === label,
  )
  await click(tab)
}

async function key(name: string, modifiers: KeyboardEventInit = {}, target: Element = document.body) {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...modifiers }))
  })
  await settle()
}

/** What the status line last announced. */
const announced = () => document.querySelector('[role="status"][aria-live="polite"]')?.textContent ?? ''

describe('PrintLayoutPage', () => {
  it('printLayoutPageTest', async () => {
    await render()

    // The sheet shows the sample document, not grey boxes.
    expect(sheet().textContent).toContain('Rechnung RE-2026-00042')
    expect(sheet().textContent).toContain('Nr. RE-2026-00042')
    expect(sheet().textContent).toContain('Muster AG')
    expect(sheet().textContent).toContain('Hosting Basic')
    expect(sheet().textContent).toContain('Total CHF')
    expect(sheet().textContent).toContain('Inhalt beginnt hier')
    // Sizes are the stored millimetres and points.
    expect(object('e:0').style.left).toBe('20mm')
    expect(object('e:0').style.top).toBe('78mm')
    expect(object('e:0').querySelector<HTMLElement>('[data-object]')?.style.fontSize).toBe('13pt')
    // With nothing selected the inspector is about the sheet.
    expect(container.querySelector('aside[aria-label="Einstellungen"] h2')?.textContent).toBe('Blatt')
    expect((control('Bezeichnung der Druckvorlage') as HTMLInputElement).value).toBe('Rechnung Webux')
    expect(text()).toContain('Gedruckt von: Rechnung')
    expect(button('Speichern').disabled).toBe(false)
  })

  it('printLayoutPageDrawsThePositionsAsThePdfDoesTest', async () => {
    await render()

    const table = object('s:1').querySelector('table')
    // The default columns, in print order, with the widths of the catalogue in millimetres.
    expect([...(table?.querySelectorAll('th') ?? [])].map((cell) => cell.textContent)).toEqual([
      'Pos',
      'Artikel',
      'Bezeichnung',
      'Menge',
      'Einheit',
      'Preis',
      'MwSt',
      'Betrag',
    ])
    // The stored width is that of the cell content; each column is 2 mm of padding wider.
    const widths = [...(table?.querySelectorAll('col') ?? [])].map((col) => col.style.width)
    expect(widths).toEqual(['10mm', '24mm', '', '20mm', '15mm', '24mm', '15mm', '26mm'])
    // Numbers stand right.
    const amount = table?.querySelectorAll('th')[7] as HTMLElement
    expect(amount.style.textAlign).toBe('right')
    // Totals 78 mm wide at the right margin, as stored.
    expect(object('s:2').style.marginLeft).toBe('92mm')
    expect(object('s:2').style.width).toBe('78mm')
  })

  it('printLayoutPageInsertsFromThePaletteTest', async () => {
    await render()

    await click(named('Text einfügen — klicken oder auf das Blatt ziehen'))

    // The new text is on the sheet at the top left corner of the margins, and selected.
    expect(selected()).toEqual(['e:4'])
    expect(object('e:4').style.left).toBe('20mm')
    expect(object('e:4').style.top).toBe('18mm')
    expect(container.querySelector('aside[aria-label="Einstellungen"] h2')?.textContent).toBe(
      'Text «Text»',
    )
    expect(announced()).toBe('Text «Text» eingefügt und ausgewählt.')
    expect(text()).toContain('Nicht gespeichert')
  })

  it('printLayoutPageSelectsAnExistingSectionInsteadOfASecondOneTest', async () => {
    await render()

    // The entry says that the section is there already, and what a click on it does.
    await click(
      named(
        'Totale ist schon im Inhalt — klicken wählt es aus, ziehen legt es an eine andere Stelle',
      ),
    )

    // A form has its totals once: the entry leads to the ones that are there.
    expect(selected()).toEqual(['s:2'])
    expect(sheet().querySelectorAll('[data-section]')).toHaveLength(4)
    expect(announced()).toBe('Totale ist schon im Inhalt und jetzt ausgewählt.')

    // Duplicating them is refused as well, with the reason.
    await key('d', { ctrlKey: true })
    expect(sheet().querySelectorAll('[data-section]')).toHaveLength(4)
    expect(announced()).toBe('Totale gibt es nur einmal pro Vorlage.')
  })

  it('printLayoutPageAddsASectionWhereItBelongsTest', async () => {
    await render()

    await click(named('MwSt-Aufstellung einfügen — klicken oder auf das Blatt ziehen'))

    // After the totals, and the totals drop their VAT row because it now has a place of its own.
    expect(selected()).toEqual(['s:3'])
    expect(object('s:3').textContent).toContain('MwSt 8.1%')
    expect(object('s:2').textContent).not.toContain('MwSt 8.1%')
    // 78 mm at the right margin, by the rule of the renderer.
    expect(object('s:3').style.marginLeft).toBe('92mm')
    expect(object('s:3').style.width).toBe('78mm')

    // Of the VAT summary a form may have several.
    await click(named('MwSt-Aufstellung einfügen — klicken oder auf das Blatt ziehen'))
    expect(sheet().querySelectorAll('[data-section]')).toHaveLength(6)
  })

  it('printLayoutPageMovesAnElementByTypingTest', async () => {
    await render()
    await selectOnSheet('e:1')

    await enter('X — von links', '100,5')
    await enter('Y — von oben', '40')

    expect(object('e:1').style.left).toBe('100.5mm')
    expect(object('e:1').style.top).toBe('40mm')
    // The field shows the number the way it is stored, with a point.
    expect((control('X — von links') as HTMLInputElement).value).toBe('100.5')
  })

  it('printLayoutPageRefusesANumberOutsideTheSheetTest', async () => {
    await render()
    await selectOnSheet('e:1')

    await enter('X — von links', '500')

    // Not bent into the range without a word: refused, and the element stays.
    expect(text()).toContain('Erlaubt sind 0 bis 210 mm.')
    expect(object('e:1').style.left).toBe('130mm')

    await enter('X — von links', 'links')
    expect(text()).toContain('Bitte eine Zahl eingeben, zum Beispiel 12.5.')
    expect(object('e:1').style.left).toBe('130mm')
  })

  it('printLayoutPageStepsANumberWithTheArrowKeysTest', async () => {
    await render()
    await selectOnSheet('e:1')

    await key('ArrowUp', {}, control('X — von links'))
    expect(object('e:1').style.left).toBe('130.5mm')
    await key('ArrowDown', { shiftKey: true }, control('X — von links'))
    expect(object('e:1').style.left).toBe('125.5mm')
  })

  it('printLayoutPageNudgesAndDeletesWithTheKeyboardTest', async () => {
    await render()
    await selectOnSheet('e:1')

    await key('ArrowRight')
    expect(object('e:1').style.left).toBe('130.5mm')
    await key('ArrowDown', { shiftKey: true })
    expect(object('e:1').style.top).toBe('55mm')
    await key('ArrowLeft', { altKey: true })
    expect(object('e:1').style.left).toBe('130.4mm')
    expect(announced()).toBe('Belegnummer: 130.4 mm von links, 55 mm von oben')

    await key('Delete')
    expect(sheet().querySelectorAll('[data-key^="e:"]')).toHaveLength(3)
    expect(selected()).toEqual([])
    expect(announced()).toBe('Belegnummer gelöscht. Rückgängig mit Strg+Z.')
  })

  it('printLayoutPageLeavesTheKeysToAFieldBeingTypedInTest', async () => {
    await render()
    await selectOnSheet('e:1')

    // Backspace in the name field deletes a letter, not the selected element.
    await key('Backspace', {}, control('Bezeichnung der Druckvorlage'))
    await key('ArrowRight', {}, control('Bezeichnung der Druckvorlage'))

    expect(sheet().querySelectorAll('[data-key^="e:"]')).toHaveLength(4)
    expect(object('e:1').style.left).toBe('130mm')
  })

  it('printLayoutPageUndoesAndRedoesTest', async () => {
    await render()
    await selectOnSheet('e:1')
    await enter('X — von links', '100')
    await key('Delete')
    expect(sheet().querySelectorAll('[data-key^="e:"]')).toHaveLength(3)

    await key('z', { ctrlKey: true })
    expect(sheet().querySelectorAll('[data-key^="e:"]')).toHaveLength(4)
    expect(object('e:1').style.left).toBe('100mm')
    // The selection comes back with the element.
    expect(selected()).toEqual(['e:1'])

    await click(named('Rückgängig (Strg+Z)'))
    expect(object('e:1').style.left).toBe('130mm')

    await key('y', { ctrlKey: true })
    expect(object('e:1').style.left).toBe('100mm')
    await key('z', { ctrlKey: true, shiftKey: true })
    expect(sheet().querySelectorAll('[data-key^="e:"]')).toHaveLength(3)
    expect((named('Wiederholen (Strg+Y)') as HTMLButtonElement).disabled).toBe(true)
  })

  it('printLayoutPageSelectsSeveralAndMovesThemTogetherTest', async () => {
    await render()
    await selectOnSheet('e:0')
    await selectOnSheet('e:1', true)

    expect(selected().sort()).toEqual(['e:0', 'e:1'])
    expect(text()).toContain('2 Elemente')

    await key('ArrowDown', { shiftKey: true })
    expect(object('e:0').style.top).toBe('83mm')
    expect(object('e:1').style.top).toBe('55mm')

    // Escape lets go of the selection and does not leave the designer.
    await key('Escape')
    expect(selected()).toEqual([])
    expect(text()).not.toContain('Liste')
  })

  it('printLayoutPageDuplicatesCopiesAndPastesTest', async () => {
    await render()
    await selectOnSheet('e:1')

    await key('d', { ctrlKey: true })
    expect(selected()).toEqual(['e:4'])
    expect(object('e:4').style.left).toBe('135mm')

    await key('c', { ctrlKey: true })
    await key('v', { ctrlKey: true })
    expect(selected()).toEqual(['e:5'])
    expect(object('e:5').style.left).toBe('140mm')
  })

  it('printLayoutPageConfiguresTheColumnsTest', async () => {
    await render()
    await selectOnSheet('s:1')
    const headings = () =>
      [...object('s:1').querySelectorAll('th')].map((cell) => cell.textContent)

    // 120 mm of content and 2 mm of padding for each of the seven fixed columns.
    expect(text()).toContain('Benutzt 134 von 170 mm')
    expect(text()).toContain('«Bezeichnung» füllt die übrigen 34 mm.')

    // Switching a column off takes it off the sheet and out of the sum.
    await click(control('Einheit'))
    expect(headings()).not.toContain('Einheit')
    expect(text()).toContain('Benutzt 119 von 170 mm')

    // Switching one on appends it.
    await click(control('Rabatt %'))
    expect(headings().at(-1)).toBe('Rabatt %')

    // The arrows change the print order.
    await click(named('Rabatt % nach oben'))
    expect(headings().slice(-2)).toEqual(['Rabatt %', 'Betrag'])

    // A heading of one's own, and a width that no longer fits — said in words.
    await click(named('Betrag: Überschrift, Breite und Ausrichtung'))
    await type('Überschrift', 'Total')
    expect(headings().at(-1)).toBe('Total')
    await enter('Breite', '120')
    expect(text()).toContain(
      'Die Spalten brauchen 231 mm, Platz ist für 170 mm. Spalten schmaler machen oder ausblenden.',
    )
    // Columns that do not fit are refused by the server, so the designer does not offer to save.
    expect(button('Speichern').disabled).toBe(true)

    // Exactly one column fills the rest: taking it over hands the description a width.
    await click(control('Füllt den Rest'))
    const widths = () => [...object('s:1').querySelectorAll('col')].map((col) => col.style.width)
    expect(widths()[2]).toBe('42mm')
    // The new filler has too little room, so the sheet draws it at its minimum of 20 mm and
    // lets the table run over — a column squeezed to nothing would hide the problem.
    expect(widths().at(-1)).toBe('22mm')
    // 151 mm of fixed columns leave the new filler 17 mm, and it is counted at 20 at least.
    expect(text()).toContain('Für «Total» bleiben nur 17 mm; nötig sind mindestens 20 mm.')
    expect(button('Speichern').disabled).toBe(true)

    await click(control('Rabatt %'))
    expect(button('Speichern').disabled).toBe(false)
    // With room again, the filler takes what is left.
    expect(widths().at(-1)).toBe('')
  })

  it('printLayoutPageKeepsATypedValueOnTheElementItWasTypedForTest', async () => {
    await render()
    await selectOnSheet('e:1')
    await type('X — von links', '100')
    const field = control('X — von links')

    // The real order of a click on another element: the press reaches the sheet first and is
    // rendered — a browser flushes a press at once — and only then does the field hear that
    // it lost the focus. Each step in an act of its own, or React would batch them and the
    // field would still belong to the old element when it is left.
    const other = object('e:0').querySelector('[data-object]') ?? object('e:0')
    await act(async () => {
      other.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
    })
    await act(async () => {
      field.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    })
    await act(async () => {
      other.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0 }))
    })
    await settle()

    // The number went to the element it was typed for, and the other one did not move.
    expect(object('e:1').style.left).toBe('100mm')
    expect(object('e:0').style.left).toBe('20mm')
    expect(selected()).toEqual(['e:0'])
    expect((control('X — von links') as HTMLInputElement).value).toBe('20.0')
  })

  it('printLayoutPageKeepsATypedValueOnTheSectionItWasTypedForTest', async () => {
    await render()
    await selectOnSheet('s:2')
    await type('Einzug', '50')
    const field = control('Einzug')

    const other = object('s:1').querySelector('[data-object]') ?? object('s:1')
    await act(async () => {
      other.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
    })
    await act(async () => {
      field.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    })
    await act(async () => {
      other.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0 }))
    })
    await settle()

    expect(object('s:2').style.marginLeft).toBe('50mm')
    expect(object('s:1').style.marginLeft).toBe('0mm')
    expect(selected()).toEqual(['s:1'])
  })

  it('printLayoutPageDropsATypedValueItCannotTakeRatherThanMovingItOnTest', async () => {
    await render()
    await selectOnSheet('e:1')
    await type('X — von links', '999')

    await selectOnSheet('e:0')

    // Out of range for the element it was typed for, and never applied to the next one.
    expect(object('e:1').style.left).toBe('130mm')
    expect(object('e:0').style.left).toBe('20mm')
  })

  it('printLayoutPageSavesWhatIsStillBeingTypedTest', async () => {
    await render()
    await type('Oben', '25')

    // Ctrl+S with the caret still in the field: the value goes out with the form.
    await key('s', { ctrlKey: true }, control('Oben'))

    expect(written).toHaveLength(1)
    expect(written[0].body.definition?.page.marginTop).toBe(25)
    expect(text()).not.toContain('Nicht gespeichert')

    // The button does the same.
    await type('Unten', '30')
    await click(button('Speichern'))
    expect(written[1].body.definition?.page.marginBottom).toBe(30)
  })

  it('printLayoutPageDoesNotSaveWithAValueItCannotTakeTest', async () => {
    await render()
    await type('Oben', '999')

    await key('s', { ctrlKey: true }, control('Oben'))

    // Nothing goes out, and the field says what is wrong with it.
    expect(written).toHaveLength(0)
    expect(text()).toContain('Erlaubt sind 0 bis 297 mm.')
    expect(announced()).toBe('Bitte zuerst die markierte Eingabe korrigieren.')

    await click(button('Vorschau (PDF)'))
    expect(written).toHaveLength(0)
  })

  it('printLayoutPagePreviewsWhatIsStillBeingTypedTest', async () => {
    Object.assign(URL, { createObjectURL: () => 'blob:vorschau', revokeObjectURL: () => {} })
    answer = () =>
      Promise.resolve(
        new Response('%PDF-1.7', { status: 200, headers: { 'Content-Type': 'application/pdf' } }),
      )
    try {
      await render()
      await type('Links', '30')

      await click(button('Vorschau (PDF)'))

      expect(written[0].body.definition?.page.marginLeft).toBe(30)
    } finally {
      Reflect.deleteProperty(URL, 'createObjectURL')
      Reflect.deleteProperty(URL, 'revokeObjectURL')
    }
  })

  it('printLayoutPageWidensRightAlignedTotalsToTheLeftTest', async () => {
    await render()
    await selectOnSheet('s:2')
    await click(button('Rechts'))

    // At the right margin the section grows to the left, so the whole content width is free.
    await enter('Breite', '100')

    expect(text()).not.toContain('Erlaubt sind')
    expect(object('s:2').style.width).toBe('100mm')
    expect(object('s:2').style.marginLeft).toBe('70mm')
  })

  it('printLayoutPageUndoesWithTheFocusOnASwitchTest', async () => {
    await render()
    await selectOnSheet('s:1')
    await click(control('Kopfzeile zeigen'))
    expect(object('s:1').querySelector('thead')).toBeNull()

    // The focus is on the checkbox, which is no text field: Ctrl+Z belongs to the designer.
    await key('z', { ctrlKey: true }, control('Kopfzeile zeigen'))
    expect(object('s:1').querySelector('thead')).not.toBeNull()

    await key('y', { ctrlKey: true }, control('Kopfzeile zeigen'))
    expect(object('s:1').querySelector('thead')).toBeNull()
  })

  it('printLayoutPageLeavesUndoToATextFieldTest', async () => {
    await render()
    await selectOnSheet('s:1')
    await click(control('Kopfzeile zeigen'))

    // In a text field Ctrl+Z takes back a letter, not a step of the form.
    await key('z', { ctrlKey: true }, control('Bezeichnung der Druckvorlage'))

    expect(object('s:1').querySelector('thead')).toBeNull()
  })

  it('printLayoutPagePutsAPictureOnTheFormAsItIsWhenTheFileHasBeenReadTest', async () => {
    await render()
    await click(named('Bild / Logo einfügen — klicken oder auf das Blatt ziehen'))
    expect(selected()).toEqual(['e:4'])
    const choose = (name: string) => {
      const input = document.querySelector<HTMLInputElement>('input[type="file"]')
      if (input === null) throw new Error('no file field')
      const file = new File([new Uint8Array([137, 80, 78, 71])], name, { type: 'image/png' })
      Object.defineProperty(input, 'files', { value: [file], configurable: true })
      input.dispatchEvent(new Event('change', { bubbles: true }))
    }

    // Meanwhile the form changes: another element moves. The picture must not undo that.
    await act(async () => {
      choose('logo.png')
    })
    await key('ArrowRight')
    await settle(150)

    const picture = object('e:4').querySelector('img')
    expect(picture?.getAttribute('src')).toMatch(/^data:image\/png;base64,/)
    expect(object('e:4').style.left).toBe('20.5mm')
    expect(announced()).toBe('Bild übernommen.')
  })

  it('printLayoutPageDropsAPictureWhoseElementIsGoneTest', async () => {
    await render()
    await click(named('Bild / Logo einfügen — klicken oder auf das Blatt ziehen'))
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')
    if (input === null) throw new Error('no file field')
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'logo.png', { type: 'image/png' })
    Object.defineProperty(input, 'files', { value: [file], configurable: true })

    // The element is deleted while the file is still being read.
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await key('Delete')
    await settle(150)

    expect(sheet().querySelectorAll('[data-key^="e:"]')).toHaveLength(4)
    expect(sheet().querySelector('img')).toBeNull()
    expect(announced()).toBe('Das Bild wurde nicht übernommen: das Element gibt es nicht mehr.')
  })

  it('printLayoutPageKeepsTheKeyboardOnTheSheetAfterDeletingTest', async () => {
    await render()
    await selectOnSheet('e:1')

    await click(document.querySelector('aside[aria-label="Einstellungen"] [aria-label="Belegnummer löschen"]'))

    // The button that was pressed is gone with the inspector; the focus is on the sheet, so
    // the next key still belongs to the designer.
    expect(document.activeElement).toBe(sheet())
    await key('z', { ctrlKey: true }, sheet())
    expect(sheet().querySelectorAll('[data-key^="e:"]')).toHaveLength(4)
  })

  it('printLayoutPagePutsTheKeyboardOnTheCopyAfterDuplicatingTest', async () => {
    await render()
    await selectOnSheet('e:1')

    await click(
      document.querySelector('aside[aria-label="Einstellungen"] [aria-label="Belegnummer duplizieren"]'),
    )

    expect(selected()).toEqual(['e:4'])
    expect(document.activeElement).toBe(object('e:4').querySelector('[data-object]'))

    // The floating bar at the element goes the same way.
    await click(sheet().querySelector('[data-action="duplicate"]'))
    expect(document.activeElement).toBe(object('e:5').querySelector('[data-object]'))
    await click(sheet().querySelector('[data-action="remove"]'))
    expect(document.activeElement).toBe(sheet())
  })

  it('printLayoutPageDrawsATableThatDoesNotFitAsItIsTest', async () => {
    await render()

    // On A5 the content is 108 mm wide and the default columns need 134 mm.
    await choose('Papierformat', 'A5')

    const table = object('s:1').querySelector('table') as HTMLTableElement
    const widths = [...table.querySelectorAll('col')].map((col) => col.style.width)
    // The filling column keeps its minimum instead of collapsing, the table is as wide as
    // its columns, and every row of the sample is still there.
    expect(widths[2]).toBe('22mm')
    expect(table.style.width).toBe('156mm')
    expect(table.querySelectorAll('tbody tr')).toHaveLength(3)
    expect(table.textContent).toContain('Hosting Basic')
    expect(button('Speichern').disabled).toBe(true)
  })

  it('printLayoutPageSendsTheStyleOfAFreeSectionBackTest', async () => {
    const form = sampleForm()
    const free = form.flow.sections[3]
    if (free.type !== 'FREE') throw new Error('the fixture changed')
    free.style = { fontSize: 7.5, bold: false, italic: true, align: null, colour: '#555555', lineWidth: null }
    stored = layout(form)

    await render()
    // The elements inside inherit it on the sheet, as they do in the PDF.
    expect(object('s:3').style.fontSize).toBe('7.5pt')
    expect(object('s:3').style.fontStyle).toBe('italic')
    await click(named('Text einfügen — klicken oder auf das Blatt ziehen'))
    await click(button('Speichern'))

    expect(written[0].body.definition?.flow.sections[3]).toMatchObject({
      type: 'FREE',
      style: { fontSize: 7.5, italic: true, colour: '#555555' },
    })
  })

  it('printLayoutPageDrawsAStandingLineTest', async () => {
    const form = sampleForm()
    // A height and no width: the renderer draws this as a standing rule.
    form.elements.push(element({ type: 'LINE', text: null, x: 6, y: 20, width: null, height: 120 }))
    stored = layout(form)

    await render()

    expect(object('e:4').style.width).toBe('0mm')
    expect(object('e:4').style.height).toBe('120mm')
    await selectOnSheet('e:4')
    expect((control('Länge') as HTMLInputElement).value).toBe('120.0')
    expect(
      [...document.querySelectorAll<HTMLInputElement>('input[type="radio"]')].find(
        (input) => input.value === 'vertical',
      )?.checked,
    ).toBe(true)
  })

  it('printLayoutPageOffersThePaymentPartAtTheBottomOnlyOnAFourTest', async () => {
    await render()
    const bottom = () =>
      [...document.querySelectorAll<HTMLInputElement>('input[type="radio"]')].find(
        (input) => input.value === 'LAST_PAGE_BOTTOM',
      )

    expect(bottom()?.disabled).toBe(false)
    await click(bottom())
    expect(sheet().querySelector('[data-payment-part]')).not.toBeNull()
    // What reaches into the bottom 105 mm says that it gives way to the payment part.
    expect(object('e:3').querySelector('[data-warning]')?.getAttribute('title')).toBe(
      'Erscheint auf der letzten Seite nicht: dort steht der Zahlteil.',
    )

    await choose('Papierformat', 'A5')

    // On A5 the option stays in the list, disabled, with the reason next to it — and the
    // form falls back to the page of its own instead of keeping a placement that is refused.
    expect(bottom()?.disabled).toBe(true)
    expect(text()).toContain(
      'Nur auf A4 hoch möglich: der Zahlteil ist 210 mm breit und steht am unteren Rand.',
    )
    expect(sheet().querySelector('[data-payment-part]')).toBeNull()
    expect(sheet().style.width).toBe('148mm')
    expect(announced()).toBe('Auf diesem Papier steht der QR-Zahlteil auf einer eigenen Seite.')

    // Landscape is no better.
    await choose('Papierformat', 'A4')
    expect(bottom()?.disabled).toBe(false)
    await click(
      [...document.querySelectorAll<HTMLInputElement>('input[type="radio"]')].find(
        (input) => input.value === 'LANDSCAPE',
      ),
    )
    expect(bottom()?.disabled).toBe(true)
    expect(sheet().style.width).toBe('297mm')
  })

  it('printLayoutPageSavesVersionTwoTest', async () => {
    await render()
    await selectOnSheet('e:1')
    await enter('X — von links', '100')
    await type('Bezeichnung der Druckvorlage', 'Rechnung neu')

    await click(button('Speichern'))

    expect(written).toHaveLength(1)
    expect(written[0].method).toBe('PUT')
    expect(written[0].url).toBe('/api/tenants/1/print-layouts/7')
    expect(written[0].body.name).toBe('Rechnung neu')
    // Exactly the stored form with the one change, in the version 2 shape.
    const expected = sampleForm()
    expected.elements[1].x = 100
    expect(written[0].body.definition).toEqual(expected)
    expect(written[0].body.definition?.version).toBe(2)
    expect(text()).toContain('Gespeichert')
    expect(text()).not.toContain('Nicht gespeichert')
  })

  it('printLayoutPageSavesWithTheKeyboardTest', async () => {
    await render()
    await click(named('Text einfügen — klicken oder auf das Blatt ziehen'))

    await key('s', { ctrlKey: true })

    expect(written).toHaveLength(1)
    expect(written[0].body.definition?.elements).toHaveLength(5)
    expect(written[0].body.definition?.elements[4]).toMatchObject({
      type: 'TEXT',
      repeat: 'FIRST_PAGE',
      text: 'Text',
      x: 20,
      y: 18,
    })
  })

  it('printLayoutPageShowsWhatTheBackendRefusedTest', async () => {
    answer = () =>
      json({ detail: 'Das Element «Belegnummer» nennt ein Feld, das es nicht gibt.' }, 422)
    await render()
    await click(named('Text einfügen — klicken oder auf das Blatt ziehen'))

    await click(button('Speichern'))

    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      'Das Element «Belegnummer» nennt ein Feld, das es nicht gibt.',
    )
    expect(text()).toContain('Nicht gespeichert')
  })

  it('printLayoutPageBlocksSavingWhatTheBackendWouldRefuseTest', async () => {
    await render()

    // The start of the content cannot be typed below what leaves it 40 mm: 297 − 22 − 40.
    await enter('Inhalt beginnt auf Seite 1 bei', '240')
    expect(text()).toContain('Erlaubt sind 0 bis 235 mm.')
    expect(button('Speichern').disabled).toBe(false)

    // A bottom margin of 160 leaves 297 − 103 − 160 = 34 mm; the backend wants 40. The line
    // does not move by itself: the designer says what is wrong and where.
    await enter('Unten', '160')

    expect(button('Speichern').disabled).toBe(true)
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      'Speichern ist so nicht möglich.',
    )
    expect(text()).toContain('Auf Seite 1 bleiben für den Inhalt nur 34 mm; nötig sind 40 mm.')
    expect(sheet().querySelector('[data-flow-top]')?.getAttribute('aria-valuenow')).toBe('103')
    await key('s', { ctrlKey: true })
    expect(written).toHaveLength(0)
  })

  it('printLayoutPageShowsAnUnknownFieldTest', async () => {
    const form = sampleForm()
    form.elements.push(element({ type: 'FIELD', field: 'retired.field', text: null, x: 20, y: 90 }))
    stored = layout(form)

    await render()

    // The form opens, the element is there and says what is wrong with it.
    expect(object('e:4').textContent).toContain('Unbekanntes Feld')
    expect(object('e:4').querySelector('[data-warning]')?.getAttribute('title')).toBe(
      'Das Feld «retired.field» gibt es nicht mehr. Ein anderes Feld wählen oder das Element löschen.',
    )
    // The server would refuse the form, so the designer says so before anyone presses save —
    // and leads to the element.
    expect(button('Speichern').disabled).toBe(true)
    await click(button('Anzeigen'))
    expect(selected()).toEqual(['e:4'])
    expect(container.querySelector('aside[aria-label="Einstellungen"] h2')?.textContent).toBe(
      'Unbekanntes Feld',
    )
    expect(text()).toContain('retired.field')

    // Bound to a field that exists, the form can be saved again.
    await click(document.querySelector('aside[aria-label="Einstellungen"] button[aria-expanded]'))
    await click(
      [...document.querySelectorAll('aside[aria-label="Einstellungen"] li button')].find((entry) =>
        entry.textContent?.startsWith('Belegdatum'),
      ),
    )
    expect(object('e:4').querySelector('[data-object]')?.textContent).toBe('21.11.2026')
    expect(button('Speichern').disabled).toBe(false)
  })

  it('printLayoutPageWithAnUnknownColumnTest', async () => {
    const form = sampleForm()
    const positions = form.flow.sections[1]
    if (positions.type !== 'POSITIONS') throw new Error('the fixture changed')
    positions.columns = [
      { code: 'description', widthMm: null, label: null, align: null },
      { code: 'retired', widthMm: null, label: null, align: null },
    ]
    stored = layout(form)

    await render()
    await selectOnSheet('s:1')

    // Not printed on the sheet, but listed so it can be taken out knowingly.
    expect([...object('s:1').querySelectorAll('th')].map((cell) => cell.textContent)).toEqual([
      'Bezeichnung',
    ])
    expect(text()).toContain('Unbekannte Spalte (retired)')
    expect(text()).toContain(
      'Die Spalte «retired» gibt es nicht mehr. Bitte in der Spaltenliste abwählen.',
    )
    expect(button('Speichern').disabled).toBe(true)

    await click(control('Unbekannte Spalte (retired)'))
    expect(text()).not.toContain('Unbekannte Spalte (retired)')
    expect(button('Speichern').disabled).toBe(false)
  })

  it('printLayoutPageWithAnEmptyCatalogueTest', async () => {
    catalogue = { fields: [], columns: [] }
    stored = layout({ ...sampleForm(), elements: [], flow: { top: 103, sections: [] } })

    await render()

    expect(sheet().textContent).toContain('Ziehen Sie Elemente von links auf das Blatt')
    await openTab('Felder')
    expect(text()).toContain('Keine Felder verfügbar')
  })

  it('printLayoutPageFindsFieldsByNameAndSampleTest', async () => {
    await render()
    await openTab('Felder')

    // Every field with its sample value; what is on the sheet already says so.
    expect(text()).toContain('Belegdatum')
    expect(text()).toContain('21.11.2026')
    expect(document.querySelectorAll('button[aria-label$="auf dem Blatt auswählen"]')).toHaveLength(2)

    await type('Feld suchen', '21.12')
    expect(text()).toContain('Fällig am')
    expect(text()).not.toContain('Belegdatum')

    await type('Feld suchen', 'gibtesnicht')
    expect(text()).toContain('Kein Feld gefunden')

    await type('Feld suchen', 'belegnummer')
    await click(named('Belegnummer ist verwendet: auf dem Blatt auswählen'))
    expect(selected()).toEqual(['e:1'])

    await click(named('Belegnummer einfügen — klicken oder auf das Blatt ziehen'))
    expect(selected()).toEqual(['e:4'])
    expect(object('e:4').querySelector('[data-object]')?.textContent).toBe('RE-2026-00042')
  })

  it('printLayoutPageReordersAndRemovesInTheOutlineTest', async () => {
    await render()
    await openTab('Aufbau')
    const kinds = () =>
      [...sheet().querySelectorAll('[data-section]')].map((node) =>
        node.querySelector('[data-object]')?.getAttribute('aria-label')?.split(',')[0],
      )

    expect(kinds()).toEqual(['Belegtext (Kopf)', 'Positionen', 'Totale', 'Freier Bereich'])

    await click(named('Totale nach oben'))
    expect(kinds()).toEqual(['Belegtext (Kopf)', 'Totale', 'Positionen', 'Freier Bereich'])
    expect(selected()).toEqual(['s:1'])
    expect(announced()).toBe('Jetzt an Stelle 2 von 4.')

    await click(named('Belegtext (Kopf) löschen'))
    expect(kinds()).toEqual(['Totale', 'Positionen', 'Freier Bereich'])

    // A click on a line of the outline selects that object on the sheet.
    await click(button('Text «Besten Dank»'))
    expect(selected()).toEqual(['c:2:0'])
  })

  it('printLayoutPageTurnsAFixedElementIntoContentAndBackTest', async () => {
    await render()
    await selectOnSheet('e:1')
    const placement = (value: string) =>
      [...document.querySelectorAll<HTMLInputElement>('input[type="radio"]')].find(
        (input) => input.value === value,
      )

    // The way without dragging: the element moves into a free section of its own.
    await click(placement('content'))
    expect(selected()).toEqual(['c:4:0'])
    expect(sheet().querySelectorAll('[data-section]')).toHaveLength(5)
    expect(announced()).toBe('Belegnummer bewegt sich jetzt mit dem Inhalt mit.')

    await click(placement('fixed'))
    expect(selected()).toEqual(['e:3'])
    expect(announced()).toBe('Belegnummer steht jetzt fest auf dem Blatt.')
  })

  it('printLayoutPageShowsWhatRepeatsOnAFollowingPageTest', async () => {
    await render()

    await click(button('Folgeseite'))

    // Only what stands on every page, and no content to arrange.
    expect(sheet().querySelectorAll('[data-key^="e:"]')).toHaveLength(1)
    expect(sheet().textContent).toContain('Muster AG · Bern')
    expect(sheet().textContent).toContain('Hier läuft der Inhalt weiter.')
    expect(sheet().querySelector('[data-flow-top]')).toBeNull()

    await click(button('Inhalt auf Seite 1 bearbeiten'))
    expect(sheet().querySelectorAll('[data-key^="e:"]')).toHaveLength(4)
  })

  it('printLayoutPageSwitchesWhereAnElementAppearsTest', async () => {
    await render()
    await selectOnSheet('e:1')

    // The floating bar at the element.
    await click(sheet().querySelector('[data-action="repeat-every"]'))
    expect(announced()).toBe('Erscheint jetzt auf jeder Seite.')

    await click(button('Folgeseite'))
    expect(sheet().querySelectorAll('[data-key^="e:"]')).toHaveLength(2)
  })

  it('printLayoutPageMovesTheStartOfTheContentWithTheKeyboardTest', async () => {
    await render()
    const handle = sheet().querySelector('[data-flow-top]') as HTMLElement

    expect(handle.getAttribute('role')).toBe('slider')
    expect(handle.getAttribute('aria-valuenow')).toBe('103')
    await key('ArrowUp', {}, handle)
    await key('ArrowUp', { shiftKey: true }, handle)

    expect(handle.getAttribute('aria-valuenow')).toBe('97')
    expect(announced()).toBe('Der Inhalt beginnt bei 97 mm.')
    expect((control('Inhalt beginnt auf Seite 1 bei') as HTMLInputElement).value).toBe('97.0')
  })

  it('printLayoutPagePreviewsWithThePaymentPartTest', async () => {
    Object.assign(URL, { createObjectURL: () => 'blob:vorschau', revokeObjectURL: () => {} })
    answer = () =>
      Promise.resolve(
        new Response('%PDF-1.7', { status: 200, headers: { 'Content-Type': 'application/pdf' } }),
      )
    try {
      await render()

      await click(button('Vorschau (PDF)'))

      // The form as it stands travels in the request, with the switch of the toolbar.
      expect(written[0].method).toBe('POST')
      expect(written[0].url).toBe('/api/tenants/1/print-layouts/preview?paymentPart=true')
      expect(written[0].body.definition?.version).toBe(2)
      const dialog = document.querySelector('[role="dialog"]')
      expect(dialog?.querySelector('iframe')?.getAttribute('src')).toBe('blob:vorschau')
      expect(dialog?.textContent).toContain('In neuem Tab öffnen')

      await click(button('Schliessen'))
      await settle(400)
      await click(button('QR-Zahlteil zeigen'))
      await click(button('Vorschau (PDF)'))
      expect(written[1].url).toBe('/api/tenants/1/print-layouts/preview?paymentPart=false')
    } finally {
      Reflect.deleteProperty(URL, 'createObjectURL')
      Reflect.deleteProperty(URL, 'revokeObjectURL')
    }
  })

  it('printLayoutPageFetchesThePaymentPartThroughTheClientTest', async () => {
    await render()

    expect(read).toContain('/api/tenants/1/print-layouts/sample-payment-part')
    expect(read).toContain('/api/tenants/1/print-layouts/fields')
  })

  it('printLayoutPageOfAShippedFormTest', async () => {
    stored = { ...layout(), designed: false, system: true, definition: undefined }

    await render()

    // No sheet to draw on: a shipped form is copied before it is changed.
    expect(container.querySelector('[data-sheet]')).toBeNull()
    expect(text()).toContain('Diese Vorlage ist mitgeliefert')
    expect(text()).toContain('Zu den Druckvorlagen')
  })

  it('printLayoutPageWithoutPermissionTest', async () => {
    await render(['PRINT_LAYOUT_READ'])

    expect(container.querySelector('[data-sheet]')).toBeNull()
    expect(text()).toContain('Keine Berechtigung')
  })

  it('printLayoutPageWhenTheFormCannotBeLoadedTest', async () => {
    vi.stubGlobal('fetch', (url: string) =>
      url.endsWith('/fields') ? json(sampleCatalogue()) : json({ detail: 'Nicht gefunden.' }, 404),
    )

    await render()

    expect(container.querySelector('[data-sheet]')).toBeNull()
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('Nicht gefunden.')
    expect(text()).toContain('Erneut versuchen')
  })

  it('printLayoutPageWhenTheCatalogueCannotBeLoadedTest', async () => {
    vi.stubGlobal('fetch', (url: string) =>
      url.endsWith('/fields') ? json({ detail: 'Das Backend meldet einen Fehler.' }, 500) : json(stored),
    )

    await render()

    // Without the sample document there is nothing true to draw; the designer says so.
    expect(container.querySelector('[data-sheet]')).toBeNull()
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      'Das Backend meldet einen Fehler.',
    )
  })

  it('printLayoutPageAsksBeforeLeavingWithChangesTest', async () => {
    await render()
    await click(named('Text einfügen — klicken oder auf das Blatt ziehen'))
    await key('Escape')
    // The first Escape only lets go of the selection.
    expect(selected()).toEqual([])
    expect(document.querySelector('[role="dialog"]')).toBeNull()

    await key('Escape')

    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Änderungen verwerfen?')
  })
})
