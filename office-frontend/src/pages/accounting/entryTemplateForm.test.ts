// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import {
  emptyEntryDraft,
  emptyEntryRow,
  readEntryDraft,
  writeEntryDraft,
  type EntryDraftRow,
} from '../../lib/accounting'
import type { Account, EntryTemplate, EntryTemplateLine, TaxCode } from '../../lib/types'
import {
  orderPayload,
  payloadOf,
  replacementWarning,
  rescueHeadline,
  rescueStateOf,
  rowsFromTemplate,
  stateFromRescue,
  templateRequestOf,
  type TemplateHeader,
} from './entryTemplateForm'

afterEach(() => {
  window.sessionStorage.clear()
})

const CHART: Account[] = [
  {
    id: 1,
    accountNumber: '1020',
    name: 'Bankguthaben',
    accountType: 'ASSET',
    orPosition: 'UV_FLUESSIGE_MITTEL',
    directPostingAllowed: true,
    active: true,
  },
  {
    id: 4,
    accountNumber: '6000',
    name: 'Raumaufwand',
    accountType: 'EXPENSE',
    orPosition: 'ER_UEBRIGER_BETRIEBSAUFWAND',
    directPostingAllowed: true,
    active: true,
  },
]

const VST81: TaxCode = {
  id: 50,
  code: 'VST81',
  name: 'Vorsteuer 8.1 %',
  direction: 'INPUT',
  kind: 'NORMAL',
  rate: 8.1,
  taxAccountNumber: '1170',
  taxAccountName: 'Vorsteuer',
  estvDigit: '400',
  inTurnoverTotal: false,
  validFrom: '2024-01-01',
  active: true,
  sortOrder: 100,
}

function header(over: Partial<TemplateHeader> = {}): TemplateHeader {
  return {
    name: 'Miete Geschäftslokal',
    description: 'jeden Monatsletzten',
    entryDescription: 'Miete September',
    documentReference: 'MB-144',
    accounts: CHART,
    taxCodes: [VST81],
    ...over,
  }
}

function row(over: Partial<EntryDraftRow>): EntryDraftRow {
  return { ...emptyEntryRow(1), ...over }
}

/** The two rows of the rent entry, as they stand in the grid. */
const TYPED: EntryDraftRow[] = [
  row({ key: 1, accountId: 4, accountText: '6000 Raumaufwand', debit: '3200' }),
  row({ key: 2, accountId: 1, accountText: '1020 Bankguthaben', credit: '3200' }),
]

function line(over: Partial<EntryTemplateLine>): EntryTemplateLine {
  return {
    accountId: 4,
    accountNumber: '6000',
    accountName: 'Raumaufwand',
    side: 'DEBIT',
    amount: 3200,
    taxCodeId: null,
    taxCode: null,
    text: null,
    postable: true,
    ...over,
  }
}

function template(over: Partial<EntryTemplate> = {}): EntryTemplate {
  return {
    id: 300,
    name: 'Miete Geschäftslokal',
    description: 'jeden Monatsletzten',
    entryDescription: 'Miete September',
    documentReference: 'MB-144',
    carriesAmounts: true,
    sortOrder: 0,
    version: 3,
    lines: [
      line({}),
      line({ accountId: 1, accountNumber: '1020', accountName: 'Bankguthaben', side: 'CREDIT' }),
    ],
    problems: [],
    ...over,
  }
}

describe('payloadOf', () => {
  it('payloadOfTest', () => {
    const payload = payloadOf(TYPED, header(), true)

    expect(payload.name).toBe('Miete Geschäftslokal')
    expect(payload.description).toBe('jeden Monatsletzten')
    expect(payload.entryDescription).toBe('Miete September')
    expect(payload.documentReference).toBe('MB-144')
    // The number and not the id: a template stores what stays readable when an account goes.
    expect(payload.lines).toEqual([
      { accountNumber: '6000', side: 'DEBIT', amount: 3200, taxCode: null, text: null },
      { accountNumber: '1020', side: 'CREDIT', amount: 3200, taxCode: null, text: null },
    ])
  })

  /** Without the tick every line goes out empty, and applying leaves the amount fields empty. */
  it('payloadOfWithoutAmountsTest', () => {
    const payload = payloadOf(TYPED, header(), false)

    expect(payload.lines.map((entry) => entry.amount)).toEqual([null, null])
    expect(payload.lines.map((entry) => entry.side)).toEqual(['DEBIT', 'CREDIT'])
  })

  /** The last row of a grid is almost always the one somebody stopped typing in. */
  it('payloadOfWithEmptyRowTest', () => {
    const payload = payloadOf([...TYPED, emptyEntryRow(3)], header(), true)

    expect(payload.lines).toHaveLength(2)
  })

  /** The code and not the id, for the same reason as the account number. */
  it('payloadOfKeepsTheTaxCodeTest', () => {
    const payload = payloadOf([row({ key: 1, accountId: 4, debit: '3200', taxCodeId: 50 })],
      header(), true)

    expect(payload.lines[0].taxCode).toBe('VST81')
  })

  /** An empty field is no value: the server tells «not given» and «empty» apart. */
  it('payloadOfWithoutADescriptionTest', () => {
    const payload = payloadOf(TYPED, header({ description: '  ', documentReference: '' }), true)

    expect(payload.description).toBeNull()
    expect(payload.documentReference).toBeNull()
  })
})

