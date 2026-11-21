import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { DialogCancelButton } from '../../components/DialogCancelButton'
import { ErrorNotice } from '../../components/Notice'
import { SelectField } from '../../components/SelectField'
import { TextField } from '../../components/TextField'
import { useFieldErrors } from '../../components/useFieldErrors'
import { api } from '../../lib/api'
import {
  CONTRACT_END_REASON_LABELS,
  contractStepUrl,
  emptyEndingForm,
  endingComplaints,
  isContractEndReason,
  noticePeriodText,
  type EndingForm,
} from '../../lib/contract'
import { isToldByFields } from '../../lib/fieldErrors'
import type { Contract, ContractEndRequest } from '../../lib/types'

/** The fields of the dialog that can show a message of their own. */
const SHOWN_FIELDS = ['endedOn', 'reason'] as const

/**
 * Ends an active contract: the last day it runs and a reason from the catalogue, no free text
 * (backend ADR-0145).
 *
 * <p>The notice period is shown, not enforced: an extraordinary notice or a mutual agreement
 * need not keep it, and the backend does not check it either.
 */
export function EndContractDialog({
  tenantId,
  contract,
  open,
  onClose,
  onEnded,
}: {
  tenantId: number
  contract: Contract
  open: boolean
  onClose: () => void
  onEnded: (ended: Contract) => void
}) {
  const [form, setForm] = useState<EndingForm>(() => emptyEndingForm(contract))

  const end = useMutation({
    mutationFn: () => {
      const body: ContractEndRequest = {
        endedOn: form.endedOn,
        // Free of complaints by now, so the reason is one of the catalogue.
        reason: form.reason === '' ? 'REPLACED' : form.reason,
      }
      return api.post<Contract>(contractStepUrl(tenantId, contract.id, 'end'), body)
    },
    onSuccess: (ended) => onEnded(ended),
  })

  const fields = useFieldErrors(() => endingComplaints(contract, form), end.error)
  const submit = () => {
    if (fields.check()) end.mutate()
  }
  const close = () => {
    setForm(emptyEndingForm(contract))
    fields.reset()
    end.reset()
    onClose()
  }
  const told = end.error !== null && isToldByFields(end.error, SHOWN_FIELDS)

  return (
    <Dialog
      open={open}
      onClose={close}
      title={`${contract.contractNumber} beenden`}
      description="Der Vertrag bleibt mit allen Versionen lesbar. Danach lässt sich das Vereinbarte nicht mehr ändern, nur noch die Notiz."
      onSubmit={end.isPending ? undefined : submit}
      footer={
        <>
          <DialogCancelButton />
          <Button onClick={submit} busy={end.isPending}>
            Beenden
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {end.error !== null && !told && <ErrorNotice error={end.error} />}
        <TextField
          label="Letzter Vertragstag"
          type="date"
          value={form.endedOn}
          onChange={(event) => setForm((current) => ({ ...current, endedOn: event.target.value }))}
          required
          error={fields.errors.endedOn}
          tooltip="Bis und mit diesem Tag läuft der Vertrag. Der Tag darf in der Vergangenheit oder in der Zukunft liegen."
        />
        <SelectField
          label="Grund"
          value={form.reason}
          onChange={(event) => {
            const value = event.target.value
            setForm((current) => ({ ...current, reason: isContractEndReason(value) ? value : '' }))
          }}
          required
          error={fields.errors.reason}
          tooltip="Ein Grund aus der Liste, kein Freitext: er sagt, wie der Vertrag endet, nicht was jemand vom Kunden hält."
        >
          <option value="">Bitte wählen</option>
          {Object.entries(CONTRACT_END_REASON_LABELS).map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </SelectField>
        <p className="text-small text-text-secondary">
          Kündigungsfrist laut Vertrag: {noticePeriodText(contract.noticePeriodAmount, contract.noticePeriodUnit)}.
          Ob sie eingehalten ist, prüft das System nicht.
        </p>
      </div>
    </Dialog>
  )
}
