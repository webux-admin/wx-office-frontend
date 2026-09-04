// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../../auth/authContext'
import { ACCOUNTING_RIGHTS } from '../../lib/accounting'
import type { Account } from '../../lib/types'
import { AccountDialog } from './AccountDialog'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TENANT = 1

const AUTH: AuthState = {
  user: {
    userId: 1,
    username: 'muster',
    activeTenantId: TENANT,
    superuser: false,
    tenants: [
      { id: TENANT, code: 'WX', name: 'Webux', isDefault: true, modules: ['ACCOUNTING'] },
    ],
    permissions: [ACCOUNTING_RIGHTS.read, ACCOUNTING_RIGHTS.configure],
  },
  loading: false,
  signIn: () => Promise.reject(new Error('nicht gebraucht')),
  completeSecondFactor: () => Promise.reject(new Error('nicht gebraucht')),
  sendSecondFactorCode: () => Promise.resolve(),
  adoptSession: () => {},
  signOut: () => Promise.resolve(),
  switchTenant: () => Promise.resolve(),
  refresh: () => Promise.resolve(),
  can: (permission: string) => permission !== 'NICHTS',
}

/** The positions, in the order of the law, as the catalogue serves them. */
const POSITIONS = [
  { code: 'UV_FLUESSIGE_MITTEL', name: 'Flüssige Mittel und kurzfristig gehaltene Aktiven' },
  { code: 'UV_VORRAETE', name: 'Vorräte und nicht fakturierte Dienstleistungen' },
  { code: 'AV_SACHANLAGEN', name: 'Sachanlagen' },
  { code: 'KFK_UEBRIGE', name: 'Übrige kurzfristige Verbindlichkeiten' },
  { code: 'EK_GRUNDKAPITAL', name: 'Grund-, Gesellschafter- oder Stiftungskapital' },
  { code: 'ER_NETTOERLOESE', name: 'Nettoerlöse aus Lieferungen und Leistungen' },
  { code: 'ER_UEBRIGER_BETRIEBSAUFWAND', name: 'Übriger betrieblicher Aufwand' },
  { code: 'ER_JAHRESERGEBNIS', name: 'Jahresgewinn oder Jahresverlust' },
  { code: 'ABSCHLUSS', name: 'Abschluss' },
]

const SYSTEM_ACCOUNT: Account = {
  id: 9,
  accountNumber: '9200',
  name: 'Jahresgewinn oder Jahresverlust',
  accountType: 'CLOSING',
  orPosition: 'ABSCHLUSS',
  systemKey: 'JAHRESERGEBNIS_ER',
  directPostingAllowed: false,
  active: true,
}

/** What the backend answers when an account that carries entries is to be deleted. */
const BOOKED_REFUSAL =
  'Auf Konto 6000 Raumaufwand sind 3 Buchungen erfasst. Ein bebuchtes Konto lässt sich '
  + 'abschalten, aber nicht löschen — es gehört mindestens zehn Jahre zur Buchführung '
  + '(OR Art. 958f); für Unterlagen zu Grundstücken gelten nach MWSTG Art. 70 Abs. 3 '
  + 'längere Fristen.'

/**
 * What it answers when a system account is to take an account type its key does not accept.
 * Copied from AccountingManagement.requireTypeFitsSystemKey in wx-office, assembled with
 * SystemAccountKey.JAHRESERGEBNIS_ER.question() and AccountingRules.accountName().
 */
const SYSTEM_KEY_REFUSAL =
  'Konto 9200 Jahresgewinn oder Jahresverlust ist ein Systemkonto: es beantwortet '
  + '«Welches Konto führt Ihren Jahresgewinn in der Erfolgsrechnung?». Dafür wird ein '
  + 'Abschlusskonto gebraucht, ein Aufwandkonto kann dort nicht stehen. Lassen Sie die '
  + 'Frage zuerst über «Systemkonten prüfen» von einem anderen Konto beantworten; danach '
  + 'lässt sich die Kontoart hier ändern.'

const ORDINARY_ACCOUNT: Account = {
  id: 4,
  accountNumber: '6000',
  name: 'Raumaufwand',
  accountType: 'EXPENSE',
  orPosition: 'ER_UEBRIGER_BETRIEBSAUFWAND',
  directPostingAllowed: true,
  active: true,
}