describe('rowsFromTemplate', () => {
  it('rowsFromTemplateTest', () => {
    const rows = rowsFromTemplate(template())

    expect(rows).toEqual([
      {
        key: 1,
        accountId: 4,
        accountText: '6000 Raumaufwand',
        debit: '3200.00',
        credit: '',
        taxCodeId: null,
      },
      {
        key: 2,
        accountId: 1,
        accountText: '1020 Bankguthaben',
        debit: '',
        credit: '3200.00',
        taxCodeId: null,
      },
    ])
  })

  /**
   * The account is gone from the chart. The row keeps the number so it is readable which one
   * was meant, and carries no account — the grid marks it red and the line is not sent.
   */
  it('rowsFromTemplateWithUnknownAccountTest', () => {
    const gone = template({
      lines: [
        line({ accountId: null, accountNumber: '6105', accountName: null, postable: false }),
        line({ accountId: 1, accountNumber: '1020', accountName: 'Bankguthaben', side: 'CREDIT' }),
      ],
    })

    const rows = rowsFromTemplate(gone)

    expect(rows[0].accountId).toBeNull()
    expect(rows[0].accountText).toBe('6105')
    expect(rows[1].accountId).toBe(1)
  })

  /** A locked account exists but may not be posted on by hand: the same empty row. */
  it('rowsFromTemplateWithLockedAccountTest', () => {
    const locked = template({
      lines: [line({ accountId: 9, accountNumber: '9200', accountName: 'Abschluss',
        postable: false })],
    })

    expect(rowsFromTemplate(locked)[0].accountId).toBeNull()
  })

  /** Without amounts both fields stay empty rather than showing a zero. */
  it('rowsFromTemplateWithoutAmountsTest', () => {
    const rows = rowsFromTemplate(template({
      carriesAmounts: false,
      lines: [line({ amount: null }), line({ amount: null, side: 'CREDIT' })],
    }))

    expect(rows.map((entry) => entry.debit)).toEqual(['', ''])
    expect(rows.map((entry) => entry.credit)).toEqual(['', ''])
  })
})

describe('orderPayload', () => {
  const THREE = [
    template({ id: 300, name: 'Miete', sortOrder: 0, version: 3 }),
    template({ id: 301, name: 'Lohn', sortOrder: 1, version: 7 }),
    template({ id: 302, name: 'Krankentaggeld', sortOrder: 2, version: 1 }),
  ]

  it('orderPayloadTest', () => {
    const steps = orderPayload(THREE, 1, -1)

    expect(steps.map((entry) => entry.id)).toEqual([301, 300])
    expect(steps.map((entry) => entry.request.sortOrder)).toEqual([0, 1])
  })

  /** The first row cannot go up, and the mask draws the arrow disabled for the same reason. */
  it('orderPayloadAtTheTopTest', () => {
    expect(orderPayload(THREE, 0, -1)).toEqual([])
    expect(orderPayload(THREE, 2, 1)).toEqual([])
    expect(orderPayload([], 0, 1)).toEqual([])
  })

  /**
   * The one that matters: each of the two requests carries the version of **its own** row.
   * A shared version would answer 409 on the second request of the pair, and without a version
   * not a single arrow press would go through at all.
   */
  it('orderPayloadCarriesTheVersionTest', () => {
    const steps = orderPayload(THREE, 1, 1)

    expect(steps.map((entry) => [entry.id, entry.request.version])).toEqual([
      [301, 7],
      [302, 1],
    ])
  })

  /** The body is the whole template: the endpoint replaces what it is given. */
  it('orderPayloadKeepsTheLinesTest', () => {
    const steps = orderPayload(THREE, 0, 1)

    expect(steps[0].request.lines).toHaveLength(2)
    expect(steps[0].request.name).toBe('Miete')
  })
})

