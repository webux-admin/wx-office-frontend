import { motion } from 'motion/react'
import { GripVertical, Pencil, Trash2 } from 'lucide-react'
import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { EmptyState } from '../../components/Notice'
import { formatAmount, formatPercent, formatQuantity } from '../../lib/format'
import { shortLabelForCode, type SelectableEntry } from '../../lib/masterData'
import { exceedsOpenQuantity } from '../../lib/openQuantity'
import type { DocumentLine, OpenLineQuantity, SalesDocument } from '../../lib/types'
import { useCatalogueLabel, useMasterDataEntries } from '../../masterdata/useMasterData'

/**
 * The columns of the position table, in the order they are printed.
 *
 * <p>Only an `ITEM` fills all of them. The other kinds pull several together, which is why
 * the rows are written out below instead of coming out of a generic table.
 */
const COLUMNS: { key: string; header: string; right: boolean; width: string }[] = [
  { key: 'position', header: 'Pos', right: false, width: 'w-[60px]' },
  { key: 'description', header: 'Bezeichnung', right: false, width: '' },
  { key: 'quantity', header: 'Menge', right: true, width: 'w-[110px]' },
  { key: 'open', header: 'Offen', right: true, width: 'w-[90px]' },
  { key: 'unitPrice', header: 'Einzelpreis', right: true, width: 'w-[120px]' },
  { key: 'discount', header: 'Rabatt', right: true, width: 'w-[110px]' },
  { key: 'vat', header: 'MwSt', right: true, width: 'w-[90px]' },
  { key: 'net', header: 'Netto', right: true, width: 'w-[120px]' },
]

/**
 * The columns this document actually needs.
 *
 * <p>A document without a single discount does not get a Rabatt column: an empty column is a
 * question the reader has to answer for themselves, and the mask should say what the printed
 * document will say. The Offen column follows the same rule — it appears only where the
 * caller handed the open quantities in.
 *
 * @param lines    the lines of the document
 * @param showsOpen whether what is still open on each position is known
 * @returns the columns to draw, in the order they are printed
 */
function columnsFor(lines: readonly DocumentLine[], showsOpen: boolean) {
  return COLUMNS.filter(
    (column) =>
      (column.key !== 'discount' || hasDiscount(lines)) &&
      (column.key !== 'open' || showsOpen),
  )
}

/**
 * Whether any line of the document carries a discount.
 *
 * @param lines the lines of the document
 * @returns true as soon as one line was given one, in either of its two forms
 */
function hasDiscount(lines: readonly DocumentLine[]): boolean {
  return lines.some(
    (line) =>
      (line.discountPercent !== undefined && line.discountPercent !== 0) ||
      (line.discountAmount !== undefined && line.discountAmount !== 0),
  )
}

/** How the grip of a line is named, for the reader and for the focus. */
function handleLabel(position: number): string {
  return `Position ${position} verschieben`
}

const CELL = 'px-5 py-2.5 align-middle'
const NUMBER_CELL = `${CELL} text-right font-mono tabular-nums`
/** The grip stands in front of everything else and takes no more room than the icon needs. */
const HANDLE_COLUMN = 'w-[44px] pr-0'
const ACTION_COLUMN = 'w-[100px]'

type LineAction = (line: DocumentLine) => void

/**
 * The positions of a document, in the four shapes a line can take.
 *
 * <p>Not a {@link DataTable}: a document line is not a record with one value per column. A
 * comment runs across the table, a subtotal carries sums instead of a price, and a page break
 * is a rule with a caption. Sorting and paging, which is what the shared table is for, a
 * document has none of — its order is the printed order.
 *
 * <p>Positions are sorted by dragging them at the grip in front of the row, or by holding the
 * grip with the keyboard and pressing an arrow key.
 *
 * <p>No amount is worked out here, the subtotals included. What the backend answers is what
 * is shown — the open quantities included.
 */
