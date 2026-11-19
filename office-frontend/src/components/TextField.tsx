import { useId, useState, type InputHTMLAttributes, type ReactNode, type Ref } from 'react'
import { Field, type FieldExtras } from './Field'
import { describedBy } from './fieldDescription'

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'required'> &
  FieldExtras & {
    /** React 19 passes a ref through as a plain prop; it lands on the input, not the wrapper. */
    ref?: Ref<HTMLInputElement>
    label: string
    /** Icon drawn inside the field, on the left. */
    icon?: ReactNode
    /** Control drawn inside the field, on the right, such as a reveal toggle. */
    action?: ReactNode
    /** Marks the field as wrong without claiming a message of its own. */
    invalid?: boolean
    /** A line under the field that is not an error, for example the Caps Lock warning. */
    hint?: ReactNode
    /** Right aligns the value, as amounts and quantities are read in a column. */
    numeric?: boolean
  }

/** A labelled text input in the style of the design system. */
export function TextField({
  label,
  icon,
  action,
  invalid = false,
  hint,
  numeric = false,
  required = false,
  error,
  tooltip,
  locked,
  className = '',
  ...rest
}: TextFieldProps) {
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
      {icon && (
        <span className="pointer-events-none pl-3 text-text-tertiary" aria-hidden>
          {icon}
        </span>
      )}

      {/* What the caller passes is spread first, so the two handlers below stay in charge of
          the focus line and call the caller's own afterwards. */}
      <input
        {...rest}
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
        className={`h-control w-full bg-transparent px-3 text-control text-text-primary outline-none placeholder:text-text-tertiary disabled:text-text-secondary ${
          numeric ? 'text-right font-mono tabular-nums' : ''
        }`}
      />

      {action && <span className="pr-1.5">{action}</span>}
    </Field>
  )
}
