import { describe, expect, it } from 'vitest'
import { ApiError } from './api'
import { readDuration } from './duration'
import { MODULE_NAMES } from './modules'
import {
  TIMETRACKING_MODULE,
  TIMETRACKING_PATH,
  TIMETRACKING_RIGHTS,
  TIME_ENTRY_STATE_LABELS,
  TIME_ENTRY_STATE_TONES,
  colleaguesUrl,
  continueEntryUrl,
  copyRequestOf,
  dayTotalText,
  defaultServiceKey,
  defaultServiceUrl,
  durationFieldOf,
  effectiveBillable,
  emptyTimerForm,
  emptyTimeEntryForm,
  entryServiceText,
  entryTargetText,
  formChanged,
  hasLaterWeek,
  hasLineInput,
  instantOf,
  isTimerTooLong,
  isToldByTimer,
  isToldByLine,
  lineErrors,
  localDateOf,
  localTimeOf,
  minutesSince,
  msUntilNextMinute,
  nextEntryForm,
  recentTargetLabel,
  recentTargetsKey,
  recentTargetsUrl,
  sameTarget,
  serviceLookupUrl,
  startedText,
  stoppedText,
  targetKey,
  targetLabel,
  targetLookupUrl,
  timeEntriesKey,
  timeEntryComplaints,
  timeEntryUrl,
  timeEntryWriteUrl,
  timeLookupsKey,
  timeRangeText,
  timeSheetKey,
  timeSheetUrl,
  timerChanged,
  timerComplaints,
  timerErrors,
  timerKey,
  timerSinceText,
  timerStopUrl,
  timerTabTitle,
  timerText,
  timerUrl,
  toTimeEntryForm,
  toTimeEntryRequest,
  toTimerChangeRequest,
  toTimerForm,
  toTimerRequest,
  toTimerStopRequest,
  weekStep,
  withRecentTarget,
  withService,
  withServiceTerm,
  withSuggestedService,
  withTarget,
  withTargetTerm,
  type TimeEntryForm,
  type TimerForm,
} from './timetracking'
import type { RunningTimer, TimeEntry, TimeServiceChoice, TimeTargetChoice } from './types'

const WEBSITE: TimeTargetChoice = {
  kind: 'PROJECT',
  projectId: 12,
  projectNumber: 'P-00012',
  projectName: 'Website',
  partnerId: 11,
  customerName: 'Muster AG',
}

const MUSTER: TimeTargetChoice = {
  kind: 'CUSTOMER',
  partnerId: 11,
  partnerNumber: 'K-00011',
  customerName: 'Muster AG',
}

const CONCEPT: TimeServiceChoice = { productId: 31, productNumber: 'L-001', name: 'Konzeption' }
const SUPPORT: TimeServiceChoice = { productId: 32, productNumber: 'L-002', name: 'Support' }

/** Two and a half hours on the website project, from eight to half past ten. */
function entry(overrides: Partial<TimeEntry> = {}): TimeEntry {
  return {
    id: 5,
    userId: 1,
    workDate: '2026-11-25',
    durationMinutes: 150,
    startTime: '08:00',
    endTime: '10:30',
    projectId: 12,
    projectNumber: 'P-00012',
    projectName: 'Website',
    partnerId: 11,
    customerName: 'Muster AG',
    productId: 31,
    productNumber: 'L-001',
    serviceName: 'Konzeption',
    description: 'Wireframes',
    billable: true,
    state: 'OPEN',
    editable: true,
    lockVersion: 3,
    ...overrides,
  }
}

/** An hour of support for Muster AG, without a project and without a range. */
const SUPPORT_HOUR = entry({
  id: 6,
  durationMinutes: 60,
  startTime: null,
  endTime: null,
  projectId: null,
  projectNumber: null,
  projectName: null,
  productId: 32,
  productNumber: 'L-002',
  serviceName: 'Support',
  description: 'Ticket 4711',
})

/** Three hours of internal training: nothing chosen, not billable. */
const TRAINING = entry({
  id: 7,
  durationMinutes: 180,
  startTime: null,
  endTime: null,
  projectId: null,
  projectNumber: null,
  projectName: null,
  partnerId: null,
  customerName: null,
  productId: null,
  productNumber: null,
  serviceName: null,
  description: 'Weiterbildung',
  billable: false,
  state: 'NOT_BILLABLE',
})

function form(overrides: Partial<TimeEntryForm> = {}): TimeEntryForm {
  return { ...emptyTimeEntryForm(), ...overrides }
}

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

  /** Both states the backend sends today have a word and a tone. */
  it('timeEntryStateLabelsTest', () => {
    expect(TIME_ENTRY_STATE_LABELS).toEqual({ OPEN: 'offen', NOT_BILLABLE: 'nicht verrechenbar' })
    expect(Object.keys(TIME_ENTRY_STATE_TONES)).toEqual(Object.keys(TIME_ENTRY_STATE_LABELS))
  })
})

describe('addresses', () => {
  it('timeSheetUrlTest', () => {
    expect(timeSheetUrl(1, 'mine', '2026-11-23', '2026-11-29')).toBe(
      '/api/tenants/1/time-entries/mine?from=2026-11-23&to=2026-11-29',
    )
  })

  /** A colleague's week lives on /sheet, not on the bare path the later lists keep. */
  it('timeSheetUrlOfAColleagueTest', () => {
    expect(timeSheetUrl(1, 42, '2026-11-23', '2026-11-29')).toBe(
      '/api/tenants/1/time-entries/sheet?userId=42&from=2026-11-23&to=2026-11-29',
    )
  })

  it('timeEntryWriteUrlTest', () => {
    expect(timeEntryWriteUrl(1, 'mine')).toBe('/api/tenants/1/time-entries/mine')
    expect(timeEntryWriteUrl(1, 42)).toBe('/api/tenants/1/time-entries?userId=42')
  })

  it('timeEntryUrlTest', () => {
    expect(timeEntryUrl(1, 'mine', 5)).toBe('/api/tenants/1/time-entries/mine/5')
    expect(timeEntryUrl(1, 42, 5)).toBe('/api/tenants/1/time-entries/5?userId=42')
  })

  it('recentTargetsUrlTest', () => {
    expect(recentTargetsUrl(1)).toBe('/api/tenants/1/time-entries/mine/recent')
  })

  it('defaultServiceUrlTest', () => {
    expect(defaultServiceUrl(1, WEBSITE)).toBe(
      '/api/tenants/1/time-entries/mine/default-service?projectId=12',
    )
    expect(defaultServiceUrl(1, MUSTER)).toBe(
      '/api/tenants/1/time-entries/mine/default-service?partnerId=11',
    )
  })

  /** Internal time asks without a parameter: the server answers the last internal service. */
  it('defaultServiceUrlForInternalTimeTest', () => {
    expect(defaultServiceUrl(1, null)).toBe('/api/tenants/1/time-entries/mine/default-service')
  })

  it('targetLookupUrlTest', () => {
    expect(targetLookupUrl(1, 'muster ag')).toBe(
      '/api/tenants/1/time-entries/lookups/targets?search=muster+ag',
    )
  })

  it('targetLookupUrlWithoutSearchTest', () => {
    expect(targetLookupUrl(1, '')).toBe('/api/tenants/1/time-entries/lookups/targets')
    expect(targetLookupUrl(1, '   ')).toBe('/api/tenants/1/time-entries/lookups/targets')
  })

  it('serviceLookupUrlTest', () => {
    expect(serviceLookupUrl(1, 'konz')).toBe(
      '/api/tenants/1/time-entries/lookups/services?search=konz',
    )
    expect(serviceLookupUrl(1, '')).toBe('/api/tenants/1/time-entries/lookups/services')
  })

  it('colleaguesUrlTest', () => {
    expect(colleaguesUrl(1)).toBe('/api/tenants/1/time-entries/lookups/colleagues')
  })
})

