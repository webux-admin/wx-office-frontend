import { describe, expect, it } from 'vitest'
import {
  IMPORT_STATES,
  REFERENCE_TYPES,
  TRANSACTION_STATES,
  TRANSACTION_STATE_ORDER,
  bankEntriesKey,
  bankStatementsKey,
  bankTransactionsKey,
  entryHasGap,
  importSummary,
  isBeingRead,
  queryStringOf,
  referenceIsBroken,
  referenceLabel,
} from './banking'
import type { BankEntry, BankStatementImport, BankTransaction } from './types'

function transaction(over: Partial<BankTransaction> = {}): BankTransaction {
  return {
    id: 1,
    entryId: 2,
    importId: 3,
    accountIban: 'CH4431999123000889012',
    accountServicerReference: 'ACCT-REF-0001',
    amount: 1000,
    currency: 'CHF',
    inAccountCurrency: true,
    creditDebit: 'CRDT',
    referenceType: 'QRR',
    referenceValid: true,
    state: 'NEW',
    ...over,
  }
}

function entry(over: Partial<BankEntry> = {}): BankEntry {
  return {
    id: 1,
    amount: 2500,
    currency: 'CHF',
    creditDebit: 'CRDT',
    status: 'BOOK',
    reversalIndicator: false,
    transactionCount: 3,
    transactionSum: 2500,
    ...over,
  }
}

function head(over: Partial<BankStatementImport> = {}): BankStatementImport {
  return {
    id: 7,
    fileName: 'camt054.xml',
    byteCount: 4096,
    messageType: 'CAMT_054',
    statementCount: 1,
    entryCount: 1,
    transactionCount: 3,
    storedCount: 3,
    duplicateCount: 0,
    skippedCount: 0,
    state: 'PARSED',
    createdAt: '2026-04-17T21:15:00Z',
    createdBy: 'jan',
    ...over,
  }
}

describe('referenceLabel', () => {
  it('referenceLabelTest', () => {
    expect(referenceLabel(transaction())).toBe('QR-Referenz')
  })

  // Two fields and not one: a QR reference that fails its check digit is a transposed digit
  // somebody can find, and it must not read like a free text.
  it('referenceLabelWithABrokenReferenceTest', () => {
    expect(referenceLabel(transaction({ referenceValid: false }))).toBe(
      'QR-Referenz — Prüfziffer stimmt nicht',
    )
  })

  it('referenceLabelWithoutAReferenceTest', () => {
    expect(referenceLabel(transaction({ referenceType: 'NONE', referenceValid: false }))).toBe(
      'Keine Referenz',
    )
  })

  it('referenceLabelWithFreeTextTest', () => {
    expect(referenceLabel(transaction({ referenceType: 'OTHER', referenceValid: false }))).toBe(
      'Andere Angabe — Prüfziffer stimmt nicht',
    )
  })
})

describe('referenceIsBroken', () => {
  it('referenceIsBrokenTest', () => {
    expect(referenceIsBroken(transaction({ referenceValid: false }))).toBe(true)
  })

  it('referenceIsBrokenWithAValidReferenceTest', () => {
    expect(referenceIsBroken(transaction())).toBe(false)
  })

  // An unstructured payment is ordinary, not a problem to mark.
  it('referenceIsBrokenWithoutAReferenceTest', () => {
    expect(
      referenceIsBroken(transaction({ referenceType: 'NONE', referenceValid: false })),
    ).toBe(false)
  })
})

describe('entryHasGap', () => {
  it('entryHasGapTest', () => {
    expect(entryHasGap(entry({ transactionSum: 1900 }))).toBe(true)
  })

  it('entryHasGapWhenTheSumMatchesTest', () => {
    expect(entryHasGap(entry())).toBe(false)
  })

  // A charge or an interest posting has no items at all; that is not a gap.
  it('entryHasGapWithoutItemsTest', () => {
    expect(entryHasGap(entry({ transactionCount: 0, transactionSum: undefined }))).toBe(false)
  })

  it('entryHasGapWithoutASumTest', () => {
    expect(entryHasGap(entry({ transactionSum: undefined }))).toBe(false)
  })

  // Rounding must not raise the alarm on its own.
  it('entryHasGapWithARoundingRemainderTest', () => {
    expect(entryHasGap(entry({ amount: 2500, transactionSum: 2500.001 }))).toBe(false)
  })
})

