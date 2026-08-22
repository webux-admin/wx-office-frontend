import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { ErrorNotice, LoadingBlock } from '../../components/Notice'
import { SelectField } from '../../components/SelectField'
import { api } from '../../lib/api'
import { formatAmount, formatDate } from '../../lib/format'
import type { CopyPriceMode, DocumentSummary, Page, SalesDocument } from '../../lib/types'

type CopyDocumentDialogProps = {
  tenantId: number
  open: boolean
  onClose: () => void
  onCreated: (order: SalesDocument) => void
}

/** How many orders the picker offers. Beyond that the search field is the better control. */
const PICKER_SIZE = 50

/**
 * Picks the Auftrag a new one is copied from, and what happens to its amounts.
 *
 * <p>The price mode starts on what the kind of document says the tenant usually wants and can
 * be changed for this one copy. Nothing is written back to the setting: an exception stays an
 * exception.
 */
export function CopyDocumentDialog({ tenantId, open, onClose, onCreated }: CopyDocumentDialogProps) {
  const [sourceId, setSourceId] = useState<number | null>(null)
  const [priceMode, setPriceMode] = useState<CopyPriceMode | ''>('')

  const orders = useQuery({
    queryKey: ['orders', tenantId, 'copy-picker'],
    queryFn: () =>
      api.get<Page<DocumentSummary>>(
        `/api/tenants/${tenantId}/orders?size=${PICKER_SIZE}&sort=documentDate,desc`,
      ),
    enabled: open,
  })

  const create = useMutation({
    mutationFn: () =>
      api.post<SalesDocument>(`/api/tenants/${tenantId}/orders/copies`, {
        sourceId,
        priceMode: priceMode === '' ? undefined : priceMode,
      }),
    onSuccess: onCreated,
  })

  const close = () => {
    setSourceId(null)
    setPriceMode('')
    create.reset()
    onClose()
  }

  const rows = orders.data?.content ?? []

  return (
    <Dialog
      open={open}
      onClose={close}
      wide
      title="Auftrag kopieren"
      description="Positionen und Texte werden übernommen. Der neue Auftrag steht für sich und verweist nicht auf das Original."
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Abbrechen
          </Button>
          <Button
            onClick={() => create.mutate()}
            busy={create.isPending}
            disabled={sourceId === null}
          >
            Kopieren
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {orders.isPending && <LoadingBlock label="Aufträge werden geladen" />}
        {orders.error !== null && <ErrorNotice error={orders.error} />}

        {orders.isSuccess && rows.length === 0 && (
          <p className="text-[13px] text-text-secondary">
            Es gibt noch keinen Auftrag, der sich kopieren liesse.
          </p>
        )}

        {rows.length > 0 && (
          <>
            <div className="max-h-[300px] overflow-y-auto rounded-[var(--radius-md)] border border-line">
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
                        {row.documentNumber ?? 'Entwurf'}
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
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <SelectField
              label="Preise"
              value={priceMode}
              onChange={(event) => setPriceMode(event.target.value as CopyPriceMode | '')}
              hint="Ohne Angabe gilt, was bei der Belegart eingestellt ist."
            >
              <option value="">Vorgabe der Belegart</option>
              <option value="RECALCULATE">Neu aus dem Katalog holen</option>
              <option value="COPY">Beträge des Originals behalten</option>
            </SelectField>
          </>
        )}

        {create.error !== null && <ErrorNotice error={create.error} />}
      </div>
    </Dialog>
  )
}