describe('cache keys', () => {
  /** A write invalidates the root, which has to reach the sheet, the chips and the suggestion. */
  it('timeEntriesKeyTest', () => {
    const root = timeEntriesKey(1)

    expect(timeSheetKey(1, 'mine', '2026-11-23', '2026-11-29').slice(0, 2)).toEqual(root)
    expect(recentTargetsKey(1).slice(0, 2)).toEqual(root)
    expect(defaultServiceKey(1, WEBSITE).slice(0, 2)).toEqual(root)
  })

  it('timeSheetKeyTest', () => {
    expect(timeSheetKey(1, 42, '2026-11-23', '2026-11-29')).toEqual([
      'time-entries',
      1,
      'sheet',
      42,
      '2026-11-23',
      '2026-11-29',
    ])
  })

  it('defaultServiceKeyTest', () => {
    expect(defaultServiceKey(1, WEBSITE)).not.toEqual(defaultServiceKey(1, MUSTER))
    expect(defaultServiceKey(1, null).at(-1)).toBe('internal')
  })

  /** A time entry changes no lookup, so writing must not throw them away. */
  it('timeLookupsKeyTest', () => {
    expect(timeLookupsKey(1)).toEqual(['time-lookups', 1])
    expect(timeLookupsKey(1)[0]).not.toBe(timeEntriesKey(1)[0])
  })
})

describe('words', () => {
  /** A project and a customer may share a number in their own tables; their keys may not. */
  it('targetKeyTest', () => {
    expect(targetKey(WEBSITE)).toBe('project-12')
    expect(targetKey({ ...MUSTER, partnerId: 12 })).toBe('customer-12')
  })

  it('sameTargetTest', () => {
    expect(sameTarget(WEBSITE, { ...WEBSITE, projectName: 'Website neu' })).toBe(true)
    expect(sameTarget(WEBSITE, MUSTER)).toBe(false)
  })

  it('sameTargetWithInternalTimeTest', () => {
    expect(sameTarget(null, null)).toBe(true)
    expect(sameTarget(null, MUSTER)).toBe(false)
    expect(sameTarget(MUSTER, null)).toBe(false)
  })

  it('targetLabelTest', () => {
    expect(targetLabel(WEBSITE, true)).toBe('P-00012 Website · Muster AG')
    expect(targetLabel(MUSTER, true)).toBe('Muster AG (ohne Projekt)')
  })

  /** With the projects off there is nothing to tell a customer from. */
  it('targetLabelWithoutProjectsTest', () => {
    expect(targetLabel(MUSTER, false)).toBe('Muster AG')
  })

  it('targetLabelOfWhatIsGoneTest', () => {
    expect(targetLabel({ ...WEBSITE, projectNumber: null, projectName: null }, true)).toBe(
      'Projekt nicht mehr vorhanden · Muster AG',
    )
    expect(targetLabel({ ...WEBSITE, customerName: null }, true)).toBe('P-00012 Website')
    expect(targetLabel({ ...MUSTER, customerName: null }, false)).toBe('Kunde nicht mehr vorhanden')
  })

  it('entryTargetTextTest', () => {
    expect(entryTargetText(entry())).toBe('P-00012 Website · Muster AG')
    expect(entryTargetText(SUPPORT_HOUR)).toBe('Muster AG')
    expect(entryTargetText(TRAINING)).toBe('intern')
  })

  it('entryTargetTextOfWhatIsGoneTest', () => {
    expect(entryTargetText(entry({ projectNumber: null, projectName: null }))).toBe(
      'Projekt nicht mehr vorhanden · Muster AG',
    )
    expect(entryTargetText(entry({ customerName: null }))).toBe(
      'P-00012 Website · Kunde nicht mehr vorhanden',
    )
    expect(entryTargetText({ ...SUPPORT_HOUR, customerName: null })).toBe(
      'Kunde nicht mehr vorhanden',
    )
  })

  it('entryServiceTextTest', () => {
    expect(entryServiceText(entry())).toBe('Konzeption')
    expect(entryServiceText(TRAINING)).toBe('—')
    expect(entryServiceText(entry({ serviceName: null }))).toBe('Leistung nicht mehr vorhanden')
  })

  it('recentTargetLabelTest', () => {
    expect(
      recentTargetLabel({
        projectId: 12,
        projectNumber: 'P-00012',
        projectName: 'Website',
        partnerId: 11,
        customerName: 'Muster AG',
        productId: 31,
        serviceName: 'Konzeption',
      }),
    ).toBe('P-00012 Website · Konzeption')
    expect(
      recentTargetLabel({
        partnerId: 11,
        customerName: 'Muster AG',
        productId: 32,
        serviceName: 'Support',
      }),
    ).toBe('Muster AG · Support')
  })

  /** No part at all is the chip «intern»; with a service it names the service too. */
  it('recentTargetLabelOfInternalTimeTest', () => {
    expect(recentTargetLabel({})).toBe('intern')
    expect(recentTargetLabel({ productId: 33, serviceName: 'Administration' })).toBe(
      'intern · Administration',
    )
  })

  it('timeRangeTextTest', () => {
    expect(timeRangeText(entry())).toBe('08:00–10:30')
  })

  /** The backend's 00:00 at the end of a range is midnight, read as 24:00 in a list. */
  it('timeRangeTextToMidnightTest', () => {
    expect(timeRangeText(entry({ startTime: '22:00', endTime: '00:00' }))).toBe('22:00–24:00')
  })

  it('timeRangeTextWithoutRangeTest', () => {
    expect(timeRangeText(SUPPORT_HOUR)).toBe('')
  })

  it('durationFieldOfTest', () => {
    expect(durationFieldOf(entry())).toBe('08:00-10:30')
    expect(durationFieldOf(SUPPORT_HOUR)).toBe('1:00')
  })

  /** What the field shows reads back as the same duration and the same times. */
  it('durationFieldOfReadsBackTest', () => {
    const toMidnight = entry({ startTime: '22:00', endTime: '00:00', durationMinutes: 120 })

    expect(durationFieldOf(toMidnight)).toBe('22:00-24:00')
    expect(readDuration(durationFieldOf(toMidnight))).toEqual({
      state: 'read',
      duration: { minutes: 120, startTime: '22:00', endTime: '00:00' },
    })
    expect(readDuration(durationFieldOf({ ...SUPPORT_HOUR, durationMinutes: 1440 }))).toEqual({
      state: 'read',
      duration: { minutes: 1440 },
    })
  })

  it('dayTotalTextTest', () => {
    expect(dayTotalText('2026-11-25', 465)).toBe('7:45')
  })

  /** An empty weekday stands out, an empty weekend day does not. */
  it('dayTotalTextOfAnEmptyDayTest', () => {
    expect(dayTotalText('2026-11-26', 0)).toBe('0:00')
    expect(dayTotalText('2026-11-28', 0)).toBe('–')
    expect(dayTotalText('2026-11-29', 0)).toBe('–')
  })

  it('dayTotalTextOfAWorkedSundayTest', () => {
    expect(dayTotalText('2026-11-29', 90)).toBe('1:30')
  })
})

