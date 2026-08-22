import { useMemo, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button } from '../../components/Button'
import { ErrorNotice } from '../../components/Notice'
import { PageHeader } from '../../components/PageHeader'
import { Panel } from '../../components/Panel'
import { SelectField } from '../../components/SelectField'
import { TextField } from '../../components/TextField'
import { api } from '../../lib/api'
import { originOf, type Origin } from '../../lib/origin'
import { listQuery, PICKER_SIZE } from '../../lib/paging'
import { parseDecimal, toIsoDate } from '../../lib/format'
import type { DocumentDefaults, DocumentType, Page, Partner, SalesDocument } from '../../lib/types'
import { MasterDataSelect } from '../../masterdata/MasterDataSelect'
import { PaymentTermSelect } from '../../masterdata/PaymentTermSelect'
import { useCatalogueLabel, usePaymentTerms } from '../../masterdata/useMasterData'

/** Where this mask goes when it was opened without naming a screen to return to. */
const LIST: Origin = { from: '/auftraege', label: 'Aufträge' }

/**
 * Starts an order.
 *
 * <p>The customer comes first, because everything else follows from them. Once the kind of
 * document and the customer are picked, the backend says what the draft would carry — address,
 * language, currency, payment term — and the mask shows exactly that. It works none of it out
 * itself: which address a kind of document uses and which currency a customer is invoiced in
 * are decisions of the backend, and a second opinion in the browser would be a second truth.
 *
 * <p>Everything that was filled in stays editable. Language and payment term have no place in
 * the create payload, so a changed one is applied to the fresh draft right afterwards, through
 * the same endpoints the draft mask uses.
 */
