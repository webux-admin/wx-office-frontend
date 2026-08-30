import { Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { RegisterNav } from '../components/RegisterNav'
import { useRunsModule } from '../lib/modules'
import { folderFor } from './navigation'

/**
 * Puts the register strip of a folder above the screen it holds.
 *
 * <p>A pathless layout route: it wraps the screens whose menu entry sits in a folder and
 * leaves their addresses untouched. Which strip to draw is decided by the address, not by the
 * route — that is why wrapping `/basisdaten/:liste` is harmless although three of its lists
 * stand outside any folder. They simply get no strip (ADR-0031).
 *
 * <p><b>Above the {@code PageHeader}, not inside it.</b> Every screen keeps its own heading
 * and its own buttons in the top right; the strip only says which siblings it has.
 */
export function RegisterGroupLayout() {
  const { user, can } = useAuth()
  const runs = useRunsModule()
  const { pathname } = useLocation()

  const folder = folderFor(pathname, can, runs, user?.superuser === true)
  if (folder === null) return <Outlet />

  return (
    <>
      <RegisterNav
        registers={folder.children.map((child) => ({
          href: child.href,
          label: child.label,
        }))}
        label={folder.label}
      />
      <Outlet />
    </>
  )
}
