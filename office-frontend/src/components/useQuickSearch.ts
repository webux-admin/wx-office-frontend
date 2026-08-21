import { useDeferredValue, useState } from 'react'

/**
 * Holds the term a list is narrowed by: what stands in the field, and what the request is
 * built from.
 *
 * <p>Deferred rather than debounced: React keeps the old list on screen while the new one
 * loads instead of blanking the table on every keystroke.
 *
 * <p>Lives beside {@link QuickSearchField} rather than inside it, because the term belongs to
 * the screen: the request, the empty state and the reset of the page number all read it.
 *
 * @returns the value for the field, the trimmed term for the request, and the setter the
 *   field reports a keystroke to
 */
export function useQuickSearch(): {
  value: string
  term: string
  setValue: (next: string) => void
} {
  const [value, setValue] = useState('')
  const term = useDeferredValue(value.trim())
  return { value, term, setValue }
}
