// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import { ACCOUNTING_RIGHTS, DRAFT_PATH } from '../lib/accounting'
import type { Entry, Page, PostRunPreview, PostRunResult } from '../lib/types'
import { EntryDraftPage } from './EntryDraftPage'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1

function session(permissions: string[], modules: string[] = ['ACCOUNTING']): AuthState {
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

const POSTING = session([ACCOUNTING_RIGHTS.read, ACCOUNTING_RIGHTS.post])
const READ_ONLY = session([ACCOUNTING_RIGHTS.read])

function entry(over: Partial<Entry>): Entry {
  return {
    id: 45,
    fiscalYearId: 3,
    bookingDate: '2026-09-09',
    entryKind: 'NORMAL',
    source: 'MANUAL',
    description: 'Miete September',
    documentReference: 'MB-144',
    currencyCode: 'CHF',
    posted: false,
    amount: 3200,
    lines: [],
    ...over,
  }
}

const DRAFTS: Entry[] = [
  entry({ id: 45 }),
  entry({
    id: 46,
    bookingDate: '2025-12-31',
    description: 'Abschluss 2025',
    documentReference: 'MB-999',
    amount: 500,
  }),
]

function pageOf(rows: Entry[]): Page<Entry> {
  return {
    content: rows,
    page: 0,
    size: 50,
    totalElements: rows.length,
    totalPages: rows.length === 0 ? 0 : 1,
    sort: 'bookingDate,asc',
  }
}

let container: HTMLDivElement
let root: Root
let drafts: Page<Entry>
let preview: PostRunPreview
let runResult: PostRunResult
let runCalls: number

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

function stubFetch() {
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    if (url.includes('/entries/post-run/preview')) return json(preview)
    if (url.includes('/entries/post-run')) {
      if (init?.method === 'POST') runCalls += 1
      return json(runResult)
    }
    if (url.includes('/entries/attention')) {
      return json({
        drafts: 2,
        draftTotal: 3700,
        currencyCode: 'CHF',
        oldestBookingDate: '2025-12-31',
        lockingOn: null,
      })
    }
    if (url.includes('/accounting/entries')) return json(drafts)
    return json({})
  })
}

beforeEach(() => {
  drafts = pageOf(DRAFTS)
  preview = {
    postable: [45],
    blocked: [{ entryId: 46, reason: 'fällt in ein abgeschlossenes Geschäftsjahr (2025)' }],
    firstNumber: null,
    lastNumber: null,
  }
  runResult = {
    posted: [{ entryId: 45, outcome: 'POSTED', entryNumber: '2026-000045', message: null }],
    skipped: [
      {
        entryId: 46,
        outcome: 'SKIPPED',
        entryNumber: null,
        message: 'fällt in ein abgeschlossenes Geschäftsjahr (2025)',
      },
    ],
    failed: [],
  }
  runCalls = 0
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

async function render(auth: AuthState = POSTING) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[DRAFT_PATH]}>
        <AuthContext.Provider value={auth}>
          <QueryClientProvider client={client}>
            <EntryDraftPage />
          </QueryClientProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
  })
  await settle()
}

function button(text: string): HTMLButtonElement | undefined {
  return [...document.body.querySelectorAll('button')].find((entry) =>
    entry.textContent?.includes(text),
  ) as HTMLButtonElement | undefined
}

/**
 * The button inside the open dialog.
 *
 * <p>Its own finder, because the header button and the confirming one carry the same wording
 * whenever the whole selection is postable.
 */
function inDialog(text: string): HTMLButtonElement | undefined {
  const dialog = document.body.querySelector('[role="dialog"]')
  return [...(dialog?.querySelectorAll('button') ?? [])].find((entry) =>
    entry.textContent?.includes(text),
  ) as HTMLButtonElement | undefined
}

/** The hidden box of one row, found through the label the table gives it. */
function tick(label: string): HTMLInputElement {
  const found = [...document.body.querySelectorAll('label')].find(
    (candidate) => candidate.textContent === label,
  )
  const input = found === undefined ? null : document.getElementById(found.htmlFor)
  if (input === null) throw new Error(`Kästchen «${label}» fehlt`)
  return input as HTMLInputElement
}

async function click(element: HTMLElement | undefined) {
  if (element === undefined) throw new Error('Bedienelement fehlt')
  await act(async () => {
    element.click()
  })
  await settle()
}

