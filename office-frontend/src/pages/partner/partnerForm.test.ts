import { describe, expect, it } from 'vitest'
import { emptyPartner, firstComplaint, toForm, toPayload } from './partnerForm'
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

describe('firstComplaint', () => {
  it('firstComplaintTest', () => {
    expect(firstComplaint(COMPANY, CUSTOMER)).toBeNull()
    expect(firstComplaint(PERSON, CUSTOMER)).toBeNull()
  })

  it('firstComplaintWithoutNameTest', () => {
    expect(firstComplaint(EMPTY_PARTNER, CUSTOMER)).toMatch(/Namen/)
    expect(firstComplaint({ ...COMPANY, name: '   ' }, CUSTOMER)).toMatch(/Namen/)
  })

  it('firstComplaintWithoutLegalFormTest', () => {
    // The backend refuses a company without one, in English. Asking here keeps the message
    // German and points at the field.
    expect(firstComplaint({ ...COMPANY, legalForm: '' }, CUSTOMER)).toMatch(/Rechtsform/)
  })

  it('firstComplaintAsksNoLegalFormOfAPersonTest', () => {
    expect(firstComplaint({ ...PERSON, legalForm: '' }, CUSTOMER)).toBeNull()
  })

  it('firstComplaintWithoutLastNameOfAPersonTest', () => {
    // A person is printed as given plus family name, so the family name is what is needed.
    expect(firstComplaint({ ...PERSON, lastName: '  ' }, CUSTOMER)).toMatch(/Nachnamen/)
  })

  it('firstComplaintWithoutLanguageTest', () => {
    // The backend refuses a partner without one; asking here names the field in German.
    expect(firstComplaint({ ...COMPANY, language: '' }, CUSTOMER)).toMatch(/Sprache/)
  })

  it('firstComplaintWithoutRoleTest', () => {
    const complaint = firstComplaint(
      { ...COMPANY, isCustomer: false, isSupplier: false },
      CUSTOMER,
    )

    expect(complaint).toMatch(/Kunde, Lieferant oder beides/)
  })

  it('firstComplaintReportsTheMissingNameFirstTest', () => {
    // Both are wrong; the name is the one the user has to fix first.
    const complaint = firstComplaint(
      { ...EMPTY_PARTNER, isCustomer: false, isSupplier: false },
      CUSTOMER,
    )

    expect(complaint).toMatch(/Namen/)
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

describe('firstComplaint wording', () => {
  it('firstComplaintNamesTheRoleOfTheMaskTest', () => {
    expect(firstComplaint(emptyPartner('customer'), CUSTOMER)).toMatch(/Kunde/)
    expect(firstComplaint(emptyPartner('supplier'), SUPPLIER)).toMatch(/Lieferant/)
  })

  it('firstComplaintNeverSaysPartnerTest', () => {
    // The word the backend uses must not reach the screen.
    for (const wording of [CUSTOMER, SUPPLIER]) {
      expect(firstComplaint(emptyPartner('customer'), wording)).not.toMatch(/Partner/)
    }
  })
})
