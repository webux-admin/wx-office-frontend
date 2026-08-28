// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState, type SignInResult } from '../auth/authContext'
import { ApiError, UnauthorizedError } from '../lib/api'
import type { AuthenticatedUser } from '../lib/types'
import { LoginPage } from './LoginPage'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

/** What `signIn` answers; every test sets what it is about. */
let signInResult: SignInResult | Error
/** What `completeSecondFactor` answers. */
let completeResult: Error | null
/** Every code the second step sent. */
let sentCodes: string[]
/** How often a code by mail was asked for. */
let mailRequests: number
/** The session the forced enrolment handed over, `null` while none was. */
let adopted: AuthenticatedUser | null

/** How often the secret was asked for. */
let enrolmentRequests: number

/** What the first step answers where the installation demands a factor nobody set up yet. */
const ENROLMENT_OWED: SignInResult = {
  kind: 'secondFactor',
  method: 'TOTP',
  methods: [],
  enrolmentRequired: true,
}

/** A QR image the way the backend sends it: finished SVG, not a data source. */
const QR = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2"></svg>'

/**
 * Answers the two enrolment endpoints.
 *
 * <p>Straight through `fetch`, because this step talks to the backend itself rather than
 * through the session: there is no session yet to hang the calls on.
 *
 * @param confirmFailure what the confirming request should fail with, if anything
 */
