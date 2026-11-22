import { memo, type CSSProperties, type ReactNode } from 'react'
import type {
  LayoutSection,
  LayoutStyle,
  PositionsSection,
  PrintLayoutFields,
  PrintoutSampleLine,
} from '../../lib/types'
import { labelOfSection } from '../../printlayout/catalogue'
import {
  COLUMN_PADDING,
  MIN_FILL_WIDTH,
  printedColumnsOf,
  type ResolvedColumn,
} from '../../printlayout/columns'
import {
  COLOUR_PATTERN,
  sectionOffsetOf,
  sectionWidthOf,
  type ObjectKey,
} from '../../printlayout/definition'
import type { ResizeHandle } from '../../printlayout/geometry'
import { ActionBar, ObjectTag, ResizeHandles } from './SheetChrome'

const SIDE_HANDLES: readonly ResizeHandle[] = ['w', 'e']
const BOTTOM_HANDLE: readonly ResizeHandle[] = ['s']

/** The rules of the renderer's stylesheet, in the units it is written in. */
const HEADER_RULE = '0.6pt solid var(--color-print-ink)'
const ROW_RULE = '0.2pt solid var(--color-print-rule)'
const SUBTOTAL_RULE = '0.4pt solid var(--color-print-ink)'
/** Remarks under a description: five sixths of the size of the row, as the renderer sets them. */
const DETAIL_STYLE: CSSProperties = {
  display: 'block',
  fontSize: '0.8333em',
  color: 'var(--color-print-muted)',
}

type SheetSectionProps = {
  objectKey: ObjectKey
  index: number
  /** How many sections the content has, for «Abschnitt 2 von 5». */
  count: number
  section: LayoutSection
  contentWidth: number
  catalogue: PrintLayoutFields
  /** The totals drop their VAT rows when the form has a VAT summary of its own. */
  hasVatSummary: boolean
  selected: boolean
  single: boolean
  /** Marks a free section something is about to be dropped into. */
  dropTarget: boolean
  barBelow: boolean
  /** The elements of a free section, drawn by the sheet. */
  children?: ReactNode
}

/**
 * One section of the content, drawn like the PDF: the same font sizes in points, the same
 * column widths and paddings in millimetres, filled with the sample document.
 *
 * <p>Sections stand in the normal flow of the page, one below the other, exactly as the
 * renderer stacks them — the order on the sheet is the order in the form, not a guess.
 */
export const SheetSection = memo(function SheetSection({
  objectKey,
  index,
  count,
  section,
  contentWidth,
  catalogue,
  hasVatSummary,
  selected,
  single,
  dropTarget,
  barBelow,
  children,
}: SheetSectionProps) {
  const label = labelOfSection(section)
  const name = `${label}, Abschnitt ${index + 1} von ${count} im Inhalt`

  if (section.type === 'FREE') {
    return (
      <div
        data-key={objectKey}
        data-section={index}
        data-selected={selected}
        className="sheet-object relative"
        // The style of a free section is written onto its box, as the renderer does: what
        // lies inside and names no size or colour of its own takes it from here.
        style={{
          height: `${section.height}mm`,
          marginBottom: `${section.spaceAfter}mm`,
          ...textStyleOf(section.style, true),
        }}
      >
        <div
          role="button"
          tabIndex={0}
          data-object
          aria-pressed={selected}
          aria-label={`${name}, ${section.elements.length} Elemente`}
          className="absolute inset-0 cursor-move touch-none"
        >
          {section.elements.length === 0 && (
            <span className="flex h-full items-center justify-center font-sans text-[7pt] text-print-muted">
              Freier Bereich
            </span>
          )}
        </div>
        {/* Always visible, though it never prints: a box nobody can see is a box nobody can
            drop anything into. */}
        <span
          aria-hidden
          className={`pointer-events-none absolute inset-0 border-dashed ${
            dropTarget ? 'border-sheet-selection bg-sheet-selection/10' : 'border-sheet-margin/70'
          }`}
          style={{ borderWidth: 'calc(var(--sheet-px) * 1)' }}
        />
        <span aria-hidden className="sheet-outline" />
        {children}
        {!selected && <ObjectTag label={label} />}
        {single && <ResizeHandles handles={BOTTOM_HANDLE} />}
        {single && <ActionBar label={label} below={barBelow} />}
      </div>
    )
  }

  const width = sectionWidthOf(section, contentWidth)
  return (
    <div
      data-key={objectKey}
      data-section={index}
      data-selected={selected}
      className="sheet-object relative"
      style={{
        marginLeft: `${sectionOffsetOf(section, contentWidth)}mm`,
        width: `${width}mm`,
        marginBottom: `${section.spaceAfter}mm`,
      }}
    >
      <div
        role="button"
        tabIndex={0}
        data-object
        aria-pressed={selected}
        aria-label={name}
        className="min-h-[4mm] cursor-move touch-none select-none"
        // A table aligns its columns one by one; the alignment of the section is for text.
        style={textStyleOf(section.style, section.type !== 'POSITIONS')}
      >
        <SectionContent
          section={section}
          catalogue={catalogue}
          hasVatSummary={hasVatSummary}
          width={width}
        />
      </div>
      <span aria-hidden className="sheet-outline" />
      {!selected && <ObjectTag label={label} />}
      {single && section.type === 'POSITIONS' && (
        <ColumnBorders columns={printedColumnsOf(section, catalogue.columns)} width={width} />
      )}
      {single && <ResizeHandles handles={SIDE_HANDLES} />}
      {single && <ActionBar label={label} below={barBelow} />}
    </div>
  )
})

