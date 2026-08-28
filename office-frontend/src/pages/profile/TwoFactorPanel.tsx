import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Printer, ShieldCheck, Smartphone } from 'lucide-react'
import { Badge } from '../../components/Badge'
import { Button } from '../../components/Button'
import { CheckboxField } from '../../components/CheckboxField'
import { Dialog } from '../../components/Dialog'
import { ErrorNotice, LoadingBlock, WarningNotice } from '../../components/Notice'
import { Panel } from '../../components/Panel'
import { TextField } from '../../components/TextField'
import { api } from '../../lib/api'
import { LOGIN_POLICY_KEY, LOGIN_POLICY_URL, type LoginPolicy } from '../../lib/loginPolicy'
import {
  CODE_LENGTH,
  methodLabel,
  RECOVERY_CODE_FILE,
  recoveryCodeFileContent,
  secondFactorStateKey,
  secondFactorStateUrl,
  TWO_FACTOR_URL,
} from '../../lib/twoFactor'
import type {
  RecoveryCodes,
  SecondFactorEnrolment,
  SecondFactorState,
} from '../../lib/types'

/** Which way of setting up is open, `null` while none is. */
type Setup = 'app' | 'mail' | null

/**
 * The second factor of the own account: what stands, how to set it up, how to take it away.
 *
 * <p><b>Here and not on a screen of its own in the sidebar.</b> It is a setting of the person,
 * not a module of the tenant: a user decides for themselves, and nobody prescribes it
 * (ADR-0022).
 *
 * <p><b>The dangerous moment is the setup.</b> The ten recovery codes are shown exactly once
 * (backend ADR-0087). Whoever clicks the screen away without keeping them needs an
 * administrator the next time they lose their telephone — so the way on is behind a tick box,
 * not behind a close button.
 */
