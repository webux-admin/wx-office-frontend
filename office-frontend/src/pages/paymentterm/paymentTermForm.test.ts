import { describe, expect, it } from 'vitest'
import {
  DUE_DATE_BASES,
  EMPTY_TERM,
  describeDiscounts,
  describePeriod,
  termComplaint,
  toTermForm,
  toTermPayload,
  type TermForm,
} from './paymentTermForm'
import type { PaymentTerm } from '../../lib/types'

const STORED: PaymentTerm = {
  id: 4,
  code: '30-2-10',
  name: '30 Tage, 2 % Skonto',
  description: 'Standard für Rechnungen',
  netDays: 30,
  dueDateBasis: 'DOCUMENT_DATE',
  discounts: [{ days: 10, percent: 2 }],
  sortOrder: 1,
  isDefault: true,
  active: true,
}

/** A mask that may be sent, so a test only has to say which field it breaks. */
const COMPLETE: TermForm = {
  ...EMPTY_TERM,
  code: '30-2-10',
  name: '30 Tage, 2 % Skonto',
}

/** A row that is not entered: both fields empty. */
const EMPTY_ROW = { days: '', percent: '' }

describe('toTermForm', () => {
  it('toTermFormTest', () => {
    const form = toTermForm(STORED)

    expect(form.code).toBe('30-2-10')
    expect(form.name).toBe('30 Tage, 2 % Skonto')
    expect(form.description).toBe('Standard für Rechnungen')
    expect(form.netDays).toBe('30')
    expect(form.dueDateBasis).toBe('DOCUMENT_DATE')
    expect(form.discounts).toEqual([{ days: '10', percent: '2' }])
  })

  it('toTermFormTurnsMissingFieldsIntoEmptyStringsTest', () => {
    const form = toTermForm({ id: 1, code: 'SOFORT', name: 'Sofort', netDays: 0 })

    expect(form.description).toBe('')
    expect(form.discounts).toEqual([])
  })

  it('toTermFormWithoutBasisFallsBackToTheDocumentDateTest', () => {
    // The backend leaves the field out for the ordinary case, which is the document date.
    const form = toTermForm({ id: 1, code: 'NET30', name: '30 Tage', netDays: 30 })

    expect(form.dueDateBasis).toBe('DOCUMENT_DATE')
  })

  it('toTermFormWithZeroKeepsTheZeroTest', () => {
    // Zero days means cash on delivery, which is not the same as no period at all.
    const form = toTermForm({ ...STORED, netDays: 0, discounts: [] })

    expect(form.netDays).toBe('0')
  })

  it('toTermFormWithThreeStagesKeepsAllOfThemTest', () => {
    const form = toTermForm({
      ...STORED,
      discounts: [
        { days: 10, percent: 3 },
        { days: 20, percent: 2 },
        { days: 25, percent: 1 },
      ],
    })

    expect(form.discounts).toHaveLength(3)
    expect(form.discounts[2]).toEqual({ days: '25', percent: '1' })
  })
})

