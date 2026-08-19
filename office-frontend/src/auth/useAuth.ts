import { useContext } from 'react'
import { AuthContext, type AuthState } from './authContext'

/**
 * Access to the current session.
 *
 * @returns who is signed in, and the operations that change that
 * @throws Error when used outside AuthProvider, which is a wiring mistake
 */
export function useAuth(): AuthState {
  const state = useContext(AuthContext)
  if (!state) throw new Error('useAuth must be used inside AuthProvider')
  return state
}
