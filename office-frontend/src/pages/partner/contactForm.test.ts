import { describe, expect, it } from 'vitest'
import {
  contactComplaint,
  emptyContact,
  toContactForm,
  toContactPayload,
} from './contactForm'

const FILLED = { ...emptyContact(), firstName: 'Claudia', lastName: 'Rüegg' }

describe('emptyContact', () => {
  it('emptyContactTest', () => {
    const form = emptyContact()

    expect(form.lastName).toBe('')
    expect(form.language).toBe('')
    expect(form.isPrimary).toBe(false)
  })

  it('emptyContactAsMainContactTest', () => {
    expect(emptyContact(true).isPrimary).toBe(true)
  })
})

describe('toContactForm', () => {
  it('toContactFormTest', () => {
    const form = toContactForm({
      id: 3,
      salutation: 'FRAU',
      firstName: 'Claudia',
      lastName: 'Rüegg',
      jobTitle: 'Einkauf',
      isPrimary: true,
    })

    expect(form.salutation).toBe('FRAU')
    expect(form.jobTitle).toBe('Einkauf')
    expect(form.isPrimary).toBe(true)
  })

  it('toContactFormTurnsMissingFieldsIntoEmptyStringsTest', () => {
    const form = toContactForm({ lastName: 'Rüegg' })

    expect(form.firstName).toBe('')
    expect(form.email).toBe('')
    expect(form.isPrimary).toBe(false)
  })
})

describe('contactComplaint', () => {
  it('contactComplaintTest', () => {
    expect(contactComplaint(FILLED)).toBeNull()
  })

  it('contactComplaintWithoutLastNameTest', () => {
    expect(contactComplaint(emptyContact())).toMatch(/Nachnamen/)
  })

  it('contactComplaintTreatsWhitespaceAsEmptyTest', () => {
    expect(contactComplaint({ ...FILLED, lastName: '   ' })).toMatch(/Nachnamen/)
  })
})

describe('toContactPayload', () => {
  it('toContactPayloadTest', () => {
    const payload = toContactPayload({ ...FILLED, jobTitle: 'Einkauf', isPrimary: true })

    expect(payload.lastName).toBe('Rüegg')
    expect(payload.jobTitle).toBe('Einkauf')
    expect(payload.isPrimary).toBe(true)
  })

  it('toContactPayloadLeavesEmptyFieldsOutTest', () => {
    // An empty string is a value; the replacing PUT would store it instead of nothing.
    const payload = toContactPayload(FILLED)

    expect(payload.email).toBeUndefined()
    expect(payload.salutation).toBeUndefined()
    expect(payload.language).toBeUndefined()
  })

  it('toContactPayloadTrimsTest', () => {
    const payload = toContactPayload({ ...FILLED, lastName: '  Rüegg  ', phone: ' 044 ' })

    expect(payload.lastName).toBe('Rüegg')
    expect(payload.phone).toBe('044')
  })
})
