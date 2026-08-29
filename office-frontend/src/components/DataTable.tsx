import { motion } from 'motion/react'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from 'lucide-react'
import type { MouseEvent, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckboxField } from './CheckboxField'
import { formatCount } from '../lib/format'
import type { OriginState } from '../lib/origin'
import { pageRange, sortDirection, toggleSort } from '../lib/paging'
import type { Page } from '../lib/types'
import { ErrorNotice, LoadingBlock } from './Notice'

/** One column of a {@link DataTable}. */
export type Column<T> = {
  /** Identifies the column; never shown. */
  key: string
  header: string
  /** Right aligned for anything counted or paid, so the digits line up. */
  align?: 'right'
  /** Tailwind width class, for columns that must not grow with their content. */
  width?: string
  /**
   * Field name the server sorts this column by.
   *
   * <p>Set it only where the endpoint offers that field: it is sent as `sort` and the server
   * answers 400 for anything it does not know.
   */
  sortKey?: string
  /**
   * Drops the column below the given breakpoint, header and cells together.
   *
   * <p>For a column that explains a row rather than identifies it — a unit, a cost. On a phone
   * the table keeps the two or three columns the screen is about; the rest come back as soon
   * as there is room. Set it only where the row still reads without the column, and only on
   * the same route: a narrow screen gets fewer columns, never a second mask.
   */
  hideBelow?: 'sm'
  render: (row: T) => ReactNode
}

type DataTableProps<T> = {
  columns: Column<T>[]
  rows: T[]
  keyOf: (row: T) => string | number
  /** True while the first answer is still on its way. */
  loading?: boolean
  /** Set when the request failed; replaces the table. */
  error?: unknown
  /** Shown in place of the table when there is nothing to list. */
  empty: ReactNode
  /** Row that closes the table, for example a total. */
  footer?: ReactNode
  /**
   * Route a click on the row leads to.
   *
   * <p>Convenience on top of the link that one of the cells carries. That link stays the way
   * in for the keyboard, for the middle mouse button and for the context menu. Leave it out
   * for a table whose records have no screen of their own.
   *
   * <p>May answer `undefined` for a single row, for a list whose records do not all have a
   * mask — a partner's history holds kinds of document that have one and kinds that do not.
   * Such a row stays where it is instead of pointing at a route that is not there.
   */
  rowTo?: (row: T) => string | undefined
  /**
   * Names this list as the screen the opened mask returns to.
   *
   * <p>Set it wherever `rowTo` leads into a mask, so that saving there comes back here and not
   * to whichever list the mask holds as its fallback.
   */
  rowState?: OriginState
  /** Called instead of navigating, for a table whose records open in a dialog. */
  onRowOpen?: (row: T) => void
  /**
   * The page the rows came from; shows the pager and the count below the table.
   *
   * <p>Leave it out for a list the server answers in one piece — selection lists, catalogues
   * and the like. Those have no page to turn.
   */
  page?: Page<T>
  onPageChange?: (page: number) => void
  /** The sort in force, as `field,direction`. Enables the control on sortable columns. */
  sort?: string
  onSortChange?: (sort: string) => void
  /**
   * The rows that are ticked, by their key; shows a checkbox column as the first one.
   *
   * <p>A prop pair and not a column with a `render` function, because a column has a
   * `header: string` and the head is drawn by this component — a checkbox in the table head
   * is simply not reachable through the column API. And a selection every mask built for
   * itself would repeat the same twenty lines and define `keyOf` twice (ADR-0030).
   */
  selected?: ReadonlySet<string | number>
  onSelectedChange?: (next: Set<string | number>) => void
  /**
   * Which rows may be ticked at all; the others show no box.
   *
   * <p>Left out every row may be ticked.
   */
  selectableRow?: (row: T) => boolean
  /**
   * What a screen reader is told the box stands for — «Rechnung R-2026-0142 markieren».
   *
   * <p>Left out the key is read out, which is a number and says nothing.
   */
  selectionLabel?: (row: T) => string
}