describe('weeks', () => {
  it('weekStepTest', () => {
    expect(weekStep('2026-11-25', -1, '2026-11-25')).toBe('2026-11-18')
    expect(weekStep('2026-11-11', 1, '2026-11-25')).toBe('2026-11-18')
  })

  /** A step into the future stops at today. */
  it('weekStepNeverPastTodayTest', () => {
    expect(weekStep('2026-11-20', 1, '2026-11-25')).toBe('2026-11-25')
  })

  it('weekStepByNothingTest', () => {
    expect(weekStep('2026-11-20', 0, '2026-11-25')).toBe('2026-11-20')
  })

  it('hasLaterWeekTest', () => {
    expect(hasLaterWeek('2026-11-18', '2026-11-25')).toBe(true)
    expect(hasLaterWeek('2026-11-25', '2026-11-25')).toBe(false)
  })

  /** On a Monday the week before has a later week: today's. */
  it('hasLaterWeekOnAMondayTest', () => {
    expect(hasLaterWeek('2026-11-22', '2026-11-23')).toBe(true)
    expect(hasLaterWeek('2026-11-23', '2026-11-23')).toBe(false)
  })
})

describe('the quick line', () => {
  it('emptyTimeEntryFormTest', () => {
    const line = emptyTimeEntryForm()

    expect(line.target).toBeNull()
    expect(line.service).toBeNull()
    expect(line.billable).toBeNull()
    expect(hasLineInput(line)).toBe(false)
  })

  it('toTimeEntryFormTest', () => {
    expect(toTimeEntryForm(entry(), true)).toEqual({
      targetTerm: 'P-00012 Website · Muster AG',
      target: WEBSITE,
      serviceTerm: 'Konzeption',
      service: CONCEPT,
      servicePicked: true,
      duration: '08:00-10:30',
      description: 'Wireframes',
      billable: true,
    })
  })

  it('toTimeEntryFormOfACustomerWithoutProjectsTest', () => {
    const line = toTimeEntryForm(SUPPORT_HOUR, false)

    expect(line.target).toEqual({ kind: 'CUSTOMER', partnerId: 11, customerName: 'Muster AG' })
    expect(line.targetTerm).toBe('Muster AG')
    expect(line.duration).toBe('1:00')
  })

  it('toTimeEntryFormOfInternalTimeTest', () => {
    const line = toTimeEntryForm(TRAINING, true)

    expect(line.target).toBeNull()
    expect(line.targetTerm).toBe('')
    expect(line.service).toBeNull()
    expect(line.servicePicked).toBe(false)
    expect(line.billable).toBe(false)
  })

  /** A service gone since stays on the entry and says so in the field. */
  it('toTimeEntryFormWithAServiceThatIsGoneTest', () => {
    expect(toTimeEntryForm(entry({ serviceName: null }), true).serviceTerm).toBe(
      'Leistung nicht mehr vorhanden',
    )
  })

  it('withTargetTermTest', () => {
    const chosen = form({
      target: WEBSITE,
      targetTerm: 'P-00012 Website · Muster AG',
      billable: false,
    })

    expect(withTargetTerm(chosen, 'mus')).toEqual(
      form({ targetTerm: 'mus', target: null, billable: null }),
    )
  })

  it('withTargetTermWithoutATargetTest', () => {
    const typed = form({ targetTerm: 'mu' })

    expect(withTargetTerm(typed, 'mus')).toEqual(form({ targetTerm: 'mus' }))
  })

  /** A new target brings its own default for «verrechenbar». */
  it('withTargetTest', () => {
    const line = withTarget(form({ billable: false, duration: '1:30' }), WEBSITE, true)

    expect(line.target).toBe(WEBSITE)
    expect(line.targetTerm).toBe('P-00012 Website · Muster AG')
    expect(line.billable).toBeNull()
    expect(line.duration).toBe('1:30')
  })

  it('withServiceTermTest', () => {
    const line = withServiceTerm(form({ service: CONCEPT, serviceTerm: 'Konzeption' }), 'sup')

    expect(line).toEqual(form({ serviceTerm: 'sup', service: null, servicePicked: true }))
  })

  it('withServiceTest', () => {
    expect(withService(form(), SUPPORT)).toEqual(
      form({ service: SUPPORT, serviceTerm: 'Support', servicePicked: true }),
    )
  })

  it('withSuggestedServiceTest', () => {
    const line = withSuggestedService(form({ target: WEBSITE }), WEBSITE, CONCEPT)

    expect(line.service).toBe(CONCEPT)
    expect(line.serviceTerm).toBe('Konzeption')
    expect(line.servicePicked).toBe(false)
  })

  /** A service chosen by hand before the answer came wins over the suggestion. */
  it('withSuggestedServiceAfterAChoiceByHandTest', () => {
    const picked = form({
      target: WEBSITE,
      service: SUPPORT,
      serviceTerm: 'Support',
      servicePicked: true,
    })

    expect(withSuggestedService(picked, WEBSITE, CONCEPT)).toBe(picked)
  })

  /** The answer for a target the line no longer names is dropped. */
  it('withSuggestedServiceForAnotherTargetTest', () => {
    const moved = form({ target: MUSTER })

    expect(withSuggestedService(moved, WEBSITE, CONCEPT)).toBe(moved)
  })

  it('withSuggestedServiceWithoutSuggestionTest', () => {
    const line = form({ target: WEBSITE, service: SUPPORT, serviceTerm: 'Support' })

    expect(withSuggestedService(line, WEBSITE, null)).toBe(line)
  })

  it('withRecentTargetTest', () => {
    const line = withRecentTarget(
      form({ duration: '1:30', billable: false }),
      {
        projectId: 12,
        projectNumber: 'P-00012',
        projectName: 'Website',
        partnerId: 11,
        customerName: 'Muster AG',
        productId: 31,
        productNumber: 'L-001',
        serviceName: 'Konzeption',
      },
      true,
    )

    expect(line).toEqual(
      form({
        target: WEBSITE,
        targetTerm: 'P-00012 Website · Muster AG',
        service: CONCEPT,
        serviceTerm: 'Konzeption',
        servicePicked: true,
        duration: '1:30',
        billable: null,
      }),
    )
  })

  /** The chip «intern» empties project, customer and service. */
  it('withRecentTargetOfInternalTimeTest', () => {
    const line = withRecentTarget(
      form({ target: MUSTER, targetTerm: 'Muster AG', service: SUPPORT, serviceTerm: 'Support' }),
      {},
      true,
    )

    expect(line.target).toBeNull()
    expect(line.targetTerm).toBe('')
    expect(line.service).toBeNull()
    expect(line.serviceTerm).toBe('')
    expect(line.servicePicked).toBe(false)
  })

  it('withRecentTargetOfACustomerTest', () => {
    const line = withRecentTarget(form(), { partnerId: 11, customerName: 'Muster AG' }, false)

    expect(line.target).toEqual({ kind: 'CUSTOMER', partnerId: 11, customerName: 'Muster AG' })
    expect(line.targetTerm).toBe('Muster AG')
    expect(line.service).toBeNull()
  })

  /** After saving, the next entry for the same project needs only duration, text and Enter. */
  it('nextEntryFormTest', () => {
    const saved = form({
      target: WEBSITE,
      targetTerm: 'P-00012 Website · Muster AG',
      service: CONCEPT,
      serviceTerm: 'Konzeption',
      servicePicked: true,
      duration: '1:30',
      description: 'Wireframes',
      billable: false,
    })

    expect(nextEntryForm(saved)).toEqual({
      ...saved,
      duration: '',
      description: '',
      billable: null,
      servicePicked: false,
    })
  })

  it('effectiveBillableTest', () => {
    expect(effectiveBillable(form({ target: MUSTER }))).toBe(true)
    expect(effectiveBillable(form({ target: MUSTER, billable: false }))).toBe(false)
  })

  /** Internal time is never billed, whatever the box was left at. */
  it('effectiveBillableWithoutTargetTest', () => {
    expect(effectiveBillable(form())).toBe(false)
    expect(effectiveBillable(form({ billable: true }))).toBe(false)
  })

  it('hasLineInputTest', () => {
    expect(hasLineInput(form({ duration: '1:30' }))).toBe(true)
    expect(hasLineInput(form({ description: 'Telefon' }))).toBe(true)
  })

  /** Project and service alone are no loss; spaces are nothing typed. */
  it('hasLineInputWithoutDurationAndTextTest', () => {
    expect(hasLineInput(form({ target: WEBSITE, service: CONCEPT }))).toBe(false)
    expect(hasLineInput(form({ duration: '  ', description: ' ' }))).toBe(false)
  })

  it('formChangedTest', () => {
    const opened = toTimeEntryForm(entry(), true)

    expect(formChanged({ ...opened, duration: '2:30' }, opened)).toBe(true)
    expect(formChanged({ ...opened, billable: false }, opened)).toBe(true)
    expect(formChanged(withTargetTerm(opened, 'mus'), opened)).toBe(true)
  })

  /** Taking the same service again, or typing spaces around the text, changes nothing. */
  it('formChangedWithoutChangeTest', () => {
    const opened = toTimeEntryForm(entry(), true)

    expect(formChanged(opened, opened)).toBe(false)
    expect(formChanged(withService(opened, CONCEPT), opened)).toBe(false)
    expect(formChanged({ ...opened, description: ' Wireframes ' }, opened)).toBe(false)
  })
})

