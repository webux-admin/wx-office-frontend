import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { TextField } from '../../components/TextField'
import { useQuickSearch } from '../../components/useQuickSearch'
import {
  SUGGESTION_MINIMUM,
  fetchEntrySuggestions,
  suggestionsKey,
} from '../../lib/accounting'
import { formatDate } from '../../lib/format'
import type { EntrySuggestion } from '../../lib/types'

/**
 * The text field of the entry mask, with what has been posted under a text like this before.
 *
 * <p><b>Operated like the account search of the grid</b> — arrow keys walk the list, Enter
 * picks, Escape closes — so that this mask has one keyboard model and not two. The term is held
 * by `useQuickSearch`, which debounces it: this endpoint fires while somebody is typing, and
 * every keystroke must not be a request.
 *
 * <p><b>The list only ever stands over the settled term.</b> While the debounce is catching up
 * the answer belongs to the term before it, and a list read as the answer to what was just
 * typed is the one thing Enter must not take.
 *
 * <p>Suggestions come from **posted** entries only. The text of a draft is no fact yet, and a
 * typo in an open draft would otherwise be offered forever — while its author is correcting it.
 */
export function EntryTextField({
  tenantId,
  value,
  onChange,
  onPick,
  disabled = false,
}: {
  tenantId: number
  /** What stands in the field. The mask owns it; this component keeps no copy. */
  value: string
  onChange: (next: string) => void
  /**
   * Called when a text was **chosen from the list**, with the accounts of the entry it comes
   * from. Typing the same text by hand never calls it: a suggestion on a merely similar text
   * would be guessing.
   */
  onPick: (suggestion: EntrySuggestion) => void
  disabled?: boolean
}) {
  const { term, setValue } = useQuickSearch(value)
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)

  // The answer belongs to `term`, and `term` lags the field by the debounce. It is worth
  // something only while the two agree — the same reasoning as in the account cell of the grid.
  const settled = term === value.trim()
  const asking = settled && term.length >= SUGGESTION_MINIMUM
  const suggestions = useQuery({
    queryKey: suggestionsKey(tenantId, term),
    queryFn: () => fetchEntrySuggestions(tenantId, term),
    enabled: asking,
  })

  const matches = asking ? (suggestions.data ?? []) : []
  const active = Math.min(highlight, Math.max(0, matches.length - 1))
  const listOpen = open && matches.length > 0
  const listId = 'entry-text-suggestions'
  const optionId = (index: number) => `${listId}-${index}`

  function type(next: string) {
    setHighlight(0)
    setOpen(next.trim() !== '')
    setValue(next)
    onChange(next)
  }

  function pick(suggestion: EntrySuggestion) {
    setValue(suggestion.text)
    setOpen(false)
    onChange(suggestion.text)
    onPick(suggestion)
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape' && open) {
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
      return
    }
    if (!listOpen) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      event.stopPropagation()
      const next = active + (event.key === 'ArrowDown' ? 1 : -1)
      setHighlight(next < 0 ? 0 : Math.min(next, matches.length - 1))
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      pick(matches[active])
    }
  }

  return (
    <span className="relative block">
      <TextField
        label="Text"
        role="combobox"
        // All three follow the list that is actually drawn, never the wish to open one.
        aria-expanded={listOpen}
        aria-autocomplete="list"
        aria-controls={listOpen ? listId : undefined}
        // The focus stays in the field somebody is typing in — a combobox may not move it —
        // so the highlight is handed to the screen reader instead.
        aria-activedescendant={listOpen ? optionId(active) : undefined}
        value={value}
        maxLength={200}
        disabled={disabled}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
        onChange={(event) => type(event.target.value)}
      />
      {listOpen && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Textvorschläge"
          // 62px is the height of a labelled field: the list hangs under the input, not under
          // the label above it.
          className="absolute left-0 top-[62px] z-10 max-h-64 w-full min-w-[280px] overflow-y-auto rounded-[var(--radius-md)] border border-line bg-surface py-1 shadow-lg"
        >
          {matches.map((suggestion, index) => (
            <li
              key={suggestion.text}
              id={optionId(index)}
              role="option"
              aria-selected={index === active}
              // The field keeps the focus, so the click lands as a pick and not as a blur.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pick(suggestion)}
              className={`flex cursor-pointer items-baseline gap-2 px-3 py-1.5 text-[13px] ${
                index === active ? 'bg-accent/12' : 'hover:bg-sunken'
              }`}
            >
              <span className="min-w-0 flex-1 truncate">{suggestion.text}</span>
              <span className="shrink-0 text-[12px] tabular-nums text-text-tertiary">
                {suggestion.useCount}× · {formatDate(suggestion.lastBookedOn)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </span>
  )
}
