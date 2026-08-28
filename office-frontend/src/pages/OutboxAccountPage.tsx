import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PlugZap } from 'lucide-react'
import { Button } from '../components/Button'
import { CheckboxField } from '../components/CheckboxField'
import { ErrorNotice, LoadingBlock, WarningNotice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { SelectField } from '../components/SelectField'
import { TextField } from '../components/TextField'
import { useSubmitShortcut } from '../components/useSubmitShortcut'
import { useAuth } from '../auth/useAuth'
import { RequireTenant } from '../layout/RequireTenant'
import { api, ApiError } from '../lib/api'
import {
  mailAccountKey,
  mailAccountUrl,
  OUTBOX_RIGHTS,
  SMTP_SECURITIES,
} from '../lib/outbox'
import type { MailAccount, SmtpSecurity } from '../lib/types'

/**
 * The mail account this tenant sends through.
 *
 * <p>One account per tenant, and it is an operating setting rather than a contact detail: the
 * address printed on documents is never used for delivery (backend ADR-0082).
 *
 * <p><b>The password field is write-only.</b> The backend hands the password out nowhere, so
 * the mask shows that one is stored and offers an empty field beside it. Left empty it means
 * «unchanged» — without that, the first person who only changes the port empties the password.
 */
export function OutboxAccountPage() {
  return (
    <RequireTenant permission={OUTBOX_RIGHTS.read}>
      {(tenantId) => <Account tenantId={tenantId} />}
    </RequireTenant>
  )
}

/** The form as it is typed. Everything a string, because that is what an input holds. */
type AccountForm = {
  host: string
  port: string
  security: SmtpSecurity
  username: string
  password: string
  senderAddress: string
  senderName: string
  replyTo: string
  active: boolean
}

/** What a tenant without an account starts from: the settings that fit most servers. */
const BLANK: AccountForm = {
  host: '',
  port: '587',
  security: 'STARTTLS',
  username: '',
  password: '',
  senderAddress: '',
  senderName: '',
  replyTo: '',
  active: true,
}

function formOf(account: MailAccount | null): AccountForm {
  if (account === null) return BLANK
  return {
    host: account.host,
    port: `${account.port}`,
    security: account.security,
    username: account.username ?? '',
    // Never filled from the answer: there is nothing in the answer to fill it from.
    password: '',
    senderAddress: account.senderAddress,
    senderName: account.senderName ?? '',
    replyTo: account.replyTo ?? '',
    active: account.active,
  }
}

function Account({ tenantId }: { tenantId: number }) {
  const { can } = useAuth()
  const queryClient = useQueryClient()
  const mayConfigure = can(OUTBOX_RIGHTS.configure)

  const [form, setForm] = useState<AccountForm | null>(null)
  const [tested, setTested] = useState<string | null>(null)

  const account = useQuery({
    queryKey: mailAccountKey(tenantId),
    // A tenant without an account gets 404, and that is not an error here — it is the state
    // every tenant starts in. Caught rather than shown, so the mask opens on an empty form
    // instead of on a complaint.
    queryFn: () =>
      api.get<MailAccount>(mailAccountUrl(tenantId)).catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 404) return null
        throw error
      }),
  })

  const stored = account.data ?? null
  const typed = form ?? formOf(stored)
  const changed = form !== null
  const set = <K extends keyof AccountForm>(key: K, value: AccountForm[K]) =>
    setForm((current) => ({ ...(current ?? formOf(stored)), [key]: value }))

  const save = useMutation({
    mutationFn: () =>
      api.put<MailAccount>(mailAccountUrl(tenantId), {
        authKind: 'SMTP_PASSWORD',
        host: typed.host.trim(),
        port: Number(typed.port),
        security: typed.security,
        username: blankToUndefined(typed.username),
        // Left out, not sent empty: an empty string means «remove the password», and that is
        // a decision somebody makes in the form, not a side effect of saving the port.
        password: typed.password === '' ? undefined : typed.password,
        senderAddress: typed.senderAddress.trim(),
        senderName: blankToUndefined(typed.senderName),
        replyTo: blankToUndefined(typed.replyTo),
        active: typed.active,
      }),
    onSuccess: () => {
      setForm(null)
      setTested(null)
      void queryClient.invalidateQueries({ queryKey: mailAccountKey(tenantId) })
    },
  })

  // Against the stored account, not against the form: the test signs in at a real server, and
  // it can only use the password that lies in the database.
  const test = useMutation({
    mutationFn: () => api.post<{ message: string }>(`${mailAccountUrl(tenantId)}/test`),
    onSuccess: (answer) => setTested(answer.message),
  })

  const submit = () => save.mutate()
  useSubmitShortcut(mayConfigure && !save.isPending && changed ? submit : undefined)

  const locked = !mayConfigure || save.isPending

  return (
    <>
      <PageHeader
        title="Postausgang"
        subtitle="Über welches Konto dieser Mandant E-Mails versendet"
      >
        {mayConfigure && (
          <Button onClick={submit} busy={save.isPending} disabled={!changed} shortcut>
            Speichern
          </Button>
        )}
      </PageHeader>

      <div className="px-8 pb-12">
        {account.isPending && <LoadingBlock />}
        {account.error !== null && <ErrorNotice error={account.error} />}
        {save.error !== null && <ErrorNotice error={save.error} />}

        {!account.isPending && account.error === null && (
          <>
            {!mayConfigure && (
              <WarningNotice>
                Zum Ändern des Mailkontos fehlt das Recht «Postausgang einrichten».
              </WarningNotice>
            )}

            <Panel title="Server" description="Wohin die Anwendung die Mails übergibt">
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField
                  label="Anmeldeart"
                  value="SMTP_PASSWORD"
                  disabled
                  hint="Microsoft 365 folgt"
                  onChange={() => undefined}
                >
                  <option value="SMTP_PASSWORD">Benutzer und Passwort (SMTP)</option>
                </SelectField>
                <SelectField
                  label="Verschlüsselung"
                  value={typed.security}
                  disabled={locked}
                  onChange={(event) => set('security', event.target.value as SmtpSecurity)}
                >
                  {SMTP_SECURITIES.map((entry) => (
                    <option key={entry.value} value={entry.value}>
                      {entry.label}
                    </option>
                  ))}
                </SelectField>
                <TextField
                  label="Server"
                  value={typed.host}
                  disabled={locked}
                  maxLength={255}
                  placeholder="smtp.example.ch"
                  onChange={(event) => set('host', event.target.value)}
                />
                <TextField
                  label="Port"
                  value={typed.port}
                  disabled={locked}
                  numeric
                  inputMode="numeric"
                  onChange={(event) => set('port', event.target.value)}
                />
                <TextField
                  label="Benutzer"
                  value={typed.username}
                  disabled={locked}
                  maxLength={255}
                  hint="Leer lassen, wo der Server ohne Anmeldung annimmt"
                  onChange={(event) => set('username', event.target.value)}
                />
                <TextField
                  label="Passwort"
                  type="password"
                  value={typed.password}
                  disabled={locked}
                  maxLength={255}
                  autoComplete="new-password"
                  placeholder={stored?.passwordSet === true ? '••••••••, gespeichert' : ''}
                  hint={
                    stored?.passwordSet === true
                      ? 'Leer lassen heisst: unverändert.'
                      : 'Wird verschlüsselt gespeichert und nie wieder herausgegeben.'
                  }
                  onChange={(event) => set('password', event.target.value)}
                />
              </div>
            </Panel>

            <Panel
              title="Absender"
              description="Was beim Empfänger im Kopf der Mail steht"
              className="mt-4"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label="Absenderadresse"
                  value={typed.senderAddress}
                  disabled={locked}
                  maxLength={255}
                  placeholder="rechnung@example.ch"
                  onChange={(event) => set('senderAddress', event.target.value)}
                />
                <TextField
                  label="Anzeigename"
                  value={typed.senderName}
                  disabled={locked}
                  maxLength={100}
                  onChange={(event) => set('senderName', event.target.value)}
                />
                <TextField
                  label="Antwortadresse"
                  value={typed.replyTo}
                  disabled={locked}
                  maxLength={255}
                  hint="Leer lassen: Antworten gehen an die Absenderadresse"
                  onChange={(event) => set('replyTo', event.target.value)}
                />
              </div>
              <CheckboxField
                label="Konto aktiv"
                hint="Ausgeschaltet wird nichts mehr eingereiht und nichts mehr gesendet."
                checked={typed.active}
                disabled={locked}
                className="mt-4"
                onChange={(event) => set('active', event.target.checked)}
              />
            </Panel>

            {mayConfigure && (
              <Panel
                title="Verbindung prüfen"
                description="Meldet sich am Server an und sendet nichts"
                className="mt-4"
              >
                {/* Against what is stored: the test needs the password, and the password is
                    the one field the form cannot show. Unsaved changes are therefore not part
                    of the test, and the hint says so. */}
                <Button
                  variant="secondary"
                  onClick={() => {
                    setTested(null)
                    test.mutate()
                  }}
                  busy={test.isPending}
                  disabled={stored === null}
                >
                  <PlugZap size={15} aria-hidden />
                  Verbindung prüfen
                </Button>
                <p className="mt-2 text-[12px] text-text-secondary">
                  {stored === null
                    ? 'Erst speichern, dann prüfen.'
                    : changed
                      ? 'Geprüft wird das gespeicherte Konto, nicht die offenen Änderungen.'
                      : 'Der Test meldet sich an und legt sofort wieder auf.'}
                </p>
                <div aria-live="polite">
                  {tested !== null && (
                    <p className="mt-3 text-[13px] font-medium text-success">{tested}</p>
                  )}
                  {test.error !== null && <ErrorNotice error={test.error} />}
                </div>
              </Panel>
            )}
          </>
        )}
      </div>
    </>
  )
}

/**
 * @param value what was typed
 * @returns the trimmed text, or undefined where nothing was typed
 */
function blankToUndefined(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}
