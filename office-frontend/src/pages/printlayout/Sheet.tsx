import { Lock } from 'lucide-react'
import {
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type Ref,
} from 'react'
import type { LayoutElement, PrintLayoutDefinition, PrintLayoutFields } from '../../lib/types'
import type { Snapshot } from '../../printlayout/commands'
import {
  childKey,
  containerOf,
  elementRectOf,
  printsOn,
  readingOrder,
  refOf,
  sectionKey,
  setFlowTop,
  type ElementContainer,
  type ObjectKey,
} from '../../printlayout/definition'
import type { Located } from '../../printlayout/dropping'
import type { Point, Rect } from '../../printlayout/geometry'
import type { PaletteItem } from '../../printlayout/palette'
import {
  contentWidthOf,
  MIN_FLOW_HEIGHT,
  paperSizeOf,
  PAYMENT_PART_HEIGHT,
  PAYMENT_PART_RESERVE,
  type PageView,
} from '../../printlayout/paper'
import { formatLengthShort, pxToMm, roundToStep } from '../../printlayout/units'
import type { Problem } from '../../printlayout/validation'
import { SheetElement } from './SheetElement'
import { SheetSection } from './SheetSection'
import { useStore, type Store } from './store'
import { FLOW_HINT, useSheetGestures, type DropMark } from './useSheetGestures'

/** What the tooltip at the payment part says — the sentence that explains why it is locked. */
export const PAYMENT_PART_LOCK =
  'Lage und Grösse des Zahlteils sind von SIX vorgegeben (210 × 105 mm, unten).'

/** Said at an element that reaches into the strip the payment part takes on the last page. */
const COVERED = 'Erscheint auf der letzten Seite nicht: dort steht der Zahlteil.'

/**
 * Where the content is stacked: above everything fixed on the page, as the renderer draws it.
 * A selected element still comes to the very front, so its grips are never under a table.
 */
const FLOW_LAYER = 500
const SELECTED_LAYER = 1000

/** A palette entry on its way to the sheet. */
export type PaletteDrag = {
  item: PaletteItem
  clientX: number
  clientY: number
  /** What a drop here would do, or `null` while the pointer is not over the sheet. */
  located: Located | null
  /** The size of the ghost on screen: the real size of what will land, at the current zoom. */
  ghostWidth: number
  ghostHeight: number
}

/** What a button of an action bar asks for. */
export type SheetAction = 'duplicate' | 'remove' | 'repeat-first' | 'repeat-every' | 'view-first'

/** What the rest of the designer may ask of the sheet. */
export type SheetHandle = {
  /** What a drop at a spot of the screen would do. */
  locate: (
    clientX: number,
    clientY: number,
    what: 'element' | 'section',
    fixed: boolean,
  ) => Located | null
  /** Scrolls an object into view. */
  reveal: (key: ObjectKey) => void
  /** How high the browser drew an object, in millimetres. */
  heightOf: (key: ObjectKey) => number | undefined
  /** Where a section starts on the paper, in millimetres from its top. */
  sectionTop: (index: number) => number | undefined
  /** Screen pixels per millimetre of paper right now. */
  scale: () => number
  /** Moves the keyboard focus onto an object, so the arrow keys move it. */
  focus: (key: ObjectKey) => void
  /** Moves the keyboard focus onto the sheet itself, after what had it was removed. */
  focusSheet: () => void
}

type SheetProps = {
  ref?: Ref<SheetHandle>
  definition: PrintLayoutDefinition
  selection: readonly ObjectKey[]
  catalogue: PrintLayoutFields
  problems: readonly Problem[]
  view: PageView
  zoom: number
  /** Margin lines and magnetic alignment. Off, only the half-millimetre grid is left. */
  showGuides: boolean
  /** Whether the sample document carries a QR payment part, and the picture of it. */
  paymentPart: { shown: boolean; url: string | undefined }
  /** Receives where the pointer is on the paper, for the rulers and the status line. */
  pointer: Store<Point | null>
  /** Receives the box of whatever is being dragged. */
  geometry: Store<Rect | null>
  paletteDrag: Store<PaletteDrag | null>
  onSelect: (selection: ObjectKey[]) => void
  onCommit: (outcome: Snapshot & { announcement?: string }, mergeKey?: string) => void
  onAction: (action: SheetAction, key: ObjectKey | null) => void
}

