import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'
import type { PrintLayoutDefinition, PrintLayoutFields } from '../../lib/types'
import { labelOfElement, labelOfSection } from '../../printlayout/catalogue'
import { chosenColumnsOf, resizeColumnBoundary } from '../../printlayout/columns'
import {
  positionAnnouncement,
  relocateElement,
  type DropTarget,
  type Snapshot,
} from '../../printlayout/commands'
import {
  containerOf,
  elementAt,
  elementKey,
  elementRectOf,
  freeContentHeightOf,
  freeSectionAt,
  FREE_HEIGHT_MAX,
  FREE_HEIGHT_MIN,
  childKey,
  maxIndentOf,
  MIN_SECTION_WIDTH,
  moveChildToPage,
  moveElement,
  moveSection,
  printsOn,
  refOf,
  resizeElement,
  sectionOffsetOf,
  sectionWidthOf,
  setFlowTop,
  totalsMinWidthOf,
  updateSection,
  type ObjectKey,
  type ObjectRef,
} from '../../printlayout/definition'
import { locateDrop, type Located, type SectionSpan } from '../../printlayout/dropping'
import {
  clampDelta,
  containsPoint,
  insertionIndexAt,
  insertionLineAt,
  MIN_ELEMENT_SIZE,
  resizeRect,
  unionOf,
  type Point,
  type Rect,
  type ResizeHandle,
} from '../../printlayout/geometry'
import { contentWidthOf, flowRegionOf, paperSizeOf, type PageView } from '../../printlayout/paper'
import {
  FREE_STEP,
  GRID_STEP,
  snapMove,
  snapResize,
  snapTargetsOf,
  type Guide,
  type SnapOptions,
  type SnapTargets,
} from '../../printlayout/snapping'
import {
  clamp,
  formatLengthShort,
  PX_PER_MM,
  pxToMm,
  roundLength,
  roundToStep,
} from '../../printlayout/units'
import type { Store } from './store'

/** How far the pointer has to travel before a press becomes a drag, in CSS pixels. */
const DRAG_THRESHOLD = 4

/** Below this many CSS pixels on screen a side is too short to carry a grip in its middle. */
const SMALL_SIDE = 28

/** How near an edge has to come to a line to snap, in CSS pixels on screen. */
const SNAP_DISTANCE = 6

/** Said at the insertion bar while an element hovers over the content. */
export const FLOW_HINT = 'Bewegt sich mit dem Inhalt mit · Umschalttaste: fest auf dem Blatt'

/** The bar and the sentence that show where a drop will land. */
export type DropMark = {
  /** Height of the bar in millimetres from the top of the paper. */
  lineY: number
  hint: string
  /** The free section the drop goes into, which is highlighted instead of a bar between. */
  freeSection: number | null
}

/** What the sheet shows while a drag is under way, and what it will commit on release. */
type SheetPreview = {
  /** Drawn instead of the stored form. */
  shown: Snapshot
  /** Committed when the pointer is released. */
  pending: Snapshot & { announcement?: string }
  /** Alignment lines, in millimetres from the top left corner of the paper. */
  guides: Guide[]
  drop: DropMark | null
}

type MovingItem = {
  key: ObjectKey
  ref: Exclude<ObjectRef, { kind: 'section' }>
  rect: Rect
  frame: Rect
  /** Where the container of the item starts on the paper. */
  origin: Point
}

type PressAction =
  | { type: 'none' }
  | { type: 'move'; items: MovingItem[]; targets: SnapTargets | null }
  | { type: 'resize'; item: MovingItem; handle: ResizeHandle; targets: SnapTargets }
  | { type: 'section-move'; index: number; axis: 'x' | 'y' | null; spans: SectionSpan[] }
  | { type: 'section-edge'; index: number; edge: ResizeHandle }
  | { type: 'flow-top' }
  | { type: 'column'; index: number; boundary: number }

type Press = {
  pointerId: number
  startX: number
  startY: number
  moved: boolean
  /** The form as it was when the press began; every preview is computed from it afresh. */
  base: PrintLayoutDefinition
  action: PressAction
  /** A click on one member of a multi-selection reduces the selection to it on release. */
  reduceTo: ObjectKey | null
}

