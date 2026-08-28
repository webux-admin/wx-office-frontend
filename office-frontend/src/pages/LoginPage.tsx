import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  ClipboardList,
  Eye,
  EyeOff,
  Lock,
  Package,
  ShieldCheck,
  Tags,
  User,
  Users,
} from 'lucide-react'
import { Button } from '../components/Button'
import { TextField } from '../components/TextField'
import { BrandMark } from '../components/BrandMark'
import { ApiError, UnauthorizedError } from '../lib/api'
import { useAuth } from '../auth/useAuth'
import { CODE_LENGTH, RECOVERY_CODE_LENGTH, RESEND_SECONDS } from '../lib/twoFactor'

/**
 * Modules shown as drifting tiles on the dark panel. Colours come from the design tokens.
 *
 * <p>Only modules that exist. A panel advertising Rechnungen while the application has no
 * invoice screen would be a promise the first click breaks.
 */
const PANEL_TILES = [
  { icon: Users, label: 'Kunden und Lieferanten', color: 'bg-module-kunden' },
  { icon: ClipboardList, label: 'Aufträge', color: 'bg-module-offerten' },
  { icon: Package, label: 'Produkte', color: 'bg-module-produkte' },
  { icon: Tags, label: 'Preisgruppen', color: 'bg-module-buchhaltung' },
]

/**
 * Accounts of the seeded demo database.
 *
 * <p>Listed on the form on purpose: this build talks to a demo database that anyone with
 * the repository can recreate, so the credentials are not a secret. They must disappear
 * before the first real installation, as the note rendered next to them says.
 */
const DEMO_ACCOUNTS = [
  { username: 'admin', password: 'webux-admin-2026', role: 'Superuser' },
  { username: 'mmuster', password: 'webux-demo-2026', role: 'Administrator' },
  { username: 'sbucher', password: 'webux-demo-2026', role: 'Buchhaltung' },
  { username: 'lweber', password: 'webux-demo-2026', role: 'Verkauf' },
]

/**
 * Turns a failed sign-in into a sentence that helps without revealing which names exist.
 *
 * <p>The backend answers 401 for a wrong password, an unknown name, a deactivated account
 * and a locked one alike. That is deliberate, so the endpoint does not leak which accounts
 * exist. The message therefore covers all four at once instead of guessing.
 */
function messageFor(error: unknown): string {
  if (error instanceof UnauthorizedError) {
    return 'Benutzername oder Passwort stimmt nicht. Nach fünf Fehlversuchen wird das Konto für 15 Minuten gesperrt.'
  }
  if (error instanceof ApiError) return error.message
  return 'Das Backend ist nicht erreichbar. Läuft es auf Port 8082?'
}

/**
 * Sign-in screen. The only route reachable without a session.
 *
 * <p>A finished sign-in always ends on the dashboard, never on the screen that sent the user
 * here. After a break long enough for the session to lapse, the overview is the honest
 * starting point: the numbers on the old screen would be stale anyway.
 */
