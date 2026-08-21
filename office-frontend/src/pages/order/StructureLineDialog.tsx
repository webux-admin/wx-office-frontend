import { useState } from 'react'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { ErrorNotice } from '../../components/Notice'
import { TextField } from '../../components/TextField'
import type { DocumentLine } from '../../lib/types'
import { CodeSelect } from '../../masterdata/CodeSelect'
import { useCatalogue } from '../../masterdata/useMasterData'
import {
  carriesText,
  structureKindOptions,
  structureLineProblem,
  type StructureLine,
  type StructureLineKind,
} from './lineForm'

/** What the text field is called and what it is for, per kind. */
const TEXT: Record<StructureLineKind, { label: string; hint: string }> = {
  COMMENT: {
    label: 'Text',
    hint: 'Steht als eigene Zeile im Beleg und zählt nicht ins Total.',
  },
  SUBTOTAL: {
    label: 'Beschriftung',
    hint: 'Leer heisst «Zwischentotal».',
  },
  PAGE_BREAK: { label: 'Text', hint: '' },
}

/**
 * Adds or edits a line that shapes the document instead of charging for something.
 *
 * <p>One dialog for all three kinds, and the kind can still be changed afterwards: a comment
 * that should have been a subtotal is a correction, not a reason to delete a line and add
 * another one in the same place.
 *
 * <p>Mounted afresh per line by its caller, so the fields below start on the stored values.
 */
export function StructureLineDialog({
  tenantId,
  open,
  onClose,
  onSubmit,
  line,
  busy,
  error,
}: {
  tenantId: number
  open: boolean
  onClose: () => void
  onSubmit: (line: StructureLine) => void
  /** The line being edited; left out the dialog adds a new one. */
  line?: DocumentLine
  busy: boolean
  /** Why the last attempt was refused; the dialog stays open until one goes through. */
  error?: unknown
}) {
  const [kind, setKind] = useState<StructureLineKind>(
    line && line.kind !== 'ITEM' ? line.kind : 'COMMENT',
  )
  const [text, setText] = useState(line?.description ?? '')
  const [touched, setTouched] = useState(false)

  const options = structureKindOptions(useCatalogue(tenantId, 'line-kind'))
  const problem = structureLineProblem(kind, text)

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={line ? 'Zeile bearbeiten' : 'Zeile einfügen'}
      description="Kommentar, Zwischentotal oder Seitenwechsel."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            busy={busy}
            onClick={() => {
              setTouched(true)
              if (problem) return
              onSubmit({
                kind,
                text: carriesText(kind) ? text.trim() || undefined : undefined,
              })
            }}
          >
            {line ? 'Übernehmen' : 'Einfügen'}
          </Button>
        </>
      }
    >
      {error !== null && error !== undefined && (
        <div className="mb-4">
          <ErrorNotice error={error} />
        </div>
      )}

      <div className="grid gap-4">
        <CodeSelect
          label="Zeilenart"
          entries={options}
          value={kind}
          onChange={(code) => setKind(code as StructureLineKind)}
        />

        {carriesText(kind) ? (
          <TextField
            label={TEXT[kind].label}
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={500}
            invalid={touched && problem !== undefined}
            hint={touched && problem ? problem : TEXT[kind].hint}
          />
        ) : (
          <p className="text-[13px] text-text-secondary">
            Ein Seitenwechsel trägt keinen Text. Er beginnt im Beleg eine neue Seite.
          </p>
        )}
      </div>
    </Dialog>
  )
}
