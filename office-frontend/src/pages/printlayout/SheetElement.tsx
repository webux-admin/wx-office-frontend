import { ImageIcon } from 'lucide-react'
import { memo, type CSSProperties } from 'react'
import type { LayoutElement, PrintLayoutFields } from '../../lib/types'
import { labelOfElement, sampleAddressOf, sampleTextOf } from '../../printlayout/catalogue'
import {
  COLOUR_PATTERN,
  DEFAULT_LINE_COLOUR,
  DEFAULT_LINE_WIDTH,
  isVerticalLine,
  repeatOf,
  type ObjectKey,
} from '../../printlayout/definition'
import type { ResizeHandle } from '../../printlayout/geometry'
import { RESIZE_HANDLES } from '../../printlayout/geometry'
import { formatLengthShort } from '../../printlayout/units'
import { ActionBar, ResizeHandles, WarningMark } from './SheetChrome'

/** The two grips that set a width, and the two that set a height. */
const WIDTH_HANDLES: readonly ResizeHandle[] = ['w', 'e']
const HEIGHT_HANDLES: readonly ResizeHandle[] = ['n', 's']

type SheetElementProps = {
  objectKey: ObjectKey
  element: LayoutElement
  /** The left edge in millimetres, in the coordinates of whatever holds the element. */
  x: number
  y: number
  /** The width it is drawn at: its own, or the distance to the right margin. */
  width: number
  catalogue: PrintLayoutFields
  /** What is drawn over what follows the stored order, not the order in the document tree. */
  zIndex: number
  selected: boolean
  /** The only selected object: it shows grips and the action bar. */
  single: boolean
  /** False for an element in a free section, which has no «first page or every page». */
  onPage: boolean
  /** Draws the action bar under the element, for one at the top edge. */
  barBelow: boolean
  barRight: boolean
  /** A sentence about why this element will not print as it looks, or `null`. */
  warning: string | null
  /** Drawn pale: it stands where the payment part goes and gives way to it on the last page. */
  faded: boolean
}

/**
 * One placed element on the sheet, drawn with the sample value it prints.
 *
 * <p>Sizes are the stored millimetres and points, written straight into the style: the sheet
 * around it is scaled as a whole, so nothing here knows the zoom. The element carries no
 * handlers either — the sheet listens once and finds the element by its `data-key` — which is
 * what lets sixty of them sit still while one is dragged.
 */
export const SheetElement = memo(function SheetElement({
  objectKey,
  element,
  x,
  y,
  width,
  catalogue,
  zIndex,
  selected,
  single,
  onPage,
  barBelow,
  barRight,
  warning,
  faded,
}: SheetElementProps) {
  const label = labelOfElement(element, catalogue)
  const vertical = element.type === 'LINE' && isVerticalLine(element)
  // An element as high as its content has no height to drag: its two side grips set the
  // width, and «Höhe nach Inhalt» in the inspector is what gives it one.
  const handles =
    element.type === 'LINE'
      ? vertical
        ? HEIGHT_HANDLES
        : WIDTH_HANDLES
      : element.height === null
        ? WIDTH_HANDLES
        : RESIZE_HANDLES
  const where = `${formatLengthShort(x)} mm von links, ${formatLengthShort(y)} mm von oben`

  return (
    <div
      data-key={objectKey}
      data-selected={selected}
      className="sheet-object absolute"
      style={{
        left: `${x}mm`,
        top: `${y}mm`,
        width: `${width}mm`,
        height: element.height === null ? undefined : `${element.height}mm`,
        // A selected element comes to the very front, so its grips are never under a
        // neighbour or under the content, which is otherwise drawn over the page.
        zIndex: selected ? 2000 : zIndex,
      }}
    >
      <div
        role="button"
        tabIndex={0}
        data-object
        aria-pressed={selected}
        aria-label={`${label}, ${where}${warning === null ? '' : `. Hinweis: ${warning}`}`}
        className={`relative h-full w-full cursor-move touch-none select-none ${
          faded && !selected ? 'opacity-30' : ''
        }`}
        style={textStyleOf(element)}
      >
        <ElementContent element={element} catalogue={catalogue} vertical={vertical} />
      </div>
      <span aria-hidden className="sheet-outline" />
      {warning !== null && <WarningMark text={warning} />}
      {single && <ResizeHandles handles={handles} />}
      {single && (
        <ActionBar
          label={label}
          repeat={onPage && element.type !== 'PAGE_NUMBER' ? repeatOf(element) : undefined}
          below={barBelow}
          alignRight={barRight}
        />
      )}
    </div>
  )
})

