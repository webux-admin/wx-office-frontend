import { useCallback, useEffect, useState } from 'react'
import { readFlag, writeFlag } from '../lib/preferences'

/** Below this width the sidebar has no room for labels and stays a rail. */
const WIDE_ENOUGH = '(min-width: 768px)'

const PREFERENCE = 'sidebarCollapsed'

/**
 * Whether the sidebar shows labels, and how to change that.
 *
 * <p>Two things decide it. The person can fold the sidebar away and that choice is
 * remembered; a narrow window folds it regardless, because there is no room. The remembered
 * choice is not overwritten in that case, so widening the window brings the labels back.
 *
 * @returns `collapsed` for rendering, `toggle` for the button, and `locked` when the window
 *          is too narrow to unfold at all
 */
export function useSidebarCollapsed(): {
  collapsed: boolean
  locked: boolean
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

  return { collapsed: preferred || !wideEnough, locked: !wideEnough, toggle }
}