export function TwoFactorPanel({ userId }: { userId: number }) {
  const queryClient = useQueryClient()

  const [setup, setSetup] = useState<Setup>(null)
  const [code, setCode] = useState('')
  const [codes, setCodes] = useState<string[] | null>(null)
  const [kept, setKept] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [password, setPassword] = useState('')
  const [mailSent, setMailSent] = useState(false)

  const state = useQuery({
    queryKey: secondFactorStateKey(userId),
    queryFn: () => api.get<SecondFactorState>(secondFactorStateUrl(userId)),
  })

  // Whether this installation demands a factor at all. Open to anyone signed in — the login
  // tells whoever asks anyway, so there is nothing kept back here (backend ADR-0090).
  const policy = useQuery({
    queryKey: LOGIN_POLICY_KEY,
    queryFn: () => api.get<LoginPolicy>(LOGIN_POLICY_URL),
  })

  /** Clears everything a finished or abandoned setup left behind. */
  const reset = () => {
    setSetup(null)
    setCode('')
    setMailSent(false)
    start.reset()
    startMail.reset()
    confirm.reset()
  }

  const start = useMutation({
    mutationFn: () => api.post<SecondFactorEnrolment>(`${TWO_FACTOR_URL}/totp`),
    onSuccess: () => {
      setSetup('app')
      setCode('')
    },
  })

  const startMail = useMutation({
    mutationFn: () => api.post<void>(`${TWO_FACTOR_URL}/email`),
    onSuccess: () => {
      setSetup('mail')
      setCode('')
      setMailSent(true)
    },
  })

  const confirm = useMutation({
    mutationFn: (method: Exclude<Setup, null>) =>
      api.post<RecoveryCodes>(
        `${TWO_FACTOR_URL}/${method === 'app' ? 'totp' : 'email'}/confirm`,
        { code },
      ),
    onSuccess: (answer) => {
      reset()
      // An empty list means the account already had a set from an earlier method, and those
      // stay valid (backend ADR-0089). Then there is nothing to show and nothing to keep.
      setCodes(answer.codes.length > 0 ? answer.codes : null)
      setKept(answer.codes.length === 0)
      void queryClient.invalidateQueries({ queryKey: secondFactorStateKey(userId) })
    },
  })

  const regenerate = useMutation({
    mutationFn: () =>
      api.post<RecoveryCodes>(`${TWO_FACTOR_URL}/recovery-codes`, { password }),
    onSuccess: (answer) => {
      setPassword('')
      setCodes(answer.codes)
      setKept(false)
      void queryClient.invalidateQueries({ queryKey: secondFactorStateKey(userId) })
    },
  })

  const remove = useMutation({
    mutationFn: () => api.post<void>(`${TWO_FACTOR_URL}/remove`, { password }),
    onSuccess: () => {
      setRemoving(false)
      setPassword('')
      void queryClient.invalidateQueries({ queryKey: secondFactorStateKey(userId) })
    },
  })

  const current = state.data
  const enrolled = current?.enrolled === true
  const required = policy.data?.twoFactorRequired === true

  if (state.isPending) return <LoadingBlock />
  if (state.error !== null) return <ErrorNotice error={state.error} />

  // The codes take the whole register while they are on screen: they exist for one moment, and
  // anything beside them competes with the only thing that matters right now.
  if (codes !== null) {
    return (
      <RecoveryCodesStep codes={codes} kept={kept} onKept={setKept} onDone={() => setCodes(null)} />
    )
  }

  return (
    <div className="grid gap-6">
      <Panel
        title="Zwei-Faktor-Anmeldung"
        description="Ein zweiter Nachweis nach dem Passwort, beim Anmelden."
      >
        {enrolled ? (
          <div className="grid gap-3">
            <p className="flex flex-wrap items-center gap-2 text-[13px]">
              <Badge tone="success">Eingerichtet</Badge>
              <span className="text-text-secondary">{methodLabel(current?.method)}</span>
            </p>
            <p className="text-[13px] text-text-secondary">
              Noch {current?.remainingRecoveryCodes ?? 0} von zehn Wiederherstellungscodes
              übrig.
              {(current?.remainingRecoveryCodes ?? 0) <= 2 && (
                <strong className="text-danger">
                  {' '}
                  Ziehen Sie neue, solange Sie hineinkommen.
                </strong>
              )}
            </p>
          </div>
        ) : (
          <p className="text-[13px] text-text-secondary">
            Nach dem Passwort wird zusätzlich ein Code verlangt. Ein gestohlenes Passwort
            allein genügt dann nicht mehr, um in Ihr Konto zu kommen.
            {/* Reachable while somebody was signed in as the duty was switched on. Their
                current session runs on; the next login asks for the setup. */}
            {required && (
              <strong>
                {' '}
                Diese Installation verlangt einen zweiten Faktor — spätestens bei der nächsten
                Anmeldung müssen Sie ihn einrichten.
              </strong>
            )}
          </p>
        )}
      </Panel>

      {!enrolled && setup === null && (
        <>
          <Panel
            title="Mit einer Authenticator-App"
            description="Der stärkere Weg. Der Code entsteht auf Ihrem Telefon, ohne Netz."
          >
            {/* Named, not linked: a link to an app store goes stale and reads like a
                recommendation we are in no position to make. */}
            <p className="text-[13px] text-text-secondary">
              Google Authenticator, Microsoft Authenticator, 1Password, Bitwarden oder eine
              andere Authenticator-App — sie rechnen alle dasselbe.
            </p>
            <Button className="mt-4" onClick={() => start.mutate()} busy={start.isPending}>
              <Smartphone size={15} aria-hidden />
              Einrichten
            </Button>
            {start.error !== null && <ErrorNotice error={start.error} />}
          </Panel>

          <Panel
            title="Mit einem Code per E-Mail"
            description="Für den Fall, dass keine App infrage kommt."
          >
            <p className="text-[13px] text-text-secondary">
              Wir schicken Ihnen bei jeder Anmeldung einen Code an Ihre hinterlegte Adresse.
              <strong> Das ist der schwächere Schutz:</strong> wer Ihr Postfach übernimmt,
              übernimmt damit auch den zweiten Faktor.
            </p>
            <Button
              variant="secondary"
              className="mt-4"
              onClick={() => startMail.mutate()}
              busy={startMail.isPending}
            >
              Code senden und einrichten
            </Button>
            {/* Without a system mail server the backend refuses with a sentence naming the
                missing property. Shown as it is rather than swallowed: a silent gap would
                leave somebody clicking a button that does nothing (backend ADR-0089). */}
            {startMail.error !== null && <ErrorNotice error={startMail.error} />}
          </Panel>
        </>
      )}

      {setup === 'app' && start.data !== undefined && (
        <Panel title="App einrichten">
          <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-start">
            <div
              className="w-[180px] rounded-[var(--radius-md)] border border-line-subtle bg-white p-2"
              // The backend renders the QR code; the browser only shows it.
              dangerouslySetInnerHTML={{ __html: start.data.qrSvg }}
            />
            <div className="grid gap-3">
              <p className="text-[13px] text-text-secondary">
                Scannen Sie den Code mit Ihrer App. Ohne Kamera am zweiten Bildschirm:
                tippen Sie diesen Schlüssel ab.
              </p>
              <code className="rounded-[var(--radius-sm)] bg-sunken px-2 py-1 font-mono text-[13px] break-all">
                {start.data.secret}
              </code>
            </div>
          </div>
          <CodeConfirmation
            code={code}
            onCode={setCode}
            onConfirm={() => confirm.mutate('app')}
            onCancel={reset}
            busy={confirm.isPending}
            error={confirm.error}
            hint="Sechs Ziffern aus der App."
          />
        </Panel>
      )}

      {setup === 'mail' && (
        <Panel title="E-Mail einrichten">
          <p aria-live="polite" className="text-[13px] text-text-secondary">
            {mailSent
              ? 'Wir haben einen Code an Ihre hinterlegte Adresse geschickt. Er gilt zehn Minuten.'
              : ''}
          </p>
          <CodeConfirmation
            code={code}
            onCode={setCode}
            onConfirm={() => confirm.mutate('mail')}
            onCancel={reset}
            busy={confirm.isPending}
            error={confirm.error}
            hint="Sechs Ziffern aus der E-Mail."
          />
        </Panel>
      )}

      {enrolled && (
        <Panel
          title="Wiederherstellungscodes"
          description="Der Weg hinein, wenn das Telefon weg ist."
        >
          <p className="text-[13px] text-text-secondary">
            Die alten Codes werden dabei ungültig. Es gibt sie nur einmal zu sehen — falls Sie
            die letzte Liste verlegt haben, ziehen Sie hier eine neue.
          </p>
          <div className="mt-4 grid max-w-[320px] gap-3">
            <TextField
              label="Passwort zur Bestätigung"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
            <div>
              <Button
                variant="secondary"
                onClick={() => regenerate.mutate()}
                busy={regenerate.isPending}
                disabled={password === ''}
              >
                Neue Codes erzeugen
              </Button>
            </div>
            {regenerate.error !== null && <ErrorNotice error={regenerate.error} />}
          </div>
        </Panel>
      )}

      {enrolled &&
        (required ? (
          // No button at all, not a disabled one: the backend refuses this with 409, and a
          // greyed-out button invites the click that finds that out (backend ADR-0090).
          <Panel title="Abschalten">
            <p className="text-[13px] text-text-secondary">
              Diese Installation verlangt von jedem Konto einen zweiten Faktor. Abschalten
              lässt er sich deshalb nicht. Bei einem verlorenen Telefon setzt ihn eine Person
              mit dem Recht <span className="font-mono text-[12px]">USER_TWO_FACTOR_RESET</span>{' '}
              zurück — Sie richten ihn dann bei der nächsten Anmeldung neu ein.
            </p>
          </Panel>
        ) : (
          <Panel title="Abschalten">
            <p className="text-[13px] text-text-secondary">
              Danach genügt für die Anmeldung wieder Ihr Passwort allein.
            </p>
            <Button variant="secondary" className="mt-4" onClick={() => setRemoving(true)}>
              Zwei-Faktor abschalten
            </Button>
          </Panel>
        ))}

      <Dialog
        open={removing}
        onClose={() => setRemoving(false)}
        title="Zwei-Faktor abschalten?"
        description="Ihr Konto ist danach nur noch durch das Passwort geschützt. Die Wiederherstellungscodes werden ebenfalls ungültig."
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoving(false)}>
              Abbrechen
            </Button>
            <Button
              variant="danger"
              onClick={() => remove.mutate()}
              busy={remove.isPending}
              disabled={password === ''}
            >
              Abschalten
            </Button>
          </>
        }
      >
        {/* The password in the same dialog: an unattended session must not be able to remove
            the protection in one click (backend ADR-0087). */}
        <TextField
          label="Passwort"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
        />
        {remove.error !== null && (
          <div className="mt-4">
            <ErrorNotice error={remove.error} />
          </div>
        )}
      </Dialog>
    </div>
  )
}

