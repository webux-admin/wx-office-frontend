import { CheckboxField } from '../../components/CheckboxField'
import { Panel } from '../../components/Panel'
import { TextField } from '../../components/TextField'
import type { ProductFreeFieldDefinition } from '../../lib/types'

type ProductFreeFieldsProps = {
  /** The fields this tenant defined, in the order it arranged them. */
  fields: ProductFreeFieldDefinition[]
  /** What the mask currently holds, by place. */
  values: Record<string, string>
  onChange: (code: string, value: string) => void
  disabled: boolean
}

/**
 * The free fields of a product, drawn the way the tenant defined them.
 *
 * <p>The application keeps fifteen places and knows nothing about them; the caption, the
 * order and the kind of input all come from the definition. A place nobody defined is not
 * drawn, which is why an empty list means this panel says so instead of showing fifteen
 * nameless boxes.
 */
export function ProductFreeFields({
  fields,
  values,
  onChange,
  disabled,
}: ProductFreeFieldsProps) {
  return (
    <Panel title="Freifelder">
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((field) => (
          <FreeFieldInput
            key={field.code}
            field={field}
            value={values[field.code] ?? ''}
            onChange={(value) => onChange(field.code, value)}
            disabled={disabled}
          />
        ))}
      </div>
    </Panel>
  )
}

function FreeFieldInput({
  field,
  value,
  onChange,
  disabled,
}: {
  field: ProductFreeFieldDefinition
  value: string
  onChange: (value: string) => void
  disabled: boolean
}) {
  const label = field.name ?? field.code
  // What the field is for, plus the one thing the caption cannot say: whether the value
  // leaves the house.
  const hint = [field.description, field.printable ? 'Wird auf Belegen gedruckt.' : undefined]
    .filter((part) => part !== undefined)
    .join(' ')

  if (field.type === 'FLAG') {
    return (
      <CheckboxField
        label={label}
        checked={value === 'true'}
        onChange={(event) => onChange(event.target.checked ? 'true' : '')}
        disabled={disabled}
        hint={hint === '' ? undefined : hint}
      />
    )
  }

  if (field.type === 'NUMBER') {
    return (
      <TextField
        label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        inputMode="decimal"
        numeric
        hint={hint === '' ? undefined : hint}
      />
    )
  }

  return (
    <TextField
      label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      maxLength={140}
      hint={hint === '' ? undefined : hint}
    />
  )
}
