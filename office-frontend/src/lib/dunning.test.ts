import { describe, expect, it } from 'vitest'
import {
  DUNNING_GROUPINGS,
  DUNNING_GROUPING_HINTS,
  DUNNING_RIGHTS,
  FEE_BOOKINGS,
  FEE_VAT_MODES,
  DUNNING_CHANNELS,
  DUNNING_CHANNEL_HINTS,
  DUNNING_SKIP_REASONS,
  activeLevelCount,
  availableChannels,
  channelSummary,
  candidateKey,
  configurationProblems,
  dunningLevelLabel,
  escalationProblem,
  insertPlaceholder,
  isHighestLevel,
  isWithdrawn,
  narrowedDocumentIds,
  noticeDispatchLabel,
  runSummary,
  singleInvoiceTokensIn,
} from './dunning'
import type {
  DunningCandidate,
  DunningChannelChoice,
  DunningGrouping,
  DunningLevel,
  DunningNotice,
  DunningPlaceholder,
  OutboxSummary,
  DunningSkipReason,
} from './types'

/** One level, with only the parts these functions look at spelled out. */
function level(overrides: Partial<DunningLevel> = {}): DunningLevel {
  return {
    id: 1,
    levelNo: 1,
    dunningTypeId: 7,
    dunningTypeName: 'Zahlungserinnerung',
    daysAfterDue: 10,
    paymentDays: 10,
    minDaysSincePrevious: 0,
    feeAmount: 0,
    active: true,
    ...overrides,
  }
}

/** The four shipped levels, as the backend creates them on first use. */
function shipped(): DunningLevel[] {
  return [
    level({ id: 1, levelNo: 1, daysAfterDue: 10, minDaysSincePrevious: 0 }),
    level({ id: 2, levelNo: 2, daysAfterDue: 20, minDaysSincePrevious: 10 }),
    level({ id: 3, levelNo: 3, daysAfterDue: 30, minDaysSincePrevious: 10 }),
    level({ id: 4, levelNo: 4, daysAfterDue: 45, minDaysSincePrevious: 10 }),
  ]
}

describe('isHighestLevel', () => {
  it('isHighestLevelTest', () => {
    const levels = shipped()

    expect(isHighestLevel(levels, levels[3])).toBe(true)
  })

  it('isHighestLevelOfAMiddleLevelTest', () => {
    const levels = shipped()

    expect(isHighestLevel(levels, levels[1])).toBe(false)
  })

  /** The only level is also the highest, so it may go. */
  it('isHighestLevelOfTheOnlyLevelTest', () => {
    const only = level()

    expect(isHighestLevel([only], only)).toBe(true)
  })

  /** A switched off level still holds its position, so it still blocks the one below. */
  it('isHighestLevelWithASwitchedOffTopTest', () => {
    const levels = shipped()
    levels[3] = { ...levels[3], active: false }

    expect(isHighestLevel(levels, levels[2])).toBe(false)
  })
})

describe('activeLevelCount', () => {
  it('activeLevelCountTest', () => {
    expect(activeLevelCount(shipped())).toBe(4)
  })

  it('activeLevelCountWithSwitchedOffLevelsTest', () => {
    const levels = shipped()
    levels[3] = { ...levels[3], active: false }

    expect(activeLevelCount(levels)).toBe(3)
  })

  it('activeLevelCountOfNothingTest', () => {
    expect(activeLevelCount([])).toBe(0)
  })
})

