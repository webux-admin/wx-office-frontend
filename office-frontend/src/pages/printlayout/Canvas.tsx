import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type Ref,
} from 'react'
import { Tooltip } from '../../components/Tooltip'
import type { PrintLayoutDefinition, PrintLayoutFields } from '../../lib/types'
import type { Snapshot } from '../../printlayout/commands'
import {
  containerOf,
  elementAt,
  elementRectOf,
  refOf,
  sectionAt,
  sectionOffsetOf,
  sectionWidthOf,
  type ObjectKey,
} from '../../printlayout/definition'
import type { Point, Rect } from '../../printlayout/geometry'
import {
  contentWidthOf,
  paperSizeOf,
  PAYMENT_PART_HEIGHT,
  PAYMENT_PART_WIDTH,
  type PageView,
} from '../../printlayout/paper'
import { formatLength, mmToPx } from '../../printlayout/units'
import type { Problem } from '../../printlayout/validation'
import { fitZoom, stepZoom, ZOOM_MAX, ZOOM_MIN } from '../../printlayout/zoom'
import { CanvasToolbar } from './CanvasToolbar'
import { Ruler, RulerPointer } from './Rulers'
import { PAYMENT_PART_LOCK, Sheet, type PaletteDrag, type SheetAction, type SheetHandle } from './Sheet'
import { createStore, useStore, type Store } from './store'

/** Room around the sheet that «Einpassen» keeps free, in rem: rulers, padding, the flow tab. */
const RESERVED_WIDTH_REM = 1.25 + 1.5 + 10
const RESERVED_HEIGHT_REM = 1.25 + 3

/** Scale of the little second sheet that shows the payment part on its own page. */
const THUMBNAIL_ZOOM = 0.2

type CanvasProps = {
  sheet: Ref<SheetHandle>
  definition: PrintLayoutDefinition
  selection: readonly ObjectKey[]
  catalogue: PrintLayoutFields
  problems: readonly Problem[]
  view: PageView
  onViewChange: (view: PageView) => void
  showPaymentPart: boolean
  onShowPaymentPartChange: (shown: boolean) => void
  paymentPartUrl: string | undefined
  paletteDrag: Store<PaletteDrag | null>
  /** The last announcement, shown at the right of the status line and read out. */
  message: string
  messageId: number
  onSelect: (selection: ObjectKey[]) => void
  onCommit: (outcome: Snapshot & { announcement?: string }, mergeKey?: string) => void
  onAction: (action: SheetAction, key: ObjectKey | null) => void
  onOpenPalette?: () => void
  onOpenInspector?: () => void
}

/**
 * The middle of the designer: the toolbar, the sheet between its rulers on the workspace, and
 * the status line.
 *
 * <p>Zoom lives here and nowhere else — it is how the sheet is looked at, not part of the
 * form. Until somebody zooms by hand the sheet stays fitted to the window, also when the
 * window or the paper changes.
 */
