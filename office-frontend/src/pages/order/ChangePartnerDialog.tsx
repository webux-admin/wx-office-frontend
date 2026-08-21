import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { Button } from '../../components/Button'
import { CheckboxField } from '../../components/CheckboxField'
import { Dialog } from '../../components/Dialog'
import { ErrorNotice } from '../../components/Notice'
import { SelectField } from '../../components/SelectField'
import { TextField } from '../../components/TextField'
import { api } from '../../lib/api'
import { parseDecimal } from '../../lib/format'
import { listQuery, PICKER_SIZE } from '../../lib/paging'
import type { CopyPriceMode, Page, Partner, SalesDocument } from '../../lib/types'
import { freeLineWarning, type UpdateHeaderRequest } from './headerForm'

type ChangePartnerDialogProps = {
  tenantId: number
  /** Path of the document, without a trailing slash, for example `/api/tenants/1/orders/42`. */
  base: string
  open: boolean
  onClose: () => void
  document: SalesDocument
  /** Called with the document the backend answered with, so the mask shows the new head. */
  onChanged: (document: SalesDocument) => void
}

/**
 * Moves a draft to another customer.
 *
 * <p>Two things follow from that and are decided here, not silently: what happens to the
 * prices, and which currency the document is written in.
 *
 * <p>Prices start on "re-price". Another customer means another price list, and a draft that
 * quietly keeps the prices of the previous one is the kind of mistake nobody finds before the
 * document is out. Keeping them stays available for the case where the amounts were agreed;
 * the amounts are converted into the new currency either way, because converting is
 * arithmetic and not a price (ADR-0037).
 *
 * <p>A document in a foreign currency needs an exchange rate, so the rate is asked for right
 * here rather than left to a refusal from the backend and a second visit to the head data.
 *
 * <p>Positions written by hand cannot be re-priced: there is no catalogue entry behind them.
 * They are named by their line number before the change is sent, because after it nothing on
 * screen says which lines were left alone.
 */
