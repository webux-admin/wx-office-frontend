import { describe, expect, it } from 'vitest'
import {
  MAX_DURATION_MINUTES,
  MIN_DURATION_MINUTES,
  clockTime,
  formatDuration,
  formatDurationShort,
  readDuration,
  type DurationReading,
} from './duration'

/** The minutes a field was read as, or what it said instead. */
function minutesOf(reading: DurationReading): number | string {
  if (reading.state === 'read') return reading.duration.minutes
  return reading.state === 'refused' ? reading.message : 'empty'
}

describe('readDuration', () => {
  /**
   * The table of the issue (#122, decision 3): every format a person types, each meaning the
   * same hour and a half or close to it.
   */
  it('readDurationTest', () => {
    const table: [string, number][] = [
      ['1:30', 90],
      ['1.5', 90],
      ['1,5', 90],
      ['90m', 90],
      ['2h', 120],
      ['2h 15m', 135],
      ['9-10:30', 90],
      ['9:00-10:30', 90],
    ]

    for (const [input, minutes] of table) {
      expect(minutesOf(readDuration(input)), input).toBe(minutes)
    }
  })

  /** A number without a unit is hours, a whole one as well as a fraction. */
  it('readDurationWithoutUnitTest', () => {
    const table: [string, number][] = [
      ['2', 120],
      ['8', 480],
      ['0.25', 15],
      ['0,75', 45],
      ['1.1', 66],
    ]

    for (const [input, minutes] of table) {
      expect(minutesOf(readDuration(input)), input).toBe(minutes)
    }
  })

  /** The spellings around the units, and the words the screen writes back itself. */
  it('readDurationWithUnitsTest', () => {
    const table: [string, number][] = [
      ['1.5h', 90],
      ['1,5 h', 90],
      ['2h15m', 135],
      ['2h15', 135],
      ['2 H 15 M', 135],
      ['90 min', 90],
      ['45min.', 45],
      ['2 std', 120],
      ['1 Std. 30 Min.', 90],
      ['1 Std. 30', 90],
      ['0:45', 45],
      ['  1:30  ', 90],
    ]

    for (const [input, minutes] of table) {
      expect(minutesOf(readDuration(input)), input).toBe(minutes)
    }
  })

  /** A range keeps its two times of day, on the minute and written the way the backend reads. */
  it('readDurationWithRangeTest', () => {
    expect(readDuration('9-10:30')).toEqual({
      state: 'read',
      duration: { minutes: 90, startTime: '09:00', endTime: '10:30' },
    })
    expect(readDuration('08:15 - 12')).toEqual({
      state: 'read',
      duration: { minutes: 225, startTime: '08:15', endTime: '12:00' },
    })
  })

  /** The dash a Mac keyboard types between two times means the same as the hyphen. */
  it('readDurationWithEnDashTest', () => {
    expect(minutesOf(readDuration('9:00–10:30'))).toBe(90)
  })

  /** Midnight as the end is the end of the day, written 00:00 as the backend writes it. */
  it('readDurationWithRangeToMidnightTest', () => {
    const toMidnight = { minutes: 120, startTime: '22:00', endTime: '00:00' }

    expect(readDuration('22-24')).toEqual({ state: 'read', duration: toMidnight })
    expect(readDuration('22:00-24:00')).toEqual({ state: 'read', duration: toMidnight })
    expect(readDuration('22-0')).toEqual({ state: 'read', duration: toMidnight })
    expect(readDuration('22:00-00:00')).toEqual({ state: 'read', duration: toMidnight })
  })

  /** The two ends of what an entry may be: one minute, and the whole day. */
  it('readDurationAtTheBoundsTest', () => {
    expect(minutesOf(readDuration('1m'))).toBe(MIN_DURATION_MINUTES)
    expect(minutesOf(readDuration('0:01'))).toBe(MIN_DURATION_MINUTES)
    expect(minutesOf(readDuration('24:00'))).toBe(MAX_DURATION_MINUTES)
    expect(minutesOf(readDuration('24'))).toBe(MAX_DURATION_MINUTES)
    expect(minutesOf(readDuration('1440m'))).toBe(MAX_DURATION_MINUTES)
    expect(readDuration('0-24')).toEqual({
      state: 'read',
      duration: { minutes: MAX_DURATION_MINUTES, startTime: '00:00', endTime: '00:00' },
    })
  })

  /** A fraction of an hour is rounded to the minute, half a minute up. */
  it('readDurationRoundsToTheMinuteTest', () => {
    expect(minutesOf(readDuration('1.33'))).toBe(80)
    expect(minutesOf(readDuration('0.01'))).toBe(1)
    expect(minutesOf(readDuration('0.125'))).toBe(8)
  })

  it('readDurationOfAnEmptyFieldTest', () => {
    expect(readDuration('')).toEqual({ state: 'empty' })
    expect(readDuration('   ')).toEqual({ state: 'empty' })
  })

  /** The refusals the issue names: nothing, more than a day, over midnight and text. */
  it('readDurationRefusesTest', () => {
    const table: [string, string][] = [
      ['0:00', 'mindestens 1 Minute'],
      ['24:01', 'höchstens 24 Stunden'],
      ['25h', 'höchstens 24 Stunden'],
      ['23-1', 'über Mitternacht'],
      ['Telefon', 'Keine Dauer erkannt'],
    ]

    for (const [input, message] of table) {
      expect(minutesOf(readDuration(input)), input).toContain(message)
    }
  })

  /** Every way to say «nothing» is refused, not read as zero. */
  it('readDurationRefusesNothingTest', () => {
    for (const input of ['0', '0h', '0m', '0.004', '00:00']) {
      expect(minutesOf(readDuration(input)), input).toContain('mindestens 1 Minute')
    }
  })

  /** One minute more than a day, in each of the forms. */
  it('readDurationRefusesMoreThanADayTest', () => {
    for (const input of ['25', '24.01', '1441m', '24h 1m', '25:00']) {
      expect(minutesOf(readDuration(input)), input).toContain('höchstens 24 Stunden')
    }
  })

  /** A range has to end after it starts; the same time twice is no time at all. */
  it('readDurationRefusesARangeThatDoesNotEndAfterItStartsTest', () => {
    for (const input of ['10-9', '9-9', '23:30-0:15', '24-1']) {
      expect(minutesOf(readDuration(input)), input).toContain('Bis muss nach Von liegen')
    }
  })

  /** Times of day that do not exist, and minutes that are no minutes. */
  it('readDurationRefusesWhatIsNoTimeTest', () => {
    for (const input of ['25-26', '9:75-10', '9-24:30', '1:75', '1:5', '9:5-10', '100:00']) {
      expect(minutesOf(readDuration(input)), input).toContain('Keine Dauer erkannt')
    }
  })

  /** Signs, separators that mean something else and units in the wrong order are refused. */
  it('readDurationRefusesOtherTextTest', () => {
    for (const input of ['-1', '1.5-2', '8.30-10', '15m 2h', 'h', '1,5m', 'eins']) {
      expect(minutesOf(readDuration(input)), input).toContain('Keine Dauer erkannt')
    }
  })
})