export function Canvas({
  sheet,
  definition,
  selection,
  catalogue,
  problems,
  view,
  onViewChange,
  showPaymentPart,
  onShowPaymentPartChange,
  paymentPartUrl,
  paletteDrag,
  message,
  messageId,
  onSelect,
  onCommit,
  onAction,
  onOpenPalette,
  onOpenInspector,
}: CanvasProps) {
  const scroller = useRef<HTMLDivElement>(null)
  const [stores] = useState(() => ({
    pointer: createStore<Point | null>(null),
    geometry: createStore<Rect | null>(null),
  }))
  const [showGuides, setShowGuides] = useState(true)
  /** The room for the sheet in CSS pixels; `null` until the browser has measured it. */
  const [room, setRoom] = useState<{ width: number; height: number } | null>(null)
  /** `null` means «keep the sheet fitted»; a number is a zoom somebody chose. */
  const [chosenZoom, setChosenZoom] = useState<number | null>(null)

  const paper = paperSizeOf(definition.page)
  const zoom = chosenZoom ?? (room === null ? 1 : fitZoom(room, paper))

  useEffect(() => {
    const node = scroller.current
    if (node === null || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
      setRoom({
        width: node.clientWidth - RESERVED_WIDTH_REM * rem,
        height: node.clientHeight - RESERVED_HEIGHT_REM * rem,
      })
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  // Ctrl+wheel zooms the sheet instead of the whole page. The listener is native because
  // React registers wheel handlers as passive, and a passive one cannot stop the browser.
  const zoomNow = useRef(zoom)
  useEffect(() => {
    zoomNow.current = zoom
  }, [zoom])
  useEffect(() => {
    const node = scroller.current
    if (node === null) return
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      setChosenZoom(stepZoom(zoomNow.current, event.deltaY < 0 ? 1 : -1))
    }
    node.addEventListener('wheel', onWheel, { passive: false })
    return () => node.removeEventListener('wheel', onWheel)
  }, [])

  const readout = useMemo(() => readoutOf(definition, selection), [definition, selection])

  function onWorkspacePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    // A press on the table beside the sheet lets go of the selection, like one on empty paper.
    if (event.target instanceof Element && event.target.closest('[data-sheet]') === null) {
      onSelect([])
    }
  }

  const ownPage = showPaymentPart && definition.paymentPart === 'OWN_PAGE' && view === 'first'

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <CanvasToolbar
        view={view}
        onViewChange={onViewChange}
        zoom={zoom}
        fitted={chosenZoom === null}
        onZoomStep={(direction) =>
          setChosenZoom(Math.min(Math.max(stepZoom(zoom, direction), ZOOM_MIN), ZOOM_MAX))
        }
        onFit={() => setChosenZoom(null)}
        showGuides={showGuides}
        onShowGuidesChange={setShowGuides}
        showPaymentPart={showPaymentPart}
        onShowPaymentPartChange={onShowPaymentPartChange}
        onOpenPalette={onOpenPalette}
        onOpenInspector={onOpenInspector}
      />

      <div
        ref={scroller}
        data-canvas
        className="relative min-h-0 flex-1 overflow-auto bg-workspace"
        onPointerDown={onWorkspacePointerDown}
      >
        <div className="mx-auto grid w-max grid-cols-[auto_auto] p-6 pr-40">
          <div className="sticky left-0 top-0 z-[30] size-ruler border-b border-r border-line-subtle bg-surface" />
          <div className="sticky top-0 z-[20] border-b border-line-subtle">
            <Ruler axis="x" length={paper.width} zoom={zoom} />
            <RulerPointer axis="x" zoom={zoom} pointer={stores.pointer} />
          </div>
          <div className="sticky left-0 z-[20] border-r border-line-subtle">
            <Ruler axis="y" length={paper.height} zoom={zoom} />
            <RulerPointer axis="y" zoom={zoom} pointer={stores.pointer} />
          </div>
          <div
            className="relative"
            style={{ width: mmToPx(paper.width, zoom), height: mmToPx(paper.height, zoom) }}
          >
            <Sheet
              ref={sheet}
              definition={definition}
              selection={selection}
              catalogue={catalogue}
              problems={problems}
              view={view}
              zoom={zoom}
              showGuides={showGuides}
              paymentPart={{ shown: showPaymentPart, url: paymentPartUrl }}
              pointer={stores.pointer}
              geometry={stores.geometry}
              paletteDrag={paletteDrag}
              onSelect={onSelect}
              onCommit={onCommit}
              onAction={onAction}
            />
          </div>

          {ownPage && (
            <div className="col-start-2 mt-6 flex items-center gap-3">
              <div
                aria-hidden
                className="relative shrink-0 bg-paper shadow-sheet"
                style={{
                  width: mmToPx(PAYMENT_PART_WIDTH, THUMBNAIL_ZOOM),
                  height: mmToPx(297, THUMBNAIL_ZOOM),
                }}
              >
                <span
                  className="absolute inset-x-0 bottom-0 border-t border-dashed border-sheet-margin"
                  style={{ height: mmToPx(PAYMENT_PART_HEIGHT, THUMBNAIL_ZOOM) }}
                >
                  {paymentPartUrl !== undefined && (
                    <img src={paymentPartUrl} alt="" className="block h-full w-full" />
                  )}
                </span>
              </div>
              <p className="flex max-w-[18rem] items-center gap-1.5 text-small text-text-secondary">
                Der QR-Zahlteil steht auf einer eigenen Seite am Schluss.
                <Tooltip text={PAYMENT_PART_LOCK} label="QR-Zahlteil: nicht änderbar" icon="lock" />
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="flex min-h-8 items-center gap-4 border-t border-line-subtle bg-surface px-3 py-1.5 text-small text-text-secondary">
        <Readout stores={stores} selected={readout} />
        {/* Keyed by the count of announcements, so the same sentence twice is read twice. */}
        <span role="status" aria-live="polite" className="ml-auto min-w-0 truncate text-right">
          <span key={messageId}>{message}</span>
        </span>
      </div>
    </div>
  )
}

/** What the status line says about the selection while nothing is being dragged. */
type SelectedReadout = { text: string } | { rect: Rect; autoHeight: boolean } | null

function readoutOf(
  definition: PrintLayoutDefinition,
  selection: readonly ObjectKey[],
): SelectedReadout {
  if (selection.length === 0) return null
  if (selection.length > 1) return { text: `${selection.length} Elemente gewählt` }
  const key = selection[0]
  const ref = refOf(key)
  const element = elementAt(definition, key)
  if (element !== undefined && ref !== null) {
    return {
      rect: elementRectOf(element, containerOf(definition, ref)),
      autoHeight: element.height === null,
    }
  }
  const section = sectionAt(definition, key)
  if (section === undefined) return null
  if (section.type === 'FREE') return { text: `Höhe ${formatLength(section.height)} mm` }
  const contentWidth = contentWidthOf(definition.page)
  const indent = sectionOffsetOf(section, contentWidth)
  const width = sectionWidthOf(section, contentWidth)
  return { text: `Einzug ${formatLength(indent)} mm · Breite ${formatLength(width)} mm` }
}

/**
 * The numbers at the left of the status line: the box being dragged, else the selected one,
 * else where the pointer is.
 *
 * <p>Subscribed on its own, because two of the three change with every pointer move.
 */
function Readout({
  stores,
  selected,
}: {
  stores: { pointer: Store<Point | null>; geometry: Store<Rect | null> }
  selected: SelectedReadout
}) {
  const live = useStore(stores.geometry)
  const pointer = useStore(stores.pointer)
  const numbers = 'font-mono tabular-nums text-text-primary'

  if (live !== null) return <Box rect={live} autoHeight={live.height === 0} className={numbers} />
  if (selected !== null && 'rect' in selected) {
    return <Box rect={selected.rect} autoHeight={selected.autoHeight} className={numbers} />
  }
  if (selected !== null) return <span>{selected.text}</span>
  if (pointer !== null) {
    return (
      <span>
        Zeiger <span className={numbers}>X {formatLength(pointer.x)} mm</span> ·{' '}
        <span className={numbers}>Y {formatLength(pointer.y)} mm</span>
      </span>
    )
  }
  return <span>Nichts gewählt — die Einstellungen rechts gelten für das Blatt.</span>
}

function Box({
  rect,
  autoHeight,
  className,
}: {
  rect: Rect
  autoHeight: boolean
  className: string
}) {
  return (
    <span className={className}>
      X {formatLength(rect.x)} mm · Y {formatLength(rect.y)} mm · B {formatLength(rect.width)}
      {autoHeight ? '' : ` · H ${formatLength(rect.height)}`}
    </span>
  )
}
