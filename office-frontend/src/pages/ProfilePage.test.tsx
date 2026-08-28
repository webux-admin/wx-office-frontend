// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthState } from '../auth/authContext'
import { PROFILE_PATH } from '../lib/twoFactor'
import type { SecondFactorState } from '../lib/types'
import { ProfilePage } from './ProfilePage'

// React refuses to run act() without this flag; jsdom has no bundler that would set it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const USER = 7

const SESSION: AuthState = {
  user: {
    userId: USER,
    username: 'anna',
    activeTenantId: 1,
    superuser: false,
    tenants: [],
    permissions: ['INVOICE_READ'],
  },
  loading: false,
  signIn: () => Promise.reject(new Error('nicht gebraucht')),
  completeSecondFactor: () => Promise.reject(new Error('nicht gebraucht')),
  sendSecondFactorCode: () => Promise.resolve(),
  adoptSession: () => {},
  signOut: () => Promise.resolve(),
  switchTenant: () => Promise.resolve(),
  refresh: () => Promise.resolve(),
  can: (permission: string) => permission === 'INVOICE_READ',
}

let container: HTMLDivElement
let root: Root
/** What the state endpoint answers. */
let state: SecondFactorState
/** What starting the mail method answers: 204, or the refusal without a mail server. */
let mailStart: { status: number; body: unknown }
/** What confirming answers. */
let confirmResult: { status: number; body: unknown }
/** Whether the installation demands a second factor of every account. */
let dutyStands: boolean
/** Every write the mask sent. */
let written: { url: string; body: Record<string, unknown> }[]

const QR = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 25"></svg>'

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(body === null ? '' : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

function stubFetch() {
  written = []
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (method === 'GET') {
      if (url.endsWith('/api/login-policy')) return json({ twoFactorRequired: dutyStands })
      return json(state)
    }
    written.push({
      url,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : {},
    })
    if (url.endsWith('/two-factor/totp')) {
      return json({ secret: 'JBSWY3DPEHPK3PXP', otpAuthUri: 'otpauth://totp/x', qrSvg: QR })
    }
    if (url.endsWith('/two-factor/email')) return json(mailStart.body, mailStart.status)
    if (url.includes('/confirm')) return json(confirmResult.body, confirmResult.status)
    if (url.endsWith('/recovery-codes')) {
      return json({ codes: Array.from({ length: 10 }, (_, index) => `NEUCODE${index}0`) })
    }
    return json(null, 204)
  })
}

beforeEach(() => {
  state = { enrolled: false, remainingRecoveryCodes: 0 }
  dutyStands = false
  mailStart = { status: 204, body: null }
  confirmResult = {
    status: 200,
    body: { codes: Array.from({ length: 10 }, (_, index) => `CODE${index}23456`) },
  }
  stubFetch()
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

async function render(path = PROFILE_PATH) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <AuthContext.Provider value={SESSION}>
          <QueryClientProvider client={client}>
            <ProfilePage />
          </QueryClientProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    )
  })
  await settle()
}

