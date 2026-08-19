import { createContext } from 'react'
import type { AuthenticatedUser } from '../lib/types'

/** What the rest of the application may do with the session. */
export type AuthState = {
  /** The signed in user, `null` while nobody is. */
  user: AuthenticatedUser | null
  /** True until the first `/api/auth/me` has answered, so no screen flashes the login form. */
  loading: boolean
  /**
   * Signs in and keeps the session.
   *
   * @throws ApiError with status 401 when the credentials are wrong, the account is
   *         deactivated, or it is locked after too many failed attempts
   */
  signIn: (username: string, password: string) => Promise<AuthenticatedUser>
  /** Ends the session. The local state is cleared even when the request fails. */
  signOut: () => Promise<void>
  /** Switches the tenant this session works in and reloads the permissions for it. */
  switchTenant: (tenantId: number) => Promise<void>
  /** Whether the user holds a permission in the active tenant. Convenience, never a guard. */
  can: (permission: string) => boolean
}

/**
 * Carries the session down the tree.
 *
 * <p>Lives in its own module because a file that exports both a context and a component
 * breaks fast refresh.
 */
export const AuthContext = createContext<AuthState | null>(null)
