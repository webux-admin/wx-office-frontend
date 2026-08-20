import { useRef, type PointerEvent as ReactPointerEvent } from 'react'
import type { LayoutBlock, PrintLayoutDefinition } from '../../lib/types'
import { A4_HEIGHT, A4_WIDTH, BLOCK_LABELS, bodyHeightOf, type Band } from '../../printlayout/layout'

/** How many pixels one millimetre is drawn as. A4 is then 630 px wide. */
const SCALE = 3

type Selection = { band: Band; index: number } | null

/**
 * The page as it is being drawn on.
 *
 * <p>Head and foot show their blocks where they sit, in millimetres from the printable area;
 * the body shows the tables in the order they will flow, because their height depends on the
 * document and not on the form.
 *
 * <p>Dragging is done with pointer events rather than a library: the block is drawn from the
 * values in the form, and a drag has to change those values, not a transform on top of them.
 */
export function DesignCanvas({
  definition,
  selection,
  onSelect,
  onMove,
}: {
  definition: PrintLayoutDefinition
  selection: Selection
  onSelect: (selection: Selection) => void
  onMove: (band: Band, index: number, position: { x: number; y: number }) => void
}) {
  const page = definition.page
  const bodyHeight = Math.max(bodyHeightOf(page), 0)

  return (
    <div
      className="relative shrink-0 border border-line bg-surface shadow-sm"
      style={{ width: A4_WIDTH * SCALE, height: A4_HEIGHT * SCALE }}
      onPointerDown={() => onSelect(null)}
    >
      {/* The printable area, so the person drawing sees where the margins are. */}
      <div
        className="absolute border border-dashed border-line-subtle"
        style={{
          left: page.marginLeft * SCALE,
          top: page.marginTop * SCALE,
          width: (A4_WIDTH - page.marginLeft - page.marginRight) * SCALE,
          height: (A4_HEIGHT - page.marginTop - page.marginBottom) * SCALE,
        }}
      />

      <Band
        label="Kopf"
        top={page.marginTop}
        height={page.headerHeight}
        page={definition.page}
      >
        {definition.header.map((block, index) => (
          <PlacedBlock
            key={index}
            block={block}
            selected={selection?.band === 'header' && selection.index === index}
            onSelect={() => onSelect({ band: 'header', index })}
            onMove={(position) => onMove('header', index, position)}
            band={{ height: page.headerHeight, width: A4_WIDTH - page.marginLeft - page.marginRight }}
          />
        ))}
      </Band>

      <Band
        label="Körper"
        top={page.marginTop + page.headerHeight}
        height={bodyHeight}
        page={definition.page}
        dashed
      >
        <div className="flex flex-col gap-1 p-1">
          {definition.body.map((block, index) => (
            <button
              key={index}
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => onSelect({ band: 'body', index })}
              className={`rounded-[var(--radius-sm)] border px-2 py-1 text-left text-[11px] transition-colors ${
                selection?.band === 'body' && selection.index === index
                  ? 'border-accent bg-accent/10 text-accent-text'
                  : 'border-line-subtle bg-sunken text-text-secondary hover:border-line'
              }`}
            >
              {BLOCK_LABELS[block.type]}
            </button>
          ))}
          {definition.body.length === 0 && (
            <span className="px-2 py-1 text-[11px] text-text-tertiary">
              Noch keine Tabellen. Ohne Positionen bleibt der Beleg leer.
            </span>
          )}
        </div>
      </Band>

      <Band
        label="Fuss"
        top={A4_HEIGHT - page.marginBottom - page.footerHeight}
        height={page.footerHeight}
        page={definition.page}
      >
        {definition.footer.map((block, index) => (
          <PlacedBlock
            key={index}
            block={block}
            selected={selection?.band === 'footer' && selection.index === index}
            onSelect={() => onSelect({ band: 'footer', index })}
            onMove={(position) => onMove('footer', index, position)}
            band={{ height: page.footerHeight, width: A4_WIDTH - page.marginLeft - page.marginRight }}
          />
        ))}
      </Band>
    </div>
  )
}

/** One of the three areas of the page, drawn where it will be printed. */
function Band({
  label,
  top,
  height,
  page,
  dashed = false,
  children,
}: {
  label: string
  top: number
  height: number
  page: PrintLayoutDefinition['page']
  dashed?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className={`absolute ${dashed ? 'border border-dashed border-line-subtle' : ''}`}
      style={{
        left: page.marginLeft * SCALE,
        top: top * SCALE,
        width: (A4_WIDTH - page.marginLeft - page.marginRight) * SCALE,
        height: height * SCALE,
      }}
    >
      <span className="absolute -top-[14px] left-0 text-[10px] uppercase tracking-wide text-text-tertiary">
        {label}
      </span>
      {children}
    </div>
  )
}

/** A block that sits where it was dragged. */
function PlacedBlock({
  block,
  selected,
  onSelect,
  onMove,
  band,
}: {
  block: LayoutBlock
  selected: boolean
  onSelect: () => void
  onMove: (position: { x: number; y: number }) => void
  band: { width: number; height: number }
}) {
  const start = useRef<{ x: number; y: number; blockX: number; blockY: number } | null>(null)

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.stopPropagation()
    onSelect()
    start.current = { x: event.clientX, y: event.clientY, blockX: block.x, blockY: block.y }
    // Guarded: keeps the pointer on this block while it is dragged over another one, and
    // lets the component be rendered where there is no pointer capture at all.
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (start.current === null) return
    const moved = start.current
    const x = moved.blockX + (event.clientX - moved.x) / SCALE
    const y = moved.blockY + (event.clientY - moved.y) / SCALE
    onMove({
      x: clamp(Math.round(x), 0, band.width - 5),
      y: clamp(Math.round(y), 0, Math.max(band.height - 3, 0)),
    })
  }

  const stop = () => {
    start.current = null
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${BLOCK_LABELS[block.type]} verschieben`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stop}
      onPointerCancel={stop}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 5 : 1
        if (event.key === 'ArrowLeft') onMove({ x: Math.max(block.x - step, 0), y: block.y })
        if (event.key === 'ArrowRight') onMove({ x: block.x + step, y: block.y })
        if (event.key === 'ArrowUp') onMove({ x: block.x, y: Math.max(block.y - step, 0) })
        if (event.key === 'ArrowDown') onMove({ x: block.x, y: block.y + step })
      }}
      className={`absolute cursor-move touch-none overflow-hidden rounded-[2px] border px-1 text-[10px] leading-tight ${
        selected
          ? 'border-accent bg-accent/10 text-accent-text'
          : 'border-line-subtle bg-sunken text-text-secondary hover:border-line'
      }`}
      style={{
        left: block.x * SCALE,
        top: block.y * SCALE,
        width: (block.width ?? 40) * SCALE,
        minHeight: (block.height ?? 5) * SCALE,
      }}
    >
      {captionOf(block)}
    </div>
  )
}

/** What a block shows on the canvas: not its value, which only the document has, but what it is. */
function captionOf(block: LayoutBlock): string {
  if (block.type === 'TEXT') return block.text ?? ''
  if (block.type === 'FIELD') return [block.text, `{${block.field ?? ''}}`].filter(Boolean).join(' ')
  if (block.type === 'ADDRESS') {
    return block.field === 'issuer' ? 'Adresse Absender' : 'Adresse Empfänger'
  }
  return BLOCK_LABELS[block.type]
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), Math.max(high, low))
}