describe('templateRequestOf', () => {
  it('templateRequestOfTest', () => {
    const request = templateRequestOf(template(), { name: 'Miete Lager' })

    expect(request.name).toBe('Miete Lager')
    expect(request.version).toBe(3)
    expect(request.sortOrder).toBe(0)
    expect(request.lines[0].accountNumber).toBe('6000')
  })

  /**
   * The two header fields are overridable like everything else. Overwriting a template is the
   * one documented way to change it, and a type that let only name, description and lines
   * through kept the old entry text and the old voucher on every overwrite.
   */
  it('templateRequestOfChangesTheHeaderFieldsTest', () => {
    const request = templateRequestOf(template(), {
      entryDescription: 'Miete Oktober',
      documentReference: 'MB-145',
    })

    expect(request.entryDescription).toBe('Miete Oktober')
    expect(request.documentReference).toBe('MB-145')
    // And nothing else moved: the place and the version are not the caller's to set.
    expect(request.version).toBe(3)
    expect(request.sortOrder).toBe(0)
  })

  /** Nothing given, nothing changed — the whole template goes back out as it was read. */
  it('templateRequestOfWithoutAnythingOverTest', () => {
    const request = templateRequestOf(template())

    expect(request.entryDescription).toBe('Miete September')
    expect(request.documentReference).toBe('MB-144')
    expect(request.lines).toHaveLength(2)
  })
})

describe('rescueHeadline', () => {
  it('rescueHeadlineTest', () => {
    const line = rescueHeadline('2026-09-09T14:12:00.000Z')

    expect(line.startsWith('Sie hatten hier etwas angefangen — zuletzt ')).toBe(true)
    expect(line.endsWith('.')).toBe(true)
    expect(line).not.toContain('zuletzt -')
  })

  /**
   * The state of a tab that typed under the shipped version before this one: it wrote no stamp
   * at all. «zuletzt -.» reads as a broken screen at exactly the moment somebody is deciding
   * whether to trust what is offered back, so the sentence stops before the moment.
   */
  it('rescueHeadlineWithoutAStampTest', () => {
    expect(rescueHeadline(undefined)).toBe('Sie hatten hier etwas angefangen.')
    expect(rescueHeadline('')).toBe('Sie hatten hier etwas angefangen.')
    expect(rescueHeadline('   ')).toBe('Sie hatten hier etwas angefangen.')
  })

  /** A stamp nobody can read is no stamp: it is not put on the screen raw either. */
  it('rescueHeadlineWithAnUnreadableStampTest', () => {
    expect(rescueHeadline('gestern')).toBe('Sie hatten hier etwas angefangen.')
  })
})

describe('replacementWarning', () => {
  /** The ordinary case: two rows stand in the grid and a template would replace them. */
  it('replacementWarningTest', () => {
    const draft = { ...emptyEntryDraft('2026-09-09'), rows: TYPED }

    expect(replacementWarning(draft)).toBe('Die 2 getippten Zeilen werden ersetzt.')
  })

  /** One row is one row, and the sentence has to read like German. */
  it('replacementWarningWithOneRowTest', () => {
    const draft = { ...emptyEntryDraft('2026-09-09'), rows: [TYPED[0], emptyEntryRow(2)] }

    expect(replacementWarning(draft)).toBe('Die getippte Zeile wird ersetzt.')
  })

  /**
   * The one that was missing: applying replaces the entry text and the voucher too, so somebody
   * who typed both and has not filled a row yet has something to lose — and has to be asked.
   */
  it('replacementWarningWithOnlyTheHeaderTest', () => {
    const draft = {
      ...emptyEntryDraft('2026-09-09'),
      description: 'Miete September',
      documentReference: 'MB-144',
    }

    expect(replacementWarning(draft)).toBe(
      'Der getippte Text und der getippte Beleg werden ersetzt.',
    )
  })

  /** Only the text, only the voucher: each is worth the question on its own. */
  it('replacementWarningWithOneHeaderFieldTest', () => {
    const text = { ...emptyEntryDraft('2026-09-09'), description: 'Miete September' }
    const voucher = { ...emptyEntryDraft('2026-09-09'), documentReference: 'MB-144' }

    expect(replacementWarning(text)).toBe('Der getippte Text wird ersetzt.')
    expect(replacementWarning(voucher)).toBe('Der getippte Beleg wird ersetzt.')
  })

  /**
   * The gap that was still open after the two header fields were closed: a row where nothing
   * but the tax code was chosen. The mask keeps such a row — `isDirty` asks for `taxCodeId` by
   * name and writes the state to the rescue store — and applying a template replaces the rows
   * outright. Without the question that choice was thrown away silently.
   */
  it('replacementWarningWithOnlyATaxCodeTest', () => {
    const draft = {
      ...emptyEntryDraft('2026-09-09'),
      rows: [row({ key: 1, taxCodeId: VST81.id }), emptyEntryRow(2)],
    }

    expect(replacementWarning(draft)).toBe('Die getippte Zeile wird ersetzt.')
  })

  /** Rows and header together, named in one sentence. */
  it('replacementWarningWithEverythingTest', () => {
    const draft = {
      ...emptyEntryDraft('2026-09-09'),
      description: 'Miete September',
      documentReference: 'MB-144',
      rows: TYPED,
    }

    expect(replacementWarning(draft)).toBe(
      'Die 2 getippten Zeilen, der getippte Text und der getippte Beleg werden ersetzt.',
    )
  })

  /**
   * An untouched mask has nothing to replace, and the template is taken without a question. The
   * date does not count: a template carries none, and the date stays.
   */
  it('replacementWarningWithNothingTypedTest', () => {
    expect(replacementWarning(emptyEntryDraft('2026-09-09'))).toBeUndefined()
    expect(
      replacementWarning({
        ...emptyEntryDraft('2026-09-09'),
        description: '   ',
        documentReference: '  ',
      }),
    ).toBeUndefined()
  })
})

