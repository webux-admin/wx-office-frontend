import { describe, expect, it } from 'vitest'
import { ApiError } from './api'
import {
  billingRunActionText,
  billingRunPreviewUrl,
  billingRunRequestOf,
  billingRunResultText,
  billingRunUrl,
  worklistKeyOf,
  BILLING_GROUPINGS,
  BILLING_GROUPING_HINTS,
  BILLING_INCREMENTS,
  SKIP_REASON_LABELS,
  TIME_BILLING_CUSTOMER_ROUTE,
  TIME_BILLING_PATH,
  TIME_BILLING_PROJECT_ROUTE,
  billedMeanwhileIdsOf,
  billedMeanwhileText,
  billingHandoverOf,
  billingHandoverState,
  billingIncrementLabel,
  billingPreviewKey,
  billingPreviewUrl,
  billingQuantityText,
  billingReleaseUrl,
  billingSubjectText,
  billingSubmitLabel,
  billingUrl,
  billingWorklistKey,
  billingWorklistUrl,
  candidateText,
  draftInvoicesKey,
  draftInvoicesQuery,
  draftInvoicesUrl,
  draftOptionLabel,
  emptyBillingForm,
  entryInvoicePath,
  entryText,
  incrementSavedText,
  incrementText,
  invoicePathOf,
  isAskable,
  mayWriteBilling,
  rateOriginText,
  releasedText,
  selectedEntryIds,
  selectionAfter,
  serviceDatesText,
  takeOverLabel,
  timeBillingKey,
  timeBillingPathOf,
  timeTrackingSettingsKey,
  timeTrackingSettingsUrl,
  toBillingRequest,
  totalLabel,
  withoutEntries,
  withoutProjectSelection,
  worklistCustomerText,
  worklistOpenMinutes,
  worklistProjectText,
  worklistTargetOf,
} from './timeBilling'
import { TIMETRACKING_PATH } from './timetracking'
import type {
  DocumentSummary,
  TimeBillingCandidate,
  TimeEntry,
  TimeWorklistLine,
} from './types'

/** The three entries of the sketch in #127, and one more Beat recorded late. */
function candidate(overrides: Partial<TimeBillingCandidate>): TimeBillingCandidate {
  return {
    entryId: 101,
    workDate: '2026-11-03',
    userId: 1,
    userName: 'Anna Muster',
    projectId: 51,
    projectNumber: 'P-00012',
    productId: 31,
    serviceName: 'Konzeption',
    durationMinutes: 150,
    billedMinutes: 150,
    description: 'Wireframes',
    selected: true,
    ...overrides,
  }
}

const WIREFRAMES = candidate({})
const REVIEW = candidate({
  entryId: 102,
  workDate: '2026-11-05',
  durationMinutes: 70,
  billedMinutes: 75,
  description: 'Review mit Kunde',
})
const TEMPLATES = candidate({
  entryId: 103,
  workDate: '2026-11-12',
  userName: 'Beat Beispiel',
  serviceName: 'Umsetzung',
  durationMinutes: 360,
  billedMinutes: 360,
  description: 'Templates',
})
const SMALL_STUFF = candidate({
  entryId: 104,
  workDate: '2026-11-28',
  userName: 'Beat Beispiel',
  projectId: null,
  projectNumber: null,
  serviceName: 'Umsetzung',
  durationMinutes: 20,
  billedMinutes: 30,
  description: 'Kleinkram',
})
const CANDIDATES = [WIREFRAMES, REVIEW, TEMPLATES, SMALL_STUFF]

function worklistLine(overrides: Partial<TimeWorklistLine>): TimeWorklistLine {
  return {
    partnerId: 11,
    customerName: 'Muster AG',
    projectId: 51,
    projectNumber: 'P-00012',
    projectName: 'Website',
    openEntries: 3,
    openMinutes: 580,
    billedMinutes: 585,
    estimatedAmount: 1560,
    currency: 'CHF',
    oldestWorkDate: '2026-11-03',
    ...overrides,
  }
}

function entry(overrides: Partial<TimeEntry>): TimeEntry {
  return {
    id: 5,
    userId: 1,
    workDate: '2026-11-03',
    durationMinutes: 150,
    billable: true,
    state: 'IN_DRAFT',
    editable: false,
    documentId: 42,
    lockVersion: 1,
    ...overrides,
  }
}

