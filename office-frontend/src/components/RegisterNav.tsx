import { NavLink } from 'react-router-dom'

/** One register: a screen of its own, with an address. */
export type RegisterItem = {
  href: string
  label: string
}

/**
 * The register strip above a screen that has siblings.
 *
 * <p><b>Links, not buttons — and that is the whole difference to {@link Tabs}.</b> These
 * registers are screens: each has an address, a bookmark, a back button and a middle click
 * that opens it in a new tab. {@code Tabs} switches a register *inside* one mask, where the
 * choice is state of the screen and not worth a second URL (ADR-0031).
 *
 * <p>No {@code role="tablist"} and no {@code aria-selected}: those promise arrow-key
 * navigation between panels of one page, and this is a row of links to different pages. The
 * open one carries {@code aria-current="page"}, which is what a link says about itself.
 *
 * <p>Filters nothing. It is handed the registers the session may see; who decides that is
 * {@code folderFor}.
 */
export function RegisterNav({
  registers,
  label,
}: {
  registers: RegisterItem[]
  /** What the strip switches between, for a screen reader that lands on it out of context. */
  label: string
}) {
  return (
    <nav
      aria-label={label}
      className="flex flex-wrap gap-1 border-b border-line-subtle px-8 pt-6"
    >
      {registers.map((register) => (
        <NavLink
          key={register.href}
          to={register.href}
          end
          className={({ isActive }) =>
            `-mb-px border-b-2 px-3.5 py-2 text-[13px] transition-colors ${
              isActive
                ? 'border-accent text-text-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`
          }
        >
          {register.label}
        </NavLink>
      ))}
    </nav>
  )
}
