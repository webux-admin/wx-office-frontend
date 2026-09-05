// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../../auth/authContext'
import {
  ACCOUNTING_RIGHTS,
  entryTemplatesKey,
  fetchEntryTemplates,
} from '../../lib/accounting'
import type { EntryTemplate, EntryTemplateLine } from '../../lib/types'
import { ManageTemplatesDialog } from './ManageTemplatesDialog'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  sent.length = 0
  conflictOn = null
  listReads = 0
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

/** Every write the dialog sent, so a test can read what went out, where and how. */
const sent: { url: string; method: string; body: Record<string, unknown> }[] = []

const AUTH: AuthState = {
  user: {
    userId: 1,
    username: 'muster',
    activeTenantId: 1,
    superuser: false,
    tenants: [{ id: 1, code: 'WX', name: 'Webux', isDefault: true, modules: ['ACCOUNTING'] }],
    permissions: [ACCOUNTING_RIGHTS.read, ACCOUNTING_RIGHTS.write],
  },
  loading: false,
  signIn: () => Promise.reject(new Error('nicht gebraucht')),
  completeSecondFactor: () => Promise.reject(new Error('nicht gebraucht')),
  sendSecondFactorCode: () => Promise.resolve(),
  adoptSession: () => {},
  signOut: () => Promise.resolve(),
  switchTenant: () => Promise.resolve(),
  refresh: () => Promise.resolve(),
  can: (permission: string) => permission === ACCOUNTING_RIGHTS.read
    || permission === ACCOUNTING_RIGHTS.write,
}

function line(over: Partial<EntryTemplateLine> = {}): EntryTemplateLine {
  return {
    accountId: 4,
    accountNumber: '6000',
    accountName: 'Raumaufwand',
    side: 'DEBIT',
    amount: 3200,
    taxCodeId: null,
    taxCode: null,
    text: null,
    postable: true,
    ...over,
  }
}

function template(over: Partial<EntryTemplate> = {}): EntryTemplate {
  return {
    id: 300,
    name: 'Miete Geschäftslokal',
    description: 'jeden Monatsletzten',
    entryDescription: 'Miete September',
    documentReference: 'MB-144',
    carriesAmounts: true,
    sortOrder: 0,
    version: 3,
    lines: [line(), line({ accountNumber: '1020', side: 'CREDIT' })],
    problems: [],
    ...over,
  }
}

/** Three, so a middle row has a neighbour on both sides. */
const THREE = [
  template({ id: 300, name: 'Miete Geschäftslokal', sortOrder: 0, version: 3 }),
  template({ id: 301, name: 'Lohn Mitarbeiter A', sortOrder: 1, version: 7 }),
  template({
    id: 302,
    name: 'Krankentaggeld',
    sortOrder: 2,
    version: 1,
    problems: ['Konto 6105 gibt es in Ihrem Kontenplan nicht mehr.'],
  }),
]

/** The template a `PUT` answers 409 for, standing in for a change made in another tab. */
let conflictOn: number | null = null

/** How often the list was read, so a test can see whether it was read **again**. */
let listReads = 0

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

function stubFetch() {
  vi.stubGlobal('fetch', (url: string, options?: RequestInit) => {
    const method = options?.method ?? 'GET'
    if (method === 'GET') {
      if (url.endsWith('/entry-templates')) {
        listReads += 1
        return json(THREE)
      }
      return json({})
    }
    sent.push({
      url,
      method,
      body: typeof options?.body === 'string' ? JSON.parse(options.body) : {},
    })
    if (conflictOn !== null && url.endsWith(`/entry-templates/${conflictOn}`)) {
      return json(
        {
          detail:
            'Diese Vorlage wurde inzwischen an einer anderen Stelle geändert. Laden Sie sie'
            + ' neu und wiederholen Sie Ihre Änderung.',
        },
        409,
      )
    }
    return json({ id: 300 })
  })
}

async function paint(templates: EntryTemplate[]) {
  stubFetch()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <AuthContext.Provider value={AUTH}>
        <QueryClientProvider client={client}>
          <ManageTemplatesDialog tenantId={1} templates={templates} onClose={() => {}} />
        </QueryClientProvider>
      </AuthContext.Provider>,
    )
  })
}

/**
 * The dialog with the list it really hangs on: the query the mask holds, so a refresh is a
 * visible read and not an assertion about an internal call.
 */
function LiveDialog() {
  const list = useQuery({
    queryKey: entryTemplatesKey(1),
    queryFn: () => fetchEntryTemplates(1),
  })
  return <ManageTemplatesDialog tenantId={1} templates={list.data ?? []} onClose={() => {}} />
}

async function paintLive() {
  stubFetch()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <AuthContext.Provider value={AUTH}>
        <QueryClientProvider client={client}>
          <LiveDialog />
        </QueryClientProvider>
      </AuthContext.Provider>,
    )
  })
  await settle()
}

function byLabel(label: string): HTMLButtonElement {
  const found = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  if (found === null) throw new Error(`Schaltfläche «${label}» fehlt`)
  return found
}

function field(label: string): HTMLInputElement {
  const found = [...container.querySelectorAll('label')].find(
    (candidate) => candidate.textContent === label,
  )
  const input = found === undefined ? null : document.getElementById(found.htmlFor)
  if (input === null) throw new Error(`Feld «${label}» fehlt`)
  return input as HTMLInputElement
}

