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
import type { Account, TaxCode } from '../lib/types'
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
  })

  /** Set where a test is about the mask having nothing to work with. */
  let chart: Account[] = CHART
  let fiscalYears = true

  function stubFetch() {
    vi.stubGlobal('fetch', (url: string) => {
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

  /** Whoever leaves the page in the middle of an entry finds it again on coming back. */
  it('entryGridRescuesTheTypingStateTest', async () => {
    writeEntryDraft(1, {
      bookingDate: today(),
      documentReference: 'MB-144',
      description: 'Miete September',
      rows: [row({ key: 1, accountId: 4, accountText: '6000 Raumaufwand', debit: '3200' })],
    })

    await paintMask(1)

    expect(field('Text').value).toBe('Miete September')
    expect(field('Beleg').value).toBe('MB-144')
    expect((cell('Konto Zeile 1') as HTMLInputElement).value).toBe('6000 Raumaufwand')
    expect((cell('Soll Zeile 1') as HTMLInputElement).value).toBe('3200')
  })

  /**
   * And the one that matters: another tenant gets an empty mask, and what was left for the
   * first one is gone from the browser. Account numbers and amounts of one business must never
   * turn up in the mask of another.
   */
  it('entryGridClearsTheTypingStateOnATenantSwitchTest', async () => {
    writeEntryDraft(1, {
      bookingDate: today(),
      documentReference: 'MB-144',
      description: 'Miete September',
      rows: [row({ key: 1, accountId: 4, accountText: '6000 Raumaufwand', debit: '3200' })],
    })

    await paintMask(2)

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

  /** Both there: the grid stands, and so do the two buttons of the header. */
  it('entryMaskShowsTheGridTest', async () => {
    await paintMask(1)

    expect(container.querySelector('[role="grid"]')).not.toBeNull()
    const labels = [...container.querySelectorAll('button')].map((entry) => entry.textContent)
    expect(labels).toContain('Nur speichern')
    expect(labels).toContain('Speichern und verbuchen')
    // Not in this delivery: there is no endpoint behind it (#93).
    expect(labels).not.toContain('Vorlage anwenden')
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
})

/** Lets the debounce of the account field and the queries settle. */
async function settle() {
  for (let round = 0; round < 4; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 120))
    })
  }
}
