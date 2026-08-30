// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import { RegisterGroupLayout } from '../layout/RegisterGroupLayout'
import type { DunningNotice } from '../lib/types'
import { DunningNoticePage } from './DunningNoticePage'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1

function session(modules: string[]): AuthState {
  const permissions = ['DUNNING_READ', 'DUNNING_RUN', 'DUNNING_WRITE']
  return {
    user: {
      userId: 1,
      username: 'muster',
      activeTenantId: TENANT,
      superuser: false,
      tenants: [{ id: TENANT, code: 'WX', name: 'Webux', isDefault: true, modules }],
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

const NOTICE: DunningNotice = {
  id: 5,
  noticeNumber: 'MA-2026-0001',
  fiscalYear: 2026,
  issuedAt: '2026-06-30T08:00:00Z',
  issuedOn: '2026-06-30',
  payableUntil: '2026-07-10',
  partnerId: 1,
  recipientName: 'Druckerei Meier AG',
  languageCode: 'de',
  currency: 'CHF',
  levelNo: 1,
  levelName: 'Zahlungserinnerung',
  levelTitle: 'Zahlungserinnerung',
  feeAmount: 0,
  totalOpenAmount: 1297.2,
  channel: 'PRINT',
  lines: [],
}

let container: HTMLDivElement
let root: Root
let notices: DunningNotice[]

function json(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

beforeEach(() => {
  notices = [NOTICE]
  vi.stubGlobal('fetch', (url: string) => {
    if (url.includes('/dunning/notices')) return json(notices)
    return json([])
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
  for (let round = 0; round < 5; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

/** Shows where the router stands, so a navigation is visible to the test. */
function Where() {
  const { pathname, search } = useLocation()
  return <span data-where={`${pathname}${search}`} />
}

function where(): string {
  return container.querySelector('[data-where]')?.getAttribute('data-where') ?? ''
}

/**
 * The screen inside the layout that draws the register strip.
 *
 * <p>Rendered together on purpose: what this issue is about is the strip above the screen,
 * and testing the two apart would test neither.
 */
async function render(auth: AuthState) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/mahnungen']}>
        <AuthContext.Provider value={auth}>
          <QueryClientProvider client={client}>
            <Where />
            <Routes>
              <Route element={<RegisterGroupLayout />}>
                <Route path="/mahnungen" element={<DunningNoticePage />} />
              </Route>
              <Route path="/mahnvorschlag" element={<p>Mahnvorschlag</p>} />
            </Routes>
          </QueryClientProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
  })
  await settle()
}

function text(): string {
  return container.textContent ?? ''
}

function registers(): string[] {
  return [...container.querySelectorAll('nav[aria-label=Mahnungen] a')].map(
    (link) => link.textContent ?? '',
  )
}

function button(label: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find(
    (entry) => entry.textContent === label,
  ) as HTMLButtonElement | undefined
}

async function click(element: Element | undefined) {
  expect(element).toBeDefined()
  await act(async () => {
    ;(element as HTMLElement).click()
  })
  await settle()
}

describe('DunningNoticePage', () => {
  it('dunningNoticePageShowsThreeRegistersTest', async () => {
    await render(session(['DUNNING']))

    expect(registers()).toEqual(['Mahnungen', 'Mahnvorschlag', 'Mahnstopps'])
    expect(text()).toContain('MA-2026-0001')
  })

  /**
   * The proof test: without the module the issued reminders stay, and stay alone.
   *
   * <p>Business correspondence with a ten-year retention — a switch must not hide it (backend
   * ADR-0092). The two screens that are settings of the dunning do disappear.
   */
  it('dunningNoticePageShowsOnlyTheNoticesWithoutTheModuleTest', async () => {
    await render(session([]))

    expect(registers()).toEqual(['Mahnungen'])
    expect(text()).toContain('MA-2026-0001')
  })

  it('dunningNoticePageHidesTheRunButtonWithoutTheModuleTest', async () => {
    await render(session([]))

    expect(button('Neuer Mahnlauf erstellen')).toBeUndefined()
  })

  it('dunningNoticePageOpensTheRunDialogTest', async () => {
    await render(session(['DUNNING']))
    await click(button('Neuer Mahnlauf erstellen'))

    expect(text()).toContain('Mahnlauf')
    expect(text()).toContain('Stichtag')
    // Nothing is issued here — the dialog computes a proposal.
    expect(button('Vorschlag rechnen')).toBeDefined()
  })

  it('dunningNoticePageTakesTheAsOfToTheWorklistTest', async () => {
    await render(session(['DUNNING']))
    await click(button('Neuer Mahnlauf erstellen'))

    const field = container.querySelector('input[type=date]') as HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )?.set
    await act(async () => {
      setter?.call(field, '2026-06-30')
      field.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await click(button('Vorschlag rechnen'))

    expect(where()).toBe('/mahnvorschlag?stichtag=2026-06-30')
  })

  it('dunningNoticePageCancelChangesNothingTest', async () => {
    await render(session(['DUNNING']))
    await click(button('Neuer Mahnlauf erstellen'))
    await click(button('Abbrechen'))

    expect(where()).toBe('/mahnungen')
    expect(text()).toContain('MA-2026-0001')
  })
})