export function LinesTable({
  tenantId,
  document,
  editable,
  busy,
  onEdit,
  onMove,
  onRemove,
  openOfOwnLines,
  openOfPredecessorLines,
}: {
  tenantId: number
  document: SalesDocument
  /** False once the document is issued: nothing may change about a document that is out. */
  editable: boolean
  /** True while a change is on its way; the controls stay put but stop answering. */
  busy: boolean
  onEdit: LineAction
  /** Moves a line to another position, counted the way the lines are numbered. */
  onMove: (line: DocumentLine, position: number) => void
  onRemove: LineAction
  /**
   * What is still open on this document's own positions, by printed position. Draws the
   * Offen column, which answers what the customer is still waiting for.
   */
  openOfOwnLines?: ReadonlyMap<number, OpenLineQuantity>
  /**
   * What is still open on the lines this document was taken over from, by their line id.
   * Marks a position entered for more than the predecessor has left.
   */
  openOfPredecessorLines?: ReadonlyMap<number, OpenLineQuantity>
}) {
  const units = useMasterDataEntries(tenantId, 'units')
  const kindLabel = useCatalogueLabel(tenantId, 'line-kind')
  const lines = document.lines ?? []
  const table = useRef<HTMLTableElement>(null)
  // The line the grip is holding and the line the pointer stands over, both by their number.
  const [dragged, setDragged] = useState<number | null>(null)
  const [target, setTarget] = useState<number | null>(null)
  // Where the moved line ended up, so its grip can be given the focus back once the change
  // has been answered. A grip that is disabled while the request runs loses the focus to the
  // page body, and the reader would otherwise have to tab through the whole table again to
  // move the line one place further.
  const chased = useRef<number | null>(null)

  useEffect(() => {
    if (busy) return
    const position = chased.current
    chased.current = null
    if (position === null) return
    table.current
      ?.querySelector<HTMLButtonElement>(`[aria-label="${handleLabel(position)}"]`)
      ?.focus()
  }, [busy, document])

  if (lines.length === 0) {
    return (
      <EmptyState
        title="Noch keine Position"
        description={
          document.status === 'DRAFT'
            ? 'Ein Beleg ohne Position lässt sich nicht ausstellen.'
            : 'Dieser Beleg trägt keine Positionen.'
        }
      />
    )
  }

  /**
   * Moves a line with the keyboard and remembers where its grip will be afterwards.
   *
   * <p>The backend renumbers the lines, so the grip that was held belongs to another line once
   * the answer is in. The focus follows the line, not the position.
   */
  const moveByKey = (line: DocumentLine, position: number) => {
    chased.current = position
    onMove(line, position)
  }

  /**
   * Moves the held line one place per arrow key.
   *
   * <p>Dragging needs a pointer. Without this the order of a document could not be changed
   * with the keyboard at all.
   */
  const pressKey = (
    event: KeyboardEvent<HTMLButtonElement>,
    line: DocumentLine,
    index: number,
  ) => {
    if (busy) return
    if (event.key === 'ArrowUp' && index > 0) {
      event.preventDefault()
      moveByKey(line, line.lineNumber - 1)
      return
    }
    if (event.key === 'ArrowDown' && index < lines.length - 1) {
      event.preventDefault()
      moveByKey(line, line.lineNumber + 1)
    }
  }

  const startDrag = (event: DragEvent<HTMLButtonElement>, line: DocumentLine) => {
    setDragged(line.lineNumber)
    const transfer = event.dataTransfer
    if (!transfer) return
    transfer.effectAllowed = 'move'
    // Firefox starts no drag at all when the transfer carries nothing.
    transfer.setData('text/plain', String(line.lineNumber))
    // The whole row travels under the pointer, not the grip: a lone icon says nothing about
    // which position is being moved.
    const row = event.currentTarget.closest('tr')
    if (row) transfer.setDragImage(row, 24, row.clientHeight / 2)
  }

  const dragOver = (event: DragEvent<HTMLTableRowElement>, line: DocumentLine) => {
    if (dragged === null) return
    // Without this the browser refuses the drop and no drop event ever arrives.
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    setTarget(line.lineNumber)
  }

  const endDrag = () => {
    setDragged(null)
    setTarget(null)
  }

  /** Drops the held line on the row under the pointer, whose position it takes over. */
  const drop = (event: DragEvent<HTMLTableRowElement>, line: DocumentLine) => {
    if (dragged === null) return
    event.preventDefault()
    const held = lines.find((one) => one.lineNumber === dragged)
    endDrag()
    // No focus is chased here: the mouse moved the line, and no grip was holding it.
    if (held && held.lineNumber !== line.lineNumber) onMove(held, line.lineNumber)
  }

  /** A row is dimmed while it travels and tinted while it is the place the line would land. */
  const rowClass = (line: DocumentLine) => {
    const kind = line.kind === 'SUBTOTAL' ? 'bg-sunken' : ''
    if (dragged === line.lineNumber) return `${kind} opacity-40`
    if (dragged !== null && target === line.lineNumber) return `${kind} bg-accent/12`
    return kind
  }

  /**
   * The two controls of a row, locked for as long as a change to any line is on its way.
   *
   * <p>Both hand the line over as it is numbered in this render, and the backend numbers the
   * lines afresh after every change. A dialog opened on top of a running change would be
   * asking about position 3 and, once the answer is in, take position 3 off a document where
   * that is a different line. The grip has always refused a second move for the same reason;
   * these two do now as well.
   */
  const actionsOf = (line: DocumentLine) =>
    editable ? (
      <td className={`${CELL} ${ACTION_COLUMN}`}>
        <span className="flex items-center justify-end gap-1">
          <IconButton
            label={`Position ${line.lineNumber} bearbeiten`}
            disabled={busy}
            onClick={() => onEdit(line)}
          >
            <Pencil size={14} />
          </IconButton>
          <IconButton
            label={`Position ${line.lineNumber} entfernen`}
            danger
            disabled={busy}
            onClick={() => onRemove(line)}
          >
            <Trash2 size={14} />
          </IconButton>
        </span>
      </td>
    ) : null

  const columns = columnsFor(lines, openOfOwnLines !== undefined)
  // Everything but "Pos": the span a row uses that has no figures of its own.
  const valueColumns = columns.length - 1
  const totalSpan = valueColumns + (editable ? 1 : 0)

  return (
    <div className="overflow-x-auto">
      <table ref={table} className="w-full min-w-[640px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-line-subtle">
            {editable && <th scope="col" className={`${CELL} ${HANDLE_COLUMN}`} />}
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={`text-overline whitespace-nowrap px-5 py-2.5 font-medium text-text-tertiary ${
                  column.right ? 'text-right' : 'text-left'
                } ${column.width}`}
              >
                {column.header}
              </th>
            ))}
            {editable && <th scope="col" className={`${ACTION_COLUMN} px-5 py-2.5`} />}
          </tr>
        </thead>

        <motion.tbody
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="divide-y divide-line-subtle"
        >
          {lines.map((line, index) => (
            <tr
              key={line.lineNumber}
              className={rowClass(line)}
              onDragOver={editable ? (event) => dragOver(event, line) : undefined}
              onDrop={editable ? (event) => drop(event, line) : undefined}
            >
              {editable && (
                <td className={`${CELL} ${HANDLE_COLUMN}`}>
                  <DragHandle
                    position={line.lineNumber}
                    disabled={busy}
                    onDragStart={(event) => startDrag(event, line)}
                    onDragEnd={endDrag}
                    onKeyDown={(event) => pressKey(event, line, index)}
                  />
                </td>
              )}
              <td className={`${CELL} font-mono text-[12px] text-text-tertiary`}>
                {line.lineNumber}
              </td>
              <LineCells
                line={line}
                units={units}
                currency={document.currency}
                subtotalsIncludeVat={document.subtotalsIncludeVat}
                kindLabel={kindLabel}
                valueColumns={valueColumns}
                showsDiscount={columns.some((column) => column.key === 'discount')}
                showsOpen={openOfOwnLines !== undefined}
                open={openOfOwnLines?.get(line.lineNumber)}
                openOfPredecessor={
                  line.predecessorLineId === undefined
                    ? undefined
                    : openOfPredecessorLines?.get(line.predecessorLineId)
                }
              />
              {actionsOf(line)}
            </tr>
          ))}
        </motion.tbody>

        <tfoot className="border-t border-line">
          {/* With a discount on the whole document the sum of the positions comes first,
              then what is taken off: a total nobody can get to from the positions is not a
              document that can be checked (ADR-0058 of the backend). */}
          {document.discountNet !== undefined && document.discountNet !== 0 && (
            <>
              <TotalRow label="Zwischentotal" span={totalSpan} pad="pt-3">
                {formatAmount(document.totalNet + document.discountNet)}
              </TotalRow>
              <TotalRow
                label={
                  document.discountPercent === undefined
                    ? 'Rabatt'
                    : `Rabatt ${formatPercent(document.discountPercent)}%`
                }
                span={totalSpan}
              >
                {`-${formatAmount(document.discountNet)}`}
              </TotalRow>
            </>
          )}
          <TotalRow
            label="Netto"
            span={totalSpan}
            pad={document.discountNet ? undefined : 'pt-3'}
          >
            {formatAmount(document.totalNet)}
          </TotalRow>
          <TotalRow label="MwSt" span={totalSpan}>
            {formatAmount(document.totalVat)}
          </TotalRow>
          <TotalRow label={`Total ${document.currency}`} span={totalSpan} strong pad="pb-3">
            {formatAmount(document.totalGross)}
          </TotalRow>
        </tfoot>
      </table>
    </div>
  )
}

