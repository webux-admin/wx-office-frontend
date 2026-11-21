// Parts of the sales document mask that do not steer it: the texts, the party and the trail.
import { useEffect, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { ErrorNotice } from '../../components/Notice'
import { Panel } from '../../components/Panel'
import { TextAreaField } from '../../components/TextAreaField'
import { TextField } from '../../components/TextField'
import { api } from '../../lib/api'
import { formatDateTime } from '../../lib/format'
import {
  salesDocumentKey,
  salesDocumentTrailKey,
  type SalesDocumentKind,
} from '../../lib/salesDocument'
import type {
  DocumentParty,
  DocumentStatus,
  DocumentStatusEntry,
  SalesDocument,
} from '../../lib/types'
import { useCatalogueLabel } from '../../masterdata/useMasterData'
import { recipientNote } from './recipientNote'

/** The two registers of a mask whose kind is followed up (ADR-0010). */

/** Header text, footer text and the reference of the customer. */
export function DocumentTexts({
  tenantId,
  kind,
  document,
  editable,
  onDirtyChange,
}: {
  tenantId: number
  kind: SalesDocumentKind
  document: SalesDocument
  editable: boolean
  /** Reports whether a text was typed and not yet kept, so leaving asks first. */
  onDirtyChange: (dirty: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [headerText, setHeaderText] = useState(document.headerText ?? '')
  const [footerText, setFooterText] = useState(document.footerText ?? '')
  const [reference, setReference] = useState(document.reference ?? '')

  const dirty =
    editable &&
    (headerText.trim() !== (document.headerText ?? '').trim() ||
      footerText.trim() !== (document.footerText ?? '').trim() ||
      reference.trim() !== (document.reference ?? '').trim())
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange])

  const save = useMutation({
    mutationFn: () =>
      api.put<SalesDocument>(`/api/tenants/${tenantId}/${kind.resource}/${document.id}/texts`, {
        headerText: headerText.trim() || undefined,
        footerText: footerText.trim() || undefined,
        reference: reference.trim() || undefined,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: salesDocumentKey(kind, tenantId) }),
  })

  return (
    <Panel
      title="Texte"
      description="Erscheinen über und unter den Positionen."
      action={
        editable ? (
          <Button variant="secondary" onClick={() => save.mutate()} busy={save.isPending}>
            Übernehmen
          </Button>
        ) : undefined
      }
    >
      <div className="grid gap-4">
        <TextField
          label="Referenz des Kunden"
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          disabled={!editable}
          maxLength={140}
          tooltip="Bestellnummer oder Projekt, damit der Kunde den Beleg zuordnen kann."
        />
        <TextAreaField
          label="Kopftext"
          value={headerText}
          onChange={(event) => setHeaderText(event.target.value)}
          disabled={!editable}
          rows={3}
        />
        <TextAreaField
          label="Fusstext"
          value={footerText}
          onChange={(event) => setFooterText(event.target.value)}
          disabled={!editable}
          rows={3}
        />
        {save.error !== null && <ErrorNotice error={save.error} />}
      </div>
    </Panel>
  )
}

/**
 * Name and address as they stand on the document.
 *
 * <p>How long they stand there depends on the status, and the section says which of the two
 * it is: a draft follows the partner record, while issuing the document freezes the copy so
 * that it still reads the way it was sent, even after the customer moves (ADR-0040).
 */
export function PartyPanel({
  title,
  party,
  number,
  status,
  action,
}: {
  title: string
  party?: DocumentParty
  number?: string
  /** Decides whether the address still follows the partner record. */
  status: DocumentStatus
  /** Control in the top right, for example "Kunde wechseln". */
  action?: ReactNode
}) {
  if (!party) {
    if (!action) return null
    return (
      <Panel title={title} action={action}>
        <p className="text-body text-text-secondary">
          Für diesen Beleg ist keine Adresse festgehalten.
        </p>
      </Panel>
    )
  }

  return (
    <Panel
      title={title}
      description={recipientNote(status)}
      action={action}
    >
      <address className="not-italic text-body leading-6">
        <span className="block font-medium">{party.name}</span>
        {party.addressLine && <span className="block">{party.addressLine}</span>}
        <span className="block">
          {[party.street, party.buildingNumber].filter(Boolean).join(' ')}
        </span>
        <span className="block">
          {[party.country, party.postalCode].filter(Boolean).join('-')} {party.town}
        </span>
        {party.uid && (
          <span className="mt-1.5 block font-mono text-small text-text-secondary">
            {party.uid}
          </span>
        )}
        {number && (
          <span className="block font-mono text-small text-text-secondary">{number}</span>
        )}
      </address>
    </Panel>
  )
}

/** Who moved the document where, and when. */
export function StatusTrail({
  tenantId,
  kind,
  documentId,
}: {
  tenantId: number
  kind: SalesDocumentKind
  documentId: number
}) {
  const statusLabel = useCatalogueLabel(tenantId, 'document-status')
  const trail = useQuery({
    queryKey: salesDocumentTrailKey(kind, tenantId, documentId),
    queryFn: () =>
      api.get<DocumentStatusEntry[]>(
        `/api/tenants/${tenantId}/${kind.resource}/${documentId}/status-trail`,
      ),
  })

  return (
    <Panel title="Verlauf">
      {trail.isPending && <p className="text-body text-text-secondary">Wird geladen ...</p>}
      {trail.error !== null && <ErrorNotice error={trail.error} />}
      {trail.data && (
        <ol className="grid gap-3">
          {/* Newest first: what happened last is what someone opening the mask wants to see.
              The API answers in the order it happened, which is the order an audit trail is
              stored in. */}
          {[...trail.data].reverse().map((entry, index) => (
            <li key={`${entry.status}-${entry.changedAt}-${index}`} className="flex gap-3">
              <span
                aria-hidden
                className="mt-1.5 h-2 w-2 shrink-0 rounded-[var(--radius-full)] bg-accent"
              />
              <span className="min-w-0 text-body">
                <span className="block font-medium">{statusLabel(entry.status)}</span>
                <span className="block text-text-secondary">
                  {formatDateTime(entry.changedAt)}
                  {entry.changedBy ? ` · ${entry.changedBy}` : ''}
                </span>
                {entry.note && <span className="block text-text-secondary">{entry.note}</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  )
}