function textStyleOf(style: LayoutStyle, aligned: boolean): CSSProperties {
  const colour = style.colour ?? null
  return {
    fontSize: style.fontSize ? `${style.fontSize}pt` : undefined,
    fontWeight: style.bold === true ? 'bold' : undefined,
    fontStyle: style.italic === true ? 'italic' : undefined,
    textAlign: aligned ? (style.align ?? undefined) : undefined,
    // Data of the form, checked against the pattern of the server before it reaches a style.
    color: colour !== null && COLOUR_PATTERN.test(colour) ? colour : undefined,
  }
}

function SectionContent({
  section,
  catalogue,
  hasVatSummary,
  width,
}: {
  section: Exclude<LayoutSection, { type: 'FREE' }>
  catalogue: PrintLayoutFields
  hasVatSummary: boolean
  /** The width the section is drawn at, in millimetres. */
  width: number
}) {
  const { sample } = catalogue
  switch (section.type) {
    case 'POSITIONS':
      return <PositionsTable section={section} catalogue={catalogue} width={width} />
    case 'TOTALS':
      return (
        <TotalsTable
          rows={sample.totals.filter((row) => !(hasVatSummary && row.kind === 'VAT'))}
          emphasise
          empty="Totale"
        />
      )
    case 'VAT_SUMMARY':
      return (
        <TotalsTable
          rows={sample.totals.filter((row) => row.kind === 'VAT')}
          emphasise={false}
          empty="MwSt-Aufstellung"
        />
      )
    case 'PAYMENT_TERMS':
      if (sample.paymentTerms.length === 0) return <Empty>Zahlungskondition</Empty>
      return (
        <>
          {sample.paymentTerms.map((line, index) => (
            <div key={index}>{line}</div>
          ))}
        </>
      )
    case 'DISCOUNT_STAGES':
      if (sample.discountStages.length === 0) return <Empty>Skontostaffeln</Empty>
      return (
        <ul style={{ margin: 0, paddingLeft: '5mm', listStyle: 'disc' }}>
          {sample.discountStages.map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ul>
      )
    case 'DOCUMENT_TEXT': {
      const text = section.field === 'footer' ? sample.footerText : sample.headerText
      if (text.trim() === '') return <Empty>{labelOfSection(section)}</Empty>
      return <div style={{ whiteSpace: 'pre-wrap' }}>{text}</div>
    }
  }
}

/**
 * Stands in for a section the sample document has nothing to say in. Without it the section
 * would be zero millimetres high and nobody could select it.
 */
function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[6mm] items-center justify-center border border-dashed border-sheet-margin font-sans text-[7pt] font-normal not-italic text-print-muted">
      {children} — im Beispielbeleg leer
    </div>
  )
}

function PositionsTable({
  section,
  catalogue,
  width,
}: {
  section: PositionsSection
  catalogue: PrintLayoutFields
  width: number
}) {
  const columns = printedColumnsOf(section, catalogue.columns)
  if (columns.length === 0) return <Empty>Positionen ohne Spalten</Empty>
  // Where the fixed columns leave the filling one less than its minimum, it is drawn at that
  // minimum and the table runs over the right edge of the section. That shows the problem as
  // it is; a filling column squeezed to nothing would hide the description and, with it,
  // every row that has only a description to show.
  const taken = columns
    .filter((column) => !column.fills)
    .reduce((sum, column) => sum + column.widthMm + COLUMN_PADDING, 0)
  const fillers = columns.filter((column) => column.fills).length
  const squeezed =
    fillers > 0 && (width - taken) / fillers < MIN_FILL_WIDTH + COLUMN_PADDING
  const fillWidth = squeezed ? `${MIN_FILL_WIDTH + COLUMN_PADDING}mm` : undefined
  const rule = section.rowLines ? ROW_RULE : 'none'

  return (
    <table
      style={{
        // A table whose columns do not fit is as wide as its columns, not as its section.
        width: squeezed ? `${taken + fillers * (MIN_FILL_WIDTH + COLUMN_PADDING)}mm` : '100%',
        borderCollapse: 'collapse',
        tableLayout: 'fixed',
      }}
    >
      <colgroup>
        {columns.map((column) => (
          <col
            key={column.code}
            // The stored width is that of the cell content; the padding comes on top.
            style={{
              width: column.fills ? fillWidth : `${column.widthMm + COLUMN_PADDING}mm`,
            }}
          />
        ))}
      </colgroup>
      {section.showHeader && (
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.code}
                style={{
                  borderBottom: HEADER_RULE,
                  // Eight ninths of the rows, as the renderer sets it.
                  fontSize: '0.8889em',
                  fontWeight: 'bold',
                  textAlign: column.align,
                  whiteSpace: column.numeric ? 'nowrap' : undefined,
                  padding: '1.5mm 1mm',
                  overflow: 'hidden',
                }}
              >
                {column.heading}
              </th>
            ))}
          </tr>
        </thead>
      )}
      <tbody>
        {catalogue.sample.lines.map((line, index) => (
          <PositionRow key={index} line={line} columns={columns} rule={rule} />
        ))}
        {catalogue.sample.lines.length === 0 && (
          <tr>
            <td colSpan={columns.length} style={{ padding: '1.2mm 1mm', borderBottom: rule }}>
              <span className="font-sans text-[7pt] text-print-muted">
                Hier stehen die Positionen des Belegs.
              </span>
            </td>
          </tr>
        )}
      </tbody>
    </table>
  )
}

