import { useCallback, useEffect, useState } from 'react'
import { readText } from '../lib/preferences'
import { applyTheme, currentTheme, otherTheme, THEME_KEY, type Theme } from '../lib/theme'

/**
 * The appearance in use, and a way to switch it.
 *
 * <p>Meant to be used once, by the control that offers the switch: the value lives on the
 * document element, not in a context, so nothing else has to subscribe to it.
 *
 * <p>As long as nobody has chosen, the operating system keeps deciding: switching the
 * machine to dark in the evening switches this along with it. The first click ends that and
 * the choice sticks.
 *
 * @returns the current appearance and a toggle
 */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>(() => currentTheme())

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const follow = (event: MediaQueryListEvent) => {
      // An explicit choice outranks the operating system and is not overwritten by it.
      if (readText(THEME_KEY) !== null) return
      const wanted: Theme = event.matches ? 'dark' : 'light'
      document.documentElement.dataset.theme = wanted
      setTheme(wanted)
    }
    query.addEventListener('change', follow)
    return () => query.removeEventListener('change', follow)
  }, [])

  const toggle = useCallback(() => {
    const next = otherTheme(theme)
    applyTheme(next)
    setTheme(next)
  }, [theme])

  return { theme, toggle }
}