describe('timeEntryComplaints', () => {
  it('timeEntryComplaintsTest', () => {
    const line = form({ target: WEBSITE, service: CONCEPT, duration: '1:30' })

    expect(timeEntryComplaints(line)).toEqual({})
  })

  /** Internal time needs neither customer nor service. */
  it('timeEntryComplaintsOfInternalTimeTest', () => {
    expect(timeEntryComplaints(form({ duration: '2h', description: 'Telefon' }))).toEqual({})
  })

  it('timeEntryComplaintsWithoutDurationTest', () => {
    expect(timeEntryComplaints(form()).durationMinutes).toBe(
      'Eine Dauer eingeben, zum Beispiel 1:30.',
    )
  })

  it('timeEntryComplaintsWithAnUnreadableDurationTest', () => {
    expect(timeEntryComplaints(form({ duration: '23-1' })).durationMinutes).toContain(
      'über Mitternacht',
    )
  })

  /** A name typed and never taken would make the hour internal without anybody deciding so. */
  it('timeEntryComplaintsWithATargetNotTakenTest', () => {
    expect(timeEntryComplaints(form({ duration: '1:30', targetTerm: 'Muster' })).projectId).toBe(
      'Einen Treffer aus der Liste wählen oder das Feld leeren.',
    )
  })

  it('timeEntryComplaintsWithAServiceNotTakenTest', () => {
    const line = form({ target: MUSTER, duration: '1:30', serviceTerm: 'Supp' })

    expect(timeEntryComplaints(line).productId).toBe(
      'Eine Leistung aus der Liste wählen oder das Feld leeren.',
    )
  })

  it('timeEntryComplaintsBillableWithoutServiceTest', () => {
    expect(timeEntryComplaints(form({ target: MUSTER, duration: '1:30' })).productId).toContain(
      'Verrechenbar braucht eine Leistung',
    )
  })

  /** Not billable, a customer needs no service. */
  it('timeEntryComplaintsNotBillableWithoutServiceTest', () => {
    const line = form({ target: MUSTER, duration: '1:30', billable: false })

    expect(timeEntryComplaints(line)).toEqual({})
  })
})

