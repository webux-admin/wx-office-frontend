import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { CheckboxField } from '../../components/CheckboxField'
import { Dialog } from '../../components/Dialog'
import { ErrorNotice } from '../../components/Notice'
import { TextField } from '../../components/TextField'
import {
  createEntryTemplate,
  entryTemplatesKey,
  updateEntryTemplate,
  type EntryDraftRow,
} from '../../lib/accounting'
import { formatAmount } from '../../lib/format'
import type { Account, EntryTemplate, TaxCode } from '../../lib/types'
import { payloadOf, templateRequestOf, type TemplateHeader } from './entryTemplateForm'

/**
 * «Als Vorlage speichern …»: what stands in the grid becomes a posting template.
 *
 * <p><b>The dialog asks for no order, and that is decided rather than forgotten.</b> A new
 * template goes to the end of the menu. The order belongs to the tenant — what they moved to
 * the top stays there — and because the left half of the split button fires the **first**
 * template, inserting at the top would rehang the main button on every save. Somebody presses
 * the button they know and gets a different entry; that is the kind of surprise that costs a
 * bookkeeper their trust in the mask, so the dialog says where the template will land.
 *
 * <p><b>An existing name asks once and then sends a `PUT`, never a second `POST`.</b> That is
 * at the same time the only way to change the **lines and the two header fields** of a
 * template: apply it, correct the grid and the text, save under the same name. Everything the
 * mask holds goes out — only the place in the menu and the version stay, so the template keeps
 * its place and whoever changed it in another tab in the meantime gets the 409 instead of a
 * silent overwrite. <b>With the question the description of the template on file appears in the
 * field</b>, because that one the mask does not carry: an empty field would go out as «no
 * description» and empty the hint line in the menu on every overwrite.
 *
 * <p><b>A name is taken only where it is taken letter for letter.</b> The server compares that
 * way, so «miete» beside «Miete» is a second template here as it is there.
 */
