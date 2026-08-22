import { useId, useState, type InputHTMLAttributes, type ReactNode, type Ref } from 'react'
import { Field } from './Field'

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  /** React 19 passes a ref through as a plain prop; it lands on the input, not the wrapper. */
  ref?: Ref<HTMLInputElement>
  label: string
  /** Icon drawn inside the field, on the left. */
  icon?: ReactNode
  /** Control drawn inside the field, on the right, such as a reveal toggle. */
  action?: ReactNode
  /** Marks the field as wrong without claiming a message of its own. */
  invalid?: boolean
  /** Explanation under the field, for example the Caps Lock warning. */
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
  className = '',
  ...rest
}: TextFieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const [focused, setFocused] = useState(false)

  return (
    <Field
      label={label}
      htmlFor={id}
      hint={hint}
      hintId={hintId}
      invalid={invalid}
      focused={focused}
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
        aria-invalid={invalid || undefined}
        aria-describedby={hint ? hintId : undefined}
        onFocus={(event) => {
          setFocused(true)
          rest.onFocus?.(event)
        }}
        onBlur={(event) => {
          setFocused(false)
          rest.onBlur?.(event)
        }}
        className={`h-10 w-full bg-transparent px-3 text-[14px] text-text-primary outline-none placeholder:text-text-tertiary disabled:text-text-secondary ${
          numeric ? 'text-right font-mono tabular-nums' : ''
        }`}
      />

      {action && <span className="pr-1.5">{action}</span>}
    </Field>
  )
}
