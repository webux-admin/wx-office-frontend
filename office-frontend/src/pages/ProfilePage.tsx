import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { ErrorNotice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { TextField } from '../components/TextField'
import { useAuth } from '../auth/useAuth'
import { api } from '../lib/api'
import { formatCount } from '../lib/format'

/** The shortest password the backend accepts. */
const MIN_PASSWORD = 12

/**
 * The account of the person signed in.
 *
 * <p>Changing the own password needs no permission at all and asks for the current one. It is
 * a different endpoint from the administrative reset on the user mask, and deliberately so:
 * this one cannot be pointed at somebody else, because the account comes from the session
 * rather than from the address.
 */
export function ProfilePage() {
  const { user } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [repeated, setRepeated] = useState('')

  const change = useMutation({
    mutationFn: () => api.put<void>('/api/auth/me/password', { currentPassword, newPassword }),
    onSuccess: () => {
      setCurrentPassword('')
      setNewPassword('')
      setRepeated('')
    },
  })

  const mismatch = repeated !== '' && repeated !== newPassword
  const tooShort = newPassword !== '' && newPassword.length < MIN_PASSWORD
  const incomplete =
    currentPassword === '' || newPassword.length < MIN_PASSWORD || repeated !== newPassword

  return (
    <>
      <PageHeader
        title="Eigenes Konto"
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[12px]">{user?.username}</span>
            {user?.superuser && <Badge tone="accent">Superuser</Badge>}
            <span>
              {formatCount(user?.permissions.length ?? 0)} Rechte im aktiven Mandanten
            </span>
          </span>
        }
      />

      <div className="grid max-w-[560px] gap-6 px-8 pb-12">
        <Panel
          title="Passwort ändern"
          description="Gilt für das eigene Konto und fragt nach dem bisherigen Passwort."
        >
          <form
            onSubmit={(event) => {
              event.preventDefault()
              if (!incomplete) change.mutate()
            }}
            className="grid gap-4"
          >
            <TextField
              label="Bisheriges Passwort"
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
            />
            <TextField
              label="Neues Passwort"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              invalid={tooShort}
              hint={`Mindestens ${MIN_PASSWORD} Zeichen.`}
            />
            <TextField
              label="Neues Passwort wiederholen"
              type="password"
              value={repeated}
              onChange={(event) => setRepeated(event.target.value)}
              autoComplete="new-password"
              invalid={mismatch}
              hint={mismatch ? 'Die beiden Eingaben stimmen nicht überein.' : undefined}
            />

            {change.error !== null && <ErrorNotice error={change.error} />}

            {change.isSuccess && (
              <p role="status" className="text-[13px] text-success">
                Passwort geändert. Die Sitzung bleibt bestehen.
              </p>
            )}

            <div>
              <Button type="submit" busy={change.isPending} disabled={incomplete}>
                Passwort ändern
              </Button>
            </div>
          </form>
        </Panel>

        <Panel title="Rechte im aktiven Mandanten">
          {(user?.permissions.length ?? 0) === 0 ? (
            <p className="text-[13px] text-text-secondary">
              In diesem Mandanten sind keine Rechte hinterlegt.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {user?.permissions.map((permission) => (
                <Badge key={permission}>{permission}</Badge>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </>
  )
}
