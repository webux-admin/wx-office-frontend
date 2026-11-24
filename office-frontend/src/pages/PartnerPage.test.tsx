// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import type { Partner } from '../lib/types'
import { PartnerPage } from './PartnerPage'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1
const ALL_RIGHTS = ['PARTNER_READ', 'PARTNER_WRITE', 'PARTNER_DEACTIVATE']

const STORED: Partner = {
  id: 7,
  partnerNumber: 'K-00007',
  partnerType: 'ORGANISATION',
  name: 'Bäckerei Huber AG',
  legalForm: 'AG',
  language: 'de',
  phone: '044 123 45 67',
  isCustomer: true,
  isSupplier: false,
  active: true,
  addresses: [
    {
      id: 1,
      name: 'Bäckerei Huber AG',
      street: 'Bahnhofstrasse',
      buildingNumber: '12',
      postalCode: '8001',
      town: 'Zürich',
      country: 'CH',
      useAsDefault: true,
      usages: [],
    },
  ],
  contacts: [{ id: 3, firstName: 'Eva', lastName: 'Huber', isPrimary: true }],
}

function session(permissions: string[], modules: string[] = []): AuthState {
  return {
    user: {
      userId: 1,
      username: 'muster',
      activeTenantId: TENANT,
      superuser: false,
      tenants: [{ id: TENANT, code: 'WX', name: 'Webux', isDefault: true, modules }],
      permissions,
    },
    loading: false,
    signIn: () => Promise.reject(new Error('nicht gebraucht')),
    completeSecondFactor: () => Promise.reject(new Error('nicht gebraucht')),
    sendSecondFactorCode: () => Promise.resolve(),
    adoptSession: () => {},
    signOut: () => Promise.resolve(),
    switchTenant: () => Promise.resolve(),
    refresh: () => Promise.resolve(),
    can: (permission: string) => permissions.includes(permission),
  }
}

let container: HTMLDivElement
let root: Root
/** Every write the mask sent: address, method and body per request. */
let written: { url: string; method: string; body: Record<string, unknown> }[]
/** What the next write answers, when it is not the plain success. */
let refusal: { status: number; body: unknown } | null

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

function stubFetch(stored: Partner) {
  written = []
  refusal = null
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (method !== 'GET') {
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {}
      written.push({ url, method, body })
      if (refusal) return json(refusal.body, refusal.status)
      return json({ ...stored, ...body }, method === 'POST' ? 201 : 200)
    }
    if (url.endsWith('/catalogues')) {
      return json({
        'partner-type': [
          { code: 'ORGANISATION', name: 'Firma' },
          { code: 'PERSON', name: 'Privatperson' },
        ],
        'address-usage': [],
      })
    }
    if (url.includes('/legal-forms')) return json([{ id: 1, code: 'AG', name: 'AG' }])
    if (url.includes('/languages')) {
      return json([{ id: 1, code: 'de', name: 'Deutsch', isDefault: true }])
    }
    if (url.includes('/currencies')) {
      return json([{ id: 1, code: 'CHF', name: 'Schweizer Franken', isDefault: true }])
    }
    if (url.includes('/payment-terms')) {
      return json([{ id: 1, code: 'NET30', name: '30 Tage netto', netDays: 30, isDefault: true }])
    }
    if (url.includes('/countries')) {
      return json([{ id: 1, code: 'CH', name: 'Schweiz', isDefault: true }])
    }
    if (url.endsWith(`/partners/${stored.id}`)) return json(stored)
    if (url.endsWith(`/time-tracking/customers/${stored.id}/summary`)) {
      return json({
        entries: 2,
        totalMinutes: 150,
        openEntries: 1,
        openMinutes: 90,
        inDraftMinutes: 0,
        billedMinutes: 0,
        notBillableMinutes: 60,
      })
    }
    if (url.startsWith('/api/tenants/1/time-entries?')) {
      return json({ content: [], page: 0, size: 50, totalElements: 0, totalPages: 0, sort: '' })
    }
    return json([])
  })
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

async function settle(ms = 50) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms))
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function render(
  path: string,
  stored: Partner = STORED,
  permissions = ALL_RIGHTS,
  modules: string[] = [],
) {
  stubFetch(stored)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <AuthContext.Provider value={session(permissions, modules)}>
          <QueryClientProvider client={client}>
            <Routes>
              <Route path="/kunden/:id" element={<PartnerPage role="customer" />} />
              <Route path="/lieferanten/:id" element={<PartnerPage role="supplier" />} />
              <Route path="/kunden" element={<p>Kundenliste</p>} />
            </Routes>
          </QueryClientProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
  })
  await settle()
}

