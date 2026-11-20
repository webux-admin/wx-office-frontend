// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../../auth/authContext'
import type { DocumentPrintout } from '../../lib/types'
import { DocumentPrintouts } from './DocumentPrintouts'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1
const BASE = `/api/tenants/${TENANT}/orders/42`

const STORED: DocumentPrintout[] = [
  { id: 101, position: 1, label: 'Original', copies: 1 },
  { id: 102, position: 2, label: 'Buchhaltung', copies: 2 },
]

let container: HTMLDivElement
let root: Root
let sent: { url: string; method: string; body: unknown }[]
let printouts: DocumentPrintout[]

/** Answers the copies, and records what the section writes. */
function stubFetch() {
  sent = []
  vi.stubGlobal('fetch', (url: string, options?: RequestInit) => {
    sent.push({
      url,
      method: options?.method ?? 'GET',
      body: options?.body === undefined ? undefined : JSON.parse(String(options.body)),
    })
    const body = url.includes('/print-layouts') ? [] : printouts
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  })
}

/** A session holding exactly the permissions a test names. */
function auth(permissions: string[]): AuthState {
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
    can: (permission: string) => permissions.includes(permission),
  }
}

beforeEach(() => {
  printouts = STORED
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
  for (let round = 0; round < 5; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

async function render(options: {
  editable?: boolean
  readOnlyNote?: string
  permissions?: string[]
} = {}): Promise<void> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <AuthContext.Provider value={auth(options.permissions ?? ['PRINT_LAYOUT_READ'])}>
          <DocumentPrintouts
            tenantId={TENANT}
            base={BASE}
            editable={options.editable ?? false}
            readOnlyNote={options.readOnlyNote}
            draft
          />
        </AuthContext.Provider>
      </QueryClientProvider>,
    )
  })
  await settle()
}

function text(): string {
  return container.textContent ?? ''
}

/** The input a label points at, found the way a user finds it: by its wording. */
function fieldNamed(label: string, occurrence = 0): HTMLInputElement {
  const labels = [...container.querySelectorAll('label')].filter(
    (element) => element.textContent?.trim() === label,
  )
  const chosen = labels[occurrence]
  if (chosen === undefined) throw new Error(`no field labelled ${label}`)
  return document.getElementById(chosen.htmlFor) as HTMLInputElement
}

function buttonNamed(label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find(
    (button) => button.textContent?.trim() === label,
  )
  if (found === undefined) throw new Error(`no button named ${label}`)
  return found as HTMLButtonElement
}

/** Types into a field the way a browser does: set the value, then fire the native event. */
function type(input: HTMLInputElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setValue?.call(input, value)
  act(() => {
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function click(element: HTMLElement) {
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

describe('DocumentPrintouts', () => {
  it('orderPrintoutsShowsTheStoredCopiesTest', async () => {
    await render()

    expect(text()).toContain('Original')
    expect(text()).toContain('1 Exemplar')
    expect(text()).toContain('2 Exemplare')
  })

  it('orderPrintoutsWithoutCopiesTest', async () => {
    printouts = []

    await render()

    expect(text()).toContain('keine Ausfertigung hinterlegt')
  })

  it('orderPrintoutsSaysWhyItCannotBeChangedTest', async () => {
    await render({ readOnlyNote: 'Zum Ändern fehlt das Recht ORDER_WRITE.' })

    expect(text()).toContain('Zum Ändern fehlt das Recht ORDER_WRITE.')
    expect(container.querySelectorAll('input')).toHaveLength(0)
  })

  it('orderPrintoutsSavesTheWholeListTest', async () => {
    await render({ editable: true })

    type(fieldNamed('Beschriftung'), 'Kundenexemplar')
    click(buttonNamed('Übernehmen'))
    await settle()

    const written = sent.find((request) => request.method === 'PUT')
    expect(written?.url).toBe(`${BASE}/printouts`)
    expect(written?.body).toEqual({
      printouts: [
        {
          label: 'Kundenexemplar',
          copies: 1,
          documentLayoutId: undefined,
          internal: false,
        },
        {
          label: 'Buchhaltung',
          copies: 2,
          documentLayoutId: undefined,
          internal: false,
        },
      ],
    })
  })

  it('orderPrintoutsRefusesAnEmptyLabelTest', async () => {
    await render({ editable: true })

    type(fieldNamed('Beschriftung'), '')
    click(buttonNamed('Übernehmen'))
    await settle()

    expect(text()).toContain('Eine Ausfertigung braucht eine Beschriftung.')
    expect(sent.some((request) => request.method === 'PUT')).toBe(false)
  })

  it('orderPrintoutsRefusesAnUnreadableCountTest', async () => {
    await render({ editable: true })

    type(fieldNamed('Anzahl'), 'zwei')
    click(buttonNamed('Übernehmen'))
    await settle()

    expect(text()).toContain('Die Anzahl ist keine Zahl.')
    expect(sent.some((request) => request.method === 'PUT')).toBe(false)
  })

  /** Printing an unsaved change would print something else than what is on screen. */
  it('orderPrintoutsWaitsForTheSavedStateBeforePrintingTest', async () => {
    await render({ editable: true })

    type(fieldNamed('Beschriftung'), 'Kundenexemplar')

    expect(text()).toContain('Gedruckt wird immer der gespeicherte Stand.')
    expect(buttonNamed('Alle drucken').disabled).toBe(true)
  })

  it('orderPrintoutsAddsAndRemovesARowTest', async () => {
    await render({ editable: true })

    click(buttonNamed('+ Ausfertigung'))
    expect(container.querySelectorAll('[aria-label$="entfernen"]')).toHaveLength(3)

    click(container.querySelector('[aria-label="3. Ausfertigung entfernen"]') as HTMLElement)

    expect(container.querySelectorAll('[aria-label$="entfernen"]')).toHaveLength(2)
  })

  /** Without PRINT_LAYOUT_READ there is no list of forms to choose from, and the mask says so. */
  it('orderPrintoutsWithoutTheLayoutRightTest', async () => {
    await render({ editable: true, permissions: [] })

    expect(text()).toContain('Zum Ändern brauchen Sie das Recht, Druckvorlagen zu sehen.')
    expect(sent.some((request) => request.url.includes('/print-layouts'))).toBe(false)
  })

  /** No printer or tray anywhere: the browser's dialog chooses the device (backend ADR-0138). */
  it('orderPrintoutsNamesNoPrinterTest', async () => {
    await render({ editable: true })

    expect(text()).not.toContain('Drucker')
    expect(text()).not.toContain('Schacht')
  })
})