describe('formatDuration', () => {
  it('formatDurationTest', () => {
    expect(formatDuration(90)).toBe('1 Std. 30 Min.')
  })

  it('formatDurationOfWholeHoursTest', () => {
    expect(formatDuration(120)).toBe('2 Std.')
    expect(formatDuration(1440)).toBe('24 Std.')
  })

  it('formatDurationBelowAnHourTest', () => {
    expect(formatDuration(45)).toBe('45 Min.')
    expect(formatDuration(1)).toBe('1 Min.')
  })

  it('formatDurationOfNothingTest', () => {
    expect(formatDuration(0)).toBe('0 Min.')
  })

  /** What the screen writes can be typed back and means the same. */
  it('formatDurationReadsBackTest', () => {
    for (const minutes of [1, 45, 90, 120, 1439]) {
      expect(minutesOf(readDuration(formatDuration(minutes)))).toBe(minutes)
    }
  })
})

describe('formatDurationShort', () => {
  it('formatDurationShortTest', () => {
    expect(formatDurationShort(465)).toBe('7:45')
  })

  it('formatDurationShortWithFewMinutesTest', () => {
    expect(formatDurationShort(5)).toBe('0:05')
    expect(formatDurationShort(60)).toBe('1:00')
  })

  it('formatDurationShortOfNothingTest', () => {
    expect(formatDurationShort(0)).toBe('0:00')
  })

  /** A week of work is more than 24 hours and stays in hours. */
  it('formatDurationShortOfAWeekTest', () => {
    expect(formatDurationShort(1345)).toBe('22:25')
    expect(formatDurationShort(2550)).toBe('42:30')
  })
})

describe('clockTime', () => {
  it('clockTimeTest', () => {
    expect(clockTime(630)).toBe('10:30')
  })

  it('clockTimeOfBothMidnightsTest', () => {
    expect(clockTime(0)).toBe('00:00')
    expect(clockTime(MAX_DURATION_MINUTES)).toBe('00:00')
  })

  it('clockTimeOfTheLastMinuteTest', () => {
    expect(clockTime(1439)).toBe('23:59')
  })
})
