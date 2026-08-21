import { motion } from 'motion/react'
import { Pencil, Trash2 } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { EmptyState } from '../../components/Notice'
import { RowOrderButtons } from '../../components/RowOrderButtons'
import { formatAmount, formatPercent, formatQuantity } from '../../lib/format'
import { shortLabelForCode, type SelectableEntry } from '../../lib/masterData'
import type { DocumentLine, SalesDocument } from '../../lib/types'
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
  { key: 'unitPrice', header: 'Einzelpreis', right: true, width: 'w-[120px]' },
  { key: 'discount', header: 'Rabatt', right: true, width: 'w-[110px]' },
  { key: 'vat', header: 'MwSt', right: true, width: 'w-[90px]' },
  { key: 'net', header: 'Netto', right: true, width: 'w-[120px]' },
]

/** How many columns a row spans that has no figures of its own: everything but "Pos". */
const VALUE_COLUMNS = COLUMNS.length - 1

/** Which way a line is moved, in the word the arrow is labelled with. */
type Direction = 'oben' | 'unten'

/** How an arrow of the position table is named, for the reader and for the focus. */
function arrowLabel(position: number, direction: Direction): string {
  return `Position ${position} nach ${direction}`
}

const CELL = 'px-5 py-2.5 align-middle'
const NUMBER_CELL = `${CELL} text-right font-mono tabular-nums`

type LineAction = (line: DocumentLine) => void

/**
 * The positions of a document, in the four shapes a line can take.
 *
 * <p>Not a {@link DataTable}: a document line is not a record with one value per column. A
 * comment runs across the table, a subtotal carries sums instead of a price, and a page break
 * is a rule with a caption. Sorting and paging, which is what the shared table is for, a
 * document has none of — its order is the printed order.
 *
 * <p>No amount is worked out here, the subtotals included. What the backend answers is what
 * is shown.
 */
