import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink, Outlet, Link } from 'react-router-dom'
import {
  Building2,
  Check,
  ChevronsUpDown,
  ClipboardList,
  FileType2,
  HandCoins,
  Hash,
  LayoutGrid,
  ListChecks,
  Lock,
  LogOut,
  Moon,
  Package,
  PanelLeftClose,
  Percent,
  PanelLeftOpen,
  ShieldCheck,
  Sun,
  Tags,
  Truck,
  UserCog,
  Users,
} from 'lucide-react'
import { BrandMark } from '../components/BrandMark'
import { useAuth } from '../auth/useAuth'
import { initialsOf } from '../lib/format'
import { useSidebarCollapsed } from './useSidebarCollapsed'
import { useTheme } from './useTheme'

/** Width of the sidebar with labels, and as a rail. */
const WIDE = 256
const RAIL = 64

/** One navigation entry. `permission` decides whether it is shown at all. */
type NavEntry = {
  label: string
  icon: typeof Users
  href: string
  /** Left out for entries everyone may open, such as the overview. */
  permission?: string
}

/**
 * The navigation, and with it the map of the application.
 *
 * <p>Only what the backend answers is listed. A module without a controller would be an entry
 * leading to an empty screen, which reads as a defect rather than as a promise.
 */
const NAV_GROUPS: { title: string; entries: NavEntry[] }[] = [
  {
    title: 'Übersicht',
    entries: [{ label: 'Dashboard', icon: LayoutGrid, href: '/' }],
  },
  {
    title: 'Verkauf',
    entries: [
      { label: 'Aufträge', icon: ClipboardList, href: '/auftraege', permission: 'ORDER_READ' },
    ],
  },
  {
    title: 'Stammdaten',
    entries: [
      { label: 'Kunden', icon: Users, href: '/kunden', permission: 'PARTNER_READ' },
      { label: 'Lieferanten', icon: Truck, href: '/lieferanten', permission: 'PARTNER_READ' },
      { label: 'Produkte', icon: Package, href: '/produkte', permission: 'PRODUCT_READ' },
      { label: 'Preisgruppen', icon: Tags, href: '/preisgruppen', permission: 'PRODUCT_READ' },
    ],
  },
  {
    title: 'Einstellungen',
    entries: [
      {
        label: 'Belegarten',
        icon: FileType2,
        href: '/belegarten',
        permission: 'DOCUMENT_TYPE_READ',
      },
      {
        label: 'Auswahllisten',
        icon: ListChecks,
        href: '/auswahllisten',
        permission: 'MASTERDATA_READ',
      },
      { label: 'Feste Werte', icon: Lock, href: '/feste-werte', permission: 'MASTERDATA_READ' },
      {
        label: 'Zahlungskonditionen',
        icon: HandCoins,
        href: '/zahlungskonditionen',
        permission: 'MASTERDATA_READ',
      },
      { label: 'Mehrwertsteuer', icon: Percent, href: '/mehrwertsteuer', permission: 'PRODUCT_READ' },
      {
        label: 'Nummernkreise',
        icon: Hash,
        href: '/nummernkreise',
        permission: 'NUMBER_RANGE_READ',
      },
      { label: 'Mandanten', icon: Building2, href: '/mandanten', permission: 'TENANT_READ' },
      { label: 'Benutzer', icon: UserCog, href: '/benutzer', permission: 'USER_READ' },
      { label: 'Rollen', icon: ShieldCheck, href: '/rollen', permission: 'USER_READ' },
    ],
  },
]

/** Timing shared by everything that folds, so the sidebar moves as one piece. */
const FOLD = { duration: 0.26, ease: [0.16, 1, 0.3, 1] } as const

/**
 * Frame around every signed in screen: sidebar, tenant switcher, account menu.
 *
 * <p>Navigation entries are filtered by permission. That only tidies the sidebar. The
 * backend refuses the request either way.
 */
export function AppShell() {
  const { collapsed, locked, toggle } = useSidebarCollapsed()

  return (
    <div className="flex min-h-screen bg-canvas">
      <Sidebar collapsed={collapsed} locked={locked} onToggle={toggle} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Outlet />
      </div>
    </div>
  )
}

