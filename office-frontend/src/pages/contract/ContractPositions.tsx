import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Badge } from '../../components/Badge'
import { Button } from '../../components/Button'
import { IconButton } from '../../components/IconButton'
import { Panel } from '../../components/Panel'
import { RowOrderButtons } from '../../components/RowOrderButtons'
import {
  BILLING_INTERVAL_LABELS,
  BILLING_INTERVAL_PER,
  movePosition,
  withPosition,
  type PositionForm,
} from '../../lib/contract'
import { formatAmount, formatQuantity, parseDecimal } from '../../lib/format'
import type { ContractTotal } from '../../lib/types'
import { PositionDialog } from './PositionDialog'

/**
 * The positions of a contract: what is billed, how often, at which agreed price.
 *
 * <p>Nothing is sent from here. The list lives in the contract form and goes with it in one
 * request. Amounts come from the backend: a position changed in this mask shows none until the
 * contract is saved, because the mask does not work one out of its own.
 */
export function ContractPositions({
  tenantId,
  positions,
  totals,
  onChange,
  editable,
  partnerId,
  dateOfSupply,
  mayReadProducts,
  error,
}: {
  tenantId: number
  positions: PositionForm[]
  /** The sums the backend worked out for the stored positions; `null` once they changed. */
  totals: ContractTotal[] | null
  onChange: (positions: PositionForm[]) => void
  editable: boolean
  partnerId: string
  dateOfSupply: string
  mayReadProducts: boolean
  /** A complaint about the list as a whole, such as two currencies. */
  error?: string
}) {
  // The position of the one being changed, or 'new' while one is added.
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  const currency = positions[0]?.currency ?? ''

  const store = (position: PositionForm) => {
    onChange(withPosition(positions, editing === 'new' ? null : editing, position))
    setEditing(null)
  }

  return (
    <Panel
      title="Positionen"
      action={
        editable ? (
          <Button variant="secondary" onClick={() => setEditing('new')}>
            <Plus size={15} aria-hidden />
            Position hinzufügen
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

      {positions.length === 0 ? (
        <p className="px-5 py-6 text-body text-text-secondary">
          Keine Positionen. Ein Vertrag ohne Positionen verrechnet nichts, ein Service Level
          gilt trotzdem.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-body">
            <thead>
              <tr className="border-b border-line-subtle text-left text-small text-text-tertiary">
                <th className="px-5 py-2 font-medium">Bezeichnung</th>
                <th className="w-column-xs px-3 py-2 text-right font-medium">Menge</th>
                <th className="w-column-sm px-3 py-2 text-right font-medium">Einzelpreis</th>
                <th className="hidden w-column-sm px-3 py-2 font-medium sm:table-cell">
                  Intervall
                </th>
                <th className="w-column-sm px-3 py-2 text-right font-medium">Betrag</th>
                {editable && (
                  <th className="w-column-sm px-3 py-2">
                    <span className="sr-only">Aktionen</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-line-subtle">
              {positions.map((position, index) => (
                <tr key={position.positionKey || `new-${index}`}>
                  <td className="px-5 py-2">
                    <span className="font-medium">{position.title}</span>
                    {position.productNumber && (
                      <span className="ml-2 font-mono text-small text-text-tertiary">
                        {position.productNumber}
                      </span>
                    )}
                    {position.priceIncludesVat && (
                      <span className="ml-2">
                        <Badge tone="neutral">inkl. MWST</Badge>
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {formatQuantity(parseDecimal(position.quantity))}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {formatAmount(parseDecimal(position.unitPrice))}
                  </td>
                  <td className="hidden px-3 py-2 text-text-secondary sm:table-cell">
                    {position.interval === '' ? '-' : BILLING_INTERVAL_LABELS[position.interval]}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {position.amount === null ? (
                      <span
                        className="text-text-tertiary"
                        title="Wird beim Speichern berechnet."
                      >
                        -
                      </span>
                    ) : (
                      `${formatAmount(position.amount)} ${position.currency}`
                    )}
                  </td>
                  {editable && (
                    <td className="px-3 py-2">
                      <span className="flex items-center justify-end gap-1">
                        <RowOrderButtons
                          name={position.title}
                          upDisabled={index === 0}
                          downDisabled={index === positions.length - 1}
                          onUp={() => onChange(movePosition(positions, index, -1))}
                          onDown={() => onChange(movePosition(positions, index, 1))}
                        />
                        <IconButton
                          label={`${position.title} bearbeiten`}
                          onClick={() => setEditing(index)}
                        >
                          <Pencil size={14} aria-hidden />
                        </IconButton>
                        <IconButton
                          label={`${position.title} entfernen`}
                          onClick={() =>
                            onChange(positions.filter((_entry, at) => at !== index))
                          }
                          tone="danger"
                        >
                          <Trash2 size={14} aria-hidden />
                        </IconButton>
                      </span>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {positions.length > 0 && (
        <div className="border-t border-line-subtle px-5 py-3 text-small text-text-secondary">
          {totals === null ? (
            'Die Summen stehen nach dem Speichern.'
          ) : (
            <ul className="flex flex-wrap justify-end gap-x-6 gap-y-1">
              {totals.map((total) => (
                <li key={total.interval}>
                  <span className="font-mono tabular-nums text-text-primary">
                    {formatAmount(total.amount)} {currency}
                  </span>{' '}
                  {BILLING_INTERVAL_PER[total.interval]}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <PositionDialog
        tenantId={tenantId}
        open={editing !== null}
        onClose={() => setEditing(null)}
        onSubmit={store}
        position={typeof editing === 'number' ? positions[editing] : undefined}
        currency={currency}
        partnerId={partnerId}
        dateOfSupply={dateOfSupply}
        mayReadProducts={mayReadProducts}
      />
    </Panel>
  )
}
