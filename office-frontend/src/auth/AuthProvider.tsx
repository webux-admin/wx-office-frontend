import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, UnauthorizedError } from '../lib/api'
import type { AuthenticatedUser } from '../lib/types'
import { AuthContext, type AuthState } from './authContext'

/**
 * The second of the two answers `POST /api/auth/login` gives.
 *
 * <p>Local to this file: nothing outside needs it, because `signIn` turns it into a
 * `SignInResult` straight away.
 */
type SecondFactorChallenge = {
  secondFactorRequired: true
  method: string
  methods: string[]
  /**
   * Set where the factor is not yet set up but demanded all the same.
   *
   * <p>Optional in the type on purpose: a backend from before this feature answers without the
   * field, and «missing» has to read as «no enrolment», not as `undefined` reaching a branch
   * (backend ADR-0090).
   */
  enrolmentRequired?: boolean
}

/**
 * Holds the session for the whole application.
 *
 * <p>The session itself lives in an HttpOnly cookie owned by the backend. What is kept here
 * is only the answer to "who is this and what may they do", so screens do not have to ask
 * again on every render.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthenticatedUser | null>(null)
  const [loading, setLoading] = useState(true)

  // A reload lands on the same page, so ask the backend whether the cookie still works.
  useEffect(() => {
    const controller = new AbortController()
    api
      .get<AuthenticatedUser>('/api/auth/me', controller.signal)
      .then(setUser)
      .catch((error: unknown) => {
        if (error instanceof UnauthorizedError) setUser(null)
      })
      .finally(() => {
        // An aborted request has not answered the question. StrictMode aborts the first
        // mount's request on purpose; ending the loading state on it declared the user
        // signed out for a moment, and that moment bounced every reloaded deep link off
        // the login route onto the dashboard. The re-mounted effect finishes instead.
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [])

  const signIn = useCallback(async (username: string, password: string) => {
    const answer = await api.post<AuthenticatedUser | SecondFactorChallenge>('/api/auth/login', {
      username,
      password,
    })
    // The endpoint answers 200 twice over: with the user, or with «a second factor is owed».
    // The flag tells them apart, and the second answer carries nothing about the account —
    // there is deliberately no name in it to fall back on (backend ADR-0087).
    if ('secondFactorRequired' in answer) {
      // An account that has yet to set one up has no methods, and there is nothing to fall
      // back on: the list stays empty rather than pretending to an app that does not exist.
      const enrolmentRequired = answer.enrolmentRequired === true
      return {
        kind: 'secondFactor' as const,
        method: answer.method,
        methods:
          answer.methods.length > 0 ? answer.methods : enrolmentRequired ? [] : [answer.method],
        enrolmentRequired,
      }
    }
    setUser(answer)
    return { kind: 'signedIn' as const, user: answer }
  }, [])

  // Its own call rather than a second argument to `signIn`: the two steps are two requests,
  // and the second one carries no password. Only here does the session become a session.
  const completeSecondFactor = useCallback(async (code: string) => {
    const authenticated = await api.post<AuthenticatedUser>('/api/auth/second-factor', { code })
    setUser(authenticated)
    return authenticated
  }, [])

  const sendSecondFactorCode = useCallback(async () => {
    await api.post<void>('/api/auth/second-factor/send')
  }, [])

  // No request of its own: the forced enrolment ends in one that already answered with the
  // user, and the login screen keeps it on the table while the recovery codes are read.
  const adoptSession = useCallback((authenticated: AuthenticatedUser) => {
    setUser(authenticated)
  }, [])

  const signOut = useCallback(async () => {
    try {
      await api.post('/api/auth/logout')
    } finally {
      // Whatever the backend answers, this browser is done with the session.
      setUser(null)
    }
  }, [])

  const switchTenant = useCallback(async (tenantId: number) => {
    setUser(await api.post<AuthenticatedUser>(`/api/auth/tenants/${tenantId}`))
  }, [])

  // Nothing to read back while nobody is signed in — and asking anyway would answer 401 and
  // look like a session that had just ended.
  const refresh = useCallback(async () => {
    if (user === null) return
    setUser(await api.get<AuthenticatedUser>('/api/auth/me'))
  }, [user])

  const can = useCallback(
    (permission: string) => user?.permissions.includes(permission) ?? false,
    [user],
  )

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      signIn,
      completeSecondFactor,
      sendSecondFactorCode,
      adoptSession,
      signOut,
      switchTenant,
      refresh,
      can,
    }),
    [
      user,
      loading,
      signIn,
      completeSecondFactor,
      sendSecondFactorCode,
      adoptSession,
      signOut,
      switchTenant,
      refresh,
      can,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
