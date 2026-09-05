import { describe, expect, it } from 'vitest'
import type { Statement, StatementRow } from '../../lib/types'
import {
  columnDateOf,
  indentOf,
  isEmptyRow,
  isStrongRow,
  labelOf,
  shownRows,
} from './statementRows'

/**
 * The two switches of a statement.
 *
 * <p>The same cases run on the server in `StatementDisplayTest`. Both sides have to answer the
 * same, because the printed page shows what the screen showed.
 */
describe('shownRows', () => {
  it('shownRowsTest', () => {
    const rows = report()

    expect(shownRows(rows, false, true)).toEqual(rows)
  })

  /**
   * <b>Only what is nil in both columns goes.</b> A position that carried a figure last year and
   * none this year is the most telling line of the report; hiding it because the current column
   * is nil would turn OR Art. 958d Abs. 2 on its head.
   */
  it('hideEmptyRowsTest', () => {
    const shown = shownRows(report(), true, true)

    expect(shown.some((row) => row.position === 'UV_VORRAETE')).toBe(true)
    expect(shown.some((row) => row.position === 'UV_AKTIVE_ABGRENZUNG')).toBe(false)
  })

  /** What stands under a hidden position goes with it, or it reads as belonging elsewhere. */
  it('hideEmptyRowsTakesTheAccountsAlongTest', () => {
    const shown = shownRows(report(), true, true)

    expect(shown.some((row) => row.accountNumber === '1300')).toBe(false)
    expect(shown.some((row) => row.accountNumber === '1100')).toBe(true)
  })

  /** The headings, the sums, the totals and the proof are never hidden. */
  it('hideEmptyRowsKeepsTheFrameTest', () => {
    const kinds = new Set(shownRows(report(), true, false).map((row) => row.kind))

    expect(kinds.has('GROUP')).toBe(true)
    expect(kinds.has('SUBTOTAL')).toBe(true)
    expect(kinds.has('TOTAL')).toBe(true)
    expect(kinds.has('CONTROL')).toBe(true)
  })

  /** «Konten zeigen» takes the account lines away — and only those. */
  it('showAccountsTest', () => {
    const without = shownRows(report(), false, false)
    const withThem = shownRows(report(), false, true)

    expect(without.some((row) => row.kind === 'ACCOUNT')).toBe(false)
    expect(withThem.some((row) => row.kind === 'ACCOUNT')).toBe(true)
    // The two halves of a gross position are not accounts: OR Art. 958c Abs. 1 Ziff. 7 knows no
    // exception from the ban on offsetting, so they stay either way.
    expect(without.some((row) => row.kind === 'GROSS')).toBe(true)
  })

  /**
   * <b>A worked-out line is never hidden, however nil it reads.</b> The result of the income
   * statement and «Saldo der Erfolgsrechnung» under the result line of the balance sheet are not
   * positions that happen to be empty — they are the answer the report exists for.
   */
  it('hideEmptyKeepsAWorkedOutLineTest', () => {
    const rows: StatementRow[] = [
      position('ER_NETTOERLOESE', 0, 0),
      { ...position('ER_JAHRESERGEBNIS', 0, 0), synthetic: true },
    ]

    const shown = shownRows(rows, true, false)

    expect(shown).toHaveLength(1)
    expect(shown[0].position).toBe('ER_JAHRESERGEBNIS')
  })

  /**
   * <b>A gross position whose two halves cancel keeps them.</b> Its net amount <em>is</em> the
   * offset figure, so taking it away would net expense against income — exactly what OR Art. 958c
   * Abs. 1 Ziff. 7 forbids and what printing them gross is for.
   */
  it('hideEmptyKeepsAGrossPositionThatNetsToNilTest', () => {
    const rows: StatementRow[] = [
      position('ER_FINANZERFOLG', 0, 0),
      grossRow('davon Aufwand', -1284.55),
      grossRow('davon Ertrag', 1284.55),
    ]

    expect(shownRows(rows, true, false)).toHaveLength(3)
  })

  /** A gross position that carries nothing at all still goes: there is nothing to offset. */
  it('hideEmptyDropsAnEmptyGrossPositionTest', () => {
    const rows: StatementRow[] = [
      position('ER_FINANZERFOLG', 0, 0),
      grossRow('davon Aufwand', 0),
      grossRow('davon Ertrag', 0),
    ]

    expect(shownRows(rows, true, false)).toEqual([])
  })

  /** Nothing in gives nothing out, and never an exception. */
  it('shownRowsWithoutAnyRowTest', () => {
    expect(shownRows([], true, true)).toEqual([])
  })
})

