// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { MatchGrid, type GridColumn } from './MatchGrid'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type Row = { id: number; amount: number; payer: string }

const ROWS: Row[] = [
  { id: 1, amount: 3200, payer: 'Muster Bau AG' },
  { id: 2, amount: 120, payer: 'Huber GmbH' },
  { id: 3, amount: 40, payer: 'Zeller' },
]

const COLUMNS: GridColumn<Row>[] = [
  { key: 'amount', header: 'Betrag', align: 'right', render: (row) => row.amount },
  { key: 'payer', header: 'Zahler', render: (row) => row.payer },
]

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

type Handles = {
  onActivate: Mock<(row: Row) => void>
  onSelectedChange: Mock<(selected: number[]) => void>
  onShortcut: Mock<(key: string, row: Row) => void>
}

function draw(selected: number[] = [], totalCount?: number): Handles {
  const handles: Handles = {
    onActivate: vi.fn(),
    onSelectedChange: vi.fn(),
    onShortcut: vi.fn(),
  }
  act(() => {
    root.render(
      <MatchGrid
        columns={COLUMNS}
        rows={ROWS}
        keyOf={(row) => row.id}
        label="Nicht zugeordnete Bankeingänge"
        onActivate={handles.onActivate}
        selected={selected}
        onSelectedChange={handles.onSelectedChange}
        totalCount={totalCount}
        onShortcut={handles.onShortcut}
        empty={<p>Nichts zu klären</p>}
      />,
    )
  })
  return handles
}

function rows(): HTMLElement[] {
  return [...container.querySelectorAll('[role="row"]')].slice(1) as HTMLElement[]
}

function press(key: string, modifiers: Partial<KeyboardEventInit> = {}) {
  act(() => {
    const grid = container.querySelector('[role="grid"]')!
    grid.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...modifiers }),
    )
  })
}

describe('MatchGrid', () => {
  it('rendersAsAGridTest', () => {
    draw()

    const grid = container.querySelector('[role="grid"]')!
    expect(grid.getAttribute('aria-multiselectable')).toBe('true')
    expect(grid.getAttribute('aria-label')).toBe('Nicht zugeordnete Bankeingänge')
    expect(container.querySelectorAll('[role="columnheader"]')).toHaveLength(2)
    expect(rows()).toHaveLength(3)
  })

  /**
   * Exactly one tab stop. A grid with one per row is a grid nobody tabs to the end of.
   */
  it('hasExactlyOneTabStopTest', () => {
    draw()

    const reachable = rows().filter((row) => row.getAttribute('tabindex') === '0')

    expect(reachable).toHaveLength(1)
    expect(reachable[0]).toBe(rows()[0])
  })

  it('arrowDownMovesTheTabStopTest', () => {
    draw()

    press('ArrowDown')

    expect(rows()[1].getAttribute('tabindex')).toBe('0')
    expect(rows()[0].getAttribute('tabindex')).toBe('-1')
  })

  /** Moving the focus must not tick anything. */
  it('arrowDoesNotChangeTheSelectionTest', () => {
    const handles = draw()

    press('ArrowDown')
    press('ArrowDown')

    expect(handles.onSelectedChange).not.toHaveBeenCalled()
  })

  it('arrowStopsAtTheEndsTest', () => {
    draw()

    press('ArrowUp')
    expect(rows()[0].getAttribute('tabindex')).toBe('0')

    press('ArrowDown')
    press('ArrowDown')
    press('ArrowDown')
    press('ArrowDown')
    expect(rows()[2].getAttribute('tabindex')).toBe('0')
  })

  it('ctrlHomeAndEndJumpTest', () => {
    draw()

    press('End', { ctrlKey: true })
    expect(rows()[2].getAttribute('tabindex')).toBe('0')

    press('Home', { ctrlKey: true })
    expect(rows()[0].getAttribute('tabindex')).toBe('0')
  })

  it('spaceTogglesTheSelectionTest', () => {
    const handles = draw()

    press(' ')

    expect(handles.onSelectedChange).toHaveBeenCalledWith([1])
  })

  it('spaceUntogglesTest', () => {
    const handles = draw([1])

    press(' ')

    expect(handles.onSelectedChange).toHaveBeenCalledWith([])
  })

  it('shiftArrowExtendsTheSelectionTest', () => {
    const handles = draw()

    press('ArrowDown', { shiftKey: true })

    expect(handles.onSelectedChange).toHaveBeenCalledWith([1, 2])
  })

  it('ctrlAselectsEverythingTest', () => {
    const handles = draw()

    press('a', { ctrlKey: true })

    expect(handles.onSelectedChange).toHaveBeenCalledWith([1, 2, 3])
  })

  /** A plain «a» is not a selection: it is a character somebody may be typing. */
  it('plainAdoesNotSelectTest', () => {
    const handles = draw()

    press('a')

    expect(handles.onSelectedChange).not.toHaveBeenCalled()
  })

  it('ariaSelectedFollowsTheSelectionTest', () => {
    draw([2])

    expect(rows()[0].getAttribute('aria-selected')).toBe('false')
    expect(rows()[1].getAttribute('aria-selected')).toBe('true')
  })

  /**
   * The grid shows one page; the count says how many there are. A screen reader that hears
   * «3 of 3» on page one of four has been told something false.
   */
  it('ariaRowcountIsTheTotalTest', () => {
    draw([], 200)

    expect(container.querySelector('[role="grid"]')!.getAttribute('aria-rowcount')).toBe('200')
    expect(rows()).toHaveLength(3)
  })

  it('ariaRowcountFallsBackToWhatIsShownTest', () => {
    draw()

    expect(container.querySelector('[role="grid"]')!.getAttribute('aria-rowcount')).toBe('3')
  })

  // --- the four business shortcuts, and they are visible on the page ------------------------

  it('enterOpensTheRowTest', () => {
    const handles = draw()

    press('Enter')

    expect(handles.onShortcut).toHaveBeenCalledWith('Enter', ROWS[0])
  })

  it('ctrlEnterBooksTest', () => {
    const handles = draw()

    press('Enter', { ctrlKey: true })

    expect(handles.onShortcut).toHaveBeenCalledWith('Ctrl+Enter', ROWS[0])
  })

  it('sMarksForLaterTest', () => {
    const handles = draw()
    press('ArrowDown')

    press('s')

    expect(handles.onShortcut).toHaveBeenCalledWith('S', ROWS[1])
  })

  it('nJumpsToTheNextUnclearTest', () => {
    const handles = draw()

    press('n')

    expect(handles.onShortcut).toHaveBeenCalledWith('N', ROWS[0])
  })

  /** Ctrl+S is the browser's save; the grid must not steal it. */
  it('ctrlSisNotTheShortcutTest', () => {
    const handles = draw()

    press('s', { ctrlKey: true })

    expect(handles.onShortcut).not.toHaveBeenCalled()
  })

  it('clickOpensTheRowTest', () => {
    const handles = draw()

    act(() => rows()[2].click())

    expect(handles.onActivate).toHaveBeenCalledWith(ROWS[2])
  })

  it('emptyGridShowsTheEmptyStateTest', () => {
    act(() => {
      root.render(
        <MatchGrid
          columns={COLUMNS}
          rows={[]}
          keyOf={(row: Row) => row.id}
          label="Leer"
          onActivate={vi.fn()}
          selected={[]}
          onSelectedChange={vi.fn()}
          empty={<p>Nichts zu klären</p>}
        />,
      )
    })

    expect(container.textContent).toContain('Nichts zu klären')
    expect(container.querySelector('[role="grid"]')).toBeNull()
  })
})