function stubEnrolment(confirmFailure?: ApiError) {
  enrolmentRequests = 0
  vi.stubGlobal('fetch', (url: string) => {
    if (url.endsWith('/second-factor/enrol')) {
      enrolmentRequests += 1
      return Promise.resolve(
        new Response(
          JSON.stringify({ secret: 'JBSWY3DPEHPK3PXP', otpAuthUri: 'otpauth://totp/x', qrSvg: QR }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
    }
    if (confirmFailure) {
      return Promise.resolve(
        new Response(JSON.stringify({ detail: confirmFailure.message }), {
          status: confirmFailure.status,
          headers: { 'Content-Type': 'application/problem+json' },
        }),
      )
    }
    return Promise.resolve(
      new Response(
        JSON.stringify({
          user: {
            userId: 1,
            username: 'anna',
            activeTenantId: 1,
            superuser: false,
            tenants: [],
            permissions: [],
          },
          recoveryCodes: Array.from({ length: 10 }, (_, index) => `CODE${index}23456`),
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
  })
}

function checkbox(): HTMLInputElement | undefined {
  return container.querySelector('input[type="checkbox"]') as HTMLInputElement | null ?? undefined
}

function session(): AuthState {
  return {
    user: null,
    loading: false,
    signIn: () =>
      signInResult instanceof Error
        ? Promise.reject(signInResult)
        : Promise.resolve(signInResult),
    completeSecondFactor: (code: string) => {
      sentCodes.push(code)
      if (completeResult !== null) return Promise.reject(completeResult)
      return Promise.resolve({
        userId: 1,
        username: 'anna',
        activeTenantId: 1,
        superuser: false,
        tenants: [],
        permissions: [],
      })
    },
    sendSecondFactorCode: () => {
      mailRequests += 1
      return Promise.resolve()
    },
    adoptSession: (authenticated) => {
      adopted = authenticated
    },
    signOut: () => Promise.resolve(),
    switchTenant: () => Promise.resolve(),
    refresh: () => Promise.resolve(),
    can: () => false,
  }
}

beforeEach(() => {
  signInResult = { kind: 'secondFactor', method: 'TOTP', methods: ['TOTP'], enrolmentRequired: false }
  completeResult = null
  sentCodes = []
  mailRequests = 0
  adopted = null
  enrolmentRequests = 0
  vi.useFakeTimers({ shouldAdvanceTime: true })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function settle() {
  for (let round = 0; round < 5; round += 1) {
    await act(async () => {
      await Promise.resolve()
    })
  }
}

async function render() {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/anmelden']}>
        <AuthContext.Provider value={session()}>
          <LoginPage />
        </AuthContext.Provider>
      </MemoryRouter>,
    )
  })
  await settle()
}

function field(label: string): HTMLInputElement | undefined {
  const caption = [...container.querySelectorAll('label')].find(
    (entry) => entry.textContent === label,
  )
  if (!caption) return undefined
  return (document.getElementById(caption.htmlFor) as HTMLInputElement | null) ?? undefined
}

function button(text: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find((entry) =>
    entry.textContent?.includes(text),
  ) as HTMLButtonElement | undefined
}

async function click(element: HTMLElement | undefined) {
  expect(element).toBeDefined()
  await act(async () => {
    element?.click()
  })
  await settle()
}

/** Types into a field the way a person would, so React sees the change. */
async function type(label: string, value: string) {
  const input = field(label)
  expect(input).toBeDefined()
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )?.set
    setter?.call(input, value)
    input?.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await settle()
}

/** Fills in the password form and submits it. */
async function signIn() {
  await type('Benutzername', 'anna')
  await type('Passwort', 'ein-langes-passwort')
  await click(button('Anmelden'))
}

describe('LoginPage', () => {
  /** Without a second factor the screen is the one it always was. */
  it('loginPageStaysOneStepWithoutASecondFactorTest', async () => {
    signInResult = {
      kind: 'signedIn',
      user: {
        userId: 1,
        username: 'anna',
        activeTenantId: 1,
        superuser: false,
        tenants: [],
        permissions: [],
      },
    }
    await render()

    await signIn()

    expect(container.textContent).not.toContain('Bestätigen')
  })

  it('loginPageShowsTheSecondStepTest', async () => {
    await render()

    await signIn()

    expect(container.textContent).toContain('Bestätigen')
    expect(container.textContent).toContain('Authenticator-App')
    expect(field('Code')).toBeDefined()
    expect(field('Passwort')).toBeUndefined()
  })

  /**
   * Whoever has just typed a six digit number off a telephone does not want to look for a
   * button afterwards.
   */
  it('loginPageSendsSixDigitsByItselfTest', async () => {
    await render()
    await signIn()

    await type('Code', '123456')

    expect(sentCodes).toEqual(['123456'])
  })

  /** The guard against a request per keystroke past the sixth. */
  it('loginPageSendsTheSameCodeOnlyOnceTest', async () => {
    await render()
    await signIn()

    await type('Code', '123456')
    await type('Code', '1234567')

    expect(sentCodes).toEqual(['123456'])
  })

  it('loginPageIgnoresNonDigitsInTheCodeTest', async () => {
    await render()
    await signIn()

    await type('Code', '12ab34')

    expect(field('Code')?.value).toBe('1234')
    expect(sentCodes).toEqual([])
  })

  /**
   * Not a hidden way out. This is the one somebody needs at seven in the morning with a new
   * telephone in their hand.
   */
  it('loginPageOffersTheRecoveryCodeTest', async () => {
    await render()
    await signIn()

    await click(button('Ich habe keinen Zugriff auf meine App'))

    expect(field('Wiederherstellungscode')).toBeDefined()
    expect(container.textContent).toContain('Jeder Code gilt einmal')

    await type('Wiederherstellungscode', 'abcd2345ef')

    expect(sentCodes).toEqual(['ABCD2345EF'])
  })

  it('loginPageOffersAMailedCodeOnlyForThatMethodTest', async () => {
    await render()
    await signIn()
    expect(button('Code per E-Mail senden')).toBeUndefined()

    signInResult = { kind: 'secondFactor', method: 'EMAIL', methods: ['EMAIL'], enrolmentRequired: false }
    await click(button('Abbrechen und neu anmelden'))
    await signIn()

    expect(button('Code per E-Mail senden')).toBeDefined()
  })

  /**
   * The backend refuses a second code within a minute and answers 204 all the same. Counting
   * here is the only way somebody learns why pressing again does nothing (backend ADR-0089).
   */
  it('loginPageCountsDownBeforeAnotherMailedCodeTest', async () => {
    signInResult = { kind: 'secondFactor', method: 'EMAIL', methods: ['EMAIL'], enrolmentRequired: false }
    await render()
    await signIn()

    await click(button('Code per E-Mail senden'))

    expect(mailRequests).toBe(1)
    expect(container.textContent).toContain('Sekunden möglich')
    expect(button('Neuen Code senden')?.disabled).toBe(true)

    await act(async () => {
      vi.advanceTimersByTime(3000)
    })
    await settle()

    // Counting down rather than standing still: the exact number depends on how the fake
    // clock and the real one interleave, the direction does not.
    const left = /in (\d+) Sekunden/.exec(container.textContent ?? '')
    expect(Number(left?.[1] ?? 99)).toBeLessThan(60)
  })

  it('loginPageShowsAWrongCodeTest', async () => {
    completeResult = new UnauthorizedError()
    await render()
    await signIn()

    await type('Code', '000000')

    expect(container.textContent).toContain('Der Code stimmt nicht')
    expect(field('Code')?.value).toBe('')
  })

  /** Three lagen, three sentences: two of them say «start over», and they say so. */
  it('loginPageShowsWhyTheAttemptEndedTest', async () => {
    completeResult = new ApiError(401, 'Der Vorgang ist abgelaufen')
    await render()
    await signIn()

    await type('Code', '000000')

    // A 401 is the one answer the backend gives for every ending of an attempt, so the mask
    // says what to do rather than pretending to know which of the three it was.
    expect(container.textContent).toContain('Nach fünf Versuchen')
  })

  it('loginPageShowsABackendFailureTest', async () => {
    completeResult = new ApiError(500, 'Das Backend meldet einen Fehler.')
    await render()
    await signIn()

    await type('Code', '000000')

    expect(container.textContent).toContain('Das Backend meldet einen Fehler.')
  })

  /** Back to the password, not into a half session. */
  it('loginPageCancelsBackToThePasswordTest', async () => {
    await render()
    await signIn()

    await click(button('Abbrechen und neu anmelden'))

    expect(field('Benutzername')).toBeDefined()
    expect(field('Passwort')?.value).toBe('')
    expect(container.textContent).not.toContain('Bestätigen')
  })

  /**
   * Nothing about the account may appear on an open login screen — not even a shortened mail
   * address. The backend deliberately sends none (backend ADR-0087), and the mask does not
   * invent one.
   */
  it('loginPageNamesNoAddressTest', async () => {
    signInResult = { kind: 'secondFactor', method: 'EMAIL', methods: ['EMAIL'], enrolmentRequired: false }
    await render()
    await signIn()
    await click(button('Code per E-Mail senden'))

    expect(container.textContent).toContain('hinterlegte E-Mail-Adresse')
    expect(container.textContent).not.toContain('@')
  })

  // --- the forced enrolment (backend ADR-0090) -----------------------------

  /**
   * The state this whole feature turns on: the installation demands a factor, the account has
   * none, and the way out is <b>here</b> rather than behind a login the account cannot reach.
   */
  it('loginPageSetsUpTheFactorWhenItIsCompulsoryTest', async () => {
    signInResult = ENROLMENT_OWED
    stubEnrolment()
    await render()

    await signIn()

    expect(container.textContent).toContain('Zwei-Faktor einrichten')
    expect(container.textContent).toContain('JBSWY3DPEHPK3PXP')
    expect(field('Code aus der App')).toBeDefined()
    // Not the ordinary second step: there is no factor to prove yet.
    expect(container.textContent).not.toContain('Ich habe keinen Zugriff auf meine App')
  })

  /**
   * The codes come before the application does. They are readable once, and a session taken
   * straight away would draw the dashboard over them.
   */
  it('loginPageShowsTheRecoveryCodesBeforeSigningInTest', async () => {
    signInResult = ENROLMENT_OWED
    stubEnrolment()
    await render()
    await signIn()

    await type('Code aus der App', '123456')

    expect(container.textContent).toContain('Wiederherstellungscodes')
    expect(container.textContent).toContain('CODE023456')
    expect(adopted).toBeNull()
  })

  it('loginPageSignsInOnlyAfterTheCodesAreKeptTest', async () => {
    signInResult = ENROLMENT_OWED
    stubEnrolment()
    await render()
    await signIn()
    await type('Code aus der App', '123456')

    expect(button('Weiter zur Anwendung')?.disabled).toBe(true)

    await click(checkbox())
    await click(button('Weiter zur Anwendung'))

    expect(adopted?.username).toBe('anna')
  })

  /** A wrong code leaves the step where it is, with the field cleared for another try. */
  it('loginPageKeepsTheEnrolmentOpenAfterAWrongCodeTest', async () => {
    signInResult = ENROLMENT_OWED
    stubEnrolment(new ApiError(400, 'Der Code stimmt nicht.'))
    await render()
    await signIn()

    await type('Code aus der App', '000000')

    expect(container.textContent).toContain('Der Code stimmt nicht.')
    expect(field('Code aus der App')?.value).toBe('')
    expect(adopted).toBeNull()
  })

  /** The secret is fetched once. A second one would not match the app just scanned. */
  it('loginPageAsksForOneSecretOnlyTest', async () => {
    signInResult = ENROLMENT_OWED
    stubEnrolment()
    await render()
    await signIn()

    await type('Code aus der App', '12')

    expect(enrolmentRequests).toBe(1)
  })
})
