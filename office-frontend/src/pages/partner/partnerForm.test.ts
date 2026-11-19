import { describe, expect, it } from 'vitest'
import {
  displayNameOf,
  emptyPartner,
  partnerComplaints,
  toForm,
  toPayload,
} from './partnerForm'
import { wordingFor } from './role'
import type { Partner } from '../../lib/types'

const CUSTOMER = wordingFor('customer')
const SUPPLIER = wordingFor('supplier')
const EMPTY_PARTNER = emptyPartner('customer')
// The mask starts without a language and the dropdown fills in the default of the tenant, so
// a complete record in these tests carries one.
const COMPLETE = { ...EMPTY_PARTNER, language: 'de' }
const COMPANY = { ...COMPLETE, name: 'Muster AG', legalForm: 'AG' }
const PERSON = { ...COMPLETE, partnerType: 'PERSON' as const, lastName: 'Rüegg' }

const STORED: Partner = {
  id: 7,
  partnerNumber: 'K-0007',
  partnerType: 'ORGANISATION',
  active: true,
  isCustomer: true,
  isSupplier: false,
  name: 'Muster AG',
  legalForm: 'AG',
  uid: 'CHE-123.456.789',
  paymentTerm: '30',
  currency: 'EUR',
  creditLimit: 10000,
}

describe('toForm', () => {
  it('toFormTest', () => {
    const form = toForm(STORED)

    expect(form.name).toBe('Muster AG')
    expect(form.partnerNumber).toBe('K-0007')
    expect(form.paymentTerm).toBe('30')
    expect(form.isCustomer).toBe(true)
  })

  it('toFormTurnsMissingFieldsIntoEmptyStringsTest', () => {
    const form = toForm({ id: 1, partnerType: 'PERSON', name: 'Muster' })

    expect(form.email).toBe('')
    expect(form.partnerNumber).toBe('')
    expect(form.creditLimit).toBe('')
    expect(form.isSupplier).toBe(false)
  })

  it('toFormWithZeroKeepsTheZeroTest', () => {
    // A credit limit of zero means "no credit", which is not the same as no limit.
    const form = toForm({ ...STORED, creditLimit: 0 })

    expect(form.creditLimit).toBe('0')
  })

  it('toFormReadsTheCurrencyTest', () => {
    expect(toForm(STORED).currency).toBe('EUR')
  })

  it('toFormWithoutCurrencyTest', () => {
    // Only a record written before the field existed has none; the dropdown then fills in
    // the default of the tenant.
    expect(toForm({ ...STORED, currency: undefined }).currency).toBe('')
  })

  it('toFormWithoutPaymentTermTest', () => {
    const form = toForm({ ...STORED, paymentTerm: undefined })

    expect(form.paymentTerm).toBe('')
  })
})

describe('toPayload', () => {
  it('toPayloadTest', () => {
    const payload = toPayload({ ...COMPANY, paymentTerm: '30_2_10' })

    expect(payload.name).toBe('Muster AG')
    expect(payload.paymentTerm).toBe('30_2_10')
  })

  it('toPayloadSendsTheCurrencyTest', () => {
    const payload = toPayload({ ...COMPANY, currency: 'EUR' })

    expect(payload.currency).toBe('EUR')
  })

  it('toPayloadLeavesAnEmptyCurrencyOutTest', () => {
    // Absent lets the backend write the currency of the tenant into a new record.
    expect(toPayload(COMPANY).currency).toBeUndefined()
  })

  it('toPayloadSendsTheNumberTest', () => {
    // A number the user typed goes out; an emptied one is absent, and the update then keeps
    // the stored number — it can be replaced, not removed.
    const payload = toPayload({ ...COMPANY, partnerNumber: 'K-0007' })

    expect(payload.partnerNumber).toBe('K-0007')
  })

  it('toPayloadLeavesEmptyFieldsOutTest', () => {
    // An empty string is a value and would overwrite what is stored; absent means untouched.
    const payload = toPayload(COMPANY)

    expect(payload.partnerNumber).toBeUndefined()
    expect(payload.email).toBeUndefined()
    expect(payload.uid).toBeUndefined()
    expect(payload.creditLimit).toBeUndefined()
  })

  it('toPayloadTrimsTest', () => {
    const payload = toPayload({ ...COMPANY, name: '  Muster AG  ', uid: ' CHE-1 ' })

    expect(payload.name).toBe('Muster AG')
    expect(payload.uid).toBe('CHE-1')
  })

  it('toPayloadReadsTheSwissDecimalCommaTest', () => {
    const payload = toPayload({ ...COMPANY, creditLimit: '2500,50' })

    expect(payload.creditLimit).toBe(2500.5)
  })

  it('toPayloadSendsNoCompanyFieldsForAPersonTest', () => {
    // The domain refuses a private person with a UID or a legal form, and both can be left
    // over from a mask that started as a company.
    const payload = toPayload({ ...PERSON, uid: 'CHE-1', legalForm: 'AG', name: 'Muster AG' })

    expect(payload.uid).toBeUndefined()
    expect(payload.legalForm).toBeUndefined()
    expect(payload.commercialRegisterName).toBeUndefined()
  })

  it('toPayloadLetsTheBackendComposeTheNameOfAPersonTest', () => {
    const payload = toPayload({ ...PERSON, firstName: 'Claudia' })

    expect(payload.name).toBeUndefined()
    expect(payload.firstName).toBe('Claudia')
    expect(payload.lastName).toBe('Rüegg')
  })

  it('toPayloadSendsNoPersonFieldsForACompanyTest', () => {
    const payload = toPayload({ ...COMPANY, salutation: 'FRAU', firstName: 'Claudia' })

    expect(payload.salutation).toBeUndefined()
    expect(payload.firstName).toBeUndefined()
    expect(payload.lastName).toBeUndefined()
  })
})

