import { describe, expect, it } from 'vitest'
import {
  creditNoteBodyOf,
  creditNoteRowError,
  creditNoteRowsOf,
  creditNoteRowsReady,
  creditNoteUrl,
  creditableKey,
  creditableSentence,
  creditableUrl,
  invoiceCreditNotesKey,
  invoiceCreditNotesUrl,
  type CreditNoteRow,
} from './creditNote'
import type { CreditableInvoice, CreditableLine, SalesDocument } from './types'

function creditableLine(overrides: Partial<CreditableLine> = {}): CreditableLine {
  return {
    lineId: 31,
    lineNumber: 1,
    description: 'Wartung März',
    quantity: 1,
    unit: 'Pausch.',
    unitPrice: 1250,
    priceIncludesVat: true,
    vatRate: 8.1,
    lineGross: 1250,
    creditedGross: 0,
    proposedQuantity: 1,
    proposedUnitPrice: 1250,
    ...overrides,
  }
}

function creditable(overrides: Partial<CreditableInvoice> = {}): CreditableInvoice {
  return {
    invoiceId: 9,
    documentNumber: 'RE-2026-0009',
    documentDate: '2026-03-15',
    currency: 'CHF',
    totalGross: 1250,
    credited: 0,
    writtenOff: 0,
    remaining: 1250,
    lines: [creditableLine(), creditableLine({ lineId: 32, lineNumber: 2,
      description: 'Material', quantity: 4, unitPrice: 25, lineGross: 100,
      proposedQuantity: 4, proposedUnitPrice: 25 })],
    groups: [],
    ...overrides,
  }
}

function row(overrides: Partial<CreditNoteRow> = {}): CreditNoteRow {
  return {
    line: creditableLine(),
    selected: true,
    quantity: '1',
    unitPrice: '125.00',
    description: '',
    ...overrides,
  }
}

describe('addresses and keys', () => {
  it('creditableUrlTest', () => {
    expect(creditableUrl(1, 9)).toBe('/api/tenants/1/invoices/9/creditable')
  })

  it('invoiceCreditNotesUrlTest', () => {
    expect(invoiceCreditNotesUrl(1, 9)).toBe('/api/tenants/1/invoices/9/credit-notes')
  })

  it('creditNoteUrlTest', () => {
    expect(creditNoteUrl(1, 12)).toBe('/api/tenants/1/credit-notes/12')
  })

  /** The shorter key reaches every invoice of the tenant, as react-query matches by prefix. */
  it('invoiceCreditNotesKeyTest', () => {
    expect(invoiceCreditNotesKey(1, 9)).toEqual(['invoice-credit-notes', 1, 9])
    expect(invoiceCreditNotesKey(1)).toEqual(['invoice-credit-notes', 1])
  })

  it('creditableKeyTest', () => {
    expect(creditableKey(1, 9)).toEqual(['invoice-creditable', 1, 9])
    expect(creditableKey(1)).toEqual(['invoice-creditable', 1])
  })
})

describe('creditNoteRowsOf', () => {
  it('creditNoteRowsOfTest', () => {
    const rows = creditNoteRowsOf(creditable())

    expect(rows).toHaveLength(2)
    expect(rows.every((entry) => !entry.selected)).toBe(true)
    expect(rows[1].quantity).toBe('4')
    expect(rows[1].unitPrice).toBe('25')
  })

  it('creditNoteRowsOfWithoutLinesTest', () => {
    expect(creditNoteRowsOf(creditable({ lines: [] }))).toEqual([])
  })

  /** 1’000 units whose rest does not divide: the server proposes one unit at the whole rest. */
  it('creditNoteRowsOfWithAProposalOfOneUnitTest', () => {
    const rows = creditNoteRowsOf(creditable({ lines: [creditableLine({ quantity: 1000,
      unitPrice: 0.6667, lineGross: 666.7, proposedQuantity: 1, proposedUnitPrice: 600.03 })] }))

    expect(rows[0].quantity).toBe('1')
    expect(rows[0].unitPrice).toBe('600.03')
  })

  /** A draft being changed comes back with its own lines ticked, matched by invoice line. */
  it('creditNoteRowsOfADraftTest', () => {
    const draft = {
      lines: [{ lineNumber: 1, kind: 'ITEM', predecessorLineId: 32, quantity: 2,
        unitPrice: 25, description: 'Material zurück', priceIncludesVat: true, lineNet: 0,
        lineVat: 0, lineGross: 50 }],
    } as unknown as SalesDocument // only the lines matter to the function

    const rows = creditNoteRowsOf(creditable(), draft)

    expect(rows[0].selected).toBe(false)
    expect(rows[1].selected).toBe(true)
    expect(rows[1].quantity).toBe('2')
    expect(rows[1].description).toBe('Material zurück')
  })
})