describe('field messages', () => {
  it('lineErrorsTest', () => {
    expect(
      lineErrors({
        partnerId: 'Kein Kunde.',
        productId: 'Keine Leistung.',
        endTime: 'Bis vor Von.',
        description: 'Zu lang.',
      }),
    ).toEqual({
      target: 'Kein Kunde.',
      service: 'Keine Leistung.',
      duration: 'Bis vor Von.',
      description: 'Zu lang.',
    })
  })

  /** Two messages for one field of the line: the first in the order of the request wins. */
  it('lineErrorsWithTwoForOneFieldTest', () => {
    expect(lineErrors({ endTime: 'Bis.', durationMinutes: 'Dauer.' }).duration).toBe('Dauer.')
  })

  it('lineErrorsWithNothingTest', () => {
    expect(lineErrors({})).toEqual({})
    expect(lineErrors({ workDate: 'Zukunft.' })).toEqual({})
  })

  it('isToldByLineTest', () => {
    const atService = new ApiError(400, 'Keine Leistung.', {
      errors: [{ field: 'productId', message: 'Keine Leistung.' }],
    })

    expect(isToldByLine(atService)).toBe(true)
  })

  /** The day is no field of the line; its message has to stand above it. */
  it('isToldByLineWithTheDayTest', () => {
    const atDay = new ApiError(400, 'Zukunft.', {
      errors: [{ field: 'workDate', message: 'Zukunft.' }],
    })

    expect(isToldByLine(atDay)).toBe(false)
    expect(isToldByLine(new ApiError(409, 'Geändert.'))).toBe(false)
    expect(isToldByLine(new Error('Netz weg.'))).toBe(false)
  })
})

describe('toTimeEntryRequest', () => {
  /** A new entry on a project: minutes alone, no customer, «verrechenbar» left to the server. */
  it('toTimeEntryRequestTest', () => {
    const line = form({
      target: WEBSITE,
      service: CONCEPT,
      duration: '1:30',
      description: ' Wireframes ',
    })

    expect(toTimeEntryRequest(line, { minutes: 90 }, '2026-11-25')).toEqual({
      workDate: '2026-11-25',
      durationMinutes: 90,
      startTime: null,
      endTime: null,
      projectId: 12,
      partnerId: null,
      productId: 31,
      description: 'Wireframes',
      billable: null,
    })
  })

  /** A range goes as its two times only, so minutes and range cannot disagree. */
  it('toTimeEntryRequestWithRangeTest', () => {
    const request = toTimeEntryRequest(
      form({ target: MUSTER, service: SUPPORT }),
      { minutes: 90, startTime: '09:00', endTime: '10:30' },
      '2026-11-25',
    )

    expect(request.durationMinutes).toBeNull()
    expect(request.startTime).toBe('09:00')
    expect(request.endTime).toBe('10:30')
    expect(request.projectId).toBeNull()
    expect(request.partnerId).toBe(11)
  })

  it('toTimeEntryRequestOfInternalTimeTest', () => {
    const request = toTimeEntryRequest(form({ billable: true }), { minutes: 60 }, '2026-11-25')

    expect(request.projectId).toBeNull()
    expect(request.partnerId).toBeNull()
    expect(request.productId).toBeNull()
    expect(request.description).toBeNull()
    expect(request.billable).toBeNull()
  })

  /** A box unticked by hand is sent as it stands. */
  it('toTimeEntryRequestNotBillableTest', () => {
    const line = form({ target: MUSTER, billable: false })

    expect(toTimeEntryRequest(line, { minutes: 60 }, '2026-11-25').billable).toBe(false)
  })

  /** A change always says «verrechenbar» and names the state it was made to. */
  it('toTimeEntryRequestForAChangeTest', () => {
    const line = form({ target: MUSTER, service: SUPPORT })
    const request = toTimeEntryRequest(line, { minutes: 60 }, '2026-11-25', 3)

    expect(request.billable).toBe(true)
    expect(request.lockVersion).toBe(3)
  })

  it('toTimeEntryRequestForAChangeToInternalTimeTest', () => {
    const request = toTimeEntryRequest(form({ billable: true }), { minutes: 60 }, '2026-11-25', 0)

    expect(request.billable).toBe(false)
    expect(request.lockVersion).toBe(0)
  })
})

describe('copyRequestOf', () => {
  /** The copy keeps project, service, text and «verrechenbar», but drops the range. */
  it('copyRequestOfTest', () => {
    expect(copyRequestOf(entry(), '2026-11-27')).toEqual({
      workDate: '2026-11-27',
      durationMinutes: 150,
      startTime: null,
      endTime: null,
      projectId: 12,
      partnerId: null,
      productId: 31,
      description: 'Wireframes',
      billable: true,
    })
  })

  it('copyRequestOfACustomerTest', () => {
    const request = copyRequestOf(SUPPORT_HOUR, '2026-11-27')

    expect(request.projectId).toBeNull()
    expect(request.partnerId).toBe(11)
  })

  it('copyRequestOfInternalTimeTest', () => {
    expect(copyRequestOf(TRAINING, '2026-11-27')).toEqual({
      workDate: '2026-11-27',
      durationMinutes: 180,
      startTime: null,
      endTime: null,
      projectId: null,
      partnerId: null,
      productId: null,
      description: 'Weiterbildung',
      billable: false,
    })
  })
})

// --- the stopwatch -----------------------------------------------------------------

/** A moment on Wednesday, 25 November 2026, on the clock of this browser. */
function at(hours: number, minutes: number, seconds = 0): number {
  return new Date(2026, 10, 25, hours, minutes, seconds).getTime()
}

/** Started at 09:15:20, to the second, on the website project. */
const STARTED = new Date(at(9, 15, 20)).toISOString()

function timer(overrides: Partial<RunningTimer> = {}): RunningTimer {
  return {
    id: 3,
    userId: 1,
    startedAt: STARTED,
    projectId: 12,
    projectNumber: 'P-00012',
    projectName: 'Website',
    partnerId: 11,
    customerName: 'Muster AG',
    productId: 31,
    productNumber: 'L-001',
    serviceName: 'Konzeption',
    description: 'Wireframes',
    billable: true,
    elapsedMinutes: 42,
    longRunning: false,
    endRequired: false,
    lockVersion: 4,
    ...overrides,
  }
}

