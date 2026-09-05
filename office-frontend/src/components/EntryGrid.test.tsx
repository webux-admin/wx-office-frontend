// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import {
  ACCOUNTING_RIGHTS,
  emptyEntryRow,
  writeEntryDraft,
  type EntryDraftRow,
} from '../lib/accounting'
import { toIsoDate } from '../lib/format'
import type {
  Account,
  EntrySuggestion,
  EntryTemplate,
  EntryTemplateLine,
  TaxCode,
} from '../lib/types'
import { EntryPage } from '../pages/EntryPage'
import { EntryGrid } from './EntryGrid'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function account(over: Partial<Account>): Account {
  return {
    id: 1,
    accountNumber: '1020',
    name: 'Bankguthaben',
    accountType: 'ASSET',
    orPosition: 'UV_FLUESSIGE_MITTEL',
    directPostingAllowed: true,
    active: true,
    ...over,
  }
}

const CHART: Account[] = [
  account({ id: 1, accountNumber: '1020', name: 'Bankguthaben' }),
  account({
    id: 2,
    accountNumber: '2200',
    name: 'Umsatzsteuer',
    accountType: 'LIABILITY',
    orPosition: 'KFK_UEBRIGE',
  }),
  account({
    id: 3,
    accountNumber: '3400',
    name: 'Dienstleistungsertrag',
    accountType: 'REVENUE',
    orPosition: 'ER_NETTOERLOESE',
  }),
  account({
    id: 4,
    accountNumber: '6000',
    name: 'Raumaufwand',
    accountType: 'EXPENSE',
    orPosition: 'ER_UEBRIGER_BETRIEBSAUFWAND',
  }),
  account({
    id: 5,
    accountNumber: '2800',
    name: 'Grundkapital',
    accountType: 'EQUITY',
    orPosition: 'EK_GRUNDKAPITAL',
  }),
]

const UST81: TaxCode = {
  id: 11,
  code: 'UST81',
  name: 'Umsatzsteuer 8.1 %',
  direction: 'OUTPUT',
  kind: 'NORMAL',
  rate: 8.1,
  taxAccountNumber: '2200',
  taxAccountName: 'Umsatzsteuer',
  estvDigit: '302',
  inTurnoverTotal: true,
  validFrom: '2024-01-01',
  active: true,
  sortOrder: 100,
}

function row(over: Partial<EntryDraftRow>): EntryDraftRow {
  return { ...emptyEntryRow(1), ...over }
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
  window.localStorage.clear()
  window.sessionStorage.clear()
  vi.unstubAllGlobals()
})

/** Holds the rows the way the screen does, so the grid can change them. */
function Harness({ initial }: { initial: EntryDraftRow[] }) {
  const [rows, setRows] = useState(initial)
  return (
    <EntryGrid
      rows={rows}
      onRowsChange={setRows}
      accounts={CHART}
      taxCodes={[UST81]}
      currencyCode="CHF"
    />
  )
}

function paintGrid(initial: EntryDraftRow[]) {
  act(() => {
    root.render(<Harness initial={initial} />)
  })
}

function cell(label: string): HTMLElement {
  const found = container.querySelector<HTMLElement>(`[aria-label="${label}"]`)
  if (found === null) throw new Error(`Zelle «${label}» fehlt`)
  return found
}

function press(key: string, init: KeyboardEventInit = {}) {
  act(() => {
    document.activeElement?.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, ...init }),
    )
  })
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

