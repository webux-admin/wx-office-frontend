import { useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button } from '../../components/Button'
import { useSubmitShortcut } from '../../components/useSubmitShortcut'
import { ErrorNotice } from '../../components/Notice'
import { PageHeader } from '../../components/PageHeader'
import { Panel } from '../../components/Panel'
import { SelectField } from '../../components/SelectField'
import { TextField } from '../../components/TextField'
import { api } from '../../lib/api'
import { originOf } from '../../lib/origin'
import { parseDecimal, toIsoDate } from '../../lib/format'
import {
  newDocumentTitle,
  salesDocumentListKey,
  type SalesDocumentKind,
} from '../../lib/salesDocument'
import type { DocumentDefaults, DocumentType, SalesDocument } from '../../lib/types'
import { MasterDataSelect } from '../../masterdata/MasterDataSelect'
import { PaymentTermSelect } from '../../masterdata/PaymentTermSelect'
import { useCatalogueLabel, usePaymentTerms } from '../../masterdata/useMasterData'
import { PartnerQuickSearch } from './PartnerQuickSearch'
import { partnerLabel } from './partnerSearch'

/**
 * Starts a sales document of one kind.
 *
 * <p>The customer comes first — literally, as the first field — because everything else
 * follows from them: the address, the language, the currency, the payment term, and since
 * ADR-0054 of the backend the kind of document too. Picking the customer therefore fills the
 * kind in, and the same request brings the rest along.
 *
 * <p>The mask works none of it out itself. Which address a kind of document uses, which
 * currency a customer is invoiced in and which kind of document they get are decisions of the
 * backend, and a second opinion in the browser would be a second truth.
 *
 * <p>Everything that was filled in stays editable, the kind of document included: suggested
 * is not prescribed. Language and payment term have no place in the create payload, so a
 * changed one is applied to the fresh draft right afterwards, through the same endpoints the
 * draft mask uses.
 */