/** A field of the filter row, found through its label. */
function field(label: string): HTMLInputElement {
  const found = [...container.querySelectorAll('label')].find(
    (candidate) => candidate.textContent === label,
  )
  const input = found === undefined ? null : document.getElementById(found.htmlFor)
  if (input === null) throw new Error(`Feld «${label}» fehlt`)
  return input as HTMLInputElement
}

async function typeIn(label: string, value: string) {
  const input = field(label)
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )?.set
    setter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await settle()
}

describe('EntryDraftPage', () => {
  it('rendersDraftsTest', async () => {
    await render()

    expect(container.textContent).toContain('Miete September')
    expect(container.textContent).toContain('MB-144')
    expect(container.textContent).toContain('09.09.2026')
  })

  /** The standing note, and it stands whether or not anything is ticked. */
  it('rendersTheStandingNoteTest', async () => {
    await render()

    expect(container.textContent).toContain(
      'Diese Buchungen sind noch nicht in Bilanz und Erfolgsrechnung enthalten.',
    )
  })

  /** What the summary endpoint answers, in one sentence over the rows. */
  it('rendersTheDraftSummaryTest', async () => {
    await render()

    expect(container.textContent).toContain('2 Entwürfe über 3’700.00 CHF')
    expect(container.textContent).toContain('ältestes Buchungsdatum 31.12.2025')
  })

  it('rendersLoadingTest', async () => {
    vi.stubGlobal('fetch', () => new Promise(() => {}))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[DRAFT_PATH]}>
          <AuthContext.Provider value={POSTING}>
            <QueryClientProvider client={client}>
              <EntryDraftPage />
            </QueryClientProvider>
          </AuthContext.Provider>
        </MemoryRouter>,
      )
    })

    expect(container.textContent).toContain('Wird geladen')
  })

  it('rendersEmptyTest', async () => {
    drafts = pageOf([])
    await render()

    expect(container.textContent).toContain('Keine Entwürfe')
  })

  it('rendersErrorTest', async () => {
    vi.stubGlobal('fetch', (url: string) => {
      if (url.includes('/accounting/entries') && !url.includes('attention')) {
        return json({ detail: 'Das Backend meldet einen Fehler.' }, 500)
      }
      return json({})
    })
    await render()

    expect(container.textContent).toContain('Das Backend meldet einen Fehler.')
  })

  /** Without the posting right there is no button and no box to tick. */
  it('rendersWithoutThePostingRightTest', async () => {
    await render(READ_ONLY)

    expect(button('Verbuchen (')).toBeUndefined()
    expect(container.textContent).toContain('Zum Verbuchen fehlt das Recht')
  })

  it('rendersWithoutTheModuleTest', async () => {
    await render(session([ACCOUNTING_RIGHTS.read, ACCOUNTING_RIGHTS.post], []))

    expect(container.textContent).toContain('Modul nicht eingeschaltet')
  })

  /** The count in the button is the number of ticks — that is what the collective step is. */
  it('countsTheSelectionTest', async () => {
    await render()

    expect(button('Verbuchen (0)')?.disabled).toBe(true)

    await click(tick('Buchung vom 09.09.2026 markieren'))

    expect(button('Verbuchen (1)')).toBeDefined()
  })

  /**
   * The preview runs before anything is written: how many go through, why the others do not,
   * and the sentence about what stops being possible.
   */
  it('showsThePreviewBeforePostingTest', async () => {
    await render()

    await click(tick('Buchung vom 09.09.2026 markieren'))
    await click(tick('Buchung vom 31.12.2025 markieren'))
    await click(button('Verbuchen (2)'))

    expect(document.body.textContent).toContain('2 Buchungen sind ausgewählt.')
    expect(document.body.textContent).toContain('1 werden verbucht')
    expect(document.body.textContent).toContain('fällt in ein abgeschlossenes Geschäftsjahr (2025)')
    expect(document.body.textContent).toContain('Abschluss 2025')
    expect(document.body.textContent).toContain(
      'Verbuchte Buchungen lassen sich nicht mehr ändern oder löschen.',
    )
    // Nothing is written while the preview stands.
    expect(runCalls).toBe(0)
  })

  /**
   * And it names **no** number range. The backend answers both fields empty in this stage,
   * and a number that turns out different afterwards is worse than none (ADR-0045).
   */
  it('namesNoNumberRangeInThePreviewTest', async () => {
    await render()

    await click(tick('Buchung vom 09.09.2026 markieren'))
    await click(button('Verbuchen (1)'))

    expect(document.body.textContent).not.toContain('bis 2026-')
    expect(document.body.textContent).toContain('bekommen ihre Journalnummer')
  })

  /** Three result lists, and the run does not tip over. */
  it('showsThreeResultListsTest', async () => {
    await render()

    await click(tick('Buchung vom 09.09.2026 markieren'))
    await click(tick('Buchung vom 31.12.2025 markieren'))
    await click(button('Verbuchen (2)'))
    await click(inDialog('Verbuchen (1)'))

    expect(runCalls).toBe(1)
    expect(container.textContent).toContain('1 verbucht, 1 übersprungen, 0 fehlgeschlagen.')
    expect(container.textContent).toContain('2026-000045')
    expect(container.textContent).toContain('Übersprungen:')
  })

  /** A run that broke on one entry says so, and the entry is still a draft. */
  it('showsAFailedRunLineTest', async () => {
    runResult = {
      posted: [],
      skipped: [],
      failed: [
        { entryId: 45, outcome: 'FAILED', entryNumber: null, message: 'Das Konto ist gesperrt.' },
      ],
    }
    preview = { postable: [45], blocked: [], firstNumber: null, lastNumber: null }
    await render()

    await click(tick('Buchung vom 09.09.2026 markieren'))
    await click(button('Verbuchen (1)'))
    await click(inDialog('Verbuchen (1)'))

    expect(container.textContent).toContain('0 verbucht, 0 übersprungen, 1 fehlgeschlagen.')
    expect(container.textContent).toContain('Fehlgeschlagen:')
    expect(container.textContent).toContain('Das Konto ist gesperrt.')
  })

  /**
   * A tick means the row it was made on. Narrowing the list afterwards would leave «Verbuchen
   * (2)» standing over rows holding none of them — and post them. Asked about first, the way
   * the write-off run asks before its tolerance changes.
   */
  it('asksBeforeASearchDropsTheSelectionTest', async () => {
    await render()

    await click(tick('Buchung vom 09.09.2026 markieren'))
    expect(button('Verbuchen (1)')).toBeDefined()

    await typeIn('Suchen', 'Lohn')

    expect(document.body.textContent).toContain('Markierung verwerfen?')
    expect(document.body.textContent).toContain('1 Buchung ist markiert')
    // Nothing has moved yet: the ticks stand until the question is answered.
    expect(button('Verbuchen (1)')).toBeDefined()

    await click(inDialog('Verwerfen und weiter'))

    expect(button('Verbuchen (0)')).toBeDefined()
    expect(field('Suchen').value).toBe('Lohn')
  })

  /** The same guard on the sort, which puts other rows on the page just as a search does. */
  it('asksBeforeASortDropsTheSelectionTest', async () => {
    await render()

    await click(tick('Buchung vom 09.09.2026 markieren'))
    await click(tick('Buchung vom 31.12.2025 markieren'))
    await click(button('Text'))

    expect(document.body.textContent).toContain('Markierung verwerfen?')
    expect(document.body.textContent).toContain('2 Buchungen sind markiert')

    await click(inDialog('Verwerfen und weiter'))

    expect(button('Verbuchen (0)')).toBeDefined()
  })

  /** Nothing ticked, nothing to ask about: the search goes through untouched. */
  it('searchesWithoutAskingWhenNothingIsTickedTest', async () => {
    await render()

    await typeIn('Suchen', 'Lohn')

    expect(document.body.textContent).not.toContain('Markierung verwerfen?')
    expect(field('Suchen').value).toBe('Lohn')
  })

  /** Nothing postable: the confirming button stays off rather than sending an empty run. */
  it('keepsTheButtonOffWithoutAPostableEntryTest', async () => {
    preview = {
      postable: [],
      blocked: [{ entryId: 45, reason: 'bucht auf ein abgeschaltetes Konto (6105).' }],
      firstNumber: null,
      lastNumber: null,
    }
    await render()

    await click(tick('Buchung vom 09.09.2026 markieren'))
    await click(button('Verbuchen (1)'))

    expect(inDialog('Verbuchen (0)')?.disabled).toBe(true)
  })
})