function Sidebar({
  collapsed,
  locked,
  onToggle,
}: {
  collapsed: boolean
  locked: boolean
  onToggle: () => void
}) {
  const { user, signOut, can } = useAuth()

  // Groups the user may see at all. Computed up front so the rail knows which one is first
  // and can leave the separator off there.
  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    entries: group.entries.filter((entry) => !entry.permission || can(entry.permission)),
  })).filter((group) => group.entries.length > 0)

  // The aside deliberately does not clip its overflow: folded, the tenant menu has to
  // reach past the rail. The scrolling navigation below clips on its own.
  return (
    <motion.aside
      animate={{ width: collapsed ? RAIL : WIDE }}
      initial={false}
      transition={FOLD}
      className="sticky top-0 z-20 flex h-screen shrink-0 flex-col border-r border-ink-border bg-ink text-text-inverse"
    >
      <SidebarHeader collapsed={collapsed} locked={locked} onToggle={onToggle} />

      <nav
        className={`mt-2 flex-1 overflow-y-auto overflow-x-hidden pb-4 ${collapsed ? 'px-2' : 'px-3'}`}
      >
        {visibleGroups.map((group, index) => (
          <div key={group.title} className="mb-5">
            {collapsed ? (
              // A rail has no room for a heading, so the groups are told apart by a rule.
              // Not above the first one, which would only underline the tenant switcher.
              index > 0 && <div aria-hidden className="mx-2 mb-3 border-t border-ink-border" />
            ) : (
              <p className="text-overline mb-1.5 px-2.5 text-text-inverse-muted/70">
                {group.title}
              </p>
            )}
            <ul>
              {group.entries.map((entry) => (
                <NavItem key={entry.href} entry={entry} collapsed={collapsed} />
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className={`pb-2 ${collapsed ? 'px-2' : 'px-3'}`}>
        <ThemeToggle collapsed={collapsed} />
      </div>

      <div className={`border-t border-ink-border p-3 ${collapsed ? 'px-2' : ''}`}>
        <div className={`flex items-center gap-2.5 ${collapsed ? 'flex-col gap-2' : ''}`}>
          <Link
            to="/profil"
            title={collapsed ? `${user?.username} · Konto` : 'Konto'}
            aria-label="Eigenes Konto"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-full)] bg-ink-hover text-[11px] font-medium transition-colors hover:bg-accent hover:text-white"
          >
            {initialsOf(user?.username ?? '')}
          </Link>

          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={FOLD}
                className="min-w-0 flex-1"
              >
                <Link to="/profil" className="block truncate text-[13px] font-medium">
                  {user?.username}
                </Link>
                <span className="block truncate text-[11px] text-text-inverse-muted">
                  {user?.superuser ? 'Superuser' : `${user?.permissions.length ?? 0} Rechte`}
                </span>
              </motion.span>
            )}
          </AnimatePresence>

          <button
            type="button"
            onClick={() => void signOut()}
            aria-label="Abmelden"
            title="Abmelden"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-sm)] text-text-inverse-muted transition-colors hover:bg-ink-hover hover:text-text-inverse"
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </motion.aside>
  )
}

/**
 * Top of the sidebar: which tenant this session works in, and the fold control next to it.
 *
 * <p>The fold control sits here rather than at the foot because that is where people look
 * for it, and because it belongs to the thing it folds. Folded it moves under the mark,
 * since a 64 pixel rail has no second column.
 */
function SidebarHeader({
  collapsed,
  locked,
  onToggle,
}: {
  collapsed: boolean
  locked: boolean
  onToggle: () => void
}) {
  return (
    <div
      className={`flex gap-1 ${collapsed ? 'flex-col items-center p-2' : 'items-center p-3 pb-2'}`}
    >
      <TenantSwitcher collapsed={collapsed} />
      {!locked && (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Navigation ausklappen' : 'Navigation einklappen'}
          title={collapsed ? 'Navigation ausklappen' : 'Navigation einklappen'}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-sm)] text-text-inverse-muted transition-colors hover:bg-ink-hover hover:text-text-inverse"
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      )}
    </div>
  )
}

/**
 * Switches between the light and the dark appearance.
 *
 * <p>Labelled with what it switches to, not with what is on screen: a button saying "Dunkel"
 * while the screen is dark reads as a state, and people then click it expecting nothing to
 * happen.
 */
