import { useEffect } from 'react'
import { SelectField } from '../components/SelectField'
import type { PrintLayout } from '../lib/types'
import { usePrintLayouts } from './usePrintLayouts'

/** The form every tenant starts with, and the one an empty field falls back to. */
const STANDARD = 'STANDARD'

/**
 * The form a tenant starts with, or the first one it can still choose.
 *
 * @param forms the forms of the tenant, as the API returned them
 * @returns the form to fall back to, `undefined` while the list is still empty
 */
function fallbackLayout(forms: readonly PrintLayout[]): PrintLayout | undefined {
  return forms.find((form) => form.code === STANDARD && form.active)
    ?? forms.find((form) => form.active)
    ?? forms[0]
}

/**
 * A dropdown over the forms the tenant prints on.
 *
 * <p>There is no "nothing chosen": a kind of document always prints on a form, and an empty
 * field fills itself with the tenant's standard one. The entry used to exist and stood next
 * to a real form of nearly the same name, which is exactly the confusion this screen was
 * reworked to remove.
 *
 * <p>Selects by id rather than by code, because the id is what the payload carries and what
 * survives a rename.
 *
 * @param tenantId the tenant, null while none exists yet
 * @param value the id of the chosen form as a string, empty while none is chosen
 * @param onChange called with the id that was picked
 */
export function PrintLayoutSelect({
  tenantId,
  value,
  onChange,
  disabled = false,
}: {
  tenantId: number | null
  value: string
  onChange: (layoutId: string) => void
  disabled?: boolean
}) {
  const layouts = usePrintLayouts(tenantId)
  const forms = layouts.data ?? []
  const fallback = fallbackLayout(forms)

  useEffect(() => {
    if (disabled || value !== '' || fallback === undefined) return
    onChange(`${fallback.id}`)
  }, [disabled, fallback, onChange, value])

  // A retired form stays in the list while a record still carries it: hiding it would show
  // an empty field for a kind of document that prints perfectly well.
  const offered = forms.filter((form) => form.active || `${form.id}` === value)

  return (
    <SelectField
      label="Druckvorlage"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled || layouts.isPending}
      hint={
        layouts.error !== null
          ? 'Die Druckvorlagen konnten nicht geladen werden.'
          : undefined
      }
      invalid={layouts.error !== null}
    >
      {value === '' && <option value="">Wird geladen …</option>}
      {offered.map((form) => (
        <option key={form.id} value={form.id}>
          {form.active ? form.name : `${form.name} (deaktiviert)`}
        </option>
      ))}
    </SelectField>
  )
}