type GestureOptions = {
  sheetRef: RefObject<HTMLDivElement | null>
  flowRef: RefObject<HTMLDivElement | null>
  definition: PrintLayoutDefinition
  selection: readonly ObjectKey[]
  catalogue: PrintLayoutFields
  view: PageView
  zoom: number
  /** Off, nothing is magnetic: only the half-millimetre grid is left. */
  showGuides: boolean
  /** Millimetres at the bottom of the sheet the payment part covers. */
  coveredBottom: number
  /** Receives the box of whatever is being dragged, for the status line. */
  geometry: Store<Rect | null>
  onSelect: (selection: ObjectKey[]) => void
  onCommit: (outcome: Snapshot & { announcement?: string }) => void
}

/**
 * Everything the pointer does on the sheet: selecting, moving with smart guides, resizing,
 * reordering sections, dragging the start of the content and the borders of columns.
 *
 * <p>One set of handlers on the sheet itself finds what was pressed by its `data-` attributes,
 * so the objects carry no handlers. A drag never touches the stored form: each pointer move
 * computes a preview from the form as it was at the press, and the release commits it as one
 * step — which is why a drag is one undo, and why sixty objects can sit still while one moves.
 *
 * @returns the preview to draw while dragging, the pointer handlers for the sheet, and the two
 *   measuring functions the rest of the designer needs
 */
