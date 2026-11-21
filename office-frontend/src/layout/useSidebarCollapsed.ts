import { useCallback, useEffect, useState } from 'react'
import { readFlag, writeFlag } from '../lib/preferences'

/** Below this width there is no room beside the content: the sidebar becomes a drawer. */
const WIDE_ENOUGH = '(min-width: 768px)'

const PREFERENCE = 'sidebarCollapsed'

/**
 * How the sidebar is shown on this screen.
 *
 * <p>On a wide screen the person can fold the sidebar to a rail, and that choice is remembered.
 * On a narrow screen there is no rail at all: the sidebar is hidden and opens as a drawer over
 * the content. The remembered choice is kept, so widening the window brings it back.
 *
 * @returns `collapsed` for the wide layout, `narrow` for the drawer layout, and `toggle` for the
 *          fold button of the wide layout
 */
export function useSidebarCollapsed(): {
  collapsed: boolean
  narrow: boolean
  toggle: () => void
} {
  const [preferred, setPreferred] = useState(() => readFlag(PREFERENCE, false))
  const [wideEnough, setWideEnough] = useState(
    () => window.matchMedia(WIDE_ENOUGH).matches,
  )

  useEffect(() => {
    const query = window.matchMedia(WIDE_ENOUGH)
    const update = (event: MediaQueryListEvent) => setWideEnough(event.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  // The next value is computed outside the updater: a state updater must be pure, and
  // writing to storage inside one runs twice under StrictMode.
  const toggle = useCallback(() => {
    const next = !preferred
    setPreferred(next)
    writeFlag(PREFERENCE, next)
  }, [preferred])

  return { collapsed: preferred, narrow: !wideEnough, toggle }
}