/** A stopwatch on nothing: internal time. */
const INTERNAL = timer({
  projectId: null,
  projectNumber: null,
  projectName: null,
  partnerId: null,
  customerName: null,
  productId: null,
  productNumber: null,
  serviceName: null,
  description: null,
  billable: false,
})

function timerForm(overrides: Partial<TimerForm> = {}): TimerForm {
  return { ...emptyTimerForm(), ...overrides }
}

/** The field of the running website stopwatch, as it opens. */
const RUNNING = toTimerForm(timer(), true)

describe('stopwatch addresses', () => {
  it('timerUrlTest', () => {
    expect(timerUrl(1)).toBe('/api/tenants/1/time-entries/mine/timer')
  })

  it('timerStopUrlTest', () => {
    expect(timerStopUrl(1)).toBe('/api/tenants/1/time-entries/mine/timer/stop')
  })

  it('continueEntryUrlTest', () => {
    expect(continueEntryUrl(1, 5)).toBe('/api/tenants/1/time-entries/mine/5/continue')
  })

  it('timerKeyTest', () => {
    expect(timerKey(7)).toEqual(['time-timer', 7])
  })

  /** A change of an entry invalidates the entries, and that must not read the stopwatch anew. */
  it('timerKeyApartFromTheEntriesTest', () => {
    expect(timerKey(7).slice(0, timeEntriesKey(7).length)).not.toEqual(timeEntriesKey(7))
  })
})

describe('minutesSince', () => {
  it('minutesSinceTest', () => {
    expect(minutesSince(STARTED, at(9, 57, 50))).toBe(42)
  })

  /** The start is to the second: the minute turns at 20 seconds, not at the full minute. */
  it('minutesSinceTurnsAtTheSecondOfTheStartTest', () => {
    expect(minutesSince(STARTED, at(9, 16, 19))).toBe(0)
    expect(minutesSince(STARTED, at(9, 16, 20))).toBe(1)
  })

  it('minutesSinceAtTheStartTest', () => {
    expect(minutesSince(STARTED, at(9, 15, 20))).toBe(0)
  })

  /** A browser clock behind the server's would count below zero. */
  it('minutesSinceBeforeTheStartTest', () => {
    expect(minutesSince(STARTED, at(9, 14))).toBe(0)
  })

  it('minutesSinceAfterADayTest', () => {
    expect(minutesSince(STARTED, at(9, 15, 20) + 26 * 3_600_000)).toBe(1560)
  })

  /** Real minutes: 01:30 CET to 03:30 CEST on 29 March 2026 are one hour, as the stop counts. */
  it('minutesSinceOverTheChangeOfTheClocksTest', () => {
    expect(minutesSince('2026-03-29T00:30:00Z', Date.parse('2026-03-29T01:30:00Z'))).toBe(60)
  })

  it('minutesSinceWithAnUnreadableStartTest', () => {
    expect(minutesSince('gestern', at(9, 15))).toBe(0)
  })
})

describe('msUntilNextMinute', () => {
  it('msUntilNextMinuteTest', () => {
    expect(msUntilNextMinute(STARTED, at(9, 57, 50))).toBe(30_000)
  })

  it('msUntilNextMinuteRightAtATurnTest', () => {
    expect(msUntilNextMinute(STARTED, at(9, 16, 20))).toBe(60_000)
  })

  it('msUntilNextMinuteAtTheStartTest', () => {
    expect(msUntilNextMinute(STARTED, at(9, 15, 20))).toBe(60_000)
  })

  it('msUntilNextMinuteBeforeTheStartTest', () => {
    expect(msUntilNextMinute(STARTED, at(9, 15, 15))).toBe(65_000)
  })

  it('msUntilNextMinuteWithAnUnreadableStartTest', () => {
    expect(msUntilNextMinute('gestern', at(9, 15))).toBe(60_000)
  })
})

describe('stopwatch words', () => {
  it('timerTextTest', () => {
    expect(timerText(timer(), 42)).toBe('0:42 · P-00012 Website · Konzeption')
  })

  it('timerTextOfInternalTimeTest', () => {
    expect(timerText(INTERNAL, 65)).toBe('1:05 · intern')
  })

  it('timerTextAfterADayTest', () => {
    expect(timerText(timer({ productId: null, serviceName: null }), 1560)).toBe(
      '26:00 · P-00012 Website',
    )
  })

  it('timerTabTitleTest', () => {
    expect(timerTabTitle(42, 'webux ERP')).toBe('▶ 0:42 · webux ERP')
  })

  it('timerTabTitleAtTheStartTest', () => {
    expect(timerTabTitle(0, 'webux ERP')).toBe('▶ 0:00 · webux ERP')
  })

  it('timerSinceTextTest', () => {
    expect(timerSinceText(STARTED, '2026-11-25')).toBe('Läuft seit 09:15')
  })

  it('timerSinceTextOfAnEarlierDayTest', () => {
    const text = timerSinceText(STARTED, '2026-11-26')

    expect(text).toContain('25.11.2026')
    expect(text).toContain('09:15')
  })

  it('stoppedTextTest', () => {
    expect(stoppedText([entry({ durationMinutes: 90 })])).toBe(
      'Angehalten: 1 Std. 30 Min., P-00012 Website · Muster AG.',
    )
  })

  /** Over midnight the stop writes one entry per day, and the sentence names each. */
  it('stoppedTextOverMidnightTest', () => {
    const before = entry({ id: 8, workDate: '2026-11-24', durationMinutes: 10 })
    const after = entry({ id: 9, workDate: '2026-11-25', durationMinutes: 20 })

    expect(stoppedText([before, after])).toBe(
      'Angehalten und auf 2 Tage verteilt: 10 Min. am Dienstag, 24. November; 20 Min. am Mittwoch, 25. November.',
    )
  })

  it('stoppedTextWithoutEntriesTest', () => {
    expect(stoppedText([])).toBe('Angehalten.')
  })

  it('stoppedTextWithALeadTest', () => {
    expect(stoppedText([TRAINING], 'Vorige Stoppuhr angehalten')).toBe(
      'Vorige Stoppuhr angehalten: 3 Std., intern.',
    )
  })

  it('startedTextTest', () => {
    expect(startedText({ timer: timer(), started: true, stoppedEntries: [] })).toBe(
      'Stoppuhr läuft: P-00012 Website · Konzeption.',
    )
  })

  /** A start while another one ran stops that one first; the sentence says what it became. */
  it('startedTextAfterAnotherOneTest', () => {
    expect(startedText({ timer: INTERNAL, started: true, stoppedEntries: [SUPPORT_HOUR] })).toBe(
      'Stoppuhr läuft: intern. Vorige Stoppuhr angehalten: 1 Std., Muster AG.',
    )
  })

  it('startedTextWhenAnotherDeviceWasFasterTest', () => {
    expect(startedText({ timer: timer(), started: false, stoppedEntries: [] })).toBe(
      'Auf einem anderen Gerät wurde gleichzeitig eine Stoppuhr gestartet. Sie läuft: P-00012 Website · Konzeption.',
    )
  })
})

