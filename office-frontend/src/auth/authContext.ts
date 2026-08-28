import { createContext } from 'react'
import type { AuthenticatedUser } from '../lib/types'

/**
 * What a sign-in ended in.
 *
 * <p><b>Three outcomes, not two.</b> The third — «the password was right and a second factor
 * is still owed» — is neither success nor failure. Squeezing it into either would leave the
 * login screen unable to tell «wrong» from «not finished», which is exactly the distinction
 * the backend answers 200 rather than 401 to make (backend ADR-0087).
 */
export type SignInResult =
  | { kind: 'signedIn'; user: AuthenticatedUser }
  | {
      kind: 'secondFactor'
      /** The preferred method, `TOTP` where the user has an app. */
      method: string
      /** Every method this user could use, preferred one first. Empty before the first one. */
      methods: string[]
      /**
       * The installation demands a second factor and this account has none yet.
       *
       * <p>The next step is then not a code field but the setting up, and it happens inside
       * the login: the account has no session to reach its profile with (backend ADR-0090).
       */
      enrolmentRequired: boolean
    }

/** What the rest of the application may do with the session. */
export type AuthState = {
  /** The signed in user, `null` while nobody is. */
  user: AuthenticatedUser | null
  /** True until the first `/api/auth/me` has answered, so no screen flashes the login form. */
  loading: boolean
  /**
   * Signs in, or reports that a second factor is still owed.
   *
   * <p><b>Between the two steps the session does not count as signed in.</b> `user` stays
   * `null` until {@link completeSecondFactor} succeeds — anything else would let a screen
   * behind the login draw itself on a half finished session.
   *
   * @throws ApiError with status 401 when the credentials are wrong, the account is
   *         deactivated, or it is locked after too many failed attempts
   */
  signIn: (username: string, password: string) => Promise<SignInResult>
  /**
   * Finishes a login with a code out of the app, out of a mail, or off the paper list.
   *
   * @throws ApiError with status 401 when the code is wrong, the attempt ran out of tries,
   *         or the pending state expired
   */
  completeSecondFactor: (code: string) => Promise<AuthenticatedUser>
  /**
   * Asks for a code by mail.
   *
   * <p>Answers the same way whatever happened — sent, refused as too soon, or impossible for
   * want of a mail server. The backend says nothing, on purpose (backend ADR-0089), so the
   * mask counts the seconds itself rather than reporting an outcome it does not have.
   */
  sendSecondFactorCode: () => Promise<void>
  /**
   * Takes a session the backend has already opened.
   *
   * <p>For the one login that does not end in a request this provider makes: the forced
   * enrolment. There the last request answers with the user <b>and</b> the ten recovery codes,
   * and the codes have to be read before the application draws itself over them — this is the
   * moment after «I have written them down» (backend ADR-0090).
   *
   * <p>Opens nothing by itself. The cookie is set either way; this only tells the rest of the
   * application whose session it is.
   */
  adoptSession: (user: AuthenticatedUser) => void
  /** Ends the session. The local state is cleared even when the request fails. */
  signOut: () => Promise<void>
  /** Switches the tenant this session works in and reloads the permissions for it. */
  switchTenant: (tenantId: number) => Promise<void>
  /**
   * Reads the session again without changing anything about it.
   *
   * <p>What the module screen calls after switching a module: sidebar and overview read the
   * module list off the session, and without this they keep showing the old state until
   * somebody reloads the page. Invalidating a query does not help — the session is no query.
   * `switchTenant` was weighed as a shortcut and dropped: it names something other than what
   * it does, and it fails for a superuser who has not chosen a tenant (ADR-0018).
   */
  refresh: () => Promise<void>
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