describe('paths', () => {
  /** Beside «Meine Zeiten», so the menu never marks both: `/zeiten/…` would. */
  it('timeBillingPathTest', () => {
    expect(TIME_BILLING_PATH).toBe('/zeiten-abrechnen')
    expect(TIME_BILLING_PATH.startsWith(`${TIMETRACKING_PATH}/`)).toBe(false)
    expect(TIME_BILLING_PROJECT_ROUTE).toBe('/zeiten-abrechnen/projekt/:projectId')
    expect(TIME_BILLING_CUSTOMER_ROUTE).toBe('/zeiten-abrechnen/kunde/:partnerId')
  })

  it('timeBillingPathOfTest', () => {
    expect(timeBillingPathOf({ kind: 'PROJECT', projectId: 51 })).toBe('/zeiten-abrechnen/projekt/51')
  })

  it('timeBillingPathOfACustomerTest', () => {
    expect(timeBillingPathOf({ kind: 'CUSTOMER', partnerId: 11 })).toBe('/zeiten-abrechnen/kunde/11')
  })

  it('invoicePathOfTest', () => {
    expect(invoicePathOf(42)).toBe('/rechnungen/42')
  })

  it('entryInvoicePathTest', () => {
    expect(entryInvoicePath(entry({}))).toBe('/rechnungen/42')
  })

  /** An open entry stands on no invoice, and leads nowhere. */
  it('entryInvoicePathWithoutAnInvoiceTest', () => {
    expect(entryInvoicePath(entry({ state: 'OPEN', documentId: null }))).toBeNull()
    expect(entryInvoicePath(entry({ state: 'OPEN', documentId: undefined }))).toBeNull()
  })
})

describe('mayWriteBilling', () => {
  it('mayWriteBillingTest', () => {
    expect(mayWriteBilling((right) => ['TIME_BILL', 'INVOICE_WRITE'].includes(right))).toBe(true)
  })

  /** TIME_BILL alone opens the preview, not the writing (#122, Entscheid 7). */
  it('mayWriteBillingWithoutTheInvoiceRightTest', () => {
    expect(mayWriteBilling((right) => right === 'TIME_BILL')).toBe(false)
  })

  it('mayWriteBillingWithoutTheBillRightTest', () => {
    expect(mayWriteBilling((right) => right === 'INVOICE_WRITE')).toBe(false)
  })
})

describe('addresses', () => {
  it('billingWorklistUrlTest', () => {
    expect(billingWorklistUrl(1, '2026-11-30')).toBe(
      '/api/tenants/1/time-tracking/billing/worklist?until=2026-11-30',
    )
  })

  /** «Zeiten übernehmen» asks for the customer of its draft. */
  it('billingWorklistUrlForOneCustomerTest', () => {
    expect(billingWorklistUrl(1, '2026-11-30', 11)).toBe(
      '/api/tenants/1/time-tracking/billing/worklist?until=2026-11-30&partnerId=11',
    )
  })

  it('billingWritingUrlsTest', () => {
    expect(billingPreviewUrl(1)).toBe('/api/tenants/1/time-tracking/billing/preview')
    expect(billingUrl(1)).toBe('/api/tenants/1/time-tracking/billing')
    expect(billingReleaseUrl(1)).toBe('/api/tenants/1/time-tracking/billing/release')
    expect(timeTrackingSettingsUrl(1)).toBe('/api/tenants/1/time-tracking/settings')
  })

  /** The existing invoice list, narrowed to the drafts of one customer, the newest first. */
  it('draftInvoicesUrlTest', () => {
    expect(draftInvoicesQuery(11)).toBe('status=DRAFT&partnerId=11&size=200&sort=documentDate%2Cdesc')
    expect(draftInvoicesUrl(1, 11)).toBe(
      '/api/tenants/1/invoices?status=DRAFT&partnerId=11&size=200&sort=documentDate%2Cdesc',
    )
  })
})

