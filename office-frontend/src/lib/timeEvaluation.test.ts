import { describe, expect, it } from 'vitest'
import {
  GROUP_HEADERS,
  RANGE_PRESETS,
  TIME_ENTRY_STATES,
  TIME_EVALUATION_PATH,
  drillDown,
  evaluationEntriesKey,
  evaluationEntriesUrl,
  evaluationExportUrl,
  evaluationFigures,
  evaluationFilterOf,
  evaluationGroupsKey,
  evaluationGroupsUrl,
  evaluationPath,
  evaluationQuery,
  evaluationSearchOf,
  evaluationTotalsKey,
  evaluationTotalsUrl,
  evaluationViewOf,
  evaluationViews,
  groupDetail,
  groupKey,
  groupLabel,
  hasWholeRange,
  isNarrowed,
  narrowingOf,
  narrowingOptions,
  narrowingValue,
  presetOf,
  presetRange,
  withState,
  withoutNarrowing,
  type TimeEvaluationFilter,
} from './timeEvaluation'
import { timeEntriesKey } from './timetracking'
import type { TimeGroup, TimeSummary } from './types'

/** A Tuesday in November 2026, the day every test runs on. */
const TODAY = '2026-11-24'

/** November 2026 and nothing else. */
const NOVEMBER: TimeEvaluationFilter = {
  from: '2026-11-01',
  to: '2026-11-30',
  userIds: [],
  project: null,
  customer: null,
  service: null,
  states: [],
  search: '',
}

/** November, two people, one project, the open and the billed time, a word of the text. */
const NARROW: TimeEvaluationFilter = {
  ...NOVEMBER,
  userIds: [3, 7],
  project: 12,
  states: ['OPEN', 'BILLED'],
  search: 'Konzept',
}

const SUMMARY: TimeSummary = {
  entries: 12,
  totalMinutes: 2550,
  billableMinutes: 1800,
  openEntries: 3,
  openMinutes: 750,
  inDraftMinutes: 450,
  billedMinutes: 600,
  notBillableMinutes: 750,
}

function group(overrides: Partial<TimeGroup>): TimeGroup {
  return { totals: SUMMARY, ...overrides }
}

function params(search: string): URLSearchParams {
  return new URLSearchParams(search)
}