describe('partnerComplaints', () => {
  it('partnerComplaintsTest', () => {
    expect(partnerComplaints(COMPANY, CUSTOMER)).toEqual({})
    expect(partnerComplaints(PERSON, CUSTOMER)).toEqual({})
  })

  it('partnerComplaintsWithoutNameTest', () => {
    expect(partnerComplaints(EMPTY_PARTNER, CUSTOMER).name).toMatch(/Namen/)
    expect(partnerComplaints({ ...COMPANY, name: '   ' }, CUSTOMER).name).toMatch(/Namen/)
  })

  it('partnerComplaintsWithoutLegalFormTest', () => {
    expect(partnerComplaints({ ...COMPANY, legalForm: '' }, CUSTOMER).legalForm).toMatch(
      /Rechtsform/,
    )
  })

  it('partnerComplaintsAsksNoLegalFormOfAPersonTest', () => {
    expect(partnerComplaints({ ...PERSON, legalForm: '' }, CUSTOMER)).toEqual({})
  })

  it('partnerComplaintsWithoutLastNameOfAPersonTest', () => {
    // A person is printed as given plus family name, so the family name is what is needed.
    expect(partnerComplaints({ ...PERSON, lastName: '  ' }, CUSTOMER).lastName).toMatch(
      /Nachnamen/,
    )
  })

  it('partnerComplaintsWithoutLanguageTest', () => {
    expect(partnerComplaints({ ...COMPANY, language: '' }, CUSTOMER).language).toMatch(/Sprache/)
  })

  it('partnerComplaintsWithoutRoleTest', () => {
    const complaints = partnerComplaints(
      { ...COMPANY, isCustomer: false, isSupplier: false },
      CUSTOMER,
    )

    expect(complaints.roles).toMatch(/Kunde, Lieferant oder beides/)
  })

  it('partnerComplaintsReportsEveryFieldTest', () => {
    // Each wrong field gets its own message, so all of them can be fixed in one go.
    const complaints = partnerComplaints(
      { ...EMPTY_PARTNER, isCustomer: false, isSupplier: false },
      CUSTOMER,
    )

    expect(Object.keys(complaints).sort()).toEqual(['language', 'legalForm', 'name', 'roles'])
  })
})

describe('displayNameOf', () => {
  it('displayNameOfTest', () => {
    expect(displayNameOf({ ...COMPANY, name: '  Muster AG ' })).toBe('Muster AG')
  })

  it('displayNameOfAPersonTest', () => {
    expect(displayNameOf({ ...PERSON, firstName: 'Claudia', lastName: 'Meier' })).toBe(
      'Claudia Meier',
    )
  })

  it('displayNameOfAPersonWithoutGivenNameTest', () => {
    expect(displayNameOf({ ...PERSON, firstName: ' ', lastName: 'Meier' })).toBe('Meier')
  })

  it('displayNameOfAnEmptyFormTest', () => {
    expect(displayNameOf(EMPTY_PARTNER)).toBe('')
  })
})

describe('emptyPartner', () => {
  it('emptyPartnerTest', () => {
    const form = emptyPartner('customer')

    expect(form.isCustomer).toBe(true)
    expect(form.isSupplier).toBe(false)
  })

  it('emptyPartnerForTheSupplierMaskTest', () => {
    const form = emptyPartner('supplier')

    expect(form.isSupplier).toBe(true)
    expect(form.isCustomer).toBe(false)
  })

  it('emptyPartnerLeavesTheNumberToTheBackendTest', () => {
    expect(emptyPartner('customer').partnerNumber).toBe('')
  })

  it('emptyPartnerLeavesTheCurrencyToTheDropdownTest', () => {
    expect(emptyPartner('customer').currency).toBe('')
  })

  it('emptyPartnerIsNotSharedBetweenMasksTest', () => {
    // Two masks open at once must not write into the same object.
    const first = emptyPartner('customer')
    first.name = 'Muster AG'

    expect(emptyPartner('customer').name).toBe('')
  })
})

describe('partnerComplaints wording', () => {
  it('partnerComplaintsNamesTheRoleOfTheMaskTest', () => {
    expect(partnerComplaints(emptyPartner('customer'), CUSTOMER).name).toMatch(/Kunde/)
    expect(partnerComplaints(emptyPartner('supplier'), SUPPLIER).name).toMatch(/Lieferant/)
  })

  it('partnerComplaintsNeverSaysPartnerTest', () => {
    // The word the backend uses must not reach the screen.
    for (const wording of [CUSTOMER, SUPPLIER]) {
      const messages = Object.values(partnerComplaints(emptyPartner('customer'), wording))
      for (const message of messages) expect(message).not.toMatch(/Partner/)
    }
  })
})