/** The code field that both ways of setting up end in. */
function CodeConfirmation({
  code,
  onCode,
  onConfirm,
  onCancel,
  busy,
  error,
  hint,
}: {
  code: string
  onCode: (value: string) => void
  onConfirm: () => void
  onCancel: () => void
  busy: boolean
  error: unknown
  hint: string
}) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (code.length === CODE_LENGTH && !busy) onConfirm()
      }}
      className="mt-5 grid max-w-[320px] gap-3"
    >
      <TextField
        label="Code"
        value={code}
        onChange={(event) => onCode(event.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH))}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={CODE_LENGTH}
        hint={hint}
        icon={<ShieldCheck size={15} />}
      />
      <div className="flex gap-2">
        <Button type="submit" busy={busy} disabled={code.length !== CODE_LENGTH}>
          Bestätigen
        </Button>
        <Button variant="secondary" type="button" onClick={onCancel}>
          Abbrechen
        </Button>
      </div>
      {error !== null && <ErrorNotice error={error} />}
    </form>
  )
}

/**
 * The one moment the recovery codes exist in readable form.
 *
 * <p>The way on is behind a tick box, not behind a close button. Somebody who clicks this
 * away unread has lost them — and finds out at the worst possible moment, with a new
 * telephone in their hand.
 */
