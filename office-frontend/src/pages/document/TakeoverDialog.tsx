import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { ErrorNotice, LoadingBlock } from '../../components/Notice'
import { SelectField } from '../../components/SelectField'
import { useAuth } from '../../auth/useAuth'
import { api } from '../../lib/api'
import { formatAmount, formatDate } from '../../lib/format'
import { indefiniteArticle, type SalesDocumentKind } from '../../lib/salesDocument'
import type { DocumentType, PredecessorCandidate, SalesDocument } from '../../lib/types'

type TakeoverDialogProps = {
  tenantId: number
  /** Which kind of document is being written, which decides resource and wording. */
  kind: SalesDocumentKind
  open: boolean
  onClose: () => void
  /** The kinds of that document which may be written, in the order the mask offers them. */
  documentTypes: DocumentType[]
  /**
   * Document preselected as the source, for a screen that already knows it — the accepted
   * offer an order is written from. It counts only once the backend lists it as a candidate.
   */
  preselectedSourceId?: number
  onCreated: (created: SalesDocument) => void
}

/**
 * Picks the document a new one is taken over from, for example the Offerte behind an Auftrag.
 *
 * <p>Which documents come into question is not decided here: the kind of document names the
 * kinds it may be taken over from, and the backend answers with the issued documents of those
 * kinds. A document that already has a follow-up is shown with a warning rather than left out
 * — a partial delivery out of one offer is the normal case, not a mistake.
 *
 * @param kind which kind of document is being written
 */
export function TakeoverDialog({
  tenantId,
  kind,
  open,
  onClose,
  documentTypes,
  preselectedSourceId,
  onCreated,
}: TakeoverDialogProps) {
  const { can } = useAuth()
  const [documentTypeId, setDocumentTypeId] = useState('')
  const [sourceId, setSourceId] = useState<number | null>(preselectedSourceId ?? null)

  // The first kind that names a predecessor at all: picking one that cannot be taken over
  // would show an empty list and look broken.
  const takeoverTypes = documentTypes.filter(
    (type) => (type.predecessorTypeIds ?? []).length > 0,
  )
  const chosenType = documentTypeId === '' ? takeoverTypes[0] : takeoverTypes.find(
    (type) => String(type.id) === documentTypeId,
  )

  const candidates = useQuery({
    queryKey: ['document-predecessors', kind.resource, tenantId, chosenType?.id],
    queryFn: () =>
      api.get<PredecessorCandidate[]>(
        `/api/tenants/${tenantId}/${kind.resource}/predecessors?documentTypeId=${chosenType?.id}`,
      ),
    enabled: open && chosenType !== undefined,
  })

  const rows = candidates.data ?? []
  // A preselected document counts only once it stands in the list: the kinds chosen may not
  // name its type as a predecessor, and creating from a document the backend never offered
  // would only collect the refusal the list exists to prevent.
  const selectedId = rows.some((row) => row.id === sourceId) ? sourceId : null
  const chosen = rows.find((row) => row.id === selectedId)

  const create = useMutation({
    mutationFn: () =>
      api.post<SalesDocument>(`/api/tenants/${tenantId}/${kind.resource}/from-predecessor`, {
        documentTypeId: chosenType?.id,
        sourceId: selectedId,
      }),
    onSuccess: onCreated,
  })

  const close = () => {
    setSourceId(preselectedSourceId ?? null)
    create.reset()
    onClose()
  }

  /** The document being written, named the way a sentence needs it: «ein Auftrag». */
  const followUp = `${indefiniteArticle(kind, 'nominative')} ${kind.singular}`

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
            disabled={selectedId === null || chosenType === undefined}
          >
            Übernehmen
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {takeoverTypes.length === 0 ? (
          // Two reasons lead to the same empty box, and only one of them is something the
          // reader can do anything about.
          can('DOCUMENT_TYPE_READ') ? (
            <p className="text-[13px] text-text-secondary">
              Keine Belegart für {kind.singular} hat einen Vorgängerbeleg hinterlegt. Das wird
              bei den Belegarten eingestellt — dort legen Sie fest, aus welchem Beleg übernommen
              werden darf.
            </p>
          ) : (
            <p className="text-[13px] text-text-secondary">
              Ob eine Belegart für {kind.singular} einen Vorgängerbeleg führt, lässt sich ohne
              das Recht DOCUMENT_TYPE_READ nicht feststellen.
            </p>
          )
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
                        aria-pressed={row.id === selectedId}
                        className={`flex w-full items-center gap-3 border-b border-line-subtle px-3 py-2.5 text-left transition-colors last:border-b-0 ${
                          row.id === selectedId ? 'bg-sunken' : 'hover:bg-sunken/60'
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
                            aria-label={`Aus diesem Beleg wurde bereits ${followUp} erstellt`}
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
                Aus {chosen.documentNumber} wurde bereits {followUp} erstellt. Ein zweiter Beleg
                ist erlaubt — etwa für eine Teillieferung oder eine Teilrechnung.
              </p>
            )}

            {create.error !== null && <ErrorNotice error={create.error} />}
          </>
        )}
      </div>
    </Dialog>
  )
}
