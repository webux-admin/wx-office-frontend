import { describe, expect, it } from 'vitest'
import { composeDueAt, splitDueAt } from './dueAt'

/**
 * The assertions avoid naming a fixed instant: the two functions translate between local
 * time and UTC, and a fixed instant would tie the test to the time zone of the machine it
 * runs on. What is asserted instead is the shape of the instant and that the two functions
 * undo each other.
 */

/** The instant as UTC with a trailing Z, which is what the backend stores. */
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.\d{3}Z$/

describe('composeDueAt', () => {
  it('composeDueAtTest', () => {
    const instant = composeDueAt('2026-08-31', '14:30')

    expect(instant).toMatch(INSTANT)
    // Read back as local time, the instant is the moment that was typed.
    const moment = new Date(instant)
    expect(moment.getFullYear()).toBe(2026)
    expect(moment.getMonth()).toBe(7)
    expect(moment.getDate()).toBe(31)
    expect(moment.getHours()).toBe(14)
    expect(moment.getMinutes()).toBe(30)
  })

  it('composeDueAtAtMidnightTest', () => {
    const moment = new Date(composeDueAt('2026-06-15', '00:00'))

    expect(moment.getHours()).toBe(0)
    expect(moment.getMinutes()).toBe(0)
    expect(moment.getDate()).toBe(15)
  })

  it('composeDueAtAcceptsSecondsFromATimeInputTest', () => {
    // A time input with a step attribute answers HH:mm:ss; the seconds are dropped.
    expect(composeDueAt('2026-08-31', '14:30:45')).toBe(composeDueAt('2026-08-31', '14:30'))
  })

  it('composeDueAtWithAnEmptyDateTest', () => {
    expect(() => composeDueAt('', '09:00')).toThrow(/Kein vollständiger Zeitpunkt/)
  })

  it('composeDueAtWithAnEmptyTimeTest', () => {
    expect(() => composeDueAt('2026-08-31', '')).toThrow(/Kein vollständiger Zeitpunkt/)
  })
})

describe('splitDueAt', () => {
  it('splitDueAtTest', () => {
    const { date, time } = splitDueAt(composeDueAt('2026-08-31', '14:30'))

    expect(date).toBe('2026-08-31')
    expect(time).toBe('14:30')
  })

  it('splitDueAtDropsTheSecondsTest', () => {
    const withSeconds = new Date(composeDueAt('2026-03-10', '09:00'))
    withSeconds.setSeconds(42)

    expect(splitDueAt(withSeconds.toISOString()).time).toBe('09:00')
  })

  it('splitDueAtWithAnUnreadableValueTest', () => {
    expect(() => splitDueAt('kein-zeitpunkt')).toThrow(/Kein lesbarer Zeitpunkt/)
  })
})

describe('composeDueAt and splitDueAt', () => {
  /** The two undo each other, which is what lets the edit dialog show what was stored. */
  it('composeDueAtRoundTripTest', () => {
    const fields = [
      { date: '2026-08-31', time: '14:30' },
      { date: '2026-01-01', time: '00:00' },
      { date: '2025-12-31', time: '23:59' },
      { date: '2028-02-29', time: '09:00' },
    ]

    for (const { date, time } of fields) {
      expect(splitDueAt(composeDueAt(date, time))).toEqual({ date, time })
    }
  })
})