/** The control a label points at. */
function field(label: string): HTMLInputElement | HTMLSelectElement | undefined {
  const found = [...container.querySelectorAll('label')].find(
    (entry) => entry.textContent === label,
  )
  const id = found?.getAttribute('for')
  return id ? (document.getElementById(id) as HTMLInputElement | HTMLSelectElement) : undefined
}

async function type(label: string, value: string) {
  const input = field(label) as HTMLInputElement
  const prototype = Object.getPrototypeOf(input) as object
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

/** Whether a field sits in the left column, where the record itself is typed. */
function inMainPanel(label: string): boolean {
  return field(label)?.closest('section')?.querySelector('h2')?.textContent === 'Stammdaten'
}

function button(label: string): HTMLButtonElement {
  const found = [...document.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === label,
  )
  if (!found) throw new Error(`Kein Knopf mit der Aufschrift "${label}"`)
  return found
}

async function click(label: string) {
  await act(async () => button(label).click())
  await settle()
}

/** The message drawn under a field. */
function messageAt(label: string): string | undefined {
  const control = field(label)
  const ids = control?.getAttribute('aria-describedby')?.split(' ') ?? []
  return ids.map((id) => document.getElementById(id)?.textContent ?? '').join(' ') || undefined
}

describe('PartnerPage', () => {
  it('partnerPageCreatesACustomerWithItsAddressTest', async () => {
    await render('/kunden/neu')

    await type('Firmenname', 'Muster AG')
    await type('Rechtsform', 'AG')
    await type('Strasse', 'Bahnhofstrasse')
    await type('PLZ', '8001')
    await type('Ort', 'Zürich')
    await click('Speichern')

    expect(written).toHaveLength(1)
    const sent = written[0].body
    expect(sent.name).toBe('Muster AG')
    // Not asked on the mask, filled in from the tenant's default.
    expect(sent.language).toBe('de')
    expect(sent.addresses).toEqual([
      expect.objectContaining({
        name: 'Muster AG',
        postalCode: '8001',
        town: 'Zürich',
        country: 'CH',
        useAsDefault: true,
      }),
    ])
    // Saving closes the mask and goes back to the list (ADR-0003).
    expect(container.textContent).toContain('Kundenliste')
  })

  /** One page: what one types on the left, the defaults beside it, no registers. */
  it('partnerPageShowsEverythingOnOnePageTest', async () => {
    await render('/kunden/neu')

    expect(container.querySelector('[role="tablist"]')).toBeNull()
    expect(inMainPanel('Firmenname')).toBe(true)
    expect(inMainPanel('Rechtsform')).toBe(true)
    expect(inMainPanel('UID')).toBe(true)
    expect(inMainPanel('Sprache')).toBe(false)
    expect(button('Kontaktperson hinzufügen')).toBeDefined()
  })

  /** The defaults are filled in and shown, not added out of sight on save. */
  it('partnerPageFillsInTheTenantDefaultsTest', async () => {
    await render('/kunden/neu')

    expect(field('Sprache')?.value).toBe('de')
    expect(field('Währung')?.value).toBe('CHF')
    const term = field('Zahlungskondition') as HTMLSelectElement
    expect(term.value).toBe('')
    expect(term.selectedOptions[0]?.textContent).toBe('Vorgabe des Mandanten: 30 Tage netto')

    await type('Firmenname', 'Muster AG')
    await type('Rechtsform', 'AG')
    await type('PLZ', '8001')
    await type('Ort', 'Zürich')
    await click('Speichern')

    expect(written[0].body).toEqual(expect.objectContaining({ language: 'de', currency: 'CHF' }))
  })

  it('partnerPageShowsARefusedUidOnTheCreateMaskTest', async () => {
    await render('/kunden/neu')
    refusal = {
      status: 400,
      body: {
        detail: 'Keine gültige Schweizer UID: CHE-1',
        errors: [{ field: 'uid', message: 'Keine gültige Schweizer UID: CHE-1' }],
      },
    }
    await type('Firmenname', 'Muster AG')
    await type('Rechtsform', 'AG')
    await type('PLZ', '8001')
    await type('Ort', 'Zürich')
    await type('UID', 'CHE-1')

    await click('Speichern')

    expect(messageAt('UID')).toContain('Keine gültige Schweizer UID')
    expect(container.textContent).not.toContain('Kundenliste')
  })

  it('partnerPageNamesWhatIsMissingAtTheFieldTest', async () => {
    await render('/kunden/neu')

    await click('Speichern')

    expect(written).toHaveLength(0)
    expect(field('Firmenname')?.getAttribute('aria-invalid')).toBe('true')
    expect(messageAt('Firmenname')).toMatch(/Namen/)
    expect(document.activeElement).toBe(field('Firmenname'))
  })

  /** Without postcode and town a customer cannot be written to, so the address is required. */
  it('partnerPageRequiresPostcodeAndTownTest', async () => {
    await render('/kunden/neu')
    await type('Firmenname', 'Muster AG')
    await type('Rechtsform', 'AG')

    await click('Speichern')

    expect(written).toHaveLength(0)
    expect(field('PLZ')?.getAttribute('aria-required')).toBe('true')
    expect(messageAt('Ort')).toMatch(/Ort/)
    expect(messageAt('PLZ')).toMatch(/Postleitzahl/)
    expect(document.activeElement).toBe(field('PLZ'))
  })

  it('partnerPageCreatesACustomerWithItsContactsTest', async () => {
    await render('/kunden/neu')
    await type('Firmenname', 'Muster AG')
    await type('Rechtsform', 'AG')
    await type('PLZ', '8001')
    await type('Ort', 'Zürich')

    await click('Kontaktperson hinzufügen')
    await type('Vorname', 'Eva')
    await type('Nachname', 'Huber')
    await click('Hinzufügen')
    await click('Kontaktperson hinzufügen')
    await type('Nachname', 'Meier')
    await click('Hinzufügen')

    expect(written).toHaveLength(0)
    expect(container.textContent).toContain('Eva Huber')
    await click('Speichern')

    expect(written).toHaveLength(1)
    expect(written[0].body.contacts).toEqual([
      expect.objectContaining({ firstName: 'Eva', lastName: 'Huber', isPrimary: true }),
      expect.objectContaining({ lastName: 'Meier', isPrimary: false }),
    ])
  })

  it('partnerPageShowsABackendRefusalAtTheFieldTest', async () => {
    await render('/kunden/7')
    refusal = {
      status: 400,
      body: {
        detail: 'Keine gültige Schweizer UID: CHE-1',
        errors: [{ field: 'uid', message: 'Keine gültige Schweizer UID: CHE-1' }],
      },
    }

    await type('UID', 'CHE-1')
    await click('Speichern')

    expect(messageAt('UID')).toContain('Keine gültige Schweizer UID')
    expect(container.textContent).not.toContain('Kundenliste')
  })

  it('partnerPageSummarisesTheRecordTest', async () => {
    await render('/kunden/7')

    expect(container.textContent).toContain('Bahnhofstrasse 12, 8001 Zürich')
    expect(container.textContent).toContain('Eva Huber')
    expect(container.textContent).toContain('044 123 45 67')
  })

  /** A supplier gets no sales history and no sales document types, only its record. */
  it('partnerPageHidesTheSalesRegistersForASupplierTest', async () => {
    const supplier: Partner = { ...STORED, isCustomer: false, isSupplier: true }
    await render('/lieferanten/7', supplier, [...ALL_RIGHTS, 'DOCUMENT_TYPE_READ'])

    const tabLabels = [...container.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent)
    expect(tabLabels).not.toContain('Verlauf')

    await click('Einstellungen')
    expect(container.textContent).not.toContain('Dokumente')
  })

  /** A customer keeps the history and the sales document types. */
  it('partnerPageShowsTheSalesRegistersForACustomerTest', async () => {
    await render('/kunden/7', STORED, [...ALL_RIGHTS, 'DOCUMENT_TYPE_READ'])

    const tabLabels = [...container.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent)
    expect(tabLabels).toContain('Verlauf')

    await click('Einstellungen')
    expect(container.textContent).toContain('Dokumente')
  })

  /** A typo in the name or the wrong kind is corrected on the stored record. */
  it('partnerPageRenamesAStoredCustomerTest', async () => {
    await render('/kunden/7')

    expect(field('Firmenname')?.disabled).toBe(false)
    await type('Firmenname', 'Bäckerei Huber GmbH')
    await click('Speichern')

    expect(written).toEqual([
      expect.objectContaining({
        method: 'PUT',
        body: expect.objectContaining({ name: 'Bäckerei Huber GmbH', partnerType: 'ORGANISATION' }),
      }),
    ])
  })

  it('partnerPageTurnsAStoredCompanyIntoAPersonTest', async () => {
    await render('/kunden/7')

    const kind = [...container.querySelectorAll('label')].find(
      (label) => label.textContent === 'Privatperson',
    )
    await act(async () => kind?.click())
    await type('Nachname', 'Huber')
    await click('Speichern')

    expect(written[0].body).toEqual(
      expect.objectContaining({ partnerType: 'PERSON', lastName: 'Huber' }),
    )
    // A person has no legal form, so none is sent.
    expect(written[0].body).not.toHaveProperty('legalForm')
  })

  it('partnerPageShowsTheDefaultAddressOnTheBaseDataTest', async () => {
    await render('/kunden/7')

    const panel = [...container.querySelectorAll('section')].find(
      (section) => section.querySelector('h2')?.textContent === 'Standardadresse',
    )
    expect(panel?.textContent).toContain('Bahnhofstrasse 12')
    expect(panel?.textContent).toContain('8001 Zürich')
    expect(panel?.querySelector('button[aria-label="Standardadresse bearbeiten"]')).not.toBeNull()
  })

  it('partnerPageReactivatesADeactivatedCustomerTest', async () => {
    await render('/kunden/7', { ...STORED, active: false })

    await click('Reaktivieren')
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    await act(async () => {
      ;[...dialog.querySelectorAll('button')]
        .find((candidate) => candidate.textContent?.trim() === 'Reaktivieren')
        ?.click()
    })
    await settle()

    expect(written).toEqual([
      expect.objectContaining({ method: 'PUT', url: expect.stringMatching(/\/partners\/7\/reactivate$/) }),
    ])
  })

  it('partnerPageOffersDeactivationForAnActiveCustomerTest', async () => {
    await render('/kunden/7')

    expect(button('Deaktivieren')).toBeDefined()
    expect(() => button('Reaktivieren')).toThrow()
  })

  it('partnerPageWithoutWriteRightTest', async () => {
    await render('/kunden/7', STORED, ['PARTNER_READ'])

    expect(() => button('Speichern')).toThrow()
    expect(() => button('Deaktivieren')).toThrow()
    expect(field('UID')?.disabled).toBe(true)
  })

  /** A customer gets «Zeiten» right after «Projekte», with the module and TIME_READ. */
  it('partnerPageShowsTheTimesOfACustomerTest', async () => {
    await render(
      '/kunden/7',
      STORED,
      [...ALL_RIGHTS, 'PROJECT_READ', 'TIME_READ'],
      ['PROJECT', 'TIMETRACKING'],
    )

    const labels = tabLabels()
    expect(labels.indexOf('Zeiten')).toBe(labels.indexOf('Projekte') + 1)
    await click('Zeiten')
    expect(container.textContent).toContain('Offen verrechenbar')
  })

  /** Without projects, time is recorded on the customer: the register stays. */
  it('partnerPageShowsTheTimesWithoutProjectsTest', async () => {
    await render('/kunden/7', STORED, [...ALL_RIGHTS, 'TIME_READ'], ['TIMETRACKING'])

    expect(tabLabels()).toContain('Zeiten')
    expect(tabLabels()).not.toContain('Projekte')
  })

  /** Without TIME_READ the times of everybody are not the session's to see. */
  it('partnerPageHidesTheTimesWithoutTheReadRightTest', async () => {
    await render('/kunden/7', STORED, [...ALL_RIGHTS, 'TIME_TRACK'], ['TIMETRACKING'])

    expect(tabLabels()).not.toContain('Zeiten')
  })

  it('partnerPageHidesTheTimesWithTheModuleOffTest', async () => {
    await render('/kunden/7', STORED, [...ALL_RIGHTS, 'TIME_READ'], [])

    expect(tabLabels()).not.toContain('Zeiten')
  })

  /** A supplier is no customer of ours: no time is recorded for it. */
  it('partnerPageHidesTheTimesForASupplierTest', async () => {
    const supplier: Partner = { ...STORED, isCustomer: false, isSupplier: true }
    await render('/lieferanten/7', supplier, [...ALL_RIGHTS, 'TIME_READ'], ['TIMETRACKING'])

    expect(tabLabels()).not.toContain('Zeiten')
  })
})

function tabLabels(): string[] {
  return [...container.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent ?? '')
}
