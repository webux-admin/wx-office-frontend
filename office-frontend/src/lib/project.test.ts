import { describe, expect, it } from 'vitest'
import {
  PROJECT_NAME_MAX_LENGTH,
  PROJECT_RIGHTS,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_TONES,
  PROJECT_STEP_LABELS,
  emptyProjectForm,
  isProjectDeletable,
  isProjectEditable,
  isProjectStatus,
  partnerProjectsUrl,
  projectComplaint,
  projectContactsUrl,
  projectCustomerUrl,
  projectCustomersUrl,
  projectPeriod,
  projectResponsiblesUrl,
  projectStepUrl,
  projectStepsFrom,
  projectUrl,
  projectsKey,
  projectsUrl,
  toProjectForm,
  toProjectRequest,
  type ProjectForm,
} from './project'
import type { Project } from './types'

/** Writes a date the way the test can recognise it, without depending on the locale. */
const asIs = (value: string) => `[${value}]`

function filled(overrides: Partial<ProjectForm> = {}): ProjectForm {
  return {
    name: 'Umbau Showroom',
    partnerId: '11',
    contactPersonId: '21',
    responsibleUserId: '31',
    startDate: '2026-03-02',
    endDate: '2026-06-30',
    description: 'Ladenbau Etappe 1',
    ...overrides,
  }
}

function stored(overrides: Partial<Project> = {}): Project {
  return {
    id: 5,
    projectNumber: 'P-00005',
    name: 'Umbau Showroom',
    partnerId: 11,
    customerName: 'Bäckerei Huber AG',
    contactPersonId: 21,
    contactPersonName: 'Eva Huber',
    responsibleUserId: 31,
    responsibleName: 'Anna Meier',
    startDate: '2026-03-02',
    endDate: '2026-06-30',
    description: 'Ladenbau Etappe 1',
    status: 'OPEN',
    ...overrides,
  }
}

describe('addresses', () => {
  it('projectsUrlTest', () => {
    expect(projectsUrl(4)).toBe('/api/tenants/4/projects')
    expect(projectUrl(4, 5)).toBe('/api/tenants/4/projects/5')
  })

  it('projectCustomersUrlTest', () => {
    expect(projectCustomersUrl(4, 'huber')).toBe('/api/tenants/4/projects/customers?search=huber')
  })

  it('projectCustomersUrlWithoutSearchTest', () => {
    expect(projectCustomersUrl(4, '')).toBe('/api/tenants/4/projects/customers')
    expect(projectCustomersUrl(4, '   ')).toBe('/api/tenants/4/projects/customers')
  })

  it('projectCustomersUrlEscapesTheSearchTest', () => {
    expect(projectCustomersUrl(4, 'A&B 50%')).toBe(
      '/api/tenants/4/projects/customers?search=A%26B+50%25',
    )
  })

  it('projectContactsUrlTest', () => {
    expect(projectCustomerUrl(4, 11)).toBe('/api/tenants/4/projects/customers/11')
    expect(projectContactsUrl(4, 11)).toBe('/api/tenants/4/projects/customers/11/contacts')
    expect(projectResponsiblesUrl(4)).toBe('/api/tenants/4/projects/responsibles')
  })

  it('projectsKeyTest', () => {
    expect(projectsKey(4)).toEqual(['projects', 4])
  })
})

describe('constants', () => {
  it('projectRightsTest', () => {
    expect(PROJECT_RIGHTS).toEqual({ read: 'PROJECT_READ', write: 'PROJECT_WRITE' })
  })

  it('projectStatusLabelsTest', () => {
    expect(Object.values(PROJECT_STATUS_LABELS)).toEqual([
      'Offen',
      'Aktiv',
      'Abgeschlossen',
      'Archiviert',
    ])
  })
})

describe('isProjectStatus', () => {
  it('isProjectStatusTest', () => {
    expect(isProjectStatus('ACTIVE')).toBe(true)
    expect(isProjectStatus('ARCHIVED')).toBe(true)
  })

  it('isProjectStatusWithEmptyValueTest', () => {
    expect(isProjectStatus('')).toBe(false)
  })

  it('isProjectStatusWithUnknownValueTest', () => {
    expect(isProjectStatus('active')).toBe(false)
    expect(isProjectStatus('toString')).toBe(false)
  })
})

describe('projectPeriod', () => {
  it('projectPeriodTest', () => {
    expect(projectPeriod('2026-03-02', '2026-06-30', asIs)).toBe('[2026-03-02] – [2026-06-30]')
  })

  it('projectPeriodOfOneDayTest', () => {
    expect(projectPeriod('2026-03-02', '2026-03-02', asIs)).toBe('[2026-03-02]')
  })

  it('projectPeriodOpenEndedTest', () => {
    expect(projectPeriod('2026-03-02', null, asIs)).toBe('ab [2026-03-02]')
    expect(projectPeriod(undefined, '2026-06-30', asIs)).toBe('bis [2026-06-30]')
  })

  it('projectPeriodWithoutDatesTest', () => {
    expect(projectPeriod(null, undefined, asIs)).toBe('-')
    expect(projectPeriod('', '', asIs)).toBe('-')
  })
})