describe('toTermPayload', () => {
  it('toTermPayloadTest', () => {
    const payload = toTermPayload(
      { ...COMPLETE, discounts: [{ days: '10', percent: '2' }] },
      { de: '30 Tage, 2 % Skonto', fr: '30 jours, 2 % escompte' },
    )

    expect(payload.code).toBe('30-2-10')
    expect(payload.name).toBe('30 Tage, 2 % Skonto')
    expect(payload.netDays).toBe(30)
    expect(payload.dueDateBasis).toBe('DOCUMENT_DATE')
    expect(payload.discounts).toEqual([{ days: 10, percent: 2 }])
    expect(payload.labels).toEqual({ de: '30 Tage, 2 % Skonto', fr: '30 jours, 2 % escompte' })
  })

  it('toTermPayloadSendsTheCodeUnchangedTest', () => {
    // The update discards the code but still validates it, so it has to go out either way.
    const payload = toTermPayload({ ...COMPLETE, code: '  30-2-10  ' }, undefined)

    expect(payload.code).toBe('30-2-10')
  })

  it('toTermPayloadLeavesAnEmptyDescriptionOutTest', () => {
    const payload = toTermPayload(COMPLETE, undefined)

    expect(payload.description).toBeUndefined()
  })

  it('toTermPayloadWithoutLabelsSendsNoneTest', () => {
    const payload = toTermPayload(COMPLETE, undefined)

    expect(payload.labels).toBeUndefined()
  })

  it('toTermPayloadWithEmptyLabelsPassesTheMapOnTest', () => {
    // The map is built outside; an empty one is a decision of the mask, not of this module.
    const payload = toTermPayload(COMPLETE, {})

    expect(payload.labels).toEqual({})
  })

  it('toTermPayloadWithoutStagesSendsAnEmptyListTest', () => {
    // Absent stages would wipe what is stored, so the empty state is sent explicitly.
    const payload = toTermPayload(COMPLETE, undefined)

    expect(payload.discounts).toEqual([])
  })

  it('toTermPayloadDropsEmptyStageRowsTest', () => {
    const payload = toTermPayload(
      { ...COMPLETE, discounts: [{ days: '10', percent: '2' }, EMPTY_ROW, EMPTY_ROW] },
      undefined,
    )

    expect(payload.discounts).toEqual([{ days: 10, percent: 2 }])
  })

  it('toTermPayloadDropsAStageWithoutPercentTest', () => {
    // A half-filled row is unfinished input, not a discount of zero percent.
    const payload = toTermPayload(
      { ...COMPLETE, discounts: [{ days: '10', percent: '' }] },
      undefined,
    )

    expect(payload.discounts).toEqual([])
  })

  it('toTermPayloadDropsAStageWithoutDaysTest', () => {
    const payload = toTermPayload({ ...COMPLETE, discounts: [{ days: '', percent: '2' }] }, undefined)

    expect(payload.discounts).toEqual([])
  })

  it('toTermPayloadSortsStagesByDaysTest', () => {
    const payload = toTermPayload(
      {
        ...COMPLETE,
        discounts: [
          { days: '20', percent: '1' },
          { days: '10', percent: '2' },
        ],
      },
      undefined,
    )

    expect(payload.discounts).toEqual([
      { days: 10, percent: 2 },
      { days: 20, percent: 1 },
    ])
  })

  it('toTermPayloadWithZeroDaysSendsTheZeroTest', () => {
    const payload = toTermPayload({ ...COMPLETE, netDays: '0' }, undefined)

    expect(payload.netDays).toBe(0)
  })

  it('toTermPayloadReadsACommaAsDecimalSeparatorTest', () => {
    // Swiss keyboards offer the comma, and the rate is a decimal.
    const payload = toTermPayload(
      { ...COMPLETE, discounts: [{ days: '10', percent: '2,5' }] },
      undefined,
    )

    expect(payload.discounts).toEqual([{ days: 10, percent: 2.5 }])
  })
})