export function ChangePartnerDialog({
  tenantId,
  base,
  open,
  onClose,
  document,
  onChanged,
}: ChangePartnerDialogProps) {
  const [partnerId, setPartnerId] = useState('')
  const [priceMode, setPriceMode] = useState<CopyPriceMode>('RECALCULATE')
  const [takeCurrency, setTakeCurrency] = useState(true)
  const [exchangeRate, setExchangeRate] = useState('')
  const [exchangeRateDate, setExchangeRateDate] = useState('')

  // A picker wants every entry, not a page, so it asks for the largest page the server
  // allows. Beyond that a dropdown is the wrong control anyway and this needs a type-ahead.
  const query = listQuery({ role: 'customer', activeOnly: true, size: PICKER_SIZE })
  const partners = useQuery({
    queryKey: ['partners', tenantId, query],
    queryFn: () => api.get<Page<Partner>>(`/api/tenants/${tenantId}/partners?${query}`),
    enabled: open,
  })

  const customers = partners.data?.content ?? []
  const chosen = customers.find((partner) => String(partner.id) === partnerId)
  const otherCurrency =
    chosen?.currency !== undefined && chosen.currency !== document.currency
      ? chosen.currency
      : undefined
  const currencyChanges = otherCurrency !== undefined && takeCurrency
  const warning = freeLineWarning(document.lines, priceMode)

  // Into the bookkeeping currency, so the tenant currency needs none: there the rate is 1.
  const rate = parseDecimal(exchangeRate)
  const needsRate = currencyChanges && otherCurrency !== document.baseCurrency
  const rateMissing = needsRate && (rate === null || rate <= 0)

  const defaults = () => {
    setPriceMode('RECALCULATE')
    setTakeCurrency(true)
    setExchangeRate('')
    setExchangeRateDate('')
  }

  const reset = () => {
    setPartnerId('')
    defaults()
  }

  // Every decision below belongs to the customer it was taken for. Picking another one
  // starts them over rather than carrying "keep the amounts" across to somebody else.
  const chooseCustomer = (id: string) => {
    setPartnerId(id)
    defaults()
  }

  const change = useMutation({
    mutationFn: () => {
      const payload: UpdateHeaderRequest = {
        partnerId: Number(partnerId),
        currencyCode: currencyChanges ? otherCurrency : undefined,
        exchangeRate: needsRate && rate !== null ? rate : undefined,
        exchangeRateDate: needsRate && exchangeRateDate !== '' ? exchangeRateDate : undefined,
        priceMode,
      }
      return api.put<SalesDocument>(`${base}/header`, payload)
    },
    onSuccess: (answer) => {
      onChanged(answer)
      reset()
      onClose()
    },
  })

  // Closing throws the choice away; a refusal keeps it, so the message can be read next to
  // what caused it.
  const close = () => {
    reset()
    change.reset()
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      wide
      title="Kunde wechseln"
      description="Adresse, Sprache und Zahlungskondition werden vom neuen Kunden übernommen. Positionen und Texte bleiben."
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Abbrechen
          </Button>
          <Button
            onClick={() => change.mutate()}
            busy={change.isPending}
            disabled={partnerId === '' || rateMissing}
          >
            Wechseln
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <SelectField
          label="Kunde"
          value={partnerId}
          onChange={(event) => chooseCustomer(event.target.value)}
          disabled={partners.isPending}
          hint={
            partners.isPending
              ? 'Kunden werden geladen ...'
              : partners.isSuccess && customers.length === 0
                ? 'Es gibt keinen aktiven Kunden, auf den gewechselt werden könnte.'
                : undefined
          }
        >
          <option value="">Bitte wählen</option>
          {customers.map((partner) => (
            <option key={partner.id} value={partner.id}>
              {partner.partnerNumber ? `${partner.partnerNumber} · ` : ''}
              {partner.name}
            </option>
          ))}
        </SelectField>

        {partners.error !== null && <ErrorNotice error={partners.error} />}

        {otherCurrency !== undefined && (
          <CheckboxField
            label={`Beleg in ${otherCurrency} führen`}
            hint={`Dieser Kunde wird in ${otherCurrency} fakturiert, der Beleg steht in ${document.currency}. Abwählen lässt den Beleg in ${document.currency}.`}
            checked={takeCurrency}
            onChange={(event) => setTakeCurrency(event.target.checked)}
          />
        )}

        {needsRate && (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Umrechnungskurs"
              value={exchangeRate}
              onChange={(event) => setExchangeRate(event.target.value)}
              inputMode="decimal"
              numeric
              hint={`Wie viel ${document.baseCurrency ?? document.currency} ein ${otherCurrency} wert ist. Ohne Kurs lässt sich der Beleg nicht in einer Fremdwährung führen.`}
            />
            <TextField
              label="Kursdatum"
              type="date"
              value={exchangeRateDate}
              onChange={(event) => setExchangeRateDate(event.target.value)}
              hint="Leer lassen, dann gilt das Belegdatum."
            />
          </div>
        )}

        <SelectField
          label="Preise"
          value={priceMode}
          onChange={(event) => setPriceMode(event.target.value as CopyPriceMode)}
          hint={
            currencyChanges
              ? `Neu bepreisen holt jede Katalogposition aus der Preisliste des neuen Kunden. Beträge behalten lässt sie stehen — in ${otherCurrency} umgerechnet werden sie so oder so.`
              : 'Neu bepreisen holt jede Katalogposition aus der Preisliste des neuen Kunden. Menge, Rabatt und Leistungsdaten bleiben.'
          }
        >
          <option value="RECALCULATE">Neu bepreisen</option>
          <option value="COPY">Beträge behalten</option>
        </SelectField>

        {/* Always in the document, never only when it has something to say: a live region
            that appears together with its text is inserted rather than changed, and most
            screen readers stay silent about that. */}
        <p aria-live="polite" className="flex items-start gap-2 text-[12px] text-text-secondary">
          {warning !== undefined && (
            <>
              <AlertTriangle size={14} className="mt-px shrink-0 text-text-tertiary" aria-hidden />
              {warning}
            </>
          )}
        </p>

        {change.error !== null && <ErrorNotice error={change.error} />}
      </div>
    </Dialog>
  )
}