export function SaveTemplateDialog({
  tenantId,
  rows,
  entryDescription,
  documentReference,
  accounts,
  taxCodes,
  templates,
  onClose,
}: {
  tenantId: number
  /** The rows as they stand in the grid. */
  rows: readonly EntryDraftRow[]
  /** The entry text of the mask, offered as what the template prefills. */
  entryDescription: string
  documentReference: string
  accounts: readonly Account[]
  taxCodes: readonly TaxCode[]
  /** What the tenant already keeps, to recognise a name that is taken. */
  templates: readonly EntryTemplate[]
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const nameField = useRef<HTMLInputElement>(null)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [withAmounts, setWithAmounts] = useState(false)
  const [complaint, setComplaint] = useState<string | null>(null)
  const [overwriting, setOverwriting] = useState<EntryTemplate | null>(null)

  const header: TemplateHeader = {
    name,
    description,
    entryDescription,
    documentReference,
    accounts,
    taxCodes,
  }
  const payload = payloadOf(rows, header, withAmounts)
  const amounts = payloadOf(rows, header, true).lines
    .map((line) => line.amount)
    .filter((amount): amount is number => amount !== null && amount !== undefined)

  const save = useMutation({
    mutationFn: (existing: EntryTemplate | null) =>
      existing === null
        ? createEntryTemplate(tenantId, payload)
        : updateEntryTemplate(
            tenantId,
            existing.id,
            // The whole payload goes over the old template, header fields included: overwriting
            // is the one way to change a template, and somebody who corrects the text field and
            // saves under the same name means that text. Only the place and the version stay —
            // the template stays where the tenant put it, and a version somebody else has moved
            // on answers 409.
            templateRequestOf(existing, payload),
          ),
    // `onSettled` and not `onSuccess`, because the refusal is the case that needs the fresh
    // list. The version sent on «Überschreiben» comes off the `templates` prop, and that list is
    // cached; a 409 says somebody else has moved the template on, so re-sending the same version
    // could only fail the same way — for ever. Refetching after a failure too is what lets the
    // next attempt carry the version the server now holds. `ManageTemplatesDialog` settles its
    // rename, reorder and delete the same way.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: entryTemplatesKey(tenantId) })
    },
    onSuccess: () => onClose(),
  })

  function submit() {
    if (save.isPending) return
    const typed = name.trim()
    if (typed === '') {
      setComplaint('Die Vorlage braucht einen Namen.')
      return
    }
    if (payload.lines.length === 0) {
      setComplaint('Im Raster steht keine Zeile mit einem Konto. Es gibt nichts zu speichern.')
      return
    }
    setComplaint(null)
    // Compared exactly, the way the server compares: `PostingManagement.requireFreeName` uses
    // `equals` behind a `UNIQUE (tenant_id, name)`. Ignoring case here would offer to overwrite
    // «Miete» when «miete» is typed — and confirming that would rename the existing template to
    // lower case and replace its lines, instead of adding the second one the server accepts.
    const taken = templates.find((candidate) => candidate.name === typed)
    if (taken !== undefined && overwriting === null) {
      // The description of the template on file goes into the field, the way «Vorlagen
      // verwalten» fills it before a rename. The whole payload goes over the old template on
      // «Überschreiben», and this dialog — unlike the entry text and the voucher — starts with
      // an empty description field: an untouched field would send `description: null` and quietly
      // empty the hint line under the name in the menu. Now it stands there, readable and
      // changeable, and clearing it is a decision somebody sees themselves making.
      //
      // A description that was typed before the question is left alone: whoever wrote one means
      // it, and it goes out instead of the old one.
      if (description.trim() === '') setDescription(taken.description ?? '')
      setOverwriting(taken)
      return
    }
    save.mutate(taken ?? null)
  }

  return (
    <Dialog
      open
      title="Als Vorlage speichern"
      onClose={onClose}
      onSubmit={submit}
      initialFocus={nameField}
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={submit} busy={save.isPending} shortcut>
            {overwriting === null ? 'Speichern' : 'Überschreiben'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <TextField
          ref={nameField}
          label="Name"
          value={name}
          maxLength={60}
          onChange={(event) => {
            setName(event.target.value)
            // A changed name is a different template again: the question has to be asked anew.
            setOverwriting(null)
          }}
          invalid={complaint !== null && name.trim() === ''}
        />
        <TextField
          label="Beschreibung"
          value={description}
          maxLength={200}
          hint="Steht als Hinweiszeile unter dem Namen im Menü."
          onChange={(event) => setDescription(event.target.value)}
        />

        <CheckboxField
          label="Beträge mitspeichern"
          checked={withAmounts}
          onChange={(event) => setWithAmounts(event.target.checked)}
          hint={
            amounts.length === 0
              ? 'Ohne Häkchen bleiben die Betragsfelder beim Anwenden leer.'
              : `Ohne Häkchen bleiben die Betragsfelder beim Anwenden leer. Mit Häkchen `
                + `werden ${formatAmount(amounts[0])} vorgeschlagen — prüfen Sie sie jedes Mal.`
          }
        />

        <div className="grid gap-1 text-[13px] text-text-secondary">
          <p>{summaryOf(payload.lines)}</p>
          <p>Das Datum gehört nicht zur Vorlage.</p>
          {/* The sentence follows the button, because on «Überschreiben» the opposite is true:
              the request keeps the old sortOrder, so the template stays where the tenant put
              it. Left unconditional, this line would state the reverse of what the button
              beneath it is about to do, at the very moment somebody is deciding. */}
          <p>
            {overwriting === null
              ? 'Die Vorlage kommt zuunterst ins Menü.'
              : 'Die Vorlage behält ihren Platz im Menü.'}
          </p>
        </div>

        {overwriting !== null && (
          <p className="text-[13px] text-text-primary">
            Eine Vorlage «{overwriting.name}» gibt es schon. Überschreiben?
          </p>
        )}
        {complaint !== null && (
          <p aria-live="polite" className="text-[13px] text-danger">
            {complaint}
          </p>
        )}
        {save.error !== null && <ErrorNotice error={save.error} />}
      </div>
    </Dialog>
  )
}

/** «Gespeichert werden 2 Zeilen: 6000 im Soll, 1020 im Haben.» */
function summaryOf(lines: readonly { accountNumber: string; side: string }[]): string {
  if (lines.length === 0) return 'Gespeichert wird keine Zeile.'
  const listed = lines
    .map((line) => `${line.accountNumber} im ${line.side === 'DEBIT' ? 'Soll' : 'Haben'}`)
    .join(', ')
  return `Gespeichert ${lines.length === 1 ? 'wird 1 Zeile' : `werden ${lines.length} Zeilen`}`
    + `: ${listed}.`
}
