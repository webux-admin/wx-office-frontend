import { useDeferredValue, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { ErrorNotice, LoadingBlock } from '../../components/Notice'
import { SelectField } from '../../components/SelectField'
import { TextField } from '../../components/TextField'
import { useAuth } from '../../auth/useAuth'
import { api } from '../../lib/api'
import { formatAmount, formatDate, formatPercent, parseDecimal, toIsoDate } from '../../lib/format'
import type { DueDateBasis, PaymentTerm, PaymentTermCalculation } from '../../lib/types'
import { LabelFields } from '../../masterdata/LabelFields'
import {
  DUE_DATE_BASES,
  MAX_DISCOUNTS,
  type DiscountRow,
  type TermForm,
} from './paymentTermForm'

/**
 * Adds a payment term or changes one the tenant already has.
 *
 * <p>The code is asked once and shown read-only afterwards: documents point at the term by it,
 * and the update discards a changed one instead of applying it.
 *
 * <p>For a stored term the dialog also shows what the backend makes of it on a sample amount.
 * That preview is a request, not a calculation done here — due dates and discount amounts are
 * the backend's answer, and reproducing them in the browser would only invite the two to
 * disagree.
 */
export function PaymentTermDialog({
  open,
  onClose,
  onSubmit,
  form,
  onChange,
  translations,
  onTranslationsChange,
  busy,
  error,
  editing,
  tenantId,
}: {
  open: boolean
  onClose: () => void
  onSubmit: () => void
  form: TermForm
  onChange: (form: TermForm) => void
  /** The name in the other document languages, by language code. */
  translations: Record<string, string>
  onTranslationsChange: (translations: Record<string, string>) => void
  busy: boolean
  error: unknown
  /** The term being changed; absent while a new one is added. */
  editing: PaymentTerm | null
  tenantId: number
}) {
  const { can } = useAuth()

  const set = <K extends keyof TermForm>(field: K, value: TermForm[K]) =>
    onChange({ ...form, [field]: value })

  const setRow = (index: number, field: keyof DiscountRow, value: string) =>
    set(
      'discounts',
      form.discounts.map((row, position) =>
        position === index ? { ...row, [field]: value } : row,
      ),
    )

  const addRow = () => set('discounts', [...form.discounts, { days: '', percent: '' }])

  const removeRow = (index: number) =>
    set(
      'discounts',
      form.discounts.filter((_, position) => position !== index),
    )

  // Cash on delivery leaves nothing to deduct, so the mask does not offer a stage for it.
  const immediate = parseDecimal(form.netDays) === 0

  /** Why the button for another stage is dead, or null while it is usable. */
  const blocked = immediate
    ? 'Bei Zahlung sofort netto ist kein Skonto möglich.'
    : form.discounts.length >= MAX_DISCOUNTS
      ? `Mehr als ${MAX_DISCOUNTS} Staffeln nimmt das Backend nicht.`
      : null

  return (
    <Dialog
      open={open}
      onClose={onClose}
      wide
      title={editing ? 'Zahlungskondition bearbeiten' : 'Neue Zahlungskondition'}
      description={
        editing?.system === true
          ? 'Eine ausgelieferte Kondition lässt sich ändern, aber nicht löschen.'
          : undefined
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            onClick={onSubmit}
            busy={busy}
            disabled={form.code.trim() === '' || form.name.trim() === ''}
          >
            Speichern
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <TextField
          label="Code"
          value={form.code}
          onChange={(event) => set('code', event.target.value)}
          disabled={editing !== null}
          maxLength={30}
          hint={
            editing
              ? 'Steht fest, seit die Kondition angelegt wurde.'
              : 'Kurzzeichen, mit dem Belege auf die Kondition zeigen. Später nicht mehr änderbar.'
          }
        />
        <TextField
          label="Bezeichnung"
          value={form.name}
          onChange={(event) => set('name', event.target.value)}
          maxLength={60}
          hint="Was in der Auswahl und auf dem Beleg steht."
        />
        <TextField
          label="Beschreibung"
          value={form.description}
          onChange={(event) => set('description', event.target.value)}
          maxLength={200}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Zahlungsfrist in Tagen"
            value={form.netDays}
            onChange={(event) => set('netDays', event.target.value)}
            inputMode="numeric"
            numeric
            maxLength={3}
            hint="0 heisst: zahlbar sofort netto."
          />
          <SelectField
            label="Fälligkeit ab"
            value={form.dueDateBasis}
            onChange={(event) =>
              // The value of the option is one of the two keys of DUE_DATE_BASES, which the
              // select cannot express in its own type.
              set('dueDateBasis', event.target.value as DueDateBasis)
            }
            hint="Ab Monatsende zählt die Frist erst vom letzten Tag des Belegmonats."
          >
            {Object.entries(DUE_DATE_BASES).map(([basis, label]) => (
              <option key={basis} value={basis}>
                {label}
              </option>
            ))}
          </SelectField>
        </div>

        <fieldset className="border-t border-line-subtle pt-4">
          <legend className="text-[12px] font-medium text-text-secondary">Skonto</legend>
          <p className="mt-1 text-[12px] text-text-tertiary">
            Der Satz muss mit längerer Frist sinken: wer früher zahlt, darf nicht weniger abziehen
            können.
          </p>

          <div className="mt-3 grid gap-3">
            {form.discounts.map((row, index) => (
              <div key={index} className="flex items-end gap-3">
                <TextField
                  label="Frist in Tagen"
                  value={row.days}
                  onChange={(event) => setRow(index, 'days', event.target.value)}
                  inputMode="numeric"
                  numeric
                  maxLength={3}
                  className="flex-1"
                />
                <TextField
                  label="Satz in Prozent"
                  value={row.percent}
                  onChange={(event) => setRow(index, 'percent', event.target.value)}
                  inputMode="decimal"
                  numeric
                  maxLength={6}
                  className="flex-1"
                />
                <button
                  type="button"
                  onClick={() => removeRow(index)}
                  aria-label={`${index + 1}. Skontostaffel entfernen`}
                  className="grid h-10 w-9 shrink-0 place-items-center rounded-[var(--radius-sm)] text-text-tertiary transition-colors hover:text-danger"
                >
                  <Trash2 size={14} aria-hidden />
                </button>
              </div>
            ))}
          </div>

          <div className="mt-3">
            <Button
              variant="secondary"
              onClick={addRow}
              disabled={form.discounts.length >= MAX_DISCOUNTS || immediate}
            >
              <Plus size={15} aria-hidden />
              Staffel hinzufügen
            </Button>
          </div>

          {/* A control that is dead must say why: disabled buttons leave the tab order, so
              without this sentence a reader would not learn that stages exist at all. */}
          {blocked !== null && (
            <p className="mt-2 text-[12px] text-text-tertiary" aria-live="polite">
              {blocked}
            </p>
          )}
        </fieldset>

        <LabelFields
          tenantId={tenantId}
          translations={translations}
          onChange={onTranslationsChange}
        />

        {editing !== null && can('MASTERDATA_READ') && (
          <TermPreview tenantId={tenantId} termId={editing.id} />
        )}

        {error !== null && error !== undefined && <ErrorNotice error={error} />}
      </div>
    </Dialog>
  )
}

/**
 * What the backend makes of the stored term on a sample amount: the due date, every discount
 * stage with its deduction, and the sentence that goes on the document.
 *
 * <p>Its own component so the sample amount and date live only as long as the dialog is open on
 * a term, and so a failed preview cannot take the form with it.
 */
function TermPreview({ tenantId, termId }: { tenantId: number; termId: number }) {
  const [amount, setAmount] = useState('1000')
  const [documentDate, setDocumentDate] = useState(toIsoDate())

  // Deferred, as on the search fields: every keystroke in the amount is a request otherwise,
  // and typing 1000 would ask the backend four times.
  const typed = useDeferredValue(amount)

  // An empty or unreadable field means there is nothing to compute, not zero francs.
  const value = parseDecimal(typed) ?? 0
  const ready = value > 0

  const preview = useQuery({
    queryKey: ['payment-term-calculation', tenantId, termId, value, documentDate],
    queryFn: () => {
      const search = new URLSearchParams({ amount: `${value}` })
      if (documentDate !== '') search.set('documentDate', documentDate)
      // Neither currency nor cashRounding is sent: this mask does not know the rounding step of
      // the tenant, and inventing one would show an amount that is off by a few rappen.
      return api.get<PaymentTermCalculation>(
        `/api/tenants/${tenantId}/payment-terms/${termId}/calculation?${search.toString()}`,
      )
    },
    enabled: ready,
  })

  const stages = preview.data?.stages ?? []

  return (
    <section className="rounded-[var(--radius-md)] border border-line-subtle p-4">
      <h3 className="text-[13px] font-semibold">Vorschau</h3>
      <p className="mt-0.5 text-[12px] text-text-secondary">
        Gerechnet wird im Backend und mit der gespeicherten Kondition. Änderungen an den Feldern
        oben zählen erst nach dem Speichern.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <TextField
          label="Betrag"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          inputMode="decimal"
          numeric
          maxLength={12}
        />
        <TextField
          label="Belegdatum"
          type="date"
          value={documentDate}
          onChange={(event) => setDocumentDate(event.target.value)}
        />
      </div>

      {!ready && (
        <p className="mt-3 text-[12px] text-text-tertiary">
          Für die Vorschau braucht es einen Betrag über null.
        </p>
      )}
      {ready && preview.isPending && <LoadingBlock label="Vorschau wird gerechnet" />}
      {preview.error !== null && (
        <div className="mt-3">
          <ErrorNotice error={preview.error} />
        </div>
      )}

      {preview.data && (
        <div className="mt-3 grid gap-1.5 text-[13px]">
          <p>
            Fällig am <span className="font-mono tabular-nums">{formatDate(preview.data.dueDate)}</span>
          </p>
          {stages.map((stage, index) => (
            <p key={index} className="text-text-secondary">
              {formatPercent(stage.percent)} bis {formatDate(stage.discountDate)}:{' '}
              {formatAmount(stage.discountAmount)} Abzug, zu zahlen{' '}
              {formatAmount(stage.amountAfterDiscount)}
            </p>
          ))}
          {preview.data.text !== undefined && preview.data.text !== '' && (
            <div className="mt-1.5 rounded-[var(--radius-sm)] bg-sunken px-3 py-2">
              <p className="text-[11px] font-medium text-text-tertiary">So steht es auf dem Beleg</p>
              <p className="mt-0.5 text-[12px] text-text-secondary">{preview.data.text}</p>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
