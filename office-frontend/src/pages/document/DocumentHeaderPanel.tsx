import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ArrowRightLeft } from 'lucide-react'
import { Button } from '../../components/Button'
import { ErrorNotice } from '../../components/Notice'
import { Panel } from '../../components/Panel'
import { TextField } from '../../components/TextField'
import { api } from '../../lib/api'
import type { SalesDocument } from '../../lib/types'
import { MasterDataSelect } from '../../masterdata/MasterDataSelect'
import {
  currencyChanged,
  headerPayload,
  headerUnchanged,
  toHeaderForm,
  type HeaderForm,
} from './headerForm'

/**
 * The head of a document: kind, date, language, currency and the rate into the bookkeeping
 * currency.
 *
 * <p>Editable while the document is a draft, read-only afterwards — an issued document is a
 * legal statement and none of this may move (OR Art. 957a). The kind of document is shown but
 * never editable: it decides the number range and cannot change after the fact.
 *
 * <p>Changing the currency converts every amount on the document at the exchange rate. That
 * is arithmetic, not a re-pricing: what was agreed keeps its worth and only changes the unit
 * it is written in (ADR-0037). Prices are not looked up again here — for that the customer
 * has to change, which happens in its own dialog.
 */
export function DocumentHeaderPanel({
  tenantId,
  base,
  document,
  editable,
  readOnlyNote,
  onChanged,
}: {
  tenantId: number
  /** Path of the document, without a trailing slash. */
  base: string
  document: SalesDocument
  /** False once the document is issued, and while the write permission is missing. */
  editable: boolean
  /** Why nothing can be changed here, where that is not the state of the document itself. */
  readOnlyNote?: string
  /** Called with the document the backend answered with. */
  onChanged: (document: SalesDocument) => void
}) {
  const [form, setForm] = useState<HeaderForm>(() => toHeaderForm(document))

  const set = <K extends keyof HeaderForm>(field: K, value: HeaderForm[K]) =>
    setForm((current) => ({ ...current, [field]: value }))

  const converting = currencyChanged(form, document)
  const unchanged = headerUnchanged(form, document)

  const save = useMutation({
    mutationFn: () =>
      api.put<SalesDocument>(`${base}/header`, headerPayload(form, document, 'COPY')),
    onSuccess: onChanged,
  })

  return (
    <Panel
      title="Kopfdaten"
      description={
        editable
          ? 'Gilt für den ganzen Beleg. Solange er Entwurf ist, lässt sich alles davon ändern.'
          : (readOnlyNote ?? 'Ausgestellte Belege ändern sich nicht mehr.')
      }
      action={
        editable ? (
          <Button
            variant="secondary"
            onClick={() => save.mutate()}
            busy={save.isPending}
            disabled={unchanged}
          >
            Übernehmen
          </Button>
        ) : undefined
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Belegart"
          value={document.documentTypeCode ?? ''}
          readOnly
          disabled
          hint="Bestimmt Adresse, Nummernkreis und Druckvorlage. Steht mit dem Beleg fest."
        />

        <TextField
          label="Belegdatum"
          type="date"
          value={form.documentDate}
          onChange={(event) => set('documentDate', event.target.value)}
          disabled={!editable}
          hint="Zugleich das Leistungsdatum jeder Position, die keines nennt — der MwSt-Satz folgt ihm."
        />

        <MasterDataSelect
          label="Sprache"
          tenantId={tenantId}
          list="languages"
          value={form.language}
          storedLabel={document.languageLabel}
          onChange={(code) => set('language', code)}
          disabled={!editable}
          hint="Beschriftungen und Texte des Belegs erscheinen in dieser Sprache."
        />

        <MasterDataSelect
          label="Währung"
          tenantId={tenantId}
          list="currencies"
          value={form.currency}
          onChange={(code) => set('currency', code)}
          disabled={!editable}
          hint={
            converting
              ? `Der Beleg wechselt von ${document.currency} auf ${form.currency}. Alle Beträge werden dabei mit dem Kurs umgerechnet.`
              : document.baseCurrency && document.baseCurrency !== form.currency
                ? `Buchführungswährung des Mandanten ist ${document.baseCurrency}.`
                : undefined
          }
        />

        <TextField
          label="Umrechnungskurs"
          value={form.exchangeRate}
          onChange={(event) => set('exchangeRate', event.target.value)}
          disabled={!editable}
          inputMode="decimal"
          numeric
          hint="Nur bei Fremdwährung nötig."
        />

        <TextField
          label="Kursdatum"
          type="date"
          value={form.exchangeRateDate}
          onChange={(event) => set('exchangeRateDate', event.target.value)}
          disabled={!editable}
          hint="Der Tag, von dem der Kurs stammt."
        />
      </div>

      {/* Always in the document, never only when it has something to say: a live region that
          appears together with its text is inserted rather than changed, and most screen
          readers stay silent about that. */}
      <p
        aria-live="polite"
        className="mt-4 flex items-start gap-2 text-[12px] text-text-secondary empty:mt-0"
      >
        {converting && (
          <>
            <ArrowRightLeft size={14} className="mt-px shrink-0 text-text-tertiary" aria-hidden />
            {`Preise und Rabattbeträge aller Positionen werden mit dem Kurs in ${form.currency} umgerechnet — auch die von Hand geschriebenen. Aus der Preisliste wird nichts neu geholt.`}
          </>
        )}
      </p>

      {save.error !== null && (
        <div className="mt-4">
          <ErrorNotice error={save.error} />
        </div>
      )}
    </Panel>
  )
}
