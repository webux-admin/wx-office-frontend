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

/** Every chevron of the folded-open column, in row order. */
function chevrons(): HTMLButtonElement[] {
  return [...container.querySelectorAll('button')].filter((candidate) =>
    candidate.getAttribute('aria-label')?.startsWith('Zeile auf')
    || candidate.getAttribute('aria-label')?.startsWith('Zeile zu'),
  ) as HTMLButtonElement[]
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

/**
 * The folded-open row: a chevron column the caller never declares, and a cell across the whole
 * table under the row it belongs to.
 *
 * <p>Which rows stand open is state of the caller and not of the table: it has to survive a
 * refetch, and a table that owned it would fold everything shut whenever an answer comes back.
 */
describe('DataTable expandable rows', () => {
  /** Every row gets a chevron, and nothing is open until somebody opens it. */
  it('dataTableShowsAChevronPerRowTest', async () => {
    await render({
      expandableRow: () => true,
      expanded: new Set<string | number>(),
      onExpandedChange: () => {},
      renderExpanded: (row: Row) => <p>Details zu {row.name}</p>,
    })

    expect(chevrons()).toHaveLength(3)
    expect(chevrons().every((button) => button.getAttribute('aria-expanded') === 'false')).toBe(
      true,
    )
    expect(container.textContent).not.toContain('Details zu')
  })

  /** An open row draws its content in a cell spanning every column. */
  it('dataTableShowsTheOpenedRowTest', async () => {
    await render({
      expandableRow: () => true,
      expanded: new Set<string | number>([12]),
      onExpandedChange: () => {},
      renderExpanded: (row: Row) => <p>Details zu {row.name}</p>,
    })

    expect(container.textContent).toContain('Details zu RE-2026-0012')
    // Three rows plus the one that is open.
    expect(container.querySelectorAll('tbody tr')).toHaveLength(4)
    const opened = [...container.querySelectorAll('tbody td')].find(
      (cell) => cell.textContent?.includes('Details zu'),
    )
    expect(opened?.getAttribute('colspan')).toBe('2')
  })

  /** The chevron reports what it does, and the caller is told which row was clicked. */
  it('dataTableTogglesARowTest', async () => {
    const seen: (string | number)[][] = []
    await render({
      expandableRow: () => true,
      expanded: new Set<string | number>(),
      onExpandedChange: (next: Set<string | number>) => seen.push([...next]),
      renderExpanded: () => <p>Details</p>,
    })

    await act(async () => {
      chevrons()[1].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(seen).toEqual([[12]])
  })

  /** And clicking an open one closes it, leaving the others where they are. */
  it('dataTableClosesAnOpenRowTest', async () => {
    const seen: (string | number)[][] = []
    await render({
      expandableRow: () => true,
      expanded: new Set<string | number>([11, 12]),
      onExpandedChange: (next: Set<string | number>) => seen.push([...next]),
      renderExpanded: () => <p>Details</p>,
    })

    await act(async () => {
      chevrons()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(seen).toEqual([[12]])
    expect(chevrons()[0].getAttribute('aria-expanded')).toBe('true')
  })

  /** A row the caller says carries nothing shows no chevron and cannot be opened. */
  it('dataTableWithoutAChevronOnEveryRowTest', async () => {
    await render({
      expandableRow: (row: Row) => row.closed !== true,
      expanded: new Set<string | number>(),
      onExpandedChange: () => {},
      renderExpanded: () => <p>Details</p>,
    })

    expect(chevrons()).toHaveLength(2)
  })

  /** A click on the chevron does not open the record: the row keeps its own click. */
  it('dataTableChevronDoesNotOpenTheRecordTest', async () => {
    await render({
      rowTo: (row: Row) => `/liste/${row.id}`,
      expandableRow: () => true,
      expanded: new Set<string | number>(),
      onExpandedChange: () => {},
      renderExpanded: () => <p>Details</p>,
    })

    await act(async () => {
      chevrons()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(here()).toBe('/liste')
  })

  /** Without the pair the table looks exactly as it always did: no column, no cell. */
  it('dataTableWithoutExpandableRowsTest', async () => {
    await render({ renderExpanded: () => <p>Details</p> })

    expect(chevrons()).toHaveLength(0)
    expect(container.querySelectorAll('tbody tr')).toHaveLength(3)
  })

  /** The heading of a block spans the chevron column too, or the rule would start too late. */
  it('dataTableSectionSpansTheChevronColumnTest', async () => {
    await render({
      sectionTitle: (row: Row) => (row.closed === true ? 'Erledigt' : 'Offen'),
      expandableRow: () => true,
      expanded: new Set<string | number>(),
      onExpandedChange: () => {},
      renderExpanded: () => <p>Details</p>,
    })

    const heading = container.querySelector('tbody th')
    expect(heading?.getAttribute('colspan')).toBe('2')
  })

  /**
   * <b>A column dropped below `sm` does not count in the `colSpan`.</b>
   *
   * <p>On a phone that column is not in the table at all, and a detail row claiming it would add
   * a column no other row fills. On a wider screen it is back, and a filler cell beside the
   * content covers it — one number cannot be right for both widths, so there are two cells.
   */
  it('dataTableOpenedRowLeavesAHiddenColumnOutOfTheColSpanTest', async () => {
    await render({
      columns: [
        ...COLUMNS,
        { key: 'ref', header: 'Beleg', hideBelow: 'sm', render: (row: Row) => `B-${row.id}` },
      ],
      expandableRow: () => true,
      expanded: new Set<string | number>([12]),
      onExpandedChange: () => {},
      renderExpanded: () => <p>Details</p>,
    })

    const opened = [...container.querySelectorAll('tbody td')].find((cell) =>
      cell.textContent?.includes('Details'),
    )
    // The chevron column and «Nummer» — «Beleg» is not among them.
    expect(opened?.getAttribute('colspan')).toBe('2')

    const filler = opened?.nextElementSibling
    expect(filler?.getAttribute('colspan')).toBe('1')
    expect(filler?.className).toContain('hidden sm:table-cell')
    expect(filler?.textContent).toBe('')
  })

  /** No column hides, no filler: a table without `hideBelow` reads exactly as it always did. */
  it('dataTableOpenedRowWithoutAHiddenColumnTest', async () => {
    await render({
      expandableRow: () => true,
      expanded: new Set<string | number>([12]),
      onExpandedChange: () => {},
      renderExpanded: () => <p>Details</p>,
    })

    const opened = [...container.querySelectorAll('tbody td')].find((cell) =>
      cell.textContent?.includes('Details'),
    )

    expect(opened?.getAttribute('colspan')).toBe('2')
    expect(opened?.nextElementSibling).toBeNull()
  })
})