describe('importSummary', () => {
  it('importSummaryTest', () => {
    expect(importSummary(head())).toBe('3 neu')
  })

  // «0 neu» after the camt.053 that follows the camt.054 is the right answer, and the mask
  // has to say why — otherwise it reads as a lost file (backend ADR-0107).
  it('importSummaryWithDuplicatesTest', () => {
    expect(importSummary(head({ storedCount: 0, duplicateCount: 3 }))).toBe('0 neu, 3 doppelt')
  })

  it('importSummaryWithSkippedItemsTest', () => {
    expect(importSummary(head({ storedCount: 2, skippedCount: 1 }))).toBe(
      '2 neu, 1 übersprungen',
    )
  })

  it('importSummaryWhileReadingTest', () => {
    expect(importSummary(head({ state: 'RECEIVED', storedCount: 0 }))).toBe('Wird gelesen …')
  })

  it('importSummaryWhenTheFileFailedTest', () => {
    expect(
      importSummary(head({ state: 'FAILED', failureReason: 'Kein camt.053 oder camt.054' })),
    ).toBe('Kein camt.053 oder camt.054')
  })

  it('importSummaryWhenTheFileFailedWithoutAReasonTest', () => {
    expect(importSummary(head({ state: 'FAILED' }))).toBe('Konnte nicht gelesen werden')
  })
})

describe('isBeingRead', () => {
  it('isBeingReadTest', () => {
    expect(isBeingRead(head({ state: 'RECEIVED' }))).toBe(true)
    expect(isBeingRead(head())).toBe(false)
    expect(isBeingRead(head({ state: 'FAILED' }))).toBe(false)
  })
})

describe('queryStringOf', () => {
  it('queryStringOfTest', () => {
    expect(queryStringOf({ accountId: 3, state: 'PARSED' })).toBe('?accountId=3&state=PARSED')
  })

  it('queryStringOfWithNothingSetTest', () => {
    expect(queryStringOf({})).toBe('')
    expect(queryStringOf({ accountId: undefined, state: '' })).toBe('')
  })

  // `false` is left out on purpose: the only boolean here is «nur Gutschriften», and sending
  // it as false would be a filter the server has to read for nothing.
  it('queryStringOfWithFalseTest', () => {
    expect(queryStringOf({ creditsOnly: false })).toBe('')
    expect(queryStringOf({ creditsOnly: true })).toBe('?creditsOnly=true')
  })

  it('queryStringOfWithZeroTest', () => {
    expect(queryStringOf({ limit: 0 })).toBe('?limit=0')
  })
})

describe('cache keys', () => {
  // A key written twice is a cache that goes stale in one of the two places.
  it('bankStatementsKeyTest', () => {
    expect(bankStatementsKey(4)).toEqual(['bank-statements', 4])
    expect(bankStatementsKey(4, '?state=PARSED')).toEqual([
      'bank-statements',
      4,
      '?state=PARSED',
    ])
  })

  it('bankEntriesKeyTest', () => {
    expect(bankEntriesKey(4, 7)).toEqual(['bank-statements', 4, 7, 'entries'])
  })

  it('bankTransactionsKeyTest', () => {
    expect(bankTransactionsKey(4)).toEqual(['bank-transactions', 4])
  })
})

describe('the catalogues', () => {
  it('transactionStateOrderIsCompleteTest', () => {
    expect(TRANSACTION_STATE_ORDER).toHaveLength(Object.keys(TRANSACTION_STATES).length)
    for (const code of TRANSACTION_STATE_ORDER) {
      expect(TRANSACTION_STATES[code]).toBeTruthy()
    }
  })

  it('importStatesAreNamedTest', () => {
    expect(Object.keys(IMPORT_STATES)).toEqual(['RECEIVED', 'PARSED', 'FAILED'])
  })

  it('referenceTypesAreNamedTest', () => {
    expect(Object.keys(REFERENCE_TYPES)).toEqual(['QRR', 'SCOR', 'OTHER', 'NONE'])
  })
})
