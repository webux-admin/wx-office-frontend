import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge } from '../../components/Badge'
import { Button } from '../../components/Button'
import { ErrorNotice, LoadingBlock } from '../../components/Notice'
import { Panel } from '../../components/Panel'
import { SelectField } from '../../components/SelectField'
import { api } from '../../lib/api'
import type { DocumentType, PartnerDocumentType } from '../../lib/types'
import { useCatalogueLabel } from '../../masterdata/useMasterData'
import {
  assignmentPayload,
  defaultNameOf,
  toAssignmentRows,
  type AssignmentRow,
} from './partnerTypeForm'

const TITLE = 'Dokumente'

const DESCRIPTION =
  'Welche Belegart dieser Kunde je Vorgang bekommt. Ohne eigene Abmachung gilt die Standardbelegart des Mandanten — sie steht hier und ändert sich mit ihr.'

/**
 * Which kind of document this customer gets, step of a sale by step of a sale.
 *
 * <p>The backend answers with the kind that applies either way and says whether it came from
 * this customer or from the default of the step. So the mask shows one list and never has to
 * work out a fallback of its own (ADR-0054 of the backend).
 *
 * @param tenantId the tenant
 * @param partnerId the customer whose record this is
 * @param mayWrite whether the user may change the assignment
 */
export function PartnerDocumentTypes({
  tenantId,
  partnerId,
  mayWrite,
}: {
  tenantId: number
  partnerId: number
  mayWrite: boolean
}) {
  const base = `/api/tenants/${tenantId}/partners/${partnerId}/document-types`

  const assigned = useQuery({
    queryKey: ['partner-document-types', tenantId, partnerId],
    queryFn: () => api.get<PartnerDocumentType[]>(base),
  })

  // Every kind of the tenant, so a row can offer the alternatives of its own category.
  const types = useQuery({
    queryKey: ['document-types', tenantId],
    queryFn: () => api.get<DocumentType[]>(`/api/tenants/${tenantId}/document-types`),
  })

  if (assigned.isPending || types.isPending) {
    return (
      <Panel title={TITLE} description={DESCRIPTION}>
        <LoadingBlock label="Belegarten werden geladen" />
      </Panel>
    )
  }
  if (assigned.error !== null || types.error !== null) {
    return (
      <Panel title={TITLE} description={DESCRIPTION}>
        <ErrorNotice error={assigned.error ?? types.error} />
      </Panel>
    )
  }

  return (
    <AssignmentPanel
      /* Keyed by what is stored: the rows below hold what was picked, and that has to give
         way when a save rewrites the list underneath them. */
      key={assigned.data.map((entry) => `${entry.category}:${entry.documentTypeId}`).join('|')}
      tenantId={tenantId}
      base={base}
      partnerId={partnerId}
      stored={assigned.data}
      types={types.data}
      mayWrite={mayWrite}
    />
  )
}

function AssignmentPanel({
  tenantId,
  base,
  partnerId,
  stored,
  types,
  mayWrite,
}: {
  tenantId: number
  base: string
  partnerId: number
  stored: PartnerDocumentType[]
  types: DocumentType[]
  mayWrite: boolean
}) {
  const queryClient = useQueryClient()
  const categoryLabel = useCatalogueLabel(tenantId, 'document-category')
  const [rows, setRows] = useState<AssignmentRow[]>(() => toAssignmentRows(stored))

  const save = useMutation({
    mutationFn: () => api.put<PartnerDocumentType[]>(base, assignmentPayload(rows)),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['partner-document-types', tenantId, partnerId],
      })
    },
  })

  const replace = (category: string, documentTypeId: string) => {
    setRows(
      rows.map((row) => (row.category === category ? { ...row, documentTypeId } : row)),
    )
    save.reset()
  }

  if (rows.length === 0) {
    return (
      <Panel title={TITLE} description={DESCRIPTION}>
        <p className="text-[13px] text-text-secondary">
          Dieser Mandant führt noch keine Belegart. Unter Einstellungen → Belegarten wird
          festgelegt, womit ein Vorgang geschrieben wird.
        </p>
      </Panel>
    )
  }

  return (
    <Panel
      title={TITLE}
      description={DESCRIPTION}
      action={
        mayWrite ? (
          <Button variant="secondary" onClick={() => save.mutate()} busy={save.isPending}>
            Übernehmen
          </Button>
        ) : undefined
      }
    >
      <div className="grid gap-3">
        {rows.map((row) => {
          const alternatives = types.filter(
            (type) =>
              type.category === row.category &&
              (type.active || `${type.id}` === row.documentTypeId),
          )
          const fallback = defaultNameOf(types, row.category) ?? 'keine'
          return (
            <div
              key={row.category}
              className="rounded-[var(--radius-md)] border border-line-subtle p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5">
                <span className="text-[12px] font-medium text-text-secondary">
                  {categoryLabel(row.category)}
                </span>
                {row.documentTypeId === '' ? (
                  <Badge tone="neutral">Standardbelegart</Badge>
                ) : (
                  <Badge tone="accent">Eigene Abmachung</Badge>
                )}
              </div>

              <SelectField
                label="Belegart"
                value={row.documentTypeId}
                disabled={!mayWrite}
                onChange={(event) => replace(row.category, event.target.value)}
                hint={
                  row.documentTypeId === ''
                    ? `Es gilt die Standardbelegart: ${fallback}. Wird sie verschoben, folgt dieser Kunde mit.`
                    : 'Fest für diesen Kunden. Eine spätere Änderung der Standardbelegart lässt ihn unberührt.'
                }
              >
                <option value="">Standardbelegart ({fallback})</option>
                {alternatives.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.code} · {type.name}
                    {type.active ? '' : ' (deaktiviert)'}
                  </option>
                ))}
              </SelectField>
            </div>
          )
        })}

        {save.error !== null && <ErrorNotice error={save.error} />}
      </div>
    </Panel>
  )
}
