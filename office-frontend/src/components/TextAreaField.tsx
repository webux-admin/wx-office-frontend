import { useId, useState, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { Field } from './Field'

type TextAreaFieldProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> & {
  label: string
  invalid?: boolean
  hint?: ReactNode
}

/** A labelled multi line input, for notes and the free texts of a document. */
export function TextAreaField({
  label,
  invalid = false,
  hint,
  rows = 4,
  className = '',
  ...rest
}: TextAreaFieldProps) {
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
      <textarea
        id={id}
        rows={rows}
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
        className="w-full resize-y bg-transparent px-3 py-2.5 text-[14px] leading-6 text-text-primary outline-none placeholder:text-text-tertiary"
        {...rest}
      />
    </Field>
  )
}