describe('creditNoteRowError', () => {
  it('creditNoteRowErrorTest', () => {
    expect(creditNoteRowError(row())).toBeUndefined()
  })

  it('creditNoteRowErrorOfAnUntickedRowTest', () => {
    expect(creditNoteRowError(row({ selected: false, quantity: '' }))).toBeUndefined()
  })

  it('creditNoteRowErrorWithZeroQuantityTest', () => {
    expect(creditNoteRowError(row({ quantity: '0' }))).toBe(
      'Die Menge muss grösser als null sein.')
  })

  it('creditNoteRowErrorWithANegativePriceTest', () => {
    expect(creditNoteRowError(row({ unitPrice: '-5' }))).toBe(
      'Der Preis muss grösser als null sein.')
  })

  it('creditNoteRowErrorWithTextTest', () => {
    expect(creditNoteRowError(row({ unitPrice: 'viel' }))).toBe(
      'Der Preis muss grösser als null sein.')
  })
})

describe('creditNoteRowsReady', () => {
  it('creditNoteRowsReadyTest', () => {
    expect(creditNoteRowsReady([row(), row({ selected: false })])).toBe(true)
  })

  it('creditNoteRowsReadyWithNothingTickedTest', () => {
    expect(creditNoteRowsReady([row({ selected: false })])).toBe(false)
  })

  it('creditNoteRowsReadyWithAWrongRowTest', () => {
    expect(creditNoteRowsReady([row(), row({ quantity: '' })])).toBe(false)
  })
})

describe('creditNoteBodyOf', () => {
  /** 125.00 on an invoice of 1’250.00: the acceptance case of issue #112. */
  it('creditNoteBodyOfTest', () => {
    const body = creditNoteBodyOf('2026-08-25', ' Vertrag V-00007 ', [
      row({ description: 'SLA-Gutschrift März' }),
      row({ selected: false, line: creditableLine({ lineId: 32 }) }),
    ])

    expect(body).toEqual({
      documentDate: '2026-08-25',
      headerText: 'Vertrag V-00007',
      lines: [{ invoiceLineId: 31, quantity: 1, unitPrice: 125,
        description: 'SLA-Gutschrift März' }],
    })
  })

  it('creditNoteBodyOfWithoutTextsTest', () => {
    const body = creditNoteBodyOf('2026-08-25', '  ', [row({ unitPrice: '1’125,50' })])

    expect(body.headerText).toBeUndefined()
    expect(body.lines[0].description).toBeUndefined()
    expect(body.lines[0].unitPrice).toBe(1125.5)
  })

  /** A draft keeps the footer and the reference it has; the dialog does not edit them. */
  it('creditNoteBodyOfADraftTest', () => {
    const body = creditNoteBodyOf('2026-08-25', '', [row()],
      { footerText: 'Danke', reference: 'Bestellung 4711' })

    expect(body.footerText).toBe('Danke')
    expect(body.reference).toBe('Bestellung 4711')
  })
})

describe('creditableSentence', () => {
  it('creditableSentenceTest', () => {
    expect(creditableSentence(creditable({ credited: 125, remaining: 1125 }))).toBe(
      'Noch gutschreibbar: 1’125.00 CHF von 1’250.00 CHF')
  })

  it('creditableSentenceWhenNothingIsLeftTest', () => {
    expect(creditableSentence(creditable({ credited: 1250, remaining: 0 }))).toBe(
      'Rechnung RE-2026-0009 ist vollständig gutgeschrieben.')
  })

  it('creditableSentenceAfterAWriteOffTest', () => {
    expect(creditableSentence(creditable({ writtenOff: 250, remaining: 1000 }))).toBe(
      'Noch gutschreibbar: 1’000.00 CHF von 1’250.00 CHF; 250.00 CHF wurden ausgebucht oder'
      + ' abgezogen')
  })

  /** After a bad debt over the whole invoice nothing is left, and it was not credited. */
  it('creditableSentenceAfterAFullWriteOffTest', () => {
    expect(creditableSentence(creditable({ writtenOff: 1250, remaining: 0 }))).toBe(
      'Rechnung RE-2026-0009 gibt nichts mehr für eine Gutschrift her; 1’250.00 CHF wurden'
      + ' ausgebucht oder abgezogen.')
  })
})
