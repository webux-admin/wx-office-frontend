// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DataTable, type Column } from './DataTable'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type Row = { id: number; name: string; closed?: boolean }

const ROWS: Row[] = [
  { id: 11, name: 'RE-2026-0011' },
  { id: 12, name: 'RE-2026-0012' },
  { id: 13, name: 'RE-2026-0013', closed: true },
]

const COLUMNS: Column<Row>[] = [{ key: 'name', header: 'Nummer', render: (row) => row.name }]

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

/** Every checkbox on screen, the head one first. */
function boxes(): HTMLInputElement[] {
  return [...container.querySelectorAll('input[type=checkbox]')] as HTMLInputElement[]
}

/** Where the router stands, so a navigation is visible to the test. */
function here(): string {
  return container.querySelector('[data-where]')?.getAttribute('data-where') ?? ''
}

async function render(props: Partial<Parameters<typeof DataTable<Row>>[0]> = {}) {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/liste']}>
        <Routes>
          <Route
            path="/liste"
            element={
              <>
                <span data-where="/liste" />
                <DataTable
                  columns={COLUMNS}
                  rows={ROWS}
                  keyOf={(row) => row.id}
                  empty={<p>leer</p>}
                  {...props}
                />
              </>
            }
          />
          <Route path="/rechnungen/:id" element={<span data-where="offen" />} />
        </Routes>
      </MemoryRouter>,
    )
  })
}

async function click(element: Element | undefined) {
  expect(element).toBeDefined()
  await act(async () => {
    ;(element as HTMLElement).click()
  })
}

describe('DataTable', () => {
  /** A table nobody handed a selection to looks exactly as it always did. */
  it('dataTableWithoutSelectionPropsShowsNoColumnTest', async () => {
    await render()

    expect(boxes()).toHaveLength(0)
    expect(container.querySelectorAll('tbody tr')).toHaveLength(3)
  })

  it('dataTableSelectsARowTest', async () => {
    let selected = new Set<string | number>()
    await render({ selected, onSelectedChange: (next) => (selected = next) })

    // The head box is the first; the rows follow in their order.
    await click(boxes()[1])

    expect([...selected]).toEqual([11])
  })

  it('dataTableSelectsEveryRowOnThePageTest', async () => {
    let selected = new Set<string | number>()
    await render({ selected, onSelectedChange: (next) => (selected = next) })

    await click(boxes()[0])

    expect([...selected].sort()).toEqual([11, 12, 13])
  })

  /** Unticking the head takes this page back out and leaves everything else standing. */
  it('dataTableUnselectsEveryRowOnThePageTest', async () => {
    let selected = new Set<string | number>([11, 12, 13, 99])
    await render({ selected, onSelectedChange: (next) => (selected = next) })

    expect(boxes()[0].checked).toBe(true)
    await click(boxes()[0])

    expect([...selected]).toEqual([99])
  })

  /** Some of the page ticked is neither «alle» nor «keine», and the head says so. */
  it('dataTableShowsAPartialSelectionAsIndeterminateTest', async () => {
    await render({ selected: new Set([11]), onSelectedChange: () => {} })

    expect(boxes()[0].checked).toBe(false)
    expect(boxes()[0].indeterminate).toBe(true)
  })

  /** A row the caller excluded shows no box, and «alle auf dieser Seite» skips it. */
  it('dataTableLeavesAnUnselectableRowOutTest', async () => {
    let selected = new Set<string | number>()
    await render({
      selected,
      onSelectedChange: (next) => (selected = next),
      selectableRow: (row) => row.closed !== true,
    })

    expect(boxes()).toHaveLength(3)
    await click(boxes()[0])

    expect([...selected].sort()).toEqual([11, 12])
  })

  /**
   * The proof test: the two clicks stay apart.
   *
   * <p>A click on the box must not navigate, and a click on the row must not tick — two
   * meanings for the same click is one too many (ADR-0030).
   */
  it('dataTableKeepsTheRowLinkOnASelectionClickTest', async () => {
    let selected = new Set<string | number>()
    await render({
      selected,
      onSelectedChange: (next) => (selected = next),
      rowTo: (row) => `/rechnungen/${row.id}`,
    })

    await click(boxes()[1])
    expect(here()).toBe('/liste')
    expect([...selected]).toEqual([11])

    // And the other way round: the row still opens, and ticks nothing on the way.
    const cell = container.querySelectorAll('tbody tr td')[1]
    await click(cell)
    expect(here()).toBe('offen')
    expect([...selected]).toEqual([11])
  })
})

describe('DataTable sections', () => {
  /**
   * A rule wherever the answer changes, and none where it stays — the chart of accounts reads
   * in blocks, and a heading above every row would be noise.
   */
  it('dataTableDrawsASectionRuleTest', async () => {
    await render({ sectionTitle: (row) => (row.closed === true ? 'Erledigt' : 'Offen') })

    const headings = [...container.querySelectorAll('tbody th')].map((cell) => cell.textContent)

    expect(headings).toEqual(['Offen', 'Erledigt'])
    expect(container.querySelectorAll('tbody tr')).toHaveLength(5)
  })

  /** Left out, the table looks exactly as it always did. */
  it('dataTableWithoutSectionsTest', async () => {
    await render()

    expect(container.querySelectorAll('tbody th')).toHaveLength(0)
    expect(container.querySelectorAll('tbody tr')).toHaveLength(3)
  })

  /** A row the caller has no heading for opens no block. */
  it('dataTableWithoutASectionTitleForARowTest', async () => {
    await render({ sectionTitle: () => undefined })

    expect(container.querySelectorAll('tbody th')).toHaveLength(0)
  })
})
