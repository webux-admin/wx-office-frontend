import { readText, writeText } from './preferences'

/** The two appearances the application ships. */
export type Theme = 'light' | 'dark'

/** Key under which the choice is remembered. Shared with the bootstrap script in index.html. */
export const THEME_KEY = 'theme'

/**
 * Decides which appearance to show.
 *
 * <p>An explicit choice wins. Without one the operating system decides, so a first visit
 * already looks the way the rest of the machine does.
 *
 * @param stored what was remembered, `null` on a first visit or after an unknown value
 * @param system what the operating system asks for
 * @returns the appearance to render
 */
export function resolveTheme(stored: string | null, system: Theme): Theme {
  return stored === 'light' || stored === 'dark' ? stored : system
}

/**
 * @returns the appearance the operating system asks for
 */
export function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/**
 * @returns the appearance to show right now, without changing anything
 */
export function currentTheme(): Theme {
  return resolveTheme(readText(THEME_KEY), systemTheme())
}

/**
 * Puts an appearance on the document and remembers it.
 *
 * <p>The attribute on the root element is what the token overrides in `index.css` hang on;
 * setting it is all it takes to repaint the whole application.
 *
 * @param theme the appearance to switch to
 */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
  writeText(THEME_KEY, theme)
}

/**
 * @param theme the current appearance
 * @returns the other one
 */
export function otherTheme(theme: Theme): Theme {
  return theme === 'dark' ? 'light' : 'dark'
}
