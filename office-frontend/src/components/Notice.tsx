import { AlertTriangle, Blocks, Inbox, Lock } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { MODULE_NAMES, MODULE_PATH, type LicensedModuleCode } from '../lib/modules'
import { Spinner } from './Spinner'

/**
 * The four states every screen has besides the successful one.
 *
 * <p>They live together because they are variations of the same block and are almost always
 * used in the same place. A screen that only knows the successful case is not finished.
 */

/** Placeholder while the first answer of the backend is still on its way. */
export function LoadingBlock({ label = 'Wird geladen' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2.5 py-16 text-[13px] text-text-secondary">
      <Spinner size={16} label={label} />
      {label}
    </div>
  )
}

/** What is shown where records would be, when there are none yet. */
export function EmptyState({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  /** The action that ends the emptiness, for example "Ersten Kunden erfassen". */
  children?: ReactNode
}) {
  return (
    <div className="px-6 py-16 text-center">
      <span className="mx-auto grid h-11 w-11 place-items-center rounded-[var(--radius-full)] bg-sunken text-text-tertiary">
        <Inbox size={19} aria-hidden />
      </span>
      <h2 className="mt-3.5 text-[14px] font-semibold">{title}</h2>
      {description && (
        <p className="mx-auto mt-1 max-w-[52ch] text-[13px] text-text-secondary">{description}</p>
      )}
      {children && <div className="mt-4 flex justify-center">{children}</div>}
    </div>
  )
}

/**
 * A failed request, in words.
 *
 * <p>Announced through `aria-live`, because an error that appears after a button was pressed
 * is otherwise silent for anyone not watching that spot on the screen.
 */
export function ErrorNotice({ error, children }: { error: unknown; children?: ReactNode }) {
  const message = error instanceof Error ? error.message : 'Unbekannter Fehler'

  return (
    <div
      role="alert"
      aria-live="polite"
      className="flex items-start gap-2.5 rounded-[var(--radius-md)] border border-danger/40 bg-danger/8 px-4 py-3"
    >
      <AlertTriangle size={16} className="mt-px shrink-0 text-danger" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-text-primary">{message}</p>
        {children && <div className="mt-2">{children}</div>}
      </div>
    </div>
  )
}

/**
 * Something is odd, and nothing is refused.
 *
 * <p>Deliberately not an {@link ErrorNotice}: red says «this did not happen», and a warning
 * says «this will happen, and you should know». Where both look the same, people stop reading
 * either.
 */
export function WarningNotice({ children }: { children: ReactNode }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-start gap-2.5 rounded-[var(--radius-md)] border border-warning/40 bg-warning/10 px-4 py-3"
    >
      <AlertTriangle size={16} className="mt-px shrink-0 text-warning" aria-hidden />
      <p className="min-w-0 flex-1 text-[13px] text-text-primary">{children}</p>
    </div>
  )
}

/**
 * Shown instead of a screen the user holds no permission for.
 *
 * <p>Hiding it would leave them wondering why a menu entry led nowhere. The backend refuses
 * the request either way. This only explains the refusal.
 */
export function ForbiddenNotice({ permission }: { permission: string }) {
  return (
    <div className="px-6 py-16 text-center">
      <span className="mx-auto grid h-11 w-11 place-items-center rounded-[var(--radius-full)] bg-sunken text-text-tertiary">
        <Lock size={18} aria-hidden />
      </span>
      <h2 className="mt-3.5 text-[14px] font-semibold">Keine Berechtigung</h2>
      <p className="mx-auto mt-1 max-w-[52ch] text-[13px] text-text-secondary">
        Für diesen Bereich fehlt das Recht <span className="font-mono text-[12px]">{permission}</span>.
        Eine Administratorin oder ein Administrator kann es erteilen.
      </p>
    </div>
  )
}

/**
 * Shown instead of a screen whose module the tenant does not run.
 *
 * <p><b>Not {@link ForbiddenNotice}.</b> The right says who may, the switch says whether the
 * tenant operates the module at all — and «Für diesen Bereich fehlt das Recht INVENTORY_READ»
 * would send an administrator looking for a right that was granted long ago (backend
 * ADR-0060). So this names the module and the way to its switch.
 */
export function ModuleOffNotice({ module }: { module: LicensedModuleCode }) {
  return (
    <div className="px-6 py-16 text-center">
      <span className="mx-auto grid h-11 w-11 place-items-center rounded-[var(--radius-full)] bg-sunken text-text-tertiary">
        <Blocks size={18} aria-hidden />
      </span>
      <h2 className="mt-3.5 text-[14px] font-semibold">Modul nicht eingeschaltet</h2>
      <p className="mx-auto mt-1 max-w-[52ch] text-[13px] text-text-secondary">
        {MODULE_NAMES[module]} ist für diesen Mandanten nicht eingeschaltet. Unter{' '}
        <Link to={MODULE_PATH} className="text-accent-text underline-offset-2 hover:underline">
          Systemeinstellungen → Module
        </Link>{' '}
        lässt es sich einschalten.
      </p>
    </div>
  )
}
