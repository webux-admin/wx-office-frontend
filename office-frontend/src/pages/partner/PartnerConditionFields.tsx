import { TextField } from '../../components/TextField'
import type { FieldErrors } from '../../lib/fieldErrors'
import type { Partner } from '../../lib/types'
import { MasterDataSelect } from '../../masterdata/MasterDataSelect'
import { PaymentTermSelect } from '../../masterdata/PaymentTermSelect'
import { usePaymentTerms } from '../../masterdata/useMasterData'
import type { PartnerForm } from './partnerForm'

/**
 * The terms a customer or supplier is written to: payment term, currency, language, credit
 * limit and, for a supplier, our reference with them.
 *
 * <p>The same fields on the create mask and on the stored record. Currency and language always
 * carry a value and start from the tenant's default. The payment term may stay empty: then the
 * record follows the tenant's default, and the empty option names which one that is.
 */
export function PartnerConditionFields({
  tenantId,
  form,
  set,
  disabled,
  errors,
  stored,
}: {
  tenantId: number
  form: PartnerForm
  set: <K extends keyof PartnerForm>(field: K, value: PartnerForm[K]) => void
  disabled: boolean
  errors: FieldErrors
  /** The stored record, for the labels of values its lists no longer offer. */
  stored?: Partner
}) {
  const terms = usePaymentTerms(tenantId).data ?? []
  const tenantTerm = terms.find((term) => term.isDefault === true)?.name

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <PaymentTermSelect
        label="Zahlungskondition"
        tenantId={tenantId}
        value={form.paymentTerm}
        onChange={(code) => set('paymentTerm', code)}
        storedLabel={stored?.paymentTermLabel}
        emptyLabel={tenantTerm ? `Vorgabe des Mandanten: ${tenantTerm}` : 'Vorgabe des Mandanten'}
        disabled={disabled}
        error={errors.paymentTerm}
        tooltip="Bestimmt Fälligkeit und Skonto auf neuen Belegen. Ohne eigene Wahl gilt die Vorgabe des Mandanten, auch wenn sie später ändert."
      />
      <MasterDataSelect
        label="Währung"
        tenantId={tenantId}
        list="currencies"
        value={form.currency}
        storedLabel={stored?.currencyLabel}
        onChange={(code) => set('currency', code)}
        disabled={disabled}
        error={errors.currency}
        tooltip="Neue Belege werden in dieser Währung geschrieben."
      />
      <MasterDataSelect
        label="Sprache"
        tenantId={tenantId}
        list="languages"
        value={form.language}
        storedLabel={stored?.languageLabel}
        onChange={(code) => set('language', code)}
        disabled={disabled}
        required
        error={errors.language}
        tooltip="Sprache der Belege und Mails, sofern der Hauptkontakt keine eigene hat."
      />
      <TextField
        label="Kreditlimite"
        value={form.creditLimit}
        onChange={(event) => set('creditLimit', event.target.value)}
        disabled={disabled}
        inputMode="decimal"
        numeric
        error={errors.creditLimit}
        tooltip="In der Buchführungswährung des Mandanten, nicht in der Währung dieses Eintrags."
      />
      {form.isSupplier && (
        <TextField
          label="Kreditorenreferenz"
          value={form.creditorReference}
          onChange={(event) => set('creditorReference', event.target.value)}
          disabled={disabled}
          maxLength={40}
          error={errors.creditorReference}
          tooltip="Unsere Kundennummer bei diesem Lieferanten. Steht auf unseren Zahlungen."
          className="sm:col-span-2"
        />
      )}
    </div>
  )
}