function type(element: HTMLElement, value: string) {
  const input = element as HTMLInputElement
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )?.set
    setter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function button(text: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find(
    (entry) => entry.textContent === text,
  ) as HTMLButtonElement | undefined
}

async function settle() {
  for (let round = 0; round < 3; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
  }
}

describe('ManageTemplatesDialog', () => {
  /**
   * Renaming is a `PUT` with the whole template: the endpoint replaces what it is given, so a
   * body of nothing but a name would drop the lines.
   */
  it('manageTemplatesRenameTest', async () => {
    await paint(THREE)

    await act(async () => byLabel('Miete Geschäftslokal umbenennen').click())
    type(field('Name'), 'Miete Lager')
    await act(async () => {
      button('Speichern')?.click()
    })
    await settle()

    expect(sent).toHaveLength(1)
    expect(sent[0].method).toBe('PUT')
    expect(sent[0].url).toBe('/api/tenants/1/accounting/entry-templates/300')
    expect(sent[0].body.name).toBe('Miete Lager')
    expect(sent[0].body.version).toBe(3)
    expect(sent[0].body.sortOrder).toBe(0)
    expect(sent[0].body.lines).toHaveLength(2)
  })

  /** Deleting asks once, and the question says why it is harmless here. */
  it('manageTemplatesDeleteTest', async () => {
    await paint(THREE)

    await act(async () => byLabel('Krankentaggeld löschen').click())

    expect(container.textContent).toContain(
      'Die Vorlage «Krankentaggeld» wird gelöscht. Bereits gebuchte Buchungen bleiben unverändert.',
    )
    expect(sent).toHaveLength(0)

    await act(async () => {
      button('Löschen')?.click()
    })
    await settle()

    expect(sent).toHaveLength(1)
    expect(sent[0].method).toBe('DELETE')
    expect(sent[0].url).toBe('/api/tenants/1/accounting/entry-templates/302')
  })

  /**
   * One arrow press, two `PUT`s, one mutation — and **each request carries the version of its
   * own row**. A shared version would answer 409 on the second of the pair.
   */
  it('manageTemplatesReorderTest', async () => {
    await paint(THREE)

    await act(async () => byLabel('Lohn Mitarbeiter A nach oben').click())
    await settle()

    expect(sent).toHaveLength(2)
    expect(sent.map((entry) => entry.method)).toEqual(['PUT', 'PUT'])
    expect(sent.map((entry) => entry.url)).toEqual([
      '/api/tenants/1/accounting/entry-templates/301',
      '/api/tenants/1/accounting/entry-templates/300',
    ])
    expect(sent.map((entry) => entry.body.sortOrder)).toEqual([0, 1])
    expect(sent.map((entry) => entry.body.version)).toEqual([7, 3])
  })

  /** The arrow at the end of the list stays visible and goes dead — it does not disappear. */
  it('manageTemplatesStopsAtTheEndsTest', async () => {
    await paint(THREE)

    expect(byLabel('Miete Geschäftslokal nach oben').disabled).toBe(true)
    expect(byLabel('Krankentaggeld nach unten').disabled).toBe(true)
    expect(byLabel('Lohn Mitarbeiter A nach oben').disabled).toBe(false)
  })

  /**
   * A reordering fires two `PUT`s. One answers 409, the other goes through — and the list is
   * read again all the same.
   *
   * <p>Read only on success, the row that **did** go through would keep the version it was read
   * at while the server has moved on. Every further arrow press on it would answer 409, and
   * closing and reopening the dialog would not help, because the templates come out of the same
   * cache. Only a page reload cleared it.
   */
  it('manageTemplatesRefetchesAfterAConflictTest', async () => {
    conflictOn = 301
    await paintLive()
    expect(listReads).toBe(1)

    await act(async () => byLabel('Lohn Mitarbeiter A nach oben').click())
    await settle()

    expect(sent).toHaveLength(2)
    expect(listReads).toBe(2)
    expect(container.textContent).toContain('Diese Vorlage wurde inzwischen an einer anderen')
  })

  /** The same after a 409 on renaming: the version of the row on screen is refreshed. */
  it('manageTemplatesRefetchesAfterAConflictOnRenameTest', async () => {
    conflictOn = 300
    await paintLive()
    expect(listReads).toBe(1)

    await act(async () => byLabel('Miete Geschäftslokal umbenennen').click())
    type(field('Name'), 'Miete Lager')
    await act(async () => {
      button('Speichern')?.click()
    })
    await settle()

    expect(sent).toHaveLength(1)
    expect(listReads).toBe(2)
    // And the edit row stays open with its error: the correction is not typed a second time.
    expect(field('Name').value).toBe('Miete Lager')
  })

  /** A template with a finding is named with its sentence, here as everywhere else. */
  it('manageTemplatesShowsAProblemTest', async () => {
    await paint(THREE)

    expect(container.textContent).toContain('Konto 6105 gibt es in Ihrem Kontenplan nicht mehr.')
    // And the dialog says where lines are changed, because it is not here.
    expect(container.textContent).toContain(
      'Zeilen und Beträge ändern Sie, indem Sie die Vorlage anwenden',
    )
  })
})