describe('local day and time', () => {
  it('localDateOfTest', () => {
    expect(localDateOf(STARTED)).toBe('2026-11-25')
  })

  it('localDateOfJustAfterMidnightTest', () => {
    expect(localDateOf(new Date(at(0, 5)).toISOString())).toBe('2026-11-25')
  })

  it('localTimeOfTest', () => {
    expect(localTimeOf(STARTED)).toBe('09:15')
  })

  /** The seconds go; the field shows hours and minutes. */
  it('localTimeOfDropsTheSecondsTest', () => {
    expect(localTimeOf(new Date(at(23, 59, 59)).toISOString())).toBe('23:59')
  })

  it('instantOfTest', () => {
    expect(instantOf('2026-11-25', '09:15')).toBe(new Date(at(9, 15)).toISOString())
  })

  it('instantOfWithOneDigitHoursTest', () => {
    expect(instantOf('2026-11-25', ' 9:05 ')).toBe(new Date(at(9, 5)).toISOString())
  })

  it('instantOfAtMidnightTest', () => {
    expect(instantOf('2026-11-25', '00:00')).toBe(new Date(at(0, 0)).toISOString())
  })

  it('instantOfWithoutTimeTest', () => {
    expect(instantOf('2026-11-25', '')).toBeNull()
  })

  it('instantOfWithoutDayTest', () => {
    expect(instantOf('', '09:15')).toBeNull()
    expect(instantOf('2026-11', '09:15')).toBeNull()
  })

  it('instantOfWithATimeThatDoesNotExistTest', () => {
    expect(instantOf('2026-11-25', '24:00')).toBeNull()
    expect(instantOf('2026-11-25', '9:60')).toBeNull()
    expect(instantOf('2026-11-25', '9.15')).toBeNull()
  })

  it('instantOfWithADayThatDoesNotExistTest', () => {
    expect(instantOf('2026-02-31', '09:15')).toBeNull()
  })
})

describe('the stopwatch field', () => {
  it('emptyTimerFormTest', () => {
    const { duration, ...shared } = emptyTimeEntryForm()

    expect(duration).toBe('')
    expect(emptyTimerForm()).toEqual({
      ...shared,
      startDate: '',
      startTime: '',
      endDate: '',
      endTime: '',
    })
  })

  it('toTimerFormTest', () => {
    expect(toTimerForm(timer(), true)).toEqual({
      targetTerm: 'P-00012 Website · Muster AG',
      target: WEBSITE,
      serviceTerm: 'Konzeption',
      service: CONCEPT,
      servicePicked: true,
      description: 'Wireframes',
      billable: true,
      startDate: '2026-11-25',
      startTime: '09:15',
      endDate: '2026-11-25',
      endTime: '',
    })
  })

  it('toTimerFormOfInternalTimeTest', () => {
    const field = toTimerForm(INTERNAL, true)

    expect(field.target).toBeNull()
    expect(field.targetTerm).toBe('')
    expect(field.service).toBeNull()
    expect(field.description).toBe('')
    expect(effectiveBillable(field)).toBe(false)
  })

  it('toTimerFormWithAServiceThatIsGoneTest', () => {
    expect(toTimerForm(timer({ serviceName: null }), true).serviceTerm).toBe(
      'Leistung nicht mehr vorhanden',
    )
  })

  it('toTimerFormWithoutProjectsTest', () => {
    const customer = timer({ projectId: null, projectNumber: null, projectName: null })

    expect(toTimerForm(customer, false).targetTerm).toBe('Muster AG')
  })

  /** The shared helpers keep what only the stopwatch has. */
  it('withRecentTargetOnTheStopwatchTest', () => {
    const changed = withRecentTarget(RUNNING, { partnerId: 11, customerName: 'Muster AG' }, true)

    expect(changed.target).toEqual({ kind: 'CUSTOMER', partnerId: 11, customerName: 'Muster AG' })
    expect(changed.startTime).toBe('09:15')
  })

  it('toTimerRequestTest', () => {
    expect(toTimerRequest(RUNNING)).toEqual({
      projectId: 12,
      productId: 31,
      description: 'Wireframes',
      billable: true,
    })
  })

  /** An empty field starts on internal time, and nothing else goes out. */
  it('toTimerRequestOfInternalTimeTest', () => {
    expect(toTimerRequest(timerForm())).toEqual({})
  })

  it('toTimerRequestForACustomerTest', () => {
    expect(toTimerRequest(timerForm({ target: MUSTER, service: SUPPORT }))).toEqual({
      partnerId: 11,
      productId: 32,
    })
  })

  /** Untouched, «verrechenbar» stays with the server; ticked off, it says so. */
  it('toTimerRequestNotBillableTest', () => {
    expect(toTimerRequest(timerForm({ target: MUSTER, billable: false }))).toEqual({
      partnerId: 11,
      billable: false,
    })
  })

  it('toTimerRequestWithBlankTextTest', () => {
    expect(toTimerRequest(timerForm({ description: '   ' }))).toEqual({})
  })

  /** The start is left out while unchanged, so the server keeps it to the second. */
  it('toTimerChangeRequestTest', () => {
    const changed = withService(RUNNING, SUPPORT)

    expect(toTimerChangeRequest(changed, RUNNING, 4)).toEqual({
      projectId: 12,
      productId: 32,
      description: 'Wireframes',
      billable: true,
      lockVersion: 4,
    })
  })

  /** A changed start goes out on the minute, as the field shows it. */
  it('toTimerChangeRequestWithAnEarlierStartTest', () => {
    const earlier = { ...RUNNING, startTime: '08:50' }

    expect(toTimerChangeRequest(earlier, RUNNING, 4).startedAt).toBe(
      new Date(at(8, 50)).toISOString(),
    )
  })

  /** A field left out is cleared: internal time says so in full. */
  it('toTimerChangeRequestToInternalTimeTest', () => {
    const internal = {
      ...RUNNING,
      targetTerm: '',
      target: null,
      serviceTerm: '',
      service: null,
      description: '',
    }

    expect(toTimerChangeRequest(internal, RUNNING, 4)).toEqual({ billable: false, lockVersion: 4 })
  })

  it('toTimerStopRequestTest', () => {
    expect(toTimerStopRequest({ ...RUNNING, endTime: '17:30' })).toEqual({
      correctedEnd: new Date(at(17, 30)).toISOString(),
    })
  })

  it('toTimerStopRequestWithoutEndTest', () => {
    expect(toTimerStopRequest(RUNNING)).toEqual({})
  })

  it('toTimerStopRequestWithAnUnreadableEndTest', () => {
    expect(toTimerStopRequest({ ...RUNNING, endDate: '', endTime: '17:30' })).toEqual({})
  })

  it('timerChangedTest', () => {
    expect(timerChanged(withService(RUNNING, SUPPORT), RUNNING)).toBe(true)
  })

  it('timerChangedWithoutChangeTest', () => {
    expect(timerChanged(RUNNING, RUNNING)).toBe(false)
  })

  it('timerChangedByTheStartTest', () => {
    expect(timerChanged({ ...RUNNING, startTime: '08:50' }, RUNNING)).toBe(true)
  })

  /** The real end is not part of the stopwatch; typing it changes nothing to save. */
  it('timerChangedByTheEndTest', () => {
    expect(timerChanged({ ...RUNNING, endTime: '17:30' }, RUNNING)).toBe(false)
  })
})

