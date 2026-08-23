import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { ErrorNotice } from '../../components/Notice'
import { Panel } from '../../components/Panel'
import { SelectField } from '../../components/SelectField'
import { TextField } from '../../components/TextField'
import { api } from '../../lib/api'
import { formatAmount } from '../../lib/format'
import type { SalesDocument } from '../../lib/types'
import {
  MAX_PERCENT,
  discountComplaint,
  previewNet,
  toDiscountForm,
  toDiscountPayload,
  type DiscountForm,
  type DiscountMode,
} from './discountForm'

const TITLE = 'Rabatt auf den Beleg'

const DESCRIPTION =
  'Ein Nachlass auf den ganzen Beleg. Er steht als eigene Zeile über dem Total; die Positionen bleiben, wie sie vereinbart wurden. Nicht rabattfähige Produkte bleiben aussen vor.'

/** What the two forms are called, and what each of them means. */
const MODES: { value: DiscountMode; label: string }[] = [
  { value: 'NONE', label: 'Kein Rabatt' },
  { value: 'PERCENT', label: 'Prozentsatz' },
  { value: 'AMOUNT', label: 'Betrag' },
]

/**
 * The discount on a whole document.
 *
 * <p>Either a percentage or an amount, never both — the same rule a position carries. What a
 * percentage would come to is shown before it is saved, worked out on the base the backend
 * named: which positions may be reduced is its decision, not the browser's.
 *
 * @param base the document, for example `/api/tenants/1/orders/42`
 * @param document the document as the API returned it
 * @param editable whether the discount may be changed, which needs a draft and the right
 * @param readOnlyNote why it may not be changed, when the reason is the missing right
 * @param onChanged called once the backend has taken it
 */
export function DocumentDiscountPanel({
  base,
  document,
  editable,
  readOnlyNote,
  onChanged,
}: {
  base: string
  document: SalesDocument
  editable: boolean
  readOnlyNote?: string
  onChanged: () => void
}) {
  const [form, setForm] = useState<DiscountForm>(() => toDiscountForm(document))
  const [complaint, setComplaint] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: () =>
      api.put<SalesDocument>(`${base}/discount`, toDiscountPayload(form)),
    onSuccess: onChanged,
  })

  const change = (patch: Partial<DiscountForm>) => {
    setForm((current) => ({ ...current, ...patch }))
    setComplaint(null)
    save.reset()
  }

  const submit = () => {
    const problem = discountComplaint(form, document.discountableBase)
    setComplaint(problem)
    if (problem === null) save.mutate()
  }

  const preview = previewNet(form, document.discountableBase)
  const failure = complaint === null ? save.error : new Error(complaint)
  const stored = document.discountNet ?? 0

  return (
    <Panel
      title={TITLE}
      description={readOnlyNote ?? DESCRIPTION}
      action={
        editable ? (
          <Button variant="secondary" onClick={submit} busy={save.isPending}>
            Übernehmen
          </Button>
        ) : undefined
      }
    >
      <div className="grid gap-4">
        {editable ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Art"
              value={form.mode}
              onChange={(event) =>
                change({ mode: event.target.value as DiscountMode })
              }
            >
              {MODES.map((mode) => (
                <option key={mode.value} value={mode.value}>
                  {mode.label}
                </option>
              ))}
            </SelectField>

            {form.mode === 'PERCENT' && (
              <TextField
                label="Rabatt in Prozent"
                value={form.percent}
                onChange={(event) => change({ percent: event.target.value })}
                inputMode="decimal"
                numeric
                hint={
                  preview === null
                    ? `Zwischen 0 und ${MAX_PERCENT} Prozent.`
                    : `Macht ${formatAmount(preview)} ${document.currency} ohne MwSt.`
                }
              />
            )}

            {form.mode === 'AMOUNT' && (
              <TextField
                label="Rabatt als Betrag"
                value={form.amount}
                onChange={(event) => change({ amount: event.target.value })}
                inputMode="decimal"
                numeric
                hint={`Ohne MwSt, in ${document.currency}. Die MwSt fällt anteilig mit weg.`}
              />
            )}
          </div>
        ) : (
          <p className="text-[13px] text-text-secondary">
            {stored === 0
              ? 'Auf diesen Beleg wurde kein Rabatt gewährt.'
              : discountSentence(document)}
          </p>
        )}

        {editable && stored !== 0 && (
          <p className="text-[12px] text-text-tertiary">{discountSentence(document)}</p>
        )}

        {editable && document.discountableBase !== undefined && (
          <p className="text-[12px] text-text-tertiary">
            Rabattfähig sind {formatAmount(document.discountableBase)} {document.currency} ohne
            MwSt.
          </p>
        )}

        {failure !== null && failure !== undefined && <ErrorNotice error={failure} />}
      </div>
    </Panel>
  )
}

/**
 * What the stored discount comes to, in one sentence.
 *
 * <p>Both figures, because the VAT falls away with the reduction and the reader would
 * otherwise wonder where the difference in the total came from.
 */
function discountSentence(document: SalesDocument): string {
  const net = document.discountNet ?? 0
  const vat = document.discountVat ?? 0
  const named =
    document.discountPercent !== undefined
      ? `${document.discountPercent} % `
      : ''
  return (
    `Abgezogen: ${named}${formatAmount(net)} ${document.currency} ohne MwSt` +
    (vat === 0 ? '.' : `, dazu ${formatAmount(vat)} ${document.currency} MwSt.`)
  )
}