describe('the address', () => {
  it('evaluationFilterOfTest', () => {
    const filter = evaluationFilterOf(
      params('von=2026-10-01&bis=2026-10-31&person=3&person=7&projekt=12&kunde=11&leistung=5'
        + '&zustand=OPEN&zustand=BILLED&suche=Konzept'),
      TODAY,
      true,
    )

    expect(filter).toEqual({
      from: '2026-10-01',
      to: '2026-10-31',
      userIds: [3, 7],
      project: 12,
      customer: 11,
      service: 5,
      states: ['OPEN', 'BILLED'],
      search: 'Konzept',
    })
  })

  /** An address that names no day asks for this month. */
  it('evaluationFilterOfWithoutAnythingTest', () => {
    expect(evaluationFilterOf(params(''), TODAY, true)).toEqual(NOVEMBER)
  })

  /** A day emptied by hand stays empty, even with the other one gone too. */
  it('evaluationFilterOfWithEmptyDaysTest', () => {
    const filter = evaluationFilterOf(params('von=&bis='), TODAY, true)

    expect(filter.from).toBe('')
    expect(filter.to).toBe('')
  })

  it('evaluationFilterOfWithoutProjectsTest', () => {
    expect(evaluationFilterOf(params('projekt=12'), TODAY, false).project).toBeNull()
    expect(evaluationFilterOf(params('projekt=ohne'), TODAY, true).project).toBe('NONE')
  })

  /** The states come in the order of the work, a doubled person once. */
  it('evaluationFilterOfInItsOwnOrderTest', () => {
    const filter = evaluationFilterOf(
      params('zustand=NOT_BILLABLE&zustand=OPEN&person=7&person=7'),
      TODAY,
      true,
    )

    expect(filter.states).toEqual(['OPEN', 'NOT_BILLABLE'])
    expect(filter.userIds).toEqual([7])
  })

  /** A mistyped link is read as far as it makes sense and never sent as it stands. */
  it('evaluationFilterOfWithNonsenseTest', () => {
    const filter = evaluationFilterOf(
      params('von=1.11.2026&bis=2026-11-3&person=anna&person=0&person=-4&projekt=P-12'
        + '&kunde=&leistung=1e3&zustand=PAID&zustand=open'),
      TODAY,
      true,
    )

    expect(filter).toEqual({ ...NOVEMBER, from: '', to: '' })
  })

  it('evaluationFilterOfWithALongSearchTest', () => {
    const filter = evaluationFilterOf(params(`suche=${'a'.repeat(250)}`), TODAY, true)

    expect(filter.search).toHaveLength(200)
  })

  it('evaluationViewOfTest', () => {
    expect(evaluationViewOf(params('nach=person'), true)).toBe('user')
    expect(evaluationViewOf(params('nach=projekt'), true)).toBe('project')
    expect(evaluationViewOf(params('nach=kunde'), true)).toBe('customer')
    expect(evaluationViewOf(params('nach=leistung'), true)).toBe('service')
    expect(evaluationViewOf(params('nach=woche'), true)).toBe('week')
    expect(evaluationViewOf(params('nach=monat'), true)).toBe('month')
  })

  it('evaluationViewOfWithoutAViewTest', () => {
    expect(evaluationViewOf(params(''), true)).toBe('entries')
    expect(evaluationViewOf(params('nach=jahr'), true)).toBe('entries')
    expect(evaluationViewOf(params('nach=user'), true)).toBe('entries')
  })

  it('evaluationViewOfProjectsWithoutProjectsTest', () => {
    expect(evaluationViewOf(params('nach=projekt'), false)).toBe('entries')
  })

  it('evaluationSearchOfTest', () => {
    expect(evaluationSearchOf(NARROW, 'week')).toBe(
      'von=2026-11-01&bis=2026-11-30&person=3&person=7&projekt=12&zustand=OPEN&zustand=BILLED'
        + '&suche=Konzept&nach=woche',
    )
  })

  /** The days go in even empty; the entries need no `nach`; «ohne» stands for none. */
  it('evaluationSearchOfAtTheEdgesTest', () => {
    expect(evaluationSearchOf({ ...NOVEMBER, from: '', to: '' }, 'entries')).toBe('von=&bis=')
    expect(evaluationSearchOf({ ...NOVEMBER, customer: 'NONE', service: 'NONE' }, 'entries')).toBe(
      'von=2026-11-01&bis=2026-11-30&kunde=ohne&leistung=ohne',
    )
  })

  /** What goes into the address comes back out of it unchanged. */
  it('evaluationSearchOfReadsBackTest', () => {
    const search = evaluationSearchOf({ ...NARROW, customer: 'NONE', service: 5 }, 'month')

    expect(evaluationFilterOf(params(search), TODAY, true)).toEqual({
      ...NARROW,
      customer: 'NONE',
      service: 5,
    })
    expect(evaluationViewOf(params(search), true)).toBe('month')
  })

  it('evaluationPathTest', () => {
    expect(evaluationPath(NOVEMBER, 'user')).toBe(
      `${TIME_EVALUATION_PATH}?von=2026-11-01&bis=2026-11-30&nach=person`,
    )
    expect(TIME_EVALUATION_PATH).toBe('/zeiten-auswertung')
  })

  it('narrowingValueTest', () => {
    expect(narrowingValue(12)).toBe('12')
    expect(narrowingValue('NONE')).toBe('ohne')
    expect(narrowingValue(null)).toBe('')
  })

  it('narrowingOfTest', () => {
    expect(narrowingOf('12')).toBe(12)
    expect(narrowingOf('ohne')).toBe('NONE')
  })

  it('narrowingOfNothingTest', () => {
    expect(narrowingOf('')).toBeNull()
    expect(narrowingOf(null)).toBeNull()
    expect(narrowingOf('0')).toBeNull()
    expect(narrowingOf('Ohne')).toBeNull()
    expect(narrowingOf('12.5')).toBeNull()
  })
})