describe('cache keys', () => {
  it('timeBillingKeyTest', () => {
    expect(timeBillingKey(1)).toEqual(['time-billing', 1])
  })

  /** Worklist and preview start with the billing key, so one invalidation reaches both. */
  it('billingWorklistKeyTest', () => {
    expect(billingWorklistKey(1, '2026-11-30')).toEqual([
      'time-billing',
      1,
      'worklist',
      '2026-11-30',
      null,
    ])
    expect(billingWorklistKey(1, '2026-11-30', 11)).toEqual([
      'time-billing',
      1,
      'worklist',
      '2026-11-30',
      11,
    ])
  })

  it('billingPreviewKeyTest', () => {
    const request = { projectId: 51, until: '2026-11-30' }
    expect(billingPreviewKey(1, request)).toEqual(['time-billing', 1, 'preview', request])
  })

  /** The increment is not billing state: a billing leaves it alone. */
  it('timeTrackingSettingsKeyTest', () => {
    expect(timeTrackingSettingsKey(1)).toEqual(['time-settings', 1])
    expect(timeTrackingSettingsKey(1)[0]).not.toBe(timeBillingKey(1)[0])
  })

  /** Under the invoice lists, so a written draft refreshes the choice «Ziel». */
  it('draftInvoicesKeyTest', () => {
    expect(draftInvoicesKey(1, 11)).toEqual([
      'sales-documents',
      1,
      'invoices',
      'status=DRAFT&partnerId=11&size=200&sort=documentDate%2Cdesc',
    ])
  })
})

describe('the request', () => {
  it('emptyBillingFormTest', () => {
    expect(emptyBillingForm('2026-11-30')).toEqual({
      until: '2026-11-30',
      selection: null,
      grouping: 'BY_SERVICE',
      documentId: null,
    })
  })

  /** «Zeiten übernehmen» opens with its draft as target. */
  it('emptyBillingFormWithADraftTest', () => {
    expect(emptyBillingForm('2026-11-30', 42).documentId).toBe(42)
  })

  /** A project goes without its customer, every tick without a list, a new draft without id. */
  it('toBillingRequestTest', () => {
    expect(toBillingRequest({ kind: 'PROJECT', projectId: 51 }, emptyBillingForm('2026-11-30'))).toEqual({
      projectId: 51,
      until: '2026-11-30',
      grouping: 'BY_SERVICE',
    })
  })

  /** The ticks go sorted, so the same choice made in another order asks the same question. */
  it('toBillingRequestWithTicksAndADraftTest', () => {
    const form = { until: '2026-11-30', selection: [103, 101], grouping: 'BY_ENTRY' as const, documentId: 42 }
    expect(toBillingRequest({ kind: 'CUSTOMER', partnerId: 11 }, form)).toEqual({
      partnerId: 11,
      until: '2026-11-30',
      entryIds: [101, 103],
      grouping: 'BY_ENTRY',
      documentId: 42,
    })
  })

  /** Nothing ticked is a choice too, and the backend answers it with an empty preview. */
  it('toBillingRequestWithNothingTickedTest', () => {
    const form = { ...emptyBillingForm('2026-11-30'), selection: [] }
    expect(toBillingRequest({ kind: 'CUSTOMER', partnerId: 11 }, form).entryIds).toEqual([])
  })

  it('isAskableTest', () => {
    expect(isAskable(emptyBillingForm('2026-11-30'))).toBe(true)
  })

  /** A date field half typed, or emptied, asks nothing. */
  it('isAskableWithoutAWholeDayTest', () => {
    expect(isAskable(emptyBillingForm(''))).toBe(false)
    expect(isAskable(emptyBillingForm('2026-11'))).toBe(false)
  })
})

