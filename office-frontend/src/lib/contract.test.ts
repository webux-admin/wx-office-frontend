import { describe, expect, it } from 'vitest'
import {
  BILLING_INTERVAL_LABELS,
  CONTRACT_MAX_POSITIONS,
  CONTRACT_RIGHTS,
  contractComplaints,
  contractCustomersUrl,
  contractTerm,
  contractUrl,
  contractsKey,
  contractsUrl,
  emptyContractForm,
  emptyPositionForm,
  isBillingInterval,
  isNoticePeriodUnit,
  movePosition,
  noticePeriodText,
  positionComplaints,
  resolvedPriceUrl,
  toContractForm,
  toContractRequest,
  toPositionForm,
  withPosition,
  type ContractForm,
  type PositionForm,
} from './contract'
import type { Contract } from './types'

/** Writes a date the way the test can recognise it, without depending on the locale. */
const asIs = (value: string) => `[${value}]`

function position(overrides: Partial<PositionForm> = {}): PositionForm {
  return {
    ...emptyPositionForm('CHF'),
    title: 'Hosting',
    unitPrice: '1000.00',
    ...overrides,
  }
}

function filled(overrides: Partial<ContractForm> = {}): ContractForm {
  return {
    title: 'Hosting und Support',
    partnerId: '11',
    startDate: '2027-01-01',
    endDate: '',
    noticePeriodAmount: '3',
    noticePeriodUnit: 'MONTHS',
    note: '',
    positions: [position()],
    ...overrides,
  }
}

const STORED: Contract = {
  id: 5,
  contractNumber: 'V-00005',
  title: 'Hosting und Support',
  partnerId: 11,
  customerName: 'Bäckerei Huber AG',
  customerTown: 'Bern',
  startDate: '2027-01-01',
  endDate: null,
  noticePeriodAmount: 3,
  noticePeriodUnit: 'MONTHS',
  note: null,
  currency: 'CHF',
  positions: [
    {
      positionKey: 'a1',
      title: 'Hosting',
      productNumber: 'P-100',
      description: null,
      quantity: 1,
      unitPrice: 1000,
      currency: 'CHF',
      priceIncludesVat: false,
      vatCategory: 'STANDARD',
      interval: 'MONTHLY',
      amount: 1000,
    },
  ],
  totals: [{ interval: 'MONTHLY', amount: 1000 }],
}

