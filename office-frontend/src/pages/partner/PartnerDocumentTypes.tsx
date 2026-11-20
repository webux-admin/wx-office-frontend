import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { ErrorNotice, LoadingBlock } from '../../components/Notice'
import { Panel } from '../../components/Panel'
import { SelectField } from '../../components/SelectField'
import { api } from '../../lib/api'
import type { DocumentType, PartnerDocumentType } from '../../lib/types'
import { useCatalogueLabel } from '../../masterdata/useMasterData'
import { TextField } from '../../components/TextField'
import {
  assignmentComplaint,
  assignmentPayload,
  copyRowsOf,
  defaultNameOf,
  describeCopyRow,
  toAssignmentRows,
  type AssignmentRow,
} from './partnerTypeForm'

const TITLE = 'Dokumente'

const DESCRIPTION = 'Belegart und Ausfertigungen je Vorgang, wo dieser Kunde abweicht.'

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
      key={assigned.data
        .map(
          (entry) =>
            `${entry.category}:${entry.documentTypeId}:` +
            (entry.copies ?? []).map((copy) => `${copy.position}=${copy.copies}`).join(','),
        )
        .join('|')}
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
  const [complaint, setComplaint] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: () => api.put<PartnerDocumentType[]>(base, assignmentPayload(rows)),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['partner-document-types', tenantId, partnerId],
      })
    },
  })

  const change = (next: AssignmentRow[]) => {
    setRows(next)
    setComplaint(null)
    save.reset()
  }

  const replace = (category: string, documentTypeId: string) => {
    // The copies belong to the kind that was picked, so they are read from it. An empty id
    // stands for the default of the step, whose copies the catalogue knows as well.
    const picked =
      documentTypeId === ''
        ? types.find((type) => type.category === category && type.categoryDefault === true)
        : types.find((type) => `${type.id}` === documentTypeId)
    change(
      rows.map((row) =>
        row.category === category
          ? { ...row, documentTypeId, copies: copyRowsOf(picked) }
          : row,
      ),
    )
  }

  const setExtraCopies = (category: string, value: string) =>
    change(rows.map((row) => (row.category === category ? { ...row, extraCopies: value } : row)))

  const setCopies = (category: string, position: number, value: string) =>
    change(
      rows.map((row) =>
        row.category === category
          ? {
              ...row,
              copies: row.copies.map((copy) =>
                copy.position === position ? { ...copy, copies: value } : copy,
              ),
            }
          : row,
      ),
    )

  const submit = () => {
    const problem = assignmentComplaint(rows)
    setComplaint(problem)
    if (problem === null) save.mutate()
  }

  const failure = complaint === null ? save.error : new Error(complaint)

  if (rows.length === 0) {
    return (
      <Panel title={TITLE} description={DESCRIPTION}>
        <p className="text-body text-text-secondary">
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
          <Button variant="secondary" onClick={submit} busy={save.isPending}>
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
              className="grid items-start gap-3 border-b border-line-subtle pb-3 last:border-b-0 last:pb-0 sm:grid-cols-[minmax(0,2fr)_repeat(auto-fit,minmax(6rem,1fr))]"
            >
              <SelectField
                label={categoryLabel(row.category)}
                value={row.documentTypeId}
                disabled={!mayWrite}
                onChange={(event) => replace(row.category, event.target.value)}
                tooltip={
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

              {row.copies.length === 0 ? (
                <p className="self-center text-small text-text-tertiary sm:col-span-2">
                  Diese Belegart wird nicht gedruckt, also gibt es nichts einzustellen.
                </p>
              ) : (
                <>
                  {row.copies.map((copy) => (
                    <TextField
                      key={copy.position}
                      label={copy.label}
                      value={copy.copies}
                      inputMode="numeric"
                      numeric
                      maxLength={2}
                      disabled={!mayWrite}
                      onChange={(event) =>
                        setCopies(row.category, copy.position, event.target.value)
                      }
                      tooltip={describeCopyRow(copy)}
                    />
                  ))}
                  <TextField
                    label="Kopie"
                    value={row.extraCopies}
                    inputMode="numeric"
                    numeric
                    maxLength={2}
                    disabled={!mayWrite}
                    onChange={(event) => setExtraCopies(row.category, event.target.value)}
                    tooltip="Zusätzliche Exemplare mit der Aufschrift «Kopie», gedruckt wie das Original. 0 heisst: keine Kopie."
                  />
                </>
              )}
            </div>
          )
        })}

        {failure !== null && failure !== undefined && <ErrorNotice error={failure} />}
      </div>
    </Panel>
  )
}
