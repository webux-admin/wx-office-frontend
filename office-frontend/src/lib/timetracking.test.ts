// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './api'
import { readDuration } from './duration'
import { MODULE_NAMES } from './modules'
import {
  BILLING_MODES,
  BILLING_MODE_HINTS,
  BILLING_MODE_LABELS,
  TIMETRACKING_MODULE,
  TIMETRACKING_PATH,
  TIMETRACKING_RIGHTS,
  TIMETRACKING_SETTINGS_PATH,
  TIME_ENTRY_STATE_LABELS,
  TIME_ENTRY_STATE_TONES,
  billableDefaultKey,
  billableDefaultUrl,
  billableLocked,
  billableTooltip,
  colleaguesUrl,
  entryCountText,
  entryProjectText,
  entryUserText,
  fetchSuggestedService,
  hourlyRateText,
  hoursText,
  openEntriesStayText,
  projectTargetOf,
  projectTermsChanged,
  projectTermsComplaints,
  projectTermsKey,
  projectTermsUrl,
  rateFieldOf,
  recordOnState,
  recordOnTargetOf,
  takesNewTime,
  termsSavedText,
  timeEntryListKey,
  timeEntryListUrl,
  timeSummaryFigures,
  timeSummaryKey,
  timeSummaryUrl,
  timeTermsKey,
  timeTrackingUrl,
  toProjectTermsForm,
  toProjectTermsRequest,
  userDefaultState,
  userDefaultUrl,
  userDefaultsKey,
  userDefaultsUrl,
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
  entryStateText,
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
import type {
  Project,
  ProjectTerms,
  RunningTimer,
  TimeBillableDefault,
  TimeEntry,
  TimeServiceChoice,
  TimeSummary,
  TimeTargetChoice,
  TimeUserDefault,
} from './types'

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

/** What the server says about «verrechenbar» for a customer without a project. */
const CUSTOMER_RULE: TimeBillableDefault = { billable: true, locked: false }

/** … for a project billed by effort. */
const BY_EFFORT_RULE: TimeBillableDefault = { billable: true, locked: false, billingMode: 'BY_EFFORT' }

/** … for a project at a fixed price: no, but it may be ticked. */
const FIXED_PRICE_RULE: TimeBillableDefault = {
  billable: false,
  locked: false,
  billingMode: 'FIXED_PRICE',
}

/** … for a project that is not billed: no, and locked. */
const LOCKED_RULE: TimeBillableDefault = {
  billable: false,
  locked: true,
  lockedReason:
    'Das Projekt P-00012 ist als «Nicht verrechenbar» vereinbart. Zeit darauf ist nie verrechenbar.',
  billingMode: 'NOT_BILLABLE',
}

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

  /** Named like the settings of the dunning, and apart from «Meine Zeiten». */
  it('timetrackingSettingsPathTest', () => {
    expect(TIMETRACKING_SETTINGS_PATH).toBe('/zeiterfassung-einstellungen')
    expect(TIMETRACKING_SETTINGS_PATH.startsWith(TIMETRACKING_PATH)).toBe(false)
  })

  it('timetrackingRightsTest', () => {
    expect(TIMETRACKING_RIGHTS).toEqual({
      track: 'TIME_TRACK',
      read: 'TIME_READ',
      write: 'TIME_WRITE',
      bill: 'TIME_BILL',
    })
  })

  /** Every state the backend sends has a word and a tone; billing brought two (#127). */
  it('timeEntryStateLabelsTest', () => {
    expect(TIME_ENTRY_STATE_LABELS).toEqual({
      OPEN: 'offen',
      IN_DRAFT: 'im Entwurf',
      BILLED: 'verrechnet',
      NOT_BILLABLE: 'nicht verrechenbar',
    })
    expect(Object.keys(TIME_ENTRY_STATE_TONES)).toEqual(Object.keys(TIME_ENTRY_STATE_LABELS))
  })

  /** Billed work reads as done, a draft waits quietly, open work stands out. */
  it('timeEntryStateTonesTest', () => {
    expect(TIME_ENTRY_STATE_TONES).toEqual({
      OPEN: 'accent',
      IN_DRAFT: 'neutral',
      BILLED: 'success',
      NOT_BILLABLE: 'muted',
    })
  })
})