describe('the ticks', () => {
  /** All is every entry the preview lists. */
  it('selectedEntryIdsTest', () => {
    expect([...selectedEntryIds(null, CANDIDATES)]).toEqual([101, 102, 103, 104])
  })

  it('selectedEntryIdsOfAChoiceTest', () => {
    expect([...selectedEntryIds([101, 103], CANDIDATES)]).toEqual([101, 103])
  })

  it('selectedEntryIdsWithoutEntriesTest', () => {
    expect(selectedEntryIds(null, []).size).toBe(0)
  })

  /** One unticked of four: the three others, in the order of the list. */
  it('selectionAfterTest', () => {
    expect(selectionAfter(new Set([103, 101, 102]), CANDIDATES)).toEqual([101, 102, 103])
  })

  /** Everything ticked again means «all», so an entry recorded meanwhile comes along. */
  it('selectionAfterEverythingTickedTest', () => {
    expect(selectionAfter(new Set([101, 102, 103, 104]), CANDIDATES)).toBeNull()
  })

  it('selectionAfterNothingTickedTest', () => {
    expect(selectionAfter(new Set(), CANDIDATES)).toEqual([])
  })

  /** An id the list does not show is not sent. */
  it('selectionAfterWithAStrangerTest', () => {
    expect(selectionAfter(new Set([101, 999]), CANDIDATES)).toEqual([101])
  })

  /** An empty list never turns «nothing» into «all». */
  it('selectionAfterWithoutCandidatesTest', () => {
    expect(selectionAfter(new Set(), [])).toEqual([])
  })

  it('withoutEntriesTest', () => {
    expect(withoutEntries([101, 102, 103], [102])).toEqual([101, 103])
  })

  /** All stays all: the next preview no longer lists what was billed. */
  it('withoutEntriesOfAllTest', () => {
    expect(withoutEntries(null, [102])).toBeNull()
  })

  it('withoutEntriesOfNoneTest', () => {
    expect(withoutEntries([101], [])).toEqual([101])
  })

  /** A row «ohne Projekt» ticks only the time on the customer alone. */
  it('withoutProjectSelectionTest', () => {
    expect(withoutProjectSelection(CANDIDATES)).toEqual([104])
  })

  it('withoutProjectSelectionWithoutSuchEntriesTest', () => {
    expect(withoutProjectSelection([WIREFRAMES, REVIEW])).toEqual([])
    expect(withoutProjectSelection([])).toEqual([])
  })
})