export function LinesTable({
  tenantId,
  document,
  editable,
  busy,
  onEdit,
  onMove,
  onRemove,
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
}) {
  const units = useMasterDataEntries(tenantId, 'units')
  const kindLabel = useCatalogueLabel(tenantId, 'line-kind')
  const lines = document.lines ?? []
  const table = useRef<HTMLTableElement>(null)
  // Where the moved line ended up, so its arrow can be given the focus back once the change
  // has been answered. A button that is disabled while the request runs loses the focus to
  // the page body, and the reader would otherwise have to tab through the whole table again
  // to move the line one place further.
  const chased = useRef<{ position: number; direction: Direction } | null>(null)

  useEffect(() => {
    if (busy) return
    const moved = chased.current
    chased.current = null
    if (moved === null) return
    const arrow = (direction: Direction) =>
      table.current?.querySelector<HTMLButtonElement>(
        `[aria-label="${arrowLabel(moved.position, direction)}"]`,
      )
    // At the top and at the bottom the arrow that was pressed is disabled and cannot hold the
    // focus. The one beside it keeps the reader in the row that was just moved.
    const wanted = arrow(moved.direction)
    const target =
      wanted && !wanted.disabled ? wanted : arrow(moved.direction === 'oben' ? 'unten' : 'oben')
    if (target && !target.disabled) target.focus()
  }, [busy, document])

  if (lines.length === 0) {
    return (
      <EmptyState
        title="Noch keine Position"
        description={
          document.status === 'DRAFT'
            ? 'Ein Auftrag ohne Position lässt sich nicht ausstellen.'
            : 'Dieser Beleg trägt keine Positionen.'
        }
      />
    )
  }

  /**
   * Moves a line and remembers where its arrow will be afterwards.
   *
   * <p>The backend renumbers the lines, so the button that was pressed belongs to another
   * line once the answer is in. The focus follows the line, not the position.
   */
  const move = (line: DocumentLine, position: number, direction: Direction) => {
    chased.current = { position, direction }
    onMove(line, position)
  }

  const actionsOf = (line: DocumentLine, index: number) =>
    editable ? (
      <td className={`${CELL} w-[136px]`}>
        <span className="flex items-center justify-end gap-1">
          <RowOrderButtons
            name={`Position ${line.lineNumber}`}
            upDisabled={index === 0 || busy}
            downDisabled={index === lines.length - 1 || busy}
            onUp={() => move(line, line.lineNumber - 1, 'oben')}
            onDown={() => move(line, line.lineNumber + 1, 'unten')}
          />
          <IconButton
            label={`Position ${line.lineNumber} bearbeiten`}
            onClick={() => onEdit(line)}
          >
            <Pencil size={14} />
          </IconButton>
          <IconButton
            label={`Position ${line.lineNumber} entfernen`}
            danger
            onClick={() => onRemove(line)}
          >
            <Trash2 size={14} />
          </IconButton>
        </span>
      </td>
    ) : null

  return (
    <div className="overflow-x-auto">
      <table ref={table} className="w-full min-w-[640px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-line-subtle">
            {COLUMNS.map((column) => (
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
            {editable && <th scope="col" className="w-[136px] px-5 py-2.5" />}
          </tr>
        </thead>

        <motion.tbody
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="divide-y divide-line-subtle"
        >
          {lines.map((line, index) => (
            <tr key={line.lineNumber} className={line.kind === 'SUBTOTAL' ? 'bg-sunken' : ''}>
              <td className={`${CELL} font-mono text-[12px] text-text-tertiary`}>
                {line.lineNumber}
              </td>
              <LineCells
                line={line}
                units={units}
                currency={document.currency}
                kindLabel={kindLabel}
              />
              {actionsOf(line, index)}
            </tr>
          ))}
        </motion.tbody>

        <tfoot className="border-t border-line">
          <TotalRow label="Netto" span={VALUE_COLUMNS} pad="pt-3">
            {formatAmount(document.totalNet)}
          </TotalRow>
          <TotalRow label="MwSt" span={VALUE_COLUMNS}>
            {formatAmount(document.totalVat)}
          </TotalRow>
          <TotalRow label={`Total ${document.currency}`} span={VALUE_COLUMNS} strong pad="pb-3">
            {formatAmount(document.totalGross)}
          </TotalRow>
        </tfoot>
      </table>
    </div>
  )
}

/** Everything of a row but its position and its controls, which every kind has. */
function LineCells({
  line,
  units,
  currency,
  kindLabel,
}: {
  line: DocumentLine
  units: readonly SelectableEntry[]
  /** Currency of the document, for a discount that was given as an amount. */
  currency: string
  kindLabel: (code: string) => string
}) {
  if (line.kind === 'COMMENT') {
    return (
      <td className={`${CELL} text-text-secondary`} colSpan={VALUE_COLUMNS}>
        {line.description}
      </td>
    )
  }

  if (line.kind === 'PAGE_BREAK') {
    return (
      <td className={`${CELL} py-1.5`} colSpan={VALUE_COLUMNS}>
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
        <td className={`${CELL} font-medium`} colSpan={VALUE_COLUMNS - 2}>
          {line.description ?? kindLabel('SUBTOTAL')}
        </td>
        <td className={NUMBER_CELL}>
          {formatAmount(line.subtotalVat)}{' '}
          <span className="text-text-tertiary">{currency}</span>
        </td>
        <td className={`${NUMBER_CELL} font-medium`}>
          {formatAmount(line.subtotalNet)}
          <span className="block text-[11px] font-normal text-text-tertiary">
            {formatAmount(line.subtotalGross)} brutto
          </span>
        </td>
      </>
    )
  }

  return (
    <>
      <td className={CELL}>
        <span className="block">{line.description}</span>
        {line.productNumber && (
          <span className="block font-mono text-[11px] text-text-tertiary">
            {line.productNumber}
          </span>
        )}
      </td>
      <td className={NUMBER_CELL}>
        {formatQuantity(line.quantity)}{' '}
        <span className="text-text-tertiary">{shortLabelForCode(units, line.unit)}</span>
      </td>
      <td className={NUMBER_CELL}>{formatAmount(line.unitPrice)}</td>
      <td className={NUMBER_CELL}>
        <Discount line={line} currency={currency} />
      </td>
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

/** One of the small square controls at the end of a row. */
function IconButton({
  label,
  danger = false,
  onClick,
  children,
}: {
  label: string
  danger?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`grid h-7 w-7 place-items-center rounded-[var(--radius-sm)] text-text-tertiary transition-colors ${
        danger ? 'hover:bg-danger/12 hover:text-danger' : 'hover:bg-sunken hover:text-text-primary'
      }`}
    >
      {children}
    </button>
  )
}