describe('contract', () => {
  it('contractRightsTest', () => {
    expect(CONTRACT_RIGHTS).toEqual({ read: 'CONTRACT_READ', write: 'CONTRACT_WRITE' })
  })

  it('isBillingIntervalTest', () => {
    expect(Object.keys(BILLING_INTERVAL_LABELS).every(isBillingInterval)).toBe(true)
    expect(isBillingInterval('WEEKLY')).toBe(false)
    expect(isBillingInterval('')).toBe(false)
  })

  it('isNoticePeriodUnitTest', () => {
    expect(isNoticePeriodUnit('MONTHS')).toBe(true)
    expect(isNoticePeriodUnit('YEARS')).toBe(false)
  })

  it('contractUrlsTest', () => {
    expect(contractsUrl(1)).toBe('/api/tenants/1/contracts')
    expect(contractUrl(1, 5)).toBe('/api/tenants/1/contracts/5')
    expect(contractsKey(1)).toEqual(['contracts', 1])
  })

  it('contractCustomersUrlTest', () => {
    expect(contractCustomersUrl(1, 'hu ber')).toBe('/api/tenants/1/contracts/customers?search=hu+ber')
    expect(contractCustomersUrl(1, '')).toBe('/api/tenants/1/contracts/customers')
  })

  it('resolvedPriceUrlTest', () => {
    expect(resolvedPriceUrl(1, 11, 7, 2, '2027-01-01')).toBe(
      '/api/tenants/1/partners/11/products/7/price?quantity=2&dateOfSupply=2027-01-01',
    )
    expect(resolvedPriceUrl(1, 11, 7, 1, '')).toBe(
      '/api/tenants/1/partners/11/products/7/price?quantity=1',
    )
  })

  it('contractTermTest', () => {
    expect(contractTerm('2027-01-01', '2029-12-31', asIs)).toBe('[2027-01-01] – [2029-12-31]')
    expect(contractTerm('2027-01-01', null, asIs)).toBe('ab [2027-01-01], unbefristet')
    expect(contractTerm('2027-01-01', '2027-01-01', asIs)).toBe('[2027-01-01]')
  })

  it('noticePeriodTextTest', () => {
    expect(noticePeriodText(3, 'MONTHS')).toBe('3 Monate')
    expect(noticePeriodText(1, 'WEEKS')).toBe('1 Woche')
    expect(noticePeriodText(30, 'DAYS')).toBe('30 Tage')
    expect(noticePeriodText(null, null)).toBe('keine')
    expect(noticePeriodText(3, null)).toBe('keine')
  })

  it('toContractFormTest', () => {
    const form = toContractForm(STORED)

    expect(form.partnerId).toBe('11')
    expect(form.endDate).toBe('')
    expect(form.noticePeriodAmount).toBe('3')
    expect(form.positions[0]).toEqual({
      positionKey: 'a1',
      title: 'Hosting',
      productNumber: 'P-100',
      description: '',
      quantity: '1',
      unitPrice: '1000',
      currency: 'CHF',
      priceIncludesVat: false,
      vatCategory: 'STANDARD',
      interval: 'MONTHLY',
      amount: 1000,
    })
  })

  it('toContractFormWithoutNoticePeriodTest', () => {
    const form = toContractForm({ ...STORED, noticePeriodAmount: null, noticePeriodUnit: null })

    expect(form.noticePeriodAmount).toBe('')
    expect(form.noticePeriodUnit).toBe('')
  })

  it('toContractRequestTest', () => {
    expect(
      toContractRequest(
        filled({
          note: '  intern  ',
          positions: [
            position({ positionKey: 'a1', productNumber: ' P-100 ', quantity: '2', unitPrice: "1'000,50" }),
            position({ title: ' Support ', description: '  ' }),
          ],
        }),
      ),
    ).toEqual({
      title: 'Hosting und Support',
      partnerId: 11,
      startDate: '2027-01-01',
      endDate: null,
      noticePeriodAmount: 3,
      noticePeriodUnit: 'MONTHS',
      note: 'intern',
      positions: [
        {
          positionKey: 'a1',
          title: 'Hosting',
          productNumber: 'P-100',
          description: null,
          quantity: 2,
          unitPrice: 1000.5,
          currency: 'CHF',
          priceIncludesVat: false,
          vatCategory: 'STANDARD',
          interval: 'MONTHLY',
        },
        {
          positionKey: null,
          title: 'Support',
          productNumber: null,
          description: null,
          quantity: 1,
          unitPrice: 1000,
          currency: 'CHF',
          priceIncludesVat: false,
          vatCategory: 'STANDARD',
          interval: 'MONTHLY',
        },
      ],
    })
  })

  it('toContractRequestWithoutPositionsAndNoticeTest', () => {
    const request = toContractRequest(
      filled({ positions: [], noticePeriodAmount: '', noticePeriodUnit: '', endDate: '2029-12-31' }),
    )

    expect(request.positions).toEqual([])
    expect(request.noticePeriodAmount).toBeNull()
    expect(request.noticePeriodUnit).toBeNull()
    expect(request.endDate).toBe('2029-12-31')
  })

  it('contractComplaintsTest', () => {
    expect(contractComplaints(filled())).toEqual({})
  })

  it('contractComplaintsOfAnEmptyFormTest', () => {
    expect(contractComplaints(emptyContractForm())).toEqual({
      title: 'Ein Vertrag braucht eine Bezeichnung.',
      partnerId: 'Ein Vertrag braucht einen Kunden.',
      startDate: 'Ein Vertrag braucht einen Beginn.',
    })
  })

  it('contractComplaintsWithoutPositionsTest', () => {
    expect(contractComplaints(filled({ positions: [] }))).toEqual({})
  })

  it('contractComplaintsAtTheTermTest', () => {
    expect(contractComplaints(filled({ endDate: '2026-12-31' })).endDate).toBe(
      'Das Ende liegt vor dem Beginn.',
    )
    expect(contractComplaints(filled({ endDate: '2027-01-01' })).endDate).toBeUndefined()
  })

  it('contractComplaintsAtTheNoticePeriodTest', () => {
    expect(contractComplaints(filled({ noticePeriodUnit: '' })).noticePeriodUnit).toBe(
      'Zur Dauer fehlt die Einheit.',
    )
    expect(contractComplaints(filled({ noticePeriodAmount: '' })).noticePeriodAmount).toBe(
      'Zur Einheit fehlt die Dauer.',
    )
    expect(contractComplaints(filled({ noticePeriodAmount: '0' })).noticePeriodAmount).toBeDefined()
    expect(contractComplaints(filled({ noticePeriodAmount: '1000' })).noticePeriodAmount).toBeDefined()
    expect(contractComplaints(filled({ noticePeriodAmount: '1.5' })).noticePeriodAmount).toBeDefined()
    expect(contractComplaints(filled({ noticePeriodAmount: '999' }))).toEqual({})
    expect(contractComplaints(filled({ noticePeriodAmount: '', noticePeriodUnit: '' }))).toEqual({})
  })

  it('contractComplaintsWithTwoCurrenciesTest', () => {
    expect(
      contractComplaints(filled({ positions: [position(), position({ currency: 'EUR' })] })).positions,
    ).toBe('Alle Positionen eines Vertrags lauten auf dieselbe Währung.')
  })

  it('contractComplaintsWithTooManyPositionsTest', () => {
    const many = Array.from({ length: CONTRACT_MAX_POSITIONS + 1 }, () => position())

    expect(contractComplaints(filled({ positions: many })).positions).toBeDefined()
    expect(contractComplaints(filled({ positions: many.slice(1) })).positions).toBeUndefined()
  })

  it('positionComplaintsTest', () => {
    expect(positionComplaints(position())).toEqual({})
  })

  it('positionComplaintsWithFreePositionTest', () => {
    expect(positionComplaints(position({ unitPrice: '0.00' }))).toEqual({})
  })

  it('positionComplaintsWithNegativePriceTest', () => {
    expect(positionComplaints(position({ unitPrice: '-10' })).unitPrice).toBe(
      'Ein Rabatt wird als tieferer Preis vereinbart, nicht negativ.',
    )
  })

  it('positionComplaintsAtTheQuantityTest', () => {
    expect(positionComplaints(position({ quantity: '0' })).quantity).toBe(
      'Die Menge muss grösser als null sein.',
    )
    expect(positionComplaints(position({ quantity: '' })).quantity).toBe(
      'Die Menge fehlt oder ist keine Zahl.',
    )
    expect(positionComplaints(position({ quantity: '0.0001' })).quantity).toBeUndefined()
  })

  it('positionComplaintsAtTheDecimalsTest', () => {
    expect(positionComplaints(position({ unitPrice: '10.00005' })).unitPrice).toBe(
      'Der Einzelpreis hat höchstens 4 Nachkommastellen.',
    )
    expect(positionComplaints(position({ unitPrice: '10,1234' })).unitPrice).toBeUndefined()
    expect(positionComplaints(position({ unitPrice: '10.123400' })).unitPrice).toBeUndefined()
  })

  it('positionComplaintsOfAnEmptyPositionTest', () => {
    expect(
      positionComplaints({ ...emptyPositionForm(), vatCategory: '', interval: '', quantity: '' }),
    ).toEqual({
      title: 'Eine Position braucht eine Bezeichnung.',
      quantity: 'Die Menge fehlt oder ist keine Zahl.',
      unitPrice: 'Der Einzelpreis fehlt oder ist keine Zahl.',
      currency: 'Eine Währung wählen.',
      vatCategory: 'Eine MwSt-Kategorie wählen.',
      interval: 'Ein Intervall wählen.',
    })
  })

  it('positionComplaintsAtTheTextLimitsTest', () => {
    expect(positionComplaints(position({ title: 'x'.repeat(140) })).title).toBeUndefined()
    expect(positionComplaints(position({ title: 'x'.repeat(141) })).title).toBeDefined()
    expect(positionComplaints(position({ productNumber: 'x'.repeat(21) })).productNumber).toBeDefined()
  })

  it('withPositionTest', () => {
    const stored = toContractForm(STORED).positions

    const added = withPosition(stored, null, position({ title: 'Backup', amount: 99 }))

    expect(added).toHaveLength(2)
    // A new position has no amount the backend worked out.
    expect(added[1].amount).toBeNull()
  })

  it('withPositionKeepsTheAmountOfAnUnchangedPositionTest', () => {
    const stored = toContractForm(STORED).positions

    expect(withPosition(stored, 0, { ...stored[0], unitPrice: '1000.00' })[0].amount).toBe(1000)
    expect(withPosition(stored, 0, { ...stored[0], unitPrice: '1100' })[0].amount).toBeNull()
  })

  it('movePositionTest', () => {
    const list = [position({ title: 'A' }), position({ title: 'B' }), position({ title: 'C' })]

    expect(movePosition(list, 1, -1).map((entry) => entry.title)).toEqual(['B', 'A', 'C'])
    expect(movePosition(list, 1, 1).map((entry) => entry.title)).toEqual(['A', 'C', 'B'])
    expect(movePosition(list, 0, -1).map((entry) => entry.title)).toEqual(['A', 'B', 'C'])
    expect(movePosition(list, 2, 1).map((entry) => entry.title)).toEqual(['A', 'B', 'C'])
  })

  it('toPositionFormTest', () => {
    expect(toPositionForm({ ...STORED.positions[0], description: 'Text' }).description).toBe('Text')
  })
})
