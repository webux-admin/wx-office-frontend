import { describe, expect, it } from 'vitest'
import {
  SKIP_REASON_LABELS,
  currentMonth,
  draftCountText,
  draftLineCount,
  isCompleteMonth,
  isSplitLine,
  missingRunText,
  monthLabel,
  runResultText,
  subscriptionMissingMonthsKey,
  subscriptionPreviewKey,
  subscriptionRunsUrl,
  totalsText,
} from './subscription'
import type {
  SubscriptionContractPlan,
  SubscriptionPlannedLine,
  SubscriptionRunResult,
} from './types'

/** A yearly position over a rate change, cut into as many parts as asked for. */
function plannedLine(parts: number): SubscriptionPlannedLine {
  return {
    positionKey: `k-${parts}`,
    title: 'Lizenz',
    periodStart: '2027-10-01',
    periodEnd: '2028-09-30',
    quantity: 1,
    unitPrice: 1200,
    priceIncludesVat: false,
    vatCategory: 'STANDARD',
    amount: 1200,
    parts: Array.from({ length: parts }, (_, index) => ({
      periodStart: index === 0 ? '2027-10-01' : '2028-01-01',
      periodEnd: index === parts - 1 ? '2028-09-30' : '2027-12-31',
      days: parts === 1 ? 366 : index === 0 ? 92 : 274,
      amount: parts === 1 ? 1200 : index === 0 ? 301.64 : 898.36,
      vatRate: index === 0 ? 7.7 : 8.1,
    })),
  }
}

function contractPlan(lines: SubscriptionPlannedLine[]): SubscriptionContractPlan {
  return {
    contractId: 7,
    contractNumber: 'V-00007',
    title: 'Lizenz',
    customerName: 'Huber',
    status: 'ACTIVE',
    versionNo: 1,
    invoiceText: 'Vertrag V-00007, Version 1',
    currency: 'CHF',
    total: 1200,
    lines,
    skipped: [],
    notices: [],
  }
}

function result(created: number, skipped: number, failed: number): SubscriptionRunResult {
  return {
    runId: 9,
    month: '2028-01',
    created: Array.from({ length: created }, (_, index) => ({
      contractId: index,
      contractNumber: `V-${index}`,
      customerName: 'Huber',
      documentId: 300 + index,
      versionNo: 1,
      lineCount: 1,
      currency: 'CHF',
      totalGross: 108.1,
    })),
    skipped: Array.from({ length: skipped }, (_, index) => ({
      contractId: index,
      contractNumber: `V-${index}`,
      positionKey: `k-${index}`,
      title: 'Hosting',
      periodStart: '2028-01-01',
      periodEnd: '2028-01-31',
      reason: 'ALREADY_BILLED' as const,
      message: 'Bereits verrechnet.',
    })),
    failed: Array.from({ length: failed }, (_, index) => ({
      contractId: index,
      contractNumber: `V-${index}`,
      customerName: 'Keller',
      message: 'kaputt',
    })),
    notices: [],
  }
}

describe('subscription', () => {
  it('subscriptionRunsUrlTest', () => {
    expect(subscriptionRunsUrl(4)).toBe('/api/tenants/4/subscription-runs')
    expect(subscriptionPreviewKey(4)).toEqual(['subscription-preview', 4])
  })

  it('currentMonthTest', () => {
    expect(currentMonth(new Date(2028, 0, 31))).toBe('2028-01')
    expect(currentMonth(new Date(2027, 11, 1))).toBe('2027-12')
  })

  it('isCompleteMonthTest', () => {
    expect(isCompleteMonth('2028-02')).toBe(true)
    expect(isCompleteMonth('2028-12')).toBe(true)
  })

  /** Half typed, empty or out of range is no month the backend could read. */
  it('isCompleteMonthWithBrokenValuesTest', () => {
    expect(isCompleteMonth('')).toBe(false)
    expect(isCompleteMonth('2028-1')).toBe(false)
    expect(isCompleteMonth('2028-13')).toBe(false)
    expect(isCompleteMonth('2028-00')).toBe(false)
    expect(isCompleteMonth('2028-02-29')).toBe(false)
  })

  it('monthLabelTest', () => {
    expect(monthLabel('2028-01')).toBe('Januar 2028')
    expect(monthLabel('2028-03')).toBe('März 2028')
    expect(monthLabel('2027-12')).toBe('Dezember 2027')
  })

  it('monthLabelOfAnIncompleteMonthTest', () => {
    expect(monthLabel('2028-')).toBe('2028-')
  })

  it('totalsTextTest', () => {
    expect(
      totalsText([
        { currency: 'CHF', amount: 1330 },
        { currency: 'EUR', amount: 80 },
      ]),
    ).toMatch(/^1.330\.00 CHF · 80\.00 EUR$/)
  })

  it('totalsTextOfNothingTest', () => {
    expect(totalsText([])).toBe('–')
  })

  it('draftCountTextTest', () => {
    expect(draftCountText(1)).toBe('1 Rechnungsentwurf')
    expect(draftCountText(0)).toBe('0 Rechnungsentwürfe')
    expect(draftCountText(12)).toBe('12 Rechnungsentwürfe')
  })

  it('runResultTextTest', () => {
    expect(runResultText(result(2, 3, 1))).toBe(
      '2 Rechnungsentwürfe erstellt, 3 Perioden übersprungen, 1 Vertrag fehlgeschlagen.',
    )
  })

  /** Lists that are empty are not mentioned; one of each speaks in the singular. */
  it('runResultTextWithEmptyListsTest', () => {
    expect(runResultText(result(0, 0, 0))).toBe('0 Rechnungsentwürfe erstellt.')
    expect(runResultText(result(1, 1, 2))).toBe(
      '1 Rechnungsentwurf erstellt, 1 Periode übersprungen, 2 Verträge fehlgeschlagen.',
    )
  })

  /** A rate change no longer skips a period; it splits it (backend ADR-0150). */
  it('skipReasonLabelsCoverTheCatalogueTest', () => {
    expect(Object.keys(SKIP_REASON_LABELS)).toHaveLength(8)
    expect(SKIP_REASON_LABELS.SPLIT_NOT_POSSIBLE).toBe('Teilung nicht möglich')
    expect(Object.keys(SKIP_REASON_LABELS)).not.toContain('VAT_RATE_CHANGES')
  })

  it('isSplitLineTest', () => {
    expect(isSplitLine(plannedLine(2))).toBe(true)
    expect(isSplitLine(plannedLine(1))).toBe(false)
  })

  /** One line per part on the draft; a contract without lines has none. */
  it('draftLineCountTest', () => {
    expect(draftLineCount(contractPlan([plannedLine(2), plannedLine(1)]))).toBe(3)
    expect(draftLineCount(contractPlan([]))).toBe(0)
  })

  /** The hint names the month in words, as the screen writes months. */
  it('missingRunTextTest', () => {
    expect(missingRunText('2026-10')).toBe('Für Oktober 2026 lief noch kein Abo-Lauf.')
  })

  /** A value that is no complete month is shown as it is, not as a month name. */
  it('missingRunTextWithBrokenMonthTest', () => {
    expect(missingRunText('2026-1')).toBe('Für 2026-1 lief noch kein Abo-Lauf.')
  })

  /** The missing months are asked from the server, under the tenant's address. */
  it('fetchMissingRunMonthsUrlTest', () => {
    expect(subscriptionRunsUrl(3)).toBe('/api/tenants/3/subscription-runs')
    expect(subscriptionMissingMonthsKey(3)).toEqual(['subscription-missing-months', 3])
  })
})