/**
 * A table of records, together with the three states in which it has nothing to show.
 *
 * <p>Scrolls sideways inside its own box rather than widening the page: a mask with many
 * columns must not push the navigation off screen.
 *
 * <p>Sorting and paging are the server's answer, not the browser's. The table sends what was
 * clicked and shows what comes back — it never reorders or slices rows itself, because it
 * holds one page and cannot know what is on the others.
 */
export function DataTable<T>({
  columns,
  rows,
  keyOf,
  loading = false,
  error,
  empty,
  footer,
  rowTo,
  rowState,
  onRowOpen,
  page,
  onPageChange,
  sort,
  onSortChange,
  selected,
  onSelectedChange,
  selectableRow,
  selectionLabel,
}: DataTableProps<T>) {
  const navigate = useNavigate()

  /**
   * Opens a record from a click anywhere on its row.
   *
   * <p>Three kinds of click are left alone: one that landed on a control of its own, one that
   * finished selecting text (a row that jumps away while you are copying an address is
   * infuriating), and one held with a modifier, which means "in a new tab" and is handed to
   * the browser.
   */
  const openRow = (row: T, event: MouseEvent<HTMLTableRowElement>) => {
    if ((event.target as HTMLElement).closest('a, button, input, select, textarea, label')) return
    if (window.getSelection()?.toString()) return

    const to = rowTo?.(row)
    if (to) {
      if (event.metaKey || event.ctrlKey || event.shiftKey) {
        window.open(to, '_blank', 'noopener')
        return
      }
      void navigate(to, { state: rowState })
      return
    }
    onRowOpen?.(row)
  }

  const selecting = selected !== undefined && onSelectedChange !== undefined
  const selectableRows = selecting ? rows.filter((row) => selectableRow?.(row) ?? true) : []
  const selectedOnPage = selectableRows.filter((row) => selected?.has(keyOf(row))).length
  const allOnPage = selectableRows.length > 0 && selectedOnPage === selectableRows.length

  /** Ticks or unticks one row, leaving every other page's rows where they are. */
  const toggleRow = (row: T, on: boolean) => {
    const next = new Set(selected)
    if (on) next.add(keyOf(row))
    else next.delete(keyOf(row))
    onSelectedChange?.(next)
  }

  /**
   * Ticks every row of **this page**, and only of this page.
   *
   * <p>The table holds one page and cannot know what is on the others, so «alle» could only
   * ever mean «alle hier». Unticking takes this page back out and leaves the rest standing.
   */
  const toggleAllOnPage = (on: boolean) => {
    const next = new Set(selected)
    for (const row of selectableRows) {
      if (on) next.add(keyOf(row))
      else next.delete(keyOf(row))
    }
    onSelectedChange?.(next)
  }

  if (error) {
    return (
      <div className="p-5">
        <ErrorNotice error={error} />
      </div>
    )
  }
  if (loading) return <LoadingBlock />
  if (rows.length === 0) return <>{empty}</>

  // A table that gives columns up on a narrow screen means to fit on it. Keeping the floor
  // that makes the wider tables scroll instead of squeezing would undo exactly that, so it
  // starts at the same breakpoint the columns come back at. Tables without such a column keep
  // the floor they always had.
  const narrows = columns.some((column) => column.hideBelow)

  return (
    <>
      <div className="overflow-x-auto">
        <table
          className={`w-full border-collapse text-[13px] ${
            narrows ? 'sm:min-w-[640px]' : 'min-w-[640px]'
          }`}
        >
          <thead>
            <tr className="border-b border-line-subtle">
              {selecting && (
                <th scope="col" className="w-10 px-5 py-2.5">
                  <CheckboxField
                    label="Alle auf dieser Seite markieren"
                    labelHidden
                    checked={allOnPage}
                    indeterminate={selectedOnPage > 0 && !allOnPage}
                    disabled={selectableRows.length === 0}
                    onChange={(event) => toggleAllOnPage(event.target.checked)}
                  />
                </th>
              )}
              {columns.map((column) => {
                const sortable = Boolean(column.sortKey && onSortChange)
                const direction = column.sortKey
                  ? sortDirection(sort ?? '', column.sortKey)
                  : undefined
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={
                      !sortable
                        ? undefined
                        : direction === 'asc'
                          ? 'ascending'
                          : direction === 'desc'
                            ? 'descending'
                            : 'none'
                    }
                    className={`text-overline whitespace-nowrap px-5 py-2.5 font-medium text-text-tertiary ${
                      column.align === 'right' ? 'text-right' : 'text-left'
                    } ${column.width ?? ''} ${column.hideBelow ? 'hidden sm:table-cell' : ''}`}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => onSortChange?.(toggleSort(sort ?? '', column.sortKey!))}
                        className={`inline-flex items-center gap-1 transition-colors hover:text-text-primary ${
                          direction ? 'text-text-primary' : ''
                        }`}
                      >
                        {column.header}
                        {direction === 'asc' && <ArrowUp size={12} aria-hidden />}
                        {direction === 'desc' && <ArrowDown size={12} aria-hidden />}
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <motion.tbody
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="divide-y divide-line-subtle"
          >
            {rows.map((row) => {
              // Asked once per row, not once per use: rowTo is the caller's function.
              const opens = Boolean(rowTo?.(row) || onRowOpen)
              return (
                <tr
                  key={keyOf(row)}
                  onClick={opens ? (event) => openRow(row, event) : undefined}
                  className={`transition-colors ${
                    opens ? 'cursor-pointer hover:bg-sunken' : 'hover:bg-sunken/60'
                  }`}
                >
                  {selecting && (
                    <td className="w-10 px-5 py-2.5 align-middle">
                      {(selectableRow?.(row) ?? true) && (
                        <CheckboxField
                          label={selectionLabel?.(row) ?? `Zeile ${keyOf(row)} markieren`}
                          labelHidden
                          checked={selected?.has(keyOf(row)) === true}
                          onChange={(event) => toggleRow(row, event.target.checked)}
                        />
                      )}
                    </td>
                  )}
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={`px-5 py-2.5 align-middle ${
                        column.align === 'right' ? 'text-right font-mono tabular-nums' : ''
                      } ${column.hideBelow ? 'hidden sm:table-cell' : ''}`}
                    >
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              )
            })}
          </motion.tbody>
          {footer && <tfoot className="border-t border-line">{footer}</tfoot>}
        </table>
      </div>
      {page && onPageChange && <Pager page={page} onPageChange={onPageChange} />}
    </>
  )
}

/**
 * Which rows are on screen and how to reach the others.
 *
 * <p>Shows the range and the total rather than only page numbers: "51-100 von 1'284" answers
 * both "where am I" and "how many are there", and the second question is the one the browser
 * could never answer on its own.
 */
function Pager({
  page,
  onPageChange,
}: {
  page: Page<unknown>
  onPageChange: (page: number) => void
}) {
  if (page.totalPages <= 1) return null
  const { first, last } = pageRange(page)
  const previousDisabled = page.page <= 0
  const nextDisabled = page.page >= page.totalPages - 1

  return (
    <nav
      aria-label="Seiten"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-line-subtle px-5 py-3"
    >
      <p className="text-[12px] text-text-secondary" aria-live="polite">
        <span className="font-mono tabular-nums">
          {formatCount(first)}–{formatCount(last)}
        </span>{' '}
        von <span className="font-mono tabular-nums">{formatCount(page.totalElements)}</span>
      </p>
      <span className="flex items-center gap-1">
        <PagerButton
          label="Vorherige Seite"
          disabled={previousDisabled}
          onClick={() => onPageChange(page.page - 1)}
        >
          <ChevronLeft size={15} aria-hidden />
        </PagerButton>
        <span className="px-2 text-[12px] text-text-secondary">
          Seite <span className="font-mono tabular-nums">{page.page + 1}</span> von{' '}
          <span className="font-mono tabular-nums">{page.totalPages}</span>
        </span>
        <PagerButton
          label="Nächste Seite"
          disabled={nextDisabled}
          onClick={() => onPageChange(page.page + 1)}
        >
          <ChevronRight size={15} aria-hidden />
        </PagerButton>
      </span>
    </nav>
  )
}

function PagerButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-sm border border-line text-text-secondary transition-colors hover:bg-sunken hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}