describe('the requests', () => {
  it('hasWholeRangeTest', () => {
    expect(hasWholeRange(NOVEMBER)).toBe(true)
  })

  it('hasWholeRangeWithADayMissingTest', () => {
    expect(hasWholeRange({ ...NOVEMBER, from: '' })).toBe(false)
    expect(hasWholeRange({ ...NOVEMBER, to: '2026-11' })).toBe(false)
  })

  it('evaluationQueryTest', () => {
    expect(evaluationQuery(NARROW)).toBe(
      'from=2026-11-01&to=2026-11-30&userId=3&userId=7&projectId=12&state=OPEN&state=BILLED'
        + '&search=Konzept',
    )
  })

  /** «ohne …» goes as `unassigned`, in a fixed order; a search of blanks goes not at all. */
  it('evaluationQueryWithoutAssignmentsTest', () => {
    expect(
      evaluationQuery({
        ...NOVEMBER,
        project: 'NONE',
        customer: 'NONE',
        service: 'NONE',
        search: '   ',
      }),
    ).toBe(
      'from=2026-11-01&to=2026-11-30&unassigned=PROJECT&unassigned=CUSTOMER&unassigned=SERVICE',
    )
  })

  it('evaluationQueryTrimsTheSearchTest', () => {
    expect(evaluationQuery({ ...NOVEMBER, search: ' Konzept ' })).toBe(
      'from=2026-11-01&to=2026-11-30&search=Konzept',
    )
  })

  it('evaluationEntriesUrlTest', () => {
    expect(evaluationEntriesUrl(1, NOVEMBER, 2, 'userName,asc')).toBe(
      '/api/tenants/1/time-entries?from=2026-11-01&to=2026-11-30&page=2&size=50&sort=userName%2Casc',
    )
  })

  it('evaluationEntriesUrlWithoutASortTest', () => {
    expect(evaluationEntriesUrl(1, NOVEMBER, 0, '')).toBe(
      '/api/tenants/1/time-entries?from=2026-11-01&to=2026-11-30&page=0&size=50',
    )
  })

  it('evaluationTotalsUrlTest', () => {
    expect(evaluationTotalsUrl(1, NARROW)).toBe(
      `/api/tenants/1/time-entries/totals?${evaluationQuery(NARROW)}`,
    )
  })

  it('evaluationGroupsUrlTest', () => {
    expect(evaluationGroupsUrl(1, 'week', NOVEMBER)).toBe(
      '/api/tenants/1/time-entries/totals/by/week?from=2026-11-01&to=2026-11-30',
    )
  })

  it('evaluationExportUrlTest', () => {
    expect(evaluationExportUrl(1, NARROW)).toBe(
      `/api/tenants/1/time-entries/export.csv?${evaluationQuery(NARROW)}`,
    )
  })

  /** A request without a single parameter carries no lone `?`. */
  it('evaluationUrlsWithoutAnyParameterTest', () => {
    const nothing: TimeEvaluationFilter = { ...NOVEMBER, from: '', to: '' }

    expect(evaluationTotalsUrl(1, nothing)).toBe('/api/tenants/1/time-entries/totals')
    expect(evaluationExportUrl(1, nothing)).toBe('/api/tenants/1/time-entries/export.csv')
  })

  /** Under the key of every entry, so a written entry refreshes the evaluation. */
  it('evaluationKeysTest', () => {
    const under = timeEntriesKey(1)

    expect(evaluationTotalsKey(1, NOVEMBER).slice(0, under.length)).toEqual(under)
    expect(evaluationEntriesKey(1, NOVEMBER, 0, 'workDate,desc').slice(0, under.length)).toEqual(under)
    expect(evaluationGroupsKey(1, 'user', NOVEMBER).slice(0, under.length)).toEqual(under)
  })

  /** The same question is the same key, a blank more in the search included. */
  it('evaluationKeysOfTheSameQuestionTest', () => {
    expect(evaluationGroupsKey(1, 'project', { ...NOVEMBER, search: ' ' })).toEqual(
      evaluationGroupsKey(1, 'project', NOVEMBER),
    )
    expect(evaluationTotalsKey(1, NARROW)).not.toEqual(evaluationTotalsKey(1, NOVEMBER))
    expect(evaluationEntriesKey(1, NOVEMBER, 0, 'workDate,desc')).not.toEqual(
      evaluationEntriesKey(1, NOVEMBER, 1, 'workDate,desc'),
    )
  })
})