export function LoginPage() {
  const { user, signIn } = useAuth()
  const navigate = useNavigate()
  const reduceMotion = useReducedMotion()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Counts submissions so a repeated failure shakes the card again. */
  const [attempt, setAttempt] = useState(0)
  /** The second step, `null` while the password is still the question. */
  const [challenge, setChallenge] = useState<SecondFactorChallenge | null>(null)
  const usernameRef = useRef<HTMLInputElement>(null)

  useEffect(() => usernameRef.current?.focus(), [])

  if (user) return <Navigate to="/" replace />

  function detectCapsLock(event: KeyboardEvent<HTMLInputElement>) {
    setCapsLock(event.getModifierState('CapsLock'))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setError(null)
    setBusy(true)
    try {
      const result = await signIn(username.trim(), password)
      if (result.kind === 'secondFactor') {
        // The password is right and the session is not a session yet. The password is dropped
        // here: it has done its work, and the second step does not carry it.
        setChallenge({ method: result.method, methods: result.methods })
        setPassword('')
        return
      }
      void navigate('/', { replace: true })
    } catch (failure) {
      setError(messageFor(failure))
      setAttempt((count) => count + 1)
      setPassword('')
    } finally {
      setBusy(false)
    }
  }

  /**
   * Back to the password, with nothing of the half finished attempt left over.
   *
   * <p>Not «back to a half session»: the pending state on the server dies with the next login,
   * and the mask says as much rather than leaving somebody guessing what state they are in.
   */
  function cancelSecondFactor() {
    setChallenge(null)
    setPassword('')
    setError(null)
    window.setTimeout(() => usernameRef.current?.focus(), 0)
  }

  function useDemoAccount(account: (typeof DEMO_ACCOUNTS)[number]) {
    setUsername(account.username)
    setPassword(account.password)
    setError(null)
  }

  return (
    <div className="flex min-h-screen bg-canvas">
      <BrandPanel reduceMotion={Boolean(reduceMotion)} />

      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-[400px]"
        >
          {/* The mark repeats here for the narrow layout, where the dark panel is hidden. */}
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <BrandMark size={30} className="text-on-accent" />
            <span className="text-[16px] font-semibold tracking-tight">webux ERP</span>
          </div>

          {challenge !== null ? (
            <SecondFactorStep
              challenge={challenge}
              onDone={() => void navigate('/', { replace: true })}
              onCancel={cancelSecondFactor}
            />
          ) : (
            <>
          <h1 className="text-[24px] font-semibold leading-8 tracking-tight">Anmelden</h1>
          <p className="mt-1.5 text-text-secondary">
            Melde dich an, um mit deinen Mandanten zu arbeiten.
          </p>

          <motion.form
            onSubmit={submit}
            noValidate
            key={attempt}
            animate={error ? 'wrong' : 'idle'}
            variants={{
              idle: { x: 0 },
              wrong: reduceMotion ? { x: 0 } : { x: [0, -7, 6, -4, 0] },
            }}
            transition={{ duration: 0.32 }}
            className="mt-7"
          >
            <AnimatePresence initial={false}>
              {error && (
                <motion.div
                  role="alert"
                  aria-live="assertive"
                  initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                  animate={{ opacity: 1, height: 'auto', marginBottom: 20 }}
                  exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden"
                >
                  <div className="flex gap-2.5 rounded-[var(--radius-md)] border border-danger/25 bg-danger/6 p-3 text-[12px] leading-[17px] text-danger">
                    <AlertTriangle size={15} className="mt-px shrink-0" aria-hidden />
                    <span>{error}</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="grid gap-4">
              <TextField
                ref={usernameRef}
                label="Benutzername"
                name="username"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
                value={username}
                invalid={Boolean(error)}
                onChange={(event) => setUsername(event.target.value)}
                icon={<User size={15} />}
                placeholder="mmuster"
              />

              <TextField
                label="Passwort"
                name="password"
                type={revealed ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                invalid={Boolean(error)}
                onChange={(event) => setPassword(event.target.value)}
                onKeyUp={detectCapsLock}
                onKeyDown={detectCapsLock}
                icon={<Lock size={15} />}
                hint={
                  <AnimatePresence>
                    {capsLock && (
                      <motion.span
                        initial={{ opacity: 0, y: -3 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="inline-flex items-center gap-1.5"
                      >
                        <AlertTriangle size={13} aria-hidden />
                        Feststelltaste ist aktiv
                      </motion.span>
                    )}
                  </AnimatePresence>
                }
                action={
                  <button
                    type="button"
                    onClick={() => setRevealed((shown) => !shown)}
                    aria-label={revealed ? 'Passwort verbergen' : 'Passwort anzeigen'}
                    className="grid h-8 w-8 place-items-center rounded-[var(--radius-sm)] text-text-tertiary transition-colors hover:bg-sunken hover:text-text-secondary"
                  >
                    {revealed ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                }
              />
            </div>

            <Button
              type="submit"
              block
              busy={busy}
              className="mt-6 group"
              disabled={!username.trim() || !password}
            >
              Anmelden
              <ArrowRight
                size={15}
                aria-hidden
                className="transition-transform duration-200 group-hover:translate-x-0.5"
              />
            </Button>
          </motion.form>

          <DemoAccounts onPick={useDemoAccount} />
            </>
          )}
        </motion.div>
      </main>
    </div>
  )
}

/** What the first step answered: which methods this account can prove itself with. */
type SecondFactorChallenge = { method: string; methods: string[] }

/**
 * The second step of the login.
 *
 * <p><b>On this page, not on a route of its own.</b> A route that only works while a pending
 * state sits in the session is a route somebody bookmarks and then lands on with nothing to
 * do (ADR-0022).
 *
 * <p>Most of what is here is not the code field but the ways beside it: the lost telephone,
 * the code that does not arrive, the abandoned attempt. This is the one screen in the
 * application where a mistake locks somebody out.
 */
function SecondFactorStep({
  challenge,
  onDone,
  onCancel,
}: {
  challenge: SecondFactorChallenge
  onDone: () => void
  onCancel: () => void
}) {
  const { completeSecondFactor, sendSecondFactorCode } = useAuth()

  const [code, setCode] = useState('')
  const [recovery, setRecovery] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  /** Seconds until another code may be asked for. Counted here, see below. */
  const [cooldown, setCooldown] = useState(0)
  const codeRef = useRef<HTMLInputElement>(null)
  /** Guards the auto-submit, so six digits are sent once and not on every render. */
  const submitted = useRef('')

  const offersMail = challenge.methods.includes('EMAIL')
  const expected = recovery ? RECOVERY_CODE_LENGTH : CODE_LENGTH

  useEffect(() => codeRef.current?.focus(), [recovery])

  // The backend refuses a second code within a minute and answers 204 all the same — it says
  // nothing, on purpose (backend ADR-0089). Counting here is the only way somebody learns why
  // pressing again does nothing.
  useEffect(() => {
    if (cooldown <= 0) return
    const timer = window.setTimeout(() => setCooldown((left) => left - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [cooldown])

  const send = useCallback(async () => {
    setError(null)
    setSent(true)
    setCooldown(RESEND_SECONDS)
    await sendSecondFactorCode()
  }, [sendSecondFactorCode])

  const finish = useCallback(
    async (typed: string) => {
      setBusy(true)
      setError(null)
      try {
        await completeSecondFactor(typed)
        onDone()
      } catch (failure) {
        setError(secondFactorMessage(failure))
        setCode('')
        submitted.current = ''
      } finally {
        setBusy(false)
      }
    },
    [completeSecondFactor, onDone],
  )

  /**
   * Sends as soon as the code is complete.
   *
   * <p>Whoever has just typed a six digit number off a telephone does not want to look for a
   * button afterwards. The guard is the point: without it every keystroke past the sixth would
   * fire another request.
   */
  function typeCode(value: string) {
    const cleaned = recovery
      ? value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, RECOVERY_CODE_LENGTH)
      : value.replace(/\D/g, '').slice(0, CODE_LENGTH)
    setCode(cleaned)
    if (cleaned.length === expected && !busy && submitted.current !== cleaned) {
      submitted.current = cleaned
      void finish(cleaned)
    }
  }

  return (
    <>
      <h1 className="text-[24px] font-semibold leading-8 tracking-tight">Bestätigen</h1>
      <p className="mt-1.5 text-text-secondary">
        {recovery
          ? 'Geben Sie einen Ihrer Wiederherstellungscodes ein.'
          : challenge.method === 'EMAIL'
            ? 'Wir senden einen Code an die hinterlegte E-Mail-Adresse.'
            : 'Geben Sie den Code aus Ihrer Authenticator-App ein.'}
      </p>

      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (code.length === expected && !busy) void finish(code)
        }}
        noValidate
        className="mt-7"
      >
        <div aria-live="assertive">
          {error !== null && (
            <div className="mb-5 flex gap-2.5 rounded-[var(--radius-md)] border border-danger/25 bg-danger/6 p-3 text-[12px] leading-[17px] text-danger">
              <AlertTriangle size={15} className="mt-px shrink-0" aria-hidden />
              <span>{error}</span>
            </div>
          )}
        </div>

        <TextField
          ref={codeRef}
          label={recovery ? 'Wiederherstellungscode' : 'Code'}
          value={code}
          onChange={(event) => typeCode(event.target.value)}
          inputMode={recovery ? 'text' : 'numeric'}
          // The browser and the telephone offer the code out of the mail with this.
          autoComplete={recovery ? 'off' : 'one-time-code'}
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={expected}
          invalid={Boolean(error)}
          icon={<ShieldCheck size={15} />}
          hint={
            recovery
              ? 'Zehn Zeichen von Ihrer ausgedruckten Liste. Jeder Code gilt einmal.'
              : 'Sechs Ziffern.'
          }
        />

        {!recovery && offersMail && (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => void send()}
              disabled={cooldown > 0}
              className="text-[13px] text-accent-text underline-offset-2 hover:underline disabled:text-text-tertiary disabled:no-underline"
            >
              {sent ? 'Neuen Code senden' : 'Code per E-Mail senden'}
            </button>
            <p aria-live="polite" className="mt-1 text-[12px] text-text-tertiary">
              {cooldown > 0
                ? `Ein neuer Code ist in ${cooldown} Sekunden möglich.`
                : sent
                  ? 'Der Code wurde an die hinterlegte Adresse geschickt. Er gilt zehn Minuten.'
                  : ''}
            </p>
          </div>
        )}

        <Button
          type="submit"
          block
          busy={busy}
          className="mt-6"
          disabled={code.length !== expected}
        >
          Anmelden
        </Button>
      </form>

      <div className="mt-5 flex flex-col gap-2 text-[13px]">
        {/* Not a hidden way out. This is the one somebody needs at seven in the morning with
            a new telephone in their hand. */}
        <button
          type="button"
          onClick={() => {
            setRecovery((on) => !on)
            setCode('')
            setError(null)
            submitted.current = ''
          }}
          className="self-start text-accent-text underline-offset-2 hover:underline"
        >
          {recovery
            ? 'Doch einen Code aus der App eingeben'
            : 'Ich habe keinen Zugriff auf meine App'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="self-start text-text-tertiary underline-offset-2 hover:underline"
        >
          Abbrechen und neu anmelden
        </button>
      </div>
    </>
  )
}

/**
 * Turns a failed second step into one of three sentences.
 *
 * <p>Three, because they call for three different things: try again, start over, start over.
 * One message for all of them would leave somebody retyping a code into a form that has
 * already given up.
 */
function secondFactorMessage(error: unknown): string {
  if (error instanceof UnauthorizedError || (error instanceof ApiError && error.status === 401)) {
    return 'Der Code stimmt nicht. Nach fünf Versuchen müssen Sie sich neu anmelden.'
  }
  if (error instanceof ApiError) return error.message
  return 'Das Backend ist nicht erreichbar. Läuft es auf Port 8082?'
}

/** The dark half: identity, claim, and the module tiles drifting behind them. */
function BrandPanel({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <aside className="relative hidden w-[46%] max-w-[620px] shrink-0 overflow-hidden border-r border-ink-border bg-ink text-text-inverse lg:flex lg:flex-col">
      <DriftingTiles reduceMotion={reduceMotion} />

      <div className="relative z-10 flex h-full flex-col justify-between p-12">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="flex items-center gap-2.5"
        >
          <BrandMark size={30} className="text-on-accent" />
          <span className="text-[16px] font-semibold tracking-tight">webux ERP</span>
        </motion.div>

        <div>
          <motion.h2
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
            className="max-w-[15ch] text-[34px] font-semibold leading-[42px] tracking-[-0.5px]"
          >
            Stammdaten und Aufträge, an einem Ort.
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="mt-4 max-w-[42ch] text-[14px] leading-[22px] text-text-inverse-muted"
          >
            Mandantenfähig, mit lückenlosen Belegnummern und zeitversionierten MwSt-Sätzen
            nach Schweizer Vorgaben.
          </motion.p>

          <ul className="mt-8 flex flex-wrap gap-2">
            {PANEL_TILES.map((tile, index) => (
              <motion.li
                key={tile.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.4,
                  delay: 0.24 + index * 0.06,
                  ease: [0.16, 1, 0.3, 1],
                }}
                className="flex items-center gap-2 rounded-[var(--radius-full)] border border-ink-border bg-ink-hover px-3 py-1.5 text-[12px] text-text-inverse-muted"
              >
                <tile.icon size={13} aria-hidden />
                {tile.label}
              </motion.li>
            ))}
          </ul>
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="text-[12px] text-text-inverse-muted"
        >
          Für den Schweizer Rechtsraum gebaut · OR, MWSTG, revDSG
        </motion.p>
      </div>
    </aside>
  )
}

/**
 * Ambient background: module coloured tiles floating slowly behind the panel content.
 *
 * <p>Only `transform` and `opacity` are animated, so the whole thing stays on the compositor
 * and costs nothing while somebody types their password. It stops entirely for anyone who
 * asked for reduced motion.
 */
function DriftingTiles({ reduceMotion }: { reduceMotion: boolean }) {
  const glows = [
    { top: '-6%', left: '52%', size: 380, color: 'bg-module-offerten', delay: 0 },
    { top: '22%', left: '-12%', size: 320, color: 'bg-module-kunden', delay: 1.4 },
    { top: '52%', left: '58%', size: 420, color: 'bg-module-produkte', delay: 0.7 },
    { top: '74%', left: '4%', size: 340, color: 'bg-module-lieferscheine', delay: 2.1 },
  ]

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {glows.map((glow) => (
        <motion.span
          key={`${glow.top}-${glow.left}`}
          className={`absolute rounded-full blur-[110px] ${glow.color}`}
          style={{ top: glow.top, left: glow.left, width: glow.size, height: glow.size }}
          initial={{ opacity: 0.3, scale: 0.95 }}
          animate={
            reduceMotion
              ? { opacity: 0.3 }
              : { opacity: [0.24, 0.42, 0.24], y: [0, -26, 0], scale: [0.95, 1.05, 0.95] }
          }
          transition={{
            duration: 16,
            delay: glow.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
      {/* Keeps the text readable no matter where a glow drifts. */}
      <div className="absolute inset-0 bg-gradient-to-br from-ink/65 via-ink/50 to-ink/85" />
    </div>
  )
}

/** Credentials of the demo database, one click away. */
function DemoAccounts({
  onPick,
}: {
  onPick: (account: (typeof DEMO_ACCOUNTS)[number]) => void
}) {
  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, delay: 0.35 }}
      className="mt-9 rounded-[var(--radius-lg)] border border-line-subtle bg-surface p-4"
    >
      <h2 className="text-overline text-text-tertiary">Demo-Konten</h2>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {DEMO_ACCOUNTS.map((account) => (
          <button
            key={account.username}
            type="button"
            onClick={() => onPick(account)}
            className="group flex items-center gap-2 rounded-[var(--radius-full)] border border-line-subtle px-2.5 py-1 text-[12px] transition-colors hover:border-accent-text hover:bg-accent/8"
          >
            <span className="font-mono text-text-primary">{account.username}</span>
            <span className="text-text-tertiary group-hover:text-accent-text">{account.role}</span>
          </button>
        ))}
      </div>
      <p className="mt-3 text-[11px] leading-[15px] text-text-tertiary">
        Beispieldaten aus <span className="font-mono">npm run seed</span>. Vor der ersten
        echten Installation entfernen.
      </p>
    </motion.section>
  )
}
