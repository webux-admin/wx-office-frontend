import { describe, expect, it } from 'vitest'
import {
  addressComplaints,
  emptyAddress,
  toAddressForm,
  toAddressPayload,
} from './addressForm'

// The country comes from the tenant's list through the dropdown, so a filled in address
// carries one just as it does on screen.
const FILLED = {
  ...emptyAddress('Muster AG'),
  street: 'Bahnhofstrasse',
  buildingNumber: '12',
  postalCode: '8001',
  town: 'Zürich',
  country: 'CH',
}

describe('emptyAddress', () => {
  it('emptyAddressTest', () => {
    const form = emptyAddress()

    expect(form.name).toBe('')
    // Left to the dropdown, which fills in the default of the tenant's country list.
    expect(form.country).toBe('')
    expect(form.useAsDefault).toBe(false)
    expect(form.usages).toEqual([])
  })

  it('emptyAddressWithRecipientAndDefaultTest', () => {
    const form = emptyAddress('Muster AG', true)

    expect(form.name).toBe('Muster AG')
    expect(form.useAsDefault).toBe(true)
  })
})

describe('toAddressForm', () => {
  it('toAddressFormTest', () => {
    const form = toAddressForm({
      id: 4,
      label: 'Rechnungsadresse',
      name: 'Muster AG',
      postalCode: '8001',
      town: 'Zürich',
      country: 'CH',
      useAsDefault: true,
      usages: ['INVOICE'],
    })

    expect(form.label).toBe('Rechnungsadresse')
    expect(form.useAsDefault).toBe(true)
    expect(form.usages).toEqual(['INVOICE'])
  })

  it('toAddressFormTurnsMissingFieldsIntoEmptyStringsTest', () => {
    const form = toAddressForm({ name: 'Muster AG', postalCode: '8001', town: 'Zürich' })

    expect(form.street).toBe('')
    expect(form.email).toBe('')
    expect(form.useAsDefault).toBe(false)
    expect(form.usages).toEqual([])
  })

  it('toAddressFormWithoutCountryTest', () => {
    // The backend leaves a field out of its JSON when it is empty; the dropdown then offers
    // the default of the tenant's country list.
    const form = toAddressForm({ name: 'Muster AG', postalCode: '8001', town: 'Zürich' })

    expect(form.country).toBe('')
  })

  it('toAddressFormSurvivesTheRoundTripTest', () => {
    const stored = toAddressPayload({
      ...emptyAddress('Muster AG', true),
      street: 'Bahnhofstrasse',
      buildingNumber: '12',
      postalCode: '8001',
      town: 'Zürich',
      usages: ['INVOICE', 'DUNNING'],
    })

    expect(toAddressPayload(toAddressForm(stored))).toEqual(stored)
  })
})

describe('addressComplaints', () => {
  it('addressComplaintsTest', () => {
    expect(addressComplaints(FILLED)).toEqual({})
  })

  it('addressComplaintsWithoutRecipientTest', () => {
    expect(addressComplaints({ ...FILLED, name: '' }).name).toMatch(/Empfänger/)
  })

  it('addressComplaintsWithoutPostalCodeTest', () => {
    expect(addressComplaints({ ...FILLED, postalCode: '  ' }).postalCode).toMatch(/Postleitzahl/)
  })

  it('addressComplaintsWithoutTownTest', () => {
    expect(addressComplaints({ ...FILLED, town: '' }).town).toMatch(/Ort/)
  })

  it('addressComplaintsOfAnEmptyAddressTest', () => {
    expect(Object.keys(addressComplaints(emptyAddress())).sort()).toEqual([
      'name',
      'postalCode',
      'town',
    ])
  })
})

describe('toAddressPayload', () => {
  it('toAddressPayloadTest', () => {
    const payload = toAddressPayload(FILLED)

    expect(payload.name).toBe('Muster AG')
    expect(payload.postalCode).toBe('8001')
    expect(payload.town).toBe('Zürich')
    expect(payload.country).toBe('CH')
  })

  it('toAddressPayloadLeavesEmptyFieldsOutTest', () => {
    const payload = toAddressPayload(FILLED)

    expect(payload.label).toBeUndefined()
    expect(payload.email).toBeUndefined()
  })

  it('toAddressPayloadSendsTheCodeAsItWasChosenTest', () => {
    // The code belongs to the tenant's country list and is sent unchanged; upper casing it
    // here would invent a value the list may not carry.
    const payload = toAddressPayload({ ...FILLED, country: 'de', town: '  Basel  ' })

    expect(payload.country).toBe('de')
    expect(payload.town).toBe('Basel')
  })

  it('toAddressPayloadKeepsTheUsagesTest', () => {
    const payload = toAddressPayload({ ...FILLED, usages: ['INVOICE', 'DUNNING'] })

    expect(payload.usages).toEqual(['INVOICE', 'DUNNING'])
  })
})
