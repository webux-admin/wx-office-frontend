import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge } from '../../components/Badge'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { ErrorNotice } from '../../components/Notice'
import { Panel } from '../../components/Panel'
import { useAuth } from '../../auth/useAuth'
import { api } from '../../lib/api'
import {
  methodLabel,
  resetSecondFactorUrl,
  secondFactorStateKey,
  secondFactorStateUrl,
  TWO_FACTOR_RESET,
} from '../../lib/twoFactor'
import type { SecondFactorState, User } from '../../lib/types'

/**
 * What the administration may do about somebody else's second factor: look, and take it away.
 *
 * <p><b>Taking it away is one of the few buttons that make an account weaker</b>, so it is not
 * the primary action of this screen and does not stand first in the row. It sits in its own
 * panel with the consequence written out — together with setting a password it is an account
 * takeover, which is why it has a right of its own (backend ADR-0087).
 *
 * <p>There is no way to set one up for somebody else, and there will not be: a second factor
 * that an administrator enrolled is a second factor an administrator can pass.
 */
export function TwoFactorAdminPanel({ user }: { user: User }) {
  const { can } = useAuth()
  const queryClient = useQueryClient()
  const [asking, setAsking] = useState(false)

  const state = useQuery({
    queryKey: secondFactorStateKey(user.id),
    queryFn: () => api.get<SecondFactorState>(secondFactorStateUrl(user.id)),
  })

  const reset = useMutation({
    mutationFn: () => api.post<void>(resetSecondFactorUrl(user.id)),
    onSuccess: () => {
      setAsking(false)
      void queryClient.invalidateQueries({ queryKey: secondFactorStateKey(user.id) })
    },
  })

  const enrolled = state.data?.enrolled === true

  return (
    <Panel
      title="Zwei-Faktor"
      description="Der zweite Nachweis beim Anmelden. Der Benutzer richtet ihn selbst ein."
      className="max-w-[720px]"
    >
      {state.error !== null ? (
        <ErrorNotice error={state.error} />
      ) : (
        <p className="flex flex-wrap items-center gap-2 text-[13px]">
          {enrolled ? (
            <>
              <Badge tone="success">Eingerichtet</Badge>
              <span className="text-text-secondary">{methodLabel(state.data?.method)}</span>
              <span className="text-text-tertiary">
                Noch {state.data?.remainingRecoveryCodes ?? 0} Wiederherstellungscodes
              </span>
            </>
          ) : (
            <>
              <Badge tone="muted">Nicht eingerichtet</Badge>
              <span className="text-text-secondary">
                Dieses Konto ist nur durch sein Passwort geschützt.
              </span>
            </>
          )}
        </p>
      )}

      {can(TWO_FACTOR_RESET) && enrolled && (
        <Button variant="secondary" className="mt-4" onClick={() => setAsking(true)}>
          Zwei-Faktor zurücksetzen
        </Button>
      )}

      <Dialog
        open={asking}
        onClose={() => setAsking(false)}
        title="Zwei-Faktor zurücksetzen?"
        description={`Für ${user.username}. Für den Fall, dass das Telefon weg ist.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAsking(false)}>
              Abbrechen
            </Button>
            <Button variant="danger" onClick={() => reset.mutate()} busy={reset.isPending}>
              Zurücksetzen
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-text-secondary">
          Der Benutzer meldet sich danach <strong>nur noch mit seinem Passwort</strong> an, bis
          er den zweiten Faktor neu einrichtet. Die Wiederherstellungscodes werden ebenfalls
          ungültig.
        </p>
        {reset.error !== null && (
          <div className="mt-4">
            <ErrorNotice error={reset.error} />
          </div>
        )}
      </Dialog>
    </Panel>
  )
}
