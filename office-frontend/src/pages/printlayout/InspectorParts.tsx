import type { ReactNode, RefObject } from 'react'
import { WarningNotice } from '../../components/Notice'
import type { PrintLayoutDefinition, PrintLayoutFields } from '../../lib/types'
import type { Outcome, Snapshot } from '../../printlayout/commands'
import type { ObjectKey } from '../../printlayout/definition'
import { problemsFor, type Problem, type ProblemField } from '../../printlayout/validation'
import type { SheetHandle } from './Sheet'

/** What every part of the inspector is handed. */
export type InspectorContext = {
  definition: PrintLayoutDefinition
  catalogue: PrintLayoutFields
  problems: readonly Problem[]
  /** For the two things only the browser knows: how high something is, where a section starts. */
  sheet: RefObject<SheetHandle | null>
  /**
   * Stores a changed form as one step. Changes with the same `mergeKey` in quick succession
   * count as one — the letters of a word, the presses of an arrow key.
   */
  onChange: (definition: PrintLayoutDefinition, mergeKey?: string, announcement?: string) => void
  /** Runs a command that may also change what is selected. */
  onRun: (command: (snapshot: Snapshot) => Outcome | null) => void
  onSelect: (selection: ObjectKey[]) => void
}

/**
 * The head of the inspector: what the settings below belong to.
 *
 * @param title the name of the selected thing
 * @param actions buttons at the right, for what can be done to it as a whole
 * @param children a sentence that says what this thing is, for somebody who never met it
 */
export function InspectorHeader({
  title,
  actions,
  children,
}: {
  title: string
  actions?: ReactNode
  children?: ReactNode
}) {
  return (
    <header className="px-4 pb-4 pt-4">
      <div className="flex items-start justify-between gap-2">
        <h2 className="min-w-0 break-words text-heading font-semibold tracking-tight">{title}</h2>
        {actions !== undefined && <div className="flex shrink-0 gap-0.5">{actions}</div>}
      </div>
      {children !== undefined && (
        <p className="mt-1 text-small text-text-secondary">{children}</p>
      )}
    </header>
  )
}

/**
 * The warnings of one object, above its settings.
 *
 * @param problems the problems of the form
 * @param target the object, or `page`
 * @param except fields whose problems are already shown at the field itself
 */
export function ProblemNotes({
  problems,
  target,
  except = [],
}: {
  problems: readonly Problem[]
  target: 'page' | ObjectKey
  except?: readonly ProblemField[]
}) {
  const notes = problemsFor(problems, target).filter(
    (problem) => problem.field === undefined || !except.includes(problem.field),
  )
  if (notes.length === 0) return null
  return (
    <div className="grid grid-cols-1 gap-2 px-4 pb-4">
      {notes.map((problem) => (
        <WarningNotice key={problem.message}>{problem.message}</WarningNotice>
      ))}
    </div>
  )
}