describe('escalationProblem', () => {
  it('escalationProblemOfTheShippedSequenceTest', () => {
    expect(escalationProblem(shipped())).toBeNull()
  })

  it('escalationProblemOfASingleLevelTest', () => {
    expect(escalationProblem([level()])).toBeNull()
  })

  it('escalationProblemOfNothingTest', () => {
    expect(escalationProblem([])).toBeNull()
  })

  it('escalationProblemWithAnEarlierDeadlineTest', () => {
    const levels = [level({ id: 1, levelNo: 1, daysAfterDue: 20 }),
      level({ id: 2, levelNo: 2, daysAfterDue: 10 })]

    expect(escalationProblem(levels)).toContain('Stufe 2')
  })

  /** The same day twice is allowed; only going backwards is not. */
  it('escalationProblemWithEqualDeadlinesTest', () => {
    const levels = [level({ id: 1, levelNo: 1, daysAfterDue: 20 }),
      level({ id: 2, levelNo: 2, daysAfterDue: 20 })]

    expect(escalationProblem(levels)).toBeNull()
  })

  it('escalationProblemWithASmallerFeeTest', () => {
    const levels = [level({ id: 1, levelNo: 1, feeAmount: 20 }),
      level({ id: 2, levelNo: 2, daysAfterDue: 20, feeAmount: 10 })]

    expect(escalationProblem(levels)).toContain('Gebühr')
  })

  it('escalationProblemWithALongerPaymentPeriodTest', () => {
    const levels = [level({ id: 1, levelNo: 1, paymentDays: 10 }),
      level({ id: 2, levelNo: 2, daysAfterDue: 20, paymentDays: 20 })]

    expect(escalationProblem(levels)).toContain('Zahlfrist')
  })

  /** A switched off level is not part of the escalation and must not block a fix. */
  it('escalationProblemIgnoresSwitchedOffLevelsTest', () => {
    const levels = [
      level({ id: 1, levelNo: 1, daysAfterDue: 10 }),
      level({ id: 2, levelNo: 2, daysAfterDue: 5, paymentDays: 30, active: false }),
      level({ id: 3, levelNo: 3, daysAfterDue: 30 }),
    ]

    expect(escalationProblem(levels)).toBeNull()
  })

  /** The order is judged by position, whatever order the list arrives in. */
  it('escalationProblemSortsFirstTest', () => {
    const levels = [
      level({ id: 3, levelNo: 3, daysAfterDue: 30 }),
      level({ id: 1, levelNo: 1, daysAfterDue: 10 }),
      level({ id: 2, levelNo: 2, daysAfterDue: 20 }),
    ]

    expect(escalationProblem(levels)).toBeNull()
  })
})

describe('the catalogues', () => {
  it('everyGroupingHasALabelAndAHintTest', () => {
    const codes: DunningGrouping[] = ['PER_INVOICE', 'PER_PARTNER']

    for (const code of codes) {
      expect(DUNNING_GROUPINGS[code]).toBeTruthy()
      expect(DUNNING_GROUPING_HINTS[code]).toBeTruthy()
    }
  })

  it('everyFeeCatalogueIsCompleteTest', () => {
    expect(Object.keys(FEE_BOOKINGS)).toHaveLength(2)
    expect(Object.keys(FEE_VAT_MODES)).toHaveLength(3)
  })

  /** Five rights: issuing and withdrawing are deliberately not the same one. */
  it('theRightsTest', () => {
    expect(Object.values(DUNNING_RIGHTS)).toEqual([
      'DUNNING_READ',
      'DUNNING_WRITE',
      'DUNNING_CONFIGURE',
      'DUNNING_RUN',
      'DUNNING_WITHDRAW',
    ])
  })
})

describe('insertPlaceholder', () => {
  it('insertPlaceholderTest', () => {
    const result = insertPlaceholder('Guten Tag ', 'kunde', 10, 10)

    expect(result.text).toBe('Guten Tag {{kunde}}')
    expect(result.cursor).toBe(19)
  })

  /** At the cursor, not at the end: a placeholder belongs inside the sentence. */
  it('insertPlaceholderInTheMiddleTest', () => {
    const result = insertPlaceholder('Guten Tag , wie geht es?', 'kunde', 10, 10)

    expect(result.text).toBe('Guten Tag {{kunde}}, wie geht es?')
  })

  it('insertPlaceholderReplacesTheSelectionTest', () => {
    const result = insertPlaceholder('Guten Tag NAME', 'kunde', 10, 14)

    expect(result.text).toBe('Guten Tag {{kunde}}')
  })

  it('insertPlaceholderIntoAnEmptyFieldTest', () => {
    expect(insertPlaceholder('', 'kunde', 0, 0).text).toBe('{{kunde}}')
  })

  /** A stale cursor from a field that shrank must not throw or lose text. */
  it('insertPlaceholderWithAnOutOfRangeCursorTest', () => {
    const result = insertPlaceholder('kurz', 'kunde', 99, 120)

    expect(result.text).toBe('kurz{{kunde}}')
  })

  it('insertPlaceholderWithAnInvertedSelectionTest', () => {
    const result = insertPlaceholder('Guten Tag', 'kunde', 5, 2)

    expect(result.text).toBe('Guten{{kunde}} Tag')
  })
})

