import type { Paper } from './paper'
import { clamp, mmToPx } from './units'

/** The range the zoom buttons move in. */
export const ZOOM_MIN = 0.5
export const ZOOM_MAX = 2

/** How small «Einpassen» may make the sheet on a narrow screen, below the manual range. */
export const ZOOM_FIT_MIN = 0.2

/** The stops of the zoom buttons: fine around 100 %, coarser further out. */
export const ZOOM_STOPS: readonly number[] = [0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2]

/**
 * The next zoom stop above or below the current one.
 *
 * @param zoom the current zoom, 1 for 100 %; it need not be a stop itself
 * @param direction 1 to zoom in, -1 to zoom out
 * @returns the neighbouring stop, or the end of the range when there is none
 */
export function stepZoom(zoom: number, direction: 1 | -1): number {
  if (direction === 1) {
    return ZOOM_STOPS.find((stop) => stop > zoom + 0.005) ?? ZOOM_MAX
  }
  return [...ZOOM_STOPS].reverse().find((stop) => stop < zoom - 0.005) ?? ZOOM_MIN
}

/**
 * The zoom at which the whole sheet is visible.
 *
 * @param viewport the room for the sheet on screen, in CSS pixels
 * @param paper the size of the sheet in millimetres
 * @returns the largest zoom that shows the whole sheet, never above 100 % — a small format is
 *   not blown up — and never below what can still be made out; 1 while the room is unknown
 */
export function fitZoom(viewport: { width: number; height: number }, paper: Paper): number {
  if (viewport.width <= 0 || viewport.height <= 0 || paper.width <= 0 || paper.height <= 0) {
    return 1
  }
  const zoom = Math.min(viewport.width / mmToPx(paper.width), viewport.height / mmToPx(paper.height))
  // Rounded down, so the fitted sheet never needs the scrollbar that would shrink its room.
  return clamp(Math.floor(zoom * 100) / 100, ZOOM_FIT_MIN, 1)
}

/**
 * @param zoom the zoom, 1 for 100 %
 * @returns the zoom as it stands in the toolbar, for example `75 %`
 */
export function formatZoom(zoom: number): string {
  return `${Math.round(zoom * 100)} %`
}