describe('words', () => {
  /** By service first: the default, and what the sketch in #127 shows. */
  it('billingGroupingsTest', () => {
    expect(BILLING_GROUPINGS).toEqual([
      { value: 'BY_SERVICE', label: 'je Leistung' },
      { value: 'BY_ENTRY', label: 'je Eintrag' },
    ])
    expect(Object.keys(BILLING_GROUPING_HINTS)).toEqual(['BY_SERVICE', 'BY_ENTRY'])
    expect(BILLING_GROUPING_HINTS.BY_SERVICE).toContain('Namen stehen keine auf der Rechnung')
  })

  it('rateOriginTextTest', () => {
    expect(rateOriginText({ rateOrigin: 'PROJECT_RATE' })).toBe('Projektsatz')
    expect(rateOriginText({ rateOrigin: 'CUSTOMER_PRICE' })).toBe('Kundenpreis')
    expect(rateOriginText({ rateOrigin: 'BASE_PRICE' })).toBe('Grundpreis')
  })

  /** A price group names itself, the default group of the tenant as well. */
  it('rateOriginTextOfAPriceGroupTest', () => {
    expect(rateOriginText({ rateOrigin: 'PRICE_GROUP', priceGroupName: 'Wiederverkäufer' })).toBe(
      'Preisgruppe Wiederverkäufer',
    )
    expect(rateOriginText({ rateOrigin: 'DEFAULT_PRICE_GROUP', priceGroupName: 'Standard' })).toBe(
      'Preisgruppe Standard',
    )
  })

  it('rateOriginTextOfAPriceGroupWithoutANameTest', () => {
    expect(rateOriginText({ rateOrigin: 'PRICE_GROUP', priceGroupName: null })).toBe('Preisgruppe')
  })

  /** Every reason the backend skips with has words. */
  it('skipReasonLabelsTest', () => {
    expect(Object.keys(SKIP_REASON_LABELS)).toEqual([
      'NOT_OPEN',
      'PROJECT_NOT_BILLED',
      'RATE_CURRENCY',
      'UNIT_NOT_HOURS',
      'NO_VAT_RATE',
      'TAX_LIABILITY_STARTS',
    ])
    expect(SKIP_REASON_LABELS.UNIT_NOT_HOURS).toBe('Leistung nicht in Stunden')
    expect(SKIP_REASON_LABELS.TAX_LIABILITY_STARTS).toBe('vor der Steuerpflicht')
  })

  it('totalLabelTest', () => {
    expect(totalLabel(null, true)).toBe('Total netto')
  })

  /** Onto a draft the preview counts only the lines it adds, before a discount of the draft. */
  it('totalLabelOfADraftTest', () => {
    expect(totalLabel(42, true)).toBe('Neue Positionen netto')
    expect(totalLabel(undefined, true)).toBe('Total netto')
  })

  /** Without VAT liability there is nothing to be net of. */
  it('totalLabelWithoutVatLiabilityTest', () => {
    expect(totalLabel(null, false)).toBe('Total')
    expect(totalLabel(42, false)).toBe('Neue Positionen')
  })

  /** The increments the backend takes, and nothing else (`ck_timetracking_settings_increment`). */
  it('billingIncrementsTest', () => {
    expect(BILLING_INCREMENTS).toEqual([1, 5, 6, 10, 15, 30])
  })

  it('billingIncrementLabelTest', () => {
    expect(billingIncrementLabel(15)).toBe('15 Minuten')
  })

  /** 1 is how the backend spells «no increment». */
  it('billingIncrementLabelOfNoneTest', () => {
    expect(billingIncrementLabel(1)).toBe('kein Takt')
    expect(billingIncrementLabel(30)).toBe('30 Minuten')
  })

  /** The example of the sketch: 1:10 becomes 1:15. */
  it('incrementTextTest', () => {
    expect(incrementText({ billingIncrementMinutes: 15, candidates: CANDIDATES })).toBe(
      'Abrechnungstakt 15 Min.: jeder Eintrag wird aufgerundet, 1:10 wird 1:15.',
    )
  })

  it('incrementTextWithoutAnIncrementTest', () => {
    expect(incrementText({ billingIncrementMinutes: 1, candidates: CANDIDATES })).toBe(
      'Ohne Abrechnungstakt: verrechnet wird die erfasste Zeit.',
    )
  })

  /** Nothing rounded up, or nothing listed: the rule without an example. */
  it('incrementTextWithoutAnExampleTest', () => {
    expect(incrementText({ billingIncrementMinutes: 15, candidates: [WIREFRAMES] })).toBe(
      'Abrechnungstakt 15 Min.: jeder Eintrag wird aufgerundet.',
    )
    expect(incrementText({ billingIncrementMinutes: 6, candidates: [] })).toBe(
      'Abrechnungstakt 6 Min.: jeder Eintrag wird aufgerundet.',
    )
  })

  it('billingQuantityTextTest', () => {
    expect(billingQuantityText(3.75)).toBe('3.75 Std.')
  })

  /** Always two decimals, as the invoice carries them; thousands with the apostrophe. */
  it('billingQuantityTextAtTheEdgesTest', () => {
    expect(billingQuantityText(6)).toBe('6.00 Std.')
    expect(billingQuantityText(0)).toBe('0.00 Std.')
    expect(billingQuantityText(1250.5)).toBe('1’250.50 Std.')
  })

  it('serviceDatesTextTest', () => {
    expect(serviceDatesText({ serviceDateFrom: '2026-11-03', serviceDateTo: '2026-11-05' })).toBe(
      '03.11.2026 – 05.11.2026',
    )
  })

  /** One day has no «bis», whichever way the backend says it. */
  it('serviceDatesTextOfOneDayTest', () => {
    expect(serviceDatesText({ serviceDateFrom: '2026-11-12', serviceDateTo: null })).toBe('12.11.2026')
    expect(serviceDatesText({ serviceDateFrom: '2026-11-12', serviceDateTo: '2026-11-12' })).toBe(
      '12.11.2026',
    )
  })

  it('candidateTextTest', () => {
    expect(candidateText(REVIEW)).toBe('05.11.2026 · Anna Muster · Konzeption · 1:10')
  })

  /** A user or service that is gone leaves no gap in the sentence. */
  it('candidateTextWithoutNamesTest', () => {
    expect(candidateText(candidate({ userName: null, serviceName: null }))).toBe('03.11.2026 · 2:30')
  })

  it('entryTextTest', () => {
    expect(entryText(103, CANDIDATES)).toBe('12.11.2026 · Beat Beispiel · Umsetzung · 6:00')
  })

  /** An entry the screen never listed is named by its number. */
  it('entryTextOfAnUnknownEntryTest', () => {
    expect(entryText(17, CANDIDATES)).toBe('Eintrag 17')
    expect(entryText(17, [])).toBe('Eintrag 17')
  })

  it('billingSubjectTextTest', () => {
    expect(
      billingSubjectText({ customerName: 'Muster AG', projectNumber: 'P-00012', projectName: 'Website' }),
    ).toBe('Muster AG · P-00012 Website')
  })

  it('billingSubjectTextOfACustomerTest', () => {
    expect(billingSubjectText({ customerName: 'Muster AG' })).toBe('Muster AG')
  })

  it('billingSubmitLabelTest', () => {
    expect(billingSubmitLabel(null)).toBe('Rechnungsentwurf erstellen')
    expect(billingSubmitLabel(42)).toBe('In den Entwurf übernehmen')
  })

  const DRAFT: DocumentSummary = {
    id: 42,
    documentTypeId: 1,
    category: 'INVOICE',
    status: 'DRAFT',
    documentDate: '2026-11-20',
    partnerId: 11,
    currency: 'CHF',
    totalNet: 1000,
    totalGross: 1081,
  }

  it('draftOptionLabelTest', () => {
    expect(draftOptionLabel(DRAFT)).toBe('Entwurf vom 20.11.2026 · 1’081.00 CHF')
  })

  /** A draft issued once and taken back carries its number. */
  it('draftOptionLabelOfADraftWithANumberTest', () => {
    expect(draftOptionLabel({ ...DRAFT, documentNumber: 'RE-2026-0042', totalGross: 0 })).toBe(
      'RE-2026-0042 vom 20.11.2026 · 0.00 CHF',
    )
  })
})

