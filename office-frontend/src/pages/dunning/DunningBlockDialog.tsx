import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { ErrorNotice } from '../../components/Notice'
import { SelectField } from '../../components/SelectField'
import { TextAreaField } from '../../components/TextAreaField'
import { TextField } from '../../components/TextField'
import { setDunningBlock } from '../../lib/dunning'
import { useMasterDataList } from '../../masterdata/useMasterData'

/**
 * Sets a dunning stop, on a customer or on one invoice.
 *
 * <p>The reason comes from a catalogue and is compulsory. A free text field would invite a
 * credit judgement about an identifiable person — «zahlt nie, Konkurs droht» — and under revDSG
 * that needs a retention period and falls under the right of access. The <b>fact</b> goes in
 * the catalogue value; the note beside it is for the case that fits no drawer, and the mask
 * says so (backend ADR-0099).
 *
 * @param partnerId  the customer to stop, when the dialog was opened at a customer
 * @param documentId the invoice to stop, when it was opened at an invoice
 * @param subject    what is being stopped, for the heading
 */
export function DunningBlockDialog({
  tenantId,
  partnerId,
  documentId,
  subject,
  onClose,
}: {
  tenantId: number
  partnerId?: number
  documentId?: number
  subject: string
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const reasons = useMasterDataList(tenantId, 'dunning-block-reasons')
  const options = reasons.data ?? []

  const [reasonId, setReasonId] = useState('')
  const [note, setNote] = useState('')
  const [validUntil, setValidUntil] = useState('')

  const save = useMutation({
    mutationFn: () =>
      setDunningBlock(tenantId, {
        partnerId,
        documentId,
        reasonId: Number(reasonId),
        note: note.trim() === '' ? null : note.trim(),
        validUntil: validUntil === '' ? null : validUntil,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['dunning-blocks'] })
      void queryClient.invalidateQueries({ queryKey: ['dunning-worklist'] })
      onClose()
    },
  })

  return (
    <Dialog
      open
      onClose={onClose}
      onSubmit={() => save.mutate()}
      title={`Mahnstopp für ${subject}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={() => save.mutate()} disabled={reasonId === '' || save.isPending}>
            {save.isPending ? 'Wird gesetzt ...' : 'Mahnstopp setzen'}
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <p className="text-[13px] text-text-secondary">
          {documentId === undefined
            ? 'Solange der Stopp gilt, wird keine Rechnung dieses Kunden gemahnt.'
            : 'Solange der Stopp gilt, wird diese Rechnung nicht gemahnt. Die übrigen Rechnungen des Kunden laufen weiter.'}
        </p>

        <SelectField
          label="Grund"
          value={reasonId}
          onChange={(event) => setReasonId(event.target.value)}
          hint="Der Sachverhalt, aus dem Katalog. Zu pflegen unter Systemeinstellungen → Mahnstopp-Gründe."
          autoFocus
        >
          <option value="">Bitte wählen</option>
          {options.map((reason) => (
            <option key={reason.id} value={reason.id}>
              {reason.name}
            </option>
          ))}
        </SelectField>

        <TextAreaField
          label="Bemerkung"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={3}
          placeholder="Ware beanstandet, Prüfung läuft"
          hint="Der Einzelfall, der in keine Schublade passt. Ein Sachverhalt, kein Urteil über den Kunden."
        />

        <TextField
          label="Gültig bis"
          type="date"
          value={validUntil}
          onChange={(event) => setValidUntil(event.target.value)}
          hint="Leer heisst: bis jemand den Stopp aufhebt. Für eine Zahlungsvereinbarung reicht ein Datum."
        />

        {save.error !== null && <ErrorNotice error={save.error} />}
      </div>
    </Dialog>
  )
}
