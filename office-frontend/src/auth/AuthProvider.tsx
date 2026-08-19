import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, UnauthorizedError } from '../lib/api'
import type { AuthenticatedUser } from '../lib/types'
import { AuthContext, type AuthState } from './authContext'

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
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [])

  const signIn = useCallback(async (username: string, password: string) => {
    const authenticated = await api.post<AuthenticatedUser>('/api/auth/login', {
      username,
      password,
    })
    setUser(authenticated)
    return authenticated
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

  const can = useCallback(
    (permission: string) => user?.permissions.includes(permission) ?? false,
    [user],
  )

  const value = useMemo<AuthState>(
    () => ({ user, loading, signIn, signOut, switchTenant, can }),
    [user, loading, signIn, signOut, switchTenant, can],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
