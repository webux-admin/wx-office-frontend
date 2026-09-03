// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../../auth/authContext'
import { ACCOUNTING_RIGHTS } from '../../lib/accounting'
import type { ChartTemplate, EquityLayout } from '../../lib/types'
import { ChartTemplateDialog } from './ChartTemplateDialog'

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
        { id: TENANT, code: 'WX', name: 'Webux', isDefault: true, modules: ['ACCOUNTING'] },
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

/** A bookkeeper: the accounting rights, and the tenant master record out of reach. */
const BOOKKEEPER = session([ACCOUNTING_RIGHTS.read, ACCOUNTING_RIGHTS.configure])

/** Somebody who may read the tenant too, so the hint from the master record can appear. */
const WITH_TENANT = session([ACCOUNTING_RIGHTS.read, ACCOUNTING_RIGHTS.configure, 'TENANT_READ'])

const ONE_TEMPLATE: ChartTemplate = {
  code: 'OR_MINIMAL',
  name: 'Mindestgliederung nach OR',
  edition: 'OR Art. 959a/959b',
  sourceNote: 'Eigenwerk aus der gemeinfreien Gliederung nach OR Art. 959a/959b.',
  sortOrder: 20,
  accountCount: { JURISTIC: 39, SOLE_PROPRIETOR: 36, PARTNERSHIP: 40 },
}

let container: HTMLDivElement
let root: Root
/** Every request the dialog sent, so a test can say what went over the wire. */
let sent: { url: string; body: unknown }[]

function json(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

beforeEach(() => {
  sent = []
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    sent.push({
      url,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    })
    if (url.includes('/accounts/from-template')) return json({ created: 39 })
    if (url.match(/\/api\/tenants\/\d+$/)) {
      return json({ id: TENANT, code: 'WX', name: 'Webux', legalFormLabel: 'GmbH' })
    }
    return json({})
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

async function settle() {
  for (let round = 0; round < 6; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

async function render(suggested?: EquityLayout, auth: AuthState = BOOKKEEPER) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <MemoryRouter>
        <AuthContext.Provider value={auth}>
          <QueryClientProvider client={client}>
            <ChartTemplateDialog
              tenantId={TENANT}
              templates={[ONE_TEMPLATE]}
              suggestedLayout={suggested}
              onClose={() => {}}
            />
          </QueryClientProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
  })
  await settle()
}

/** The radio buttons of the equity question, in the order they stand in. */
function equityChoices(): HTMLInputElement[] {
  return [...document.body.querySelectorAll('input[name="equity-layout"]')] as HTMLInputElement[]
}

function button(text: string): HTMLButtonElement | undefined {
  return [...document.body.querySelectorAll('button')].find((entry) =>
    entry.textContent?.includes(text),
  ) as HTMLButtonElement | undefined
}

describe('ChartTemplateDialog', () => {
  /**
   * The ordinary case: the master record points somewhere, and the dialog starts there. The
   * three options stand in the order JURISTIC, SOLE_PROPRIETOR, PARTNERSHIP.
   */
  it('preselectsTheSuggestedLayoutTest', async () => {
    await render('SOLE_PROPRIETOR')

    const choices = equityChoices()
    expect(choices).toHaveLength(3)
    expect(choices.map((choice) => choice.checked)).toEqual([false, true, false])
    expect(button('Kontenplan anlegen')?.disabled).toBe(false)
    expect(document.body.textContent).toContain('Vorbelegt aus der Rechtsform')
  })

  /**
   * The gap this closes. Where the legal form suggests nothing, **nothing** is pre-selected —
   * a pre-selected JURISTIC somebody clicks past gives an association the account «Aktien-,
   * Stamm-, Anteilschein- oder Stiftungskapital» (backend ADR-0112).
   */
  it('preselectsNothingWithoutASuggestionTest', async () => {
    await render(undefined, WITH_TENANT)

    expect(equityChoices().every((choice) => !choice.checked)).toBe(true)
    expect(button('Kontenplan anlegen')?.disabled).toBe(true)
    expect(document.body.textContent).toContain('Bitte wählen')
    expect(document.body.textContent).not.toContain('Vorbelegt aus der Rechtsform')
    // The master record is shown beside the question and nothing is read into it.
    expect(document.body.textContent).toContain('Im Mandantenstamm steht «GmbH»')
  })

  /** Reading the tenant is TENANT_READ; without it the hint stays away and nothing breaks. */
  it('showsNoLegalFormWithoutTenantReadTest', async () => {
    await render(undefined)

    expect(document.body.textContent).not.toContain('Im Mandantenstamm steht')
    expect(sent.some((call) => call.url.match(/\/api\/tenants\/\d+$/))).toBe(false)
  })

  /** What the user picks is what is sent — never the suggestion the dialog started on. */
  it('sendsThePickedLayoutTest', async () => {
    await render('JURISTIC')

    await act(async () => {
      equityChoices()[2].click()
    })
    await settle()

    await act(async () => {
      button('Kontenplan anlegen')?.click()
    })
    await settle()

    const copy = sent.find((call) => call.url.includes('/accounts/from-template'))
    expect(copy?.body).toEqual({ templateCode: 'OR_MINIMAL', equityLayout: 'PARTNERSHIP' })
  })
})
