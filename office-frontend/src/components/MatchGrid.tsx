import { useRef, useState, type ReactNode } from 'react'

/** One column of the grid. */
export type GridColumn<T> = {
  key: string
  header: string
  /** Right aligned for anything counted or paid, so the digits line up. */
  align?: 'right'
  width?: string
  render: (row: T) => ReactNode
}

/** What the grid needs to know. */
export type MatchGridProps<T> = {
  columns: GridColumn<T>[]
  rows: T[]
  keyOf: (row: T) => number
  /** What the whole grid is about, for a screen reader that lands on it out of context. */
  label: string
  /** The row that is open in the detail pane. */
  activeId?: number
  onActivate: (row: T) => void
  /** The rows that are ticked, by their key. */
  selected: number[]
  onSelectedChange: (selected: number[]) => void
  /** How many rows there are in total, where the grid shows one page of them. */
  totalCount?: number
  /** Business shortcuts, run on the focused row. */
  onShortcut?: (key: string, row: T) => void
  empty: ReactNode
}

/**
 * A keyboard-first list of bank movements.
 *
 * <p><b>A real ARIA grid, not a table with a role pinned on.</b> `DataTable` pages on the
 * server, holds one page and knows nothing about the others; this one is worked through with
 * the arrow keys from the first row to the last, and every cell is reachable. Rebuilding
 * `DataTable` for that would be a regression across every table screen in the application for
 * the benefit of one mask (ADR-0043).
 *
 * <p><b>Exactly one tab stop</b> (roving tabindex): tabbing into the grid lands on the row
 * somebody was last on, and tabbing again leaves it. A grid with one tab stop per row is a grid
 * nobody reaches the end of.
 *
 * <p><b>Not virtualised.</b> The page is what the server sent — see ADR-0043 on the dependency
 * that was not added.
 */
export function MatchGrid<T>({
  columns,
  rows,
  keyOf,
  label,
  activeId,
  onActivate,
  selected,
  onSelectedChange,
  totalCount,
  onShortcut,
  empty,
}: MatchGridProps<T>) {
  const [wanted, setFocus] = useState({ row: 0, column: 0 })
  const gridRef = useRef<HTMLDivElement>(null)
  // Where a Shift+Arrow range started. Held in a ref: it is not drawn, and changing it must
  // not re-render the whole page on every keystroke.
  const anchor = useRef(0)

  // Clamped while reading, not corrected in an effect: a page that shrank under the cursor
  // would otherwise be drawn once with a focus pointing past the end, and an effect that sets
  // state during render is a cascading render (the same call Dialog makes).
  const focus = {
    row: Math.min(wanted.row, Math.max(0, rows.length - 1)),
    column: Math.min(wanted.column, Math.max(0, columns.length - 1)),
  }

  if (rows.length === 0) {
    return <>{empty}</>
  }

  function move(rowDelta: number, columnDelta: number, extend: boolean) {
    const row = clamp(focus.row + rowDelta, rows.length - 1)
    const column = clamp(focus.column + columnDelta, columns.length - 1)
    if (extend && rowDelta !== 0) {
      const from = Math.min(anchor.current, row)
      const to = Math.max(anchor.current, row)
      onSelectedChange(rows.slice(from, to + 1).map(keyOf))
    } else if (rowDelta !== 0) {
      anchor.current = row
    }
    setFocus({ row, column })
  }

  function toggle(index: number) {
    const id = keyOf(rows[index])
    onSelectedChange(
      selected.includes(id) ? selected.filter((one) => one !== id) : [...selected, id],
    )
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const row = rows[focus.row]
    if (row === undefined) return

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        move(1, 0, event.shiftKey)
        return
      case 'ArrowUp':
        event.preventDefault()
        move(-1, 0, event.shiftKey)
        return
      case 'ArrowRight':
        event.preventDefault()
        move(0, 1, false)
        return
      case 'ArrowLeft':
        event.preventDefault()
        move(0, -1, false)
        return
      case 'Home':
        event.preventDefault()
        if (event.ctrlKey) {
          setFocus({ row: 0, column: 0 })
          anchor.current = 0
        } else {
          setFocus({ row: focus.row, column: 0 })
        }
        return
      case 'End':
        event.preventDefault()
        if (event.ctrlKey) {
          const last = rows.length - 1
          setFocus({ row: last, column: columns.length - 1 })
          anchor.current = last
        } else {
          setFocus({ row: focus.row, column: columns.length - 1 })
        }
        return
      case ' ':
      case 'Spacebar':
        event.preventDefault()
        toggle(focus.row)
        return
      case 'a':
      case 'A':
        if (event.ctrlKey) {
          event.preventDefault()
          onSelectedChange(rows.map(keyOf))
        }
        return
      case 'Enter':
        event.preventDefault()
        onShortcut?.(event.ctrlKey ? 'Ctrl+Enter' : 'Enter', row)
        return
      case 's':
      case 'S':
        if (!event.ctrlKey && !event.metaKey) {
          event.preventDefault()
          onShortcut?.('S', row)
        }
        return
      case 'n':
      case 'N':
        if (!event.ctrlKey && !event.metaKey) {
          event.preventDefault()
          onShortcut?.('N', row)
        }
        return
      default:
    }
  }

  return (
    <div
      ref={gridRef}
      role="grid"
      aria-label={label}
      aria-multiselectable="true"
      aria-rowcount={totalCount ?? rows.length}
      aria-colcount={columns.length}
      className="w-full text-[13px]"
      onKeyDown={onKeyDown}
    >
      <div role="row" aria-rowindex={1} className="flex border-b border-line px-2 py-1.5">
        {columns.map((column, index) => (
          <span
            key={column.key}
            role="columnheader"
            aria-colindex={index + 1}
            className={`${column.width ?? 'flex-1'} text-[11px] uppercase tracking-wide text-text-tertiary ${
              column.align === 'right' ? 'text-right' : ''
            }`}
          >
            {column.header}
          </span>
        ))}
      </div>

      {rows.map((row, rowIndex) => {
        const id = keyOf(row)
        const isFocused = rowIndex === focus.row
        return (
          <div
            key={id}
            role="row"
            aria-rowindex={rowIndex + 2}
            aria-selected={selected.includes(id)}
            data-active={activeId === id ? 'true' : undefined}
            // Exactly one tab stop in the whole grid: the row the cursor is on.
            tabIndex={isFocused ? 0 : -1}
            ref={(element) => {
              if (isFocused && element && gridRef.current?.contains(document.activeElement)) {
                element.focus({ preventScroll: false })
              }
            }}
            onClick={() => {
              setFocus({ row: rowIndex, column: focus.column })
              anchor.current = rowIndex
              onActivate(row)
            }}
            className={`flex cursor-pointer items-center gap-2 border-b border-line-subtle px-2 py-2 outline-none transition-colors ${
              activeId === id ? 'bg-accent/10' : 'hover:bg-sunken'
            } ${selected.includes(id) ? 'ring-1 ring-inset ring-accent/40' : ''} focus-visible:ring-2 focus-visible:ring-accent`}
          >
            {columns.map((column, columnIndex) => (
              <span
                key={column.key}
                role="gridcell"
                aria-colindex={columnIndex + 1}
                className={`${column.width ?? 'flex-1'} min-w-0 truncate ${
                  column.align === 'right' ? 'text-right tabular-nums' : ''
                }`}
              >
                {column.render(row)}
              </span>
            ))}
          </div>
        )
      })}
    </div>
  )
}

function clamp(value: number, max: number): number {
  if (value < 0) return 0
  return value > max ? max : value
}
