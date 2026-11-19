import { ChevronDown } from 'lucide-react'
import { useId, useState, type ReactNode, type SelectHTMLAttributes } from 'react'
import { Field, type FieldExtras } from './Field'
import { describedBy } from './fieldDescription'

type SelectFieldProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id' | 'required'> &
  FieldExtras & {
    label: string
    invalid?: boolean
    hint?: ReactNode
    children: ReactNode
  }

/**
 * A labelled dropdown.
 *
 * <p>Built on the native `select` on purpose: it is the control every platform already knows
 * how to open with the keyboard, and on a phone it becomes the system picker.
 *
 * <p>Two details the browser decides rather than the stylesheet. The open list is painted from
 * the background of the `select` itself, so that background has to be a real colour. Left
 * transparent, the list comes out light and the light text on it disappears in the dark
 * appearance. And the list is exactly as wide as the `select`, which is why the arrow floats
 * above the field instead of standing next to it: as a sibling it would take width away and
 * the list would end up narrower than the field it belongs to.
 */
export function SelectField({
  label,
  invalid = false,
  hint,
  required = false,
  error,
  tooltip,
  locked,
  className = '',
  children,
  ...rest
}: SelectFieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const tooltipId = `${id}-tooltip`
  const [focused, setFocused] = useState(false)
  const wrong = invalid || error !== undefined

  return (
    <Field
      label={label}
      htmlFor={id}
      hint={hint}
      hintId={hintId}
      tooltipId={tooltipId}
      invalid={invalid}
      focused={focused}
      required={required}
      error={error}
      tooltip={tooltip}
      locked={locked}
      className={className}
    >
      <select
        id={id}
        required={required}
        aria-required={required || undefined}
        aria-invalid={wrong || undefined}
        aria-describedby={describedBy(hintId, tooltipId, { hint, error, tooltip })}
        onFocus={(event) => {
          setFocused(true)
          rest.onFocus?.(event)
        }}
        onBlur={(event) => {
          setFocused(false)
          rest.onBlur?.(event)
        }}
        className="h-control w-full appearance-none bg-surface py-0 pl-3 pr-9 text-control text-text-primary outline-none disabled:text-text-secondary"
        {...rest}
      >
        {children}
      </select>

      <span className="pointer-events-none absolute right-3 text-text-tertiary" aria-hidden>
        <ChevronDown size={15} />
      </span>
    </Field>
  )
}
