import { useState } from 'react'
import { useDebouncedValue } from './useDebouncedValue'

/**
 * Holds the term a list is narrowed by: what stands in the field, and what the request is
 * built from.
 *
 * <p>Debounced, not deferred. `useDeferredValue` only decides when React renders the new
 * value, never whether a request goes out — with fifty rows the deferred render is done in a
 * few milliseconds, so every keystroke still got its own query key and its own call.
 *
 * <p>Lives beside {@link QuickSearchField} rather than inside it, because the term belongs to
 * the screen: the request, the empty state and the reset of the page number all read it.
 *
 * @param initial what the field starts with, for example a term a link brought along. Read
 *   once — the field takes over from there.
 * @returns the value for the field, the trimmed term for the request, and the setter the
 *   field reports a keystroke to
 */
export function useQuickSearch(initial = ''): {
  value: string
  term: string
  setValue: (next: string) => void
} {
  const [value, setValue] = useState(initial)
  const term = useDebouncedValue(value.trim())
  return { value, term, setValue }
}
