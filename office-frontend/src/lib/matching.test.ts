import { describe, expect, it } from 'vitest'
import {
  AMOUNT_NAMES,
  AMOUNT_ORDER,
  CONFIDENCE_HINTS,
  CONFIDENCE_NAMES,
  CONFIDENCE_ORDER,
  CONFIDENCE_TONES,
  PARTY_NAMES,
  PARTY_ORDER,
  REFERENCE_NAMES,
  REFERENCE_ORDER,
  STAGE_NAMES,
  isSafe,
  matchRulesKey,
  matchSettingsKey,
  matchesKey,
  payerAccountsKey,
  reasonChips,
} from './matching'
import type { Confidence, MatchProposal } from './types'

function proposal(over: Partial<MatchProposal> = {}): MatchProposal {
  return {
    id: 1,
    transactionId: 2,
    rank: 1,
    documentId: 3,
    documentNumber: 'RE-2026-0418',
    partnerId: 7,
    partnerName: 'Muster Bau AG',
    proposedAmount: 1000,
    currencyCode: 'CHF',
    remainder: 0,
    stage: 1,
    confidence: 'HOCH',
    reviewRequired: false,
    partyMatch: 'NEIN',
    referenceMatch: 'EINDEUTIG',
    amountMatch: 'EINER',
    reason: 'Die QR-Referenz zeigt auf RE-2026-0418 von Muster Bau AG.',
    status: 'OFFEN',
    safe: true,
    ...over,
  }
}

describe('reasonChips', () => {
  it('reasonChipsTest', () => {
    expect(reasonChips(proposal())).toEqual(['QR- oder Creditor-Referenz'])
  })

  it('reasonChipsWithAPartyTest', () => {
    const chips = reasonChips(proposal({ stage: 4, partyMatch: 'VOLL', nameScore: 0.93 }))

    expect(chips).toContain('Zahlername')
    expect(chips).toContain('Partei sicher')
    expect(chips).toContain('Name 0,93')
  })

  // Positive: the invoice stays partly open. Negative: more arrived than was owed.
  it('reasonChipsWithARemainderTest', () => {
    expect(reasonChips(proposal({ remainder: 0.03 }))).toContain('Restbetrag offen')
    expect(reasonChips(proposal({ remainder: -12 }))).toContain('Überzahlung')
  })

  it('reasonChipsWithAReviewFlagTest', () => {
    expect(reasonChips(proposal({ reviewRequired: true }))).toContain('Prüfung nötig')
  })

  it('reasonChipsWithAnAmbiguousReferenceTest', () => {
    expect(reasonChips(proposal({ referenceMatch: 'MEHRDEUTIG' }))).toContain('mehrdeutig')
  })

  /** An unknown step number must not produce an empty chip. */
  it('reasonChipsWithAnUnknownStageTest', () => {
    expect(reasonChips(proposal({ stage: 99 }))).toEqual([])
  })
})

describe('isSafe', () => {
  it('isSafeTest', () => {
    expect(isSafe(proposal())).toBe(true)
  })

  /** Only what is still open may be taken over; a decision is not overruled. */
  it('isSafeWithADecisionAlreadyMadeTest', () => {
    expect(isSafe(proposal({ status: 'ANGENOMMEN' }))).toBe(false)
    expect(isSafe(proposal({ status: 'ZURUECKGEZOGEN' }))).toBe(false)
  })

  /** The server decides what is safe; the browser only reads the answer. */
  it('isSafeFollowsTheServerTest', () => {
    expect(isSafe(proposal({ safe: false, confidence: 'HOCH', reviewRequired: false }))).toBe(
      false,
    )
  })
})

describe('the catalogues', () => {
  it('confidenceIsNamedNotNumberedTest', () => {
    expect(Object.keys(CONFIDENCE_NAMES)).toEqual(['HOCH', 'MITTEL', 'TIEF'])
    for (const step of CONFIDENCE_ORDER) {
      expect(CONFIDENCE_NAMES[step]).toBeTruthy()
      expect(CONFIDENCE_HINTS[step]).toBeTruthy()
      expect(CONFIDENCE_TONES[step]).toBeTruthy()
      // No percentage anywhere: a score cannot be explained to an audit.
      expect(CONFIDENCE_NAMES[step]).not.toMatch(/%|\d/)
    }
  })

  it('everyFindingIsNamedTest', () => {
    for (const code of PARTY_ORDER) expect(PARTY_NAMES[code]).toBeTruthy()
    for (const code of REFERENCE_ORDER) expect(REFERENCE_NAMES[code]).toBeTruthy()
    for (const code of AMOUNT_ORDER) expect(AMOUNT_NAMES[code]).toBeTruthy()
  })

  it('everyStageIsNamedTest', () => {
    for (let stage = 1; stage <= 8; stage += 1) {
      expect(STAGE_NAMES[stage]).toBeTruthy()
    }
  })

  /** The pickers offer «egal» first: a rule that ignores a feature is the common case. */
  it('thePickersOfferEgalFirstTest', () => {
    expect(PARTY_ORDER[0]).toBe('EGAL')
    expect(REFERENCE_ORDER[0]).toBe('EGAL')
    expect(AMOUNT_ORDER[0]).toBe('EGAL')
  })

  it('confidenceOrderIsStrongestFirstTest', () => {
    expect(CONFIDENCE_ORDER).toEqual<Confidence[]>(['HOCH', 'MITTEL', 'TIEF'])
  })
})

describe('cache keys', () => {
  // A key written twice is a cache that goes stale in one of the two places.
  it('matchRulesKeyTest', () => {
    expect(matchRulesKey(4)).toEqual(['bank-match-rules', 4])
  })

  it('matchSettingsKeyTest', () => {
    expect(matchSettingsKey(4)).toEqual(['bank-match-settings', 4])
  })

  it('matchesKeyTest', () => {
    expect(matchesKey(4)).toEqual(['bank-matches', 4])
    expect(matchesKey(4, 9)).toEqual(['bank-matches', 4, 9])
  })

  it('payerAccountsKeyTest', () => {
    expect(payerAccountsKey(4, 7)).toEqual(['payer-accounts', 4, 7])
  })
})