/** Font, weight, alignment and colour as the renderer will apply them. */
function textStyleOf(element: LayoutElement): CSSProperties {
  const { style } = element
  const colour = style.colour ?? null
  return {
    fontSize: style.fontSize ? `${style.fontSize}pt` : undefined,
    fontWeight: style.bold === true ? 'bold' : undefined,
    fontStyle: style.italic === true ? 'italic' : undefined,
    textAlign: style.align ?? undefined,
    // The colour is data of the form: it is the ink on the paper, not a colour of the theme.
    // Checked against the pattern the server uses, so nothing else reaches a style.
    color: colour !== null && COLOUR_PATTERN.test(colour) ? colour : undefined,
  }
}

function ElementContent({
  element,
  catalogue,
  vertical,
}: {
  element: LayoutElement
  catalogue: PrintLayoutFields
  vertical: boolean
}) {
  if (element.type === 'LINE') return <Line element={element} vertical={vertical} />

  if (element.type === 'IMAGE') {
    if (element.image === null) {
      return (
        <Placeholder>
          <ImageIcon size={14} aria-hidden />
          Bild
        </Placeholder>
      )
    }
    return (
      <img
        src={element.image}
        alt=""
        draggable={false}
        style={{ maxWidth: '100%', maxHeight: '100%', display: 'block' }}
      />
    )
  }

  if (element.type === 'ADDRESS') {
    const lines = sampleAddressOf(element, catalogue)
    if (lines.length === 0) return <Placeholder>Adresse</Placeholder>
    return (
      <>
        {lines.map((line, index) => (
          <div key={index}>{line}</div>
        ))}
      </>
    )
  }

  const text = sampleTextOf(element, catalogue)
  if (text.trim() === '') {
    return <Placeholder>{element.type === 'TEXT' ? 'Leerer Text' : 'Kein Beispielwert'}</Placeholder>
  }
  return <span style={{ whiteSpace: 'pre-wrap' }}>{text}</span>
}

/**
 * A rule, drawn the way the renderer draws it: along the width unless the box is higher than
 * wide. The transparent pad around it is what makes a hairline something a pointer can grab.
 */
function Line({ element, vertical }: { element: LayoutElement; vertical: boolean }) {
  const thickness = `${element.style.lineWidth ?? DEFAULT_LINE_WIDTH}pt`
  const colour = element.style.colour ?? null
  const ink = colour !== null && COLOUR_PATTERN.test(colour) ? colour : DEFAULT_LINE_COLOUR
  return (
    <>
      <span
        aria-hidden
        className="absolute"
        style={vertical ? { inset: '0 -1.5mm' } : { inset: '-1.5mm 0' }}
      />
      <div
        style={
          vertical
            ? { borderLeft: `${thickness} solid ${ink}`, height: '100%' }
            : { borderTop: `${thickness} solid ${ink}` }
        }
      />
    </>
  )
}

/**
 * Stands in where an element has nothing to show yet. Drawn as a mark of the tool, so nobody
 * takes it for something that prints.
 */
function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="flex h-full min-h-[4mm] items-center justify-center gap-[1mm] border border-dashed border-sheet-margin font-sans text-[7pt] font-normal not-italic text-print-muted"
    >
      {children}
    </span>
  )
}
