import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { CheckboxField } from '../../components/CheckboxField'
import { Dialog } from '../../components/Dialog'
import { DialogCancelButton } from '../../components/DialogCancelButton'
import { ErrorNotice, LoadingBlock } from '../../components/Notice'
import { TextAreaField } from '../../components/TextAreaField'
import { TextField } from '../../components/TextField'
import { api } from '../../lib/api'
import {
  creditNoteBodyOf,
  creditNoteRowError,
  creditNoteRowsOf,
  creditNoteRowsReady,
  creditNoteUrl,
  creditableKey,
  creditableSentence,
  creditableUrl,
  invoiceCreditNotesKey,
  invoiceCreditNotesUrl,
  type CreditNoteRow,
} from '../../lib/creditNote'
import {
  formatAmount,
  formatDate,
  formatPercent,
  formatQuantity,
  toIsoDate,
} from '../../lib/format'
import { CREDIT_NOTE_KIND, salesDocumentKey } from '../../lib/salesDocument'
import type { CreditableGroup, CreditableInvoice, SalesDocument } from '../../lib/types'

type CreditNoteDialogProps = {
  tenantId: number
  /** The invoice the Gutschrift credits. */
  invoiceId: number
  open: boolean
  onClose: () => void
  /** The draft being changed; left out to write a new Gutschrift. */
  draft?: SalesDocument
  /** Called with the stored draft, so the caller can open it or show it again. */
  onSaved: (creditNote: SalesDocument) => void
}

/**
 * Writes a Gutschrift from the lines of an invoice, or rewrites a draft one.
 *
 * <p>Each line of the invoice can be ticked and gets a quantity, a price and, if wanted, a text
 * of its own. Rate, account and date of supply are not offered: the backend copies them from
 * the invoice line, because a Gutschrift lowers that supply at that rate (backend ADR-0155).
 *
 * <p>What the invoice still has to give comes from the server and is shown above the lines, per
 * rate where it carries more than one. Whether the Gutschrift fits is the backend's answer too;
 * its refusal names the rate and stands at the foot.
 */
export function CreditNoteDialog(props: CreditNoteDialogProps) {
  // Mounted afresh on every opening, so a row typed and abandoned does not come back and the
  // figures are the ones the server answers now.
  if (!props.open) return null
  return <OpenCreditNoteDialog {...props} />
}

