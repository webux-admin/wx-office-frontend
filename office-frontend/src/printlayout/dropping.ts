import type { PrintLayoutDefinition } from '../lib/types'
import type { DropTarget } from './commands'
import {
  containsPoint,
  insertionIndexAt,
  insertionLineAt,
  type Point,
} from './geometry'
import { flowRegionOf, paperSizeOf, type PageView } from './paper'

/** Where a stacked section sits on the sheet, in millimetres from the top of the paper. */
export type SectionSpan = { top: number; bottom: number }

/** What a drop at some spot of the sheet would do. */
export type Located = {
  /** The spot on the paper, in millimetres from its top left corner. */
  point: Point
  /** Where an element lands, or the place in the order a section is put at. */
  target: DropTarget | { kind: 'order'; index: number }
  /** The height at which the insertion bar is drawn, or `null` when nothing is inserted. */
  lineY: number | null
}

/**
 * Works out what dropping something at a spot of the sheet means.
 *
 * <p>This is the rule the whole designer rests on, in one place: a section always goes into
 * the order of the content; an element dropped where the content flows goes into a free
 * section there — the one under the pointer, or a new one between its neighbours — and moves
 * with the content from then on; anywhere else it is fixed on the paper. `fixed` overrides the
 * middle case for somebody who really wants a fixed element across the content.
 *
 * @param input the form, the page shown, where the sections were measured, the spot, what is
 *   dropped, whether placement is forced to «fixed», and how many millimetres at the bottom
 *   the payment part covers
 * @returns the meaning of the drop, or `null` when the spot is off the sheet or nothing of
 *   that kind can be dropped on this page
 */
export function locateDrop(input: {
  definition: PrintLayoutDefinition
  view: PageView
  sections: readonly SectionSpan[]
  point: Point
  what: 'element' | 'section'
  fixed: boolean
  coveredBottom?: number
}): Located | null {
  const { definition, view, sections, point, what, fixed } = input
  const paper = paperSizeOf(definition.page)
  const onSheet = containsPoint({ x: 0, y: 0, width: paper.width, height: paper.height }, point)
  if (!onSheet) return null

  if (what === 'section') {
    // The content is arranged on the first page; a following page only shows where it goes on.
    if (view !== 'first') return null
    const index = insertionIndexAt(sections, point.y)
    return {
      point,
      target: { kind: 'order', index },
      lineY: insertionLineAt(sections, index, definition.flow.top),
    }
  }

  const onPage: Located = { point, target: { kind: 'page', x: point.x, y: point.y }, lineY: null }
  if (view !== 'first' || fixed) return onPage

  const region = flowRegionOf(definition, 'first')
  const covered = input.coveredBottom ?? 0
  const flow = {
    ...region,
    height: Math.max(Math.min(region.height, paper.height - covered - region.y), 0),
  }
  if (!containsPoint(flow, point)) return onPage

  const left = definition.page.marginLeft
  const free = sections.findIndex(
    (span, index) =>
      definition.flow.sections[index]?.type === 'FREE' &&
      point.y >= span.top &&
      point.y <= span.bottom,
  )
  if (free !== -1) {
    return {
      point,
      target: { kind: 'free', section: free, x: point.x - left, y: point.y - sections[free].top },
      lineY: sections[free].top,
    }
  }
  const index = insertionIndexAt(sections, point.y)
  return {
    point,
    target: { kind: 'flow', index, x: point.x - left },
    lineY: insertionLineAt(sections, index, definition.flow.top),
  }
}
