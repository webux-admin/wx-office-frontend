// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AuthContext, type AuthState } from '../../auth/authContext'
import type { TimeEntry } from '../../lib/types'
import { DayEntries } from './DayEntries'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function entry(overrides: Partial<TimeEntry>): TimeEntry {
  return {
    id: 1,
    userId: 1,
    workDate: '2026-11-25',
    durationMinutes: 60,
    billable: true,
    state: 'OPEN',
    editable: true,
    lockVersion: 0,
    projectId: 12,
    projectNumber: 'P-00012',
    projectName: 'Website',
    partnerId: 11,
    customerName: 'Muster AG',
    productId: 31,
    serviceName: 'Konzeption',
    ...overrides,
  }
}

/** One entry in each of the four states, with the actions each of them offers. */
const FOUR_STATES: TimeEntry[] = [
  entry({ id: 1, startTime: '08:00', endTime: '09:00', description: 'Wireframes' }),
  entry({
    id: 2,
    state: 'IN_DRAFT',
    editable: false,
    readOnlyReason: 'Der Eintrag steht auf einem Rechnungsentwurf.',
    documentId: 77,
  }),
  entry({
    id: 3,
    state: 'BILLED',
    editable: false,
    readOnlyReason: 'Der Eintrag ist mit der Rechnung RE-2026-0042 verrechnet.',
    documentId: 78,
    documentNumber: 'RE-2026-0042',
  }),
  entry({ id: 4, billable: false, state: 'NOT_BILLABLE', description: 'Weiterbildung' }),
]

function session(): AuthState {
  const permissions = ['TIME_TRACK', 'TIME_BILL', 'INVOICE_READ']
  return {
    user: {
      userId: 1,
      username: 'anna',
      activeTenantId: 1,
      superuser: false,
      tenants: [{ id: 1, code: 'WX', name: 'Webux', isDefault: true, modules: ['TIMETRACKING'] }],
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

function render(entries: TimeEntry[], mayWrite: boolean) {
  act(() => {
    root.render(
      <MemoryRouter>
        <AuthContext.Provider value={session()}>
          <DayEntries
            entries={entries}
            editingId={null}
            editor={null}
            mayWrite={mayWrite}
            copyingId={null}
            continuingId={null}
            onEdit={() => undefined}
            onCopy={() => undefined}
            onContinue={() => undefined}
            onDelete={() => undefined}
            mayRelease={(one) => one.state === 'IN_DRAFT'}
            onRelease={() => undefined}
          />
        </AuthContext.Provider>
      </MemoryRouter>,
    )
  })
}

/** The element that lays out the cells of a row: the row button, or the row itself if it is read-only. */
function cellsOf(row: Element): Element {
  const cells = row.querySelector('[data-testid="entry-actions"]')?.previousElementSibling
  if (!cells) throw new Error('row without cells')
  return cells
}

describe('DayEntries', () => {
  it('lays out the rows of all four states on one grid with fixed state and action columns', () => {
    render(FOUR_STATES, true)

    const rows = [...container.querySelectorAll('li')]
    const layouts = new Set(rows.map((row) => cellsOf(row).className.replace(/ rounded.*$/, '')))

    expect(rows).toHaveLength(4)
    // The button of a changeable row adds hover styles; the grid itself is the same everywhere.
    expect([...layouts].every((layout) => layout.includes('var(--spacing-column-xl)'))).toBe(true)
    expect([...layouts].some((layout) => layout.includes('_auto]'))).toBe(false)
  })

  it('gives every row three action slots of the same width, whatever it offers', () => {
    render(FOUR_STATES, true)

    const bars = [...container.querySelectorAll('[data-testid="entry-actions"]')]

    expect(bars).toHaveLength(4)
    expect(new Set(bars.map((bar) => bar.className)).size).toBe(1)
    expect(bars.map((bar) => bar.children.length)).toEqual([3, 3, 3, 3])
  })

  it('keeps continue, copy and delete in the same slot on every row', () => {
    render(FOUR_STATES, true)

    const bars = [...container.querySelectorAll('[data-testid="entry-actions"]')]
    const labelOf = (bar: Element, slot: number) =>
      bar.children[slot].getAttribute('aria-label') ?? bar.children[slot].tagName

    expect(labelOf(bars[0], 0)).toMatch(/fortsetzen$/)
    expect(labelOf(bars[1], 0)).toMatch(/vom Entwurf lösen$/)
    expect(bars.every((bar) => /kopieren$/.test(labelOf(bar, 1)))).toBe(true)
    expect(labelOf(bars[0], 2)).toMatch(/löschen$/)
    // The billed entry offers nothing in the first slot, and the slot stays.
    expect(bars[2].children[0].getAttribute('aria-hidden')).toBe('true')
  })

  it('keeps the empty bar on a tablet and hides it below, where nothing is offered', () => {
    render([FOUR_STATES[0]], false)

    const bar = container.querySelector('[data-testid="entry-actions"]')

    expect(bar?.children).toHaveLength(3)
    expect(bar?.className).toContain('max-md:hidden')
  })

  it('lets the state break only in a narrow window, centred and without a stretched pill', () => {
    render([FOUR_STATES[2]], true)

    const badge = [...container.querySelectorAll('span.text-caption')].find(
      (span) => span.textContent === 'verrechnet RE-2026-0042',
    )

    expect(badge?.className).toContain('sm:whitespace-nowrap')
    expect(badge?.className).toContain('text-center')
    expect(badge?.className).not.toContain('radius-full')
  })
})