let container: HTMLDivElement
let root: Root
/** Every address the dialog read, so a test can say what was *not* fetched. */
let read: string[]
/** Every write the dialog sent, with the method it used. */
let written: { url: string; method: string }[]
/**
 * What a write answers where a test is about a refusal, null while every write goes through.
 *
 * <p>The shape the backend sends: RFC 9457 with the sentence in `detail`. A test that answered
 * a bare status would prove nothing — that is the case the client has a fallback for.
 */
let refusal: { status: number; detail: string } | null
/** How often the dialog asked to be closed. A refusal must leave it open. */
let closed: number

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

beforeEach(() => {
  read = []
  written = []
  refusal = null
  closed = 0
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (method !== 'GET') {
      written.push({ url, method })
      return refusal === null ? json({}) : json({ detail: refusal.detail }, refusal.status)
    }
    read.push(url)
    if (url.includes('/position-suggestion')) {
      return json({
        accountType: 'EXPENSE',
        orPosition: 'ER_UEBRIGER_BETRIEBSAUFWAND',
        basedOn: '6000',
      })
    }
    if (url.includes('/system-keys')) {
      return json([
        {
          key: 'JAHRESERGEBNIS_ER',
          question: 'Welches Konto führt Ihren Jahresgewinn in der Erfolgsrechnung?',
          hint: 'Abschlusskonto, auf das der Jahresabschluss die Erfolgsrechnung schliesst.',
          allowedTypes: ['CLOSING'],
          account: SYSTEM_ACCOUNT,
        },
      ])
    }
    if (url.includes('/catalogues')) {
      return json({
        'account-type': [
          { code: 'ASSET', name: 'Aktivum' },
          { code: 'EXPENSE', name: 'Aufwand' },
          { code: 'CLOSING', name: 'Abschluss' },
        ],
        'or-position': POSITIONS,
      })
    }
    return json({})
  })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

async function settle() {
  for (let round = 0; round < 6; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

/** Waits out the pause the number field holds a proposal back for. */
async function settleDebounced() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 260))
  })
  await settle()
}

async function render(account: Account | null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <MemoryRouter>
        <AuthContext.Provider value={AUTH}>
          <QueryClientProvider client={client}>
            <AccountDialog
              tenantId={TENANT}
              account={account}
              onClose={() => {
                closed += 1
              }}
            />
          </QueryClientProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
  })
  await settle()
}

/** The two dropdowns of the form, in the order they stand in: account type, then position. */
function selects(): HTMLSelectElement[] {
  return [...container.querySelectorAll('select')]
}

function optionCodes(select: HTMLSelectElement): string[] {
  return [...select.options].map((option) => option.value).filter((value) => value !== '')
}

function button(text: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find((entry) =>
    entry.textContent?.includes(text),
  ) as HTMLButtonElement | undefined
}

function checkbox(label: string): HTMLInputElement | undefined {
  const caption = [...container.querySelectorAll('label')].find((entry) =>
    entry.textContent?.includes(label),
  )
  if (!caption) return undefined
  return (document.getElementById(caption.htmlFor) as HTMLInputElement | null) ?? undefined
}

/** Types into a field the way a person would, so React sees the change. */
async function type(input: HTMLInputElement | HTMLSelectElement, value: string) {
  await act(async () => {
    const prototype =
      input instanceof HTMLSelectElement
        ? window.HTMLSelectElement.prototype
        : window.HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(input, value)
    input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? 'change' : 'input', {
      bubbles: true,
    }))
  })
  await settle()
}

