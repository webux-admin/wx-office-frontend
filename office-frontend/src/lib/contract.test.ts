import { describe, expect, it } from 'vitest'
import {
  BILLING_INTERVAL_LABELS,
  CONTRACT_END_REASON_LABELS,
  CONTRACT_MAX_POSITIONS,
  CONTRACT_MAX_SLA_VALUES,
  SLA_METRIC_LABELS,
  SLA_METRIC_UNITS,
  SLA_UNIT_LABELS,
  SLA_UNIT_RANGES,
  CONTRACT_RIGHTS,
  CONTRACT_STATUS_LABELS,
  CONTRACT_STATUS_TONES,
  agreementChanged,
  contractComplaints,
  contractCustomersUrl,
  contractStatusChangesUrl,
  contractStepUrl,
  contractVersionsUrl,
  contractTerm,
  contractUrl,
  contractsKey,
  contractsUrl,
  emptyContractForm,
  emptyEndingForm,
  emptyPositionForm,
  emptySlaValueForm,
  endingComplaints,
  isAgreementEditable,
  isBillingInterval,
  isContractEndReason,
  isNoticePeriodUnit,
  isSlaMetric,
  isSlaUnit,
  movePosition,
  noticePeriodText,
  positionComplaints,
  resolvedPriceUrl,
  slaValueComplaints,
  slaValueText,
  slaValuesLine,
  toContractForm,
  toContractRequest,
  toPositionForm,
  toSlaValueForm,
  validFromComplaint,
  withPosition,
  withSlaMetric,
  withSlaValue,
  type ContractForm,
  type PositionForm,
  type SlaValueForm,
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

function sla(overrides: Partial<SlaValueForm> = {}): SlaValueForm {
  return { ...emptySlaValueForm(), targetValue: '99.5', description: 'pro Monat', ...overrides }
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
    slaValues: [],
    validFrom: '',
    ...overrides,
  }
}