describe('EntryGrid', () => {
  /**
   * The whole point of a grid rather than a form: every cell is reachable with the arrow keys,
   * and the grid holds exactly one tab stop.
   */
  it('entryGridKeyboardPathTest', () => {
    paintGrid([emptyEntryRow(1), emptyEntryRow(2)])

    act(() => cell('Konto Zeile 1').focus())
    expect(document.activeElement).toBe(cell('Konto Zeile 1'))

    press('ArrowRight')
    expect(document.activeElement).toBe(cell('Soll Zeile 1'))
    press('ArrowRight')
    expect(document.activeElement).toBe(cell('Haben Zeile 1'))
    press('ArrowRight')
    expect(document.activeElement).toBe(cell('Steuercode Zeile 1'))

    press('ArrowDown')
    expect(document.activeElement).toBe(cell('Steuercode Zeile 2'))

    press('ArrowLeft')
    press('ArrowLeft')
    press('ArrowLeft')
    expect(document.activeElement).toBe(cell('Konto Zeile 2'))

    // Exactly one tab stop in the whole grid, wherever the cursor stands.
    const reachable = [...container.querySelectorAll('[tabindex="0"]')]
    expect(reachable).toEqual([cell('Konto Zeile 2')])
  })

  /** Enter on the last column is how a third line comes into being. */
  it('entryGridAddsARowOnEnterTest', () => {
    paintGrid([emptyEntryRow(1), emptyEntryRow(2)])

    act(() => cell('Steuercode Zeile 2').focus())
    press('Enter')

    expect(container.querySelector('[aria-label="Konto Zeile 3"]')).not.toBeNull()
    expect(document.activeElement).toBe(cell('Konto Zeile 3'))
  })

  /** Enter anywhere else moves on to the next field instead. */
  it('entryGridMovesOnEnterInsideARowTest', () => {
    paintGrid([emptyEntryRow(1), emptyEntryRow(2)])

    act(() => cell('Soll Zeile 1').focus())
    press('Enter')

    expect(document.activeElement).toBe(cell('Haben Zeile 1'))
    expect(container.querySelector('[aria-label="Konto Zeile 3"]')).toBeNull()
  })

  /** Escape throws the row away — and the last one is emptied rather than removed. */
  it('entryGridDiscardsARowOnEscapeTest', () => {
    paintGrid([row({ key: 1, accountId: 4, accountText: '6000 Raumaufwand', debit: '3200' }), emptyEntryRow(2)])

    act(() => cell('Soll Zeile 1').focus())
    press('Escape')

    expect(container.querySelector('[aria-label="Soll Zeile 2"]')).toBeNull()
    expect((cell('Soll Zeile 1') as HTMLInputElement).value).toBe('')
  })

  /**
   * Escape inside the account cell takes the typing back, not the line. `listOpen` is false for
   * the whole debounce window, so without the cell answering Escape itself it would reach the
   * grid and discard the row — somebody taking back one character would lose account, Soll,
   * Haben and Steuercode together.
   */
  it('entryGridKeepsTheRowWhenEscapeTakesBackTypingTest', () => {
    paintGrid([row({ key: 1, accountId: 4, accountText: '6000 Raumaufwand', debit: '3200' }), emptyEntryRow(2)])

    act(() => cell('Konto Zeile 1').focus())
    type(cell('Konto Zeile 1'), '6')
    press('Escape')

    expect((cell('Soll Zeile 1') as HTMLInputElement).value).toBe('3200')
    expect(container.querySelector('[aria-label="Konto Zeile 2"]')).not.toBeNull()
  })

  /**
   * A complete account number resolves against the whole chart. `searchAccounts` also matches the
   * NAME and answers a number-sorted slice, so two accounts carrying «6000» in their name and
   * sorting below it would push 6000 out and leave the row without an account.
   */
  it('entryGridResolvesAFullNumberPastNameMatchesTest', () => {
    const crowded = [
      { id: 7, accountNumber: '1090', name: 'Verrechnungskonto 6000', accountType: 'ASSET' },
      { id: 8, accountNumber: '1091', name: 'Transferkonto 6000', accountType: 'ASSET' },
      { id: 4, accountNumber: '6000', name: 'Raumaufwand', accountType: 'EXPENSE' },
    ]
    const seen: EntryDraftRow[][] = []
    act(() => {
      root.render(
        <EntryGrid
          rows={[emptyEntryRow(1)]}
          onRowsChange={(next: EntryDraftRow[]) => { seen.push(next) }}
          accounts={crowded as unknown as Account[]}
          taxCodes={[]}
          currencyCode="CHF"
        />,
      )
    })

    type(cell('Konto Zeile 1'), '6000')

    expect(seen.at(-1)?.[0].accountId).toBe(4)
  })

  /** Ctrl+S is the save of the mask around the grid, and Ctrl+Enter does the same. */
  it('entryGridSubmitsOnCtrlSTest', () => {
    const submitted: string[] = []
    act(() => {
      root.render(
        <EntryGrid
          rows={[emptyEntryRow(1)]}
          onRowsChange={() => {}}
          accounts={CHART}
          taxCodes={[]}
          currencyCode="CHF"
          onSubmit={() => submitted.push('x')}
        />,
      )
    })

    act(() => cell('Konto Zeile 1').focus())
    press('s', { ctrlKey: true })
    press('Enter', { ctrlKey: true })

    expect(submitted).toHaveLength(2)
  })

  /** The difference stands there at 0.00 too, and it is not red. */
  it('entryGridShowsTheDifferenceWhenBalancedTest', () => {
    paintGrid([
      row({ key: 1, accountId: 4, debit: '3200' }),
      row({ key: 2, accountId: 1, credit: '3200' }),
    ])

    const line = container.querySelector('[data-balanced]')
    expect(line?.getAttribute('data-balanced')).toBe('true')
    expect(line?.textContent).toContain('Differenz 0.00 CHF')
    expect(line?.querySelector('.text-danger')).toBeNull()
  })

  /** While it does not add up the figure is red — and it is the only thing that is. */
  it('entryGridShowsTheDifferenceInRedTest', () => {
    paintGrid([
      row({ key: 1, accountId: 4, debit: '3200' }),
      row({ key: 2, accountId: 1, credit: '3000' }),
    ])

    const line = container.querySelector('[data-balanced]')
    expect(line?.getAttribute('data-balanced')).toBe('false')
    expect(line?.textContent).toContain('Differenz 200.00 CHF')
    expect(line?.querySelector('.text-danger')).not.toBeNull()
  })

  /** It recounts on every keystroke, which is what makes it worth having. */
  it('entryGridRecountsWhileTypingTest', () => {
    paintGrid([row({ key: 1, accountId: 4, debit: '3200' }), row({ key: 2, accountId: 1 })])

    expect(container.querySelector('[data-balanced]')?.getAttribute('data-balanced')).toBe('false')

    type(cell('Haben Zeile 2'), '3200')

    expect(container.querySelector('[data-balanced]')?.getAttribute('data-balanced')).toBe('true')
  })

  /** One side per line: typing into the one column empties the other. */
  it('entryGridKeepsOneSidePerRowTest', () => {
    paintGrid([row({ key: 1, accountId: 4, debit: '3200' })])

    type(cell('Haben Zeile 1'), '100')

    expect((cell('Soll Zeile 1') as HTMLInputElement).value).toBe('')
  })

  /** The weak read-back of ADR-0045: one sentence per line, out of type and side. */
  it('entryGridShowsAnEffectLinePerAccountTypeTest', () => {
    paintGrid([
      row({ key: 1, accountId: 4, debit: '3200' }),
      row({ key: 2, accountId: 1, credit: '3200' }),
    ])

    expect(container.textContent).toContain('So wird gebucht')
    expect(container.textContent).toContain('Aufwand steigt um 3’200.00')
    expect(container.textContent).toContain('Guthaben sinkt um 3’200.00')
  })

  /** The other three types, both sides — the table of the decision, drawn. */
  it('entryGridShowsTheOtherAccountTypesTest', () => {
    paintGrid([
      row({ key: 1, accountId: 2, debit: '100' }),
      row({ key: 2, accountId: 3, credit: '60' }),
      row({ key: 3, accountId: 5, credit: '40' }),
    ])

    expect(container.textContent).toContain('Schuld sinkt um 100.00')
    expect(container.textContent).toContain('Ertrag steigt um 60.00')
    expect(container.textContent).toContain('Eigenkapital steigt um 40.00')
  })

  /** The box shows the computed tax line before anything is saved. */
  it('entryGridShowsTheTaxLineTest', () => {
    paintGrid([
      row({ key: 1, accountId: 1, debit: '1080.10' }),
      row({ key: 2, accountId: 3, credit: '1080.10', taxCodeId: 11 }),
    ])

    expect(container.textContent).toContain('999.17')
    expect(container.textContent).toContain('80.93')
    expect(container.textContent).toContain('MWST UST81 zu Zeile 2')
  })

  /** Nothing typed yet: the box says what it is waiting for rather than standing empty. */
  it('entryGridShowsTheBoxWithoutRowsTest', () => {
    paintGrid([emptyEntryRow(1), emptyEntryRow(2)])

    expect(container.textContent).toContain('Sobald ein Konto und ein Betrag stehen')
  })

  /** One field, and it matches on the name as well as on the number. */
  it('entryGridOffersAccountsByNameTest', async () => {
    paintGrid([emptyEntryRow(1)])

    act(() => cell('Konto Zeile 1').focus())
    type(cell('Konto Zeile 1'), 'raum')
    await settle()

    const options = [...container.querySelectorAll('[role="option"]')]
    expect(options.map((option) => option.textContent)).toEqual(['6000 Raumaufwand'])
  })

  /**
   * Whoever writes the account out in full instead of picking it from the list has text in the
   * field and no account on the row. The line is dropped on sending, so the row says so where
   * it happens rather than leaving the server to complain about a line that is missing.
   */
  it('entryGridMarksARowWithoutAnAccountTest', async () => {
    paintGrid([emptyEntryRow(1)])

    act(() => cell('Konto Zeile 1').focus())
    type(cell('Konto Zeile 1'), '6000 Raumaufwand')
    await settle()

    expect(container.textContent).toContain('Kein Konto gewählt.')
    const field = cell('Konto Zeile 1')
    expect(field.getAttribute('aria-invalid')).toBe('true')
    const noteId = field.getAttribute('aria-describedby')
    expect(container.querySelector(`#${noteId}`)?.textContent).toContain('Kein Konto gewählt.')
  })

  /** Picked from the list, the row carries its account and the mark goes. */
  it('entryGridDropsTheMarkOnceAnAccountIsPickedTest', async () => {
    paintGrid([emptyEntryRow(1)])

    act(() => cell('Konto Zeile 1').focus())
    type(cell('Konto Zeile 1'), 'raum')
    await settle()
    act(() => {
      container.querySelector<HTMLElement>('[role="option"]')?.click()
    })

    expect((cell('Konto Zeile 1') as HTMLInputElement).value).toBe('6000 Raumaufwand')
    expect(container.textContent).not.toContain('Kein Konto gewählt.')
    expect(cell('Konto Zeile 1').getAttribute('aria-invalid')).toBeNull()
  })

  /** A number that is complete needs no list and is no complaint either. */
  it('entryGridMarksNoRowOnACompleteNumberTest', async () => {
    paintGrid([emptyEntryRow(1)])

    act(() => cell('Konto Zeile 1').focus())
    type(cell('Konto Zeile 1'), '6000')
    await settle()

    expect(container.textContent).not.toContain('Kein Konto gewählt.')
  })

  /**
   * The arrow keys walk the list, and what they walk over is announced: the focus stays in the
   * field somebody is typing in, so the highlight travels to the screen reader through
   * `aria-activedescendant` instead. Without it the bar moves and nothing is said.
   */
  it('entryGridPointsAtTheHighlightedAccountTest', async () => {
    paintGrid([emptyEntryRow(1)])

    act(() => cell('Konto Zeile 1').focus())
    type(cell('Konto Zeile 1'), '2')
    await settle()

    const field = cell('Konto Zeile 1')
    const options = [...container.querySelectorAll('[role="option"]')]
    expect(options.map((option) => option.textContent?.trim())).toEqual([
      '2200 Umsatzsteuer',
      '2800 Grundkapital',
    ])
    expect(field.getAttribute('aria-expanded')).toBe('true')
    expect(field.getAttribute('aria-controls')).toBe(
      container.querySelector('[role="listbox"]')?.id,
    )
    expect(field.getAttribute('aria-activedescendant')).toBe(options[0].id)
    expect(options[0].getAttribute('aria-selected')).toBe('true')

    press('ArrowDown')

    expect(cell('Konto Zeile 1').getAttribute('aria-activedescendant')).toBe(options[1].id)
    expect(
      container.querySelectorAll('[role="option"]')[1].getAttribute('aria-selected'),
    ).toBe('true')
    // And the focus never leaves the field: a combobox is not a menu.
    expect(document.activeElement).toBe(cell('Konto Zeile 1'))
  })

  /** Enter takes what the arrow keys stopped on. */
  it('entryGridPicksTheHighlightedAccountOnEnterTest', async () => {
    paintGrid([emptyEntryRow(1)])

    act(() => cell('Konto Zeile 1').focus())
    type(cell('Konto Zeile 1'), '2')
    await settle()
    press('ArrowDown')
    press('Enter')

    expect((cell('Konto Zeile 1') as HTMLInputElement).value).toBe('2800 Grundkapital')
  })

  /**
   * The one that reaches the books wrong: typed blind, and Enter pressed before the list has
   * caught up.
   *
   * <p>The match set follows the debounced term, so in the moment after the last keystroke it
   * still answers the term before it — at the first one that is the whole chart of accounts,
   * unfiltered. With the list standing open over it, Enter took its first line: somebody typed
   * «6000» and got «1020 Bankguthaben» on the row, which is plausible, wrong and nobody reads
   * it again.
   */
  it('entryGridKeepsTheTypedAccountOnEnterBeforeTheListSettlesTest', () => {
    paintGrid([emptyEntryRow(1)])

    act(() => cell('Konto Zeile 1').focus())
    type(cell('Konto Zeile 1'), '6000')
    press('Enter')

    expect((cell('Konto Zeile 1') as HTMLInputElement).value).toBe('6000')
    // And the row carries 6000, which the box says out loud once an amount stands beside it.
    type(cell('Soll Zeile 1'), '3200')
    expect(container.textContent).toContain('Raumaufwand')
    expect(container.textContent).toContain('Aufwand steigt um 3’200.00')
    expect(container.textContent).not.toContain('Bankguthaben')
  })

  /**
   * Why the one above works: while the term is still settling there is no list at all. An open
   * list whose entries belong to an older term is worse than none — it is read, and it is
   * pickable with one key.
   */
  it('entryGridOffersNoAccountsWhileTheTermSettlesTest', async () => {
    paintGrid([emptyEntryRow(1)])

    act(() => cell('Konto Zeile 1').focus())
    type(cell('Konto Zeile 1'), '6')

    expect(container.querySelectorAll('[role="option"]')).toHaveLength(0)
    expect(cell('Konto Zeile 1').getAttribute('aria-expanded')).toBe('false')
    // No complaint in that window either: it is not a row without an account yet, it is
    // somebody in the middle of typing one.
    expect(container.textContent).not.toContain('Kein Konto gewählt.')

    await settle()

    const options = [...container.querySelectorAll('[role="option"]')]
    expect(options.map((option) => option.textContent?.trim())).toEqual(['6000 Raumaufwand'])
  })

  /** Nothing open, nothing announced: no list, no `aria-controls` pointing at nothing. */
  it('entryGridAnnouncesNoListWhileItIsClosedTest', () => {
    paintGrid([emptyEntryRow(1)])

    const field = cell('Konto Zeile 1')
    expect(field.getAttribute('aria-expanded')).toBe('false')
    expect(field.getAttribute('aria-controls')).toBeNull()
    expect(field.getAttribute('aria-activedescendant')).toBeNull()
  })

  /** A term nothing matches opens no list either — and that is exactly when the row is marked. */
  it('entryGridAnnouncesNoListWithoutAMatchTest', async () => {
    paintGrid([emptyEntryRow(1)])

    act(() => cell('Konto Zeile 1').focus())
    type(cell('Konto Zeile 1'), 'zzz')
    await settle()

    const field = cell('Konto Zeile 1')
    expect(container.querySelector('[role="listbox"]')).toBeNull()
    expect(field.getAttribute('aria-expanded')).toBe('false')
    expect(field.getAttribute('aria-controls')).toBeNull()
    expect(field.getAttribute('aria-invalid')).toBe('true')
  })
})

