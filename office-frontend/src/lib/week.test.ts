import { describe, expect, it } from 'vitest'
import {
  addDays,
  dayTitle,
  isWeekend,
  isoWeek,
  mondayOf,
  shortDayLabel,
  weekDays,
  weekLabel,
  weekdayIndex,
} from './week'

describe('addDays', () => {
  it('addDaysTest', () => {
    expect(addDays('2026-11-23', 2)).toBe('2026-11-25')
  })

  it('addDaysBackTest', () => {
    expect(addDays('2026-11-25', -7)).toBe('2026-11-18')
  })

  it('addDaysWithNothingTest', () => {
    expect(addDays('2026-11-25', 0)).toBe('2026-11-25')
  })

  /** Across the end of a month and of a year, and into and out of a leap day. */
  it('addDaysAcrossBoundariesTest', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01')
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01')
  })

  /** The night the clocks go forward has 23 hours; a day stays a day all the same. */
  it('addDaysAcrossTheChangeToSummerTimeTest', () => {
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29')
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30')
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26')
  })
})

describe('weekdayIndex', () => {
  it('weekdayIndexTest', () => {
    expect(weekdayIndex('2026-11-25')).toBe(2)
  })

  it('weekdayIndexAtTheEndsOfTheWeekTest', () => {
    expect(weekdayIndex('2026-11-23')).toBe(0)
    expect(weekdayIndex('2026-11-29')).toBe(6)
  })
})

describe('mondayOf', () => {
  it('mondayOfTest', () => {
    expect(mondayOf('2026-11-25')).toBe('2026-11-23')
  })

  it('mondayOfAMondayTest', () => {
    expect(mondayOf('2026-11-23')).toBe('2026-11-23')
  })

  /** Sunday belongs to the week that started six days before, not to the next one. */
  it('mondayOfASundayTest', () => {
    expect(mondayOf('2026-11-29')).toBe('2026-11-23')
  })

  it('mondayOfAWeekAcrossTheYearTest', () => {
    expect(mondayOf('2027-01-03')).toBe('2026-12-28')
  })
})

describe('weekDays', () => {
  it('weekDaysTest', () => {
    expect(weekDays('2026-11-23')).toEqual([
      '2026-11-23',
      '2026-11-24',
      '2026-11-25',
      '2026-11-26',
      '2026-11-27',
      '2026-11-28',
      '2026-11-29',
    ])
  })

  it('weekDaysAcrossTheYearTest', () => {
    const days = weekDays('2026-12-28')

    expect(days).toHaveLength(7)
    expect(days[3]).toBe('2026-12-31')
    expect(days[6]).toBe('2027-01-03')
  })
})

describe('isoWeek', () => {
  it('isoWeekTest', () => {
    expect(isoWeek('2026-11-25')).toEqual({ year: 2026, week: 48 })
  })

  /** 2026 starts on a Thursday and so has 53 weeks; the last one reaches into 2027. */
  it('isoWeekFiftyThreeTest', () => {
    expect(isoWeek('2026-12-31')).toEqual({ year: 2026, week: 53 })
    expect(isoWeek('2027-01-03')).toEqual({ year: 2026, week: 53 })
    expect(isoWeek('2027-01-04')).toEqual({ year: 2027, week: 1 })
  })

  /** The last days of December can lie in week 1 of the next year. */
  it('isoWeekOneInDecemberTest', () => {
    expect(isoWeek('2024-12-30')).toEqual({ year: 2025, week: 1 })
  })

  /** The first days of January can lie in the last week of the year before. */
  it('isoWeekOfTheFirstDaysOfJanuaryTest', () => {
    expect(isoWeek('2021-01-03')).toEqual({ year: 2020, week: 53 })
    expect(isoWeek('2022-01-01')).toEqual({ year: 2021, week: 52 })
  })

  it('isoWeekOfALeapDayTest', () => {
    expect(isoWeek('2028-02-29')).toEqual({ year: 2028, week: 9 })
  })
})

describe('weekLabel', () => {
  it('weekLabelTest', () => {
    expect(weekLabel('2026-11-23')).toBe('KW 48 · 23.–29. Nov. 2026')
  })

  it('weekLabelAcrossTwoMonthsTest', () => {
    expect(weekLabel('2026-11-30')).toBe('KW 49 · 30. Nov. – 6. Dez. 2026')
    expect(weekLabel('2028-02-28')).toBe('KW 9 · 28. Feb. – 5. März 2028')
  })

  it('weekLabelAcrossTwoYearsTest', () => {
    expect(weekLabel('2026-12-28')).toBe('KW 53 · 28. Dez. 2026 – 3. Jan. 2027')
  })

  it('weekLabelOfTheFirstWeekTest', () => {
    expect(weekLabel('2027-01-04')).toBe('KW 1 · 4.–10. Jan. 2027')
  })
})

describe('shortDayLabel', () => {
  it('shortDayLabelTest', () => {
    expect(shortDayLabel('2026-11-23')).toBe('Mo 23.')
  })

  it('shortDayLabelOfASundayAndTheFirstTest', () => {
    expect(shortDayLabel('2026-11-29')).toBe('So 29.')
    expect(shortDayLabel('2027-01-01')).toBe('Fr 1.')
  })
})

describe('dayTitle', () => {
  it('dayTitleTest', () => {
    expect(dayTitle('2026-11-25')).toBe('Mittwoch, 25. November')
  })

  it('dayTitleOfALeapDayTest', () => {
    expect(dayTitle('2028-02-29')).toBe('Dienstag, 29. Februar')
  })

  it('dayTitleAtTheEndsOfTheYearTest', () => {
    expect(dayTitle('2027-01-01')).toBe('Freitag, 1. Januar')
    expect(dayTitle('2026-12-31')).toBe('Donnerstag, 31. Dezember')
  })
})

describe('isWeekend', () => {
  it('isWeekendTest', () => {
    expect(isWeekend('2026-11-28')).toBe(true)
    expect(isWeekend('2026-11-29')).toBe(true)
  })

  it('isWeekendOnAWorkdayTest', () => {
    expect(isWeekend('2026-11-23')).toBe(false)
    expect(isWeekend('2026-11-27')).toBe(false)
  })
})
