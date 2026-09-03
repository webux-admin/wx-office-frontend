import { describe, expect, it } from 'vitest'
import {
  isComputedPosition,
  positionAllowedFor,
  positionOptionsFor,
  positionQuestionFor,
} from './accountPosition'
import { ACCOUNT_TYPE_ORDER } from './accounting'
import type { AccountType, CatalogueEntry, OrPositionCode } from './types'

/**
 * All thirty-nine positions of the minimum breakdown, in the order of the law.
 *
 * <p>Written out here and nowhere else in this frontend: the screen reads them from the
 * catalogue. This list is the mirror of the backend enum, so that the pairs below are a
 * statement of the rule and not a second copy of the implementation.
 */
const ALL_POSITIONS: OrPositionCode[] = [
  'UV_FLUESSIGE_MITTEL',
  'UV_FORDERUNGEN_LL',
  'UV_UEBRIGE_FORDERUNGEN',
  'UV_VORRAETE',
  'UV_AKTIVE_ABGRENZUNG',
  'AV_FINANZANLAGEN',
  'AV_BETEILIGUNGEN',
  'AV_SACHANLAGEN',
  'AV_IMMATERIELLE',
  'AV_NICHT_EINBEZAHLTES_KAPITAL',
  'KFK_VERBINDLICHKEITEN_LL',
  'KFK_VERZINSLICH',
  'KFK_UEBRIGE',
  'KFK_PASSIVE_ABGRENZUNG',
  'LFK_VERZINSLICH',
  'LFK_UEBRIGE',
  'LFK_RUECKSTELLUNGEN',
  'EK_GRUNDKAPITAL',
  'EK_GESETZLICHE_KAPITALRESERVE',
  'EK_GESETZLICHE_GEWINNRESERVE',
  'EK_FREIWILLIGE_GEWINNRESERVEN',
  'EK_EIGENE_KAPITALANTEILE',
  'EK_GEWINNVORTRAG',
  'EK_JAHRESERGEBNIS',
  'EK_KAPITAL_INHABER',
  'EK_PRIVAT',
  'ER_NETTOERLOESE',
  'ER_BESTANDESAENDERUNGEN',
  'ER_MATERIALAUFWAND',
  'ER_PERSONALAUFWAND',
  'ER_UEBRIGER_BETRIEBSAUFWAND',
  'ER_BETRIEBLICHER_NEBENERFOLG',
  'ER_ABSCHREIBUNGEN',
  'ER_FINANZERFOLG',
  'ER_BETRIEBSFREMD',
  'ER_AUSSERORDENTLICH',
  'ER_DIREKTE_STEUERN',
  'ER_JAHRESERGEBNIS',
  'ABSCHLUSS',
]

/** The positions of the profit and loss statement; income and expense share them. */
const PROFIT_AND_LOSS: OrPositionCode[] = [
  'ER_NETTOERLOESE',
  'ER_BESTANDESAENDERUNGEN',
  'ER_MATERIALAUFWAND',
  'ER_PERSONALAUFWAND',
  'ER_UEBRIGER_BETRIEBSAUFWAND',
  'ER_BETRIEBLICHER_NEBENERFOLG',
  'ER_ABSCHREIBUNGEN',
  'ER_FINANZERFOLG',
  'ER_BETRIEBSFREMD',
  'ER_AUSSERORDENTLICH',
  'ER_DIREKTE_STEUERN',
  'ER_JAHRESERGEBNIS',
]

/**
 * The 51 allowed pairs, by name rather than by prefix.
 *
 * <p>The same table `AccountingRulesTest` holds in the backend. Where the two drift apart, one
 * of them is wrong — and the screen would then offer a combination the database refuses.
 */
const ALLOWED: Record<AccountType, OrPositionCode[]> = {
  ASSET: [
    'UV_FLUESSIGE_MITTEL',
    'UV_FORDERUNGEN_LL',
    'UV_UEBRIGE_FORDERUNGEN',
    'UV_VORRAETE',
    'UV_AKTIVE_ABGRENZUNG',
    'AV_FINANZANLAGEN',
    'AV_BETEILIGUNGEN',
    'AV_SACHANLAGEN',
    'AV_IMMATERIELLE',
    'AV_NICHT_EINBEZAHLTES_KAPITAL',
  ],
  LIABILITY: [
    'KFK_VERBINDLICHKEITEN_LL',
    'KFK_VERZINSLICH',
    'KFK_UEBRIGE',
    'KFK_PASSIVE_ABGRENZUNG',
    'LFK_VERZINSLICH',
    'LFK_UEBRIGE',
    'LFK_RUECKSTELLUNGEN',
  ],
  EQUITY: [
    'EK_GRUNDKAPITAL',
    'EK_GESETZLICHE_KAPITALRESERVE',
    'EK_GESETZLICHE_GEWINNRESERVE',
    'EK_FREIWILLIGE_GEWINNRESERVEN',
    'EK_EIGENE_KAPITALANTEILE',
    'EK_GEWINNVORTRAG',
    'EK_JAHRESERGEBNIS',
    'EK_KAPITAL_INHABER',
    'EK_PRIVAT',
  ],
  REVENUE: PROFIT_AND_LOSS,
  EXPENSE: PROFIT_AND_LOSS,
  CLOSING: ['ABSCHLUSS'],
}

/** The catalogue as the API serves it, reduced to what this rule reads. */
function catalogue(): CatalogueEntry[] {
  return ALL_POSITIONS.map((code) => ({ code, name: `Position ${code}` }))
}