describe('changing the filter', () => {
  it('presetRangeTest', () => {
    expect(presetRange('THIS_WEEK', TODAY)).toEqual({ from: '2026-11-23', to: '2026-11-29' })
    expect(presetRange('THIS_MONTH', TODAY)).toEqual({ from: '2026-11-01', to: '2026-11-30' })
    expect(presetRange('LAST_MONTH', TODAY)).toEqual({ from: '2026-10-01', to: '2026-10-31' })
    expect(presetRange('THIS_YEAR', TODAY)).toEqual({ from: '2026-01-01', to: '2026-12-31' })
  })

  /** On the 1st of January last month is December of the year before. */
  it('presetRangeAtTheTurnOfTheYearTest', () => {
    expect(presetRange('LAST_MONTH', '2027-01-01')).toEqual({ from: '2026-12-01', to: '2026-12-31' })
    expect(presetRange('THIS_WEEK', '2027-01-01')).toEqual({ from: '2026-12-28', to: '2027-01-03' })
  })

  it('presetRangeInALeapYearTest', () => {
    expect(presetRange('THIS_MONTH', '2028-02-10')).toEqual({ from: '2028-02-01', to: '2028-02-29' })
    expect(presetRange('LAST_MONTH', '2028-03-31')).toEqual({ from: '2028-02-01', to: '2028-02-29' })
  })

  /** A Monday and a Sunday belong to their own week. */
  it('presetRangeOfAWeekAtItsEndsTest', () => {
    expect(presetRange('THIS_WEEK', '2026-11-23').from).toBe('2026-11-23')
    expect(presetRange('THIS_WEEK', '2026-11-29').from).toBe('2026-11-23')
  })

  it('rangePresetsTest', () => {
    expect(RANGE_PRESETS.map((preset) => preset.label)).toEqual([
      'Diese Woche',
      'Dieser Monat',
      'Letzter Monat',
      'Dieses Jahr',
    ])
  })

  it('presetOfTest', () => {
    expect(presetOf(NOVEMBER, TODAY)).toBe('THIS_MONTH')
    expect(presetOf({ ...NOVEMBER, from: '2026-01-01', to: '2026-12-31' }, TODAY)).toBe('THIS_YEAR')
  })

  it('presetOfAnyOtherRangeTest', () => {
    expect(presetOf({ ...NOVEMBER, to: '2026-11-29' }, TODAY)).toBeNull()
    expect(presetOf({ ...NOVEMBER, from: '' }, TODAY)).toBeNull()
  })

  it('withStateTest', () => {
    expect(withState(NOVEMBER, 'BILLED', true).states).toEqual(['BILLED'])
    expect(withState(withState(NOVEMBER, 'BILLED', true), 'OPEN', true).states).toEqual([
      'OPEN',
      'BILLED',
    ])
  })

  it('withStateOffTest', () => {
    expect(withState(NARROW, 'OPEN', false).states).toEqual(['BILLED'])
    expect(withState(NOVEMBER, 'OPEN', false).states).toEqual([])
  })

  it('timeEntryStatesTest', () => {
    expect(TIME_ENTRY_STATES).toEqual(['OPEN', 'IN_DRAFT', 'BILLED', 'NOT_BILLABLE'])
  })

  it('isNarrowedTest', () => {
    expect(isNarrowed(NARROW)).toBe(true)
    expect(isNarrowed({ ...NOVEMBER, service: 'NONE' })).toBe(true)
  })

  /** The range alone is no narrowing, and neither is a search of blanks. */
  it('isNarrowedByTheRangeAloneTest', () => {
    expect(isNarrowed(NOVEMBER)).toBe(false)
    expect(isNarrowed({ ...NOVEMBER, from: '2026-01-01', search: '  ' })).toBe(false)
  })

  it('withoutNarrowingTest', () => {
    expect(withoutNarrowing({ ...NARROW, customer: 'NONE' })).toEqual(NOVEMBER)
    expect(withoutNarrowing(NOVEMBER)).toEqual(NOVEMBER)
  })
})

