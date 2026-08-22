import { Search } from 'lucide-react'
import { TextField } from './TextField'

/**
 * The search field above a list.
 *
 * <p>Its value and the term the list is asked for come from `useQuickSearch`; the field only
 * reports what was typed. That keeps the reset of the page number with the screen, which is
 * the only place that knows a list has pages.
 */
export function QuickSearchField({
  value,
  onChange,
  placeholder,
  label = 'Suchen',
  maxLength,
  className = 'min-w-[240px] flex-1',
}: {
  value: string
  onChange: (next: string) => void
  /** What may be typed, for example "Name oder Kundennummer". */
  placeholder?: string
  /** Label of the field, for a list that searches something narrower than everything. */
  label?: string
  /**
   * As wide as the column searched over; nothing longer can match anyway. Without it a
   * pasted page of text travels to the server on every keystroke.
   */
  maxLength?: number
  /** Width in the filter row; the default lets the field take the space that is left. */
  className?: string
}) {
  return (
    <TextField
      label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      icon={<Search size={15} />}
      className={className}
    />
  )
}