/**
 * The sheet of paper, with the sample document drawn on it and everything on it within reach
 * of the pointer and the keyboard.
 *
 * <p>Three layers, the three ideas of the designer made visible: the paper with its margins,
 * the elements fixed on it, and the content that starts at a line and runs down. The sheet is
 * laid out in millimetres and points and scaled as a whole, so a column of 22 mm is 22 mm at
 * every zoom and the text breaks where the PDF breaks it.
 */
export function Sheet({
  ref,
  definition,
  selection,
  catalogue,
  problems,
  view,
  zoom,
  showGuides,
  paymentPart,
  pointer,
  geometry,
  paletteDrag,
  onSelect,
  onCommit,
  onAction,
}: SheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const flowRef = useRef<HTMLDivElement>(null)

  const atBottom =
    paymentPart.shown && definition.paymentPart === 'LAST_PAGE_BOTTOM' && view === 'first'
  const gestures = useSheetGestures({
    sheetRef,
    flowRef,
    definition,
    selection,
    catalogue,
    view,
    zoom,
    showGuides,
    coveredBottom: atBottom ? PAYMENT_PART_RESERVE : 0,
    geometry,
    onSelect,
    onCommit,
  })
  const { preview, locate, heightOf, sectionSpans, toSheet, scale } = gestures

  // How high the content of the sample document is, as the browser stacked it. Measured, not
  // computed: the height of a table is what its text needs.
  const [contentHeight, setContentHeight] = useState(0)
  useEffect(() => {
    const node = flowRef.current
    if (node === null || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => setContentHeight(pxToMm(node.offsetHeight)))
    observer.observe(node)
    return () => observer.disconnect()
  }, [view])

  // The chrome of the tool divides its sizes by this, so a grip is nine pixels at every zoom.
  useLayoutEffect(() => {
    sheetRef.current?.style.setProperty('--sheet-zoom', String(zoom))
  }, [zoom])

  useImperativeHandle(
    ref,
    () => ({
      locate,
      heightOf,
      sectionTop: (index) => sectionSpans()[index]?.top,
      scale,
      focus: (key) => {
        sheetRef.current
          ?.querySelector<HTMLElement>(`[data-key="${key}"] > [data-object]`)
          ?.focus({ preventScroll: true })
      },
      focusSheet: () => sheetRef.current?.focus({ preventScroll: true }),
      reveal: (key) => {
        const node = sheetRef.current?.querySelector<HTMLElement>(`[data-key="${key}"]`)
        node?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
      },
    }),
    [locate, heightOf, sectionSpans, scale],
  )

  const dragged = useStore(paletteDrag)
  const shown = preview?.shown.definition ?? definition
  const selected = useMemo(
    () => new Set(preview?.shown.selection ?? selection),
    [preview, selection],
  )
  const single = selected.size === 1
  const { page, flow } = shown
  const paper = paperSizeOf(page)
  const contentWidth = contentWidthOf(page)
  const flowTop = view === 'first' ? flow.top : page.marginTop
  // With the payment part below, the content keeps its 105 mm and 2 mm for the cutting line free.
  const flowBottom =
    paper.height - (atBottom ? Math.max(PAYMENT_PART_RESERVE, page.marginBottom) : page.marginBottom)
  const hasVatSummary = flow.sections.some((section) => section.type === 'VAT_SUMMARY')

  const warnings = useMemo(() => {
    const marks = new Map<ObjectKey, string>()
    for (const problem of problems) {
      if (problem.target !== 'page' && !marks.has(problem.target)) {
        marks.set(problem.target, problem.message)
      }
    }
    return marks
  }, [problems])

  const sheetContainer: ElementContainer = containerOf(shown, { kind: 'element', index: 0 })
  const pageKeys = readingOrder(shown, view).filter((key) => refOf(key)?.kind === 'element')
  const above = pageKeys.filter((key) => (shown.elements[indexOf(key)]?.y ?? 0) < flowTop)
  const below = pageKeys.filter((key) => (shown.elements[indexOf(key)]?.y ?? 0) >= flowTop)

  const drawElement = (
    key: ObjectKey,
    element: LayoutElement,
    container: ElementContainer,
    onPage: boolean,
    stack: number,
  ) => {
    const rect = elementRectOf(element, container)
    const covered =
      onPage && atBottom && element.y + (element.height ?? 1) > paper.height - PAYMENT_PART_HEIGHT
    return (
      <SheetElement
        key={key}
        objectKey={key}
        element={element}
        x={element.x}
        y={element.y}
        width={rect.width}
        catalogue={catalogue}
        zIndex={10 + stack}
        selected={selected.has(key)}
        single={single && selected.has(key)}
        onPage={onPage}
        barBelow={onPage && element.y < 14}
        barRight={element.x + rect.width / 2 > container.frame.width / 2}
        warning={warnings.get(key) ?? (covered ? COVERED : null)}
        faded={covered}
      />
    )
  }
  const drawPageElements = (keys: readonly ObjectKey[]) =>
    keys.map((key) => {
      const index = indexOf(key)
      const element = shown.elements[index]
      if (element === undefined || !printsOn(element, view)) return null
      return drawElement(key, element, sheetContainer, true, index)
    })

  const mark: DropMark | null = preview?.drop ?? paletteMarkOf(dragged)
  const flowRaised = [...selected].some((key) => refOf(key)?.kind !== 'element')
  const empty = shown.elements.length === 0 && flow.sections.length === 0

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const at = toSheet(event.clientX, event.clientY)
    pointer.set({ x: roundToStep(at.x, 0.5), y: roundToStep(at.y, 0.5) })
    gestures.handlers.onPointerMove(event)
  }

  function onClick(event: MouseEvent<HTMLDivElement>) {
    if (!(event.target instanceof Element)) return
    const action = event.target.closest<HTMLElement>('[data-action]')?.dataset.action
    if (action === undefined || !isSheetAction(action)) return
    onAction(action, event.target.closest<HTMLElement>('[data-key]')?.dataset.key ?? null)
  }

  // Reaching an object with Tab selects it, so the arrow keys move what has the focus.
  function onFocus(event: FocusEvent<HTMLDivElement>) {
    if (gestures.pressing() || !event.target.hasAttribute('data-object')) return
    const key = event.target.closest<HTMLElement>('[data-key]')?.dataset.key
    if (key !== undefined && !selection.includes(key)) onSelect([key])
  }

  function onFlowTopKey(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 5 : 1
    const direction = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
    if (direction === 0) return
    event.preventDefault()
    // The designer reads arrow keys as «move the selection»; this one is taken here.
    event.stopPropagation()
    const next = setFlowTop(definition, definition.flow.top + direction * step)
    onCommit(
      {
        definition: next,
        selection: [...selection],
        announcement: `Der Inhalt beginnt bei ${formatLengthShort(next.flow.top)} mm.`,
      },
      'flow-top',
    )
  }

  return (
    <div
      ref={sheetRef}
      data-sheet
      // Reachable by script only: the sheet takes the focus when the object that had it is
      // deleted, so the next key still belongs to the designer and not to nothing.
      tabIndex={-1}
      role="group"
      aria-label={view === 'first' ? 'Blatt, Seite 1' : 'Blatt, Folgeseite'}
      className="sheet absolute left-0 top-0 origin-top-left"
      style={{
        width: `${paper.width}mm`,
        height: `${paper.height}mm`,
        transform: `scale(${zoom})`,
      }}
      onPointerDown={gestures.handlers.onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={gestures.handlers.onPointerUp}
      onPointerCancel={gestures.handlers.onPointerCancel}
      onPointerLeave={() => pointer.set(null)}
      onClick={onClick}
      onFocus={onFocus}
    >
      {atBottom && <PaymentPart url={paymentPart.url} />}
      {showGuides && <MarginGuides definition={shown} />}

      {drawPageElements(above)}

      {view === 'first' ? (
        <div
          // The box of the flow itself takes no pointer: what lies under it between two
          // sections stays within reach. The sections take theirs back.
          className="pointer-events-none absolute"
          style={{
            left: `${page.marginLeft}mm`,
            top: `${flowTop}mm`,
            width: `${contentWidth}mm`,
            height: `${Math.max(flowBottom - flowTop, 0)}mm`,
            // What does not fit on the first page prints on the next one. Only the bottom is
            // cut: tags and grips of a section may reach over the other three edges.
            clipPath: 'inset(-2000mm -2000mm 0mm -2000mm)',
            zIndex: flowRaised ? SELECTED_LAYER + 1 : FLOW_LAYER,
          }}
        >
          <div ref={flowRef} data-flow className="[&>*]:pointer-events-auto">
          {flow.sections.map((section, index) => {
            const key = sectionKey(index)
            const container =
              section.type === 'FREE'
                ? containerOf(shown, { kind: 'child', section: index, index: 0 })
                : null
            return (
              <SheetSection
                key={key}
                objectKey={key}
                index={index}
                count={flow.sections.length}
                section={section}
                contentWidth={contentWidth}
                catalogue={catalogue}
                hasVatSummary={hasVatSummary}
                selected={selected.has(key)}
                single={single && selected.has(key)}
                dropTarget={mark?.freeSection === index}
                barBelow={index === 0 && flowTop < 14}
              >
                {section.type === 'FREE' && container !== null
                  ? section.elements.map((element, child) =>
                      drawElement(childKey(index, child), element, container, false, child),
                    )
                  : undefined}
              </SheetSection>
            )
          })}
          </div>
        </div>
      ) : (
        <Continuation definition={shown} catalogue={catalogue} />
      )}

      {drawPageElements(below)}

      {view === 'first' && contentHeight > flowBottom - flowTop + 0.5 && (
        // The sample document is longer than this page. Nothing is lost: it is the page that
        // ends, and saying so keeps anyone from looking for the missing rows.
        <span
          role="note"
          className="sheet-chrome pointer-events-none absolute z-[1500] w-max max-w-[24rem] origin-bottom-left rounded-t-[var(--radius-xs)] bg-ink px-2 py-0.5 text-text-inverse"
          style={{ left: `${page.marginLeft}mm`, bottom: `${paper.height - flowBottom}mm` }}
        >
          {atBottom
            ? 'Seite voll — der Rest des Beispielbelegs und der Zahlteil folgen auf der nächsten Seite.'
            : 'Seite voll — der Rest des Beispielbelegs läuft auf der Folgeseite weiter.'}
        </span>
      )}

      {view === 'first' && (
        <>
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bg-sheet-flow"
            style={{
              top: `${flowTop}mm`,
              height: 'calc(var(--sheet-px) * 1)',
              zIndex: 1002,
            }}
          />
          <div
            role="slider"
            tabIndex={0}
            data-flow-top
            aria-label="Inhalt beginnt hier"
            aria-orientation="vertical"
            aria-valuemin={0}
            aria-valuemax={Math.max(Math.round(paper.height - page.marginBottom - MIN_FLOW_HEIGHT), 0)}
            aria-valuenow={Math.round(flowTop)}
            aria-valuetext={`${formatLengthShort(flowTop)} mm von oben`}
            onKeyDown={onFlowTopKey}
            title="Ziehen, um den Beginn des Inhalts auf Seite 1 zu verschieben"
            className="sheet-chrome absolute left-full z-[1003] flex h-6 w-max origin-left cursor-ns-resize touch-none select-none items-center gap-1 rounded-r-[var(--radius-sm)] bg-sheet-flow px-2 font-medium text-on-accent"
            style={{ top: `calc(${flowTop}mm - 0.75rem)` }}
          >
            Inhalt beginnt hier
          </div>
        </>
      )}

      {preview?.guides.map((guide, index) => (
        <span
          key={`${guide.axis}${index}`}
          aria-hidden
          className={`pointer-events-none absolute z-[2000] bg-sheet-guide ${
            guide.axis === 'x' ? 'inset-y-0' : 'inset-x-0'
          }`}
          style={
            guide.axis === 'x'
              ? { left: `${guide.position}mm`, width: 'calc(var(--sheet-px) * 1)' }
              : { top: `${guide.position}mm`, height: 'calc(var(--sheet-px) * 1)' }
          }
        />
      ))}

      {mark !== null && (
        <div
          aria-hidden
          className="pointer-events-none absolute top-0 z-[2001] transition-transform duration-150 ease-out"
          style={{
            left: `${page.marginLeft}mm`,
            width: `${contentWidth}mm`,
            transform: `translateY(${mark.lineY}mm)`,
          }}
        >
          {mark.freeSection === null && (
            <span
              className="absolute inset-x-0 rounded-[var(--radius-full)] bg-sheet-selection"
              style={{
                height: 'calc(var(--sheet-px) * 3)',
                top: 'calc(var(--sheet-px) * -1.5)',
              }}
            />
          )}
          <span className="sheet-chrome absolute bottom-0 left-0 w-max origin-bottom-left rounded-t-[var(--radius-xs)] bg-sheet-selection px-1.5 py-0.5 text-on-accent">
            {mark.hint}
          </span>
        </div>
      )}

      {empty && (
        <p className="pointer-events-none absolute inset-0 flex items-center justify-center px-[20mm] text-center font-sans text-[11pt] text-print-muted">
          Ziehen Sie Elemente von links auf das Blatt — oder klicken Sie eines an.
        </p>
      )}
    </div>
  )
}

