import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from './useAuth'
import { Spinner } from '../components/Spinner'

/**
 * Keeps a route for signed in users.
 *
 * <p>This is convenience, not protection: every endpoint checks the session itself. It
 * exists so a reload does not show an empty screen full of failed requests.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <Spinner label="Sitzung wird geprüft" />
      </div>
    )
  }

  if (!user) return <Navigate to="/anmelden" replace />

  return <>{children}</>
}