describe('the form', () => {
  it('emptyProjectFormTest', () => {
    expect(Object.values(emptyProjectForm()).every((value) => value === '')).toBe(true)
  })

  it('toProjectFormTest', () => {
    expect(toProjectForm(stored())).toEqual(filled())
  })

  it('toProjectFormWithoutOptionalValuesTest', () => {
    const form = toProjectForm(
      stored({
        contactPersonId: null,
        contactPersonName: null,
        responsibleUserId: null,
        startDate: null,
        endDate: null,
        description: null,
      }),
    )

    expect(form).toEqual(filled({
      contactPersonId: '',
      responsibleUserId: '',
      startDate: '',
      endDate: '',
      description: '',
    }))
  })

  it('toProjectFormDropsAContactThatIsGoneTest', () => {
    // The id is still on the project, but the customer no longer has that person.
    expect(toProjectForm(stored({ contactPersonName: null })).contactPersonId).toBe('')
  })

  it('toProjectRequestTest', () => {
    expect(toProjectRequest(filled({ name: '  Umbau Showroom ' }))).toEqual({
      name: 'Umbau Showroom',
      partnerId: 11,
      contactPersonId: 21,
      responsibleUserId: 31,
      startDate: '2026-03-02',
      endDate: '2026-06-30',
      description: 'Ladenbau Etappe 1',
    })
  })

  it('toProjectRequestWithEmptyFieldsTest', () => {
    expect(
      toProjectRequest(filled({
        contactPersonId: '',
        responsibleUserId: '',
        startDate: '',
        endDate: '',
        description: '   ',
      })),
    ).toEqual({
      name: 'Umbau Showroom',
      partnerId: 11,
      contactPersonId: null,
      responsibleUserId: null,
      startDate: null,
      endDate: null,
      description: null,
    })
  })
})

describe('projectComplaint', () => {
  it('projectComplaintTest', () => {
    expect(projectComplaint(filled())).toBeNull()
  })

  it('projectComplaintWithOnlyNameAndCustomerTest', () => {
    expect(projectComplaint({ ...emptyProjectForm(), name: 'Wartung', partnerId: '11' })).toBeNull()
  })

  it('projectComplaintOnOneDayTest', () => {
    expect(projectComplaint(filled({ endDate: '2026-03-02' }))).toBeNull()
  })

  it('projectComplaintWithLongestNameTest', () => {
    expect(projectComplaint(filled({ name: 'x'.repeat(PROJECT_NAME_MAX_LENGTH) }))).toBeNull()
  })

  it('projectComplaintWithoutNameTest', () => {
    expect(projectComplaint(filled({ name: '   ' }))).toBe('Ein Projekt braucht einen Namen.')
  })

  it('projectComplaintWithTooLongNameTest', () => {
    expect(projectComplaint(filled({ name: 'x'.repeat(PROJECT_NAME_MAX_LENGTH + 1) }))).toContain(
      'höchstens 120 Zeichen',
    )
  })

  it('projectComplaintWithoutCustomerTest', () => {
    expect(projectComplaint(filled({ partnerId: '' }))).toBe('Ein Projekt braucht einen Kunden.')
  })

  it('projectComplaintWithEndBeforeStartTest', () => {
    expect(projectComplaint(filled({ endDate: '2026-03-01' }))).toBe(
      'Das Enddatum liegt vor dem Startdatum.',
    )
  })

  it('projectComplaintWithTooLongDescriptionTest', () => {
    expect(projectComplaint(filled({ description: 'x'.repeat(4001) }))).toContain(
      'höchstens 4000 Zeichen',
    )
  })
})

describe('status steps', () => {
  it('projectStepsFromTest', () => {
    expect(projectStepsFrom('OPEN')).toEqual(['start'])
    expect(projectStepsFrom('ACTIVE')).toEqual(['complete'])
    expect(projectStepsFrom('COMPLETED')).toEqual(['archive', 'reopen'])
    expect(projectStepsFrom('ARCHIVED')).toEqual(['restore'])
  })

  it('projectStepsFromNeverLeadBackToOpenTest', () => {
    // No status offers a step back to open: start is only offered from open itself.
    const offered = (['OPEN', 'ACTIVE', 'COMPLETED', 'ARCHIVED'] as const).flatMap((status) =>
      projectStepsFrom(status),
    )
    expect(offered.filter((step) => step === 'start')).toHaveLength(1)
    expect(new Set(offered)).toEqual(new Set(Object.keys(PROJECT_STEP_LABELS)))
  })

  it('projectStepUrlTest', () => {
    expect(projectStepUrl(3, 17, 'archive')).toBe('/api/tenants/3/projects/17/archive')
  })

  it('isProjectEditableTest', () => {
    expect(isProjectEditable('OPEN')).toBe(true)
    expect(isProjectEditable('ACTIVE')).toBe(true)
    expect(isProjectEditable('COMPLETED')).toBe(true)
    expect(isProjectEditable('ARCHIVED')).toBe(false)
  })

  it('isProjectDeletableTest', () => {
    expect(isProjectDeletable('OPEN')).toBe(true)
    expect(isProjectDeletable('ACTIVE')).toBe(false)
    expect(isProjectDeletable('COMPLETED')).toBe(false)
    expect(isProjectDeletable('ARCHIVED')).toBe(false)
  })

  it('projectStatusTonesTest', () => {
    expect(PROJECT_STATUS_TONES.ACTIVE).toBe('accent')
    expect(PROJECT_STATUS_TONES.ARCHIVED).toBe('muted')
  })
})

describe('partnerProjectsUrl', () => {
  it('partnerProjectsUrlTest', () => {
    expect(partnerProjectsUrl(3, 11, 0, 'projectNumber,desc')).toBe(
      '/api/tenants/3/projects?partnerId=11&includeArchived=true&page=0&size=10&sort=projectNumber%2Cdesc',
    )
  })

  it('partnerProjectsUrlOnALaterPageTest', () => {
    expect(partnerProjectsUrl(3, 11, 2, 'name,asc')).toContain('page=2')
  })
})
