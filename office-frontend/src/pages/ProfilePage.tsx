import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { Badge } from '../components/Badge'
import { Button } from '../components/Button'
import { ErrorNotice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { Tabs } from '../components/Tabs'
import { TextField } from '../components/TextField'
import { useAuth } from '../auth/useAuth'
import { api } from '../lib/api'
import { formatCount } from '../lib/format'
import { PROFILE_TAB_PARAM, profileTabOf, type ProfileTab } from '../lib/twoFactor'
import { TwoFactorPanel } from './profile/TwoFactorPanel'

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

  // The open register stands in the address, unlike every other register in this application
  // (frontend ADR-0005). This one is meant to be linked to: «set up your second factor» has to
  // be able to land on it, and there is no record here whose address it could ride on.
  const [params, setParams] = useSearchParams()
  const tab = profileTabOf(params.get(PROFILE_TAB_PARAM))
  const openTab = (next: ProfileTab) => {
    const updated = new URLSearchParams(params)
    updated.set(PROFILE_TAB_PARAM, next)
    // Replace, not push: the back button belongs to the screen somebody came from, not to
    // the register they last looked at.
    setParams(updated, { replace: true })
  }

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

      <div className="px-8">
        {/* Three registers rather than three panels below one another: a QR code, two ways of
            setting up and ten recovery codes hung under the password form would turn a short
            page into a scroll (ADR-0022). */}
        <Tabs
          tabs={[
            { id: 'passwort', label: 'Passwort' },
            { id: 'zwei-faktor', label: 'Zwei-Faktor' },
            { id: 'rechte', label: 'Rechte' },
          ]}
          active={tab}
          onChange={openTab}
          label="Bereiche des eigenen Kontos"
        />
      </div>

      <div
        className={`grid gap-6 px-8 pb-12 ${
          tab === 'zwei-faktor' ? 'max-w-[720px]' : 'max-w-[560px]'
        }`}
      >
        {tab === 'zwei-faktor' && user !== null && <TwoFactorPanel userId={user.userId} />}

        {tab === 'passwort' && (
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
        )}

        {tab === 'rechte' && (
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
        )}
      </div>
    </>
  )
}