describe('the refusal of a billing', () => {
  /** Another billing took two entries a moment before. */
  it('billedMeanwhileIdsOfTest', () => {
    const error = new ApiError(409, 'Die Einträge 101, 103 wurden inzwischen abgerechnet.', {
      entryIds: [101, 103],
    })
    expect(billedMeanwhileIdsOf(error)).toEqual([101, 103])
  })

  /** The draft was issued or saved at the same moment: 409, and no entry named. */
  it('billedMeanwhileIdsOfWithoutEntriesTest', () => {
    expect(billedMeanwhileIdsOf(new ApiError(409, 'Der Entwurf wurde ausgestellt.', { entryIds: [] }))).toEqual(
      [],
    )
  })

  /** A 409 of another kind — the module switched off — and every other error are no such answer. */
  it('billedMeanwhileIdsOfAnotherErrorTest', () => {
    expect(billedMeanwhileIdsOf(new ApiError(409, 'Die Zeiterfassung ist ausgeschaltet.', {}))).toBeNull()
    expect(billedMeanwhileIdsOf(new ApiError(400, 'Kunde oder Projekt wählen.', { entryIds: [1] }))).toBeNull()
    expect(billedMeanwhileIdsOf(new Error('Netzwerk'))).toBeNull()
    expect(billedMeanwhileIdsOf(null)).toBeNull()
  })

  /** What cannot be an id is dropped, and a list that is no list is no answer. */
  it('billedMeanwhileIdsOfWithStrangeIdsTest', () => {
    expect(billedMeanwhileIdsOf(new ApiError(409, '', { entryIds: [101, '102', 1.5, null] }))).toEqual([101])
    expect(billedMeanwhileIdsOf(new ApiError(409, '', { entryIds: '101' }))).toBeNull()
    expect(billedMeanwhileIdsOf(new ApiError(409, ''))).toBeNull()
  })

  it('billedMeanwhileTextTest', () => {
    expect(billedMeanwhileText([101], CANDIDATES)).toBe(
      'Inzwischen abgerechnet: 03.11.2026 · Anna Muster · Konzeption · 2:30. Die Vorschau ist neu geladen; die übrigen lassen sich abrechnen.',
    )
  })

  it('billedMeanwhileTextOfSeveralTest', () => {
    expect(billedMeanwhileText([101, 17], CANDIDATES)).toBe(
      'Inzwischen abgerechnet: 03.11.2026 · Anna Muster · Konzeption · 2:30; Eintrag 17. Die Vorschau ist neu geladen; die übrigen lassen sich abrechnen.',
    )
  })
})

