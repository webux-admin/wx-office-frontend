import { describe, expect, it } from 'vitest'
import { MODULE_NAMES } from './modules'
import { TIMETRACKING_MODULE, TIMETRACKING_PATH, TIMETRACKING_RIGHTS } from './timetracking'

describe('constants', () => {
  it('timetrackingModuleTest', () => {
    // The code the backend spells the switch with, and one the module screen has a name for.
    expect(TIMETRACKING_MODULE).toBe('TIMETRACKING')
    expect(MODULE_NAMES[TIMETRACKING_MODULE]).toBe('Zeiterfassung')
  })

  it('timetrackingPathTest', () => {
    expect(TIMETRACKING_PATH).toBe('/zeiten')
  })

  it('timetrackingRightsTest', () => {
    expect(TIMETRACKING_RIGHTS).toEqual({
      track: 'TIME_TRACK',
      read: 'TIME_READ',
      write: 'TIME_WRITE',
      bill: 'TIME_BILL',
    })
  })
})
