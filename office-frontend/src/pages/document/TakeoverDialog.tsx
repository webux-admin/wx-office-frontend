import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { ErrorNotice, LoadingBlock } from '../../components/Notice'
import { SelectField } from '../../components/SelectField'
import { useAuth } from '../../auth/useAuth'
import { api } from '../../lib/api'
import { formatAmount, formatDate, formatQuantity } from '../../lib/format'
import { openLinesOf } from '../../lib/openQuantity'
import { indefiniteArticle, type SalesDocumentKind } from '../../lib/salesDocument'
import type {
  DocumentType,
  OpenLineQuantity,
  PredecessorCandidate,
  SalesDocument,
} from '../../lib/types'
import { useOpenQuantities } from './useOpenQuantities'

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
 * kinds. A document that was partly taken over stays in the list — a partial delivery out of
 * one offer is the normal case, not a mistake — and one that has nothing left is shown as
 * done and sorted last.
 *
 * <p>Once a document is picked, its positions are shown with three numbers each: what was
 * ordered, what already went out, and what is left. The last of them is what the new document
 * will carry.
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
  const completed = chosen !== undefined && chosen.openLineCount === 0

  const openQuantities = useOpenQuantities(tenantId, kind.resource, selectedId, open)
  const openLines = openLinesOf(openQuantities.data ?? [])

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

  const blocked = selectedId === null || chosenType === undefined || completed

  /** The document being written, named the way a sentence needs it: «ein Auftrag». */
  const followUp = `${indefiniteArticle(kind, 'nominative')} ${kind.singular}`

  return (
    <Dialog
      open={open}
      onClose={close}
      wide
      title="Aus Vorgängerbeleg übernehmen"
      description="Übernommen wird, was noch offen ist. Der MwSt-Satz richtet sich nach dem Leistungsdatum des neuen Belegs."
      onSubmit={create.isPending || blocked ? undefined : () => create.mutate()}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Abbrechen
          </Button>
          <Button
            onClick={() => create.mutate()}
            busy={create.isPending}
            disabled={blocked}
            shortcut
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
              <div className="max-h-[260px] overflow-y-auto rounded-[var(--radius-md)] border border-line">
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
                        <span className="w-[92px] shrink-0 text-right text-[12px] text-text-secondary">
                          {openLabel(row)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {selectedId !== null && (
              <div aria-live="polite">
                {openQuantities.isPending && <LoadingBlock label="Positionen werden geladen" />}
                {openQuantities.error !== null && <ErrorNotice error={openQuantities.error} />}
                {completed ? (
                  <p className="flex items-start gap-2 text-[12px] text-text-secondary">
                    <AlertTriangle
                      size={14}
                      className="mt-px shrink-0 text-text-tertiary"
                      aria-hidden
                    />
                    Aus {chosen?.documentNumber} ist nichts mehr offen — jede Position wurde
                    bereits übernommen. Für eine Nachlieferung wird {followUp} von Hand erfasst.
                  </p>
                ) : (
                  openLines.length > 0 && <OpenLinesPreview lines={openLines} />
                )}
              </div>
            )}

            {create.error !== null && <ErrorNotice error={create.error} />}
          </>
        )}
      </div>
    </Dialog>
  )
}

/**
 * How much of a candidate is left, in the two words the picker has room for.
 *
 * @param candidate the row
 * @returns «erledigt», «3 offen», or nothing at all for a document without positions
 */
function openLabel(candidate: PredecessorCandidate): string {
  if (candidate.itemLineCount === 0) {
    return ''
  }
  return candidate.openLineCount === 0 ? 'erledigt' : `${candidate.openLineCount} offen`
}

/**
 * The positions the new document would carry, with what stands behind each quantity.
 *
 * <p>Bestellt, geliefert and offen next to each other, because the proposed quantity is only
 * believable with the two numbers it comes from. Positions that are fully taken over are not
 * listed: the new document will not carry them either.
 *
 * @param lines the positions with something left, in printed order
 */
function OpenLinesPreview({ lines }: { lines: readonly OpenLineQuantity[] }) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius-md)] border border-line">
      <table className="w-full min-w-[420px] border-collapse text-[12px]">
        <thead>
          <tr className="border-b border-line text-text-secondary">
            <th scope="col" className="px-3 py-2 text-left font-medium">
              Position
            </th>
            <th scope="col" className="w-[84px] px-3 py-2 text-right font-medium">
              Bestellt
            </th>
            <th scope="col" className="w-[84px] px-3 py-2 text-right font-medium">
              Geliefert
            </th>
            <th scope="col" className="w-[84px] px-3 py-2 text-right font-medium">
              Offen
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.lineId} className="border-b border-line-subtle last:border-b-0">
              <td className="px-3 py-1.5">
                <span className="text-text-tertiary">{line.lineNumber}</span>{' '}
                {line.description}
              </td>
              <td className="px-3 py-1.5 text-right font-mono tabular-nums text-text-secondary">
                {formatQuantity(line.orderedQuantity)}
              </td>
              <td className="px-3 py-1.5 text-right font-mono tabular-nums text-text-secondary">
                {formatQuantity(line.deliveredQuantity)}
              </td>
              <td className="px-3 py-1.5 text-right font-mono tabular-nums font-medium">
                {formatQuantity(line.openQuantity)}
                {line.unit !== undefined && (
                  <span className="text-text-tertiary"> {line.unit}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