/**
 * The grip a position is dragged by, the six dots in front of every row.
 *
 * <p>It is a button and not a bare icon so that the keyboard reaches it: with the grip
 * focused, the arrow keys move the line, which is the only way to sort without a pointer.
 */
function DragHandle({
  position,
  disabled,
  onDragStart,
  onDragEnd,
  onKeyDown,
}: {
  /** The line being moved, as it is numbered on screen. */
  position: number
  /** True while a change is on its way; the grip stays visible but takes nothing. */
  disabled: boolean
  onDragStart: (event: DragEvent<HTMLButtonElement>) => void
  onDragEnd: () => void
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void
}) {
  return (
    <button
      type="button"
      draggable={!disabled}
      disabled={disabled}
      aria-label={handleLabel(position)}
      aria-keyshortcuts="ArrowUp ArrowDown"
      title="Ziehen oder mit den Pfeiltasten verschieben"
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onKeyDown={onKeyDown}
      className="grid h-7 w-6 cursor-grab place-items-center rounded-[var(--radius-sm)] text-text-tertiary transition-colors hover:bg-sunken hover:text-text-primary active:cursor-grabbing disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
    >
      <GripVertical size={14} aria-hidden />
    </button>
  )
}

/** Everything of a row but its position and its controls, which every kind has. */
function LineCells({
  line,
  units,
  currency,
  subtotalsIncludeVat,
  kindLabel,
  valueColumns,
  showsDiscount,
  showsOpen,
  open,
  openOfPredecessor,
}: {
  line: DocumentLine
  units: readonly SelectableEntry[]
  /** Currency of the document, for a discount that was given as an amount. */
  currency: string
  /** Which of the two amounts a subtotal leads with, as the document itself is priced. */
  subtotalsIncludeVat: boolean
  kindLabel: (code: string) => string
  /** How wide a row is that carries no figures, which follows from the columns drawn. */
  valueColumns: number
  /** False where no line of this document has a discount, so the column is not drawn. */
  showsDiscount: boolean
  /** False where the open quantities of this document are unknown, so no column is drawn. */
  showsOpen: boolean
  /** What is still open on this very position, when it is known. */
  open?: OpenLineQuantity
  /** What is still open on the line this position was taken over from, when there is one. */
  openOfPredecessor?: OpenLineQuantity
}) {
  if (line.kind === 'COMMENT') {
    return (
      <td className={`${CELL} text-text-secondary`} colSpan={valueColumns}>
        {line.description}
      </td>
    )
  }

  if (line.kind === 'PAGE_BREAK') {
    return (
      <td className={`${CELL} py-1.5`} colSpan={valueColumns}>
        <span className="flex items-center gap-3 text-[11px] text-text-tertiary">
          <span aria-hidden className="h-px flex-1 border-t border-dashed border-line" />
          {kindLabel('PAGE_BREAK')}
          <span aria-hidden className="h-px flex-1 border-t border-dashed border-line" />
        </span>
      </td>
    )
  }

  if (line.kind === 'SUBTOTAL') {
    return (
      <>
        <td className={`${CELL} font-medium`} colSpan={valueColumns - 2}>
          {line.description ?? kindLabel('SUBTOTAL')}
        </td>
        <td className={NUMBER_CELL}>
          {formatAmount(line.subtotalVat)}{' '}
          <span className="text-text-tertiary">{currency}</span>
        </td>
        {/* A subtotal leads with the amount the document is written in: gross where every
            charged line carries a gross price, net otherwise. The other amount stands under
            it, named, so neither figure can be read as the wrong one. */}
        <td className={`${NUMBER_CELL} font-medium`}>
          {formatAmount(subtotalsIncludeVat ? line.subtotalGross : line.subtotalNet)}
          <span className="block text-[11px] font-normal text-text-tertiary">
            {subtotalsIncludeVat
              ? `${formatAmount(line.subtotalNet)} netto`
              : `${formatAmount(line.subtotalGross)} brutto`}
          </span>
        </td>
      </>
    )
  }

  return (
    <>
      {/* The three texts stand in the order they are printed in, so the mask says what the
          document will say. `whitespace-pre-line` keeps the line breaks of the comment. */}
      <td className={CELL}>
        <span className="block">{line.description}</span>
        {line.subtitle && <span className="block text-text-secondary">{line.subtitle}</span>}
        {line.note && (
          <span className="block whitespace-pre-line text-[12px] text-text-secondary">
            {line.note}
          </span>
        )}
        {line.productNumber && (
          <span className="block font-mono text-[11px] text-text-tertiary">
            {line.productNumber}
          </span>
        )}
      </td>
      <td className={NUMBER_CELL}>
        {formatQuantity(line.quantity)}{' '}
        <span className="text-text-tertiary">{shortLabelForCode(units, line.unit)}</span>
        {/* Named, never refused: a subsequent delivery beyond the ordered quantity happens.
            The usual reason is a proposed quantity that was overwritten by accident. */}
        {exceedsOpenQuantity(line.quantity, openOfPredecessor?.openQuantity) && (
          <span className="block text-[11px] font-normal text-warning">
            mehr als offen ({formatQuantity(openOfPredecessor?.openQuantity)})
          </span>
        )}
      </td>
      {showsOpen && (
        <td className={NUMBER_CELL}>
          {open === undefined ? (
            <span className="text-text-tertiary">-</span>
          ) : (
            formatQuantity(open.openQuantity)
          )}
        </td>
      )}
      <td className={NUMBER_CELL}>{formatAmount(line.unitPrice)}</td>
      {showsDiscount && (
        <td className={NUMBER_CELL}>
          <Discount line={line} currency={currency} />
        </td>
      )}
      <td className={NUMBER_CELL}>
        {line.vatRate === undefined ? '-' : formatPercent(line.vatRate)}
      </td>
      <td className={NUMBER_CELL}>{formatAmount(line.lineNet)}</td>
    </>
  )
}