describe('singleInvoiceTokensIn', () => {
  const catalogue: DunningPlaceholder[] = [
    { token: 'kunde', availableWhenCollective: true },
    { token: 'gesamtoffenerbetrag', availableWhenCollective: true },
    { token: 'rechnungsnummer', availableWhenCollective: false },
    { token: 'offenerbetrag', availableWhenCollective: false },
  ]

  it('singleInvoiceTokensInTest', () => {
    const used = singleInvoiceTokensIn(
      ['Ihre Rechnung {{rechnungsnummer}}', 'Offen {{offenerbetrag}}'],
      catalogue,
    )

    expect(used.sort()).toEqual(['offenerbetrag', 'rechnungsnummer'])
  })

  /** A text that only uses the always-available ones survives a collective letter. */
  it('singleInvoiceTokensInACollectiveSafeTextTest', () => {
    expect(singleInvoiceTokensIn(['{{kunde}} schuldet {{gesamtoffenerbetrag}}'], catalogue))
      .toEqual([])
  })

  it('singleInvoiceTokensInNothingTest', () => {
    expect(singleInvoiceTokensIn([], catalogue)).toEqual([])
    expect(singleInvoiceTokensIn([undefined, ''], catalogue)).toEqual([])
  })

  it('singleInvoiceTokensInNamesEachOnceTest', () => {
    const used = singleInvoiceTokensIn(
      ['{{rechnungsnummer}}', '{{rechnungsnummer}} noch einmal'],
      catalogue,
    )

    expect(used).toEqual(['rechnungsnummer'])
  })

  it('singleInvoiceTokensInIgnoresAnUnknownOneTest', () => {
    expect(singleInvoiceTokensIn(['{{quatsch}}'], catalogue)).toEqual([])
  })

  /** Spaces inside the braces are how the backend reads them too. */
  it('singleInvoiceTokensInWithSpacingTest', () => {
    expect(singleInvoiceTokensIn(['{{  rechnungsnummer  }}'], catalogue))
      .toEqual(['rechnungsnummer'])
  })
})

/** One letter of the work list, with only the parts these functions look at. */
function candidate(overrides: Partial<DunningCandidate> = {}): DunningCandidate {
  return {
    partnerId: 42,
    partnerName: 'Muster AG',
    languageCode: 'de',
    levelNo: 1,
    levelName: 'Zahlungserinnerung',
    invoices: [
      {
        documentId: 7,
        documentNumber: 'RE-2026-0007',
        documentDate: '2026-06-12',
        dueDate: '2026-07-12',
        currency: 'CHF',
        totalGross: 1250,
        openAmount: 1250,
        openBaseAmount: 1250,
        daysOverdue: 48,
      },
    ],
    openAmount: 1250,
    currency: 'CHF',
    oldestDueDate: '2026-07-12',
    maxDaysOverdue: 48,
    ...overrides,
  }
}

describe('configurationProblems', () => {
  /** Only what a setting fixes — telling somebody «not due yet» in a banner trains them
   *  to ignore the banner. */
  it('configurationProblemsTest', () => {
    const list = [
      candidate({ skipReason: 'FEE_ACCOUNT_MISSING' }),
      candidate({ skipReason: 'NOT_DUE' }),
    ]

    expect(configurationProblems(list)).toEqual(['FEE_ACCOUNT_MISSING'])
  })

  it('configurationProblemsNamesEachOnceTest', () => {
    const list = [
      candidate({ skipReason: 'LEVEL_REMOVED' }),
      candidate({ skipReason: 'LEVEL_REMOVED' }),
    ]

    expect(configurationProblems(list)).toEqual(['LEVEL_REMOVED'])
  })

  it('configurationProblemsOfAHealthyListTest', () => {
    expect(configurationProblems([candidate()])).toEqual([])
  })

  it('configurationProblemsOfNothingTest', () => {
    expect(configurationProblems([])).toEqual([])
  })
})

