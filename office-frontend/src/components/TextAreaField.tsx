import { useId, useState, type ReactNode, type Ref, type TextareaHTMLAttributes } from 'react'
import { Field, type FieldExtras } from './Field'
import { describedBy } from './fieldDescription'

type TextAreaFieldProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id' | 'required'> &
  FieldExtras & {
    /** React 19 passes a ref through as a plain prop; it lands on the textarea, not the wrapper. */
    ref?: Ref<HTMLTextAreaElement>
    label: string
    invalid?: boolean
    hint?: ReactNode
  }

/** A labelled multi line input, for notes and the free texts of a document. */
export function TextAreaField({
  label,
  invalid = false,
  hint,
  required = false,
  error,
  tooltip,
  locked,
  rows = 4,
  className = '',
  ...rest
}: TextAreaFieldProps) {
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
      <textarea
        id={id}
        rows={rows}
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
        className="w-full resize-y bg-transparent px-3 py-2.5 text-control leading-6 text-text-primary outline-none placeholder:text-text-tertiary"
        {...rest}
      />
    </Field>
  )
}
