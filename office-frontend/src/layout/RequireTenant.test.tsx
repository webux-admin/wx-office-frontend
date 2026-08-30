// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import { RequireTenant } from './RequireTenant'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1

function session(permissions: string[], modules: string[]): AuthState {
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

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

async function render(auth: AuthState, module?: 'INVENTORY' | 'DUNNING') {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/bestand']}>
        <AuthContext.Provider value={auth}>
          <RequireTenant permission="INVENTORY_READ" module={module}>
            {(tenantId) => <p>Bestand von {tenantId}</p>}
          </RequireTenant>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
  })
}

function text(): string {
  return container.textContent ?? ''
}

describe('RequireTenant', () => {
  it('requireTenantShowsTheScreenWithRightAndModuleTest', async () => {
    await render(session(['INVENTORY_READ'], ['INVENTORY']), 'INVENTORY')

    expect(text()).toContain('Bestand von 1')
  })

  /**
   * The switch, not the right.
   *
   * <p>«Für diesen Bereich fehlt das Recht INVENTORY_READ» would send an administrator looking
   * for a right that was granted long ago (backend ADR-0060).
   */
  it('requireTenantShowsTheModuleNoticeWhenTheModuleIsOffTest', async () => {
    await render(session(['INVENTORY_READ'], []), 'INVENTORY')

    expect(text()).toContain('Modul nicht eingeschaltet')
    expect(text()).toContain('Lager ist für diesen Mandanten nicht eingeschaltet')
    expect(text()).not.toContain('Bestand von')
    expect(text()).not.toContain('INVENTORY_READ')
    // And it says where the switch is.
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/module')
  })

  /** Both missing: the module is the more precise answer, so it wins. */
  it('requireTenantPrefersTheModuleNoticeOverTheForbiddenNoticeTest', async () => {
    await render(session([], []), 'INVENTORY')

    expect(text()).toContain('Modul nicht eingeschaltet')
    expect(text()).not.toContain('Keine Berechtigung')
  })

  it('requireTenantStillShowsTheForbiddenNoticeWhenOnlyTheRightIsMissingTest', async () => {
    await render(session([], ['INVENTORY']), 'INVENTORY')

    expect(text()).toContain('Keine Berechtigung')
    expect(text()).toContain('INVENTORY_READ')
  })

  /** Every mask without a module — most of them — has to behave exactly as before. */
  it('requireTenantWithoutAModuleBehavesAsBeforeTest', async () => {
    await render(session(['INVENTORY_READ'], []))

    expect(text()).toContain('Bestand von 1')
  })

  it('requireTenantWithoutATenantShowsTheTenantNoticeTest', async () => {
    const none = session(['INVENTORY_READ'], [])
    none.user = { ...none.user!, activeTenantId: null, superuser: true, tenants: [] }

    await render(none, 'INVENTORY')

    expect(text()).toContain('Kein Mandant gewählt')
  })

  /** The name comes from the catalogue, so each module says its own word. */
  it('requireTenantNamesTheModuleItMeansTest', async () => {
    await render(session(['INVENTORY_READ'], []), 'DUNNING')

    expect(text()).toContain('Mahnwesen ist für diesen Mandanten nicht eingeschaltet')
  })
})
