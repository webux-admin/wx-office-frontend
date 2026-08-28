// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState, type SignInResult } from '../auth/authContext'
import { ApiError, UnauthorizedError } from '../lib/api'
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
    signOut: () => Promise.resolve(),
    switchTenant: () => Promise.resolve(),
    refresh: () => Promise.resolve(),
    can: () => false,
  }
}

beforeEach(() => {
  signInResult = { kind: 'secondFactor', method: 'TOTP', methods: ['TOTP'] }
  completeResult = null
  sentCodes = []
  mailRequests = 0
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

    signInResult = { kind: 'secondFactor', method: 'EMAIL', methods: ['EMAIL'] }
    await click(button('Abbrechen und neu anmelden'))
    await signIn()

    expect(button('Code per E-Mail senden')).toBeDefined()
  })

  /**
   * The backend refuses a second code within a minute and answers 204 all the same. Counting
   * here is the only way somebody learns why pressing again does nothing (backend ADR-0089).
   */
  it('loginPageCountsDownBeforeAnotherMailedCodeTest', async () => {
    signInResult = { kind: 'secondFactor', method: 'EMAIL', methods: ['EMAIL'] }
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
    signInResult = { kind: 'secondFactor', method: 'EMAIL', methods: ['EMAIL'] }
    await render()
    await signIn()
    await click(button('Code per E-Mail senden'))

    expect(container.textContent).toContain('hinterlegte E-Mail-Adresse')
    expect(container.textContent).not.toContain('@')
  })
})