export function NewDocumentMask({ tenantId }: { tenantId: number }) {
  const navigate = useNavigate()
  const origin = originOf(useLocation().state, LIST)
  const usageLabel = useCatalogueLabel(tenantId, 'address-usage')
  const [documentTypeId, setDocumentTypeId] = useState('')
  const [partnerId, setPartnerId] = useState('')
  const [documentDate, setDocumentDate] = useState(toIsoDate())
  const [exchangeRate, setExchangeRate] = useState('')

  const documentTypes = useQuery({
    queryKey: ['document-types', tenantId],
    queryFn: () => api.get<DocumentType[]>(`/api/tenants/${tenantId}/document-types`),
  })

  // A picker wants every entry, not a page, so it asks for the largest page the server
  // allows. Beyond that a dropdown is the wrong control anyway and this needs a type-ahead.
  const partnerQuery = listQuery({ role: 'customer', activeOnly: true, size: PICKER_SIZE })
  const partners = useQuery({
    queryKey: ['partners', tenantId, partnerQuery],
    queryFn: () => api.get<Page<Partner>>(`/api/tenants/${tenantId}/partners?${partnerQuery}`),
  })

  const chosen = documentTypeId !== '' && partnerId !== ''
  const defaults = useQuery({
    queryKey: ['document-defaults', tenantId, 'orders', documentTypeId, partnerId],
    queryFn: () =>
      api.get<DocumentDefaults>(
        `/api/tenants/${tenantId}/orders/defaults?documentTypeId=${documentTypeId}&partnerId=${partnerId}`,
      ),
    enabled: chosen,
  })

  // The payment term arrives as an id and the dropdown speaks codes: the terms of the tenant
  // are the only place that knows both.
  const terms = usePaymentTerms(tenantId)
  const suggested = useMemo(
    () => ({
      language: defaults.data?.languageCode ?? '',
      currency: defaults.data?.currencyCode ?? '',
      paymentTerm: terms.data?.find((term) => term.id === defaults.data?.paymentTermId)?.code ?? '',
    }),
    [defaults.data, terms.data],
  )

  // Every new proposal replaces what stands in the fields, and that is the point: picking
  // another customer brings their language and their currency along instead of leaving the
  // previous one's behind. Adjusted while rendering rather than in an effect — React re-runs
  // this render before anything reaches the screen, so nobody ever sees the old values
  // (https://react.dev/reference/react/useState#storing-information-from-previous-renders).
  const [form, setForm] = useState(suggested)
  const [applied, setApplied] = useState(suggested)
  if (applied !== suggested) {
    setApplied(suggested)
    setForm(suggested)
    // The rate belongs to the currency it was typed for. Leaving it behind would send a
    // euro rate along with a dollar document, and the backend has no way to tell.
    setExchangeRate('')
  }
  const { language, currency, paymentTerm } = form
  const set = <K extends keyof typeof form>(field: K, value: string) =>
    setForm((current) => ({ ...current, [field]: value }))

  /**
   * The draft, once it exists.
   *
   * <p>Held so that a second press after a refused follow-up does not start a second draft:
   * the record is already there, and only what is still outstanding is sent again.
   */
  const draftId = useRef<number | null>(null)

  const create = useMutation({
    mutationFn: async () => {
      if (draftId.current === null) {
        const draft = await api.post<SalesDocument>(`/api/tenants/${tenantId}/orders`, {
          documentTypeId: Number(documentTypeId),
          partnerId: Number(partnerId),
          documentDate,
          currency: currency || undefined,
          exchangeRate: parseDecimal(exchangeRate) ?? undefined,
        })
        draftId.current = draft.id
      }
      const base = `/api/tenants/${tenantId}/orders/${draftId.current}`
      // Neither belongs in the create payload, so a changed one is applied to the draft that
      // was just made — through the very endpoints the draft mask uses for them.
      if (language !== '' && language !== suggested.language) {
        await api.put<SalesDocument>(`${base}/header`, { languageCode: language, priceMode: 'COPY' })
      }
      if (paymentTerm !== suggested.paymentTerm) {
        // An emptied field is a decision, not a missing value: the payload states the whole
        // agreement, so leaving the term out writes the draft without one (ADR-0037).
        await api.put<SalesDocument>(`${base}/payment`, {
          paymentTerm: paymentTerm === '' ? undefined : paymentTerm,
        })
      }
      return draftId.current
    },
    // A draft without a single line is no document, so this one step continues into the new
    // record rather than closing. The origin travels with it, so the way back out of the
    // order leads to where it was started from.
    onSuccess: (id) => void navigate(`/auftraege/${id}`, { replace: true, state: { origin } }),
  })

  const orderTypes = (documentTypes.data ?? []).filter(
    (type) => type.category === 'ORDER' && type.active,
  )
  // The server already left the deactivated ones out; nothing is filtered again here.
  const customers = partners.data?.content ?? []
  const incomplete = !chosen || documentDate === ''
  const recipient = defaults.data?.recipient

  return (
    <>
      <PageHeader
        title="Neuer Auftrag"
        back={{ to: origin.from, label: origin.label }}
        subtitle="Der Beleg entsteht als Entwurf. Die Nummer wird erst beim Ausstellen gezogen."
      >
        <Button onClick={() => create.mutate()} busy={create.isPending} disabled={incomplete}>
          Entwurf anlegen
        </Button>
      </PageHeader>

      <div className="px-8 pb-12">
        {create.error !== null && (
          <div className="mb-6">
            <ErrorNotice error={create.error} />
          </div>
        )}

        <div className="grid max-w-[860px] gap-6">
          <Panel title="Beleg">
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                label="Belegart"
                value={documentTypeId}
                onChange={(event) => setDocumentTypeId(event.target.value)}
                disabled={documentTypes.isPending}
                hint={
                  orderTypes.length === 0 && !documentTypes.isPending
                    ? 'Es gibt keine aktive Belegart der Kategorie Auftrag.'
                    : undefined
                }
                invalid={orderTypes.length === 0 && !documentTypes.isPending}
              >
                <option value="">Bitte wählen</option>
                {orderTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.code} · {type.name}
                  </option>
                ))}
              </SelectField>

              <TextField
                label="Belegdatum"
                type="date"
                value={documentDate}
                onChange={(event) => setDocumentDate(event.target.value)}
              />

              <SelectField
                label="Kunde"
                value={partnerId}
                onChange={(event) => setPartnerId(event.target.value)}
                disabled={partners.isPending}
                className="sm:col-span-2"
                hint={
                  partners.isPending
                    ? 'Kunden werden geladen ...'
                    : partners.isSuccess && customers.length === 0
                      ? 'Es gibt noch keinen aktiven Kunden. Ein Auftrag braucht einen.'
                      : 'Sprache, Währung und Zahlungskondition kommen von diesem Kunden.'
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
            </div>

            {partners.error !== null && (
              <div className="mt-4">
                <ErrorNotice error={partners.error} />
              </div>
            )}
            {documentTypes.error !== null && (
              <div className="mt-4">
                <ErrorNotice error={documentTypes.error} />
              </div>
            )}
          </Panel>

          <Panel
            title="Vorgaben des Kunden"
            description="Vom Backend ermittelt und hier änderbar. Was hier steht, steht nachher auf dem Beleg — ein anderer Kunde oder eine andere Belegart setzt es neu."
          >
            {!chosen && (
              <p className="text-[13px] text-text-secondary">
                Wählen Sie zuerst Belegart und Kunde. Danach steht hier, womit der Entwurf
                beginnt.
              </p>
            )}

            {chosen && defaults.isPending && (
              <p className="text-[13px] text-text-secondary">Vorgaben werden geladen ...</p>
            )}

            {chosen && defaults.error !== null && <ErrorNotice error={defaults.error} />}

            {chosen && defaults.isSuccess && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <MasterDataSelect
                    label="Sprache"
                    tenantId={tenantId}
                    list="languages"
                    value={language}
                    storedLabel={defaults.data.languageLabel}
                    onChange={(code) => set('language', code)}
                    hint="Beschriftungen und Texte des Belegs erscheinen in dieser Sprache."
                  />

                  <PaymentTermSelect
                    label="Zahlungskondition"
                    tenantId={tenantId}
                    value={paymentTerm}
                    storedLabel={defaults.data.paymentTermName}
                    onChange={(code) => set('paymentTerm', code)}
                    emptyLabel="Ohne Kondition"
                    hint="Bestimmt Fälligkeit und Skonto auf dem Beleg."
                  />

                  <MasterDataSelect
                    label="Währung"
                    tenantId={tenantId}
                    list="currencies"
                    value={currency}
                    storedLabel={defaults.data.currencyLabel}
                    onChange={(code) => set('currency', code)}
                  />

                  <TextField
                    label="Umrechnungskurs"
                    value={exchangeRate}
                    onChange={(event) => setExchangeRate(event.target.value)}
                    inputMode="decimal"
                    numeric
                    hint="Nur bei Fremdwährung nötig."
                  />
                </div>

                {recipient && (
                  <div className="mt-5 border-t border-line-subtle pt-4">
                    <h3 className="text-[12px] font-medium text-text-secondary">
                      Empfänger
                      {defaults.data.addressUsage && (
                        <span className="text-text-tertiary">
                          {' '}
                          · Adresse für {usageLabel(defaults.data.addressUsage)}
                        </span>
                      )}
                    </h3>
                    <address className="mt-1.5 not-italic text-[13px] leading-6">
                      <span className="block font-medium">{recipient.name}</span>
                      {recipient.addressLine && (
                        <span className="block">{recipient.addressLine}</span>
                      )}
                      <span className="block">
                        {[recipient.street, recipient.buildingNumber].filter(Boolean).join(' ')}
                      </span>
                      <span className="block">
                        {[recipient.country, recipient.postalCode].filter(Boolean).join('-')}{' '}
                        {recipient.town}
                      </span>
                    </address>
                  </div>
                )}
              </>
            )}
          </Panel>
        </div>
      </div>
    </>
  )
}
