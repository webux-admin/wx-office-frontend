import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '../../components/Button'
import { IconButton } from '../../components/IconButton'
import { Panel } from '../../components/Panel'
import { RowOrderButtons } from '../../components/RowOrderButtons'
import {
  movePosition,
  slaValueText,
  withSlaValue,
  type SlaValueForm,
} from '../../lib/contract'
import { parseDecimal } from '../../lib/format'
import { SlaValueDialog } from './SlaValueDialog'

/**
 * The service level values of a contract: metric, agreed target, unit and text.
 *
 * <p>Shown as text only, never as a traffic light: the application measures nothing and grants
 * no credit when a target is missed (backend ADR-0136, decision 6). Nothing is sent from here;
 * the list lives in the contract form and goes with it in one request.
 */
export function ContractSlaValues({
  values,
  onChange,
  editable,
  error,
}: {
  values: SlaValueForm[]
  onChange: (values: SlaValueForm[]) => void
  editable: boolean
  /** A complaint about the list or one of its values, as the backend or the mask told it. */
  error?: string
}) {
  // The value being changed, or 'new' while one is added.
  const [editing, setEditing] = useState<number | 'new' | null>(null)

  const store = (value: SlaValueForm) => {
    onChange(withSlaValue(values, editing === 'new' ? null : editing, value))
    setEditing(null)
  }

  return (
    <Panel
      title="Service-Level"
      action={
        editable ? (
          <Button variant="secondary" onClick={() => setEditing('new')}>
            <Plus size={15} aria-hidden />
            Service-Level hinzufügen
          </Button>
        ) : undefined
      }
      padded={false}
    >
      {error && (
        <p role="alert" className="border-b border-line-subtle px-5 py-3 text-small text-danger">
          {error}
        </p>
      )}

      {values.length === 0 ? (
        <p className="px-5 py-6 text-body text-text-secondary">
          Keine Service-Level-Werte vereinbart.
        </p>
      ) : (
        <ul aria-label="Service-Level" className="divide-y divide-line-subtle">
          {values.map((value, index) => {
            const name = textOf(value)
            return (
              // Values carry no key of their own; the order is what the user arranged.
              <li key={index} className="flex items-center gap-3 px-5 py-2.5 text-body">
                <span className="min-w-0 flex-1">{name}</span>
                {editable && (
                  <span className="flex shrink-0 items-center gap-1">
                    <RowOrderButtons
                      name={name}
                      upDisabled={index === 0}
                      downDisabled={index === values.length - 1}
                      onUp={() => onChange(movePosition(values, index, -1))}
                      onDown={() => onChange(movePosition(values, index, 1))}
                    />
                    <IconButton label={`${name} bearbeiten`} onClick={() => setEditing(index)}>
                      <Pencil size={14} aria-hidden />
                    </IconButton>
                    <IconButton
                      label={`${name} entfernen`}
                      onClick={() => onChange(values.filter((_entry, at) => at !== index))}
                      tone="danger"
                    >
                      <Trash2 size={14} aria-hidden />
                    </IconButton>
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <p className="border-t border-line-subtle px-5 py-3 text-small text-text-tertiary">
        Vereinbarte Zielwerte. Gemessen wird hier nichts, und eine Unterschreitung erzeugt keine
        Gutschrift.
      </p>

      <SlaValueDialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        onSubmit={store}
        value={typeof editing === 'number' ? values[editing] : undefined}
      />
    </Panel>
  )
}

/** A value of the form as text; one the mask cannot read yet shows its target as typed. */
function textOf(value: SlaValueForm): string {
  const target = parseDecimal(value.targetValue)
  if (value.metric === '' || value.unit === '' || target === null) return value.targetValue
  return slaValueText({
    metric: value.metric,
    targetValue: target,
    unit: value.unit,
    description: value.description.trim() === '' ? null : value.description.trim(),
  })
}