describe('rescueStateOf', () => {
  it('rescueStateOfTest', () => {
    const state = { ...emptyEntryDraft('2026-09-09'), description: 'Miete September' }

    const stamped = rescueStateOf(state, '2026-09-09T14:12:00.000Z')

    expect(stamped.savedAt).toBe('2026-09-09T14:12:00.000Z')
    expect(stamped.description).toBe('Miete September')
    // The stamp belongs to the rescue store and to nothing else: the original is untouched.
    expect(state.savedAt).toBeUndefined()
  })
})

describe('stateFromRescue', () => {
  it('stateFromRescueTest', () => {
    const rescued = rescueStateOf(
      { ...emptyEntryDraft('2026-09-09'), description: 'Miete September', rows: TYPED },
      '2026-09-09T14:12:00.000Z',
    )

    const offer = stateFromRescue(rescued)

    expect(offer?.rowCount).toBe(2)
    expect(offer?.description).toBe('Miete September')
    expect(offer?.savedAt).toBe('2026-09-09T14:12:00.000Z')
    expect(offer?.state.rows).toHaveLength(2)
  })

  /**
   * A state the shipped version before this one wrote: it carries no stamp at all. The offer
   * passes the absence on instead of filling an empty string in, which the banner would put on
   * the screen as «zuletzt -».
   */
  it('stateFromRescueWithoutAStampTest', () => {
    const offer = stateFromRescue({
      ...emptyEntryDraft('2026-09-09'),
      description: 'Miete September',
    })

    expect(offer?.savedAt).toBeUndefined()
    expect(rescueHeadline(offer?.savedAt)).toBe('Sie hatten hier etwas angefangen.')
  })

  /**
   * The same row on the way back: a chosen tax code is a row here too. The mask writes such a
   * state to the store, so the banner has to offer it back and has to count it — «0 Zeilen»
   * over a state that holds a decision is a banner nobody believes.
   */
  it('stateFromRescueWithOnlyATaxCodeTest', () => {
    const offer = stateFromRescue({
      ...emptyEntryDraft('2026-09-09'),
      rows: [row({ key: 1, taxCodeId: VST81.id }), emptyEntryRow(2)],
    })

    expect(offer?.rowCount).toBe(1)
    expect(offer?.state.rows[0].taxCodeId).toBe(VST81.id)
  })

  /** Nothing typed: no banner. An empty mask is not something to offer back. */
  it('stateFromRescueWithoutAnythingTypedTest', () => {
    expect(stateFromRescue(emptyEntryDraft('2026-09-09'))).toBeUndefined()
    expect(stateFromRescue(null)).toBeUndefined()
  })

  /**
   * A rescue store somebody put garbage into. `readEntryDraft` drops it, and nothing is offered
   * — no exception reaches the render, and the mask opens empty.
   */
  it('stateFromRescueWithBrokenJsonTest', () => {
    window.sessionStorage.setItem('webux.accounting.draft.7', '{kein JSON')

    expect(() => stateFromRescue(readEntryDraft(7))).not.toThrow()
    expect(stateFromRescue(readEntryDraft(7))).toBeUndefined()
  })

  /** And the round trip through the store, because that is the way it actually arrives. */
  it('stateFromRescueAfterAReloadTest', () => {
    writeEntryDraft(7, rescueStateOf(
      { ...emptyEntryDraft('2026-09-09'), description: 'Miete September', rows: TYPED },
      '2026-09-09T14:12:00.000Z',
    ))

    expect(stateFromRescue(readEntryDraft(7))?.rowCount).toBe(2)
  })
})
