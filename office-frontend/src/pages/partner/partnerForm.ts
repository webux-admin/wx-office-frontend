import { parseDecimal } from '../../lib/format'
import type { Partner, PartnerType } from '../../lib/types'
import type { PartnerRole, RoleWording } from './role'

/**
 * The partner mask while it is being filled in.
 *
 * <p>Every field is a string, because that is what an input holds. Turning them into the
 * types the API expects happens once, on the way out, rather than on every keystroke.
 */
export type PartnerForm = {
  partnerNumber: string
  partnerType: PartnerType
  name: string
  legalForm: string
  uid: string
  commercialRegisterName: string
  salutation: string
  firstName: string
  lastName: string
  language: string
  email: string
  phone: string
  website: string
  paymentTerm: string
  creditLimit: string
  notes: string
  creditorReference: string
  isCustomer: boolean
  isSupplier: boolean
}

/**
 * An empty mask.
 *
 * <p>Starts as a company holding the role of the mask it was opened from. Both roles stay
 * editable: somebody who sells to us and buys from us is one record with two flags, not two
 * records.
 *
 * @param role the mask that is open
 * @returns the empty mask
 */
export function emptyPartner(role: PartnerRole): PartnerForm {
  return { ...EMPTY, isCustomer: role === 'customer', isSupplier: role === 'supplier' }
}

const EMPTY: PartnerForm = {
  partnerNumber: '',
  partnerType: 'ORGANISATION',
  name: '',
  legalForm: '',
  uid: '',
  commercialRegisterName: '',
  salutation: '',
  firstName: '',
  lastName: '',
  // Empty, not 'de': the dropdown fills it with whatever this tenant marked as its default.
  language: '',
  email: '',
  phone: '',
  website: '',
  paymentTerm: '',
  creditLimit: '',
  notes: '',
  creditorReference: '',
  isCustomer: true,
  isSupplier: false,
}

/**
 * Fills the mask from a stored partner.
 *
 * @param partner the partner as the API returned it
 * @returns the mask, with every missing field as an empty string
 */
export function toForm(partner: Partner): PartnerForm {
  return {
    partnerNumber: partner.partnerNumber ?? '',
    partnerType: partner.partnerType,
    name: partner.name ?? '',
    legalForm: partner.legalForm ?? '',
    uid: partner.uid ?? '',
    commercialRegisterName: partner.commercialRegisterName ?? '',
    salutation: partner.salutation ?? '',
    firstName: partner.firstName ?? '',
    lastName: partner.lastName ?? '',
    language: partner.language ?? '',
    email: partner.email ?? '',
    phone: partner.phone ?? '',
    website: partner.website ?? '',
    paymentTerm: partner.paymentTerm ?? '',
    creditLimit: partner.creditLimit?.toString() ?? '',
    notes: partner.notes ?? '',
    creditorReference: partner.creditorReference ?? '',
    isCustomer: partner.isCustomer === true,
    isSupplier: partner.isSupplier === true,
  }
}

/**
 * Turns the mask into the payload of `POST`/`PUT /api/tenants/{id}/partners`.
 *
 * <p>An empty field is left out rather than sent as an empty string: the backend treats
 * absent as "not given", while `""` is a value and would overwrite what is stored. That holds
 * for the number as well, and there it has a consequence worth knowing: an emptied number is
 * absent from the payload, the update keeps the stored one, and the record comes back with the
 * number it had. A number can therefore be replaced but not removed — which is what the mask
 * says at the field.
 *
 * <p>Only the fields of the chosen type are sent. A private person with a UID or a legal form
 * is refused by the domain, and both would be left over from a mask that was switched from a
 * company to a person while it was being filled in.
 *
 * <p>The printed name of a person is composed by the backend from the given and the family
 * name, which is why it is not sent either.
 *
 * <p>Addresses and contacts are not part of it. They have endpoints of their own so that a
 * payload cannot silently drop one that is already there; only the create mask adds them to
 * this payload, because a record has to exist before those endpoints can be used.
 *
 * @param form the filled in mask
 * @returns the partner as the API wants it
 */
export function toPayload(form: PartnerForm): Partial<Partner> {
  const person = form.partnerType === 'PERSON'
  return {
    partnerNumber: blankToUndefined(form.partnerNumber),
    partnerType: form.partnerType,
    name: person ? undefined : form.name.trim(),
    legalForm: person ? undefined : blankToUndefined(form.legalForm),
    uid: person ? undefined : blankToUndefined(form.uid),
    commercialRegisterName: person ? undefined : blankToUndefined(form.commercialRegisterName),
    salutation: person ? blankToUndefined(form.salutation) : undefined,
    firstName: person ? blankToUndefined(form.firstName) : undefined,
    lastName: person ? blankToUndefined(form.lastName) : undefined,
    language: blankToUndefined(form.language),
    email: blankToUndefined(form.email),
    phone: blankToUndefined(form.phone),
    website: blankToUndefined(form.website),
    paymentTerm: blankToUndefined(form.paymentTerm),
    creditLimit: parseDecimal(form.creditLimit) ?? undefined,
    notes: blankToUndefined(form.notes),
    creditorReference: blankToUndefined(form.creditorReference),
    isCustomer: form.isCustomer,
    isSupplier: form.isSupplier,
  }
}

/**
 * Checks what can be checked here, which is little.
 *
 * <p>The rules of the domain (the UID check digit, whether a number is still free) belong
 * to the backend and are answered by it. This only catches what would come back as an English
 * sentence from the domain layer, so the mask can name the field in German instead.
 *
 * @param form the filled in mask
 * @param wording the mask that is open, which decides what the record is called
 * @returns the German complaint, or `null` when nothing is obviously missing
 */
export function firstComplaint(form: PartnerForm, wording: RoleWording): string | null {
  if (form.partnerType === 'PERSON') {
    if (form.lastName.trim() === '') return wording.lastNameMissing
  } else {
    if (form.name.trim() === '') return wording.nameMissing
    if (form.legalForm === '') return 'Eine Firma braucht eine Rechtsform.'
  }
  if (form.language === '') return 'Der Eintrag braucht eine Sprache.'
  if (!form.isCustomer && !form.isSupplier) {
    return 'Ein Eintrag ist Kunde, Lieferant oder beides. Mindestens eines muss gesetzt sein.'
  }
  return null
}

function blankToUndefined(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}