describe('entryStateText', () => {
  const billed: TimeEntry = {
    id: 5,
    userId: 1,
    workDate: '2026-11-03',
    durationMinutes: 150,
    billable: true,
    state: 'BILLED',
    editable: false,
    documentId: 42,
    documentNumber: 'RE-2026-0042',
    lockVersion: 1,
  }

  /** A billed entry names its invoice. */
  it('entryStateTextTest', () => {
    expect(entryStateText(billed)).toBe('verrechnet RE-2026-0042')
  })

  /** On a draft the number is not named, even where a draft issued once still carries one. */
  it('entryStateTextOnADraftTest', () => {
    expect(entryStateText({ ...billed, state: 'IN_DRAFT' })).toBe('im Entwurf')
  })

  it('entryStateTextOfAnOpenEntryTest', () => {
    expect(entryStateText({ ...billed, state: 'OPEN', documentId: null, documentNumber: null })).toBe(
      'offen',
    )
  })

  /** Billed without a number is not expected, and reads as billed all the same. */
  it('entryStateTextWithoutANumberTest', () => {
    expect(entryStateText({ ...billed, documentNumber: null })).toBe('verrechnet')
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

  it('billableDefaultUrlTest', () => {
    expect(billableDefaultUrl(1, WEBSITE)).toBe(
      '/api/tenants/1/time-entries/lookups/default-billable?projectId=12',
    )
    expect(billableDefaultUrl(1, MUSTER)).toBe(
      '/api/tenants/1/time-entries/lookups/default-billable?partnerId=11',
    )
  })

  it('billableDefaultUrlForInternalTimeTest', () => {
    expect(billableDefaultUrl(1, null)).toBe('/api/tenants/1/time-entries/lookups/default-billable')
  })

  /** The terms, summaries and defaults live below the time tracking, not below the projects. */
  it('timeTrackingUrlTest', () => {
    expect(timeTrackingUrl(1)).toBe('/api/tenants/1/time-tracking')
  })
})

describe('fetchSuggestedService', () => {
  afterEach(() => vi.unstubAllGlobals())

  function answer(status: number, body?: unknown) {
    const requested: string[] = []
    vi.stubGlobal('fetch', (url: string) => {
      requested.push(url)
      return Promise.resolve(
        new Response(body === undefined ? null : JSON.stringify(body), {
          status,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    })
    return requested
  }

  it('fetchSuggestedServiceTest', async () => {
    const requested = answer(200, CONCEPT)

    await expect(fetchSuggestedService(1, WEBSITE)).resolves.toEqual(CONCEPT)
    expect(requested).toEqual(['/api/tenants/1/time-entries/mine/default-service?projectId=12'])
  })

  /** 204 is «nothing to suggest»; a query may not hold undefined, so it is null. */
  it('fetchSuggestedServiceWithoutSuggestionTest', async () => {
    answer(204)

    await expect(fetchSuggestedService(1, MUSTER)).resolves.toBeNull()
  })

  it('fetchSuggestedServiceWhenRefusedTest', async () => {
    answer(409, { detail: 'Der Mandant betreibt die Zeiterfassung nicht.' })

    await expect(fetchSuggestedService(1, WEBSITE)).rejects.toThrow(
      'Der Mandant betreibt die Zeiterfassung nicht.',
    )
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

  /** Saving terms refreshes the terms and the defaults of «verrechenbar» — and no entries. */
  it('timeTermsKeyTest', () => {
    const root = timeTermsKey(1)

    expect(root).toEqual(['time-terms', 1])
    expect(projectTermsKey(1, 12).slice(0, 2)).toEqual(root)
    expect(billableDefaultKey(1, WEBSITE).slice(0, 2)).toEqual(root)
    expect(root[0]).not.toBe(timeEntriesKey(1)[0])
  })

  it('billableDefaultKeyTest', () => {
    expect(billableDefaultKey(1, WEBSITE)).toEqual(['time-terms', 1, 'default-billable', 'project-12'])
    expect(billableDefaultKey(1, MUSTER)).not.toEqual(billableDefaultKey(1, WEBSITE))
    expect(billableDefaultKey(1, null).at(-1)).toBe('internal')
  })

  it('projectTermsKeyTest', () => {
    expect(projectTermsKey(1, 12)).toEqual(['time-terms', 1, 'project', 12])
    expect(projectTermsKey(1, 12)).not.toEqual(projectTermsKey(2, 12))
  })

  /** A recorded entry refreshes the tiles and the lists of the registers too. */
  it('timeSummaryKeyTest', () => {
    const project = timeSummaryKey(1, { kind: 'PROJECT', projectId: 12 })
    const customer = timeSummaryKey(1, { kind: 'CUSTOMER', partnerId: 12 })

    expect(project.slice(0, 2)).toEqual(timeEntriesKey(1))
    expect(project).not.toEqual(customer)
  })

  it('timeEntryListKeyTest', () => {
    const first = timeEntryListKey(1, { kind: 'PROJECT', projectId: 12 }, 0)

    expect(first.slice(0, 2)).toEqual(timeEntriesKey(1))
    expect(first).not.toEqual(timeEntryListKey(1, { kind: 'PROJECT', projectId: 12 }, 1))
    expect(first).not.toEqual(timeEntryListKey(1, { kind: 'CUSTOMER', partnerId: 12 }, 0))
  })

  /** Every user's default is kept apart from the entries; an entry changes none. */
  it('userDefaultsKeyTest', () => {
    expect(userDefaultsKey(1)).toEqual(['time-user-defaults', 1])
    expect(userDefaultsKey(1)[0]).not.toBe(timeEntriesKey(1)[0])
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

  /** Untouched, the box follows the billing mode the server names for the project. */
  it('effectiveBillableFollowsTheBillingModeTest', () => {
    expect(effectiveBillable(form({ target: WEBSITE }), BY_EFFORT_RULE)).toBe(true)
    expect(effectiveBillable(form({ target: WEBSITE }), FIXED_PRICE_RULE)).toBe(false)
    expect(effectiveBillable(form({ target: WEBSITE }), LOCKED_RULE)).toBe(false)
  })

  /** Ticked by hand, or held by a stored entry, the box says that and not the default. */
  it('effectiveBillableTickedOnAFixedPriceProjectTest', () => {
    expect(effectiveBillable(form({ target: WEBSITE, billable: true }), FIXED_PRICE_RULE)).toBe(true)
    expect(effectiveBillable(form({ target: WEBSITE, billable: false }), BY_EFFORT_RULE)).toBe(false)
  })

  it('billableLockedTest', () => {
    expect(billableLocked(form({ target: WEBSITE }), LOCKED_RULE)).toBe(true)
  })

  /** By effort and at a fixed price the box may be switched either way. */
  it('billableLockedOnABilledProjectTest', () => {
    expect(billableLocked(form({ target: WEBSITE }), BY_EFFORT_RULE)).toBe(false)
    expect(billableLocked(form({ target: WEBSITE }), FIXED_PRICE_RULE)).toBe(false)
    expect(billableLocked(form({ target: MUSTER }), CUSTOMER_RULE)).toBe(false)
  })

  /** Internal time is locked without an answer from the server. */
  it('billableLockedForInternalTimeTest', () => {
    expect(billableLocked(form())).toBe(true)
  })

  /** While the default is on its way the box stays open; the server decides anyway. */
  it('billableLockedBeforeTheDefaultIsKnownTest', () => {
    expect(billableLocked(form({ target: WEBSITE }))).toBe(false)
  })

  /**
   * An entry billable before its project was set to «Nicht verrechenbar» shows yes and may be
   * switched off; only switching on is locked (backend ADR-0162).
   */
  it('billableLockedKeepsAnEntrysYesTest', () => {
    const opened = toTimeEntryForm(entry(), true)

    expect(billableLocked(opened, LOCKED_RULE)).toBe(false)
    expect(billableLocked({ ...opened, billable: false }, LOCKED_RULE)).toBe(true)
  })

  /** A locked box says the server's reason. */
  it('billableTooltipTest', () => {
    expect(billableTooltip(form({ target: WEBSITE }), LOCKED_RULE, true)).toBe(
      'Das Projekt P-00012 ist als «Nicht verrechenbar» vereinbart. Zeit darauf ist nie verrechenbar.',
    )
  })

  it('billableTooltipOfABilledProjectTest', () => {
    expect(billableTooltip(form({ target: WEBSITE }), FIXED_PRICE_RULE, true)).toContain(
      'Zusatzaufwand ausserhalb der Pauschale',
    )
    expect(billableTooltip(form({ target: WEBSITE }), BY_EFFORT_RULE, true)).toContain(
      'Nach Aufwand',
    )
  })

  it('billableTooltipOfACustomerTest', () => {
    expect(billableTooltip(form({ target: MUSTER }), CUSTOMER_RULE, true)).toBe(
      'Mit Kunde ist eine Zeit verrechenbar, ohne Kunde nie. Verrechenbar braucht eine Leistung.',
    )
    expect(billableTooltip(form({ target: WEBSITE }), undefined, true)).toContain('Mit Kunde')
  })

  /** Without projects there is no project to name. */
  it('billableTooltipOfInternalTimeTest', () => {
    expect(billableTooltip(form(), undefined, true)).toBe(
      'Ohne Projekt oder Kunde ist eine Zeit intern und nie verrechenbar.',
    )
    expect(billableTooltip(form(), undefined, false)).toBe(
      'Ohne Kunde ist eine Zeit intern und nie verrechenbar.',
    )
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

  /** On a fixed price project the box follows its no, so the hour needs no service. */
  it('timeEntryComplaintsOnAFixedPriceProjectWithoutServiceTest', () => {
    const line = form({ target: WEBSITE, duration: '1:30' })

    expect(timeEntryComplaints(line, FIXED_PRICE_RULE)).toEqual({})
    expect(timeEntryComplaints(line, BY_EFFORT_RULE).productId).toContain(
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

  /** A change says «verrechenbar» as the box shows it and names the state it was made to. */
  it('toTimeEntryRequestForAChangeTest', () => {
    const line = form({ target: MUSTER, service: SUPPORT })
    const request = toTimeEntryRequest(line, { minutes: 60 }, '2026-11-25', 3, CUSTOMER_RULE)

    expect(request.billable).toBe(true)
    expect(request.lockVersion).toBe(3)
  })

  /** Moved onto a fixed price project, the box follows its no — and so does the change. */
  it('toTimeEntryRequestForAChangeOntoAFixedPriceProjectTest', () => {
    const moved = withTarget(toTimeEntryForm(SUPPORT_HOUR, true), WEBSITE, true)

    const request = toTimeEntryRequest(moved, { minutes: 60 }, '2026-11-25', 2, FIXED_PRICE_RULE)

    expect(request.billable).toBe(false)
  })

  /** What the entry holds goes as it stands, whatever the default of the target is today. */
  it('toTimeEntryRequestForAChangeKeepsTheEntrysValueTest', () => {
    const opened = toTimeEntryForm(entry(), true)

    const request = toTimeEntryRequest(opened, { minutes: 60 }, '2026-11-25', 3, LOCKED_RULE)

    expect(request.billable).toBe(true)
  })

  /** A target chosen anew whose default is still on its way: the server takes the default. */
  it('toTimeEntryRequestForAChangeBeforeTheDefaultIsKnownTest', () => {
    const moved = withTarget(toTimeEntryForm(SUPPORT_HOUR, true), WEBSITE, true)

    const request = toTimeEntryRequest(moved, { minutes: 60 }, '2026-11-25', 2)

    expect(request.billable).toBeNull()
    expect(request.lockVersion).toBe(2)
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

  /** The project chosen anew, «verrechenbar» follows its default: no at a fixed price. */
  it('toTimerChangeRequestOntoAFixedPriceProjectTest', () => {
    const chosen = withTarget(RUNNING, WEBSITE, true)

    expect(toTimerChangeRequest(chosen, RUNNING, 4, FIXED_PRICE_RULE).billable).toBe(false)
  })

  /** Its default still on its way, «verrechenbar» stays out and the server takes the default. */
  it('toTimerChangeRequestBeforeTheDefaultIsKnownTest', () => {
    const moved = withTarget(RUNNING, MUSTER, true)

    expect(toTimerChangeRequest(moved, RUNNING, 4)).not.toHaveProperty('billable')
    expect(toTimerChangeRequest(moved, RUNNING, 4).partnerId).toBe(11)
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

  /** Stopped on a fixed price project untouched, the entry is not billable and needs no service. */
  it('timerComplaintsOnAFixedPriceProjectTest', () => {
    const noService = { ...RUNNING, service: null, serviceTerm: '', billable: null }

    expect(timerComplaints(noService, 'stop', false, FIXED_PRICE_RULE)).toEqual({})
    expect(timerComplaints(noService, 'stop', false, BY_EFFORT_RULE).productId).toContain(
      'Verrechenbar braucht eine Leistung',
    )
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

// --- recording on a project ----------------------------------------------------------

/** The project «Website» of Muster AG, as the project module sends it. */
function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 12,
    projectNumber: 'P-00012',
    name: 'Website',
    partnerId: 11,
    customerName: 'Muster AG',
    status: 'ACTIVE',
    ...overrides,
  }
}

describe('recording on a project', () => {
  it('recordOnStateTest', () => {
    expect(recordOnState(WEBSITE)).toEqual({ recordOn: WEBSITE })
  })

  /** What a link handed over comes back the same, a project and a customer alike. */
  it('recordOnTargetOfTest', () => {
    expect(recordOnTargetOf(recordOnState(WEBSITE))).toEqual(WEBSITE)
    expect(recordOnTargetOf(recordOnState(MUSTER))).toEqual(MUSTER)
  })

  /** A project whose names are gone still names itself by its id; the names are absent. */
  it('recordOnTargetOfWithoutNamesTest', () => {
    expect(recordOnTargetOf({ recordOn: { kind: 'PROJECT', projectId: 12, partnerId: 11 } })).toEqual({
      kind: 'PROJECT',
      projectId: 12,
      projectNumber: null,
      projectName: null,
      partnerId: 11,
      customerName: null,
    })
  })

  /** A screen opened without the state, or with the origin of a mask, starts empty. */
  it('recordOnTargetOfWithoutStateTest', () => {
    expect(recordOnTargetOf(null)).toBeNull()
    expect(recordOnTargetOf(undefined)).toBeNull()
    expect(recordOnTargetOf({ origin: { from: '/projekte', label: 'Projekte' } })).toBeNull()
  })

  /** Router state is not trusted: a broken target is no target. */
  it('recordOnTargetOfWithABrokenTargetTest', () => {
    expect(recordOnTargetOf({ recordOn: null })).toBeNull()
    expect(recordOnTargetOf({ recordOn: 'P-00012' })).toBeNull()
    expect(recordOnTargetOf({ recordOn: { kind: 'PROJECT', partnerId: 11 } })).toBeNull()
    expect(recordOnTargetOf({ recordOn: { kind: 'PROJECT', projectId: '12', partnerId: 11 } })).toBeNull()
    expect(recordOnTargetOf({ recordOn: { kind: 'CUSTOMER', partnerId: '11' } })).toBeNull()
    expect(recordOnTargetOf({ recordOn: { kind: 'CONTRACT', partnerId: 11 } })).toBeNull()
  })

  it('projectTargetOfTest', () => {
    expect(projectTargetOf(project())).toEqual(WEBSITE)
  })

  /** A customer gone since: the project still names itself, without the customer's name. */
  it('projectTargetOfWithoutCustomerNameTest', () => {
    expect(projectTargetOf(project({ customerName: undefined })).customerName).toBeNull()
  })

  it('takesNewTimeTest', () => {
    expect(takesNewTime('OPEN')).toBe(true)
    expect(takesNewTime('ACTIVE')).toBe(true)
  })

  /** Completed keeps its open times billable but takes no new ones; archived takes nothing. */
  it('takesNewTimeOnACompletedProjectTest', () => {
    expect(takesNewTime('COMPLETED')).toBe(false)
    expect(takesNewTime('ARCHIVED')).toBe(false)
  })
})

// --- the registers «Zeiten» ----------------------------------------------------------

/** 42:30 hours on a project: 12 entries, 3 of them open. */
const SUMMARY: TimeSummary = {
  entries: 12,
  totalMinutes: 2550,
  openEntries: 3,
  openMinutes: 750,
  inDraftMinutes: 0,
  billedMinutes: 0,
  notBillableMinutes: 1800,
}

describe('the registers', () => {
  it('timeSummaryUrlTest', () => {
    expect(timeSummaryUrl(1, { kind: 'PROJECT', projectId: 12 })).toBe(
      '/api/tenants/1/time-tracking/projects/12/summary',
    )
    expect(timeSummaryUrl(1, { kind: 'CUSTOMER', partnerId: 11 })).toBe(
      '/api/tenants/1/time-tracking/customers/11/summary',
    )
  })

  /** The page size of every list, the filter of the register, no sort: the server's own order. */
  it('timeEntryListUrlTest', () => {
    expect(timeEntryListUrl(1, { kind: 'PROJECT', projectId: 12 }, 0)).toBe(
      '/api/tenants/1/time-entries?projectId=12&page=0&size=50',
    )
    expect(timeEntryListUrl(1, { kind: 'CUSTOMER', partnerId: 11 }, 2)).toBe(
      '/api/tenants/1/time-entries?partnerId=11&page=2&size=50',
    )
  })

  /** Five tiles in the order the work runs through, with the counts where they say something. */
  it('timeSummaryFiguresTest', () => {
    expect(timeSummaryFigures(SUMMARY)).toEqual([
      { label: 'Total', minutes: 2550, entries: 12 },
      { label: 'Offen verrechenbar', minutes: 750, entries: 3 },
      { label: 'Im Entwurf', minutes: 0 },
      { label: 'Verrechnet', minutes: 0 },
      { label: 'Nicht verrechenbar', minutes: 1800 },
    ])
  })

  /** A project without any time still has its five tiles, at nothing. */
  it('timeSummaryFiguresWithoutEntriesTest', () => {
    const empty: TimeSummary = {
      entries: 0,
      totalMinutes: 0,
      openEntries: 0,
      openMinutes: 0,
      inDraftMinutes: 0,
      billedMinutes: 0,
      notBillableMinutes: 0,
    }

    expect(timeSummaryFigures(empty).map((figure) => figure.minutes)).toEqual([0, 0, 0, 0, 0])
    expect(timeSummaryFigures(empty)[0].entries).toBe(0)
  })

  it('hoursTextTest', () => {
    expect(hoursText(2550)).toBe('42:30 Std.')
  })

  it('hoursTextOfNothingTest', () => {
    expect(hoursText(0)).toBe('0:00 Std.')
    expect(hoursText(1)).toBe('0:01 Std.')
  })

  it('entryCountTextTest', () => {
    expect(entryCountText(12)).toBe('12 Einträge')
    expect(entryCountText(1204)).toBe('1’204 Einträge')
  })

  it('entryCountTextOfOneTest', () => {
    expect(entryCountText(1)).toBe('1 Eintrag')
    expect(entryCountText(0)).toBe('0 Einträge')
  })

  it('entryUserTextTest', () => {
    expect(entryUserText(entry({ userName: 'Anna Muster' }))).toBe('Anna Muster')
  })

  /** A user the tenant does not know any more: the entry stays, named as such. */
  it('entryUserTextOfAUserThatIsGoneTest', () => {
    expect(entryUserText(entry({ userName: null }))).toBe('Benutzer nicht mehr vorhanden')
    expect(entryUserText(entry())).toBe('Benutzer nicht mehr vorhanden')
  })

  it('entryProjectTextTest', () => {
    expect(entryProjectText(entry())).toBe('P-00012 Website')
  })

  it('entryProjectTextWithoutProjectTest', () => {
    expect(entryProjectText(SUPPORT_HOUR)).toBe('ohne Projekt')
  })

  it('entryProjectTextOfAProjectThatIsGoneTest', () => {
    expect(entryProjectText(entry({ projectNumber: null, projectName: null }))).toBe(
      'Projekt nicht mehr vorhanden',
    )
  })
})

// --- the terms of a project ----------------------------------------------------------

/** Terms nobody saved: by effort, without a rate, and without a lockVersion. */
const DEFAULT_TERMS: ProjectTerms = {
  projectId: 12,
  billingMode: 'BY_EFFORT',
  billableByDefault: true,
  billableAllowed: true,
  openEntries: 3,
}

/** Terms saved once: a fixed price at 140.00 CHF. */
const SAVED_TERMS: ProjectTerms = {
  ...DEFAULT_TERMS,
  billingMode: 'FIXED_PRICE',
  hourlyRate: 140,
  currency: 'CHF',
  billableByDefault: false,
  lockVersion: 2,
}

describe('the terms of a project', () => {
  /** The three of the backend, in the order the choice shows them, each with a word and a hint. */
  it('billingModesTest', () => {
    expect(BILLING_MODES).toEqual(['BY_EFFORT', 'FIXED_PRICE', 'NOT_BILLABLE'])
    expect(BILLING_MODE_LABELS).toEqual({
      BY_EFFORT: 'Nach Aufwand',
      FIXED_PRICE: 'Pauschal',
      NOT_BILLABLE: 'Nicht verrechenbar',
    })
    expect(Object.keys(BILLING_MODE_HINTS)).toEqual(Object.keys(BILLING_MODE_LABELS))
  })

  it('projectTermsUrlTest', () => {
    expect(projectTermsUrl(1, 12)).toBe('/api/tenants/1/time-tracking/projects/12/terms')
  })

  it('toProjectTermsFormTest', () => {
    expect(toProjectTermsForm(SAVED_TERMS)).toEqual({ billingMode: 'FIXED_PRICE', hourlyRate: '140.00' })
  })

  it('toProjectTermsFormWithoutRateTest', () => {
    expect(toProjectTermsForm(DEFAULT_TERMS)).toEqual({ billingMode: 'BY_EFFORT', hourlyRate: '' })
  })

  it('rateFieldOfTest', () => {
    expect(rateFieldOf(140)).toBe('140.00')
    expect(rateFieldOf(1250.5)).toBe('1250.50')
  })

  /** Up to four decimals stay, so nothing stored is cut off in the field. */
  it('rateFieldOfWithFourDecimalsTest', () => {
    expect(rateFieldOf(152.375)).toBe('152.375')
    expect(rateFieldOf(152.3755)).toBe('152.3755')
    expect(rateFieldOf(0)).toBe('0.00')
  })

  it('rateFieldOfWithoutRateTest', () => {
    expect(rateFieldOf(null)).toBe('')
    expect(rateFieldOf(undefined)).toBe('')
  })

  it('hourlyRateTextTest', () => {
    expect(hourlyRateText(SAVED_TERMS)).toBe('140.00 CHF pro Stunde')
    expect(hourlyRateText({ ...SAVED_TERMS, hourlyRate: 1250.5 })).toBe('1’250.50 CHF pro Stunde')
  })

  /** 0.00 is a rate — work that costs nothing on this project — not the absence of one. */
  it('hourlyRateTextOfZeroTest', () => {
    expect(hourlyRateText({ ...SAVED_TERMS, hourlyRate: 0 })).toBe('0.00 CHF pro Stunde')
  })

  it('hourlyRateTextWithoutRateTest', () => {
    expect(hourlyRateText(DEFAULT_TERMS)).toBe('Preis der Leistung')
  })

  it('projectTermsComplaintsTest', () => {
    expect(projectTermsComplaints({ billingMode: 'BY_EFFORT', hourlyRate: '140' })).toEqual({})
    expect(projectTermsComplaints({ billingMode: 'BY_EFFORT', hourlyRate: '1’250,50' })).toEqual({})
  })

  /** Empty is no rate, and 0.00 is one: neither is a complaint. */
  it('projectTermsComplaintsWithoutRateTest', () => {
    expect(projectTermsComplaints({ billingMode: 'FIXED_PRICE', hourlyRate: '  ' })).toEqual({})
    expect(projectTermsComplaints({ billingMode: 'FIXED_PRICE', hourlyRate: '0.00' })).toEqual({})
  })

  it('projectTermsComplaintsWithANegativeRateTest', () => {
    expect(projectTermsComplaints({ billingMode: 'BY_EFFORT', hourlyRate: '-1' })).toEqual({
      hourlyRate: 'Der Projektsatz darf nicht negativ sein. Leer heisst: der Preis der Leistung gilt.',
    })
  })

  it('projectTermsComplaintsWithAnUnreadableRateTest', () => {
    expect(projectTermsComplaints({ billingMode: 'BY_EFFORT', hourlyRate: '140 Fr.' }).hourlyRate).toBe(
      'Einen Betrag eingeben, zum Beispiel 140.00, oder leer lassen.',
    )
  })

  /** Saved once, the terms go back with the state they were read with; no currency, ever. */
  it('toProjectTermsRequestTest', () => {
    expect(
      toProjectTermsRequest({ billingMode: 'BY_EFFORT', hourlyRate: '150.00' }, SAVED_TERMS),
    ).toEqual({ billingMode: 'BY_EFFORT', hourlyRate: 150, lockVersion: 2 })
  })

  /** Terms nobody saved have no lockVersion, and none goes back (backend ADR-0162). */
  it('toProjectTermsRequestOfTermsNeverSavedTest', () => {
    expect(
      toProjectTermsRequest({ billingMode: 'NOT_BILLABLE', hourlyRate: '' }, DEFAULT_TERMS),
    ).toEqual({ billingMode: 'NOT_BILLABLE', hourlyRate: null })
  })

  it('toProjectTermsRequestWithAZeroRateTest', () => {
    expect(
      toProjectTermsRequest({ billingMode: 'BY_EFFORT', hourlyRate: '0' }, DEFAULT_TERMS).hourlyRate,
    ).toBe(0)
  })

  it('projectTermsChangedTest', () => {
    expect(projectTermsChanged({ billingMode: 'BY_EFFORT', hourlyRate: '140.00' }, SAVED_TERMS)).toBe(true)
    expect(projectTermsChanged({ billingMode: 'FIXED_PRICE', hourlyRate: '150' }, SAVED_TERMS)).toBe(true)
    expect(projectTermsChanged({ billingMode: 'FIXED_PRICE', hourlyRate: '' }, SAVED_TERMS)).toBe(true)
    expect(projectTermsChanged({ billingMode: 'BY_EFFORT', hourlyRate: '0' }, DEFAULT_TERMS)).toBe(true)
  })

  /** «140» for a rate of 140.00 is the same rate. */
  it('projectTermsChangedWithoutChangeTest', () => {
    expect(projectTermsChanged(toProjectTermsForm(SAVED_TERMS), SAVED_TERMS)).toBe(false)
    expect(projectTermsChanged({ billingMode: 'FIXED_PRICE', hourlyRate: '140' }, SAVED_TERMS)).toBe(false)
    expect(projectTermsChanged({ billingMode: 'BY_EFFORT', hourlyRate: ' ' }, DEFAULT_TERMS)).toBe(false)
  })

  /** Something unreadable typed is a change, so saving can say what is wrong with it. */
  it('projectTermsChangedWithAnUnreadableRateTest', () => {
    expect(projectTermsChanged({ billingMode: 'BY_EFFORT', hourlyRate: 'abc' }, DEFAULT_TERMS)).toBe(true)
  })

  /** A new mode names the open billable entries it leaves as they are. */
  it('termsSavedTextTest', () => {
    expect(termsSavedText(DEFAULT_TERMS, { ...SAVED_TERMS, openEntries: 12 })).toBe(
      'Gespeichert. Die Abrechnungsart gilt für neue Zeit: 12 offene verrechenbare Einträge bleiben, wie sie sind.',
    )
  })

  it('termsSavedTextWithOneOpenEntryTest', () => {
    expect(termsSavedText(DEFAULT_TERMS, { ...SAVED_TERMS, openEntries: 1 })).toBe(
      'Gespeichert. Die Abrechnungsart gilt für neue Zeit: 1 offener verrechenbarer Eintrag bleibt, wie er ist.',
    )
  })

  /** The same mode, or nothing open: there is nothing to say about the entries. */
  it('termsSavedTextWithoutAnythingToSayTest', () => {
    expect(termsSavedText(SAVED_TERMS, { ...SAVED_TERMS, hourlyRate: 150 })).toBe('Gespeichert.')
    expect(termsSavedText(DEFAULT_TERMS, { ...SAVED_TERMS, openEntries: 0 })).toBe('Gespeichert.')
  })

  it('openEntriesStayTextTest', () => {
    expect(openEntriesStayText(1204)).toBe('1’204 offene verrechenbare Einträge bleiben, wie sie sind.')
    expect(openEntriesStayText(1)).toBe('1 offener verrechenbarer Eintrag bleibt, wie er ist.')
  })
})

// --- the default service of every user -----------------------------------------------

function userDefault(overrides: Partial<TimeUserDefault> = {}): TimeUserDefault {
  return {
    userId: 42,
    userName: 'Beat Keller',
    userActive: true,
    productId: 31,
    productNumber: 'L-001',
    serviceName: 'Beratung Senior',
    serviceActive: true,
    ...overrides,
  }
}

describe('the default service of every user', () => {
  it('userDefaultsUrlTest', () => {
    expect(userDefaultsUrl(1)).toBe('/api/tenants/1/time-tracking/user-defaults')
  })

  it('userDefaultUrlTest', () => {
    expect(userDefaultUrl(1, 42)).toBe('/api/tenants/1/time-tracking/user-defaults/42')
  })

  it('userDefaultStateTest', () => {
    expect(userDefaultState(userDefault())).toBe('ACTIVE')
  })

  it('userDefaultStateWithoutDefaultTest', () => {
    const none = userDefault({ productId: null, productNumber: null, serviceName: null, serviceActive: false })

    expect(userDefaultState(none)).toBe('NONE')
  })

  /** Deactivated since: still the default, but the quick line no longer suggests it. */
  it('userDefaultStateOfADeactivatedServiceTest', () => {
    expect(userDefaultState(userDefault({ serviceActive: false }))).toBe('INACTIVE')
  })

  it('userDefaultStateOfAProductThatIsGoneTest', () => {
    expect(userDefaultState(userDefault({ serviceName: null, serviceActive: false }))).toBe('GONE')
  })
})