function indexOf(key: ObjectKey): number {
  const ref = refOf(key)
  return ref !== null && ref.kind === 'element' ? ref.index : -1
}

function isSheetAction(value: string): value is SheetAction {
  return ['duplicate', 'remove', 'repeat-first', 'repeat-every', 'view-first'].includes(value)
}

/** What a palette entry hovering over the sheet shows: where it lands, and why it will move. */
function paletteMarkOf(drag: PaletteDrag | null): DropMark | null {
  const located = drag?.located ?? null
  if (drag === null || located === null || located.lineY === null) return null
  if (located.target.kind === 'order') {
    return { lineY: located.lineY, hint: `${drag.item.label} hier einfügen`, freeSection: null }
  }
  return {
    lineY: located.lineY,
    hint: FLOW_HINT,
    freeSection: located.target.kind === 'free' ? located.target.section : null,
  }
}

/** The four margins as thin dashed lines: where the content may flow, not where elements may sit. */
function MarginGuides({ definition }: { definition: PrintLayoutDefinition }) {
  const { page } = definition
  const line = 'pointer-events-none absolute border-dashed border-sheet-margin'
  const thin = 'calc(var(--sheet-px) * 1)'
  return (
    <>
      <span
        aria-hidden
        className={`${line} inset-y-0`}
        style={{ left: `${page.marginLeft}mm`, borderLeftWidth: thin }}
      />
      <span
        aria-hidden
        className={`${line} inset-y-0`}
        style={{ right: `${page.marginRight}mm`, borderRightWidth: thin }}
      />
      <span
        aria-hidden
        className={`${line} inset-x-0`}
        style={{ top: `${page.marginTop}mm`, borderTopWidth: thin }}
      />
      <span
        aria-hidden
        className={`${line} inset-x-0`}
        style={{ bottom: `${page.marginBottom}mm`, borderBottomWidth: thin }}
      />
    </>
  )
}

