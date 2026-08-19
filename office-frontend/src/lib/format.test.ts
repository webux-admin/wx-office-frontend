import { describe, expect, it } from 'vitest'
import {
  formatAmount,
  formatCount,
  formatDate,
  formatDateTime,
  formatLongDate,
  formatPercent,
  formatQuantity,
  formatRelativeTime,
  initialsOf,
  parseDecimal,
  toIsoDate,
} from './format'

/** Swiss thousands separator: the right single quotation mark, not an ASCII apostrophe. */
const GROUP = '’'

describe('formatAmount', () => {
  it('formatAmountTest', () => {
    expect(formatAmount(1250)).toBe(`1${GROUP}250.00`)
  })

  it('formatAmountWithZeroTest', () => {
    expect(formatAmount(0)).toBe('0.00')
  })

  it('formatAmountWithNegativeValueTest', () => {
    expect(formatAmount(-19.9)).toBe('-19.90')
  })

  it('formatAmountRoundsToTwoDecimalsTest', () => {
    expect(formatAmount(8.125)).toBe('8.13')
    expect(formatAmount(8.124)).toBe('8.12')
  })

  it('formatAmountWithoutValueTest', () => {
    expect(formatAmount(undefined)).toBe('-')
    expect(formatAmount(null)).toBe('-')
    expect(formatAmount(Number.NaN)).toBe('-')
  })
})

describe('formatCount', () => {
  it('formatCountTest', () => {
    expect(formatCount(1842)).toBe(`1${GROUP}842`)
  })

  it('formatCountWithZeroTest', () => {
    expect(formatCount(0)).toBe('0')
  })

  it('formatCountWithoutValueTest', () => {
    expect(formatCount(undefined)).toBe('-')
  })
})

describe('formatLongDate', () => {
  it('formatLongDateTest', () => {
    expect(formatLongDate(new Date(2026, 7, 18))).toBe('Dienstag, 18. August 2026')
  })

  it('formatLongDateOnALeapDayTest', () => {
    expect(formatLongDate(new Date(2024, 1, 29))).toBe('Donnerstag, 29. Februar 2024')
  })
})

describe('initialsOf', () => {
  it('initialsOfTest', () => {
    expect(initialsOf('Martin Muster')).toBe('MM')
  })

  it('initialsOfWithOneWordTest', () => {
    expect(initialsOf('mmuster')).toBe('M')
  })

  it('initialsOfWithThreeWordsTest', () => {
    expect(initialsOf('Jean Pierre Dubois')).toBe('JD')
  })

  it('initialsOfWithSurroundingSpaceTest', () => {
    expect(initialsOf('  Sandra   Bucher  ')).toBe('SB')
  })

  it('initialsOfWithEmptyNameTest', () => {
    expect(initialsOf('')).toBe('')
    expect(initialsOf('   ')).toBe('')
  })
})

describe('formatDate', () => {
  it('formatDateTest', () => {
    expect(formatDate('2026-08-18')).toBe('18.08.2026')
  })

  it('formatDateKeepsTheDayItWasGivenTest', () => {
    // A LocalDate carries no time zone. Parsing it into a Date would move it a day west of
    // Greenwich, which is exactly what this function avoids.
    expect(formatDate('2026-01-01')).toBe('01.01.2026')
    expect(formatDate('2026-12-31')).toBe('31.12.2026')
  })

  it('formatDateWithoutValueTest', () => {
    expect(formatDate(undefined)).toBe('-')
    expect(formatDate(null)).toBe('-')
    expect(formatDate('')).toBe('-')
  })

  it('formatDateWithUnexpectedValueTest', () => {
    expect(formatDate('irgendwann')).toBe('irgendwann')
  })
})

describe('formatDateTime', () => {
  it('formatDateTimeTest', () => {
    const formatted = formatDateTime('2026-08-18T12:05:00Z')

    expect(formatted).toMatch(/^18\.08\.2026, \d{2}:\d{2}$/)
  })

  it('formatDateTimeWithoutValueTest', () => {
    expect(formatDateTime(undefined)).toBe('-')
  })

  it('formatDateTimeWithUnexpectedValueTest', () => {
    expect(formatDateTime('kein Zeitpunkt')).toBe('kein Zeitpunkt')
  })
})