/**
 * The discount of a line, as whichever of the two forms it was given in.
 *
 * <p>An amount is shown with its currency so it cannot be read as a percentage; the two never
 * stand together on one line.
 */
function Discount({ line, currency }: { line: DocumentLine; currency: string }) {
  if (line.discountPercent) return <>{formatPercent(line.discountPercent)}</>
  if (line.discountAmount) {
    return (
      <>
        {formatAmount(line.discountAmount)}{' '}
        <span className="text-text-tertiary">{currency}</span>
      </>
    )
  }
  return <>-</>
}

/** One line of the totals under the table. */
function TotalRow({
  label,
  span,
  strong = false,
  pad = '',
  children,
}: {
  label: string
  span: number
  strong?: boolean
  /** Extra space above the first line of the block and below the last. */
  pad?: string
  children: ReactNode
}) {
  return (
    <tr>
      <td
        colSpan={span}
        className={`px-5 py-1.5 text-right ${pad} ${
          strong ? 'font-medium' : 'text-text-secondary'
        }`}
      >
        {label}
      </td>
      <td
        className={`px-5 py-1.5 text-right font-mono tabular-nums ${pad} ${
          strong ? 'font-medium' : ''
        }`}
      >
        {children}
      </td>
    </tr>
  )
}

/**
 * One of the small square controls at the end of a row.
 *
 * <p>A locked one is locked with the `disabled` of the button itself and not by dropping its
 * handler: that is the one state a reader is told about without being able to see it, and it
 * takes the control out of the tab order along the way.
 */
function IconButton({
  label,
  danger = false,
  disabled = false,
  onClick,
  children,
}: {
  label: string
  danger?: boolean
  /** True while a change is on its way; the control stays visible but takes nothing. */
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      // Marked as unavailable rather than switched off. A button carrying the DOM `disabled`
      // attribute cannot hold the focus, and the browser hands it to the page body the moment
      // the attribute appears — which is exactly the moment a change starts, right after this
      // very button opened the dialog that started it. The dialog gives the focus back to
      // whatever opened it when it closes, and that would then land nowhere, leaving a reader
      // to tab through the whole mask again. `aria-disabled` says the same thing to a reader
      // and keeps the button where the focus can return to it; the click is refused below.
      aria-disabled={disabled || undefined}
      onClick={() => {
        if (disabled) return
        onClick()
      }}
      aria-label={label}
      className={`grid h-7 w-7 place-items-center rounded-[var(--radius-sm)] text-text-tertiary transition-colors ${
        disabled
          ? 'cursor-default opacity-40'
          : danger
            ? 'hover:bg-danger/12 hover:text-danger'
            : 'hover:bg-sunken hover:text-text-primary'
      }`}
    >
      {children}
    </button>
  )
}
