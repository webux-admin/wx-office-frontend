import type { FieldErrors } from '../../lib/fieldErrors'
import type { AddressUsage, PartnerAddress } from '../../lib/types'

/**
 * The address part of a mask while it is being filled in.
 *
 * <p>Its own module because two screens use it: the dialog that adds an address to a stored
 * record, and the create mask, which has to collect one before the record exists.
 */
export type AddressForm = {
  label: string
  name: string
  addressLine: string
  street: string
  buildingNumber: string
  postalCode: string
  town: string
  country: string
  email: string
  phone: string
  useAsDefault: boolean
  usages: AddressUsage[]
}

/**
 * An empty address.
 *
 * @param name recipient to start from, which for a company is its own name
 * @param useAsDefault whether it should be the fallback address; true for the first one
 * @returns the empty mask
 */
export function emptyAddress(name = '', useAsDefault = false): AddressForm {
  return {
    label: '',
    name,
    addressLine: '',
    street: '',
    buildingNumber: '',
    postalCode: '',
    town: '',
    // Empty, not 'CH': the dropdown fills it with what this tenant marked as its default.
    country: '',
    email: '',
    phone: '',
    useAsDefault,
    usages: [],
  }
}

/**
 * Fills the mask from a stored address.
 *
 * <p>Needed because `PUT /partners/{id}/addresses/{addressId}` replaces the address whole:
 * the dialog has to start from everything that is stored, or the fields it does not show
 * would be cleared by the save.
 *
 * @param address the address as the API returned it
 * @returns the mask, with every missing field as an empty string
 */
export function toAddressForm(address: PartnerAddress): AddressForm {
  return {
    label: address.label ?? '',
    name: address.name ?? '',
    addressLine: address.addressLine ?? '',
    street: address.street ?? '',
    buildingNumber: address.buildingNumber ?? '',
    postalCode: address.postalCode ?? '',
    town: address.town ?? '',
    country: address.country ?? '',
    email: address.email ?? '',
    phone: address.phone ?? '',
    useAsDefault: address.useAsDefault === true,
    usages: address.usages ?? [],
  }
}

/**
 * Checks what the address needs before the backend will take it, field by field.
 *
 * @param form the address part of the mask
 * @returns the German message per field of the address, empty when nothing is missing
 */
export function addressComplaints(form: AddressForm): FieldErrors {
  const complaints: Record<string, string> = {}
  if (form.name.trim() === '') complaints.name = 'Die Adresse braucht einen Empfänger.'
  if (form.postalCode.trim() === '') complaints.postalCode = 'Die Adresse braucht eine Postleitzahl.'
  if (form.town.trim() === '') complaints.town = 'Die Adresse braucht einen Ort.'
  return complaints
}

/**
 * Turns the address part of the mask into the payload of the address endpoints.
 *
 * <p>The same payload serves `POST .../addresses` and `PUT .../addresses/{addressId}`. The
 * id is not part of it: on a create it would be ignored, on an update the path decides.
 *
 * @param form the filled in address
 * @returns the address as the API wants it
 */
export function toAddressPayload(form: AddressForm): PartnerAddress {
  return {
    label: blankToUndefined(form.label),
    name: form.name.trim(),
    addressLine: blankToUndefined(form.addressLine),
    street: blankToUndefined(form.street),
    buildingNumber: blankToUndefined(form.buildingNumber),
    postalCode: form.postalCode.trim(),
    town: form.town.trim(),
    country: blankToUndefined(form.country),
    email: blankToUndefined(form.email),
    phone: blankToUndefined(form.phone),
    useAsDefault: form.useAsDefault,
    usages: form.usages,
  }
}

function blankToUndefined(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}