function ThemeToggle({ collapsed }: { collapsed: boolean }) {
  const { theme, toggle } = useTheme()
  const dark = theme === 'dark'
  const label = dark ? 'Hell' : 'Dunkel'
  // Written out rather than assembled: "dunkel" loses its e when inflected, and a template
  // that glues on an ending produces "dunkelem".
  const title = dark
    ? 'Zu hellem Erscheinungsbild wechseln'
    : 'Zu dunklem Erscheinungsbild wechseln'

  return (
    <SidebarButton
      collapsed={collapsed}
      onClick={toggle}
      icon={
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={theme}
            initial={{ opacity: 0, rotate: -80, scale: 0.7 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, rotate: 80, scale: 0.7 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="grid place-items-center"
          >
            {dark ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}
          </motion.span>
        </AnimatePresence>
      }
      label={label}
      title={title}
    />
  )
}

/**
 * A full width row in the sidebar that turns into a centred icon when the rail is folded.
 *
 * <p>The label is not just hidden but taken out of the flow, so nothing reflows inside a
 * 64 pixel rail while the width animates.
 */
function SidebarButton({
  collapsed,
  icon,
  label,
  title,
  onClick,
}: {
  collapsed: boolean
  icon: ReactNode
  label: string
  title?: string
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? (collapsed ? label : undefined)}
      aria-label={collapsed ? label : undefined}
      className={`flex h-9 w-full items-center gap-2 rounded-[var(--radius-md)] text-[13px] text-text-inverse-muted transition-colors hover:bg-ink-hover hover:text-text-inverse ${
        collapsed ? 'justify-center px-0' : 'px-2.5'
      }`}
    >
      {icon}
      {!collapsed && <span className="flex-1 truncate text-left">{label}</span>}
    </button>
  )
}

function NavItem({ entry, collapsed }: { entry: NavEntry; collapsed: boolean }) {
  return (
    <li>
      <NavLink
        to={entry.href}
        // The overview would otherwise stay marked on every screen, since every path
        // begins with a slash.
        end={entry.href === '/'}
        title={collapsed ? entry.label : undefined}
        className={({ isActive }) =>
          `relative flex h-[34px] items-center gap-2.5 rounded-[var(--radius-md)] text-[13px] transition-colors ${
            collapsed ? 'justify-center px-0' : 'px-2.5'
          } ${
            isActive
              ? 'bg-ink-hover text-text-inverse'
              : 'text-text-inverse-muted hover:bg-ink-hover/60 hover:text-text-inverse'
          }`
        }
      >
        <entry.icon size={16} aria-hidden className="shrink-0" />
        {!collapsed && <span className="truncate">{entry.label}</span>}
        {collapsed && <span className="sr-only">{entry.label}</span>}
      </NavLink>
    </li>
  )
}

/**
 * Switches the tenant this session works in.
 *
 * <p>A superuser sees every tenant, everyone else only the ones granted to them — and the
 * session already says which those are. It used to ask `/api/tenants`, which is reserved for
 * superusers and answered 403 for everyone else; the error was swallowed and the menu stayed
 * empty. See ADR-0023.
 */
function TenantSwitcher({ collapsed }: { collapsed: boolean }) {
  const { user, switchTenant } = useAuth()
  const [open, setOpen] = useState(false)
  const [foldedWhenOpened, setFoldedWhenOpened] = useState(collapsed)
  const container = useRef<HTMLDivElement>(null)

  // Folding the sidebar while the menu hangs open would leave it floating over the rail.
  // Adjusted during render rather than in an effect, so the menu never paints in the
  // wrong place for a frame first.
  if (collapsed !== foldedWhenOpened) {
    setFoldedWhenOpened(collapsed)
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  const selectable = user?.tenants ?? []
  const active = selectable.find((tenant) => tenant.id === user?.activeTenantId)

  return (
    <div ref={container} className={`relative min-w-0 ${collapsed ? '' : 'flex-1'}`}>
      <button
        type="button"
        onClick={() => setOpen((shown) => !shown)}
        aria-expanded={open}
        aria-label={collapsed ? `Mandant wechseln, aktuell ${active?.name ?? 'keiner'}` : undefined}
        title={collapsed ? (active?.name ?? 'Kein Mandant gewählt') : undefined}
        className={`flex w-full items-center gap-2.5 rounded-[var(--radius-md)] text-left transition-colors hover:bg-ink-hover ${
          collapsed ? 'justify-center p-1' : 'p-1.5'
        }`}
      >
        <BrandMark size={30} className="shrink-0 text-white" />
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold tracking-tight">webux ERP</span>
              <span className="block truncate text-[11px] text-text-inverse-muted">
                {active ? `Mandant · ${active.name}` : 'Kein Mandant gewählt'}
              </span>
            </span>
            <ChevronsUpDown size={14} className="shrink-0 text-text-inverse-muted" aria-hidden />
          </>
        )}
      </button>

      <AnimatePresence>
        {open && selectable.length > 0 && (
          <motion.ul
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16 }}
            className={`absolute z-20 overflow-hidden rounded-[var(--radius-md)] border border-ink-border bg-ink-hover py-1 shadow-lg ${
              // Folded there is no width to drop into, so the menu opens beside the rail.
              collapsed ? 'left-[calc(100%+12px)] top-0 w-[220px]' : 'inset-x-0 top-[52px]'
            }`}
          >
            {selectable.map((tenant) => (
              <li key={tenant.id}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    void switchTenant(tenant.id)
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-text-inverse-muted transition-colors hover:bg-ink hover:text-text-inverse"
                >
                  <Building2 size={13} aria-hidden className="shrink-0" />
                  <span className="flex-1 truncate">{tenant.name}</span>
                  {tenant.id === user?.activeTenantId && <Check size={13} aria-hidden />}
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}
