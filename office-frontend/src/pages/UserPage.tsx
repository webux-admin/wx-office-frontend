import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { Dialog } from '../components/Dialog'
import { ErrorNotice, LoadingBlock } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { TextField } from '../components/TextField'
import { useAuth } from '../auth/useAuth'
import { RequirePermission } from '../layout/RequireTenant'
import { api } from '../lib/api'
import { formatDateTime } from '../lib/format'
import { originOf, type Origin } from '../lib/origin'
import type { TenantAccess, User } from '../lib/types'
import { UserAccessPanel } from './user/UserAccessPanel'

/** The shortest password the backend accepts. Stated so the field can say so before sending. */
const MIN_PASSWORD = 12

/** Where a user mask goes when it was opened without naming a screen to return to. */
const LIST: Origin = { from: '/benutzer', label: 'Benutzer' }

/** One account: who it is, whether it may sign in, and what it may do in which tenant. */
export function UserPage() {
  return (
    <RequirePermission permission="USER_READ">
      <UserLoader />
    </RequirePermission>
  )
}

function UserLoader() {
  const { id } = useParams()
  const creating = id === 'neu'
  // The tenants of the signed in administrator: access can only be granted where the
  // administrator holds it themselves. The session names them, see ADR-0023.
  const { user: signedIn } = useAuth()

  const user = useQuery({
    queryKey: ['user', id],
    queryFn: () => api.get<User>(`/api/users/${id}`),
    enabled: !creating,
  })

  if (creating) return <NewUserMask />
  if (user.isPending) return <LoadingBlock label="Benutzer wird geladen" />
  if (user.error) {
    return (
      <div className="p-8">
        <ErrorNotice error={user.error} />
      </div>
    )
  }
  return <UserMask key={user.data.id} user={user.data} tenants={signedIn?.tenants ?? []} />
}

function NewUserMask() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const origin = originOf(useLocation().state, LIST)
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')

  const create = useMutation({
    mutationFn: () =>
      api.post<User>('/api/users', {
        username: username.trim(),
        email: email.trim(),
        displayName: displayName.trim(),
        password,
      }),
    // An account without access to a tenant can do nothing, so this one step continues into
    // the new record rather than closing. The origin travels with it, so saving there comes
    // back to where the account was started from.
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ['users'] })
      void navigate(`/benutzer/${created.id}`, { replace: true, state: { origin } })
    },
  })

  const incomplete =
    username.trim() === '' ||
    email.trim() === '' ||
    displayName.trim() === '' ||
    password.length < MIN_PASSWORD

  return (
    <>
      <PageHeader
        title="Neuer Benutzer"
        back={{ to: origin.from, label: origin.label }}
        subtitle="Das Konto entsteht ohne Zugriff auf einen Mandanten. Der wird danach erteilt."
      >
        <Button onClick={() => create.mutate()} busy={create.isPending} disabled={incomplete}>
          Anlegen
        </Button>
      </PageHeader>

      <div className="px-8 pb-12">
        {create.error !== null && (
          <div className="mb-6">
            <ErrorNotice error={create.error} />
          </div>
        )}

        <Panel title="Konto" className="max-w-[720px]">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Benutzername"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="off"
              maxLength={100}
            />
            <TextField
              label="Anzeigename"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              maxLength={150}
            />
            <TextField
              label="E-Mail"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              maxLength={255}
            />
            <TextField
              label="Erstes Passwort"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              className="sm:col-span-2"
              invalid={password !== '' && password.length < MIN_PASSWORD}
              hint={`Mindestens ${MIN_PASSWORD} Zeichen. Die Person sollte es nach der ersten Anmeldung selbst ändern.`}
            />
          </div>
        </Panel>
      </div>
    </>
  )
}

