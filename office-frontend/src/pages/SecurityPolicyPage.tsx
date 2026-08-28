import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { Dialog } from '../components/Dialog'
import { ErrorNotice, LoadingBlock } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { useAuth } from '../auth/useAuth'
import { api } from '../lib/api'
import {
  LOGIN_POLICY_KEY,
  LOGIN_POLICY_URL,
  type LoginPolicy,
} from '../lib/loginPolicy'
import { PROFILE_PATH, PROFILE_TAB_PARAM } from '../lib/twoFactor'
import { useState } from 'react'

/**
 * How this installation logs in — today, whether a second factor is compulsory.
 *
 * <p><b>Of the installation, not of a tenant.</b> Every other settings screen works on the
 * tenant of the session; this one does not, and that is the point: a login knows a user name
 * and nothing else, so a duty hung on the tenant would miss the superuser entirely
 * (backend ADR-0090).
 *
 * <p>That is also why the switch is for superusers rather than behind a right. A right can be
 * granted to a role of one tenant, and one tenant's administrator must not decide how everyone
 * else logs in. Anyone else who finds their way here reads the state and no more.
 */
export function SecurityPolicyPage() {
  const { user, refresh } = useAuth()
  const queryClient = useQueryClient()
  const maySwitch = user?.superuser === true

  const [confirming, setConfirming] = useState(false)

  const policy = useQuery({
    queryKey: LOGIN_POLICY_KEY,
    queryFn: () => api.get<LoginPolicy>(LOGIN_POLICY_URL),
  })

  const save = useMutation({
    mutationFn: (twoFactorRequired: boolean) =>
      api.put<LoginPolicy>(LOGIN_POLICY_URL, { twoFactorRequired }),
    onSuccess: async (stored) => {
      queryClient.setQueryData(LOGIN_POLICY_KEY, stored)
      setConfirming(false)
      // The own account may have just lost its way out of the second factor. The profile
      // reads that from this query, so nothing else needs invalidating.
      await refresh()
    },
  })

  if (policy.isPending) return <LoadingBlock />
  if (policy.error !== null) return <ErrorNotice error={policy.error} />

  const required = policy.data?.twoFactorRequired === true

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Sicherheit"
        subtitle="Wie sich in dieser Installation angemeldet wird. Gilt für alle Mandanten."
      />

      <Panel
        title="Zwei-Faktor-Anmeldung"
        description="Ein zweiter Nachweis nach dem Passwort, bei jeder Anmeldung."
      >
        <div className="grid gap-4">
          <p className="flex flex-wrap items-center gap-2 text-[13px]">
            {required ? (
              <>
                <Badge tone="success">Für alle Pflicht</Badge>
                <span className="text-text-secondary">
                  Jedes Konto dieser Installation braucht einen zweiten Faktor.
                </span>
              </>
            ) : (
              <>
                <Badge>Freiwillig</Badge>
                <span className="text-text-secondary">
                  Jede Person entscheidet für ihr Konto selbst.
                </span>
              </>
            )}
          </p>

          {/* The sentence this screen exists for. «Pflicht» sounds like a lock-out, and the
              first question anybody asks is what happens to the people without an app. */}
          <p className="text-[13px] leading-[20px] text-text-secondary">
            {required ? (
              <>
                Wer noch keinen zweiten Faktor hat, richtet ihn <strong>bei der nächsten
                Anmeldung</strong> ein — mit einer Authenticator-App, direkt im
                Anmeldebildschirm. Ausgesperrt wird dadurch niemand. Abschalten kann den
                eigenen Faktor solange niemand mehr; ein verlorenes Telefon löst eine Person
                mit dem Recht <span className="font-mono text-[12px]">USER_TWO_FACTOR_RESET</span>{' '}
                unter <em>Benutzer</em>.
              </>
            ) : (
              <>
                Beim Einschalten wird niemand ausgesperrt: Wer noch keinen zweiten Faktor hat,
                richtet ihn bei der nächsten Anmeldung im Anmeldebildschirm ein. Das gilt auch
                für Sie selbst.
              </>
            )}
          </p>

          {maySwitch ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant={required ? 'secondary' : 'primary'}
                onClick={() => (required ? save.mutate(false) : setConfirming(true))}
                busy={save.isPending}
              >
                <ShieldCheck size={15} aria-hidden />
                {required ? 'Pflicht aufheben' : 'Für alle verlangen'}
              </Button>
              <Link
                to={`${PROFILE_PATH}?${PROFILE_TAB_PARAM}=zwei-faktor`}
                className="text-[13px] text-accent-text underline-offset-2 hover:underline"
              >
                Eigenen zweiten Faktor einrichten
              </Link>
            </div>
          ) : (
            <p className="text-[13px] text-text-tertiary">
              Diese Einstellung gilt für die ganze Installation und lässt sich nur von einem
              Superuser ändern.
            </p>
          )}

          {save.error !== null && <ErrorNotice error={save.error} />}
        </div>
      </Panel>

      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Zwei-Faktor für alle verlangen?"
        description="Ab sofort verlangt jede Anmeldung einen zweiten Faktor — auch Ihre eigene."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Abbrechen
            </Button>
            <Button onClick={() => save.mutate(true)} busy={save.isPending}>
              Verlangen
            </Button>
          </>
        }
      >
        <ul className="grid gap-2 text-[13px] leading-[20px] text-text-secondary">
          <li>
            Konten ohne zweiten Faktor richten ihn bei der nächsten Anmeldung ein. Niemand
            wird ausgesperrt.
          </li>
          <li>
            Dafür braucht jede Person eine Authenticator-App auf dem Telefon. Der Weg per
            E-Mail steht erst danach im eigenen Konto zur Wahl.
          </li>
          <li>Den eigenen Faktor kann danach niemand mehr selbst abschalten.</li>
        </ul>
        {save.error !== null && (
          <div className="mt-4">
            <ErrorNotice error={save.error} />
          </div>
        )}
      </Dialog>
    </div>
  )
}