/**
 * The QR payment part at the bottom of the last page, locked.
 *
 * <p>Nothing about it can be changed, by SIX, and the sheet says so instead of offering grips
 * that do nothing. It lies under the placed elements on purpose: whatever stands in its way
 * stays reachable and carries a mark that says it will be covered.
 */
function PaymentPart({ url }: { url: string | undefined }) {
  return (
    <div
      data-payment-part
      title={PAYMENT_PART_LOCK}
      className="absolute inset-x-0 bottom-0 z-[2] bg-paper"
      style={{ height: `${PAYMENT_PART_HEIGHT}mm` }}
    >
      {url === undefined ? (
        <div
          className="flex h-full items-center justify-center border-dashed border-sheet-margin font-sans text-[9pt] text-print-muted"
          style={{ borderTopWidth: 'calc(var(--sheet-px) * 1)' }}
        >
          QR-Zahlteil, 210 × 105 mm
        </div>
      ) : (
        <img
          src={url}
          alt="QR-Zahlteil des Beispielbelegs"
          draggable={false}
          style={{ width: '100%', height: '100%', display: 'block' }}
        />
      )}
      <span className="sheet-chrome absolute left-0 top-0 flex w-max origin-top-left items-center gap-1 rounded-br-[var(--radius-sm)] bg-ink px-1.5 py-0.5 text-text-inverse">
        <Lock size={11} aria-hidden />
        QR-Zahlteil · von SIX vorgegeben
      </span>
    </div>
  )
}

