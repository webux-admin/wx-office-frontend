import { useCallback, type RefObject } from 'react'
import { dropdownPlacement, remInPixels } from '../lib/dropdownPlacement'

/** The space between field and list, and between list and the edge of the screen, in rem. */
const LIST_GAP_REM = 0.5

/**
 * How high a list wants to be, in rem: eight entries and half of the ninth, so it shows that it
 * goes on before it scrolls, with the frame around (frontend ADR-0088).
 */
const LIST_HEIGHT_REM = 17.5

/**
 * Keeps a list that floats over the page at the field it drops from: under the field, or above
 * it where there is more room, as wide as its framed box.
 *
 * <p>The place is checked once a frame while the list is open and written only when it changed,
 * and at once on every scroll: the field moves with a scrolling dialog, with the entrance of the
 * dialog and when something above it arrives late, and none of that is an event. Written to the
 * element directly, so the place follows the field and not the state of a component. The list
 * sets the room it has as `--lookup-room` (frontend ADR-0088).
 *
 * @param box the element around the field; its input's framed box is what the list drops from
 * @returns the ref callback for the floating list
 */
export function useFloatingList(box: RefObject<HTMLElement | null>) {
  return useCallback(
    (popup: HTMLElement | null) => {
      if (popup === null) return
      let placed = ''
      const place = () => {
        // The framed box around the input, search symbol included, not the input beside it.
        const field = box.current?.querySelector('input')?.parentElement
        if (!field) return
        const rem = remInPixels()
        const placement = dropdownPlacement(
          field.getBoundingClientRect(),
          window.innerHeight,
          LIST_HEIGHT_REM * rem,
          LIST_GAP_REM * rem,
        )
        const key = JSON.stringify(placement)
        if (key === placed) return
        placed = key
        popup.style.left = `${placement.left}px`
        popup.style.width = `${placement.width}px`
        popup.style.top = placement.top === undefined ? '' : `${placement.top}px`
        popup.style.bottom = placement.bottom === undefined ? '' : `${placement.bottom}px`
        popup.style.setProperty('--lookup-room', `${placement.room}px`)
      }
      place()
      let frame = requestAnimationFrame(function follow() {
        place()
        frame = requestAnimationFrame(follow)
      })
      window.addEventListener('scroll', place, true)
      return () => {
        cancelAnimationFrame(frame)
        window.removeEventListener('scroll', place, true)
      }
    },
    [box],
  )
}