function RecoveryCodesStep({
  codes,
  kept,
  onKept,
  onDone,
}: {
  codes: string[]
  kept: boolean
  onKept: (value: boolean) => void
  onDone: () => void
}) {
  function download() {
    const url = URL.createObjectURL(
      new Blob([recoveryCodeFileContent(codes)], { type: 'text/plain;charset=utf-8' }),
    )
    const link = document.createElement('a')
    link.href = url
    link.download = RECOVERY_CODE_FILE
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  return (
    <Panel
      title="Wiederherstellungscodes"
      description="Jeder Code funktioniert genau einmal."
    >
      <WarningNotice>
        Diese Codes erscheinen <strong>nur jetzt</strong>. Speichern oder drucken Sie sie,
        bevor Sie weitergehen — ohne sie und ohne Ihr Telefon kommen Sie nicht mehr in Ihr
        Konto, und die Administration muss zurücksetzen.
      </WarningNotice>

      <ul className="mt-4 grid max-w-[420px] grid-cols-2 gap-2">
        {codes.map((entry) => (
          <li
            key={entry}
            className="rounded-[var(--radius-sm)] bg-sunken px-3 py-2 text-center font-mono text-[15px] tracking-[1px]"
          >
            {entry}
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={download}>
          <Download size={15} aria-hidden />
          Herunterladen
        </Button>
        <Button variant="secondary" onClick={() => window.print()}>
          <Printer size={15} aria-hidden />
          Drucken
        </Button>
      </div>

      <CheckboxField
        className="mt-5"
        label="Ich habe die Codes gesichert"
        checked={kept}
        onChange={(event) => onKept(event.target.checked)}
      />

      <div className="mt-4">
        <Button onClick={onDone} disabled={!kept}>
          Weiter
        </Button>
      </div>
    </Panel>
  )
}