describe('the worklist', () => {
  it('worklistProjectTextTest', () => {
    expect(worklistProjectText(worklistLine({}))).toBe('P-00012 Website')
  })

  it('worklistProjectTextWithoutAProjectTest', () => {
    expect(worklistProjectText(worklistLine({ projectId: null, projectNumber: null, projectName: null }))).toBe(
      'ohne Projekt',
    )
  })

  it('worklistProjectTextOfAProjectGoneTest', () => {
    expect(worklistProjectText(worklistLine({ projectNumber: null, projectName: null }))).toBe(
      'Projekt nicht mehr vorhanden',
    )
  })

  it('worklistCustomerTextTest', () => {
    expect(worklistCustomerText(worklistLine({}))).toBe('Muster AG')
    expect(worklistCustomerText(worklistLine({ customerName: null }))).toBe('Kunde nicht mehr vorhanden')
  })

  it('worklistTargetOfTest', () => {
    expect(worklistTargetOf(worklistLine({}))).toEqual({ kind: 'PROJECT', projectId: 51 })
  })

  /** The row of a customer without project opens the customer. */
  it('worklistTargetOfACustomerTest', () => {
    expect(worklistTargetOf(worklistLine({ projectId: null }))).toEqual({ kind: 'CUSTOMER', partnerId: 11 })
  })

  /** Two projects and the customer alone: 9:40, 2:20 and 0:30 make 12:30. */
  it('worklistOpenMinutesTest', () => {
    const lines = [
      worklistLine({ openMinutes: 580 }),
      worklistLine({ projectId: 52, openMinutes: 140 }),
      worklistLine({ projectId: null, openMinutes: 30 }),
    ]
    expect(worklistOpenMinutes(lines)).toBe(750)
  })

  it('worklistOpenMinutesOfNothingTest', () => {
    expect(worklistOpenMinutes([])).toBe(0)
    expect(worklistOpenMinutes([worklistLine({ openMinutes: 1 })])).toBe(1)
  })

  /** In hours of the clock, as every other time of the module (frontend ADR-0084). */
  it('takeOverLabelTest', () => {
    expect(takeOverLabel(750)).toBe('Zeiten übernehmen (12:30 Std.)')
  })

  it('takeOverLabelAtTheEdgesTest', () => {
    expect(takeOverLabel(1)).toBe('Zeiten übernehmen (0:01 Std.)')
    expect(takeOverLabel(6000)).toBe('Zeiten übernehmen (100:00 Std.)')
  })
})

describe('handing over', () => {
  const ORIGIN = { from: '/zeiten-abrechnen', label: 'Zeiten abrechnen' }

  it('billingHandoverStateTest', () => {
    expect(billingHandoverState({ until: '2026-11-30', withoutProject: true }, ORIGIN)).toEqual({
      origin: ORIGIN,
      billing: { until: '2026-11-30', withoutProject: true },
    })
  })

  /** From a register: no day, everything of the target, and the way back. */
  it('billingHandoverStateWithoutADayTest', () => {
    expect(billingHandoverState({})).toEqual({ billing: { until: null, withoutProject: false } })
  })

  it('billingHandoverOfTest', () => {
    expect(billingHandoverOf(billingHandoverState({ until: '2026-11-30', withoutProject: true }, ORIGIN))).toEqual({
      until: '2026-11-30',
      withoutProject: true,
    })
  })

  /** Router state outlives versions: what cannot be read is left at its default. */
  it('billingHandoverOfWhatCannotBeReadTest', () => {
    const none = { until: null, withoutProject: false }
    expect(billingHandoverOf(undefined)).toEqual(none)
    expect(billingHandoverOf(null)).toEqual(none)
    expect(billingHandoverOf({ origin: ORIGIN })).toEqual(none)
    expect(billingHandoverOf({ billing: 'ja' })).toEqual(none)
    expect(billingHandoverOf({ billing: { until: '30.11.2026', withoutProject: 'yes' } })).toEqual(none)
    expect(billingHandoverOf({ billing: { until: 20261130 } })).toEqual(none)
  })
})