export function NewDocumentMask({
  tenantId,
  kind,
}: {
  tenantId: number
  /** Which of the four kinds of document is being started. */
  kind: SalesDocumentKind
}) {
  const navigate = useNavigate()
  // Falls back to the list of this kind when the mask was opened without naming a screen to
  // return to.
  const origin = originOf(useLocation().state, { from: kind.path, label: kind.plural })
  const usageLabel = useCatalogueLabel(tenantId, 'address-usage')
  const [documentTypeId, setDocumentTypeId] = useState('')
  const [partnerId, setPartnerId] = useState('')
  // What stands in the search field: a term while somebody is looking, the name of the
  // customer once one is taken over.
  const [partnerTerm, setPartnerTerm] = useState('')
  const [documentDate, setDocumentDate] = useState(toIsoDate())
  const [exchangeRate, setExchangeRate] = useState('')

  const queryClient = useQueryClient()

  const documentTypes = useQuery({
    queryKey: ['document-types', tenantId],
    queryFn: () => api.get<DocumentType[]>(`/api/tenants/${tenantId}/document-types`),
  })

  // The customer alone is enough to ask: without a kind of document the backend works out
  // which one this customer gets and answers with it (ADR-0054 of the backend). Naming one
  // pins the answer to it, which is what happens once the user picks another.
  const chosen = partnerId !== ''
  const defaults = useQuery({
    queryKey: ['document-defaults', tenantId, kind.resource, documentTypeId, partnerId],
    queryFn: () =>
      api.get<DocumentDefaults>(
        `/api/tenants/${tenantId}/${kind.resource}/defaults?partnerId=${partnerId}`
          + (documentTypeId === '' ? '' : `&documentTypeId=${documentTypeId}`),
      ),
    enabled: chosen,
  })

  // What the backend answered fills the empty field, and only the empty one: once someone
  // has picked a kind of document, the answer follows that pick instead of overwriting it.
  const suggestedType = defaults.data?.documentTypeId
  if (documentTypeId === '' && suggestedType !== undefined) {
    setDocumentTypeId(`${suggestedType}`)
  }

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
        const draft = await api.post<SalesDocument>(`/api/tenants/${tenantId}/${kind.resource}`, {
          documentTypeId: Number(documentTypeId),
          partnerId: Number(partnerId),
          documentDate,
          currency: currency || undefined,
          exchangeRate: parseDecimal(exchangeRate) ?? undefined,
        })
        draftId.current = draft.id
      }
      const base = `/api/tenants/${tenantId}/${kind.resource}/${draftId.current}`
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
    // document leads to where it was started from — and that list is a row longer now.
    onSuccess: (id) => {
      void queryClient.invalidateQueries({ queryKey: salesDocumentListKey(kind, tenantId) })
      void navigate(`${kind.path}/${id}`, { replace: true, state: { origin } })
    },
  })

  const activeTypes = (documentTypes.data ?? []).filter(
    (type) => type.category === kind.category && type.active,
  )
  const incomplete = !chosen || documentTypeId === '' || documentDate === ''
  const recipient = defaults.data?.recipient

  // Ctrl+S and Ctrl+Enter do what the primary button does, so the draft can be started
  // without reaching for the mouse.
  useSubmitShortcut(incomplete || create.isPending ? undefined : () => create.mutate())

  return (
    <>
      <PageHeader
        title={newDocumentTitle(kind)}
        back={{ to: origin.from, label: origin.label }}
        subtitle="Der Beleg entsteht als Entwurf. Die Nummer wird erst beim Ausstellen gezogen."
      >
        <Button
          onClick={() => create.mutate()}
          busy={create.isPending}
          disabled={incomplete}
          shortcut
        >
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
              {/* First, and across the whole width: the customer decides everything below,
                  the kind of document included (ADR-0054 of the backend). A type-ahead rather
                  than a dropdown, because a tenant may have fifty thousand of them. */}
              <div className="sm:col-span-2">
                <PartnerQuickSearch
                  tenantId={tenantId}
                  term={partnerTerm}
                  onTerm={(term) => {
                    setPartnerTerm(term)
                    // Typing gives up the customer that was taken over, and with them the
                    // kind of document that came from them.
                    setPartnerId('')
                    setDocumentTypeId('')
                  }}
                  chosen={chosen}
                  onChoose={(partner) => {
                    setPartnerId(`${partner.id}`)
                    setPartnerTerm(partnerLabel(partner))
                    // The kind belongs to the customer that was picked. Clearing it lets the
                    // answer for the new customer fill it, instead of carrying the old one on.
                    setDocumentTypeId('')
                  }}
                />
              </div>

              <SelectField
                label="Belegart"
                value={documentTypeId}
                onChange={(event) => setDocumentTypeId(event.target.value)}
                disabled={documentTypes.isPending || !chosen}
                hint={
                  !chosen
                    ? 'Wird gefüllt, sobald der Kunde gewählt ist.'
                    : activeTypes.length === 0 && !documentTypes.isPending
                      ? `Es gibt keine aktive Belegart der Kategorie ${kind.singular}.`
                      : defaults.data?.documentTypeName !== undefined &&
                          `${defaults.data.documentTypeId}` === documentTypeId
                        ? 'Vorschlag für diesen Kunden. Änderbar.'
                        : 'Weicht vom Vorschlag für diesen Kunden ab.'
                }
                invalid={chosen && activeTypes.length === 0 && !documentTypes.isPending}
              >
                {/* No empty entry once a customer stands: there is always a kind, and the
                    backend named it. Before that the field is disabled anyway. */}
                {!chosen && <option value="">Zuerst den Kunden wählen</option>}
                {chosen && documentTypeId === '' && <option value="">Wird ermittelt …</option>}
                {activeTypes.map((type) => (
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
            </div>

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
                Wählen Sie zuerst den Kunden. Danach steht hier, womit der Entwurf
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
