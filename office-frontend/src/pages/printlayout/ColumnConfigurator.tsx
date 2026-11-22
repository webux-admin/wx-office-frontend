import { AlertTriangle, ChevronDown, GripVertical } from 'lucide-react'
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { CheckboxField } from '../../components/CheckboxField'
import { RowOrderButtons } from '../../components/RowOrderButtons'
import { TextField } from '../../components/TextField'
import { Tooltip } from '../../components/Tooltip'
import type { LayoutColumn, PositionsSection, PrintoutColumn } from '../../lib/types'
import {
  chosenColumnsOf,
  COLUMN_PADDING,
  columnBudgetOf,
  columnRowsOf,
  MIN_COLUMN_WIDTH,
  moveColumn,
  setFillColumn,
  toggleColumn,
  updateColumn,
  type ResolvedColumn,
} from '../../printlayout/columns'
import { MAX_HEADING_LENGTH } from '../../printlayout/definition'
import { insertionIndexAt } from '../../printlayout/geometry'
import { formatLengthShort } from '../../printlayout/units'
import { AlignButtons, MeasureField } from './InspectorControls'

type ColumnConfiguratorProps = {
  section: PositionsSection
  /** The width of the table in millimetres. */
  width: number
  /** The width between the side margins: no column may be wider, whatever the table is. */
  contentWidth: number
  catalogue: readonly PrintoutColumn[]
  /** Called with the new list of chosen columns. */
  onColumns: (columns: LayoutColumn[], mergeKey?: string) => void
}

/**
 * Which columns the positions table has, in which order, how wide and under which heading.
 *
 * <p>One list of every column there is: ticked ones are printed and stand first, in print
 * order. Above it a bar adds the widths up against the width of the table and says in words
 * when they do not fit — before the PDF shows it. Order changes by the arrows or by dragging
 * the grip; the borders on the sheet write the same widths.
 */