function tab(label: string): HTMLElement | undefined {
  return [...container.querySelectorAll('[role="tab"]')].find(
    (entry) => entry.textContent === label,
  ) as HTMLElement | undefined
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

/** Opens the second-factor register. */
async function openTwoFactor() {
  await click(tab('Zwei-Faktor'))
}

describe('ProfilePage', () => {
  // --- the registers -------------------------------------------------------

  it('profilePageShowsThreeRegistersTest', async () => {
    await render()

    expect([...container.querySelectorAll('[role="tab"]')].map((one) => one.textContent))
      .toEqual(['Passwort', 'Zwei-Faktor', 'Rechte'])
  })

  /**
   * The test that proves the registers hid nothing. Both panels this page carried before are
   * still reachable, with the same fields and the same content.
   */
  it('profilePageKeepsTheTwoOlderPanelsTest', async () => {
    await render()

    expect(field('Bisheriges Passwort')).toBeDefined()
    expect(field('Neues Passwort')).toBeDefined()
    expect(field('Neues Passwort wiederholen')).toBeDefined()

    await click(tab('Rechte'))

    expect(container.textContent).toContain('Rechte im aktiven Mandanten')
    expect(container.textContent).toContain('INVOICE_READ')
  })

  /**
   * In the address, unlike every other register in this application: this one is meant to be
   * linked to (ADR-0022).
   */
  it('profilePageOpensTheRegisterFromTheAddressTest', async () => {
    await render(`${PROFILE_PATH}?register=zwei-faktor`)

    expect(container.textContent).toContain('Zwei-Faktor-Anmeldung')
    expect(field('Bisheriges Passwort')).toBeUndefined()
  })

  it('profilePageFallsBackForAnUnknownRegisterTest', async () => {
    await render(`${PROFILE_PATH}?register=quatsch`)

    expect(field('Bisheriges Passwort')).toBeDefined()
  })

  // --- setting up with an app ----------------------------------------------

  it('profilePageShowsTheQrCodeTest', async () => {
    await render()
    await openTwoFactor()

    await click(button('Einrichten'))

    expect(container.querySelector('svg[viewBox="0 0 25 25"]')).not.toBeNull()
    expect(container.textContent).toContain('JBSWY3DPEHPK3PXP')
  })

  /** Named, not linked: a link to an app store goes stale and reads like a recommendation. */
  it('profilePageNamesAppsWithoutLinkingThemTest', async () => {
    await render()
    await openTwoFactor()

    expect(container.textContent).toContain('Google Authenticator')
    expect(container.textContent).toContain('Microsoft Authenticator')
    expect(container.querySelectorAll('a')).toHaveLength(0)
  })

  it('profilePageShowsAWrongCodeTest', async () => {
    confirmResult = { status: 400, body: { detail: 'Der Code stimmt nicht' } }
    await render()
    await openTwoFactor()
    await click(button('Einrichten'))

    await type('Code', '000000')
    await click(button('Bestätigen'))

    expect(container.textContent).toContain('Der Code stimmt nicht')
  })

  // --- the recovery codes --------------------------------------------------

  /**
   * The most dangerous moment of the whole feature: the codes exist for one screen. The way on
   * is behind a tick box, not behind a close button.
   */
  it('profilePageHoldsTheRecoveryCodesUntilTheyAreKeptTest', async () => {
    await render()
    await openTwoFactor()
    await click(button('Einrichten'))
    await type('Code', '123456')

    await click(button('Bestätigen'))

    expect(container.textContent).toContain('CODE023456')
    expect(container.textContent).toContain('nur jetzt')
    expect(button('Weiter')?.disabled).toBe(true)

    await click(field('Ich habe die Codes gesichert'))

    expect(button('Weiter')?.disabled).toBe(false)
  })

  it('profilePageOffersDownloadAndPrintForTheCodesTest', async () => {
    await render()
    await openTwoFactor()
    await click(button('Einrichten'))
    await type('Code', '123456')
    await click(button('Bestätigen'))

    expect(button('Herunterladen')).toBeDefined()
    expect(button('Drucken')).toBeDefined()
  })

  /** They are gone for good afterwards — only a fresh set is possible, and that voids them. */
  it('profilePageDoesNotShowTheCodesAgainTest', async () => {
    state = { enrolled: true, method: 'TOTP', remainingRecoveryCodes: 10 }
    await render()

    await openTwoFactor()

    expect(container.textContent).not.toContain('CODE023456')
    expect(container.textContent).toContain('Noch 10 von zehn')
    expect(container.textContent).toContain('Die alten Codes werden dabei ungültig')
  })

  it('profilePageWarnsWhenTheCodesRunOutTest', async () => {
    state = { enrolled: true, method: 'TOTP', remainingRecoveryCodes: 1 }
    await render()

    await openTwoFactor()

    expect(container.textContent).toContain('solange Sie hineinkommen')
  })

  // --- the mail method -----------------------------------------------------

  it('profilePageSaysTheMailMethodIsWeakerTest', async () => {
    await render()
    await openTwoFactor()

    expect(container.textContent).toContain('der schwächere Schutz')
  })

  /**
   * Without a system mail server the backend refuses with a sentence naming the missing
   * property. Shown as it is: a silent gap would leave somebody pressing a button that does
   * nothing (backend ADR-0089).
   */
  it('profilePageSaysWhyTheMailMethodIsUnavailableTest', async () => {
    mailStart = {
      status: 400,
      body: {
        detail:
          'Diese Installation kann keine Anmeldecodes per E-Mail verschicken. Es ist kein '
          + 'Systemversand eingerichtet (spring.mail.host)',
      },
    }
    await render()
    await openTwoFactor()

    await click(button('Code senden und einrichten'))

    expect(container.textContent).toContain('spring.mail.host')
    expect(container.textContent).not.toContain('Sechs Ziffern aus der E-Mail')
  })

  // --- switching it off ----------------------------------------------------

  it('profilePageAsksForThePasswordBeforeSwitchingOffTest', async () => {
    state = { enrolled: true, method: 'TOTP', remainingRecoveryCodes: 10 }
    await render()
    await openTwoFactor()

    await click(button('Zwei-Faktor abschalten'))

    expect(container.textContent).toContain('nur noch durch das Passwort geschützt')
    expect(button('Abschalten')?.disabled).toBe(true)

    await type('Passwort', 'ein-langes-passwort')

    expect(button('Abschalten')?.disabled).toBe(false)
    await click(button('Abschalten'))

    const sent = written.find((entry) => entry.url.endsWith('/two-factor/remove'))
    expect(sent?.body.password).toBe('ein-langes-passwort')
  })

  it('profilePageOffersNothingToSwitchOffWithoutAFactorTest', async () => {
    await render()
    await openTwoFactor()

    expect(button('Zwei-Faktor abschalten')).toBeUndefined()
    expect(button('Neue Codes erzeugen')).toBeUndefined()
  })

  /**
   * No button at all rather than a disabled one: the backend answers 409, and a greyed-out
   * button invites the click that finds that out (backend ADR-0090).
   */
  it('profilePageOffersNoSwitchingOffWhileItIsCompulsoryTest', async () => {
    state = { enrolled: true, method: 'TOTP', remainingRecoveryCodes: 10 }
    dutyStands = true
    await render()
    await openTwoFactor()

    expect(button('Zwei-Faktor abschalten')).toBeUndefined()
    expect(container.textContent).toContain('verlangt von jedem Konto')
    expect(container.textContent).toContain('USER_TWO_FACTOR_RESET')
    // Drawing new recovery codes stays open — that is not weakening anything.
    expect(button('Neue Codes erzeugen')).toBeDefined()
  })

  /**
   * Reachable while somebody was signed in as the duty was switched on: their session runs on,
   * and the mask says what the next login will ask for rather than letting it surprise them.
   */
  it('profilePageAnnouncesTheComingDutyTest', async () => {
    dutyStands = true
    await render()
    await openTwoFactor()

    expect(container.textContent).toContain('spätestens bei der nächsten')
    // And the way to do it now is still there.
    expect(button('Einrichten')).toBeDefined()
  })
})
