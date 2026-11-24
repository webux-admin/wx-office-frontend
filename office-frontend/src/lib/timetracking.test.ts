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
  copyRequestOf,
  dayTotalText,
  defaultServiceKey,
  defaultServiceUrl,
  durationFieldOf,
  effectiveBillable,
  emptyTimeEntryForm,
  entryServiceText,
  entryTargetText,
  formChanged,
  hasLaterWeek,
  hasLineInput,
  isToldByLine,
  lineErrors,
  nextEntryForm,
  recentTargetLabel,
  recentTargetsKey,
  recentTargetsUrl,
  sameTarget,
  serviceLookupUrl,
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
  toTimeEntryForm,
  toTimeEntryRequest,
  weekStep,
  withRecentTarget,
  withService,
  withServiceTerm,
  withSuggestedService,
  withTarget,
  withTargetTerm,
  type TimeEntryForm,
} from './timetracking'
import type { TimeEntry, TimeServiceChoice, TimeTargetChoice } from './types'

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
