import { useEffect, type ReactNode } from 'react'
import { SelectField } from '../components/SelectField'
import { defaultCodeOf, selectOptions, type SelectableEntry } from '../lib/masterData'

type CodeSelectProps = {
  label: string
  /** The values as the API returned them, in the order the tenant put them in. */
  entries: readonly SelectableEntry[]
  /** The code the record carries, an empty string when nothing is chosen. */
  value: string
  onChange: (code: string) => void
  /** Label of a stored value the list no longer offers, taken from the record. */
  storedLabel?: string | null
  /**
   * Text of the option standing for "nothing chosen". Leaving it out makes the field one
   * that always carries a value, and lets the tenant default fill an empty one.
   */
  emptyLabel?: string
  disabled?: boolean
  hint?: ReactNode
  invalid?: boolean
  className?: string
}

/**
 * A dropdown over values that belong to the tenant.
 *
 * <p>Where the field must carry a value, an empty one is filled with what the tenant marked
 * as its default — that is what the mark is for, and it saves the person entering a company
 * from picking the same country every time. Nothing is filled in where the field may stay
 * empty, or where the mask is read-only: a value nobody chose must not appear on a record
 * somebody is only looking at.
 */
export function CodeSelect({
  label,
  entries,
  value,
  onChange,
  storedLabel,
  emptyLabel,
  disabled = false,
  hint,
  invalid = false,
  className,
}: CodeSelectProps) {
  const options = selectOptions(entries, value, storedLabel)
  const fallback = emptyLabel === undefined ? defaultCodeOf(entries) : ''

  useEffect(() => {
    if (disabled || value !== '' || fallback === '') return
    onChange(fallback)
  }, [disabled, fallback, onChange, value])

  return (
    <SelectField
      label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      hint={hint}
      invalid={invalid}
      className={className}
    >
      {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </SelectField>
  )
}