describe('AccountDialog', () => {
  /**
   * The proposal, on the hardest compulsory field of this stage. Marked as a proposal and
   * freely overwritable — it stores nothing that was not confirmed.
   */
  it('showsTheProposalWhenAddingTest', async () => {
    await render(null)

    const number = container.querySelector('input') as HTMLInputElement
    await type(number, '6001')
    await settleDebounced()

    expect(container.textContent).toContain('Vorschlag aus der Kontonummer')
    expect(container.textContent).toContain('bitte prüfen')
    expect(selects()[0].value).toBe('EXPENSE')
    expect(selects()[1].value).toBe('ER_UEBRIGER_BETRIEBSAUFWAND')
  })

  /**
   * Never when changing. A proposal that overwrites an existing filing is no proposal — and
   * the request is not even sent.
   */
  it('showsNoProposalWhenChangingTest', async () => {
    await render(ORDINARY_ACCOUNT)
    await settleDebounced()

    expect(container.textContent).not.toContain('Vorschlag aus der Kontonummer')
    expect(read.some((url) => url.includes('/position-suggestion'))).toBe(false)
    expect(selects()[1].value).toBe('ER_UEBRIGER_BETRIEBSAUFWAND')
  })

  /**
   * The dropdown offers what the account type allows and **never a computed position**. That
   * is a convenience for the type — the database refuses the pair anyway — and the friendly
   * half of a rule for `ER_JAHRESERGEBNIS`, which the database lets through and
   * `AccountingManagement.saveAccount` refuses.
   */
  it('filtersThePositionsByAccountTypeTest', async () => {
    await render(null)

    await type(selects()[0], 'ASSET')
    expect(optionCodes(selects()[1])).toEqual([
      'UV_FLUESSIGE_MITTEL',
      'UV_VORRAETE',
      'AV_SACHANLAGEN',
    ])

    await type(selects()[0], 'EXPENSE')
    expect(optionCodes(selects()[1])).toEqual([
      'ER_NETTOERLOESE',
      'ER_UEBRIGER_BETRIEBSAUFWAND',
    ])
    expect(optionCodes(selects()[1])).not.toContain('ER_JAHRESERGEBNIS')
  })

  /**
   * Changing the account type empties a position that no longer fits, rather than leaving a
   * combination standing that the database would refuse on saving.
   */
  it('clearsThePositionWhenTheTypeNoLongerFitsTest', async () => {
    await render(null)

    await type(selects()[0], 'EXPENSE')
    await type(selects()[1], 'ER_NETTOERLOESE')
    expect(selects()[1].value).toBe('ER_NETTOERLOESE')

    await type(selects()[0], 'ASSET')

    expect(selects()[1].value).toBe('')
  })

  /**
   * A system account can be renamed and renumbered, and neither switched off nor deleted. The
   * key itself appears nowhere; the sentence comes from the endpoint.
   */
  it('locksASystemAccountTest', async () => {
    await render(SYSTEM_ACCOUNT)

    const active = checkbox('aktiv')
    expect(active?.disabled).toBe(true)
    expect(active?.checked).toBe(true)
    expect(button('Löschen')).toBeUndefined()
    expect(container.textContent).toContain(
      'weder abschalten noch löschen',
    )
    expect(container.textContent).toContain('Abschlusskonto, auf das der Jahresabschluss')
    expect(container.textContent).not.toContain('JAHRESERGEBNIS_ER')
  })

  /** An ordinary account keeps its way out, and it takes two clicks. */
  it('asksBeforeDeletingTest', async () => {
    await render(ORDINARY_ACCOUNT)

    expect(button('Löschen')).toBeDefined()
    await act(async () => {
      button('Löschen')?.click()
    })
    await settle()

    expect(button('Wirklich löschen')).toBeDefined()
  })

  /**
   * The refusal the backend words is what the reader gets — the number of entries included —
   * and not the client's own «Der Datensatz wurde zwischenzeitlich geändert». That fallback
   * exists for a bare status, and a 409 that carries a sentence must never fall into it.
   *
   * <p>And the box stays open: a sentence on a box that has just shut is a sentence nobody
   * reads.
   */
  it('showsTheRefusalWhenDeletingTest', async () => {
    refusal = { status: 409, detail: BOOKED_REFUSAL }
    await render(ORDINARY_ACCOUNT)

    await act(async () => {
      button('Löschen')?.click()
    })
    await settle()
    await act(async () => {
      button('Wirklich löschen')?.click()
    })
    await settle()

    expect(written.some((call) => call.method === 'DELETE')).toBe(true)
    expect(container.textContent).toContain(BOOKED_REFUSAL)
    expect(container.textContent).not.toContain('Der Datensatz wurde zwischenzeitlich geändert')
    expect(closed).toBe(0)
  })

  /**
   * The same for the save, which answers 400 rather than 409 — moving 9200 out of «Abschluss»
   * takes an account type its system key does not accept. A 400 is no more generic than a 409
   * here, and «Die Eingabe wurde nicht akzeptiert» says nothing about which field is meant.
   */
  it('showsTheRefusalWhenSavingTest', async () => {
    refusal = { status: 400, detail: SYSTEM_KEY_REFUSAL }
    await render(SYSTEM_ACCOUNT)

    await type(selects()[0], 'EXPENSE')
    await type(selects()[1], 'ER_UEBRIGER_BETRIEBSAUFWAND')
    await act(async () => {
      button('Speichern')?.click()
    })
    await settle()

    expect(written.some((call) => call.method === 'PUT')).toBe(true)
    expect(container.textContent).toContain(SYSTEM_KEY_REFUSAL)
    expect(container.textContent).not.toContain('Die Eingabe wurde nicht akzeptiert.')
    expect(closed).toBe(0)
  })
})
