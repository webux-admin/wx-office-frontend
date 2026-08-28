// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import { MAIL_TEMPLATE_PATH, OUTBOX_RIGHTS } from '../lib/outbox'
import type { MailTemplate } from '../lib/types'
import { OutboxTemplatePage } from './OutboxTemplatePage'

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
      tenants: [
        { id: TENANT, code: 'WX', name: 'Webux', isDefault: true, modules: ['OUTBOX'] },
      ],
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

const BOTH = session([OUTBOX_RIGHTS.read, OUTBOX_RIGHTS.configure])
const READ_ONLY = session([OUTBOX_RIGHTS.read])

function template(overrides: Partial<MailTemplate> = {}): MailTemplate {
  return {
    categoryCode: 'INVOICE',
    categoryLabel: 'Rechnung',
    languageCode: 'de',
    subject: 'Rechnung {{belegnummer}}',
    body: 'Guten Tag\n\nBeiliegend die Rechnung.',
    overridden: false,
    ...overrides,
  }
}

let container: HTMLDivElement
let root: Root
/** What the template endpoint answers. */
let rows: MailTemplate[]
/** Every write the mask sent. */
let written: { url: string; method: string; body: Record<string, unknown> }[]

function json(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

function stubFetch() {
  written = []
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (method !== 'GET') {
      written.push({
        url,
        method,
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : {},
      })
      return json(rows[0])
    }
    return json(rows)
  })
}

beforeEach(() => {
  rows = [
    template(),
    template({ languageCode: 'fr', subject: 'Facture {{belegnummer}}', body: 'Bonjour' }),
    template({ categoryCode: 'OFFER', categoryLabel: 'Offerte', subject: 'Offerte' }),
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

async function settle() {
  for (let round = 0; round < 6; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

async function render(auth: AuthState = BOTH) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[MAIL_TEMPLATE_PATH]}>
        <AuthContext.Provider value={auth}>
          <QueryClientProvider client={client}>
            <OutboxTemplatePage />
          </QueryClientProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
  })
  await settle()
}

function button(text: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find((entry) =>
    entry.textContent?.includes(text),
  ) as HTMLButtonElement | undefined
}

function textarea(): HTMLTextAreaElement | undefined {
  return container.querySelector('textarea') ?? undefined
}

async function click(element: HTMLElement | undefined | null) {
  expect(element).toBeTruthy()
  await act(async () => {
    ;(element as HTMLElement | null)?.click()
  })
  await settle()
}

/** Types into the first text area the way a person would, so React sees the change. */
async function typeBody(value: string) {
  const field = textarea()
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      'value',
    )?.set
    setter?.call(field, value)
    field?.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await settle()
}

describe('OutboxTemplatePage', () => {
  /**
   * The mask has to say where a text comes from. Without the mark nobody can tell an untouched
   * shipped text from one that was typed to look exactly like it.
   */
  it('outboxTemplatePageMarksTheShippedTextTest', async () => {
    await render()

    expect(container.textContent).toContain('mitgeliefert')
    expect(container.textContent).not.toContain('Auf Standard zurücksetzen')
  })

  it('outboxTemplatePageMarksAnOwnTextAndOffersTheResetTest', async () => {
    rows = [template({ overridden: true })]
    await render()

    expect(container.textContent).toContain('Eigener Text')
    expect(button('Auf Standard zurücksetzen')).toBeDefined()
  })

  it('outboxTemplatePageShowsOneRegisterPerCategoryTest', async () => {
    await render()

    const tabs = [...container.querySelectorAll('[role="tab"]')].map(
      (entry) => entry.textContent,
    )
    expect(tabs).toEqual(['Rechnung', 'Offerte'])
    // The first register is open, so its two languages stand there and the Offerte does not.
    expect(container.textContent).toContain('Deutsch')
    expect(container.textContent).toContain('Französisch')
  })

  it('outboxTemplatePageSwitchesRegisterTest', async () => {
    await render()

    await click(
      [...container.querySelectorAll('[role="tab"]')].find(
        (entry) => entry.textContent === 'Offerte',
      ) as HTMLElement,
    )

    expect(container.textContent).not.toContain('Französisch')
  })

  /** Nothing typed, nothing to save: the button stays off until there is a deviation. */
  it('outboxTemplatePageSavesOnlyWhatChangedTest', async () => {
    await render()

    expect(button('Speichern')?.disabled).toBe(true)
    await typeBody('Guten Tag, hier die Rechnung {{belegnummer}}.')
    expect(button('Speichern')?.disabled).toBe(false)

    await click(button('Speichern'))

    const put = written.find((entry) => entry.method === 'PUT')
    expect(put?.url).toBe(`/api/tenants/${TENANT}/outbox/templates/INVOICE/de`)
    expect(put?.body.body).toBe('Guten Tag, hier die Rechnung {{belegnummer}}.')
    expect(put?.body.subject).toBe('Rechnung {{belegnummer}}')
  })

  /**
   * Clicked rather than typed. An unknown placeholder is refused when the template is saved,
   * and `{{beleknummer}}` is exactly the kind of thing that gets typed.
   */
  it('outboxTemplatePageInsertsAPlaceholderTest', async () => {
    await render()
    const field = textarea()
    await act(async () => {
      field?.focus()
      field?.setSelectionRange(0, 0)
      field?.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    })

    await click(button('{{belegnummer}}'))

    expect(textarea()?.value.startsWith('{{belegnummer}}')).toBe(true)
  })

  it('outboxTemplatePageResetsToTheShippedTextTest', async () => {
    rows = [template({ overridden: true })]
    await render()

    await click(button('Auf Standard zurücksetzen'))

    const removed = written.find((entry) => entry.method === 'DELETE')
    expect(removed?.url).toBe(`/api/tenants/${TENANT}/outbox/templates/INVOICE/de`)
  })

  it('outboxTemplatePageLocksTheTextsWithoutTheRightTest', async () => {
    rows = [template({ overridden: true })]
    await render(READ_ONLY)

    expect(textarea()?.disabled).toBe(true)
    expect(button('Speichern')).toBeUndefined()
    expect(button('Auf Standard zurücksetzen')).toBeUndefined()
    expect(button('{{belegnummer}}')).toBeUndefined()
    expect(container.textContent).toContain('Postausgang einrichten')
  })
})
