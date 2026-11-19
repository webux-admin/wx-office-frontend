import { CheckboxField } from '../../components/CheckboxField'
import { TextField } from '../../components/TextField'
import type { FieldErrors } from '../../lib/fieldErrors'
import type { AddressUsage } from '../../lib/types'
import { MasterDataSelect } from '../../masterdata/MasterDataSelect'
import { useCatalogue } from '../../masterdata/useMasterData'
import type { AddressForm } from './addressForm'

/**
 * The fields of one address.
 *
 * <p>Two sizes. `postal` is street, number, postcode, town and country — what the create mask
 * asks for, where the recipient is the name of the record and the address becomes the default
 * one. `full` adds label, recipient, address line, contact and the usages, for the dialog that
 * keeps the addresses of a stored record. Both put the postal lines in the same order.
 */
export function AddressFields({
  tenantId,
  form,
  onChange,
  disabled = false,
  storedCountryLabel,
  errors = {},
  variant = 'full',
  postalRequired = true,
}: {
  tenantId: number
  form: AddressForm
  onChange: (form: AddressForm) => void
  disabled?: boolean
  /** Label of a country the list no longer offers, taken from the stored address. */
  storedCountryLabel?: string
  /** Messages per field of the address, under the names of the address itself. */
  errors?: FieldErrors
  variant?: 'full' | 'postal'
  /**
   * Whether postcode and town are marked as required. Off on the create mask while the address
   * is still empty: there the whole address may be left out.
   */
  postalRequired?: boolean
}) {
  // The catalogue of this name serves exactly the codes of AddressUsage: it is built from
  // that enum in the backend, so the narrowing holds as long as both names match.
  const usages = useCatalogue(tenantId, 'address-usage') as { code: AddressUsage; name: string }[]
  const set = (field: keyof AddressForm) => (value: string) =>
    onChange({ ...form, [field]: value })

  const toggleUsage = (usage: AddressUsage) =>
    onChange({
      ...form,
      usages: form.usages.includes(usage)
        ? form.usages.filter((entry) => entry !== usage)
        : [...form.usages, usage],
    })

  const full = variant === 'full'

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-4">
        {full && (
          <>
            <TextField
              label="Empfänger"
              value={form.name}
              onChange={(event) => set('name')(event.target.value)}
              disabled={disabled}
              maxLength={70}
              required
              error={errors.name}
              tooltip="So steht der Name im Adressfeld des Belegs."
              className="sm:col-span-2"
            />
            <TextField
              label="Bezeichnung"
              value={form.label}
              onChange={(event) => set('label')(event.target.value)}
              disabled={disabled}
              placeholder="Lager Bern"
              maxLength={60}
              error={errors.label}
              tooltip="Nur zur Unterscheidung in der Adressliste, erscheint auf keinem Beleg."
              className="sm:col-span-2"
            />
            <TextField
              label="Adresszusatz"
              value={form.addressLine}
              onChange={(event) => set('addressLine')(event.target.value)}
              disabled={disabled}
              placeholder="c/o, Postfach"
              maxLength={70}
              className="sm:col-span-4"
            />
          </>
        )}
        <TextField
          label="Strasse"
          value={form.street}
          onChange={(event) => set('street')(event.target.value)}
          disabled={disabled}
          maxLength={70}
          error={errors.street}
          className="sm:col-span-3"
        />
        <TextField
          label="Nummer"
          value={form.buildingNumber}
          onChange={(event) => set('buildingNumber')(event.target.value)}
          disabled={disabled}
          maxLength={16}
          error={errors.buildingNumber}
        />
        <TextField
          label="PLZ"
          value={form.postalCode}
          onChange={(event) => set('postalCode')(event.target.value)}
          disabled={disabled}
          maxLength={16}
          required={postalRequired}
          error={errors.postalCode}
        />
        <TextField
          label="Ort"
          value={form.town}
          onChange={(event) => set('town')(event.target.value)}
          disabled={disabled}
          maxLength={35}
          required={postalRequired}
          error={errors.town}
          className="sm:col-span-2"
        />
        <MasterDataSelect
          label="Land"
          tenantId={tenantId}
          list="countries"
          value={form.country}
          storedLabel={storedCountryLabel}
          onChange={set('country')}
          disabled={disabled}
          error={errors.country}
        />
        {full && (
          <>
            <TextField
              label="E-Mail"
              type="email"
              value={form.email}
              onChange={(event) => set('email')(event.target.value)}
              disabled={disabled}
              maxLength={255}
              error={errors.email}
              className="sm:col-span-2"
            />
            <TextField
              label="Telefon"
              type="tel"
              value={form.phone}
              onChange={(event) => set('phone')(event.target.value)}
              disabled={disabled}
              maxLength={30}
              error={errors.phone}
              className="sm:col-span-2"
            />
          </>
        )}
      </div>

      {full && (
        <>
          <fieldset className="mt-5 border-t border-line-subtle pt-4">
            <legend className="text-small font-medium text-text-secondary">
              Verwendung für Belege
            </legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {usages.map((usage) => (
                <CheckboxField
                  key={usage.code}
                  label={usage.name}
                  checked={form.usages.includes(usage.code)}
                  onChange={() => toggleUsage(usage.code)}
                  disabled={disabled}
                />
              ))}
            </div>
          </fieldset>

          <CheckboxField
            label="Standardadresse"
            tooltip="Gilt für jede Belegart, für die oben keine eigene Adresse angekreuzt ist."
            checked={form.useAsDefault}
            onChange={(event) => onChange({ ...form, useAsDefault: event.target.checked })}
            disabled={disabled}
            className="mt-4"
          />
        </>
      )}
    </>
  )
}