describe('the groups', () => {
  it('evaluationViewsTest', () => {
    expect(evaluationViews(true).map((view) => view.label)).toEqual([
      'Einträge',
      'nach Mitarbeitenden',
      'nach Projekt',
      'nach Kunde',
      'nach Leistung',
      'nach Woche',
      'nach Monat',
    ])
  })

  it('evaluationViewsWithoutProjectsTest', () => {
    expect(evaluationViews(false).map((view) => view.id)).toEqual([
      'entries',
      'user',
      'customer',
      'service',
      'week',
      'month',
    ])
  })

  it('groupHeadersTest', () => {
    expect(GROUP_HEADERS.user).toBe('Person')
    expect(GROUP_HEADERS.week).toBe('Woche')
  })

  it('groupLabelTest', () => {
    expect(groupLabel(group({ id: 3, name: 'Anna Muster' }), 'user')).toBe('Anna Muster')
    expect(groupLabel(group({ id: 12, number: 'P-00012', name: 'Website' }), 'project')).toBe(
      'P-00012 Website',
    )
    expect(groupLabel(group({ id: 11, name: 'Muster AG' }), 'customer')).toBe('Muster AG')
    expect(groupLabel(group({ id: 5, number: 'L-4', name: 'Konzeption' }), 'service')).toBe(
      'Konzeption',
    )
    expect(groupLabel(group({ period: '2026-W48' }), 'week')).toBe('KW 48 · 2026')
    expect(groupLabel(group({ period: '2028-02' }), 'month')).toBe('Februar 2028')
  })

  /** Week 53 of 2026 runs into 2027 and still counts in 2026. */
  it('groupLabelOfTheLastWeekTest', () => {
    expect(groupLabel(group({ period: '2026-W53' }), 'week')).toBe('KW 53 · 2026')
    expect(groupLabel(group({ period: '2027-W01' }), 'week')).toBe('KW 1 · 2027')
  })

  it('groupLabelWithoutOneTest', () => {
    expect(groupLabel(group({}), 'project')).toBe('ohne Projekt')
    expect(groupLabel(group({}), 'customer')).toBe('ohne Kunde')
    expect(groupLabel(group({ id: null }), 'service')).toBe('ohne Leistung')
  })

  it('groupLabelOfOneGoneTest', () => {
    expect(groupLabel(group({ id: 3 }), 'user')).toBe('Benutzer nicht mehr vorhanden')
    expect(groupLabel(group({ id: 12 }), 'project')).toBe('Projekt nicht mehr vorhanden')
    expect(groupLabel(group({ id: 11 }), 'customer')).toBe('Kunde nicht mehr vorhanden')
    expect(groupLabel(group({ id: 5 }), 'service')).toBe('Leistung nicht mehr vorhanden')
  })

  it('groupLabelOfAPeriodItCannotReadTest', () => {
    expect(groupLabel(group({ period: '2026-48' }), 'week')).toBe('2026-48')
    expect(groupLabel(group({}), 'month')).toBe('')
  })

  it('groupDetailTest', () => {
    expect(groupDetail(group({ period: '2026-W53', from: '2026-12-28', to: '2026-12-31' }), 'week')).toBe(
      '28.12.2026–31.12.2026',
    )
    expect(groupDetail(group({ period: '2028-02', from: '2028-02-01', to: '2028-02-29' }), 'month')).toBe(
      '01.02.2028–29.02.2028',
    )
    expect(groupDetail(group({ id: 5, number: 'L-4', name: 'Konzeption' }), 'service')).toBe('L-4')
  })

  it('groupDetailWithNothingToAddTest', () => {
    expect(groupDetail(group({ id: 12, number: 'P-00012', name: 'Website' }), 'project')).toBeNull()
    expect(groupDetail(group({ id: 5, name: 'Konzeption' }), 'service')).toBeNull()
    expect(groupDetail(group({ period: '2026-W48' }), 'week')).toBeNull()
    expect(groupDetail(group({ id: 3, name: 'Anna Muster' }), 'user')).toBeNull()
  })

  it('groupKeyTest', () => {
    expect(groupKey(group({ id: 12 }))).toBe('12')
    expect(groupKey(group({ period: '2026-W48' }))).toBe('2026-W48')
    expect(groupKey(group({}))).toBe('ohne')
  })

  it('drillDownTest', () => {
    expect(drillDown(NARROW, 'user', group({ id: 9, name: 'Beat' })).userIds).toEqual([9])
    expect(drillDown(NOVEMBER, 'project', group({ id: 12 })).project).toBe(12)
    expect(drillDown(NOVEMBER, 'customer', group({ id: 11 })).customer).toBe(11)
    expect(drillDown(NOVEMBER, 'service', group({ id: 5 })).service).toBe(5)
  })

  /** The rows «ohne …» narrow to the entries without one. */
  it('drillDownWithoutOneTest', () => {
    expect(drillDown(NOVEMBER, 'project', group({})).project).toBe('NONE')
    expect(drillDown(NOVEMBER, 'customer', group({ id: null })).customer).toBe('NONE')
    expect(drillDown(NOVEMBER, 'service', group({})).service).toBe('NONE')
  })

  /** A week or a month sets exactly its days inside the filter, the rest of the filter stays. */
  it('drillDownIntoAPeriodTest', () => {
    const week = group({ period: '2026-W49', from: '2026-11-30', to: '2026-11-30' })

    expect(drillDown(NARROW, 'week', week)).toEqual({ ...NARROW, from: '2026-11-30', to: '2026-11-30' })
    expect(
      drillDown(NOVEMBER, 'month', group({ period: '2026-11', from: '2026-11-01', to: '2026-11-30' })),
    ).toEqual(NOVEMBER)
  })

  it('drillDownIntoARowItCannotReadTest', () => {
    expect(drillDown(NARROW, 'user', group({}))).toEqual(NARROW)
    expect(drillDown(NARROW, 'week', group({ period: '2026-W49' }))).toEqual(NARROW)
  })

  it('narrowingOptionsTest', () => {
    const rows = [
      group({ id: 12, number: 'P-00012', name: 'Website' }),
      group({ id: 14, number: 'P-00014', name: 'Shop' }),
      group({}),
    ]

    expect(narrowingOptions(rows, 'project', 12)).toEqual([
      { value: '12', label: 'P-00012 Website' },
      { value: '14', label: 'P-00014 Shop' },
      { value: 'ohne', label: 'ohne Projekt' },
    ])
  })

  it('narrowingOptionsWithNothingInTheRangeTest', () => {
    expect(narrowingOptions([], 'customer', null)).toEqual([])
  })

  /** What a link chose stays a choice, even without time in the range. */
  it('narrowingOptionsWithAChoiceOutsideTheRangeTest', () => {
    const rows = [group({ id: 11, name: 'Muster AG' })]

    expect(narrowingOptions(rows, 'customer', 13)).toEqual([
      { value: '11', label: 'Muster AG' },
      { value: '13', label: 'Gewählter Kunde, ohne Zeit im Zeitraum' },
    ])
    expect(narrowingOptions(rows, 'service', 'NONE')).toEqual([
      { value: '11', label: 'Muster AG' },
      { value: 'ohne', label: 'ohne Leistung' },
    ])
  })
})

describe('the tiles', () => {
  it('evaluationFiguresTest', () => {
    expect(evaluationFigures(SUMMARY)).toEqual([
      { label: 'Total', minutes: 2550, entries: 12 },
      { label: 'Verrechenbar', minutes: 1800 },
      { label: 'Offen verrechenbar', minutes: 750, entries: 3 },
      { label: 'Im Entwurf', minutes: 450 },
      { label: 'Verrechnet', minutes: 600 },
      { label: 'Nicht verrechenbar', minutes: 750 },
    ])
  })

  it('evaluationFiguresOfNothingTest', () => {
    const nothing: TimeSummary = {
      entries: 0,
      totalMinutes: 0,
      billableMinutes: 0,
      openEntries: 0,
      openMinutes: 0,
      inDraftMinutes: 0,
      billedMinutes: 0,
      notBillableMinutes: 0,
    }

    expect(evaluationFigures(nothing).map((figure) => figure.minutes)).toEqual([0, 0, 0, 0, 0, 0])
  })
})