describe('termComplaint', () => {
  it('termComplaintTest', () => {
    const complaint = termComplaint({ ...COMPLETE, discounts: [{ days: '10', percent: '2' }] })

    expect(complaint).toBeNull()
  })

  it('termComplaintWithoutCodeTest', () => {
    const complaint = termComplaint({ ...COMPLETE, code: '   ' })

    expect(complaint).toBe('Eine Zahlungskondition braucht einen Code.')
  })

  it('termComplaintWithTooLongCodeTest', () => {
    const complaint = termComplaint({ ...COMPLETE, code: 'C'.repeat(31) })

    expect(complaint).toBe('Der Code darf höchstens 30 Zeichen lang sein.')
  })

  it('termComplaintWithLongestAllowedCodeTest', () => {
    const complaint = termComplaint({ ...COMPLETE, code: 'C'.repeat(30) })

    expect(complaint).toBeNull()
  })

  it('termComplaintWithoutNameTest', () => {
    const complaint = termComplaint({ ...COMPLETE, name: '' })

    expect(complaint).toBe('Eine Zahlungskondition braucht eine Bezeichnung.')
  })

  it('termComplaintWithTooLongNameTest', () => {
    const complaint = termComplaint({ ...COMPLETE, name: 'N'.repeat(61) })

    expect(complaint).toBe('Die Bezeichnung darf höchstens 60 Zeichen lang sein.')
  })

  it('termComplaintWithTooLongDescriptionTest', () => {
    const complaint = termComplaint({ ...COMPLETE, description: 'B'.repeat(201) })

    expect(complaint).toBe('Die Beschreibung darf höchstens 200 Zeichen lang sein.')
  })

  it('termComplaintWithoutNetDaysTest', () => {
    const complaint = termComplaint({ ...COMPLETE, netDays: '' })

    expect(complaint).toBe('Eine Zahlungskondition braucht eine Zahlungsfrist in Tagen.')
  })

  it('termComplaintWithFractionalNetDaysTest', () => {
    const complaint = termComplaint({ ...COMPLETE, netDays: '30.5' })

    expect(complaint).toBe('Die Zahlungsfrist ist eine ganze Zahl von Tagen.')
  })

  it('termComplaintWithNegativeNetDaysTest', () => {
    const complaint = termComplaint({ ...COMPLETE, netDays: '-1' })

    expect(complaint).toBe('Die Zahlungsfrist liegt zwischen 0 und 365 Tagen.')
  })

  it('termComplaintWith365DaysTest', () => {
    const complaint = termComplaint({ ...COMPLETE, netDays: '365' })

    expect(complaint).toBeNull()
  })

  it('termComplaintWith366DaysTest', () => {
    const complaint = termComplaint({ ...COMPLETE, netDays: '366' })

    expect(complaint).toBe('Die Zahlungsfrist liegt zwischen 0 und 365 Tagen.')
  })

  it('termComplaintWithZeroNetDaysTest', () => {
    const complaint = termComplaint({ ...COMPLETE, netDays: '0' })

    expect(complaint).toBeNull()
  })

  it('termComplaintWithZeroNetDaysAndDiscountTest', () => {
    const complaint = termComplaint({
      ...COMPLETE,
      netDays: '0',
      discounts: [{ days: '0', percent: '2' }],
    })

    expect(complaint).toBe('Bei Zahlung sofort netto ist kein Skonto möglich.')
  })

  it('termComplaintWithZeroNetDaysAndEmptyRowsTest', () => {
    // Rows nobody filled in are not stages, so cash on delivery stays valid.
    const complaint = termComplaint({
      ...COMPLETE,
      netDays: '0',
      discounts: [EMPTY_ROW, EMPTY_ROW],
    })

    expect(complaint).toBeNull()
  })

  it('termComplaintWithExactlyThreeStagesTest', () => {
    const complaint = termComplaint({
      ...COMPLETE,
      discounts: [
        { days: '10', percent: '3' },
        { days: '20', percent: '2' },
        { days: '25', percent: '1' },
      ],
    })

    expect(complaint).toBeNull()
  })

  it('termComplaintWithFourStagesTest', () => {
    const complaint = termComplaint({
      ...COMPLETE,
      discounts: [
        { days: '5', percent: '4' },
        { days: '10', percent: '3' },
        { days: '20', percent: '2' },
        { days: '25', percent: '1' },
      ],
    })

    expect(complaint).toBe('Eine Zahlungskondition trägt höchstens 3 Skontostaffeln.')
  })

  it('termComplaintWithEmptyStageRowsTest', () => {
    const complaint = termComplaint({ ...COMPLETE, discounts: [EMPTY_ROW, EMPTY_ROW, EMPTY_ROW] })

    expect(complaint).toBeNull()
  })

  it('termComplaintWithoutPercentAsksForTheRateTest', () => {
    // The row would be dropped on the way out, and a stage that disappears without a word is
    // worse than one that is refused.
    const complaint = termComplaint({ ...COMPLETE, discounts: [{ days: '10', percent: '' }] })

    expect(complaint).toMatch(/Frist und Satz/)
  })

  it('termComplaintWithDuplicateDaysTest', () => {
    const complaint = termComplaint({
      ...COMPLETE,
      discounts: [
        { days: '10', percent: '2' },
        { days: '10', percent: '1' },
      ],
    })

    expect(complaint).toBe('Zwei Skontostaffeln mit derselben Frist sind nicht möglich.')
  })

  it('termComplaintWithStageAsLongAsTheNetPeriodTest', () => {
    const complaint = termComplaint({ ...COMPLETE, discounts: [{ days: '30', percent: '2' }] })

    expect(complaint).toBe('Eine Skontofrist muss kürzer sein als die Zahlungsfrist von 30 Tagen.')
  })

  it('termComplaintWithStageBeyondTheNetPeriodTest', () => {
    const complaint = termComplaint({ ...COMPLETE, discounts: [{ days: '40', percent: '2' }] })

    expect(complaint).toBe('Eine Skontofrist muss kürzer sein als die Zahlungsfrist von 30 Tagen.')
  })

  it('termComplaintWithNegativeStageDaysTest', () => {
    const complaint = termComplaint({ ...COMPLETE, discounts: [{ days: '-1', percent: '2' }] })

    expect(complaint).toBe('Eine Skontofrist ist eine ganze Zahl von Tagen und nicht negativ.')
  })

  it('termComplaintWithFractionalStageDaysTest', () => {
    const complaint = termComplaint({ ...COMPLETE, discounts: [{ days: '10.5', percent: '2' }] })

    expect(complaint).toBe('Eine Skontofrist ist eine ganze Zahl von Tagen und nicht negativ.')
  })

  it('termComplaintWithStageOnDayZeroTest', () => {
    // Paying on the day of the document is the earliest possible stage and allowed.
    const complaint = termComplaint({ ...COMPLETE, discounts: [{ days: '0', percent: '2' }] })

    expect(complaint).toBeNull()
  })

  it('termComplaintWithZeroPercentTest', () => {
    const complaint = termComplaint({ ...COMPLETE, discounts: [{ days: '10', percent: '0' }] })

    expect(complaint).toBe('Ein Skontosatz liegt über 0 und höchstens bei 100 Prozent.')
  })

  it('termComplaintWithPercentAbove100Test', () => {
    const complaint = termComplaint({ ...COMPLETE, discounts: [{ days: '10', percent: '100.5' }] })

    expect(complaint).toBe('Ein Skontosatz liegt über 0 und höchstens bei 100 Prozent.')
  })

  it('termComplaintWithFullPercentTest', () => {
    const complaint = termComplaint({ ...COMPLETE, discounts: [{ days: '10', percent: '100' }] })

    expect(complaint).toBeNull()
  })

  it('termComplaintWithTwoDecimalsTest', () => {
    const complaint = termComplaint({ ...COMPLETE, discounts: [{ days: '10', percent: '2.05' }] })

    expect(complaint).toBeNull()
  })

  it('termComplaintWithThreeDecimalsTest', () => {
    const complaint = termComplaint({ ...COMPLETE, discounts: [{ days: '10', percent: '2.055' }] })

    expect(complaint).toBe('Ein Skontosatz hat höchstens zwei Dezimalstellen.')
  })

  it('termComplaintWithRisingPercentTest', () => {
    const complaint = termComplaint({
      ...COMPLETE,
      discounts: [
        { days: '10', percent: '1' },
        { days: '20', percent: '2' },
      ],
    })

    expect(complaint).toBe(
      'Der Skontosatz muss mit längerer Frist sinken: früher zahlen darf nicht weniger Abzug bringen.',
    )
  })

  it('termComplaintWithEqualPercentTest', () => {
    // Two stages worth the same make the earlier deadline pointless.
    const complaint = termComplaint({
      ...COMPLETE,
      discounts: [
        { days: '10', percent: '2' },
        { days: '20', percent: '2' },
      ],
    })

    expect(complaint).toBe(
      'Der Skontosatz muss mit längerer Frist sinken: früher zahlen darf nicht weniger Abzug bringen.',
    )
  })

  it('termComplaintChecksTheStagesInTheirDayOrderTest', () => {
    // Entered the other way round, the falling rate is still a falling rate.
    const complaint = termComplaint({
      ...COMPLETE,
      discounts: [
        { days: '20', percent: '1' },
        { days: '10', percent: '2' },
      ],
    })

    expect(complaint).toBeNull()
  })
})