describe('formatQuantity', () => {
  it('formatQuantityTest', () => {
    expect(formatQuantity(2.5)).toBe('2.5')
  })

  it('formatQuantityDropsEmptyDecimalsTest', () => {
    expect(formatQuantity(3)).toBe('3')
    expect(formatQuantity(0)).toBe('0')
  })

  it('formatQuantityWithoutValueTest', () => {
    expect(formatQuantity(undefined)).toBe('-')
    expect(formatQuantity(Number.NaN)).toBe('-')
  })
})

describe('formatPercent', () => {
  it('formatPercentTest', () => {
    expect(formatPercent(8.1)).toBe('8.1 %')
  })

  it('formatPercentWithZeroTest', () => {
    expect(formatPercent(0)).toBe('0 %')
  })

  it('formatPercentWithoutValueTest', () => {
    expect(formatPercent(null)).toBe('-')
  })
})

describe('parseDecimal', () => {
  it('parseDecimalTest', () => {
    expect(parseDecimal('12.50')).toBe(12.5)
  })

  it('parseDecimalAcceptsTheSwissKeyboardTest', () => {
    // Comma as the decimal separator, apostrophe as the thousands separator.
    expect(parseDecimal('12,50')).toBe(12.5)
    expect(parseDecimal('1' + GROUP + '842.00')).toBe(1842)
    expect(parseDecimal("1'842")).toBe(1842)
  })

  it('parseDecimalWithEmptyInputTest', () => {
    expect(parseDecimal('')).toBeNull()
    expect(parseDecimal('   ')).toBeNull()
  })

  it('parseDecimalWithZeroTest', () => {
    expect(parseDecimal('0')).toBe(0)
  })

  it('parseDecimalWithSomethingElseTest', () => {
    expect(parseDecimal('zwoelf')).toBeNull()
    expect(parseDecimal('12.5.3')).toBeNull()
  })
})

describe('toIsoDate', () => {
  it('toIsoDateTest', () => {
    expect(toIsoDate(new Date(2026, 7, 18))).toBe('2026-08-18')
  })

  it('toIsoDatePadsMonthAndDayTest', () => {
    expect(toIsoDate(new Date(2026, 0, 1))).toBe('2026-01-01')
  })

  it('toIsoDateUsesTheLocalDayTest', () => {
    // Just after midnight local time; toISOString would still report the previous day east
    // of Greenwich.
    expect(toIsoDate(new Date(2026, 2, 15, 0, 30))).toBe('2026-03-15')
  })
})

describe('formatRelativeTime', () => {
  const NOW = new Date('2026-08-18T12:00:00Z')

  it('formatRelativeTimeTest', () => {
    expect(formatRelativeTime('2026-08-18T11:55:00Z', NOW)).toBe('vor 5 Minuten')
  })

  it('formatRelativeTimePicksTheLargestFittingUnitTest', () => {
    expect(formatRelativeTime('2026-08-18T11:59:30Z', NOW)).toBe('vor 30 Sekunden')
    expect(formatRelativeTime('2026-08-18T10:00:00Z', NOW)).toBe('vor 2 Stunden')
    expect(formatRelativeTime('2026-08-15T12:00:00Z', NOW)).toBe('vor 3 Tagen')
    expect(formatRelativeTime('2026-06-18T12:00:00Z', NOW)).toBe('vor 2 Monaten')
    expect(formatRelativeTime('2024-08-18T12:00:00Z', NOW)).toBe('vor 2 Jahren')
  })

  it('formatRelativeTimeAtTheUnitBoundaryTest', () => {
    // Exactly one minute must already be counted in minutes, not as 60 seconds.
    expect(formatRelativeTime('2026-08-18T11:59:00Z', NOW)).toBe('vor 1 Minute')
    expect(formatRelativeTime('2026-08-18T11:00:00Z', NOW)).toBe('vor 1 Stunde')
  })

  it('formatRelativeTimeWithNoDistanceTest', () => {
    expect(formatRelativeTime('2026-08-18T12:00:00Z', NOW)).toBe('jetzt')
  })

  it('formatRelativeTimeInTheFutureTest', () => {
    // A clock skew between server and browser must not produce nonsense.
    expect(formatRelativeTime('2026-08-18T12:03:00Z', NOW)).toBe('in 3 Minuten')
  })

  it('formatRelativeTimeWithoutValueTest', () => {
    expect(formatRelativeTime(undefined, NOW)).toBe('-')
    expect(formatRelativeTime(null, NOW)).toBe('-')
    expect(formatRelativeTime('', NOW)).toBe('-')
  })

  it('formatRelativeTimeWithUnexpectedValueTest', () => {
    expect(formatRelativeTime('irgendwann', NOW)).toBe('irgendwann')
  })
})
