import { CheckboxField } from '../../components/CheckboxField'
import { TextField } from '../../components/TextField'
import type { AddressUsage } from '../../lib/types'
import { MasterDataSelect } from '../../masterdata/MasterDataSelect'
import { useCatalogue } from '../../masterdata/useMasterData'
import type { AddressForm } from './addressForm'

/**
 * The fields of one address.
 *
 * <p>Shared by the dialog that adds an address to a stored record and by the create mask,
 * which collects one before the record exists. The same fields have to ask the same
 * questions in the same order in both places.
 */
export function AddressFields({
  tenantId,
  form,
  onChange,
  disabled = false,
  storedCountryLabel,
}: {
  tenantId: number
  form: AddressForm
  onChange: (form: AddressForm) => void
  disabled?: boolean
  /** Label of a country the list no longer offers, taken from the stored address. */
  storedCountryLabel?: string
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

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Bezeichnung"
          value={form.label}
          onChange={(event) => set('label')(event.target.value)}
          disabled={disabled}
          placeholder="Rechnungsadresse"
          maxLength={60}
        />
        <TextField
          label="Empfänger"
          value={form.name}
          onChange={(event) => set('name')(event.target.value)}
          disabled={disabled}
          maxLength={70}
        />
        <TextField
          label="Adresszusatz"
          value={form.addressLine}
          onChange={(event) => set('addressLine')(event.target.value)}
          disabled={disabled}
          placeholder="c/o, Postfach"
          maxLength={70}
          className="sm:col-span-2"
        />
        <TextField
          label="Strasse"
          value={form.street}
          onChange={(event) => set('street')(event.target.value)}
          disabled={disabled}
          maxLength={70}
        />
        <TextField
          label="Nummer"
          value={form.buildingNumber}
          onChange={(event) => set('buildingNumber')(event.target.value)}
          disabled={disabled}
          maxLength={16}
        />
        <TextField
          label="PLZ"
          value={form.postalCode}
          onChange={(event) => set('postalCode')(event.target.value)}
          disabled={disabled}
          maxLength={16}
        />
        <TextField
          label="Ort"
          value={form.town}
          onChange={(event) => set('town')(event.target.value)}
          disabled={disabled}
          maxLength={35}
        />
        <MasterDataSelect
          label="Land"
          tenantId={tenantId}
          list="countries"
          value={form.country}
          storedLabel={storedCountryLabel}
          onChange={set('country')}
          disabled={disabled}
        />
        <TextField
          label="E-Mail"
          type="email"
          value={form.email}
          onChange={(event) => set('email')(event.target.value)}
          disabled={disabled}
          maxLength={255}
        />
        <TextField
          label="Telefon"
          value={form.phone}
          onChange={(event) => set('phone')(event.target.value)}
          disabled={disabled}
          maxLength={30}
          className="sm:col-span-2"
        />
      </div>

      <fieldset className="mt-5">
        <legend className="text-[12px] font-medium text-text-secondary">Verwendung</legend>
        <p className="mt-1 text-[12px] text-text-tertiary">
          Ohne Angabe wird die Standardadresse genommen.
        </p>
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
        label="Als Standardadresse verwenden"
        hint="Wird genommen, wenn für eine Belegart keine eigene Adresse gesetzt ist."
        checked={form.useAsDefault}
        onChange={(event) => onChange({ ...form, useAsDefault: event.target.checked })}
        disabled={disabled}
        className="mt-5"
      />
    </>
  )
}