describe('candidateKey', () => {
  it('candidateKeyTest', () => {
    expect(candidateKey(candidate())).toBe('42|1|de|7')
  })

  /** One customer can appear twice on the same level in single mode, so the documents
   *  belong in the key. */
  it('candidateKeyTellsTwoLettersOfOneCustomerApartTest', () => {
    const one = candidate()
    const other = candidate({
      invoices: [{ ...one.invoices[0], documentId: 9, documentNumber: 'RE-2026-0009' }],
    })

    expect(candidateKey(one)).not.toBe(candidateKey(other))
  })

  it('candidateKeyOfACollectiveLetterTest', () => {
    const collective = candidate({
      invoices: [
        { ...candidate().invoices[0], documentId: 7 },
        { ...candidate().invoices[0], documentId: 9 },
      ],
    })

    expect(candidateKey(collective)).toBe('42|1|de|7-9')
  })

  /** Two languages are two letters, even for the same customer on the same level. */
  it('candidateKeyTellsLanguagesApartTest', () => {
    expect(candidateKey(candidate())).not.toBe(candidateKey(candidate({ languageCode: 'fr' })))
  })
})

describe('the skip reasons', () => {
  /** Every reason gets a sentence: the point of the list is that a reader sees why. */
  it('everySkipReasonHasASentenceTest', () => {
    const reasons: DunningSkipReason[] = [
      'BLOCKED',
      'NO_DUE_DATE',
      'LEVEL_REMOVED',
      'EXHAUSTED',
      'BELOW_MINIMUM',
      'NOT_DUE',
      'COOLING_OFF',
      'NO_ADDRESS',
      'FEE_ACCOUNT_MISSING',
      'FEE_DOCUMENT_TYPE_MISSING',
    ]

    for (const reason of reasons) {
      expect(DUNNING_SKIP_REASONS[reason]).toBeTruthy()
    }
    expect(Object.keys(DUNNING_SKIP_REASONS)).toHaveLength(reasons.length)
  })
})

/** One issued reminder, with only the parts these functions look at spelled out. */
function notice(overrides: Partial<DunningNotice> = {}): DunningNotice {
  return {
    id: 3,
    noticeNumber: 'MA-2026-0001',
    fiscalYear: 2026,
    issuedAt: '2026-08-29T07:00:00Z',
    issuedOn: '2026-08-29',
    payableUntil: '2026-09-08',
    partnerId: 42,
    recipientName: 'Muster AG',
    languageCode: 'de',
    currency: 'CHF',
    levelNo: 1,
    levelName: 'Zahlungserinnerung',
    levelTitle: 'Zahlungserinnerung',
    feeAmount: 0,
    totalOpenAmount: 1250,
    channel: 'PRINT',
    lines: [
      {
        documentId: 7,
        documentNumber: 'RE-2026-0007',
        documentDate: '2026-06-12',
        dueDate: '2026-07-12',
        daysOverdue: 48,
        totalGross: 1250,
        settledAmount: 0,
        openAmount: 1250,
      },
    ],
    ...overrides,
  }
}

describe('narrowedDocumentIds', () => {
  it('narrowedDocumentIdsTest', () => {
    const collective = candidate({
      invoices: [
        { ...candidate().invoices[0], documentId: 7 },
        { ...candidate().invoices[0], documentId: 9 },
      ],
    })

    expect(narrowedDocumentIds([collective])).toEqual([7, 9])
  })

  /** All invoices of a letter travel together — never some of them. */
  it('narrowedDocumentIdsOfSeveralLettersTest', () => {
    const other = candidate({
      partnerId: 43,
      invoices: [{ ...candidate().invoices[0], documentId: 11 }],
    })

    expect(narrowedDocumentIds([candidate(), other])).toEqual([7, 11])
  })

  /** The same invoice can only be in one letter, but a duplicate must not double it. */
  it('narrowedDocumentIdsWithoutDuplicatesTest', () => {
    expect(narrowedDocumentIds([candidate(), candidate()])).toEqual([7])
  })

  it('narrowedDocumentIdsOfNothingTest', () => {
    expect(narrowedDocumentIds([])).toEqual([])
  })
})

describe('runSummary', () => {
  /** Letters and invoices are two numbers as soon as the tenant chases per customer. */
  it('runSummaryTest', () => {
    const collective = candidate({
      invoices: [
        { ...candidate().invoices[0], documentId: 7 },
        { ...candidate().invoices[0], documentId: 9 },
        { ...candidate().invoices[0], documentId: 11 },
      ],
    })
    const other = candidate({
      partnerId: 43,
      invoices: [{ ...candidate().invoices[0], documentId: 13 }],
    })

    expect(runSummary([collective, other])).toBe('2 Mahnungen über 4 Rechnungen')
  })

  it('runSummaryOfOneLetterTest', () => {
    expect(runSummary([candidate()])).toBe('1 Mahnung über 1 Rechnung')
  })

  it('runSummaryOfNothingTest', () => {
    expect(runSummary([])).toBe('0 Mahnungen über 0 Rechnungen')
  })
})