export function ColumnConfigurator({
  section,
  width,
  contentWidth,
  catalogue,
  onColumns,
}: ColumnConfiguratorProps) {
  const chosen = chosenColumnsOf(section, catalogue)
  const rows = columnRowsOf(section, catalogue)
  const shown = rows.filter((row) => row.shown)
  const hidden = rows.filter((row) => !row.shown)
  const budget = columnBudgetOf(chosen, catalogue, width)
  const [openCode, setOpenCode] = useState<string | null>(null)

  const reorder = useRowReorder((from, to) => onColumns(moveColumn(chosen, from, to)))
  const filler = shown.find((row) => row.fills && row.known)

  if (catalogue.length === 0 && chosen.length === 0) {
    return (
      <p className="rounded-[var(--radius-md)] border border-dashed border-line px-3 py-4 text-center text-small text-text-secondary">
        Der Server bietet keine Spalten an.
      </p>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-3">
      <div
        role="status"
        className={`rounded-[var(--radius-md)] border px-3 py-2.5 ${
          budget.tone === 'error'
            ? 'border-danger/50 bg-danger/8'
            : budget.tone === 'warning'
              ? 'border-warning/50 bg-warning/10'
              : 'border-line bg-sunken/50'
        }`}
      >
        <div className="flex items-baseline justify-between gap-2 text-body">
          <span className="flex items-center gap-1.5 text-text-primary">
            <span>
              Benutzt{' '}
              <span className="font-mono tabular-nums">{formatLengthShort(budget.used)}</span> von{' '}
              <span className="font-mono tabular-nums">{formatLengthShort(budget.available)}</span>{' '}
              mm
            </span>
            <Tooltip
              label="Hinweis zur Summe der Spalten"
              text={`Zur Breite jeder Spalte kommen ${COLUMN_PADDING} mm Abstand in der Zelle. Gezählt sind die Spalten mit fester Breite; die Summe muss in die Tabelle passen.`}
            />
          </span>
          {(budget.tone === 'warning' || budget.tone === 'error') && (
            <AlertTriangle
              size={14}
              aria-hidden
              className={`shrink-0 ${budget.tone === 'error' ? 'text-danger' : 'text-warning'}`}
            />
          )}
        </div>
        <div aria-hidden className="mt-2 h-1.5 overflow-hidden rounded-[var(--radius-full)] bg-line">
          <div
            className={`h-full rounded-[var(--radius-full)] ${
              budget.tone === 'error'
                ? 'bg-danger'
                : budget.tone === 'warning'
                  ? 'bg-warning'
                  : 'bg-accent'
            }`}
            style={{
              width: `${Math.min(budget.available <= 0 ? 1 : budget.used / budget.available, 1) * 100}%`,
            }}
          />
        </div>
        <p
          className={`mt-2 text-small ${
            budget.tone === 'error' ? 'text-danger' : 'text-text-secondary'
          }`}
        >
          {budget.message ??
            (filler === undefined
              ? 'Die Spalten füllen die Tabelle genau.'
              : `«${filler.heading}» füllt die übrigen ${formatLengthShort(budget.remaining)} mm.`)}
        </p>
      </div>

      <ul className="grid grid-cols-1 gap-1" aria-label="Gedruckte Spalten, in Druckreihenfolge">
        {shown.map((row, index) => (
          <li key={row.code} ref={reorder.row(index)} className="relative">
            {reorder.insertion === index && <InsertionLine />}
            <ColumnRow
              row={row}
              widest={contentWidth}
              ownHeading={chosen.find((column) => column.code === row.code)?.label ?? ''}
              open={openCode === row.code}
              onToggleOpen={() => setOpenCode(openCode === row.code ? null : row.code)}
              first={index === 0}
              last={index === shown.length - 1}
              grip={reorder.grip(index)}
              onShown={(isShown) => onColumns(toggleColumn(chosen, row.code, isShown))}
              onUp={() => onColumns(moveColumn(chosen, index, index - 1))}
              onDown={() => onColumns(moveColumn(chosen, index, index + 1))}
              onChange={(change, mergeKey) =>
                onColumns(updateColumn(chosen, row.code, change), mergeKey)
              }
              onFills={(fills) => onColumns(setFillColumn(chosen, catalogue, row.code, fills))}
            />
            {reorder.insertion === shown.length && index === shown.length - 1 && (
              <InsertionLine below />
            )}
          </li>
        ))}
      </ul>

      {hidden.length > 0 && (
        <div>
          <p className="text-overline mb-1.5 text-text-tertiary">Weitere Spalten</p>
          <ul className="grid grid-cols-1 gap-1">
            {hidden.map((row) => (
              <li key={row.code} className="rounded-[var(--radius-md)] px-2 py-1.5">
                <CheckboxField
                  label={row.proposedHeading}
                  checked={false}
                  onChange={() => onColumns(toggleColumn(chosen, row.code, true))}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function InsertionLine({ below = false }: { below?: boolean }) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute inset-x-0 h-0.5 rounded-[var(--radius-full)] bg-accent ${
        below ? '-bottom-0.5' : '-top-0.5'
      }`}
    />
  )
}

type GripHandlers = {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerUp: () => void
  onPointerCancel: () => void
}

function ColumnRow({
  row,
  widest,
  ownHeading,
  open,
  onToggleOpen,
  first,
  last,
  grip,
  onShown,
  onUp,
  onDown,
  onChange,
  onFills,
}: {
  row: ResolvedColumn
  /** The widest a column may be: the width between the side margins. */
  widest: number
  /** The heading the form names itself; empty while it takes the proposal. */
  ownHeading: string
  open: boolean
  onToggleOpen: () => void
  first: boolean
  last: boolean
  grip: GripHandlers
  onShown: (shown: boolean) => void
  onUp: () => void
  onDown: () => void
  onChange: (change: Partial<Omit<LayoutColumn, 'code'>>, mergeKey?: string) => void
  onFills: (fills: boolean) => void
}) {
  const name = row.known ? row.proposedHeading : `Unbekannte Spalte (${row.code})`
  return (
    <div
      className={`rounded-[var(--radius-md)] border ${
        open ? 'border-line bg-sunken/40' : 'border-line-subtle'
      }`}
    >
      <div className="flex items-center gap-1 py-1.5 pl-1 pr-1.5">
        <span
          {...grip}
          aria-hidden
          title="Ziehen, um die Reihenfolge zu ändern"
          className="grid h-7 w-5 shrink-0 cursor-grab touch-none place-items-center text-text-tertiary active:cursor-grabbing"
        >
          <GripVertical size={14} />
        </span>
        <CheckboxField
          className="min-w-0 flex-1"
          label={name}
          checked
          onChange={(event) => onShown(event.target.checked)}
        />
        {!row.known && (
          <span title="Diese Spalte gibt es nicht mehr. Sie wird nicht gedruckt." className="text-warning">
            <AlertTriangle size={14} aria-hidden />
          </span>
        )}
        <span className="shrink-0 font-mono text-small tabular-nums text-text-secondary">
          {row.fills ? 'Rest' : `${formatLengthShort(row.widthMm)} mm`}
        </span>
        <RowOrderButtons
          name={name}
          upDisabled={first}
          downDisabled={last}
          onUp={onUp}
          onDown={onDown}
        />
        <button
          type="button"
          aria-expanded={open}
          aria-label={`${name}: Überschrift, Breite und Ausrichtung`}
          title="Überschrift, Breite und Ausrichtung"
          onClick={onToggleOpen}
          className="grid size-icon-button shrink-0 place-items-center rounded-[var(--radius-sm)] text-text-tertiary transition-colors hover:bg-sunken hover:text-text-primary"
        >
          <ChevronDown
            size={15}
            aria-hidden
            className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </div>

      {open && row.known && (
        <div className="grid grid-cols-1 gap-3 border-t border-line-subtle px-3 pb-3 pt-3">
          <TextField
            label="Überschrift"
            value={ownHeading}
            placeholder={row.proposedHeading}
            maxLength={MAX_HEADING_LENGTH}
            onChange={(event) => onChange({ label: event.target.value }, `heading:${row.code}`)}
            tooltip="Leer lassen für die vorgeschlagene Überschrift."
          />
          <div className="grid grid-cols-2 items-end gap-3">
            <MeasureField
              label="Breite"
              value={row.widthMm}
              min={MIN_COLUMN_WIDTH}
              max={Math.max(widest, MIN_COLUMN_WIDTH)}
              disabled={row.fills}
              onCommit={(widthMm) => onChange({ widthMm }, `width:${row.code}`)}
            />
            <AlignButtons value={row.align} onChange={(align) => onChange({ align })} />
          </div>
          <CheckboxField
            label="Füllt den Rest"
            checked={row.fills}
            onChange={(event) => onFills(event.target.checked)}
            tooltip="Diese Spalte nimmt die Breite, die die anderen übrig lassen. Genau eine Spalte kann das."
          />
        </div>
      )}
    </div>
  )
}

/**
 * Reordering rows by dragging a grip.
 *
 * <p>The pointer way beside the arrows, built by hand like every drag of the designer: the
 * rows stay where they are while one is carried, a line shows where it will land, and the
 * release moves it.
 *
 * @param onMove called with the index the row came from and the one it should have
 * @returns the handlers for a grip, the ref for a row, and where the line is to be drawn
 */
function useRowReorder(onMove: (from: number, to: number) => void) {
  const nodes = useRef<(HTMLLIElement | null)[]>([])
  const press = useRef<{ from: number; startY: number; moved: boolean; insertion: number } | null>(
    null,
  )
  const [insertion, setInsertion] = useState<number | null>(null)

  const end = () => {
    press.current = null
    setInsertion(null)
  }

  return {
    insertion,
    row: (index: number) => (node: HTMLLIElement | null) => {
      nodes.current[index] = node
    },
    grip: (index: number): GripHandlers => ({
      onPointerDown: (event) => {
        if (event.button !== 0) return
        press.current = { from: index, startY: event.clientY, moved: false, insertion: index }
        event.currentTarget.setPointerCapture?.(event.pointerId)
      },
      onPointerMove: (event) => {
        const current = press.current
        if (current === null) return
        if (!current.moved && Math.abs(event.clientY - current.startY) < 4) return
        current.moved = true
        const spans = nodes.current
          .filter((node) => node !== null)
          .map((node) => {
            const box = node.getBoundingClientRect()
            return { top: box.top, bottom: box.bottom }
          })
        current.insertion = insertionIndexAt(spans, event.clientY)
        setInsertion(current.insertion)
      },
      onPointerUp: () => {
        const current = press.current
        if (current !== null && current.moved) {
          const to = current.insertion > current.from ? current.insertion - 1 : current.insertion
          if (to !== current.from) onMove(current.from, to)
        }
        end()
      },
      onPointerCancel: end,
    }),
  }
}