export function useSheetGestures(options: GestureOptions) {
  const {
    sheetRef,
    flowRef,
    definition,
    selection,
    catalogue,
    view,
    zoom,
    showGuides,
    coveredBottom,
    geometry,
    onSelect,
    onCommit,
  } = options

  const [preview, setPreview] = useState<SheetPreview | null>(null)
  const press = useRef<Press | null>(null)
  // The release reads the preview of the last move, which may not have been rendered yet.
  const latest = useRef<SheetPreview | null>(null)

  /** Screen pixels per millimetre of paper, measured so it is right whatever scaled the sheet. */
  const scale = useCallback((): number => {
    const box = sheetRef.current?.getBoundingClientRect()
    const width = paperSizeOf(definition.page).width
    return box !== undefined && box.width > 0 ? box.width / width : PX_PER_MM * zoom
  }, [sheetRef, definition.page, zoom])

  const toSheet = useCallback(
    (clientX: number, clientY: number): Point => {
      const box = sheetRef.current?.getBoundingClientRect()
      const perMillimetre = scale()
      return {
        x: (clientX - (box?.left ?? 0)) / perMillimetre,
        y: (clientY - (box?.top ?? 0)) / perMillimetre,
      }
    },
    [sheetRef, scale],
  )

  /** Where each section stands on the paper right now, as the browser laid it out. */
  const sectionSpans = useCallback((): SectionSpan[] => {
    const sheet = sheetRef.current?.getBoundingClientRect()
    const flow = flowRef.current
    if (sheet === undefined || flow === null) return []
    const perMillimetre = scale()
    return Array.from(flow.children)
      .filter((node) => node.hasAttribute('data-section'))
      .map((node) => {
        const box = node.getBoundingClientRect()
        return {
          top: (box.top - sheet.top) / perMillimetre,
          bottom: (box.bottom - sheet.top) / perMillimetre,
        }
      })
  }, [sheetRef, flowRef, scale])

  /** How high the browser drew an object, in millimetres; `undefined` where it cannot say. */
  const heightOf = useCallback(
    (key: ObjectKey): number | undefined => {
      const node = sheetRef.current?.querySelector<HTMLElement>(`[data-key="${key}"]`)
      // `offsetHeight` is the height before the sheet is scaled: CSS pixels of real millimetres.
      const pixels = node?.offsetHeight ?? 0
      return pixels > 0 ? roundLength(pxToMm(pixels)) : undefined
    },
    [sheetRef],
  )

  const locate = useCallback(
    (clientX: number, clientY: number, what: 'element' | 'section', fixed: boolean): Located | null =>
      locateDrop({
        definition,
        view,
        sections: sectionSpans(),
        point: toSheet(clientX, clientY),
        what,
        fixed,
        coveredBottom,
      }),
    [definition, view, sectionSpans, toSheet, coveredBottom],
  )

  const finish = useCallback(() => {
    press.current = null
    latest.current = null
    setPreview(null)
    geometry.set(null)
  }, [geometry])

  // Escape gives up a drag and nothing else: taken in the capture phase, before the designer
  // reads the same key as «deselect» or the mask reads it as «leave».
  const dragging = preview !== null
  useEffect(() => {
    if (!dragging) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      finish()
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [dragging, finish])

  function movingItem(key: ObjectKey, spans: SectionSpan[]): MovingItem | null {
    const ref = refOf(key)
    const element = elementAt(definition, key)
    if (ref === null || ref.kind === 'section' || element === undefined) return null
    const container = containerOf(definition, ref)
    return {
      key,
      ref,
      rect: elementRectOf(element, container, heightOf(key)),
      frame: container.frame,
      origin:
        ref.kind === 'child'
          ? {
              x: definition.page.marginLeft,
              y: spans[ref.section]?.top ?? definition.flow.top,
            }
          : { x: 0, y: 0 },
    }
  }

  /** The lines a drag inside one container snaps to: its edges, the margins, its neighbours. */
  function targetsFor(item: MovingItem, moving: readonly ObjectKey[]): SnapTargets {
    if (item.ref.kind === 'child') {
      const section = item.ref.section
      const free = freeSectionAt(definition, section)
      const container = containerOf(definition, item.ref)
      const siblings = (free?.elements ?? [])
        .map((element, index) => ({ element, key: childKey(section, index) }))
        .filter(({ key }) => !moving.includes(key))
        .map(({ element, key }) => elementRectOf(element, container, heightOf(key)))
      return snapTargetsOf(item.frame, {}, siblings)
    }
    const { page, flow } = definition
    const paper = paperSizeOf(page)
    const container = containerOf(definition, item.ref)
    const others = definition.elements
      .map((element, index) => ({ element, key: elementKey(index) }))
      .filter(({ element, key }) => printsOn(element, view) && !moving.includes(key))
      .map(({ element, key }) => elementRectOf(element, container, heightOf(key)))
    return snapTargetsOf(
      item.frame,
      {
        x: [page.marginLeft, paper.width - page.marginRight],
        y: [
          page.marginTop,
          paper.height - page.marginBottom,
          ...(view === 'first' ? [flow.top] : []),
        ],
      },
      others,
    )
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !(event.target instanceof Element)) return
    const target = event.target
    // The buttons of the action bar are ordinary buttons; they get their click.
    if (target.closest('[data-action-bar]') !== null) return

    const begin = (action: PressAction, reduceTo: ObjectKey | null = null) => {
      press.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
        base: definition,
        action,
        reduceTo,
      }
    }

    if (target.closest('[data-flow-top]') !== null) return begin({ type: 'flow-top' })

    const key = target.closest<HTMLElement>('[data-key]')?.dataset.key
    const ref = key === undefined ? null : refOf(key)
    if (key === undefined || ref === null) {
      onSelect([])
      return begin({ type: 'none' })
    }

    const node = target.closest<HTMLElement>('[data-key]')
    const handle = usableHandle(
      handleOf(target.closest<HTMLElement>('[data-handle]')?.dataset.handle),
      node?.getBoundingClientRect(),
    )
    const boundary = target.closest<HTMLElement>('[data-column-boundary]')?.dataset.columnBoundary
    const spans = sectionSpans()

    if (ref.kind === 'section') {
      if (!selection.includes(key) || selection.length > 1) onSelect([key])
      if (boundary !== undefined) {
        return begin({ type: 'column', index: ref.index, boundary: Number(boundary) })
      }
      if (handle !== null) return begin({ type: 'section-edge', index: ref.index, edge: handle })
      return begin({ type: 'section-move', index: ref.index, axis: null, spans })
    }

    const elementsOnly = selection.filter((entry) => refOf(entry)?.kind !== 'section')
    if (event.shiftKey) {
      // Shift adds to the selection or takes away from it, and never starts a drag.
      onSelect(
        elementsOnly.includes(key)
          ? elementsOnly.filter((entry) => entry !== key)
          : [...elementsOnly, key],
      )
      return begin({ type: 'none' })
    }

    const inGroup = elementsOnly.length > 1 && elementsOnly.includes(key)
    if (!selection.includes(key) || elementsOnly.length !== selection.length) onSelect([key])
    const item = movingItem(key, spans)
    if (item === null) return begin({ type: 'none' })

    if (handle !== null && !inGroup) {
      return begin({ type: 'resize', item, handle, targets: targetsFor(item, [key]) })
    }
    const keys = inGroup ? elementsOnly : [key]
    const items = keys
      .map((entry) => movingItem(entry, spans))
      .filter((entry) => entry !== null)
    const together = items.every((entry) => sameContainer(entry.ref, item.ref))
    begin(
      { type: 'move', items, targets: together ? targetsFor(item, keys) : null },
      inGroup ? key : null,
    )
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const current = press.current
    if (current === null || current.action.type === 'none') return
    if (event.pointerId !== current.pointerId) return
    const dxPixels = event.clientX - current.startX
    const dyPixels = event.clientY - current.startY

    if (!current.moved) {
      if (Math.hypot(dxPixels, dyPixels) < DRAG_THRESHOLD) return
      current.moved = true
      // From here on the pointer belongs to the sheet, even when it leaves it.
      sheetRef.current?.setPointerCapture?.(event.pointerId)
      if (current.action.type === 'section-move') {
        const section = current.base.flow.sections[current.action.index]
        // A section has no height to move in: up and down means another place in the order.
        // A free section has no indent either, so every drag of it is a reorder.
        current.action.axis =
          section?.type === 'FREE' || Math.abs(dyPixels) >= Math.abs(dxPixels) ? 'y' : 'x'
      }
    }

    const perMillimetre = scale()
    const snap: SnapOptions = {
      threshold: SNAP_DISTANCE / perMillimetre,
      grid: event.altKey ? FREE_STEP : GRID_STEP,
      magnetic: showGuides && !event.altKey,
    }
    const next = previewOf(current, {
      dx: dxPixels / perMillimetre,
      dy: dyPixels / perMillimetre,
      pointer: toSheet(event.clientX, event.clientY),
      fixed: event.shiftKey,
      snap,
    })
    if (next === null) return
    latest.current = next.preview
    setPreview(next.preview)
    geometry.set(next.geometry)
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const current = press.current
    if (current === null || event.pointerId !== current.pointerId) return
    const result = latest.current
    if (current.moved && result !== null) onCommit(result.pending)
    else if (!current.moved && current.reduceTo !== null) onSelect([current.reduceTo])
    finish()
  }

  function onPointerCancel() {
    finish()
  }

  type Motion = { dx: number; dy: number; pointer: Point; fixed: boolean; snap: SnapOptions }
  type Step = { preview: SheetPreview; geometry: Rect | null }

  function previewOf(current: Press, motion: Motion): Step | null {
    const { action, base } = current
    switch (action.type) {
      case 'move':
        return moveStep(base, action.items, action.targets, motion)
      case 'resize':
        return resizeStep(base, action.item, action.handle, action.targets, motion)
      case 'section-move':
        return action.axis === 'y'
          ? reorderStep(base, action.index, action.spans, motion)
          : indentStep(base, action.index, motion)
      case 'section-edge':
        return edgeStep(base, action.index, action.edge, motion)
      case 'flow-top': {
        const next = setFlowTop(base, roundToStep(base.flow.top + motion.dy, 1))
        return same(next, [...selection], `Der Inhalt beginnt bei ${formatLengthShort(next.flow.top)} mm.`)
      }
      case 'column': {
        const section = base.flow.sections[action.index]
        if (section === undefined || section.type !== 'POSITIONS') return null
        const columns = resizeColumnBoundary(
          chosenColumnsOf(section, catalogue.columns),
          catalogue.columns,
          action.boundary,
          motion.dx,
        )
        return same(
          updateSection(base, action.index, { columns }),
          [...selection],
          'Spaltenbreite geändert.',
        )
      }
      case 'none':
        return null
    }
  }

  function moveStep(
    base: PrintLayoutDefinition,
    items: MovingItem[],
    targets: SnapTargets | null,
    motion: Motion,
  ): Step | null {
    const first = items[0]
    if (first === undefined) return null
    const single = items.length === 1 ? first : null
    const element = single === null ? undefined : elementAt(base, single.key)
    const flow = flowRegionOf(base, 'first')
    const overFlow = view === 'first' && !motion.fixed && containsPoint(flow, motion.pointer)

    // An element dragged out of its free section is fixed on the paper from there on.
    if (single !== null && single.ref.kind === 'child' && !overFlow && element !== undefined) {
      const moved = moveChildToPage(base, single.ref.section, single.ref.index, {
        x: roundToStep(single.origin.x + single.rect.x + motion.dx, motion.snap.grid),
        y: roundToStep(single.origin.y + single.rect.y + motion.dy, motion.snap.grid),
      })
      if (moved !== null) {
        const placed = elementAt(moved.definition, moved.key)
        const name = labelOfElement(element, catalogue)
        return {
          preview: {
            shown: { definition: moved.definition, selection: [moved.key] },
            pending: {
              definition: moved.definition,
              selection: [moved.key],
              announcement: `${name} steht jetzt fest auf dem Blatt.`,
            },
            guides: [],
            drop: null,
          },
          geometry: placed === undefined ? null : { ...single.rect, x: placed.x, y: placed.y },
        }
      }
    }

    let delta = clampDelta(items, motion.dx, motion.dy)
    let guides: Guide[] = []
    const union = unionOf(items.map((item) => item.rect))
    if (targets !== null && union !== null) {
      const snapped = snapMove(
        { ...union, x: union.x + delta.dx, y: union.y + delta.dy },
        targets,
        motion.snap,
      )
      delta = clampDelta(items, snapped.x - union.x, snapped.y - union.y)
      // A guide is only true while the snap it belongs to survived the clamp.
      const kept =
        Math.abs(delta.dx - (snapped.x - union.x)) < 0.005 &&
        Math.abs(delta.dy - (snapped.y - union.y)) < 0.005
      guides = kept
        ? snapped.guides.map((guide) => ({
            axis: guide.axis,
            position: guide.position + (guide.axis === 'x' ? first.origin.x : first.origin.y),
          }))
        : []
    } else {
      delta = {
        dx: roundToStep(delta.dx, motion.snap.grid),
        dy: roundToStep(delta.dy, motion.snap.grid),
      }
    }

    let next = base
    for (const item of items) {
      next = moveElement(next, item.key, { x: item.rect.x + delta.dx, y: item.rect.y + delta.dy })
    }
    const keys = items.map((item) => item.key)
    const moved = { ...first.rect, x: first.rect.x + delta.dx, y: first.rect.y + delta.dy }
    const step: Step = {
      preview: {
        shown: { definition: next, selection: keys },
        pending: {
          definition: next,
          selection: keys,
          announcement:
            element === undefined
              ? `${items.length} Elemente verschoben.`
              : positionAnnouncement(labelOfElement(element, catalogue), moved.x, moved.y),
        },
        guides,
        drop: null,
      },
      geometry: single === null ? null : moved,
    }

    // A page element let go over the content goes into a free section there. The preview
    // keeps it floating where the pointer has it; the bar says where it will land and why.
    const mayFlow =
      single !== null &&
      single.ref.kind === 'element' &&
      element !== undefined &&
      element.type !== 'PAGE_NUMBER' &&
      overFlow
    if (!mayFlow) return step
    const located = locateDrop({
      definition: base,
      view,
      sections: sectionSpans(),
      point: motion.pointer,
      what: 'element',
      fixed: false,
      coveredBottom,
    })
    if (located === null || located.lineY === null) return step
    const left = moved.x - base.page.marginLeft
    const target: DropTarget | null =
      located.target.kind === 'free'
        ? {
            kind: 'free',
            section: located.target.section,
            x: left,
            y: Math.max(moved.y - located.lineY, 0),
          }
        : located.target.kind === 'flow'
          ? { kind: 'flow', index: located.target.index, x: left }
          : null
    if (target === null) return step
    const relocated = relocateElement(
      { definition: base, selection: [] },
      single.key,
      target,
      catalogue,
      single.rect.height,
    )
    if (relocated === null) return step
    return {
      ...step,
      preview: {
        ...step.preview,
        pending: relocated,
        guides: [],
        drop: {
          lineY: located.lineY,
          hint: FLOW_HINT,
          freeSection: target.kind === 'free' ? target.section : null,
        },
      },
    }
  }

  function resizeStep(
    base: PrintLayoutDefinition,
    item: MovingItem,
    handle: ResizeHandle,
    targets: SnapTargets,
    motion: Motion,
  ): Step | null {
    const element = elementAt(base, item.key)
    if (element === undefined) return null
    const raw = resizeRect(item.rect, handle, motion.dx, motion.dy, item.frame)
    const snapped = snapResize(raw, handle, targets, motion.snap)
    const horizontal = handle.includes('e') || handle.includes('w')
    const vertical = handle.includes('n') || handle.includes('s')
    // A snap must not undo the smallest size the drag just enforced.
    const usable =
      (!horizontal || snapped.rect.width >= MIN_ELEMENT_SIZE) &&
      (!vertical || snapped.rect.height >= MIN_ELEMENT_SIZE)
    const rect = usable ? snapped.rect : raw
    const next = resizeElement(base, item.key, rect, { width: horizontal, height: vertical })
    const name = labelOfElement(element, catalogue)
    return {
      preview: {
        shown: { definition: next, selection: [item.key] },
        pending: {
          definition: next,
          selection: [item.key],
          announcement:
            `${name}: ${formatLengthShort(rect.width)} mm breit` +
            (vertical ? `, ${formatLengthShort(rect.height)} mm hoch` : ''),
        },
        guides: (usable ? snapped.guides : []).map((guide) => ({
          axis: guide.axis,
          position: guide.position + (guide.axis === 'x' ? item.origin.x : item.origin.y),
        })),
        drop: null,
      },
      geometry: rect,
    }
  }

  function reorderStep(
    base: PrintLayoutDefinition,
    from: number,
    spans: SectionSpan[],
    motion: Motion,
  ): Step | null {
    const section = base.flow.sections[from]
    if (section === undefined) return null
    const insertion = insertionIndexAt(spans, motion.pointer.y)
    const to = insertion > from ? insertion - 1 : insertion
    const moved = moveSection(base, from, to)
    const name = labelOfSection(section)
    const stays = moved.definition === base
    return {
      preview: {
        // The sections stay where they are while one is carried: a list that reshuffles
        // under the pointer cannot be aimed at.
        shown: { definition: base, selection: [...selection] },
        pending: {
          definition: moved.definition,
          selection: [moved.key],
          announcement: stays
            ? `${name} bleibt an seiner Stelle.`
            : `${name}: jetzt an Stelle ${to + 1} von ${base.flow.sections.length}.`,
        },
        guides: [],
        drop: {
          lineY: insertionLineAt(spans, insertion, base.flow.top),
          hint: stays ? `${name} bleibt hier` : `${name} hierhin verschieben`,
          freeSection: null,
        },
      },
      geometry: null,
    }
  }

  function indentStep(base: PrintLayoutDefinition, index: number, motion: Motion): Step | null {
    const section = base.flow.sections[index]
    if (section === undefined || section.type === 'FREE') return null
    const { page } = base
    const contentWidth = contentWidthOf(page)
    const width = sectionWidthOf(section, contentWidth)
    const most = maxIndentOf(section, contentWidth)
    const wanted = clamp(sectionOffsetOf(section, contentWidth) + motion.dx, 0, most)
    // Three places a section is usually wanted at: left, centred, right. One that runs up to
    // the margin anyway only has the first.
    const narrow = section.type === 'TOTALS' || section.type === 'VAT_SUMMARY'
    const open = section.width === null && !narrow
    const stops = open ? [0] : [0, roundLength((contentWidth - width) / 2), most]
    const stop = motion.snap.magnetic
      ? stops.find((entry) => Math.abs(entry - wanted) <= motion.snap.threshold)
      : undefined
    const x = stop ?? clamp(roundToStep(wanted, motion.snap.grid), 0, most)
    // Totals let go at the right margin belong there: without an indent of their own they
    // stay at it when the paper or the margins change.
    const next = updateSection(base, index, { x: narrow && x === most ? null : x })
    const guide =
      stop === undefined
        ? []
        : [
            {
              axis: 'x' as const,
              position:
                page.marginLeft +
                (stop === 0 ? 0 : stop === most ? contentWidth : contentWidth / 2),
            },
          ]
    return {
      preview: {
        shown: { definition: next, selection: [...selection] },
        pending: {
          definition: next,
          selection: [...selection],
          announcement: `${labelOfSection(section)}: Einzug ${formatLengthShort(x)} mm.`,
        },
        guides: guide,
        drop: null,
      },
      geometry: null,
    }
  }

  function edgeStep(
    base: PrintLayoutDefinition,
    index: number,
    edge: ResizeHandle,
    motion: Motion,
  ): Step | null {
    const section = base.flow.sections[index]
    if (section === undefined) return null
    const name = labelOfSection(section)
    if (section.type === 'FREE') {
      if (edge !== 's') return null
      const height = clamp(
        roundToStep(section.height + motion.dy, GRID_STEP),
        Math.max(FREE_HEIGHT_MIN, Math.ceil(freeContentHeightOf(section))),
        FREE_HEIGHT_MAX,
      )
      return same(
        updateSection(base, index, { height }),
        [...selection],
        `${name}: ${formatLengthShort(height)} mm hoch.`,
      )
    }
    const contentWidth = contentWidthOf(base.page)
    const width = sectionWidthOf(section, contentWidth)
    const fixedWidth = section.type === 'TOTALS' || section.type === 'VAT_SUMMARY'
    const offset = sectionOffsetOf(section, contentWidth)
    // Totals and the VAT summary need room for a label and an amount side by side.
    const least = fixedWidth ? totalsMinWidthOf(section.style.fontSize) : MIN_SECTION_WIDTH
    if (edge === 'e') {
      const most = contentWidth - offset
      const wide = clamp(roundToStep(width + motion.dx, GRID_STEP), least, most)
      // Dragged up to the margin means «up to the margin»: it follows when the paper changes.
      const open = !fixedWidth && Math.abs(wide - most) < 0.01
      // The left edge is pinned while the right one is dragged; totals that stood at the
      // right margin by default would otherwise grow to the left under the pointer.
      return same(
        updateSection(base, index, { x: offset, width: open ? null : wide }),
        [...selection],
        `${name}: ${formatLengthShort(wide)} mm breit.`,
      )
    }
    if (edge === 'w') {
      const right = offset + width
      const x = clamp(roundToStep(offset + motion.dx, GRID_STEP), 0, right - least)
      const open = section.width === null && !fixedWidth
      // Totals whose right edge is on the margin keep standing there by themselves.
      const atMargin = fixedWidth && Math.abs(right - contentWidth) < 0.01
      return same(
        updateSection(base, index, {
          x: atMargin ? null : x,
          width: open ? null : roundLength(right - x),
        }),
        [...selection],
        `${name}: Einzug ${formatLengthShort(x)} mm.`,
      )
    }
    return null
  }

  return {
    preview,
    /** Whether a button is held on the sheet right now; read from an event handler only. */
    pressing: () => press.current !== null,
    locate,
    heightOf,
    sectionSpans,
    toSheet,
    scale,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel },
  }
}