/**
 * What a following page shows where the content goes on: nothing to arrange, but the place
 * where it starts — the top margin — and a faded piece of the positions so it reads as a page.
 */
function Continuation({
  definition,
  catalogue,
}: {
  definition: PrintLayoutDefinition
  catalogue: PrintLayoutFields
}) {
  const { page, flow } = definition
  const paper = paperSizeOf(page)
  const contentWidth = contentWidthOf(page)
  const positions = flow.sections.findIndex((section) => section.type === 'POSITIONS')
  return (
    <div
      className="absolute"
      style={{
        left: `${page.marginLeft}mm`,
        top: `${page.marginTop}mm`,
        width: `${contentWidth}mm`,
        height: `${Math.max(paper.height - page.marginTop - page.marginBottom, 0)}mm`,
        zIndex: 1,
      }}
    >
      {positions !== -1 && (
        <div inert className="opacity-40">
          <SheetSection
            objectKey={`continued:${positions}`}
            index={positions}
            count={flow.sections.length}
            section={flow.sections[positions]}
            contentWidth={contentWidth}
            catalogue={catalogue}
            hasVatSummary={false}
            selected={false}
            single={false}
            dropTarget={false}
            barBelow={false}
          />
        </div>
      )}
      <div
        className="sheet-chrome absolute left-1/2 top-[75mm] flex w-max max-w-[22rem] origin-top -translate-x-1/2 flex-col items-center gap-2 rounded-[var(--radius-md)] border border-line bg-surface px-4 py-3 text-center text-body text-text-primary shadow-card"
      >
        <span>
          Hier läuft der Inhalt weiter. Auf Folgeseiten beginnt er am Rand oben; was «auf jeder
          Seite» steht, lässt sich hier verschieben.
        </span>
        <button
          type="button"
          data-action="view-first"
          className="rounded-[var(--radius-sm)] border border-line px-2.5 py-1 text-small font-medium transition-colors hover:bg-sunken"
        >
          Inhalt auf Seite 1 bearbeiten
        </button>
      </div>
    </div>
  )
}
