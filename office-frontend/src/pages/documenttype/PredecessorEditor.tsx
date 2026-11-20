import { Plus, X } from 'lucide-react'
import { Panel } from '../../components/Panel'
import { RowOrderButtons } from '../../components/RowOrderButtons'
import type { DocumentType } from '../../lib/types'
import {
  MAX_PREDECESSORS,
  togglePredecessor,
  withMovedPredecessor,
} from './documentTypeForm'

/**
 * Which kinds of document this one may be taken over from, and in which order.
 *
 * <p>The chosen ones stand at the top in their stored order, because that order is the order
 * of a new document. What may still be added stands below.
 *
 * <p>Only kinds the backend would accept are offered: never this kind itself, never a retired
 * one, and never one that already takes this kind over — a ring would let two kinds feed each
 * other forever. Offering them here would only invite the error.
 */
export function PredecessorEditor({
  all,
  editingId,
  chosen,
  onChange,
  disabled = false,
}: {
  all: DocumentType[]
  /** The kind being edited, `undefined` while it is being created and has no id. */
  editingId: number | undefined
  chosen: number[]
  onChange: (ids: number[]) => void
  disabled?: boolean
}) {
  const byId = new Map(all.map((type) => [type.id, type]))
  const chosenTypes = chosen.map((id) => byId.get(id)).filter((type) => type !== undefined)
  const offered = all.filter(
    (type) =>
      type.id !== editingId
      && type.active
      && !chosen.includes(type.id)
      && !(type.predecessorTypeIds ?? []).some((id) => id === editingId),
  )

  return (
    <Panel
      title="Vorgängerbelege"
      description="Ein Beleg dieser Art entsteht aus diesen Vorgängern, zum Beispiel eine Rechnung aus dem Lieferschein. Die Reihenfolge gilt beim Übernehmen."
    >
      <div className="grid gap-3">
        {chosenTypes.length === 0 ? (
          <p className="text-body text-text-secondary">
            Keine. Belege dieser Art werden immer neu erfasst.
          </p>
        ) : (
          chosenTypes.map((type, index) => (
            <div key={type.id} className="flex items-center gap-3">
              <RowOrderButtons
                name={type.name}
                upDisabled={disabled || index === 0}
                downDisabled={disabled || index === chosenTypes.length - 1}
                onUp={() => onChange(withMovedPredecessor(chosen, index, -1))}
                onDown={() => onChange(withMovedPredecessor(chosen, index, 1))}
              />
              <span className="w-[70px] shrink-0 font-mono text-small text-text-secondary">
                {type.code}
              </span>
              <span className="flex-1 text-body">{type.name}</span>
              <button
                type="button"
                disabled={disabled}
                aria-label={`${type.name} entfernen`}
                onClick={() => onChange(togglePredecessor(chosen, type.id, false))}
                className="grid h-8 w-8 place-items-center rounded-[var(--radius-sm)] text-text-tertiary transition-colors hover:bg-sunken hover:text-danger disabled:opacity-40"
              >
                <X size={14} aria-hidden />
              </button>
            </div>
          ))
        )}

        <div className="border-t border-line-subtle pt-3">
          <p className="mb-2 text-small text-text-secondary">Hinzufügen</p>
          {offered.length === 0 ? (
            <p className="text-small text-text-tertiary">
              Keine weitere Belegart verfügbar.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {offered.map((type) => (
                <button
                  key={type.id}
                  type="button"
                  disabled={disabled || chosen.length >= MAX_PREDECESSORS}
                  onClick={() => onChange(togglePredecessor(chosen, type.id, true))}
                  className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-line px-2 py-1 text-small text-text-secondary transition-colors hover:border-accent hover:text-text-primary disabled:opacity-40"
                >
                  <Plus size={12} aria-hidden />
                  {type.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Panel>
  )
}