/** A step whose preview is simply the changed form: what is shown is what is committed. */
function same(
  definition: PrintLayoutDefinition,
  selection: ObjectKey[],
  announcement: string,
): { preview: SheetPreview; geometry: Rect | null } {
  return {
    preview: {
      shown: { definition, selection },
      pending: { definition, selection, announcement },
      guides: [],
      drop: null,
    },
    geometry: null,
  }
}

/**
 * Drops a grip that would leave nothing of a small object to move it by.
 *
 * <p>On a line of text a few millimetres high the grips in the middle of the top and bottom
 * edge cover the whole middle of the element. There the press means «move»; the height is
 * still set by the corners and in the inspector.
 */
function usableHandle(handle: ResizeHandle | null, box: DOMRect | undefined): ResizeHandle | null {
  if (handle === null || box === undefined) return handle
  if ((handle === 'n' || handle === 's') && box.height < SMALL_SIDE) return null
  if ((handle === 'e' || handle === 'w') && box.width < SMALL_SIDE) return null
  return handle
}

function handleOf(value: string | undefined): ResizeHandle | null {
  const handles: readonly ResizeHandle[] = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']
  return handles.find((handle) => handle === value) ?? null
}

function sameContainer(first: ObjectRef, second: ObjectRef): boolean {
  if (first.kind === 'child' && second.kind === 'child') return first.section === second.section
  return first.kind === 'element' && second.kind === 'element'
}