describe('positionAllowedFor', () => {
  /**
   * All 234 pairs in one loop, held against the table above.
   *
   * <p>The half of the assurance «the same truth value in the browser and in the backend» that
   * can be had without a database. The other half is
   * `AccountingModuleTest.positionCheckMatchesTheJavaRuleTest`.
   */
  it('positionAllowedForTest', () => {
    let allowed = 0
    for (const type of ACCOUNT_TYPE_ORDER) {
      for (const position of ALL_POSITIONS) {
        const expected = ALLOWED[type].includes(position)
        expect(positionAllowedFor(type, position), `${type} / ${position}`).toBe(expected)
        if (expected) allowed += 1
      }
    }

    expect(ACCOUNT_TYPE_ORDER.length * ALL_POSITIONS.length).toBe(234)
    expect(allowed).toBe(51)
  })

  /**
   * The pair the decision is built on: an income account under «Vorräte und nicht fakturierte
   * Dienstleistungen» would put the turnover in the balance sheet, and the balance sheet would
   * still add up.
   */
  it('positionAllowedForRevenueUnderInventoryTest', () => {
    expect(positionAllowedFor('REVENUE', 'UV_VORRAETE')).toBe(false)
  })

  /** Nothing chosen is not an allowed pair; it is no pair at all. */
  it('positionAllowedForWithoutValueTest', () => {
    expect(positionAllowedFor('ASSET', '')).toBe(false)
    expect(positionAllowedFor('ASSET', 'GIBT_ES_NICHT')).toBe(false)
  })
})

describe('isComputedPosition', () => {
  it('isComputedPositionTest', () => {
    expect(isComputedPosition('ER_JAHRESERGEBNIS')).toBe(true)
    expect(isComputedPosition('ABSCHLUSS')).toBe(true)
  })

  /** The result of the year in the balance sheet is a position with an account. */
  it('isComputedPositionForAnOrdinaryOneTest', () => {
    expect(isComputedPosition('EK_JAHRESERGEBNIS')).toBe(false)
    expect(isComputedPosition('')).toBe(false)
  })
})

describe('positionOptionsFor', () => {
  it('positionOptionsForTest', () => {
    const options = positionOptionsFor('ASSET', catalogue()).map((entry) => entry.code)

    expect(options).toEqual(ALLOWED.ASSET)
  })

  /**
   * The rule this dropdown exists for: the two computed positions never appear in it. The
   * database lets `ER_JAHRESERGEBNIS` through, `AccountingManagement.saveAccount` refuses it,
   * and an option that can only ever be refused has no business in a form.
   */
  it('positionOptionsForHidesTheComputedOnesTest', () => {
    const forExpense = positionOptionsFor('EXPENSE', catalogue()).map((entry) => entry.code)
    const forClosing = positionOptionsFor('CLOSING', catalogue()).map((entry) => entry.code)

    expect(forExpense).not.toContain('ER_JAHRESERGEBNIS')
    expect(forExpense).toHaveLength(11)
    expect(forClosing).toEqual([])
  })

  /**
   * Account 9200 stands on a computed position, and its dropdown has to keep showing it.
   * Without this the field would come up empty on an account somebody only meant to rename.
   */
  it('positionOptionsForKeepsTheStoredOneTest', () => {
    const options = positionOptionsFor('CLOSING', catalogue(), 'ABSCHLUSS')

    expect(options.map((entry) => entry.code)).toEqual(['ABSCHLUSS'])
    expect(options[0].name).toBe('Position ABSCHLUSS')
  })

  /**
   * A tenant may hide a catalogue value, and the positions of OR Art. 959a are exactly where
   * that must not take effect: a hidden position no account can be filed under leaves a hole
   * in the balance sheet nobody can fill again.
   */
  it('positionOptionsForIgnoresVisibleTest', () => {
    const entries = catalogue().map((entry) =>
      entry.code === 'UV_VORRAETE' ? { ...entry, visible: false } : entry,
    )

    expect(positionOptionsFor('ASSET', entries).map((entry) => entry.code)).toContain(
      'UV_VORRAETE',
    )
  })

  /** While the catalogue is on its way there is nothing to offer, and nothing to invent. */
  it('positionOptionsForWithoutCatalogueTest', () => {
    expect(positionOptionsFor('ASSET', [])).toEqual([])
    expect(positionOptionsFor('ASSET', [], 'UV_VORRAETE')).toEqual([
      { code: 'UV_VORRAETE', name: 'UV_VORRAETE' },
    ])
  })
})

describe('positionQuestionFor', () => {
  it('positionQuestionForTest', () => {
    expect(positionQuestionFor('EXPENSE')).toBe('Erscheint in der Erfolgsrechnung unter:')
    expect(positionQuestionFor('REVENUE')).toBe('Erscheint in der Erfolgsrechnung unter:')
  })

  it('positionQuestionForABalanceAccountTest', () => {
    expect(positionQuestionFor('ASSET')).toBe('Erscheint in der Bilanz unter:')
    expect(positionQuestionFor('EQUITY')).toBe('Erscheint in der Bilanz unter:')
  })

  /** The closing account belongs to neither statement, so neither wording is true of it. */
  it('positionQuestionForTheClosingTest', () => {
    expect(positionQuestionFor('CLOSING')).toBe('Erscheint im Abschluss unter:')
  })
})
