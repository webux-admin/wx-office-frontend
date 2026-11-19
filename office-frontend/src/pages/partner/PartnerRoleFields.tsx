import { CheckboxField } from '../../components/CheckboxField'
import type { FieldErrors } from '../../lib/fieldErrors'
import type { PartnerForm } from './partnerForm'
import type { RoleWording } from './role'

/**
 * Whether the record is a customer, a supplier or both.
 *
 * <p>The role of the screen comes first: on the customer list that is «Kunde», and the other
 * role is offered as «Auch Lieferant».
 */
export function PartnerRoleFields({
  form,
  set,
  disabled,
  wording,
  errors,
  className,
}: {
  form: PartnerForm
  set: <K extends keyof PartnerForm>(field: K, value: PartnerForm[K]) => void
  disabled: boolean
  wording: RoleWording
  errors: FieldErrors
  className?: string
}) {
  const ownRole = wording.role === 'customer' ? 'isCustomer' : 'isSupplier'
  const otherRole = wording.role === 'customer' ? 'isSupplier' : 'isCustomer'

  return (
    <fieldset className={className}>
      <legend className="text-small font-medium text-text-secondary">Rollen</legend>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <CheckboxField
          label={wording.ownRoleLabel}
          checked={form[ownRole]}
          onChange={(event) => set(ownRole, event.target.checked)}
          disabled={disabled}
          aria-invalid={errors.roles !== undefined || undefined}
        />
        <CheckboxField
          label={wording.otherRoleLabel}
          checked={form[otherRole]}
          onChange={(event) => set(otherRole, event.target.checked)}
          disabled={disabled}
        />
      </div>
      {errors.roles !== undefined && (
        <p className="mt-2 text-small text-danger" aria-live="polite">
          {errors.roles}
        </p>
      )}
    </fieldset>
  )
}
