import type { PartnerContact } from '../../lib/types'

/**
 * The contact person part of a mask while it is being filled in.
 *
 * <p>Its own module for the same reason as the address: the dialog adds a contact and edits
 * one, and both have to ask the same questions and send the same payload.
 */
export type ContactForm = {
  salutation: string
  firstName: string
  lastName: string
  jobTitle: string
  email: string
  phone: string
  mobile: string
  language: string
  isPrimary: boolean
}

/**
 * An empty contact person.
 *
 * @param isPrimary whether it should be the person addressed by default
 * @returns the empty mask
 */
export function emptyContact(isPrimary = false): ContactForm {
  return {
    salutation: '',
    firstName: '',
    lastName: '',
    jobTitle: '',
    email: '',
    phone: '',
    mobile: '',
    language: '',
    isPrimary,
  }
}

/**
 * Fills the mask from a stored contact person.
 *
 * <p>`PUT /partners/{id}/contacts/{contactId}` replaces the contact whole, so the dialog has
 * to start from everything that is stored: what it leaves out is gone after the save.
 *
 * @param contact the contact as the API returned it
 * @returns the mask, with every missing field as an empty string
 */
export function toContactForm(contact: PartnerContact): ContactForm {
  return {
    salutation: contact.salutation ?? '',
    firstName: contact.firstName ?? '',
    lastName: contact.lastName ?? '',
    jobTitle: contact.jobTitle ?? '',
    email: contact.email ?? '',
    phone: contact.phone ?? '',
    mobile: contact.mobile ?? '',
    language: contact.language ?? '',
    isPrimary: contact.isPrimary === true,
  }
}

/**
 * Checks what the contact needs before the backend will take it.
 *
 * @param form the filled in contact
 * @returns the German complaint, or `null` when nothing is missing
 */
export function contactComplaint(form: ContactForm): string | null {
  if (form.lastName.trim() === '') return 'Die Kontaktperson braucht einen Nachnamen.'
  return null
}

/**
 * Turns the mask into the payload of the contact endpoints.
 *
 * <p>An empty field is left out rather than sent as an empty string. The language is one of
 * them on purpose: a contact without one follows the language of the record it belongs to.
 *
 * @param form the filled in contact
 * @returns the contact as the API wants it
 */
export function toContactPayload(form: ContactForm): PartnerContact {
  return {
    salutation: blankToUndefined(form.salutation),
    firstName: blankToUndefined(form.firstName),
    lastName: form.lastName.trim(),
    jobTitle: blankToUndefined(form.jobTitle),
    email: blankToUndefined(form.email),
    phone: blankToUndefined(form.phone),
    mobile: blankToUndefined(form.mobile),
    language: blankToUndefined(form.language),
    isPrimary: form.isPrimary,
  }
}

function blankToUndefined(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}
