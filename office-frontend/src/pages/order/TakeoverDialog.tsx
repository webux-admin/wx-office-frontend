import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { ErrorNotice, LoadingBlock } from '../../components/Notice'
import { SelectField } from '../../components/SelectField'
import { api } from '../../lib/api'
import { formatAmount, formatDate } from '../../lib/format'
import type { DocumentType, PredecessorCandidate, SalesDocument } from '../../lib/types'

type TakeoverDialogProps = {
  tenantId: number
  open: boolean
  onClose: () => void
  /** The kinds of Auftrag that may be written, in the order the mask offers them. */
  orderTypes: DocumentType[]
  onCreated: (order: SalesDocument) => void
}

/**
 * Picks the document a new Auftrag is taken over from, for example an Offerte.
 *
 * <p>Which documents come into question is not decided here: the kind of Auftrag names the
 * kinds it may be taken over from, and the backend answers with the issued documents of those
 * kinds. A document that already has a follow-up is shown with a warning rather than left out
 * — a partial delivery out of one offer is the normal case, not a mistake.
 */
export function TakeoverDialog({
  tenantId,
  open,
  onClose,
  orderTypes,
  onCreated,
}: TakeoverDialogProps) {
  const [documentTypeId, setDocumentTypeId] = useState('')
  const [sourceId, setSourceId] = useState<number | null>(null)

  // The first kind that names a predecessor at all: picking one that cannot be taken over
  // would show an empty list and look broken.
  const takeoverTypes = orderTypes.filter(
    (type) => (type.predecessorTypeIds ?? []).length > 0,
  )
  const chosenType = documentTypeId === '' ? takeoverTypes[0] : takeoverTypes.find(
    (type) => String(type.id) === documentTypeId,
  )

  const candidates = useQuery({
    queryKey: ['order-predecessors', tenantId, chosenType?.id],
    queryFn: () =>
      api.get<PredecessorCandidate[]>(
        `/api/tenants/${tenantId}/orders/predecessors?documentTypeId=${chosenType?.id}`,
      ),
    enabled: open && chosenType !== undefined,
  })

  const create = useMutation({
    mutationFn: () =>
      api.post<SalesDocument>(`/api/tenants/${tenantId}/orders/from-predecessor`, {
        documentTypeId: chosenType?.id,
        sourceId,
      }),
    onSuccess: onCreated,
  })

  const close = () => {
    setSourceId(null)
    create.reset()
    onClose()
  }

  const rows = candidates.data ?? []
  const chosen = rows.find((row) => row.id === sourceId)

  return (
    <Dialog
      open={open}
      onClose={close}
      wide
      title="Aus Vorgängerbeleg übernehmen"
      description="Positionen und Beträge werden übernommen. Der MwSt-Satz richtet sich nach dem Leistungsdatum des neuen Belegs."
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Abbrechen
          </Button>
          <Button
            onClick={() => create.mutate()}
            busy={create.isPending}
            disabled={sourceId === null || chosenType === undefined}
          >
            Übernehmen
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {takeoverTypes.length === 0 ? (
          <p className="text-[13px] text-text-secondary">
            Keine Auftragsart hat einen Vorgängerbeleg hinterlegt. Das wird bei den Belegarten
            eingestellt — dort legen Sie fest, dass ein Auftrag zum Beispiel aus einer Offerte
            entstehen darf.
          </p>
        ) : (
          <>
            {takeoverTypes.length > 1 && (
              <SelectField
                label="Belegart"
                value={documentTypeId === '' ? String(chosenType?.id ?? '') : documentTypeId}
                onChange={(event) => {
                  setDocumentTypeId(event.target.value)
                  setSourceId(null)
                }}
              >
                {takeoverTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </SelectField>
            )}

            {candidates.isPending && <LoadingBlock label="Belege werden geladen" />}
            {candidates.error !== null && <ErrorNotice error={candidates.error} />}

            {candidates.isSuccess && rows.length === 0 && (
              <p className="text-[13px] text-text-secondary">
                Es gibt keinen ausgestellten Beleg, aus dem übernommen werden könnte. Entwürfe
                und stornierte Belege stehen nicht zur Auswahl.
              </p>
            )}

            {rows.length > 0 && (
              <div className="max-h-[320px] overflow-y-auto rounded-[var(--radius-md)] border border-line">
                <ul>
                  {rows.map((row) => (
                    <li key={row.id}>
                      <button
                        type="button"
                        onClick={() => setSourceId(row.id)}
                        aria-pressed={row.id === sourceId}
                        className={`flex w-full items-center gap-3 border-b border-line-subtle px-3 py-2.5 text-left transition-colors last:border-b-0 ${
                          row.id === sourceId ? 'bg-sunken' : 'hover:bg-sunken/60'
                        }`}
                      >
                        <span className="w-[110px] shrink-0 font-mono text-[12px]">
                          {row.documentNumber}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[13px]">
                          {row.partnerName}
                        </span>
                        <span className="w-[92px] shrink-0 text-right text-[12px] text-text-secondary">
                          {formatDate(row.documentDate)}
                        </span>
                        <span className="w-[110px] shrink-0 text-right text-[13px] font-medium">
                          {formatAmount(row.totalGross)}{' '}
                          <span className="text-text-tertiary">{row.currency}</span>
                        </span>
                        {row.alreadyTakenOver && (
                          <AlertTriangle
                            size={15}
                            className="shrink-0 text-text-tertiary"
                            aria-label="Aus diesem Beleg wurde bereits ein Auftrag erstellt"
                          />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {chosen?.alreadyTakenOver && (
              <p className="flex items-start gap-2 text-[12px] text-text-secondary">
                <AlertTriangle size={14} className="mt-px shrink-0 text-text-tertiary" aria-hidden />
                Aus {chosen.documentNumber} wurde bereits ein Auftrag erstellt. Ein zweiter ist
                erlaubt — etwa für eine Teillieferung.
              </p>
            )}

            {create.error !== null && <ErrorNotice error={create.error} />}
          </>
        )}
      </div>
    </Dialog>
  )
}