describe('timerComplaints', () => {
  it('timerComplaintsTest', () => {
    expect(timerComplaints(RUNNING, 'stop', false)).toEqual({})
  })

  /** The stopwatch may start billable without a service; the stop asks for one. */
  it('timerComplaintsBillableWithoutServiceTest', () => {
    const customer = { target: MUSTER, targetTerm: 'Muster AG (ohne Projekt)' }
    const noService = { ...RUNNING, ...customer, service: null, serviceTerm: '' }

    expect(timerComplaints(timerForm(customer), 'start', false)).toEqual({})
    expect(timerComplaints(noService, 'change', false)).toEqual({})
    expect(timerComplaints(noService, 'stop', false).productId).toContain(
      'Verrechenbar braucht eine Leistung',
    )
  })

  it('timerComplaintsWithATargetNotTakenTest', () => {
    expect(timerComplaints(timerForm({ targetTerm: 'Muster' }), 'start', false)).toEqual({
      projectId: 'Einen Treffer aus der Liste wählen oder das Feld leeren.',
    })
  })

  it('timerComplaintsWithoutStartTest', () => {
    expect(timerComplaints({ ...RUNNING, startTime: '' }, 'change', false)).toEqual({
      startedAt: 'Den Start mit Tag und Uhrzeit angeben.',
    })
  })

  /** After 24 hours the stop needs the real end. */
  it('timerComplaintsWithoutTheRequiredEndTest', () => {
    expect(timerComplaints(RUNNING, 'stop', true).correctedEnd).toContain('echte Ende')
    expect(timerComplaints({ ...RUNNING, endTime: '17:30' }, 'stop', true)).toEqual({})
  })

  it('timerComplaintsWithAnUnreadableEndTest', () => {
    expect(timerComplaints({ ...RUNNING, endDate: '', endTime: '17:30' }, 'stop', false)).toEqual({
      correctedEnd: 'Das Ende mit Tag und Uhrzeit angeben.',
    })
  })

  /** Start and end belong to a stopwatch that runs; a new start asks about neither. */
  it('timerComplaintsOfANewStartTest', () => {
    expect(timerComplaints(timerForm(), 'start', true)).toEqual({})
  })
})

describe('stopwatch messages', () => {
  it('timerErrorsTest', () => {
    const errors = {
      partnerId: 'Kunde fehlt.',
      productId: 'Leistung fehlt.',
      correctedEnd: 'Zukunft.',
      startedAt: 'Zukunft!',
    }

    expect(timerErrors(errors)).toEqual({
      target: 'Kunde fehlt.',
      service: 'Leistung fehlt.',
      end: 'Zukunft.',
      start: 'Zukunft!',
    })
  })

  it('timerErrorsWithNothingTest', () => {
    expect(timerErrors({ lockVersion: 'Stand fehlt.' })).toEqual({})
  })

  it('isToldByTimerTest', () => {
    const atService = new ApiError(400, 'Keine Leistung.', {
      errors: [{ field: 'productId', message: 'Keine Leistung.' }],
    })

    expect(isToldByTimer(atService, ['target', 'service'])).toBe(true)
  })

  /** The field of the real end stands only while a stopwatch runs. */
  it('isToldByTimerWithAFieldNotShownTest', () => {
    const atEnd = new ApiError(400, 'Zukunft.', {
      errors: [{ field: 'correctedEnd', message: 'Zukunft.' }],
    })

    expect(isToldByTimer(atEnd, ['target', 'service', 'description'])).toBe(false)
    expect(isToldByTimer(atEnd, ['end'])).toBe(true)
  })

  it('isToldByTimerWithoutFieldTest', () => {
    expect(isToldByTimer(new ApiError(409, 'Geändert.'), ['target', 'end'])).toBe(false)
  })

  it('isTimerTooLongTest', () => {
    const tooLong = new ApiError(409, 'Länger als 24 Stunden.', {
      startedAt: STARTED,
      errors: [{ field: 'correctedEnd', message: 'Länger als 24 Stunden.' }],
    })

    expect(isTimerTooLong(tooLong)).toBe(true)
  })

  /** Changed on another device, or the module switched off: 409 too, without a field. */
  it('isTimerTooLongWithAnotherConflictTest', () => {
    expect(isTimerTooLong(new ApiError(409, 'Auf einem anderen Gerät geändert.'))).toBe(false)
  })

  it('isTimerTooLongWithAnEndInTheFutureTest', () => {
    const future = new ApiError(400, 'Zukunft.', {
      errors: [{ field: 'correctedEnd', message: 'Zukunft.' }],
    })

    expect(isTimerTooLong(future)).toBe(false)
  })

  it('isTimerTooLongWithSomethingElseTest', () => {
    expect(isTimerTooLong(new Error('Netz weg'))).toBe(false)
    expect(isTimerTooLong(null)).toBe(false)
  })
})