function OpenCreditNoteDialog({
  tenantId,
  invoiceId,
  onClose,
  draft,
  onSaved,
}: CreditNoteDialogProps) {
  const queryClient = useQueryClient()
  const creditable = useQuery({
    queryKey: creditableKey(tenantId, invoiceId),
    queryFn: () => api.get<CreditableInvoice>(creditableUrl(tenantId, invoiceId)),
  })
  const [documentDate, setDocumentDate] = useState(draft?.documentDate ?? toIsoDate())
  const [headerText, setHeaderText] = useState(draft?.headerText ?? '')
  // Null until something is typed: until then the rows are what the server answered, so they
  // need no effect to follow the query.
  const [typed, setTyped] = useState<CreditNoteRow[] | null>(null)
  const rows = typed ?? (creditable.data === undefined
    ? []
    : creditNoteRowsOf(creditable.data, draft))

  const save = useMutation({
    mutationFn: () => {
      const body = creditNoteBodyOf(documentDate, headerText, rows, draft === undefined
        ? {}
        : { footerText: draft.footerText, reference: draft.reference })
      return draft === undefined
        ? api.post<SalesDocument>(invoiceCreditNotesUrl(tenantId, invoiceId), body)
        : api.put<SalesDocument>(creditNoteUrl(tenantId, draft.id), body)
    },
    onSuccess: (stored) => {
      void queryClient.invalidateQueries({ queryKey: invoiceCreditNotesKey(tenantId, invoiceId) })
      void queryClient.invalidateQueries({ queryKey: creditableKey(tenantId, invoiceId) })
      queryClient.setQueryData(salesDocumentKey(CREDIT_NOTE_KIND, tenantId, stored.id), stored)
      onSaved(stored)
    },
  })

  const ready = creditable.data !== undefined && creditNoteRowsReady(rows) && documentDate !== ''
  const submit = ready && !save.isPending ? () => save.mutate() : undefined
  const change = (index: number, patch: Partial<CreditNoteRow>) =>
    setTyped(rows.map((row, at) => (at === index ? { ...row, ...patch } : row)))

  return (
    <Dialog
      open
      onClose={onClose}
      wide
      title={draft === undefined ? 'Gutschrift erstellen' : 'Gutschrift bearbeiten'}
      description="Gutgeschrieben wird zum MWST-Satz der Rechnung. Die Gutschrift erhält ihre Nummer erst beim Ausstellen."
      onSubmit={submit}
      footer={
        <>
          <DialogCancelButton />
          <Button onClick={() => save.mutate()} busy={save.isPending} disabled={!ready}
            shortcut>
            {draft === undefined ? 'Gutschrift erstellen' : 'Speichern'}
          </Button>
        </>
      }
    >
      {creditable.isPending && <LoadingBlock label="Rechnung wird geladen" />}
      {creditable.error !== null && <ErrorNotice error={creditable.error} />}
      {creditable.data !== undefined && (
        <div className="grid gap-4">
          <p className="text-body text-text-secondary">
            Rechnung {creditable.data.documentNumber} vom{' '}
            {formatDate(creditable.data.documentDate)}. {creditableSentence(creditable.data)}
          </p>
          {creditable.data.groups.length > 1 && (
            <RemainingPerRate groups={creditable.data.groups}
              currency={creditable.data.currency} />
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Datum der Gutschrift"
              type="date"
              value={documentDate}
              min={creditable.data.documentDate}
              onChange={(event) => setDocumentDate(event.target.value)}
              required
            />
          </div>
          <TextAreaField
            label="Kopftext"
            value={headerText}
            onChange={(event) => setHeaderText(event.target.value)}
            rows={2}
            tooltip="Steht über den Positionen. Bei einer SLA-Gutschrift der Vertrag, zum Beispiel «Vertrag V-00007, Verfügbarkeit März»."
          />

          {rows.length === 0 ? (
            <p className="text-body text-text-secondary">
              Die Rechnung trägt keine Position, die gutgeschrieben werden kann.
            </p>
          ) : (
            <ul className="grid gap-3">
              {rows.map((row, index) => (
                <CreditNoteRowItem
                  key={row.line.lineId}
                  row={row}
                  currency={creditable.data.currency}
                  onChange={(patch) => change(index, patch)}
                />
              ))}
            </ul>
          )}

          <div aria-live="polite">
            {save.error !== null && <ErrorNotice error={save.error} />}
          </div>
        </div>
      )}
    </Dialog>
  )
}

/**
 * One line of the invoice: ticked or not, and once ticked what is credited on it.
 */
function CreditNoteRowItem({
  row,
  currency,
  onChange,
}: {
  row: CreditNoteRow
  currency: string
  onChange: (patch: Partial<CreditNoteRow>) => void
}) {
  const message = creditNoteRowError(row)
  return (
    <li className="grid gap-3 rounded-[var(--radius-md)] border border-line-subtle p-3">
      <CheckboxField
        label={`${row.line.lineNumber} · ${row.line.description}`}
        hint={lineFacts(row, currency)}
        checked={row.selected}
        onChange={(event) => onChange({ selected: event.target.checked })}
      />
      {row.selected && (
        <div className="grid gap-3 sm:grid-cols-3">
          <TextField
            label={row.line.unit === undefined ? 'Menge' : `Menge (${row.line.unit})`}
            value={row.quantity}
            inputMode="decimal"
            numeric
            onChange={(event) => onChange({ quantity: event.target.value })}
            error={message?.startsWith('Die Menge') ? message : undefined}
            required
          />
          <TextField
            label={row.line.priceIncludesVat ? 'Preis inkl. MWST' : 'Preis exkl. MWST'}
            value={row.unitPrice}
            inputMode="decimal"
            numeric
            onChange={(event) => onChange({ unitPrice: event.target.value })}
            error={message?.startsWith('Der Preis') ? message : undefined}
            required
          />
          <TextField
            label="Eigene Bezeichnung"
            value={row.description}
            maxLength={500}
            onChange={(event) => onChange({ description: event.target.value })}
            tooltip="Leer lassen, dann steht der Text der Rechnungsposition auf der Gutschrift."
          />
        </div>
      )}
    </li>
  )
}

/**
 * What the invoice still has under each rate, for an invoice that carries more than one: the
 * limit is per rate, and the total alone would hide where the room is.
 */
function RemainingPerRate({
  groups,
  currency,
}: {
  groups: readonly CreditableGroup[]
  currency: string
}) {
  return (
    <ul className="grid gap-1 text-small text-text-secondary">
      {groups.map((group) => (
        <li key={`${group.vatCategory}-${group.vatRate}`}>
          Zu {formatPercent(group.vatRate)}: noch {formatAmount(group.remaining)} {currency} von{' '}
          {formatAmount(group.invoiced)} {currency}
        </li>
      ))}
    </ul>
  )
}

/** The figures of the invoice line, under its name. */
function lineFacts(row: CreditNoteRow, currency: string): string {
  const line = row.line
  const basis = line.priceIncludesVat ? 'inkl.' : 'exkl.'
  const credited = line.creditedGross > 0
    ? ` · bereits gutgeschrieben ${formatAmount(line.creditedGross)} ${currency}`
    : ''
  return `${formatQuantity(line.quantity)} × ${formatAmount(line.unitPrice)} ${basis} MWST`
    + ` ${formatPercent(line.vatRate)} = ${formatAmount(line.lineGross)} ${currency}${credited}`
}