describe('DUE_DATE_BASES', () => {
  it('dueDateBasesTest', () => {
    expect(DUE_DATE_BASES.DOCUMENT_DATE).toBe('Belegdatum')
    expect(DUE_DATE_BASES.END_OF_MONTH).toBe('Monatsende')
  })
})

describe('describePeriod', () => {
  it('describePeriodTest', () => {
    expect(describePeriod(STORED)).toBe('30 Tage')
  })

  it('describePeriodWithZeroTest', () => {
    expect(describePeriod({ ...STORED, netDays: 0 })).toBe('sofort')
  })

  it('describePeriodWithOneDayTest', () => {
    expect(describePeriod({ ...STORED, netDays: 1 })).toBe('1 Tag')
  })

  it('describePeriodWithEndOfMonthTest', () => {
    expect(describePeriod({ ...STORED, dueDateBasis: 'END_OF_MONTH' })).toBe('30 Tage ab Monatsende')
  })

  it('describePeriodWithoutBasisTest', () => {
    expect(describePeriod({ id: 1, code: 'NET30', name: '30 Tage', netDays: 30 })).toBe('30 Tage')
  })

  it('describePeriodWithTheLongestPeriodTest', () => {
    expect(describePeriod({ ...STORED, netDays: 365 })).toBe('365 Tage')
  })
})