function PositionRow({
  line,
  columns,
  rule,
}: {
  line: PrintoutSampleLine
  columns: ResolvedColumn[]
  rule: string
}) {
  const cell: CSSProperties = { borderBottom: rule, padding: '1.2mm 1mm', verticalAlign: 'top' }

  if (line.kind === 'COMMENT') {
    return (
      <tr>
        <td
          colSpan={columns.length}
          style={{ ...cell, fontStyle: 'italic', color: 'var(--color-print-comment)' }}
        >
          {line.text}
        </td>
      </tr>
    )
  }
  if (line.kind === 'SUBTOTAL') {
    const strong: CSSProperties = { ...cell, borderTop: SUBTOTAL_RULE, fontWeight: 'bold' }
    return (
      <tr>
        {columns.length > 1 && (
          <td colSpan={columns.length - 1} style={strong}>
            {line.label}
          </td>
        )}
        <td style={{ ...strong, textAlign: 'right', whiteSpace: 'nowrap' }}>{line.amount}</td>
      </tr>
    )
  }
  return (
    <tr>
      {columns.map((column) => (
        <td
          key={column.code}
          style={{
            ...cell,
            textAlign: column.align,
            whiteSpace: column.numeric ? 'nowrap' : undefined,
            overflow: 'hidden',
          }}
        >
          {line.cells[column.code] ?? ''}
          {column.code === 'description' &&
            (line.details ?? []).map((detail, index) => (
              <span key={index} style={DETAIL_STYLE}>
                {detail}
              </span>
            ))}
        </td>
      ))}
    </tr>
  )
}

function TotalsTable({
  rows,
  emphasise,
  empty,
}: {
  rows: readonly { label: string; amount: string; kind: string }[]
  /** Whether the grand total gets its rule and its weight; the VAT summary has neither. */
  emphasise: boolean
  empty: string
}) {
  if (rows.length === 0) return <Empty>{empty}</Empty>
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <tbody>
        {rows.map((row, index) => {
          const grand: CSSProperties =
            emphasise && row.kind === 'GRAND' ? { borderTop: HEADER_RULE, fontWeight: 'bold' } : {}
          return (
            <tr key={index}>
              <td style={{ padding: '0.8mm 1mm', ...grand }}>{row.label}</td>
              <td
                style={{ padding: '0.8mm 1mm', textAlign: 'right', whiteSpace: 'nowrap', ...grand }}
              >
                {row.amount}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

/**
 * The borders between the columns of the selected positions table, as things to drag.
 *
 * <p>They write the same widths the column configurator shows; the list in the inspector
 * stays the way that needs no dragging.
 */
function ColumnBorders({ columns, width }: { columns: ResolvedColumn[]; width: number }) {
  const widthOf = (column: ResolvedColumn) => column.widthMm + COLUMN_PADDING
  const fixed = columns
    .filter((column) => !column.fills)
    .reduce((sum, column) => sum + widthOf(column), 0)
  const fillers = columns.filter((column) => column.fills).length
  const fill = fillers === 0 ? 0 : Math.max(width - fixed, 0) / fillers
  const borders: number[] = []
  let x = 0
  columns.slice(0, -1).forEach((column) => {
    x += column.fills ? fill : widthOf(column)
    borders.push(x)
  })
  return (
    <>
      {borders.map((position, index) => (
        <span
          key={index}
          aria-hidden
          data-column-boundary={index}
          className="absolute inset-y-0 z-[4] cursor-col-resize touch-none"
          style={{ left: `${position}mm`, width: '2mm', marginLeft: '-1mm' }}
        >
          <span
            className="mx-auto block h-full bg-sheet-selection/45"
            style={{ width: 'var(--sheet-px)' }}
          />
        </span>
      ))}
    </>
  )
}