describe('isEmptyRow', () => {
  it('isEmptyRowTest', () => {
    expect(isEmptyRow(position('UV_VORRAETE', 0, 0))).toBe(true)
    expect(isEmptyRow(position('UV_VORRAETE', 0, 11400))).toBe(false)
    expect(isEmptyRow(position('UV_VORRAETE', 12, 0))).toBe(false)
  })

  /** An absent prior column counts as nil, not as a figure: there is no year behind it. */
  it('isEmptyRowWithoutAPriorYearTest', () => {
    expect(isEmptyRow({ ...position('UV_VORRAETE', 0, 0), priorAmount: null })).toBe(true)
    expect(isEmptyRow({ ...position('UV_VORRAETE', 5, 0), priorAmount: undefined })).toBe(false)
  })
})

describe('indentOf and isStrongRow', () => {
  it('indentOfTest', () => {
    expect(indentOf({ ...position('UV_VORRAETE', 1, 1), level: 0 })).toBe(0)
    expect(indentOf({ ...position('UV_VORRAETE', 1, 1), level: 3 })).toBe(48)
  })

  it('isStrongRowTest', () => {
    expect(isStrongRow(group('AKTIVEN'))).toBe(true)
    expect(isStrongRow(position('UV_VORRAETE', 1, 1))).toBe(false)
  })
})

describe('labelOf', () => {
  /** An account line leads with its number; everything else stands as it is. */
  it('labelOfTest', () => {
    expect(labelOf(account('1100', 1, 1))).toBe('1100 Konto 1100')
    expect(labelOf(group('AKTIVEN'))).toBe('AKTIVEN')
  })
})

describe('columnDateOf', () => {
  /** The cut-off day where there is one, the last day of the year otherwise. */
  it('columnDateOfTest', () => {
    expect(columnDateOf(statement('2026-09-30'))).toBe('2026-09-30')
    expect(columnDateOf(statement(null))).toBe('2026-12-31')
  })
})

function statement(asOf: string | null): Statement {
  return {
    report: 'BALANCE_SHEET',
    fiscalYearId: 7,
    fiscalYearLabel: '2026',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    asOf,
    currency: 'CHF',
    priorFiscalYearId: null,
    priorFiscalYearLabel: null,
    drafts: { count: 0, amount: 0 },
    control: null,
    notes: [],
    rows: [],
  }
}

/** A small report with everything in it, mirroring the Java fixture line for line. */
function report(): StatementRow[] {
  return [
    group('AKTIVEN', 0),
    group('Umlaufvermögen', 1),
    position('UV_FORDERUNGEN_LL', 127400, 98230.55),
    account('1100', 127400, 98230.55),
    position('UV_VORRAETE', 0, 11400),
    position('UV_AKTIVE_ABGRENZUNG', 0, 0),
    account('1300', 0, 0, 'UV_AKTIVE_ABGRENZUNG'),
    sum('SUBTOTAL', 1, 'Umlaufvermögen', 127400, 109630.55),
    sum('TOTAL', 0, 'TOTAL AKTIVEN', 127400, 109630.55),
    {
      kind: 'GROSS',
      level: 3,
      position: 'ER_FINANZERFOLG',
      label: 'davon Aufwand',
      amount: -1284.55,
      priorAmount: -1420,
      negativeItem: false,
      synthetic: false,
    },
    sum('CONTROL', 0, 'Aktiven minus Passiven', 0, 0),
  ]
}

/** One half of a gross position, under ER_FINANZERFOLG. */
function grossRow(label: string, amount: number): StatementRow {
  return {
    kind: 'GROSS',
    level: 1,
    position: 'ER_FINANZERFOLG',
    label,
    amount,
    priorAmount: 0,
    negativeItem: false,
    synthetic: false,
  }
}

function group(label: string, level = 0): StatementRow {
  return { kind: 'GROUP', level, label, negativeItem: false, synthetic: false }
}

function position(code: string, amount: number, priorAmount: number): StatementRow {
  return {
    kind: 'POSITION',
    level: 2,
    position: code,
    label: code,
    amount,
    priorAmount,
    negativeItem: false,
    synthetic: false,
  }
}

function account(
  number: string,
  amount: number,
  priorAmount: number,
  code = 'UV_FORDERUNGEN_LL',
): StatementRow {
  return {
    kind: 'ACCOUNT',
    level: 3,
    position: code,
    label: `Konto ${number}`,
    accountId: Number(number),
    accountNumber: number,
    amount,
    priorAmount,
    negativeItem: false,
    synthetic: false,
  }
}

function sum(
  kind: StatementRow['kind'],
  level: number,
  label: string,
  amount: number,
  priorAmount: number,
): StatementRow {
  return { kind, level, label, amount, priorAmount, negativeItem: false, synthetic: false }
}