const STORED: Contract = {
  id: 5,
  contractNumber: 'V-00005',
  title: 'Hosting und Support',
  partnerId: 11,
  customerName: 'Bäckerei Huber AG',
  status: 'DRAFT',
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
  slaValues: [{ metric: 'AVAILABILITY', targetValue: 99.5, unit: 'PERCENT', description: null }],
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
    expect(form.slaValues).toEqual([
      { metric: 'AVAILABILITY', targetValue: '99.5', unit: 'PERCENT', description: '' },
    ])
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
      slaValues: [],
      lockVersion: null,
      validFrom: null,
    })
  })

  it('toContractRequestWithSlaValuesTest', () => {
    const request = toContractRequest(
      filled({
        slaValues: [
          sla({ targetValue: '99,5', description: '  pro Monat  ' }),
          sla({ metric: 'RESPONSE_TIME', targetValue: '4', unit: 'HOURS', description: ' ' }),
        ],
      }),
    )

    expect(request.slaValues).toEqual([
      { metric: 'AVAILABILITY', targetValue: 99.5, unit: 'PERCENT', description: 'pro Monat' },
      { metric: 'RESPONSE_TIME', targetValue: 4, unit: 'HOURS', description: null },
    ])
  })

  it('toContractRequestWithLockAndDayTest', () => {
    const request = toContractRequest(filled({ validFrom: '2028-01-01' }), 4)

    expect(request.lockVersion).toBe(4)
    expect(request.validFrom).toBe('2028-01-01')
    expect(toContractRequest(filled(), 0).lockVersion).toBe(0)
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

  it('contractComplaintsWithTooManySlaValuesTest', () => {
    const fifty = Array.from({ length: CONTRACT_MAX_SLA_VALUES }, () => sla())

    expect(contractComplaints(filled({ slaValues: fifty }))).toEqual({})
    expect(contractComplaints(filled({ slaValues: [...fifty, sla()] })).slaValues).toContain(
      'höchstens 50',
    )
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

  it('contractStatusLabelsTest', () => {
    expect(CONTRACT_STATUS_LABELS).toEqual({ DRAFT: 'Entwurf', ACTIVE: 'Aktiv', ENDED: 'Beendet' })
    expect(Object.keys(CONTRACT_STATUS_TONES)).toEqual(['DRAFT', 'ACTIVE', 'ENDED'])
  })

  it('isContractEndReasonTest', () => {
    expect(Object.keys(CONTRACT_END_REASON_LABELS)).toEqual([
      'TERMINATED_BY_CUSTOMER',
      'TERMINATED_BY_TENANT',
      'MUTUAL_AGREEMENT',
      'TERM_EXPIRED',
      'REPLACED',
    ])
    expect(isContractEndReason('MUTUAL_AGREEMENT')).toBe(true)
    expect(isContractEndReason('')).toBe(false)
    expect(isContractEndReason('ZAHLT_NICHT')).toBe(false)
  })

  it('isAgreementEditableTest', () => {
    expect(isAgreementEditable('DRAFT')).toBe(true)
    expect(isAgreementEditable('ACTIVE')).toBe(true)
    expect(isAgreementEditable('ENDED')).toBe(false)
  })

  it('contractStepUrlTest', () => {
    expect(contractStepUrl(1, 5, 'activate')).toBe('/api/tenants/1/contracts/5/activate')
    expect(contractStepUrl(1, 5, 'end')).toBe('/api/tenants/1/contracts/5/end')
    expect(contractVersionsUrl(1, 5)).toBe('/api/tenants/1/contracts/5/versions')
    expect(contractStatusChangesUrl(1, 5)).toBe('/api/tenants/1/contracts/5/status-changes')
  })

  it('agreementChangedTest', () => {
    const stored = filled({ positions: [position({ positionKey: 'a1', amount: 1000 })] })

    expect(agreementChanged(stored, filled({ ...stored, title: 'Hosting' }))).toBe(true)
    expect(
      agreementChanged(stored, { ...stored, positions: [position({ positionKey: 'a1', unitPrice: '1100' })] }),
    ).toBe(true)
    expect(agreementChanged(stored, { ...stored, positions: [] })).toBe(true)
    expect(agreementChanged(stored, { ...stored, endDate: '2029-12-31' })).toBe(true)
  })

  it('agreementChangedWithSlaValuesTest', () => {
    const stored = filled({ slaValues: [sla()] })

    expect(agreementChanged(stored, { ...stored, slaValues: [sla({ targetValue: '99.9' })] })).toBe(
      true,
    )
    expect(agreementChanged(stored, { ...stored, slaValues: [sla({ unit: 'HOURS' })] })).toBe(true)
    expect(agreementChanged(stored, { ...stored, slaValues: [sla({ description: '' })] })).toBe(true)
    expect(agreementChanged(stored, { ...stored, slaValues: [] })).toBe(true)
    expect(agreementChanged(stored, { ...stored, slaValues: [sla(), sla()] })).toBe(true)
  })

  it('agreementChangedWithTheSameSlaValuesTest', () => {
    const stored = filled({ slaValues: [sla()] })

    // Compared by value, the way the backend compares: 99.5 and 99,50 agree.
    expect(agreementChanged(stored, { ...stored, slaValues: [sla({ targetValue: '99,50' })] })).toBe(
      false,
    )
    expect(
      agreementChanged(stored, { ...stored, slaValues: [sla({ description: ' pro Monat ' })] }),
    ).toBe(false)
  })

  it('agreementChangedWithNoteOrDayOnlyTest', () => {
    const stored = filled({ positions: [position({ positionKey: 'a1', amount: 1000 })] })

    expect(agreementChanged(stored, stored)).toBe(false)
    expect(agreementChanged(stored, { ...stored, note: 'Rückruf', validFrom: '2028-01-01' })).toBe(false)
    // The amount is what the backend worked out, not something the user agreed.
    expect(
      agreementChanged(stored, { ...stored, positions: [{ ...stored.positions[0], amount: null }] }),
    ).toBe(false)
  })

  it('validFromComplaintTest', () => {
    expect(validFromComplaint(filled({ validFrom: '2028-01-01' }))).toBeNull()
    expect(validFromComplaint(filled({ validFrom: '2027-01-01' }))).toBeNull()
    expect(validFromComplaint(filled({ validFrom: '2029-12-31', endDate: '2029-12-31' }))).toBeNull()
  })

  it('validFromComplaintOutsideTheTermTest', () => {
    expect(validFromComplaint(filled())).toBe('Ab welchem Tag gilt die Änderung?')
    expect(validFromComplaint(filled({ validFrom: '2026-12-31' }))).toContain('vor dem Vertragsbeginn')
    expect(validFromComplaint(filled({ validFrom: '2030-01-01', endDate: '2029-12-31' }))).toContain(
      'nach dem Vertragsende',
    )
  })

  it('emptyEndingFormTest', () => {
    expect(emptyEndingForm(STORED)).toEqual({ endedOn: '', reason: '' })
    expect(emptyEndingForm({ ...STORED, endDate: '2029-12-31' })).toEqual({
      endedOn: '2029-12-31',
      reason: '',
    })
  })

  it('endingComplaintsTest', () => {
    expect(endingComplaints(STORED, { endedOn: '2028-06-30', reason: 'TERMINATED_BY_CUSTOMER' })).toEqual({})
    expect(endingComplaints(STORED, { endedOn: '2027-01-01', reason: 'MUTUAL_AGREEMENT' })).toEqual({})
    const fixedTerm = { ...STORED, endDate: '2029-12-31' }
    expect(endingComplaints(fixedTerm, { endedOn: '2029-12-31', reason: 'TERM_EXPIRED' })).toEqual({})
  })

  it('endingComplaintsWithMissingOrWrongValuesTest', () => {
    expect(Object.keys(endingComplaints(STORED, { endedOn: '', reason: '' }))).toEqual([
      'reason',
      'endedOn',
    ])
    expect(endingComplaints(STORED, { endedOn: '2026-12-31', reason: 'REPLACED' }).endedOn).toContain(
      'vor seinem Beginn',
    )
    const fixedTerm = { ...STORED, endDate: '2029-12-31' }
    expect(endingComplaints(fixedTerm, { endedOn: '2030-01-01', reason: 'REPLACED' }).endedOn).toContain(
      'vereinbarte Ende',
    )
    expect(endingComplaints(fixedTerm, { endedOn: '2029-06-30', reason: 'TERM_EXPIRED' }).endedOn).toContain(
      'am vereinbarten Ende',
    )
    expect(endingComplaints(STORED, { endedOn: '2029-06-30', reason: 'TERM_EXPIRED' }).endedOn).toContain(
      'unbefristeter Vertrag',
    )
  })

  // --- service level values ------------------------------------------------------

  it('isSlaMetricAndUnitTest', () => {
    expect(Object.keys(SLA_METRIC_LABELS).every(isSlaMetric)).toBe(true)
    expect(Object.keys(SLA_UNIT_LABELS).every(isSlaUnit)).toBe(true)
    expect(isSlaMetric('CUSTOMER_SATISFACTION')).toBe(false)
    expect(isSlaUnit('SECONDS')).toBe(false)
    expect(isSlaMetric('')).toBe(false)
  })

  it('slaCatalogueTest', () => {
    // Every unit a metric names has a label and a range; every metric has at least one unit.
    for (const units of Object.values(SLA_METRIC_UNITS)) {
      expect(units.length).toBeGreaterThan(0)
      for (const unit of units) expect(SLA_UNIT_RANGES[unit].max).toBeGreaterThan(0)
    }
    expect(SLA_METRIC_UNITS.AVAILABILITY).toEqual(['PERCENT'])
    expect(SLA_UNIT_RANGES.PERCENT).toEqual({ min: 0, max: 100 })
  })

  it('slaValueTextTest', () => {
    expect(
      slaValueText({ metric: 'AVAILABILITY', targetValue: 99.5, unit: 'PERCENT', description: null }),
    ).toBe('Verfügbarkeit 99.5 %')
    expect(
      slaValueText({
        metric: 'RESPONSE_TIME',
        targetValue: 4,
        unit: 'HOURS',
        description: 'Priorität 1',
      }),
    ).toBe('Reaktionszeit 4 Stunden (Priorität 1)')
  })

  it('slaValueTextAtTheEdgesTest', () => {
    expect(slaValueText({ metric: 'RESOLUTION_TIME', targetValue: 1, unit: 'BUSINESS_DAYS' })).toBe(
      'Lösungszeit 1 Arbeitstag',
    )
    expect(
      slaValueText({ metric: 'RECOVERY_POINT_OBJECTIVE', targetValue: 0, unit: 'MINUTES' }),
    ).toBe('Maximaler Datenverlust (RPO) 0 Minuten')
    expect(slaValueText({ metric: 'AVAILABILITY', targetValue: 99.999, unit: 'PERCENT' })).toBe(
      'Verfügbarkeit 99.999 %',
    )
  })

  it('slaValuesLineTest', () => {
    const availability = { metric: 'AVAILABILITY', targetValue: 99.5, unit: 'PERCENT' } as const
    const response = {
      metric: 'RESPONSE_TIME',
      targetValue: 4,
      unit: 'HOURS',
      description: 'Priorität 1',
    } as const

    expect(slaValuesLine([availability, response])).toBe(
      'Verfügbarkeit 99.5 % · Reaktionszeit 4 Stunden',
    )
    expect(slaValuesLine([availability, response, response])).toBe(
      'Verfügbarkeit 99.5 % · Reaktionszeit 4 Stunden · 1 weitere',
    )
  })

  it('slaValuesLineOfNoneTest', () => {
    expect(slaValuesLine([])).toBe('')
  })

  it('emptySlaValueFormTest', () => {
    expect(emptySlaValueForm()).toEqual({
      metric: 'AVAILABILITY',
      targetValue: '',
      unit: 'PERCENT',
      description: '',
    })
  })

  it('toSlaValueFormTest', () => {
    expect(
      toSlaValueForm({ metric: 'SERVICE_HOURS', targetValue: 45, unit: 'HOURS_PER_WEEK', description: 'Mo–Fr' }),
    ).toEqual({ metric: 'SERVICE_HOURS', targetValue: '45', unit: 'HOURS_PER_WEEK', description: 'Mo–Fr' })
    expect(toSlaValueForm({ metric: 'AVAILABILITY', targetValue: 100, unit: 'PERCENT' }).description).toBe('')
  })

  it('withSlaMetricTest', () => {
    const response = sla({ metric: 'RESPONSE_TIME', unit: 'MINUTES', targetValue: '30' })

    // A unit the new metric allows stays; one it does not is replaced by its first.
    expect(withSlaMetric(response, 'RESOLUTION_TIME').unit).toBe('MINUTES')
    expect(withSlaMetric(response, 'AVAILABILITY').unit).toBe('PERCENT')
    expect(withSlaMetric(sla({ unit: '' }), 'SERVICE_HOURS').unit).toBe('HOURS_PER_WEEK')
    expect(withSlaMetric(response, 'AVAILABILITY').targetValue).toBe('30')
  })

  it('withSlaValueTest', () => {
    const values = [sla(), sla({ metric: 'RESPONSE_TIME', unit: 'HOURS', targetValue: '4' })]

    expect(withSlaValue(values, null, sla({ targetValue: '98' }))).toHaveLength(3)
    expect(withSlaValue(values, 1, sla({ targetValue: '98' }))[1].targetValue).toBe('98')
    expect(withSlaValue([], null, sla())).toEqual([sla()])
  })

  it('movePositionOfSlaValuesTest', () => {
    const values = [sla({ targetValue: '1' }), sla({ targetValue: '2' })]

    expect(movePosition(values, 1, -1).map((value) => value.targetValue)).toEqual(['2', '1'])
    expect(movePosition(values, 0, -1).map((value) => value.targetValue)).toEqual(['1', '2'])
  })

  it('slaValueComplaintsTest', () => {
    expect(slaValueComplaints(sla())).toEqual({})
    expect(slaValueComplaints(sla({ metric: 'RESPONSE_TIME', unit: 'HOURS', targetValue: '4' }))).toEqual({})
  })

  it('slaValueComplaintsAtTheBoundsTest', () => {
    expect(slaValueComplaints(sla({ targetValue: '0' }))).toEqual({})
    expect(slaValueComplaints(sla({ targetValue: '100' }))).toEqual({})
    expect(slaValueComplaints(sla({ targetValue: '99.999' }))).toEqual({})
    expect(
      slaValueComplaints(sla({ metric: 'SERVICE_HOURS', unit: 'HOURS_PER_WEEK', targetValue: '168' })),
    ).toEqual({})
    expect(
      slaValueComplaints(sla({ metric: 'RECOVERY_POINT_OBJECTIVE', unit: 'MINUTES', targetValue: '0' })),
    ).toEqual({})
    expect(slaValueComplaints(sla({ description: 'x'.repeat(1000) }))).toEqual({})
  })

  it('slaValueComplaintsOutOfRangeTest', () => {
    expect(slaValueComplaints(sla({ targetValue: '100.001' })).targetValue).toBe(
      'In Prozent liegt ein Zielwert zwischen 0 und 100.',
    )
    expect(slaValueComplaints(sla({ targetValue: '-0.5' })).targetValue).toBe(
      'Der Zielwert darf nicht negativ sein.',
    )
    expect(
      slaValueComplaints(sla({ metric: 'SERVICE_HOURS', unit: 'HOURS_PER_WEEK', targetValue: '0' }))
        .targetValue,
    ).toContain('zwischen 1 und 168')
  })

  it('slaValueComplaintsOfBrokenInputTest', () => {
    expect(slaValueComplaints(sla({ targetValue: '' })).targetValue).toBe(
      'Der Zielwert fehlt oder ist keine Zahl.',
    )
    expect(slaValueComplaints(sla({ targetValue: '99.9995' })).targetValue).toBe(
      'Der Zielwert hat höchstens 3 Nachkommastellen.',
    )
    expect(slaValueComplaints(sla({ unit: 'HOURS' })).unit).toBe(
      'Verfügbarkeit wird nicht in Stunden angegeben.',
    )
    expect(slaValueComplaints(sla({ metric: '', unit: '' }))).toMatchObject({
      metric: 'Eine Kennzahl wählen.',
      unit: 'Eine Einheit wählen.',
    })
    expect(slaValueComplaints(sla({ description: 'x'.repeat(1001) })).description).toBe(
      'Höchstens 1000 Zeichen.',
    )
  })
})
