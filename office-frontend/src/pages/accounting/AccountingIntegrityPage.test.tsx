// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../../auth/authContext'
import { ACCOUNTING_RIGHTS } from '../../lib/accounting'
import type { AccessLogRow, ChainIntegrity, Page } from '../../lib/types'
import { AccountingIntegrityPage } from './AccountingIntegrityPage'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1

/**
 * @param modules what the tenant runs. The empty list is a case this screen has to survive.
 * @param permissions what the user holds; without the read right nothing is shown at all
 */
function session(modules: string[], permissions: string[] = [ACCOUNTING_RIGHTS.read]): AuthState {
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

/** The everyday answer: the whole chain walked, nothing changed. */
function intact(over: Partial<ChainIntegrity> = {}): ChainIntegrity {
  return {
    checkedAt: '2026-09-07T12:00:00Z',
    checkedBy: 'm.keller',
    postedEntries: 1842,
    firstChainNumber: 1,
    lastChainNumber: 1842,
    intact: true,
    firstBreak: null,
    affectedEntries: 0,
    gaps: [],
    durationMillis: 412,
    ...over,
  }
}

/** The answer nobody wants to see: a stored entry no longer matches its own hash. */
function broken(over: Partial<ChainIntegrity> = {}): ChainIntegrity {
  return intact({
    intact: false,
    firstBreak: {
      chainNumber: 734,
      entryNumber: '2026-000734',
      bookingDate: '2026-05-12',
      fiscalYearLabel: '2026',
      kind: 'CONTENT',
    },
    affectedEntries: 1109,
    ...over,
  })
}

/**
 * One line of the log. Midday UTC on purpose: `formatDateTime` prints the local day, and an
 * evening moment would fall on the next day east of Greenwich.
 */
function line(over: Partial<AccessLogRow> = {}): AccessLogRow {
  return {
    id: 12,
    accessedAt: '2026-09-07T12:00:00Z',
    accessedBy: 'm.keller',
    action: 'ARCHIVE_READ',
    actionLabel: 'Aus dem Archiv geholt',
    report: 'BALANCE_SHEET',
    reportLabel: 'Bilanz',
    fiscalYearLabel: '2025',
    outcome: 'OK',
    outcomeLabel: 'in Ordnung',
    detail: null,
    checkedCount: null,
    durationMillis: null,
    moduleActive: true,
    ...over,
  }
}

/** One `INTEGRITY_CHECK` line — what the screen builds its everyday sentence out of. */
function run(over: Partial<AccessLogRow> = {}): AccessLogRow {
  return line({
    id: 84,
    accessedAt: '2026-09-02T12:12:00Z',
    action: 'INTEGRITY_CHECK',
    actionLabel: 'Integrität geprüft',
    report: null,
    reportLabel: null,
    fiscalYearLabel: null,
    checkedCount: 1842,
    durationMillis: 412,
    ...over,
  })
}

/** The newest run the log holds, and the only one the screen reads. */
const RUNS: AccessLogRow[] = [run()]

function pageOf(rows: AccessLogRow[]): Page<AccessLogRow> {
  return {
    content: rows,
    page: 0,
    size: 50,
    totalElements: rows.length,
    totalPages: rows.length === 0 ? 0 : 1,
    sort: 'accessedAt,desc',
  }
}

let container: HTMLDivElement
let root: Root
let asked: string[]

function json(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

/** What the screen is answered with, and what the address it opens on carries. */
type Scene = {
  /** What a run over the chain finds, once somebody presses the button. */
  report?: ChainIntegrity
  /** The page of the log the list below shows. */
  rows?: AccessLogRow[]
  /** The newest `INTEGRITY_CHECK` line; empty for books nobody has checked here yet. */
  runs?: AccessLogRow[]
  modules?: string[]
  permissions?: string[]
  /** The address the screen opens on, filters and all. */
  address?: string
}

function stubFetch(scene: Required<Pick<Scene, 'report' | 'rows' | 'runs'>>) {
  vi.stubGlobal('fetch', (url: string) => {
    asked.push(url)
    if (url.includes('/accounting/integrity')) return json(scene.report)
    if (url.includes('action=INTEGRITY_CHECK&size=1')) return json(pageOf(scene.runs))
    return json(pageOf(scene.rows))
  })
}

/** Shows what the address carries, so a filter that has to be linkable can be watched. */
function Address() {
  const location = useLocation()
  return <span data-testid="address">{location.search}</span>
}

beforeEach(() => {
  asked = []
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

async function paint(scene: Scene = {}) {
  const {
    report = intact(),
    rows = [line()],
    runs = RUNS,
    modules = ['ACCOUNTING'],
    permissions = [ACCOUNTING_RIGHTS.read],
    address = '',
  } = scene
  stubFetch({ report, rows, runs })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <AuthContext.Provider value={session(modules, permissions)}>
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={[`/buchhaltung/archiv/integritaet${address}`]}>
            <AccountingIntegrityPage />
            <Address />
          </MemoryRouter>
        </QueryClientProvider>
      </AuthContext.Provider>,
    )
  })
  await settle()
}

/** Lets the readings of the log come back before anything is read off the screen. */
async function settle() {
  for (let round = 0; round < 4; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
  }
}

function button(text: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find(
    (entry) => entry.textContent === text,
  ) as HTMLButtonElement | undefined
}

/** Presses one button and waits for whatever it started. */
async function press(text: string) {
  await act(async () => {
    button(text)?.click()
  })
  await settle()
}

function address(): string {
  return container.querySelector('[data-testid="address"]')?.textContent ?? ''
}

function calls(part: string): string[] {
  return asked.filter((url) => url.includes(part))
}

describe('AccountingIntegrityPage', () => {
  /**
   * <b>Opening the screen must not run the chain.</b> Every run appends a line to
   * `accounting_access_log`, and that table has no delete path at all — a database trigger
   * refuses UPDATE and DELETE, because the log is kept ten years (GeBüV Art. 9 Abs. 1 Bst. b
   * Ziff. 4). A screen that checks on mount grows an unerasable table by one row per visit.
   */
  it('integrityRunsNothingOnOpeningTest', async () => {
    await paint()

    expect(calls('/accounting/integrity')).toEqual([])
    expect(calls('/accounting/access-log').length).toBeGreaterThan(0)
    expect(container.textContent).toContain('Alle 1’842 verbuchten Buchungen sind unverändert.')
  })

  /**
   * <b>The normal state is a statement of fact, not a button.</b> It is built out of the newest
   * `INTEGRITY_CHECK` line of the log: that line carries the count, the moment and the user, so
   * the sentence a fiduciary asks the screen for costs no run of its own.
   */
  it('integrityShowsTheIntactSentenceTest', async () => {
    await paint()

    expect(container.textContent).toContain('Alle 1’842 verbuchten Buchungen sind unverändert.')
    // The day is pinned, the minute is not: `formatDateTime` prints it in whichever timezone
    // the tests happen to run in.
    expect(container.textContent).toContain('Zuletzt geprüft am 02.09.2026')
    expect(container.textContent).toContain('durch m.keller.')
    expect(button('Jetzt prüfen')).toBeDefined()
    expect(container.textContent).toContain(
      'Die Prüfung rechnet die Sicherungskette über das Journal nach. Sie ändert nichts und '
      + 'dauerte beim letzten Mal 0.4 Sekunden.',
    )
  })

  /**
   * A single entry reads wrong in the plural, and the figure comes from the same log line the
   * sentence around it does.
   */
  it('integrityWithASingleEntryTest', async () => {
    await paint({ runs: [run({ checkedCount: 1 })] })

    expect(container.textContent).toContain('Die einzige verbuchte Buchung ist unverändert.')
  })

  /**
   * <b>Nothing checked here yet is its own state.</b> The log holds no run, and the screen says
   * so instead of asking the endpoint — which would write the very line it is looking for.
   */
  it('integrityWithoutAnyRunInTheLogTest', async () => {
    await paint({ runs: [] })

    expect(container.textContent).toContain('Noch nicht geprüft')
    expect(container.textContent).toContain(
      'Im Zugriffsprotokoll steht kein Prüflauf über diese Bücher.',
    )
    expect(button('Jetzt prüfen')).toBeDefined()
    expect(calls('/accounting/integrity')).toEqual([])
    expect(container.textContent).not.toContain('Zuletzt geprüft am')
  })

  /**
   * <b>The limit stays on the screen in the good case too.</b> A proof whose reach is only
   * named when it fails is a proof somebody will overstate in the meantime: the chain says the
   * books are unchanged, never when they were written.
   */
  it('integrityNamesWhatTheCheckCannotDoTest', async () => {
    await paint()

    expect(container.textContent).toContain(
      'Was die Prüfung nicht leisten kann: sie belegt, dass die gespeicherten Buchungen '
      + 'unverändert sind — nicht, wann sie gespeichert wurden.',
    )
    expect(container.textContent).toContain(
      'Für den Nachweis des Speicherzeitpunkts braucht es ein Verfahren ausserhalb dieses '
      + 'Programms.',
    )
  })

  /**
   * <b>The wording of the bad case, word for word.</b> It names the entry to pass on and then
   * says what the reader must <em>not</em> do — and it says outright that this is not their
   * mistake, because the first reaction to a red screen is to assume it is.
   */
  it('integrityShowsTheBreakInTheBindingWordingTest', async () => {
    await paint({ report: broken() })
    await press('Jetzt prüfen')

    expect(container.textContent).toContain(
      'Ab Buchung 2026-000734 vom 12.05.2026 stimmt die Sicherung nicht mehr.',
    )
    expect(container.textContent).toContain(
      'Ändern Sie nichts, buchen Sie normal weiter, und melden Sie Journalnummer und Datum '
      + 'Ihrem Treuhänder und Ihrer Systembetreuung. Die Prüfung sagt, dass Daten ausserhalb '
      + 'dieser Anwendung verändert wurden — nicht, dass Sie einen Fehler gemacht haben.',
    )
    expect(container.textContent).toContain(
      'Geprüft: 1’842 Buchungen · betroffen ab Kettennummer 734 (1’109)',
    )
    // The year of the broken entry, which only the run carries — the log line has none.
    expect(container.textContent).toContain('· Geschäftsjahr 2026')
    // The same button, and it reads as the second run it now is.
    expect(button('Erneut prüfen')).toBeDefined()
    expect(button('Jetzt prüfen')).toBeUndefined()
  })

  /**
   * The fiscal year of the break may be gone: `AccountingReports.breakOf` looks the label up and
   * hands over nothing when the row is no longer there. Then the sentence leaves the year out
   * rather than showing a hyphen somebody has to interpret.
   */
  it('integrityWithoutTheFiscalYearOfTheBreakTest', async () => {
    await paint({
      report: broken({
        firstBreak: {
          chainNumber: 734,
          entryNumber: '2026-000734',
          bookingDate: '2026-05-12',
          fiscalYearLabel: null,
          kind: 'CONTENT',
        },
      }),
    })
    await press('Jetzt prüfen')

    expect(container.textContent).toContain(
      'Geprüft: 1’842 Buchungen · betroffen ab Kettennummer 734 (1’109)',
    )
    expect(container.textContent).not.toContain('Geschäftsjahr')
  })

  /**
   * <b>A finding the log kept is shown in the same binding wording.</b> Nobody has to press a
   * button to learn that the last run found something — but the line carries no journal number,
   * so the screen says where that comes from.
   */
  it('integrityShowsAFindingFromTheLogTest', async () => {
    await paint({
      runs: [
        run({
          outcome: 'FINDING',
          outcomeLabel: 'Befund',
          detail: 'Kette gebrochen ab Kettennummer 734.',
        }),
      ],
    })

    expect(container.textContent).toContain('Kette gebrochen ab Kettennummer 734.')
    expect(container.textContent).toContain(
      'Ändern Sie nichts, buchen Sie normal weiter, und melden Sie Journalnummer und Datum '
      + 'Ihrem Treuhänder und Ihrer Systembetreuung. Die Prüfung sagt, dass Daten ausserhalb '
      + 'dieser Anwendung verändert wurden — nicht, dass Sie einen Fehler gemacht haben.',
    )
    expect(container.textContent).toContain('Geprüft: 1’842 Buchungen · Zuletzt geprüft am')
    expect(container.textContent).toContain(
      'Journalnummer und Datum der betroffenen Buchung nennt eine neue Prüfung.',
    )
    expect(button('Erneut prüfen')).toBeDefined()
    expect(calls('/accounting/integrity')).toEqual([])
  })

  /**
   * <b>Two findings, two sentences.</b> A break asks which entry was changed, a gap asks where
   * a number went — rolled into one «die Kette ist ungültig» neither question gets asked.
   */
  it('integrityShowsBreakAndGapAsTwoSentencesTest', async () => {
    await paint({
      report: broken({
        gaps: [{ afterChainNumber: 1201, beforeChainNumber: 1205, missingCount: 3 }],
      }),
    })
    await press('Jetzt prüfen')

    expect(container.textContent).toContain(
      'Ab Buchung 2026-000734 vom 12.05.2026 stimmt die Sicherung nicht mehr.',
    )
    expect(container.textContent).toContain(
      'Zusätzlich: Lücke in der Kettennummer nach 1’201 — 3 Nummern fehlen.',
    )
    expect(container.textContent).not.toContain('ungültig')
  })

  /**
   * A tenant that has never posted. Not a finding and not a green tick over nothing: the screen
   * says what has to happen before there is anything to check.
   */
  it('integrityWithoutAnyPostedEntryTest', async () => {
    await paint({
      report: intact({ postedEntries: 0, firstChainNumber: null, lastChainNumber: null }),
      rows: [],
      runs: [],
    })
    await press('Jetzt prüfen')

    expect(container.textContent).toContain(
      'Es ist noch nichts verbucht. Sobald die erste Buchung im Journal steht, prüft dieser '
      + 'Bildschirm die Sicherungskette darüber.',
    )
    expect(button('Jetzt prüfen')).toBeUndefined()
  })

  /**
   * The last run walked an empty journal. Unlike a run just made, that line says nothing about
   * today — so the button stays, because the first entry may have been posted since.
   */
  it('integrityWhereTheLastRunFoundNothingPostedTest', async () => {
    await paint({ runs: [run({ checkedCount: 0 })] })

    expect(container.textContent).toContain('Es ist noch nichts verbucht.')
    expect(button('Jetzt prüfen')).toBeDefined()
  })

  /**
   * <b>An empty log is honest about why it is empty.</b> The lines start where the function
   * does; a reader must not take the emptiness for «niemand hat je etwas herausgeholt».
   */
  it('integrityWithAnEmptyLogTest', async () => {
    await paint({ rows: [], runs: [] })

    expect(container.textContent).toContain(
      'Das Protokoll beginnt mit der ersten Zeile nach der Einführung dieser Funktion. '
      + 'Frühere Zugriffe sind nicht nachträglich erfasst.',
    )
    // Nothing in the log means no run to name, and then nothing is claimed about one.
    expect(container.textContent).not.toContain('Zuletzt geprüft am')
  })

  /**
   * <b>An empty page under a filter means something else entirely.</b> «Frühere Zugriffe sind
   * nicht nachträglich erfasst» would be a false statement about an audit trail — what actually
   * happened is that the narrowing matched nothing.
   */
  it('accessLogFilteredToNothingTest', async () => {
    await paint({ rows: [], address: '?befunde=true' })

    expect(container.textContent).toContain(
      'Für diese Auswahl steht nichts im Protokoll. Ohne Filter sind alle erfassten Zugriffe zu '
      + 'sehen.',
    )
    expect(container.textContent).not.toContain('Das Protokoll beginnt mit der ersten Zeile')

    await press('Filter zurücksetzen')

    expect(address()).not.toContain('befunde=true')
  })

  /** Every log line brings its own German wording; the screen never translates one itself. */
  it('integrityListsTheAccessLogTest', async () => {
    await paint({
      rows: [
        line(),
        line({
          id: 13,
          action: 'INTEGRITY_CHECK',
          actionLabel: 'Integrität geprüft',
          report: null,
          reportLabel: null,
          fiscalYearLabel: null,
          outcome: 'FINDING',
          outcomeLabel: 'Befund',
          detail: 'Kette gebrochen ab Kettennummer 734.',
          checkedCount: 1842,
          durationMillis: 412,
        }),
      ],
    })

    expect(container.textContent).toContain('Aus dem Archiv geholt')
    expect(container.textContent).toContain('Bilanz')
    expect(container.textContent).toContain('in Ordnung')
    expect(container.textContent).toContain('Integrität geprüft')
    expect(container.textContent).toContain('Befund')
    expect(container.textContent).toContain('Kette gebrochen ab Kettennummer 734.')
    // A chain run belongs to no single year, and the column says so rather than staying blank.
    expect(container.textContent).toContain('—')
    expect(asked.some((url) => url.includes('/accounting/access-log?page=0&size=50'))).toBe(true)
  })

  /**
   * <b>The case this screen shares with the archive above it.</b> The tenant runs no accounting
   * module and the proof still opens — no `ModuleOffNotice`. What is posted stays readable for
   * ten years (OR Art. 958f), and GeBüV Art. 6 Abs. 1 wants a person holding the read right to
   * be able to look within a reasonable time.
   */
  it('integrityStaysReachableWhileTheModuleIsOffTest', async () => {
    await paint({ modules: [] })

    expect(container.textContent).toContain('Alle 1’842 verbuchten Buchungen sind unverändert.')
    expect(container.textContent).toContain('Aus dem Archiv geholt')
    expect(container.textContent).not.toContain('nicht eingeschaltet')
    expect(button('Jetzt prüfen')?.disabled).toBe(false)
  })

  /** Without the read right nothing is shown, and the notice names the right that is missing. */
  it('integrityWithoutTheRightTest', async () => {
    await paint({ permissions: [] })

    expect(container.textContent).toContain('Keine Berechtigung')
    expect(container.textContent).toContain('ACCOUNTING_READ')
    expect(container.textContent).not.toContain('verbuchten Buchungen')
    expect(asked).toEqual([])
  })

  /**
   * <b>«Nur Befunde» has to be linkable.</b> Somebody who finds something wants to send the
   * narrowed list on, so the filter stands in the address and travels with the request.
   */
  it('findingsFilterStandsInTheAddressTest', async () => {
    await paint()

    const box = container.querySelector('input[type="checkbox"]') as HTMLInputElement
    await act(async () => {
      box.click()
    })
    await settle()

    expect(address()).toContain('befunde=true')
    expect(asked.some((url) => url.includes('findingsOnly=true'))).toBe(true)
  })

  /**
   * <b>The button is the only thing that runs the chain, and the run writes a log line.</b> So
   * both readings of the log follow it: without that the protocol below would be missing the
   * very run somebody just made, which is the one line they look for to check that it was
   * recorded.
   */
  it('checkAgainReadsTheLogAgainTest', async () => {
    await paint()
    const before = calls('/accounting/access-log').length

    await press('Jetzt prüfen')

    expect(calls('/accounting/integrity')).toHaveLength(1)
    expect(calls('/accounting/access-log').length).toBeGreaterThan(before)
  })

  /**
   * <b>A run made here beats the log line.</b> Only the run carries the journal number, the day
   * and the year of the break; the line carries a sentence and no more. So after the button the
   * screen shows what the run found, even while the log still answers with the older line.
   */
  it('checkAgainPrefersTheFreshRunTest', async () => {
    await paint({ report: broken() })

    expect(container.textContent).toContain('Alle 1’842 verbuchten Buchungen sind unverändert.')

    await press('Jetzt prüfen')

    expect(container.textContent).toContain(
      'Ab Buchung 2026-000734 vom 12.05.2026 stimmt die Sicherung nicht mehr.',
    )
    expect(container.textContent).not.toContain(
      'Alle 1’842 verbuchten Buchungen sind unverändert.',
    )
  })
})
