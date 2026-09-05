import { WarningNotice } from '../../components/Notice'

/**
 * What one step of the wizard says when the right it needs is missing.
 *
 * <p><b>Per step and not over the whole screen.</b> Whoever may only read still sees where the
 * tenant stands, and that is the more useful answer than a 403 page: a `ForbiddenNotice` over the
 * whole wizard would hide the three steps from exactly the person who wants to know which of them
 * is still open.
 *
 * @param right the permission code, so the sentence names what has to be assigned
 * @param name what that right is called on the role screen
 */
export function MissingRightHint({ right, name }: { right: string; name: string }) {
  return (
    <WarningNotice>
      Für diesen Schritt fehlt Ihnen das Recht <em>{name}</em> (<code>{right}</code>). Unter
      Benutzer → Rollen lässt es sich zuteilen.
    </WarningNotice>
  )
}