describe('the increment and the release', () => {
  it('incrementSavedTextTest', () => {
    expect(incrementSavedText({ billingIncrementMinutes: 15 })).toBe('Abrechnungstakt gespeichert: 15 Minuten.')
  })

  it('incrementSavedTextOfNoneTest', () => {
    expect(incrementSavedText({ billingIncrementMinutes: 1 })).toBe('Abrechnungstakt gespeichert: kein Takt.')
  })

  it('releasedTextTest', () => {
    expect(releasedText([entry({ state: 'OPEN' })])).toBe('Vom Entwurf gelöst: 1 Eintrag, wieder offen.')
  })

  it('releasedTextOfSeveralTest', () => {
    expect(releasedText([entry({ id: 5 }), entry({ id: 6 }), entry({ id: 7 })])).toBe(
      'Vom Entwurf gelöst: 3 Einträge, wieder offen.',
    )
    expect(releasedText([])).toBe('Vom Entwurf gelöst: 0 Einträge, wieder offen.')
  })
})

describe('billing run (#140)', () => {
  const website: TimeWorklistLine = {
    partnerId: 11,
    customerName: 'Muster AG',
    projectId: 51,
    projectNumber: 'P-00012',
    projectName: 'Website',
    openEntries: 3,
    openMinutes: 580,
    billedMinutes: 585,
    estimatedAmount: 1560,
    currency: 'CHF',
    oldestWorkDate: '2026-11-03',
  }
  const alone: TimeWorklistLine = { ...website, projectId: null, projectNumber: null, projectName: null }
  const holz: TimeWorklistLine = { ...website, partnerId: 12, projectId: 52 }

  it('billingRunUrlTest', () => {
    expect(billingRunPreviewUrl(1)).toBe('/api/tenants/1/time-tracking/billing/batch/preview')
    expect(billingRunUrl(1)).toBe('/api/tenants/1/time-tracking/billing/batch')
  })

  it('worklistKeyOfTest', () => {
    expect(worklistKeyOf(website)).toBe('11-51')
    expect(worklistKeyOf(alone)).toBe('11-ohne')
    expect(worklistKeyOf({ partnerId: 11 })).toBe('11-ohne')
  })

  /** The ticked rows in the order of the list, the time without project as `null`. */
  it('billingRunRequestOfTest', () => {
    expect(billingRunRequestOf([website, alone, holz], new Set(['12-52', '11-ohne']), '2026-11-30')).toEqual({
      until: '2026-11-30',
      targets: [
        { partnerId: 11, projectId: null },
        { partnerId: 12, projectId: 52 },
      ],
    })
  })

  it('billingRunRequestOfNothingTickedTest', () => {
    expect(billingRunRequestOf([website], new Set(), '2026-11-30').targets).toEqual([])
  })

  /** A refused row writes no draft and is not counted. */
  it('billingRunActionTextTest', () => {
    const line = { partnerId: 11, entries: 3, totalNet: 10, skipped: [] }
    expect(billingRunActionText([line, { ...line, refusal: 'nein' }])).toBe('1 Rechnungsentwurf erstellen')
    expect(billingRunActionText([line, line])).toBe('2 Rechnungsentwürfe erstellen')
    expect(billingRunActionText([])).toBe('0 Rechnungsentwürfe erstellen')
  })

  it('billingRunResultTextTest', () => {
    const left = { partnerId: 11, message: 'x' }
    const created = { partnerId: 11, documentId: 1, lines: 1, entries: 1, skipped: 0, totalNet: 1, currency: 'CHF' }
    expect(billingRunResultText({ created: [created, created], skipped: [left], failed: [] })).toBe(
      '2 Entwürfe erstellt, 1 übersprungen, 0 fehlgeschlagen.',
    )
    expect(billingRunResultText({ created: [created], skipped: [], failed: [left] })).toBe(
      '1 Entwurf erstellt, 0 übersprungen, 1 fehlgeschlagen.',
    )
  })
})