describe('describeDiscounts', () => {
  it('describeDiscountsTest', () => {
    expect(describeDiscounts(STORED)).toEqual(['2 % / 10 Tage'])
  })

  it('describeDiscountsWithoutStagesTest', () => {
    expect(describeDiscounts({ ...STORED, discounts: [] })).toEqual([])
  })

  it('describeDiscountsWithoutTheFieldTest', () => {
    expect(describeDiscounts({ id: 1, code: 'NET30', name: '30 Tage', netDays: 30 })).toEqual([])
  })

  it('describeDiscountsWithSeveralStagesTest', () => {
    const stages = describeDiscounts({
      ...STORED,
      discounts: [
        { days: 10, percent: 2 },
        { days: 20, percent: 1.5 },
      ],
    })

    expect(stages).toEqual(['2 % / 10 Tage', '1.5 % / 20 Tage'])
  })

  it('describeDiscountsWithOneDayTest', () => {
    expect(describeDiscounts({ ...STORED, discounts: [{ days: 1, percent: 3 }] })).toEqual([
      '3 % / 1 Tag',
    ])
  })
})

describe('termComplaint with a half filled stage', () => {
  it('termComplaintWithOnlyADeadlineTest', () => {
    // The row would be dropped on the way out; saying so beats a silent disappearance.
    const form = {
      ...EMPTY_TERM,
      code: 'NETTO30',
      name: '30 Tage netto',
      netDays: '30',
      discounts: [{ days: '10', percent: '' }],
    }

    expect(termComplaint(form)).toMatch(/Frist und Satz/)
  })

  it('termComplaintWithOnlyARateTest', () => {
    const form = {
      ...EMPTY_TERM,
      code: 'NETTO30',
      name: '30 Tage netto',
      netDays: '30',
      discounts: [{ days: '', percent: '2' }],
    }

    expect(termComplaint(form)).toMatch(/Frist und Satz/)
  })

  it('termComplaintAcceptsACompletelyEmptyRowTest', () => {
    // An untouched row is an offer, not an entry: it is dropped without a word.
    const form = {
      ...EMPTY_TERM,
      code: 'NETTO30',
      name: '30 Tage netto',
      netDays: '30',
      discounts: [{ days: '', percent: '' }],
    }

    expect(termComplaint(form)).toBeNull()
  })
})