/**
 * The grid inside the mask that owns it: the rescued typing state and the two empty states.
 *
 * <p>They live in this file because they belong to the entry grid as a whole — the rescued
 * state covers the three header fields and the rows together, and only the mask holds both.
 */
describe('the entry mask around the grid', () => {
  /**
   * The clock the mask reads, read here the same way and at the same moment.
   *
   * <p>The mask takes its booking date from `toIsoDate()` and then looks for the fiscal year
   * covering it. A year written into the stub by hand therefore covers today only until the
   * next New Year: from the 1st of January the mask finds no year, draws its empty state, and
   * every test in this block goes red for the calendar rather than for a defect.
   */
  const today = () => toIsoDate()
  const year = () => today().slice(0, 4)

  function session(tenantId: number): AuthState {
    const permissions: string[] = [
      ACCOUNTING_RIGHTS.read,
      ACCOUNTING_RIGHTS.write,
      ACCOUNTING_RIGHTS.post,
    ]
    return {
      user: {
        userId: 1,
        username: 'muster',
        activeTenantId: tenantId,
        superuser: false,
        tenants: [
          { id: 1, code: 'WX', name: 'Webux', isDefault: true, modules: ['ACCOUNTING'] },
          { id: 2, code: 'ZW', name: 'Zweiter', isDefault: false, modules: ['ACCOUNTING'] },
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

  function json(body: unknown, status = 200) {
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  }

  beforeEach(() => {
    chart = CHART
    fiscalYears = true
    templates = []
    suggestions = []
    sent.length = 0
  })

  /** Set where a test is about the mask having nothing to work with. */
  let chart: Account[] = CHART
  let fiscalYears = true
  let templates: EntryTemplate[] = []
  let suggestions: EntrySuggestion[] = []
  /** Every write the mask sent, so a test can read what went out and where. */
  const sent: { url: string; method: string; body: unknown }[] = []

  function stubFetch() {
    vi.stubGlobal('fetch', (url: string, options?: RequestInit) => {
      const method = options?.method ?? 'GET'
      if (method !== 'GET') {
        sent.push({
          url,
          method,
          body: typeof options?.body === 'string' ? JSON.parse(options.body) : undefined,
        })
      }
      if (url.includes('/accounting/entry-templates')) {
        return method === 'GET' ? json(templates) : json({ id: 300 })
      }
      if (url.includes('/accounting/entries/suggestions')) return json(suggestions)
      if (url.includes('/accounting/tax-codes')) return json({ codes: [UST81] })
      if (url.includes('/accounting/fiscal-years')) {
        if (!fiscalYears) {
          return json({ years: [], boundary: { source: 'NONE', message: '' }, expiry: { warn: false } })
        }
        return json({
          years: [
            {
              id: 3,
              label: year(),
              numberYear: Number(year()),
              startDate: `${year()}-01-01`,
              endDate: `${year()}-12-31`,
              status: 'OPEN',
              deletable: false,
              editable: false,
              spansAFullCalendarYear: true,
            },
          ],
          boundary: { source: 'NONE', message: '' },
          expiry: { warn: false },
        })
      }
      if (url.includes('/accounting/settings')) return json({ ledgerCurrency: 'CHF' })
      if (url.includes('/accounting/accounts')) {
        return json({
          content: chart,
          page: 0,
          size: 200,
          totalElements: chart.length,
          totalPages: chart.length === 0 ? 0 : 1,
          sort: 'accountNumber,asc',
        })
      }
      return json({})
    })
  }

  async function paintMask(tenantId: number) {
    stubFetch()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/buchhaltung/buchen']}>
          <AuthContext.Provider value={session(tenantId)}>
            <QueryClientProvider client={client}>
              <EntryPage />
            </QueryClientProvider>
          </AuthContext.Provider>
        </MemoryRouter>,
      )
    })
    await settle()
  }

  /**
   * Whoever leaves the page in the middle of an entry is offered it again — and **is not given
   * it back on its own**. A mask that fills itself with two account rows on opening looks like
   * an entry that already exists; so the grid stays empty until «Weiterschreiben» is pressed,
   * and the banner names the moment, the row count and the text.
   */
  it('rescueStateTest', async () => {
    writeEntryDraft(1, {
      bookingDate: today(),
      documentReference: 'MB-144',
      description: 'Miete September',
      rows: [row({ key: 1, accountId: 4, accountText: '6000 Raumaufwand', debit: '3200' })],
      savedAt: `${today()}T14:12:00.000Z`,
    })

    await paintMask(1)

    expect(container.textContent).toContain('Sie hatten hier etwas angefangen')
    expect(container.textContent).toContain('1 Zeile, Text «Miete September».')
    // Nothing is in the mask yet: it was offered, not taken back.
    expect(field('Text').value).toBe('')
    expect((cell('Konto Zeile 1') as HTMLInputElement).value).toBe('')

    await act(async () => {
      button('Weiterschreiben')?.click()
    })

    expect(field('Text').value).toBe('Miete September')
    expect(field('Beleg').value).toBe('MB-144')
    expect((cell('Konto Zeile 1') as HTMLInputElement).value).toBe('6000 Raumaufwand')
    expect((cell('Soll Zeile 1') as HTMLInputElement).value).toBe('3200')
    expect(container.textContent).not.toContain('Sie hatten hier etwas angefangen')
  })

  /** «Verwerfen» throws the rescued state out of the browser, not only off the screen. */
  it('rescueStateDiscardedTest', async () => {
    writeEntryDraft(1, {
      bookingDate: today(),
      documentReference: '',
      description: 'Miete September',
      rows: [row({ key: 1, accountId: 4, accountText: '6000 Raumaufwand', debit: '3200' })],
      savedAt: `${today()}T14:12:00.000Z`,
    })

    await paintMask(1)
    await act(async () => {
      button('Verwerfen')?.click()
    })
    await settle()

    expect(container.textContent).not.toContain('Sie hatten hier etwas angefangen')
    expect(window.sessionStorage.getItem('webux.accounting.draft.1')).toBeNull()
  })

  /** Typed for a while, then reloaded: the store holds it, and the banner offers it. */
  it('rescueStateClearedAfterSaveTest', async () => {
    await paintMask(1)

    act(() => cell('Konto Zeile 1').focus())
    type(cell('Konto Zeile 1'), '6000')
    type(cell('Soll Zeile 1'), '3200')
    await settle()
    expect(window.sessionStorage.getItem('webux.accounting.draft.1')).not.toBeNull()

    await act(async () => {
      button('Nur speichern')?.click()
    })
    await settle()

    expect(window.sessionStorage.getItem('webux.accounting.draft.1')).toBeNull()
  })

  /**
   * <b>The banner goes with the store, or the rescue becomes the thing it was built to
   * prevent.</b> Somebody opens the mask with a rescued entry offered in the banner, types a
   * different entry instead and saves that. Were the banner to survive the save,
   * «Weiterschreiben» would fill the mask with the older state — and because that state counts
   * as typed, the debounced effect would write it straight back into the store. The next reload
   * would offer it again, and it would be booked a second time by somebody who believed the
   * mask.
   */
  it('rescueStateBannerClearedAfterSaveTest', async () => {
    writeEntryDraft(1, {
      bookingDate: today(),
      documentReference: 'MB-144',
      description: 'Miete September',
      rows: [row({ key: 1, accountId: 4, accountText: '6000 Raumaufwand', debit: '3200' })],
      savedAt: `${today()}T14:12:00.000Z`,
    })

    await paintMask(1)
    expect(container.textContent).toContain('Sie hatten hier etwas angefangen')

    // Something else is typed and saved. The banner is left standing, never taken up.
    act(() => cell('Konto Zeile 1').focus())
    type(cell('Konto Zeile 1'), '6000')
    type(cell('Soll Zeile 1'), '3200')
    await settle()
    await act(async () => {
      button('Nur speichern')?.click()
    })
    await settle()

    expect(container.textContent).not.toContain('Sie hatten hier etwas angefangen')
    expect(button('Weiterschreiben')).toBeUndefined()
    expect(window.sessionStorage.getItem('webux.accounting.draft.1')).toBeNull()

    // And it stays gone: nothing writes the offered state back after the fact.
    await settle()
    expect(window.sessionStorage.getItem('webux.accounting.draft.1')).toBeNull()
  })

  /**
   * And the one that matters: another tenant gets an empty mask with no banner at all, and what
   * was left for the first one is gone from the browser. Account numbers and amounts of one
   * business must never turn up in the mask of another.
   */
  it('rescueStateAfterTenantChangeTest', async () => {
    writeEntryDraft(1, {
      bookingDate: today(),
      documentReference: 'MB-144',
      description: 'Miete September',
      rows: [row({ key: 1, accountId: 4, accountText: '6000 Raumaufwand', debit: '3200' })],
    })

    await paintMask(2)

    expect(container.textContent).not.toContain('Sie hatten hier etwas angefangen')
    expect(field('Text').value).toBe('')
    expect((cell('Konto Zeile 1') as HTMLInputElement).value).toBe('')
    expect(window.sessionStorage.getItem('webux.accounting.draft.1')).toBeNull()
  })

  /**
   * The first of the three bolts. Until the setup assistant exists, the chain chart of
   * accounts → fiscal year → posting is not something a non-bookkeeper can work out, so the
   * mask names the missing step and offers the way to it.
   */
  it('entryMaskNamesTheMissingChartTest', async () => {
    chart = []

    await paintMask(1)

    expect(container.textContent).toContain('Es gibt noch keinen Kontenplan.')
    expect(container.textContent).toContain('Kontenplan anlegen')
    expect(container.querySelector('[role="grid"]')).toBeNull()
  })

  /** The second bolt, and it names the day it is about. */
  it('entryMaskNamesTheMissingFiscalYearTest', async () => {
    fiscalYears = false

    await paintMask(1)

    expect(container.textContent).toContain('gibt es kein Geschäftsjahr.')
    expect(container.textContent).toContain('Geschäftsjahr anlegen')
    expect(container.querySelector('[role="grid"]')).toBeNull()
  })

  /**
   * Ctrl+S works on the whole mask, not only inside the grid: somebody who has just typed the
   * text should not have to click into the raster first.
   */
  it('entryMaskSavesOnCtrlSFromTheHeaderTest', async () => {
    await paintMask(1)

    act(() => field('Text').focus())
    act(() => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }),
      )
    })

    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull()
  })

  /**
   * The daily path: save, then type the next voucher. The mask starts over on the same two row
   * keys, so React keeps the account cells it has already drawn — and a cell holding its own
   * copy of the typed text went on showing an account the row no longer carried. The next entry
   * was then typed on top of an account that looked set and was not: the row is dropped on
   * sending, and the server complains about a line that is missing rather than about the one
   * that is wrong.
   */
  it('entryMaskClearsTheAccountFieldAfterSavingTest', async () => {
    await paintMask(1)

    act(() => cell('Konto Zeile 1').focus())
    type(cell('Konto Zeile 1'), 'raum')
    await settle()
    await act(async () => {
      container.querySelector<HTMLElement>('[role="option"]')?.click()
    })
    type(cell('Soll Zeile 1'), '3200')
    expect((cell('Konto Zeile 1') as HTMLInputElement).value).toBe('6000 Raumaufwand')

    await act(async () => {
      button('Nur speichern')?.click()
    })
    await settle()

    expect((cell('Konto Zeile 1') as HTMLInputElement).value).toBe('')
    expect((cell('Soll Zeile 1') as HTMLInputElement).value).toBe('')
  })

  /**
   * The same thing along the other road into an account: a complete number needs no list, so
   * the list was left standing open. After the save the row is empty, and an empty row is met
   * by nothing — neither the text of the entry before it nor its suggestions.
   */
  it('entryMaskLeavesNoAccountListOpenAfterSavingTest', async () => {
    await paintMask(1)

    act(() => cell('Konto Zeile 1').focus())
    type(cell('Konto Zeile 1'), '6000')
    type(cell('Soll Zeile 1'), '3200')
    await settle()

    await act(async () => {
      button('Nur speichern')?.click()
    })
    await settle()

    expect((cell('Konto Zeile 1') as HTMLInputElement).value).toBe('')
    expect(container.querySelector('[role="listbox"]')).toBeNull()
    expect(cell('Konto Zeile 1').getAttribute('aria-expanded')).toBe('false')
    expect(container.textContent).not.toContain('Kein Konto gewählt.')
  })

  /** All three there: the grid stands, and so do the buttons of the header. */
  it('entryMaskShowsTheGridTest', async () => {
    await paintMask(1)

    expect(container.querySelector('[role="grid"]')).not.toBeNull()
    const labels = [...container.querySelectorAll('button')].map((entry) => entry.textContent)
    expect(labels).toContain('Nur speichern')
    expect(labels).toContain('Speichern und verbuchen')
    // The endpoint behind it landed with #93, so the button is here now as well.
    expect(labels).toContain('Vorlage anwenden')
  })

  /** Applying fills the grid, and the amounts arrive marked as what they are: a proposal. */
  it('applyTemplateTest', async () => {
    templates = [template()]

    await paintMask(1)
    await act(async () => {
      button('Vorlage anwenden')?.click()
    })

    expect((cell('Konto Zeile 1') as HTMLInputElement).value).toBe('6000 Raumaufwand')
    expect((cell('Soll Zeile 1') as HTMLInputElement).value).toBe('3200.00')
    expect((cell('Konto Zeile 2') as HTMLInputElement).value).toBe('1020 Bankguthaben')
    expect((cell('Haben Zeile 2') as HTMLInputElement).value).toBe('3200.00')
    expect(field('Text').value).toBe('Miete September')
    // A proposal and not a value, drawn as a changed proposal.
    expect(cell('Soll Zeile 1').getAttribute('data-suggested')).toBe('true')

    // The first keystroke in the cell makes an ordinary amount of it.
    type(cell('Soll Zeile 1'), '3300')
    expect(cell('Soll Zeile 1').getAttribute('data-suggested')).toBeNull()
  })

  /**
   * Applying **replaces**, and where rows are typed it asks first. Appending would be the more
   * dangerous of the two: the sums would stay balanced, the amount would be there twice, and
   * the entry would look right.
   */
  it('applyTemplateOverTypedRowsTest', async () => {
    templates = [template()]

    await paintMask(1)
    act(() => cell('Konto Zeile 1').focus())
    type(cell('Konto Zeile 1'), '1020')
    type(cell('Soll Zeile 1'), '99')
    type(cell('Konto Zeile 2'), '3400')
    type(cell('Haben Zeile 2'), '99')
    await settle()

    await act(async () => {
      button('Vorlage anwenden')?.click()
    })

    // Nothing has changed yet: the question stands first, and it names how much is at stake.
    expect(document.body.textContent).toContain('Die 2 getippten Zeilen werden ersetzt.')
    expect((cell('Soll Zeile 1') as HTMLInputElement).value).toBe('99')

    await act(async () => {
      dialogButton('Ersetzen')?.click()
    })

    expect((cell('Konto Zeile 1') as HTMLInputElement).value).toBe('6000 Raumaufwand')
    expect((cell('Soll Zeile 1') as HTMLInputElement).value).toBe('3200.00')
    // Two rows and no more: the typed row was replaced, not kept beside them.
    expect(container.querySelector('[aria-label="Konto Zeile 3"]')).toBeNull()
  })

  /**
   * A template on an account posting is barred on stays applicable — it is the property of the
   * tenant — but the row arrives without an account and is marked. The refusal then comes from
   * `PostingRules` with its sentence and never as a 500 out of the database.
   */
  it('applyTemplateWithLockedAccountTest', async () => {
    templates = [
      template({
        problems: ['Auf 9200 darf von Hand nicht gebucht werden.'],
        lines: [
          templateLine({ accountId: 9, accountNumber: '9200', accountName: 'Abschluss',
            postable: false }),
          templateLine({ accountId: 1, accountNumber: '1020', accountName: 'Bankguthaben',
            side: 'CREDIT' }),
        ],
      }),
    ]

    await paintMask(1)
    await act(async () => {
      button('Vorlage anwenden')?.click()
    })
    await settle()

    // The number stays readable, the account does not arrive, and the row says so.
    expect((cell('Konto Zeile 1') as HTMLInputElement).value).toBe('9200')
    expect(cell('Konto Zeile 1').getAttribute('aria-invalid')).toBe('true')
    expect(container.textContent).toContain('Kein Konto gewählt.')
    expect((cell('Konto Zeile 2') as HTMLInputElement).value).toBe('1020 Bankguthaben')
  })

  /** A text chosen from the list brings the accounts of the entry it comes from. */
  it('suggestionFillsAccountsTest', async () => {
    suggestions = [
      {
        text: 'Miete September',
        useCount: 11,
        lastBookedOn: `${year()}-08-09`,
        lines: [
          templateLine({}),
          templateLine({ accountId: 1, accountNumber: '1020', accountName: 'Bankguthaben',
            side: 'CREDIT' }),
        ],
      },
    ]

    await paintMask(1)
    type(field('Text'), 'Mie')
    await settle()

    const option = container.querySelector<HTMLElement>('[role="option"]')
    expect(option?.textContent).toContain('Miete September')
    await act(async () => option?.click())

    expect(field('Text').value).toBe('Miete September')
    expect((cell('Konto Zeile 1') as HTMLInputElement).value).toBe('6000 Raumaufwand')
    expect((cell('Haben Zeile 2') as HTMLInputElement).value).toBe('3200.00')
  })

  /**
   * The list is walked the way the account list of the grid is walked — arrows, Enter, Escape —
   * so this mask has one keyboard model and not two.
   */
  it('suggestionWalksWithArrowKeysTest', async () => {
    suggestions = [
      {
        text: 'Miete September',
        useCount: 11,
        lastBookedOn: `${year()}-08-09`,
        lines: [templateLine({})],
      },
      {
        text: 'Mietzins Lager',
        useCount: 4,
        lastBookedOn: `${year()}-07-01`,
        lines: [templateLine({ accountId: 1, accountNumber: '1020',
          accountName: 'Bankguthaben' })],
      },
    ]

    await paintMask(1)
    act(() => field('Text').focus())
    type(field('Text'), 'Mie')
    await settle()

    press('ArrowDown')
    expect(
      [...container.querySelectorAll('[role="option"]')][1].getAttribute('aria-selected'),
    ).toBe('true')

    press('Enter')
    expect(field('Text').value).toBe('Mietzins Lager')

    // And Escape closes the list without taking anything.
    type(field('Text'), 'Mie')
    await settle()
    expect(container.querySelector('[role="listbox"]')).not.toBeNull()
    press('Escape')
    expect(container.querySelector('[role="listbox"]')).toBeNull()
  })

  /**
   * And the line that has to be drawn: typing the same text by hand proposes nothing. A
   * proposal on a merely similar text would be a guess.
   */
  it('suggestionDoesNotFillTypedTextTest', async () => {
    suggestions = [
      {
        text: 'Miete September',
        useCount: 11,
        lastBookedOn: `${year()}-08-09`,
        lines: [templateLine({})],
      },
    ]

    await paintMask(1)
    type(field('Text'), 'Miete September')
    await settle()

    expect(field('Text').value).toBe('Miete September')
    expect((cell('Konto Zeile 1') as HTMLInputElement).value).toBe('')
  })

  /**
   * <b>And the second half of that rule: the accounts arrive only over an empty grid.</b> The
   * text is always taken — it is what was picked — but the rows are not: somebody who has
   * already typed an account and an amount and then picks a text to go with them would
   * otherwise watch their work be replaced by the lines of an old entry. A suggestion is worth
   * the typing it saves and never the typing it destroys.
   */
  it('suggestionDoesNotOverwriteFilledRowsTest', async () => {
    suggestions = [
      {
        text: 'Miete September',
        useCount: 11,
        lastBookedOn: `${year()}-08-09`,
        lines: [
          templateLine({}),
          templateLine({ accountId: 1, accountNumber: '1020', accountName: 'Bankguthaben',
            side: 'CREDIT' }),
        ],
      },
    ]

    await paintMask(1)
    // A row is filled first — an account and an amount, the way somebody starts an entry. The
    // number alone carries the account: the box below says «Bankguthaben», so the row really
    // holds an accountId and the guard has something to protect.
    act(() => cell('Konto Zeile 1').focus())
    type(cell('Konto Zeile 1'), '1020')
    await settle()
    type(cell('Soll Zeile 1'), '750')
    await settle()
    expect(container.textContent).toContain('Bankguthaben')

    // And only then is a text picked out of the list.
    type(field('Text'), 'Mie')
    await settle()
    const option = container.querySelector<HTMLElement>('[role="option"]')
    expect(option?.textContent).toContain('Miete September')
    await act(async () => option?.click())
    await settle()

    // The text is taken, the typed row is untouched, and the accounts of the old entry — 6000
    // in the first row, 1020 in the second — were not pushed over it.
    expect(field('Text').value).toBe('Miete September')
    expect((cell('Konto Zeile 1') as HTMLInputElement).value).toBe('1020')
    expect((cell('Soll Zeile 1') as HTMLInputElement).value).toBe('750')
    expect(container.textContent).not.toContain('Raumaufwand')
  })

  function field(label: string): HTMLInputElement {
    const found = [...container.querySelectorAll('label')].find(
      (candidate) => candidate.textContent === label,
    )
    const input = found === undefined ? null : document.getElementById(found.htmlFor)
    if (input === null) throw new Error(`Feld «${label}» fehlt`)
    return input as HTMLInputElement
  }

  function button(text: string): HTMLButtonElement | undefined {
    return [...container.querySelectorAll('button')].find(
      (entry) => entry.textContent === text,
    ) as HTMLButtonElement | undefined
  }

  /** A dialog is rendered into the body, not into the container of the mask. */
  function dialogButton(text: string): HTMLButtonElement | undefined {
    return [...document.body.querySelectorAll('[role="dialog"] button')].find(
      (entry) => entry.textContent === text,
    ) as HTMLButtonElement | undefined
  }

  function templateLine(over: Partial<EntryTemplateLine>): EntryTemplateLine {
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
      lines: [
        templateLine({}),
        templateLine({
          accountId: 1,
          accountNumber: '1020',
          accountName: 'Bankguthaben',
          side: 'CREDIT',
        }),
      ],
      problems: [],
      ...over,
    }
  }
})

/** Lets the debounce of the account field and the queries settle. */
async function settle() {
  for (let round = 0; round < 4; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 120))
    })
  }
}