describe('isWithdrawn', () => {
  it('isWithdrawnTest', () => {
    expect(isWithdrawn(notice({ withdrawnAt: '2026-08-30T07:00:00Z' }))).toBe(true)
  })

  it('isWithdrawnOfAStandingNoticeTest', () => {
    expect(isWithdrawn(notice())).toBe(false)
  })
})

describe('dunningLevelLabel', () => {
  it('dunningLevelLabelTest', () => {
    expect(dunningLevelLabel({ documentId: 7, level: 2 })).toBe('2. Mahnung')
  })

  /** Level 0 shows nothing at all — an invoice that was never chased says so by silence. */
  it('dunningLevelLabelOfAnUnchasedInvoiceTest', () => {
    expect(dunningLevelLabel({ documentId: 7, level: 0 })).toBeNull()
  })

  it('dunningLevelLabelWhileLoadingTest', () => {
    expect(dunningLevelLabel(undefined)).toBeNull()
  })
})

describe('the channel catalogues', () => {
  /** Three ways to ask, and each one gets a sentence — a bare code teaches nobody. */
  it('everyChannelHasAWordAndASentenceTest', () => {
    const channels: DunningChannelChoice[] = ['AUTO', 'MAIL', 'PRINT']
    for (const channel of channels) {
      expect(DUNNING_CHANNELS[channel].length).toBeGreaterThan(0)
      expect(DUNNING_CHANNEL_HINTS[channel].length).toBeGreaterThan(0)
    }
  })
})

describe('availableChannels', () => {
  it('availableChannelsTest', () => {
    expect(availableChannels(true)).toEqual(['AUTO', 'MAIL', 'PRINT'])
  })

  /** Without a working outbox «nur per Mail» would promise what the run cannot do. */
  it('availableChannelsWithoutAnOutboxTest', () => {
    expect(availableChannels(false)).toEqual(['PRINT'])
  })
})

describe('channelSummary', () => {
  it('channelSummaryTest', () => {
    const byMail = candidate({ channel: 'MAIL' })
    const onPaper = candidate({ partnerId: 43, channel: 'PRINT' })

    expect(channelSummary([byMail, byMail, onPaper])).toBe('2 per Mail, 1 auf Papier')
  })

  it('channelSummaryOfPaperOnlyTest', () => {
    expect(channelSummary([candidate({ channel: 'PRINT' })])).toBe('1 auf Papier')
  })

  it('channelSummaryOfMailOnlyTest', () => {
    expect(channelSummary([candidate({ channel: 'MAIL' })])).toBe('1 per Mail')
  })

  /** Nothing to send is «0 auf Papier», not a crash and not an empty string. */
  it('channelSummaryOfNothingTest', () => {
    expect(channelSummary([])).toBe('0 auf Papier')
  })
})

describe('noticeDispatchLabel', () => {
  it('noticeDispatchLabelOfAPrintedNoticeTest', () => {
    expect(noticeDispatchLabel('PRINT', [])).toBe('Gedruckt')
  })

  it('noticeDispatchLabelOfASentNoticeTest', () => {
    expect(noticeDispatchLabel('MAIL', [message('SENT')]))
      .toBe('Gesendet an kunde@example.ch')
  })

  it('noticeDispatchLabelWhileQueuedTest', () => {
    expect(noticeDispatchLabel('MAIL', [message('QUEUED')])).toBe('Wartet im Postausgang')
  })

  it('noticeDispatchLabelAfterAFailureTest', () => {
    expect(noticeDispatchLabel('MAIL', [message('FAILED')])).toBe('Versand fehlgeschlagen')
  })

  /** Meant for mail but nothing in the outbox: it was issued and has to be printed. */
  it('noticeDispatchLabelWithoutAnyMessageTest', () => {
    expect(noticeDispatchLabel('MAIL', []))
      .toBe('Kein Versand protokolliert — bitte drucken')
  })
})

function message(status: OutboxSummary['status']): OutboxSummary {
  return {
    id: 1,
    status,
    recipients: 'kunde@example.ch',
    subject: 'Zahlungserinnerung MA-2026-0001',
    attempts: 1,
    sentAt: status === 'SENT' ? '2026-08-29T07:00:00Z' : undefined,
    createdAt: '2026-08-29T07:00:00Z',
  }
}
