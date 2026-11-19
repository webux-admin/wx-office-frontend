import { describe, expect, it } from 'vitest'
import {
  contactComplaints,
  emptyContact,
  toContactForm,
  toContactPayload,
  withSinglePrimary,
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

describe('contactComplaints', () => {
  it('contactComplaintsTest', () => {
    expect(contactComplaints(FILLED)).toEqual({})
  })

  it('contactComplaintsWithoutLastNameTest', () => {
    expect(contactComplaints(emptyContact()).lastName).toMatch(/Nachnamen/)
  })

  it('contactComplaintsTreatsWhitespaceAsEmptyTest', () => {
    expect(contactComplaints({ ...FILLED, lastName: '   ' }).lastName).toMatch(/Nachnamen/)
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

describe('withSinglePrimary', () => {
  const EVA = { lastName: 'Huber', firstName: 'Eva', isPrimary: true }
  const MAX = { lastName: 'Meier', firstName: 'Max', isPrimary: false }
  const LEA = { lastName: 'Keller', firstName: 'Lea', isPrimary: true }

  it('withSinglePrimaryTest', () => {
    expect(withSinglePrimary([EVA, MAX, LEA], 2).map((contact) => contact.isPrimary)).toEqual([
      false,
      false,
      true,
    ])
  })

  it('withSinglePrimaryOfOneContactTest', () => {
    expect(withSinglePrimary([LEA], 0)).toEqual([LEA])
  })

  it('withSinglePrimaryOfNoContactTest', () => {
    expect(withSinglePrimary([], 0)).toEqual([])
  })
})