function UserMask({ user, tenants }: { user: User; tenants: TenantAccess[] }) {
  const { can, user: signedIn } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const origin = originOf(useLocation().state, LIST)
  const mayWrite = can('USER_WRITE')

  const [email, setEmail] = useState(user.email)
  const [displayName, setDisplayName] = useState(user.displayName)
  const [resetting, setResetting] = useState(false)
  const [newPassword, setNewPassword] = useState('')

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['user', `${user.id}`] })
    void queryClient.invalidateQueries({ queryKey: ['users'] })
  }

  const save = useMutation({
    mutationFn: () =>
      api.put<User>(`/api/users/${user.id}`, {
        email: email.trim(),
        displayName: displayName.trim(),
      }),
    // Saving finishes the mask, so it closes and gives way to the screen it was opened from.
    // Access to a tenant is granted below and takes effect on its own; it does not wait for
    // this button and is not lost by leaving.
    onSuccess: () => {
      refresh()
      void navigate(origin.from, { replace: true })
    },
  })

  const setActive = useMutation({
    mutationFn: (active: boolean) =>
      active
        ? api.post<User>(`/api/users/${user.id}/activate`)
        : api.delete<User>(`/api/users/${user.id}`),
    onSuccess: refresh,
  })

  // Deliberately a different operation from the self service under /api/auth/me/password:
  // this one asks for no old password and is therefore only for an administrator resetting
  // an account that is locked out.
  const resetPassword = useMutation({
    mutationFn: () => api.put<void>(`/api/users/${user.id}/password`, { password: newPassword }),
    onSuccess: () => {
      setResetting(false)
      setNewPassword('')
      refresh()
    },
  })

  const self = signedIn?.userId === user.id

  return (
    <>
      <PageHeader
        title={user.displayName}
        back={{ to: origin.from, label: origin.label }}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[12px]">{user.username}</span>
            {user.superuser && <Badge tone="accent">Superuser</Badge>}
            {user.locked && <Badge tone="danger">Gesperrt</Badge>}
            {!user.active && <Badge tone="muted">Deaktiviert</Badge>}
            <span className="text-text-tertiary">
              Zuletzt angemeldet {formatDateTime(user.lastLoginAt)}
            </span>
          </span>
        }
      >
        {mayWrite && !self && (
          <Button
            variant="secondary"
            onClick={() => setActive.mutate(!user.active)}
            busy={setActive.isPending}
          >
            {user.active ? 'Deaktivieren' : 'Aktivieren'}
          </Button>
        )}
        {mayWrite && (
          <Button onClick={() => save.mutate()} busy={save.isPending}>
            Speichern
          </Button>
        )}
      </PageHeader>

      <div className="grid gap-6 px-8 pb-12">
        {(save.error || setActive.error) && (
          <ErrorNotice error={save.error ?? setActive.error} />
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Konto">
            <div className="grid gap-4">
              <TextField label="Benutzername" value={user.username} disabled readOnly />
              <TextField
                label="Anzeigename"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                disabled={!mayWrite}
                maxLength={150}
              />
              <TextField
                label="E-Mail"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={!mayWrite}
                maxLength={255}
              />
            </div>
          </Panel>

          <Panel
            title="Passwort zurücksetzen"
            description="Administrativer Eingriff ohne Kenntnis des alten Passworts."
          >
            <p className="text-[13px] text-text-secondary">
              Das ist nicht der Weg, auf dem jemand sein eigenes Passwort ändert. Dafür gibt es
              das eigene Konto, und dort wird nach dem bisherigen Passwort gefragt. Hier wird es
              überschrieben, etwa weil sich jemand ausgesperrt hat.
            </p>
            {mayWrite && (
              <Button variant="secondary" className="mt-4" onClick={() => setResetting(true)}>
                Passwort setzen
              </Button>
            )}
          </Panel>
        </div>

        {can('USER_READ') && tenants.length > 0 && (
          <UserAccessPanel user={user} tenants={tenants} />
        )}
      </div>

      <Dialog
        open={resetting}
        onClose={() => setResetting(false)}
        title="Passwort zurücksetzen"
        description={`Für ${user.username}. Das bisherige Passwort wird nicht abgefragt.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setResetting(false)}>
              Abbrechen
            </Button>
            <Button
              onClick={() => resetPassword.mutate()}
              busy={resetPassword.isPending}
              disabled={newPassword.length < MIN_PASSWORD}
            >
              Setzen
            </Button>
          </>
        }
      >
        <TextField
          label="Neues Passwort"
          type="password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          autoComplete="new-password"
          invalid={newPassword !== '' && newPassword.length < MIN_PASSWORD}
          hint={`Mindestens ${MIN_PASSWORD} Zeichen. Weitergabe auf einem anderen Weg als per E-Mail.`}
        />
        {resetPassword.error !== null && (
          <div className="mt-4">
            <ErrorNotice error={resetPassword.error} />
          </div>
        )}
      </Dialog>
    </>
  )
}
